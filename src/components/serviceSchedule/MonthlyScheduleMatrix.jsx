import { Fragment, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, LockKeyhole, MapPin, Pencil } from 'lucide-react'
import { Button } from '@/components/ui'
import { useLang } from '@/hooks/useLang'
import { buildScheduleMatrix, formatScheduleDate, formatScheduleMonth, formatScheduleTime } from '@/lib/serviceScheduleMatrix'
import './MonthlyScheduleMatrix.css'

function DateCell({ date, currentDate, children, ...props }) {
  return <td className={`sched-matrix-date${date === currentDate ? ' is-current-date' : ''}`} data-date={date} {...props}>{children}</td>
}

export default function MonthlyScheduleMatrix({
  schedule, managedMinistryIds = [], canManageAll = false, onEditPosition, onEditPart, onEditOccurrence,
  ministryFilter = '', activityFilter = '', selectedDate, onDateChange, readonly = false,
}) {
  const { t, lang } = useLang()
  const [localDate, setLocalDate] = useState('')
  const matrix = useMemo(() => buildScheduleMatrix(schedule, { ministryFilter, activityFilter }), [schedule, ministryFilter, activityFilter])
  const currentDate = matrix.dates.includes(selectedDate) ? selectedDate : matrix.dates.includes(localDate) ? localDate : matrix.dates[0]
  const draft = schedule?.month?.status === 'Draft'
  const canEdit = ministryId => !readonly && draft && (canManageAll || managedMinistryIds.includes(ministryId))
  const chooseDate = date => {
    setLocalDate(date)
    onDateChange?.(date)
  }
  const moveDate = offset => {
    const index = matrix.dates.indexOf(currentDate) + offset
    if (matrix.dates[index]) chooseDate(matrix.dates[index])
  }
  const lockedContent = <span className="sched-matrix-locked"><LockKeyhole size={14} aria-hidden="true" />{t('schedMonth.restricted')}</span>
  const occurrenceContent = occurrence => <>
    <span className="sched-matrix-time"><Clock3 size={13} aria-hidden="true" />{formatScheduleTime(occurrence.start_time, occurrence.end_time)}</span>
    {occurrence.location && <span className="sched-matrix-meta"><MapPin size={13} aria-hidden="true" />{occurrence.location}</span>}
    {occurrence.pic && <span className="sched-matrix-meta">{t('schedMonth.pic')}: {occurrence.pic}</span>}
  </>
  const partContent = part => <>
    <span className="sched-matrix-part-line"><span>{t('schedMonth.team')}</span>{part?.team_name || '-'}</span>
    <span className="sched-matrix-part-line"><span>{t('schedMonth.material')}</span>{part?.material || '-'}</span>
    {part?.notes && <span className="sched-matrix-part-line"><span>{t('schedMonth.notes')}</span>{part.notes}</span>}
  </>

  if (!matrix.sections.length) return <p className="sched-matrix-empty" role="status">{t('schedMonth.noRows')}</p>

  return <div className="sched-month-matrix">
    <div className="sched-matrix-date-picker" role="group" aria-label={t('schedMonth.selectDate')}>
      <Button type="button" variant="ghost" size="sm" className="sched-matrix-date-arrow" disabled={matrix.dates.indexOf(currentDate) <= 0} onClick={() => moveDate(-1)} title={t('schedMonth.previousDate')} aria-label={t('schedMonth.previousDate')}><ChevronLeft size={18} aria-hidden="true" /></Button>
      <div className="sched-matrix-date-options">
        {matrix.dates.map(date => <Button type="button" key={date} variant="ghost" size="sm" className={`sched-matrix-date-option${date === currentDate ? ' is-selected' : ''}`} aria-pressed={date === currentDate} onClick={() => chooseDate(date)} title={formatScheduleDate(date, lang, { weekday: 'long', year: 'numeric' })}>
          <span>{formatScheduleDate(date, lang, { month: undefined })}</span><small>{formatScheduleDate(date, lang, { weekday: 'short', day: undefined, month: undefined })}</small>
        </Button>)}
      </div>
      <Button type="button" variant="ghost" size="sm" className="sched-matrix-date-arrow" disabled={matrix.dates.indexOf(currentDate) >= matrix.dates.length - 1} onClick={() => moveDate(1)} title={t('schedMonth.nextDate')} aria-label={t('schedMonth.nextDate')}><ChevronRight size={18} aria-hidden="true" /></Button>
    </div>
    <div className="sched-matrix-scroll" tabIndex={0} aria-label={t('schedMonth.matrixScroll')}>
      <table className="sched-matrix-table" style={{ '--sched-matrix-width': `${180 + matrix.dates.length * 170}px` }} aria-label={t('schedMonth.matrixLabel', { month: formatScheduleMonth(schedule?.month, lang) })}>
        <caption className="sched-matrix-sr-only">{t('schedMonth.matrixLabel', { month: formatScheduleMonth(schedule?.month, lang) })}</caption>
        <colgroup><col className="sched-matrix-label-column" />{matrix.dates.map(date => <col key={date} className={`sched-matrix-date-column${date === currentDate ? ' is-current-date' : ''}`} />)}</colgroup>
        <thead><tr><th scope="col" className="sched-matrix-label">{t('schedMonth.position')}</th>{matrix.dates.map(date => <th key={date} scope="col" className={`sched-matrix-date${date === currentDate ? ' is-current-date' : ''}`} data-date={date}><span className="sched-matrix-column-date"><CalendarDays size={14} aria-hidden="true" />{formatScheduleDate(date, lang)}</span><small>{formatScheduleDate(date, lang, { weekday: 'long', day: undefined, month: undefined })}</small></th>)}</tr></thead>
        <tbody>{matrix.sections.map(section => <Fragment key={section.key}>
          <tr className="sched-matrix-activity"><th scope="row" className="sched-matrix-label"><span>{section.title}</span><small>{t(`sched.source.${section.source_type || 'Ibadah'}`)}</small></th>{matrix.dates.map(date => {
            const occurrence = section.occurrencesByDate.get(date)
            return <DateCell key={date} date={date} currentDate={currentDate}>{!occurrence ? <span className="sched-matrix-not-scheduled" aria-label={t('schedMonth.notScheduled')}>-</span> : !readonly && draft && canManageAll && onEditOccurrence ? <Button type="button" variant="ghost" className="sched-matrix-cell sched-matrix-occurrence-cell" onClick={() => onEditOccurrence(occurrence)} title={t('schedMonth.editActivity', { activity: section.title, date: formatScheduleDate(date, lang) })} aria-label={t('schedMonth.editActivity', { activity: section.title, date: formatScheduleDate(date, lang) })}>{occurrenceContent(occurrence)}<Pencil size={13} className="sched-matrix-edit-mark" aria-hidden="true" /></Button> : <div className="sched-matrix-cell sched-matrix-occurrence-cell">{occurrenceContent(occurrence)}</div>}</DateCell>
          })}</tr>
          {section.ministries.map(ministry => <Fragment key={ministry.ministry_id}>
            <tr className="sched-matrix-ministry"><th scope="row" className="sched-matrix-label"><span>{ministry.ministry_name}</span>{!canEdit(ministry.ministry_id) && <LockKeyhole size={13} aria-hidden="true" />}</th>{matrix.dates.map(date => {
              const occurrence = section.occurrencesByDate.get(date)
              const part = matrix.getPart(occurrence, ministry.ministry_id)
              const hidden = draft && !!occurrence && !part
              return <DateCell key={date} date={date} currentDate={currentDate}>{!occurrence ? <span className="sched-matrix-not-scheduled">-</span> : hidden ? lockedContent : canEdit(ministry.ministry_id) && part && onEditPart ? <Button type="button" variant="ghost" className="sched-matrix-cell sched-matrix-part-cell" data-cell-type="part" onClick={() => onEditPart({ occurrence, part, ministry })} title={t('schedMonth.editPart', { ministry: ministry.ministry_name, date: formatScheduleDate(date, lang) })} aria-label={t('schedMonth.editPart', { ministry: ministry.ministry_name, date: formatScheduleDate(date, lang) })}>{partContent(part)}<Pencil size={13} className="sched-matrix-edit-mark" aria-hidden="true" /></Button> : <div className="sched-matrix-cell sched-matrix-part-cell">{partContent(part)}</div>}</DateCell>
            })}</tr>
            {ministry.positions.map(position => <tr key={position.position_id} className="sched-matrix-position"><th scope="row" className="sched-matrix-label">{position.name}<small>{t('schedMonth.capacity', { count: position.slots || position.capacity || 1 })}</small></th>{matrix.dates.map(date => {
              const cell = matrix.getCell(section.occurrencesByDate.get(date), position)
              const content = <>
                <span className="sched-matrix-assigned">{cell.assigned.map(slot => <span key={slot.slot_id || slot.slot_no}>{slot.users?.name || t('schedMonth.unavailableMember')}</span>)}</span>
                {cell.filled < cell.capacity && <span className="sched-matrix-vacancy">{t('schedMonth.emptyCount', { count: cell.capacity - cell.filled })}</span>}
                {!cell.assigned.length && !cell.capacity && '-'}
              </>
              return <DateCell key={date} date={date} currentDate={currentDate} data-position-id={position.position_id}>{!cell.occurrence ? <span className="sched-matrix-not-scheduled" aria-label={t('schedMonth.notScheduled')}>-</span> : cell.hidden ? lockedContent : canEdit(ministry.ministry_id) && cell.roster && onEditPosition ? <Button type="button" variant="ghost" className="sched-matrix-cell sched-matrix-position-cell" data-cell-type="position" onClick={() => onEditPosition(cell)} title={t('schedMonth.editPosition', { position: position.name, activity: section.title, date: formatScheduleDate(date, lang) })} aria-label={t('schedMonth.editPosition', { position: position.name, activity: section.title, date: formatScheduleDate(date, lang) })}>{content}<Pencil size={13} className="sched-matrix-edit-mark" aria-hidden="true" /></Button> : <div className="sched-matrix-cell sched-matrix-position-cell">{content}</div>}</DateCell>
            })}</tr>)}
          </Fragment>)}
          {['dress_code', 'notes'].map(field => <tr className="sched-matrix-notes" key={field}><th scope="row" className="sched-matrix-label">{t(field === 'dress_code' ? 'schedMonth.dressCode' : 'schedMonth.activityNotes')}</th>{matrix.dates.map(date => {
            const occurrence = section.occurrencesByDate.get(date)
            return <DateCell key={date} date={date} currentDate={currentDate}>{occurrence && !readonly && draft && canManageAll && onEditOccurrence ? <Button type="button" variant="ghost" className="sched-matrix-cell" onClick={() => onEditOccurrence(occurrence)} title={t('schedMonth.editActivity', { activity: section.title, date: formatScheduleDate(date, lang) })}>{occurrence[field] || '-'}<Pencil size={13} className="sched-matrix-edit-mark" aria-hidden="true" /></Button> : <div className="sched-matrix-cell">{occurrence?.[field] || '-'}</div>}</DateCell>
          })}</tr>)}
        </Fragment>)}</tbody>
      </table>
    </div>
  </div>
}
