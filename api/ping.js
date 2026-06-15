// Endpoint sehat sederhana untuk memastikan serverless function ter-deploy & jalan.
export const config = { runtime: 'nodejs' }

export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    v: 'ping-1',
    env: {
      VAPID_PUBLIC_KEY: !!process.env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: !!process.env.VAPID_PRIVATE_KEY,
      SUPABASE_URL: !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      VAPID_SUBJECT: process.env.VAPID_SUBJECT || '(default)',
    },
  })
}
