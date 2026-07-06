// Endpoint sehat sederhana untuk memastikan serverless function ter-deploy.
// Tidak membocorkan status env — reconnaissance mitigation.
export const config = { runtime: 'nodejs' }

export default function handler(req, res) {
  res.status(200).json({ ok: true })
}
