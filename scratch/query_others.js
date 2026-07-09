import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://doxekaaieoqhshvcyoaa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveGVrYWFpZW9xaHNodmN5b2FhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTMyNTI4MCwiZXhwIjoyMDk2OTAxMjgwfQ.3apjqOgtUzHTIV1pjkMPf1vb3Knm7BnUci8SDltJTbk'
)

async function run() {
  const komselPD1_id = 'KMS-1783340438'
  const komselPD2_id = 'KOM-1777550895948'
  
  const { data: sessionsPD1 } = await supabase.from('komsel_sessions')
    .select('*')
    .eq('komsel_id', komselPD1_id)
    .eq('session_date', '2026-07-07')

  const sessionIdsPD1 = sessionsPD1.map(s => s.session_id)
  
  const { data: att } = await supabase.from('komsel_attendance')
    .select('attendance_id, session_id, user_id, users!inner(name, komsel_id)')
    .in('session_id', sessionIdsPD1)
    
  console.log('Semua absen di PD1 (7 Juli):')
  att.forEach(a => {
    console.log(`- ${a.users.name} (user_komsel: ${a.users.komsel_id}) [att_id: ${a.attendance_id}]`)
  })
}

run()
