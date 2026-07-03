// IP-based in-memory rate limiter. Works per Vercel instance — sufficient for
// ~200 members where bursts won't span multiple cold-started instances.
const store = new Map() // 'ip:endpoint' → { count, resetAt }

/**
 * Returns true if the request should be blocked (limit exceeded).
 * Already writes the 429 response when blocking — caller just needs to `return`.
 */
export function checkRateLimit(req, res, { max = 10, windowMs = 60_000, endpoint = '' } = {}) {
  const ip = (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  )
  const key = `${ip}:${endpoint}`
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  entry.count += 1
  if (entry.count > max) {
    res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000))
    res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi dalam 1 menit.' })
    return true
  }
  return false
}
