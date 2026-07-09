import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://doxekaaieoqhshvcyoaa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveGVrYWFpZW9xaHNodmN5b2FhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTMyNTI4MCwiZXhwIjoyMDk2OTAxMjgwfQ.3apjqOgtUzHTIV1pjkMPf1vb3Knm7BnUci8SDltJTbk'
)

async function run() {
  const { data: solihin } = await supabase.from('users').select('*').ilike('name', 'Solihin').single()
  
  if (!solihin) {
    console.log("Solihin not found")
    return
  }

  const { data: att } = await supabase.from('komsel_attendance')
    .select('*')
    .eq('user_id', solihin.user_id)
    .eq('attendance_date', '2026-07-07')
    
  console.log('Solihin attendances on 7 July:', att)
}

run()
