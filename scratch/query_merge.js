import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://doxekaaieoqhshvcyoaa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveGVrYWFpZW9xaHNodmN5b2FhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTMyNTI4MCwiZXhwIjoyMDk2OTAxMjgwfQ.3apjqOgtUzHTIV1pjkMPf1vb3Knm7BnUci8SDltJTbk'
)

async function run() {
  const { data: komselPD2 } = await supabase.from('komsel').select('*').eq('name', 'Komsel Pria Dewasa 2').single()
  console.log('Komsel Pria Dewasa 2 ID:', komselPD2.komsel_id)

  const { data: sessionsPD2 } = await supabase.from('komsel_sessions')
    .select('*')
    .eq('komsel_id', komselPD2.komsel_id)
    .eq('session_date', '2026-07-07')
  console.log('Sessions PD2:', sessionsPD2)

  const { data: komselPD1 } = await supabase.from('komsel').select('*').ilike('name', 'Komsel Pria Dewasa 1%').single()
  console.log('Komsel Pria Dewasa 1 ID:', komselPD1.komsel_id)

  const { data: sessionsPD1 } = await supabase.from('komsel_sessions')
    .select('*')
    .eq('komsel_id', komselPD1.komsel_id)
    .eq('session_date', '2026-07-07')
  console.log('Sessions PD1:', sessionsPD1)
  
  // Find users who belong to PD2 but have attendance in PD1 on 2026-07-07
  const sessionIdsPD1 = sessionsPD1.map(s => s.session_id)
  
  const { data: misplacedAttendance } = await supabase.from('komsel_attendance')
    .select('*, users!inner(name, komsel_id)')
    .in('session_id', sessionIdsPD1)
    .eq('users.komsel_id', komselPD2.komsel_id)
    
  console.log('Misplaced Attendance:', misplacedAttendance)
}

run()
