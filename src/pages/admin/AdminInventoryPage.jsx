import { useEffect, useMemo, useState } from 'react'
import {
  Archive, ArchiveRestore, ArrowDownToLine, ArrowUpFromLine, Boxes, FileSpreadsheet,
  Handshake, History, Package, Pencil, Plus, Printer, RotateCcw, Search, Tags, Trash2, X,
} from 'lucide-react'
import { inventoryService } from '@/services/inventoryService'
import { downloadXlsx } from '@/lib/exportXlsx'
import { printArchive } from '@/lib/printDoc'
import { compressImage } from '@/lib/utils'
import Uploader from '@/components/Uploader'
import { useBackClose } from '@/hooks/useBackClose'
import { useLang } from '@/hooks/useLang'
import { useToast } from '@/hooks/useToast'
import {
  ActionItem, ActionMenu, Badge, Button, Card, EmptyState, Input, PageHeader,
  Select, Spinner, Textarea,
} from '@/components/ui'

const CONDITIONS = ['Baik', 'Perlu Perbaikan', 'Rusak']
const ITEM_TYPES = ['Habis Pakai', 'Aset']
const TRANSACTION_TYPES = ['Masuk', 'Keluar', 'Penyesuaian']
const emptyItem = {
  code: '', name: '', category_id: '', item_type: 'Habis Pakai', unit: 'pcs',
  minimum_stock: '0', location: '', item_condition: 'Baik', notes: '',
}
const emptyStock = { transaction_type: 'Masuk', quantity: '', notes: '' }
const emptyCategory = { name: '', description: '' }

function todayWib() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
}
function makeEmptyLoan() {
  return {
    borrower_name: '', borrower_contact: '', quantity: '1', loan_date: todayWib(),
    due_date: '', condition_out: 'Baik', notes: '',
  }
}
function loanStatus(loan, today) {
  if (loan.status === 'Dikembalikan') return 'Dikembalikan'
  return loan.due_date && loan.due_date < today ? 'Terlambat' : 'Dipinjam'
}

export default function AdminInventoryPage() {
  const { t } = useLang()
  const conditionLabel = value => t({
    Baik: 'inventory.conditionGood',
    'Perlu Perbaikan': 'inventory.conditionRepair',
    Rusak: 'inventory.conditionDamaged',
  }[value] || value)
  const { toast, confirm } = useToast()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('items')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [loanFilter, setLoanFilter] = useState('')
  const [itemModal, setItemModal] = useState(null)
  const [itemForm, setItemForm] = useState(emptyItem)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoRemoved, setPhotoRemoved] = useState(false)
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const [stockItem, setStockItem] = useState(null)
  const [stockForm, setStockForm] = useState(emptyStock)
  const [loanItem, setLoanItem] = useState(null)
  const [loanForm, setLoanForm] = useState(makeEmptyLoan)
  const [returningLoan, setReturningLoan] = useState(null)
  const [returnForm, setReturnForm] = useState({ quantity: '', condition_in: 'Baik', notes: '' })
  const [categoryModal, setCategoryModal] = useState(false)
  const [categoryEditing, setCategoryEditing] = useState(null)
  const [categoryForm, setCategoryForm] = useState(emptyCategory)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const overlayOpen = Boolean(itemModal || stockItem || loanItem || returningLoan || categoryModal)
  useBackClose(overlayOpen, closeOverlays)
  useEffect(() => { load() }, [])
  useEffect(() => () => {
    if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  function resetPhoto(value = '') {
    setPhotoFile(null); setPhotoPreview(value); setPhotoRemoved(false); setProcessingPhoto(false)
  }

  function closeItemModal() {
    setItemModal(null); resetPhoto(); setFormError('')
  }

  function closeOverlays() {
    setItemModal(null); resetPhoto(); setStockItem(null); setLoanItem(null)
    setReturningLoan(null); setCategoryModal(false); setFormError('')
  }

  async function load() {
    setLoading(true)
    try {
      const [itemRows, categoryRows, transactionRows, loanRows] = await Promise.all([
        inventoryService.getItems(), inventoryService.getCategories(),
        inventoryService.getTransactions(), inventoryService.getLoans(),
      ])
      setItems(itemRows); setCategories(categoryRows)
      setTransactions(transactionRows); setLoans(loanRows)
    } catch (error) {
      toast.error(friendlyError(error))
    } finally {
      setLoading(false)
    }
  }

  function friendlyError(error) {
    const message = error?.message || ''
    if (error?.code === '23505') return t('inventory.errorDuplicate')
    const errors = {
      not_authorized: 'inventory.errorUnauthorized',
      insufficient_stock: 'inventory.errorInsufficientStock',
      insufficient_available_stock: 'inventory.errorInsufficientAvailable',
      stock_unchanged: 'inventory.errorStockUnchanged',
      item_not_found_or_inactive: 'inventory.errorInactive',
      item_not_loanable: 'inventory.errorNotLoanable',
      return_exceeds_outstanding: 'inventory.errorReturnExceeds',
      loan_not_found_or_returned: 'inventory.errorLoanClosed',
      invalid_loan_date: 'inventory.errorLoanDate',
      notes_required: 'inventory.errorNotesRequired',
    }
    const match = Object.entries(errors).find(([token]) => message.includes(token))
    return match ? t(match[1]) : (message || t('inventory.errorGeneric'))
  }

  const outstandingByItem = useMemo(() => {
    const map = {}
    for (const loan of loans) {
      if (loan.status === 'Dipinjam') {
        map[loan.item_id] = (map[loan.item_id] || 0) + loan.quantity - loan.returned_quantity
      }
    }
    return map
  }, [loans])
  const availableStock = item => Math.max(0, item.stock - (outstandingByItem[item.item_id] || 0))
  const today = todayWib()
  const summary = useMemo(() => {
    const active = items.filter(item => item.is_active)
    return {
      items: active.length,
      units: active.reduce((sum, item) => sum + item.stock, 0),
      low: active.filter(item => availableStock(item) <= item.minimum_stock).length,
      loans: loans.filter(loan => loan.status === 'Dipinjam').length,
    }
  }, [items, loans, outstandingByItem])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredItems = items.filter(item => {
    const matches = !normalizedQuery || [item.code, item.name, item.location, item.inventory_categories?.name]
      .some(value => String(value || '').toLowerCase().includes(normalizedQuery))
    return matches && (!categoryFilter || item.category_id === categoryFilter)
      && (!typeFilter || item.item_type === typeFilter)
  })
  const filteredTransactions = transactions.filter(row =>
    !normalizedQuery || [row.inventory_items?.code, row.inventory_items?.name, row.notes, row.users?.name]
      .some(value => String(value || '').toLowerCase().includes(normalizedQuery))
  )
  const filteredLoans = loans.filter(row => {
    const status = loanStatus(row, today)
    const matches = !normalizedQuery || [
      row.inventory_items?.code, row.inventory_items?.name, row.borrower_name, row.borrower_contact,
    ].some(value => String(value || '').toLowerCase().includes(normalizedQuery))
    return matches && (!loanFilter || status === loanFilter)
  })

  function openCreateItem() {
    setItemForm(emptyItem); resetPhoto(); setItemModal({}); setFormError('')
  }
  function openEditItem(item) {
    setItemForm({
      code: item.code || '', name: item.name || '', category_id: item.category_id || '',
      item_type: item.item_type || 'Habis Pakai', unit: item.unit || 'pcs',
      minimum_stock: String(item.minimum_stock ?? 0), location: item.location || '',
      item_condition: item.item_condition || 'Baik', notes: item.notes || '',
    })
    resetPhoto(item.photo_url || '')
    setItemModal(item); setFormError('')
  }

  async function handlePhoto(file) {
    setFormError('')
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type)) {
      setFormError(t('inventory.errorPhotoType')); return
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError(t('inventory.errorPhotoSize')); return
    }
    setProcessingPhoto(true)
    try {
      const compressed = await compressImage(file, { maxDim: 900, quality: 0.76, targetKB: 300 })
      setPhotoFile(compressed)
      setPhotoPreview(URL.createObjectURL(compressed))
      setPhotoRemoved(false)
    } catch {
      setFormError(t('inventory.errorPhotoProcess'))
    } finally {
      setProcessingPhoto(false)
    }
  }

  function clearPhoto() {
    setPhotoFile(null); setPhotoPreview(''); setPhotoRemoved(true); setFormError('')
  }

  async function saveItem() {
    setFormError('')
    if (processingPhoto) return
    if (!itemForm.code.trim() || !itemForm.name.trim() || !itemForm.unit.trim()) {
      setFormError(t('inventory.errorRequired')); return
    }
    setSaving(true)
    try {
      const editing = Boolean(itemModal?.item_id)
      const payload = {
        ...itemForm, code: itemForm.code.trim(), name: itemForm.name.trim(),
        category_id: itemForm.category_id || null,
        minimum_stock: Number(itemForm.minimum_stock || 0),
        location: itemForm.location.trim() || null, notes: itemForm.notes.trim() || null,
      }
      if (photoRemoved) payload.photo_url = null

      let savedItem = editing
        ? await inventoryService.updateItem(itemModal.item_id, payload)
        : await inventoryService.createItem(payload)
      let photoError = false

      if (photoFile) {
        try {
          const photoUrl = await inventoryService.uploadItemPhoto(savedItem.item_id, photoFile)
          savedItem = await inventoryService.updateItem(savedItem.item_id, { photo_url: photoUrl })
        } catch {
          photoError = true
        }
      } else if (photoRemoved && itemModal?.photo_url) {
        try {
          await inventoryService.removeItemPhoto(savedItem.item_id)
        } catch {
          photoError = true
        }
      }

      await load()
      closeItemModal()
      if (photoError) toast.error(t(photoFile ? 'inventory.itemSavedPhotoFailed' : 'inventory.photoDeleteFailed'))
      else toast.success(t(editing ? 'inventory.itemUpdated' : 'inventory.itemCreated'))
    } catch (error) {
      const message = friendlyError(error); setFormError(message); toast.error(message)
    } finally { setSaving(false) }
  }

  async function toggleItem(item) {
    const nextActive = !item.is_active
    const ok = await confirm({
      title: t(nextActive ? 'inventory.activateTitle' : 'inventory.archiveTitle'),
      message: t(nextActive ? 'inventory.activateMessage' : 'inventory.archiveMessage', { name: item.name }),
      confirmText: t(nextActive ? 'inventory.activate' : 'inventory.archive'), danger: !nextActive,
    })
    if (!ok) return
    try {
      await inventoryService.setItemActive(item.item_id, nextActive)
      toast.success(t(nextActive ? 'inventory.activated' : 'inventory.archived'))
      await load()
    } catch (error) { toast.error(friendlyError(error)) }
  }

  function openStock(item) {
    setStockItem(item); setStockForm(emptyStock); setFormError('')
  }
  async function saveStock() {
    const quantity = Number(stockForm.quantity)
    if (!Number.isInteger(quantity) || quantity < 0 || (stockForm.transaction_type !== 'Penyesuaian' && quantity < 1)) {
      setFormError(t('inventory.errorQuantity')); return
    }
    if (stockForm.notes.trim().length < 3) {
      setFormError(t('inventory.errorNotesRequired')); return
    }
    setSaving(true)
    try {
      await inventoryService.adjustStock(stockItem.item_id, stockForm.transaction_type, quantity, stockForm.notes.trim())
      setStockItem(null); toast.success(t('inventory.stockSaved')); await load()
    } catch (error) {
      const message = friendlyError(error); setFormError(message); toast.error(message)
    } finally { setSaving(false) }
  }

  function openLoan(item) {
    setLoanItem(item); setLoanForm(makeEmptyLoan()); setFormError('')
  }
  async function saveLoan() {
    const quantity = Number(loanForm.quantity)
    if (!loanForm.borrower_name.trim() || !Number.isInteger(quantity) || quantity < 1) {
      setFormError(t('inventory.errorRequired')); return
    }
    setSaving(true)
    try {
      await inventoryService.createLoan({ ...loanForm, item_id: loanItem.item_id, quantity })
      setLoanItem(null); toast.success(t('inventory.loanSaved')); await load()
    } catch (error) {
      const message = friendlyError(error); setFormError(message); toast.error(message)
    } finally { setSaving(false) }
  }

  function openReturn(loan) {
    const outstanding = loan.quantity - loan.returned_quantity
    setReturningLoan(loan)
    setReturnForm({ quantity: String(outstanding), condition_in: loan.condition_out || 'Baik', notes: '' })
    setFormError('')
  }
  async function saveReturn() {
    const outstanding = returningLoan.quantity - returningLoan.returned_quantity
    const quantity = Number(returnForm.quantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > outstanding) {
      setFormError(t('inventory.errorReturnQuantity', { count: outstanding })); return
    }
    setSaving(true)
    try {
      await inventoryService.returnLoan(returningLoan.loan_id, quantity, returnForm.condition_in, returnForm.notes.trim())
      setReturningLoan(null); toast.success(t('inventory.returnSaved')); await load()
    } catch (error) {
      const message = friendlyError(error); setFormError(message); toast.error(message)
    } finally { setSaving(false) }
  }

  function openCategories() {
    setCategoryEditing(null); setCategoryForm(emptyCategory); setCategoryModal(true); setFormError('')
  }
  function editCategory(category) {
    setCategoryEditing(category)
    setCategoryForm({ name: category.name || '', description: category.description || '' })
    setFormError('')
  }
  async function saveCategory() {
    if (!categoryForm.name.trim()) { setFormError(t('inventory.errorCategoryName')); return }
    setSaving(true)
    try {
      const payload = { name: categoryForm.name.trim(), description: categoryForm.description.trim() || null }
      if (categoryEditing) await inventoryService.updateCategory(categoryEditing.category_id, payload)
      else await inventoryService.createCategory(payload)
      setCategoryEditing(null); setCategoryForm(emptyCategory)
      await load(); toast.success(t('inventory.categorySaved'))
    } catch (error) {
      const message = friendlyError(error); setFormError(message); toast.error(message)
    } finally { setSaving(false) }
  }
  async function deleteCategory(category) {
    const ok = await confirm({
      title: t('inventory.deleteCategoryTitle'),
      message: t('inventory.deleteCategoryMessage', { name: category.name }),
      confirmText: t('a.delete'), danger: true,
    })
    if (!ok) return
    try {
      await inventoryService.deleteCategory(category.category_id)
      await load(); toast.success(t('inventory.categoryDeleted'))
    } catch (error) { toast.error(friendlyError(error)) }
  }

  const exportHeaders = () => [
    t('inventory.code'), t('inventory.name'), t('inventory.category'), t('inventory.itemType'),
    t('inventory.stockTotal'), t('inventory.borrowed'), t('inventory.available'), t('inventory.unit'),
    t('inventory.minimumStock'), t('inventory.location'), t('inventory.condition'), t('inventory.status'),
  ]
  const exportRows = () => filteredItems.map(item => [
    item.code, item.name, item.inventory_categories?.name || '-',
    t(item.item_type === 'Aset' ? 'inventory.typeAsset' : 'inventory.typeConsumable'),
    item.stock, outstandingByItem[item.item_id] || 0, availableStock(item), item.unit,
    item.minimum_stock, item.location || '-', conditionLabel(item.item_condition),
    item.is_active ? t('inventory.active') : t('inventory.inactive'),
  ])
  async function exportExcel() {
    await downloadXlsx({
      filename: `inventory-esc-${today}.xlsx`, sheetName: t('inventory.exportSheet'),
      titleLines: ['ESC Siantan', t('inventory.exportTitle'), t('inventory.exportDate', { date: today })],
      headers: exportHeaders(), rows: exportRows(),
    })
  }
  function exportPdf() {
    printArchive({
      title: t('inventory.exportTitle'), meta: [[t('inventory.exportDateLabel'), today]],
      summary: [
        { value: summary.items, label: t('inventory.summaryItems') },
        { value: summary.units, label: t('inventory.summaryUnits') },
        { value: summary.low, label: t('inventory.summaryLow') },
        { value: summary.loans, label: t('inventory.summaryLoans') },
      ],
      sections: [{ title: t('inventory.itemList'), tableHeaders: exportHeaders(), tableData: exportRows() }],
      footer: t('inventory.exportFooter'),
    })
  }

  const tabs = [
    { id: 'items', label: t('inventory.tabItems'), icon: Package },
    { id: 'transactions', label: t('inventory.tabTransactions'), icon: History },
    { id: 'loans', label: t('inventory.tabLoans'), icon: Handshake },
  ]

  return (
    <div>
      <PageHeader
        title={t('inventory.title')}
        subtitle={t('inventory.subtitle')}
        action={<Button size="sm" onClick={openCreateItem}><Plus size={15} /> {t('inventory.addItem')}</Button>}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryCard icon={Package} value={summary.items} label={t('inventory.summaryItems')} color="brand" />
        <SummaryCard icon={Boxes} value={summary.units} label={t('inventory.summaryUnits')} color="blue" />
        <SummaryCard icon={ArrowDownToLine} value={summary.low} label={t('inventory.summaryLow')} color="red" />
        <SummaryCard icon={Handshake} value={summary.loans} label={t('inventory.summaryLoans')} color="amber" />
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <Button size="sm" variant="outline" onClick={openCategories}><Tags size={15} /> {t('inventory.manageCategories')}</Button>
        <Button size="sm" variant="outline" onClick={exportExcel}><FileSpreadsheet size={15} /> Excel</Button>
        <Button size="sm" variant="outline" onClick={exportPdf}><Printer size={15} /> PDF</Button>
      </div>
      <div className="grid grid-cols-3 gap-1 p-1 bg-control rounded-xl mb-4">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              tab === id ? 'bg-surface text-brand-600 border border-gray-100' : 'text-gray-500 hover:text-gray-800'
            }`}>
            <Icon size={15} /><span className="truncate">{label}</span>
          </button>
        ))}
      </div>
      <div className="space-y-3 mb-4">
        <Input icon={Search} placeholder={t('inventory.search')} value={query} onChange={event => setQuery(event.target.value)} />
        {tab === 'items' && (
          <div className="grid grid-cols-2 gap-2">
            <Select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
              <option value="">{t('inventory.allCategories')}</option>
              {categories.map(category => <option key={category.category_id} value={category.category_id}>{category.name}</option>)}
            </Select>
            <Select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}>
              <option value="">{t('inventory.allTypes')}</option>
              <option value="Habis Pakai">{t('inventory.typeConsumable')}</option>
              <option value="Aset">{t('inventory.typeAsset')}</option>
            </Select>
          </div>
        )}
        {tab === 'loans' && (
          <Select value={loanFilter} onChange={event => setLoanFilter(event.target.value)}>
            <option value="">{t('inventory.allLoanStatus')}</option>
            <option value="Dipinjam">{t('inventory.loanOpen')}</option>
            <option value="Terlambat">{t('inventory.loanOverdue')}</option>
            <option value="Dikembalikan">{t('inventory.loanReturned')}</option>
          </Select>
        )}
      </div>
      {loading && <div className="flex justify-center py-14"><Spinner /></div>}      {!loading && tab === 'items' && (
        filteredItems.length ? (
          <div className="space-y-3">
            {filteredItems.map(item => {
              const borrowed = outstandingByItem[item.item_id] || 0
              const available = availableStock(item)
              const low = available <= item.minimum_stock
              return (
                <Card key={item.item_id} className={`p-4 ${!item.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex gap-3">
                    <div className="w-14 h-14 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center shrink-0 overflow-hidden">
                      {item.photo_url ? (
                        <img src={item.photo_url} alt={item.name} loading="lazy" width="56" height="56"
                          className="w-full h-full object-cover" />
                      ) : <Package size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                        <Badge color={item.item_type === 'Aset' ? 'blue' : 'purple'}>
                          {t(item.item_type === 'Aset' ? 'inventory.typeAsset' : 'inventory.typeConsumable')}
                        </Badge>
                        {!item.is_active && <Badge color="gray">{t('inventory.inactive')}</Badge>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.code} · {item.inventory_categories?.name || t('inventory.noCategory')}
                        {item.location ? ` · ${item.location}` : ''}
                      </p>
                    </div>
                    <ActionMenu>
                      <ActionItem icon={Pencil} label={t('a.edit')} onClick={() => openEditItem(item)} />
                      {item.is_active && <ActionItem icon={ArrowUpFromLine} label={t('inventory.adjustStock')} onClick={() => openStock(item)} />}
                      {item.is_active && item.item_type === 'Aset' && available > 0 && (
                        <ActionItem icon={Handshake} label={t('inventory.createLoan')} onClick={() => openLoan(item)} />
                      )}
                      <ActionItem icon={item.is_active ? Archive : ArchiveRestore}
                        label={t(item.is_active ? 'inventory.archive' : 'inventory.activate')}
                        onClick={() => toggleItem(item)} danger={item.is_active} />
                    </ActionMenu>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <Metric value={item.stock} label={t('inventory.stockTotal')} unit={item.unit} />
                    <Metric value={borrowed} label={t('inventory.borrowed')} unit={item.unit} />
                    <Metric value={available} label={t('inventory.available')} unit={item.unit} danger={low} />
                  </div>
                  {low && item.is_active && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-2 mt-3">
                      {t('inventory.lowStockAlert', { count: item.minimum_stock, unit: item.unit })}
                    </p>
                  )}
                </Card>
              )
            })}
          </div>
        ) : <EmptyState icon={Package} title={t('inventory.empty')} description={t('inventory.emptyDesc')} />
      )}

      {!loading && tab === 'transactions' && (
        filteredTransactions.length ? (
          <Card className="divide-y divide-gray-100">
            {filteredTransactions.map(row => (
              <div key={row.transaction_id} className="p-3.5 flex gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  row.quantity_change > 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                }`}>
                  {row.quantity_change > 0 ? <ArrowDownToLine size={18} /> : <ArrowUpFromLine size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{row.inventory_items?.name || '-'}</p>
                    <p className={`text-sm font-bold ${row.quantity_change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {row.quantity_change > 0 ? '+' : ''}{row.quantity_change}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400">
                    {row.inventory_items?.code} · {t(`inventory.tx${row.transaction_type}`)}
                    {' · '}{row.stock_before} → {row.stock_after} {row.inventory_items?.unit}
                  </p>
                  {row.notes && <p className="text-xs text-gray-600 mt-1">{row.notes}</p>}
                  <p className="text-[11px] text-gray-400 mt-1">{new Date(row.created_at).toLocaleString()} · {row.users?.name || '-'}</p>
                </div>
              </div>
            ))}
          </Card>
        ) : <EmptyState icon={History} title={t('inventory.emptyTransactions')} description={t('inventory.emptyTransactionsDesc')} />
      )}

      {!loading && tab === 'loans' && (
        filteredLoans.length ? (
          <div className="space-y-3">
            {filteredLoans.map(loan => {
              const status = loanStatus(loan, today)
              const outstanding = loan.quantity - loan.returned_quantity
              return (
                <Card key={loan.loan_id} className="p-4">
                  <div className="flex gap-3">
                    <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                      <Handshake size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-semibold text-gray-900">{loan.borrower_name}</p>
                        <Badge color={status === 'Terlambat' ? 'red' : status === 'Dikembalikan' ? 'green' : 'amber'}>
                          {t(status === 'Terlambat' ? 'inventory.loanOverdue' : status === 'Dikembalikan' ? 'inventory.loanReturned' : 'inventory.loanOpen')}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{loan.inventory_items?.name} · {loan.inventory_items?.code}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {t('inventory.loanQuantity', { count: loan.quantity, unit: loan.inventory_items?.unit || '' })}
                        {' · '}{loan.loan_date}{loan.due_date ? ` → ${loan.due_date}` : ''}
                      </p>
                      {loan.borrower_contact && <p className="text-xs text-gray-400 mt-1">{loan.borrower_contact}</p>}
                    </div>
                    {loan.status === 'Dipinjam' && (
                      <Button size="sm" variant="secondary" onClick={() => openReturn(loan)}>
                        <RotateCcw size={14} /> {t('inventory.return')}
                      </Button>
                    )}
                  </div>
                  {loan.returned_quantity > 0 && loan.status === 'Dipinjam' && (
                    <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-2 mt-3">
                      {t('inventory.partialReturn', { returned: loan.returned_quantity, outstanding, unit: loan.inventory_items?.unit || '' })}
                    </p>
                  )}
                </Card>
              )
            })}
          </div>
        ) : <EmptyState icon={Handshake} title={t('inventory.emptyLoans')} description={t('inventory.emptyLoansDesc')} />
      )}

      {itemModal && (
        <Modal title={t(itemModal.item_id ? 'inventory.editItem' : 'inventory.addItem')} onClose={closeItemModal}>
          <ErrorBox message={formError} />
          <Uploader
            kind="image" crop aspect={1} value={photoPreview}
            label={t('inventory.photo')} hint={t('inventory.photoHint')}
            accept="image/jpeg,image/png,image/webp,image/gif"
            uploading={processingPhoto}
            imageAlt={t('inventory.photoPreviewAlt', { name: itemForm.name || t('inventory.name') })}
            uploadLabel={t('inventory.uploadPhoto')} replaceLabel={t('inventory.replacePhoto')}
            removeLabel={t('inventory.removePhoto')} uploadingLabel={t('inventory.processingPhoto')}
            onFile={handlePhoto} onClear={clearPhoto}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('inventory.code')} required value={itemForm.code}
              onChange={event => setItemForm(prev => ({ ...prev, code: event.target.value }))} />
            <Select label={t('inventory.itemType')} required value={itemForm.item_type}
              onChange={event => setItemForm(prev => ({ ...prev, item_type: event.target.value }))}>
              {ITEM_TYPES.map(type => <option key={type} value={type}>{t(type === 'Aset' ? 'inventory.typeAsset' : 'inventory.typeConsumable')}</option>)}
            </Select>
          </div>
          <Input label={t('inventory.name')} required value={itemForm.name}
            onChange={event => setItemForm(prev => ({ ...prev, name: event.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select label={t('inventory.category')} value={itemForm.category_id}
              onChange={event => setItemForm(prev => ({ ...prev, category_id: event.target.value }))}>
              <option value="">{t('inventory.noCategory')}</option>
              {categories.map(category => <option key={category.category_id} value={category.category_id}>{category.name}</option>)}
            </Select>
            <Input label={t('inventory.unit')} required value={itemForm.unit}
              onChange={event => setItemForm(prev => ({ ...prev, unit: event.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('inventory.minimumStock')} type="number" min="0" value={itemForm.minimum_stock}
              onChange={event => setItemForm(prev => ({ ...prev, minimum_stock: event.target.value }))} />
            <Select label={t('inventory.condition')} value={itemForm.item_condition}
              onChange={event => setItemForm(prev => ({ ...prev, item_condition: event.target.value }))}>
              {CONDITIONS.map(condition => <option key={condition} value={condition}>{conditionLabel(condition)}</option>)}
            </Select>
          </div>
          <Input label={t('inventory.location')} value={itemForm.location}
            onChange={event => setItemForm(prev => ({ ...prev, location: event.target.value }))} />
          <Textarea label={t('inventory.notes')} value={itemForm.notes}
            onChange={event => setItemForm(prev => ({ ...prev, notes: event.target.value }))} />
          <p className="text-xs text-gray-400">{t('inventory.initialStockHint')}</p>
          <ModalActions onCancel={closeItemModal} onSave={saveItem} saving={saving || processingPhoto}
            saveLabel={t(itemModal.item_id ? 'a.save' : 'a.add')} />
        </Modal>
      )}

      {stockItem && (
        <Modal title={t('inventory.adjustStockFor', { name: stockItem.name })} onClose={() => setStockItem(null)}>
          <ErrorBox message={formError} />
          <p className="text-xs text-gray-500">{t('inventory.currentStock', { count: stockItem.stock, unit: stockItem.unit })}</p>
          <Select label={t('inventory.transactionType')} value={stockForm.transaction_type}
            onChange={event => setStockForm(prev => ({ ...prev, transaction_type: event.target.value }))}>
            {TRANSACTION_TYPES.map(type => <option key={type} value={type}>{t(`inventory.tx${type}`)}</option>)}
          </Select>
          <Input label={t(stockForm.transaction_type === 'Penyesuaian' ? 'inventory.targetStock' : 'inventory.quantity')}
            type="number" min={stockForm.transaction_type === 'Penyesuaian' ? '0' : '1'} required
            value={stockForm.quantity} onChange={event => setStockForm(prev => ({ ...prev, quantity: event.target.value }))} />
          <Textarea label={t('inventory.stockReason')} required value={stockForm.notes}
            onChange={event => setStockForm(prev => ({ ...prev, notes: event.target.value }))} />
          <ModalActions onCancel={() => setStockItem(null)} onSave={saveStock} saving={saving} />
        </Modal>
      )}
      {loanItem && (
        <Modal title={t('inventory.loanItem', { name: loanItem.name })} onClose={() => setLoanItem(null)}>
          <ErrorBox message={formError} />
          <p className="text-xs text-gray-500">{t('inventory.availableNow', { count: availableStock(loanItem), unit: loanItem.unit })}</p>
          <Input label={t('inventory.borrowerName')} required value={loanForm.borrower_name}
            onChange={event => setLoanForm(prev => ({ ...prev, borrower_name: event.target.value }))} />
          <Input label={t('inventory.borrowerContact')} value={loanForm.borrower_contact}
            onChange={event => setLoanForm(prev => ({ ...prev, borrower_contact: event.target.value }))} />
          <Input label={t('inventory.quantity')} type="number" min="1" max={availableStock(loanItem)} required
            value={loanForm.quantity} onChange={event => setLoanForm(prev => ({ ...prev, quantity: event.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('inventory.loanDate')} type="date" required value={loanForm.loan_date}
              onChange={event => setLoanForm(prev => ({ ...prev, loan_date: event.target.value }))} />
            <Input label={t('inventory.dueDate')} type="date" min={loanForm.loan_date} value={loanForm.due_date}
              onChange={event => setLoanForm(prev => ({ ...prev, due_date: event.target.value }))} />
          </div>
          <Select label={t('inventory.conditionOut')} value={loanForm.condition_out}
            onChange={event => setLoanForm(prev => ({ ...prev, condition_out: event.target.value }))}>
            {CONDITIONS.map(condition => <option key={condition} value={condition}>{conditionLabel(condition)}</option>)}
          </Select>
          <Textarea label={t('inventory.notes')} value={loanForm.notes}
            onChange={event => setLoanForm(prev => ({ ...prev, notes: event.target.value }))} />
          <ModalActions onCancel={() => setLoanItem(null)} onSave={saveLoan} saving={saving} saveLabel={t('inventory.saveLoan')} />
        </Modal>
      )}

      {returningLoan && (
        <Modal title={t('inventory.returnItem', { name: returningLoan.inventory_items?.name || '' })} onClose={() => setReturningLoan(null)}>
          <ErrorBox message={formError} />
          <p className="text-xs text-gray-500">
            {t('inventory.returnBorrower', {
              name: returningLoan.borrower_name,
              count: returningLoan.quantity - returningLoan.returned_quantity,
              unit: returningLoan.inventory_items?.unit || '',
            })}
          </p>
          <Input label={t('inventory.returnQuantity')} type="number" min="1"
            max={returningLoan.quantity - returningLoan.returned_quantity} required
            value={returnForm.quantity} onChange={event => setReturnForm(prev => ({ ...prev, quantity: event.target.value }))} />
          <Select label={t('inventory.conditionIn')} value={returnForm.condition_in}
            onChange={event => setReturnForm(prev => ({ ...prev, condition_in: event.target.value }))}>
            {CONDITIONS.map(condition => <option key={condition} value={condition}>{conditionLabel(condition)}</option>)}
          </Select>
          <Textarea label={t('inventory.returnNotes')} value={returnForm.notes}
            onChange={event => setReturnForm(prev => ({ ...prev, notes: event.target.value }))} />
          <ModalActions onCancel={() => setReturningLoan(null)} onSave={saveReturn} saving={saving} saveLabel={t('inventory.saveReturn')} />
        </Modal>
      )}

      {categoryModal && (
        <Modal title={t('inventory.manageCategories')} onClose={() => setCategoryModal(false)}>
          <ErrorBox message={formError} />
          {categories.length === 0 ? (
            <p className="text-sm text-gray-400">{t('inventory.emptyCategories')}</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {categories.map(category => (
                <div key={category.category_id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{category.name}</p>
                    {category.description && <p className="text-xs text-gray-400 truncate">{category.description}</p>}
                  </div>
                  <button className="p-1.5 text-gray-400 hover:text-brand-600" onClick={() => editCategory(category)}>
                    <Pencil size={15} />
                  </button>
                  <button className="p-1.5 text-gray-400 hover:text-red-600" onClick={() => deleteCategory(category)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-gray-100 pt-3 space-y-3">
            <p className="text-xs font-semibold text-gray-500">
              {t(categoryEditing ? 'inventory.editCategory' : 'inventory.addCategory')}
            </p>
            <Input label={t('inventory.categoryName')} required value={categoryForm.name}
              onChange={event => setCategoryForm(prev => ({ ...prev, name: event.target.value }))} />
            <Textarea label={t('inventory.description')} value={categoryForm.description}
              onChange={event => setCategoryForm(prev => ({ ...prev, description: event.target.value }))} />
            <div className="flex gap-2">
              {categoryEditing && (
                <Button variant="ghost" className="flex-1"
                  onClick={() => { setCategoryEditing(null); setCategoryForm(emptyCategory) }}>
                  {t('a.cancel')}
                </Button>
              )}
              <Button className="flex-1" loading={saving} onClick={saveCategory}>
                {t(categoryEditing ? 'a.save' : 'a.add')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function SummaryCard({ icon: Icon, value, label, color }) {
  const colors = {
    brand: 'bg-brand-100 text-brand-600',
    blue: 'bg-blue-100 text-blue-600',
    red: 'bg-red-100 text-red-600',
    amber: 'bg-amber-100 text-amber-700',
  }
  return (
    <Card className="p-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${colors[color]}`}>
        <Icon size={18} />
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-500 leading-tight">{label}</p>
    </Card>
  )
}

function Metric({ value, label, unit, danger }) {
  return (
    <div className={`rounded-xl px-2 py-2.5 text-center ${danger ? 'bg-red-50' : 'bg-control'}`}>
      <p className={`text-lg font-bold ${danger ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      <p className="text-[10px] text-gray-500 truncate">{label} · {unit}</p>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/35 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg p-4 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        {children}
      </Card>
    </div>
  )
}

function ModalActions({ onCancel, onSave, saving, saveLabel }) {
  const { t } = useLang()
  return (
    <div className="flex gap-2 pt-1">
      <Button variant="ghost" className="flex-1" onClick={onCancel}>{t('a.cancel')}</Button>
      <Button className="flex-1" loading={saving} onClick={onSave}>{saveLabel || t('a.save')}</Button>
    </div>
  )
}

function ErrorBox({ message }) {
  if (!message) return null
  return <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-3 py-2.5">{message}</div>
}