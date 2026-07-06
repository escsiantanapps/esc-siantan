import { Input, Textarea } from '@/components/ui'
import Uploader from '@/components/Uploader'

// Renderer field dinamis untuk Formulir Prasyarat Event/Kelas.
// Disederhanakan: hanya 3 tipe field (text/textarea/file). Pola meniru
// TaskDetailPage.jsx tapi tanpa image/number/date/select/checkbox.
export default function PrerequisiteForm({ fields, value, onChange, onFileUpload, uploadingKey }) {
  return (
    <div className="space-y-3">
      {(fields || []).map(field => (
        <div key={field.key}>
          {field.type === 'textarea' && (
            <Textarea
              label={field.label} required={field.required}
              placeholder={field.placeholder}
              value={value[field.key] || ''}
              onChange={e => onChange(field.key, e.target.value)}
            />
          )}
          {field.type === 'file' && (
            <Uploader
              kind="file" label={field.label} required={field.required}
              value={value[field.key]} uploading={uploadingKey === field.key}
              onFile={file => onFileUpload(field.key, file)} onClear={() => onChange(field.key, '')}
            />
          )}
          {(!field.type || field.type === 'text') && (
            <Input
              label={field.label} required={field.required}
              placeholder={field.placeholder}
              value={value[field.key] || ''}
              onChange={e => onChange(field.key, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  )
}
