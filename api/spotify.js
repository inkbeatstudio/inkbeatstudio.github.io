const ARTIST_ID = '6hkNwIjIfDcMDp5AObEbO9'
let cachedToken = null
let tokenExpiresAt = 0

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken
  const creds = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  })
  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiresAt = Date.now() + data.expires_in * 1000 - 60000
  return cachedToken
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const token = await getToken()
    const headers = { Authorization: `Bearer ${token}` }
    const [artistRes, albumsRes] = await Promise.all([
      fetch(`https://api.spotify.com/v1/artists/${ARTIST_ID}`, { headers }),
      fetch(`https://api.spotify.com/v1/artists/${ARTIST_ID}/albums?include_groups=album,single,compilation&market=UA&limit=50`, { headers })
    ])
    const artist = await artistRes.json()
    const albumsData = await albumsRes.json()
    const seen = new Set()
    const albums = (albumsData.items || []).filter(a => {
      const key = a.name.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    res.status(200).json({ artist, albums })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
