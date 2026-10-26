import { useState } from 'react'
import { ChevronLeft, ChevronRight, Save } from 'lucide-react'
import { useLang } from '@/hooks/useLang'
import { Button, EmptyState, Input, Spinner } from '@/components/ui'
import { formatScheduleDate, shiftScheduleMonth } from '@/lib/serviceScheduleMatrix'

function FieldEditor({ occurrence, field, busy, onSave }) {
  const { t } = useLang()
  const currentValue = occurrence[field] || ''
  const [value, setValue] = useState(currentValue)
  return <form className="monthly-owned-field" onSubmit={event => {
    event.preventDefault()
    onSave(occurrence, field, value)
  }}>
    <Input label={t(field === 'pic' ? 'schedMonth.pic' : 'schedMonth.dressCode')}
      value={value} maxLength={200} disabled={busy}
      onChange={event => setValue(event.target.value)} />
    <Button type="submit" size="sm" disabled={busy || value.trim() === currentValue}>
      <Save size={16} />{t('common.save')}
    </Button>
  </form>
}

export default function ScheduleOwnedFields({ data, month, onMonthChange, loading, busy, onSave }) {
  const { t, lang } = useLang()
  return <section className="monthly-owned-fields">
    <div className="monthly-month">
      <Button variant="outline" disabled={busy} aria-label={t('schedMonth.previousMonth')}
        title={t('schedMonth.previousMonth')}
        onClick={() => onMonthChange(shiftScheduleMonth(month, -1).slice(0, 7))}>
        <ChevronLeft size={18} />
      </Button>
      <Input type="month" aria-label={t('sched.month')} value={month} disabled={busy}
        onChange={event => event.target.value && onMonthChange(event.target.value)} />
      <Button variant="outline" disabled={busy} aria-label={t('sched.nextMonth')}
        title={t('sched.nextMonth')}
        onClick={() => onMonthChange(shiftScheduleMonth(month, 1).slice(0, 7))}>
        <ChevronRight size={18} />
      </Button>
    </div>
    <p className="monthly-muted">{t('schedMonth.ownedFieldsHint')}</p>
    {loading ? <div className="py-16 text-center"><Spinner /></div> : !data.occurrences.length ? <EmptyState title={t('schedMonth.ownedFieldsEmpty')}
      description={t('schedMonth.ownedFieldsEmptyHint')} /> : data.occurrences.map(occurrence =>
      <article className="monthly-owned-activity" key={occurrence.occurrence_id}>
        <h2>{occurrence.title}</h2>
        <p className="monthly-muted">{formatScheduleDate(occurrence.service_date, lang)} · {String(occurrence.start_time).slice(0, 5)}</p>
        {data.fields.map(field => <FieldEditor key={`${occurrence.occurrence_id}:${field}:${occurrence[field] || ''}`}
          occurrence={occurrence} field={field} busy={busy} onSave={onSave} />)}
      </article>)}
  </section>
}
