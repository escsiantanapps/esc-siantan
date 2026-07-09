import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://doxekaaieoqhshvcyoaa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveGVrYWFpZW9xaHNodmN5b2FhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTMyNTI4MCwiZXhwIjoyMDk2OTAxMjgwfQ.3apjqOgtUzHTIV1pjkMPf1vb3Knm7BnUci8SDltJTbk'
)

async function run() {
  const targetSessionId = 'KSES-af2cb09b329d49a2a470dd6dd33af161' // PD2 Primary Session
  const targetKomselId = 'KOM-1777550895948'
  
  const misplacedIds = [
    'ATT-1a80b7a9d2f0441289cc8c4864038f1e', // Yustaria
    'ATT-19529840e8c4463698a6dd2e9239685b', // Herry
    'ATT-707e8ed83be14f24b4f8a867838423ae', // Hendy
    'ATT-56654a21f5bc469abfbd75f0c846647e', // Solihin
    'ATT-cf6273172c2740e9a477f20cca8aefcc', // Herman
    'ATT-8ae524bb0e6e491da6da210b8a765fd9'  // Pendy
  ]
  
  for (const attId of misplacedIds) {
    const { error } = await supabase.from('komsel_attendance')
      .update({ komsel_id: targetKomselId, session_id: targetSessionId })
      .eq('attendance_id', attId)
      
    if (error) {
      console.log('Error moving', attId, error.message)
    } else {
      console.log('Successfully moved', attId)
    }
  }
}

run()
