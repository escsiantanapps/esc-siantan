import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://doxekaaieoqhshvcyoaa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveGVrYWFpZW9xaHNodmN5b2FhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTMyNTI4MCwiZXhwIjoyMDk2OTAxMjgwfQ.3apjqOgtUzHTIV1pjkMPf1vb3Knm7BnUci8SDltJTbk'
)

async function run() {
  const targetSessionId = 'KSES-af2cb09b329d49a2a470dd6dd33af161'
  const targetKomselId = 'KOM-1777550895948'
  
  const misplacedIds = [
    'ATT-350183331cf843d3b40181b1cf3df42d',
    'ATT-f1a686b0f1c7420daba015ed84157d36',
    'ATT-8ad83da10aea443a9cff5a220b79bc67',
    'ATT-00f58d42d55c4811a264657d5ac8c429',
    'ATT-7494badd444d4f928f1348046a914372'
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
