import { useEffect, useState } from 'react'
import { Award, Search, X, Trash2 } from 'lucide-react'
import { certificatesService, registrationService, komselService } from '@/services/contentService'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useLang } from '@/hooks/useLang'
import { Card, PageHeader, Button, Input, Textarea, Spinner, EmptyState, Avatar } from '@/components/ui'
import Uploader from '@/components/Uploader'
import { formatDate, validateUpload, compressImage } from '@/lib/utils'

export default function AdminCertificatesPage() {
  const { profile } = useAuth()
  const { toast, confirm } = useToast()
  const { t } = useLang()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)

  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [fileUrl, setFileUrl] = useState('') // PATH storage — ini yg dikirim ke certificatesService.issue
  const [filePreview, setFilePreview] = useState('') // signed URL sementara utk pratinjau Uploader
  const [uploading, setUploading] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState('')

  const [issued, setIssued] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const tmr = setTimeout(() => {
      if (!query) { setResults([]); return }
      komselService.searchUsers(query).then(setResults).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(tmr)
  }, [query])

  function load() {
    setLoading(true)
    certificatesService.getAll().then(setIssued).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  function selectUser(u) {
    setSelected(u)
    setQuery(''); setResults([])
    setTitle(''); setNote(''); setFileUrl(''); setFilePreview(''); setError('')
  }

  async function handleFile(file) {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      file = await compressImage(file, { maxDim: 1600 })
      validateUpload(file, { maxMB: 8 })
      const { path, url } = await registrationService.uploadDocument(`certificates/${selected.user_id}`, file)
      setFileUrl(path)
      setFilePreview(url)
    } catch (err) {
      setError(err.message || t('common.docUploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  async function handleIssue() {
    if (!title.trim()) { setError(t('acert.titleRequired')); return }
    if (!fileUrl) { setError(t('acert.fileRequired')); return }
    setError('')
    setIssuing(true)
    try {
      await certificatesService.issue({ userId: selected.user_id, title, fileUrl, issuedBy: profile.user_id, note })
      toast.success(t('acert.issued', { name: selected.name }))
      setSelected(null)
      load()
    } catch (err) {
      setError(err.message || t('acert.issueFailed'))
      toast.error(err.message || t('acert.issueFailed'))
    } finally {
      setIssuing(false)
    }
  }

  async function handleDelete(cert) {
    const ok = await confirm({
      title: t('acert.deleteTitle'),
      message: t('acert.deleteMessage', { title: cert.title }),
      confirmText: t('a.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await certificatesService.remove(cert.certificate_id)
      toast.success(t('acert.deleted'))
      load()
    } catch (err) {
      toast.error(err.message || t('acert.deleteFailed'))
    }
  }

  return (
    <div>
      <PageHeader title={t('acert.title')} subtitle={t('acert.subtitle')} />

      <Card className="p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">{t('acert.issueNew')}</h2>

        {!selected ? (
          <>
            <Input icon={Search} placeholder={t('akom.searchMember')} value={query} onChange={e => setQuery(e.target.value)} />
            {results.length > 0 && (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {results.map(u => (
                  <button key={u.user_id} onClick={() => selectUser(u)}
                    className="w-full flex items-center gap-3 px-1 py-1.5 rounded-lg hover:bg-gray-50 text-left">
                    <Avatar name={u.name} src={u.photo_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                      <p className="text-xs text-gray-400">{t(`role.${u.role}`)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-2.5">
              <Avatar name={selected.name} src={selected.photo_url} size="sm" />
              <p className="flex-1 text-sm font-medium text-gray-900 truncate">{selected.name}</p>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-3 py-2">{error}</div>}

            <Input label={t('acert.certTitle')} placeholder={t('acert.certTitlePh')} value={title} onChange={e => setTitle(e.target.value)} />
            <Uploader kind="file" label={t('acert.file')} required value={filePreview} uploading={uploading}
              onFile={handleFile} onClear={() => { setFileUrl(''); setFilePreview('') }} />
            <Textarea label={t('common.note')} rows={2} value={note} onChange={e => setNote(e.target.value)} />
            <Button className="w-full" loading={issuing} onClick={handleIssue}>{t('acert.issueBtn')}</Button>
          </div>
        )}
      </Card>

      <h2 className="text-sm font-semibold text-gray-900 mb-2">{t('acert.issuedList')}</h2>

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && issued.length === 0 && (
        <EmptyState icon={Award} title={t('acert.empty')} />
      )}

      {!loading && issued.length > 0 && (
        <Card className="divide-y divide-gray-100">
          {issued.map(c => (
            <div key={c.certificate_id} className="flex items-center gap-3 p-3.5">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Award size={16} className="text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{c.title}</p>
                <p className="text-xs text-gray-400 truncate">{c.users?.name || '-'} · {formatDate(c.issued_at)}</p>
              </div>
              <button onClick={() => handleDelete(c)} className="p-2 text-gray-400 hover:text-red-500 shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
