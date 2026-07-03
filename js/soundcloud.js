
let cachedToken = null
let cachedTokenExpiry = 0

async function getToken() {
  const now = Date.now()
  if (cachedToken && now < cachedTokenExpiry) return cachedToken

  const basic = Buffer.from(
    `${process.env.SOUNDCLOUD_CLIENT_ID}:${process.env.SOUNDCLOUD_CLIENT_SECRET}`
  ).toString('base64')

  const res = await fetch('https://secure.soundcloud.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basic}`
    },
    body: 'grant_type=client_credentials'
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`SoundCloud token request failed (${res.status}): ${errBody}`)
  }

  const data = await res.json()
  cachedToken = data.access_token
  cachedTokenExpiry = now + ((data.expires_in || 3600) - 60) * 1000

  return cachedToken
}

function upsizeArtwork(url) {
  if (!url) return null
  return url.replace('-large.jpg', '-t500x500.jpg')
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const profileUrl = process.env.SOUNDCLOUD_PROFILE_URL

  try {
    if (!profileUrl) {
      throw new Error('SOUNDCLOUD_PROFILE_URL env variable is not set')
    }

    const token = await getToken()

    const resolveRes = await fetch(
      `https://api.soundcloud.com/resolve?url=${encodeURIComponent(profileUrl)}`,
      { headers: { 'Authorization': `OAuth ${token}` } }
    )

    if (!resolveRes.ok) {
      const errBody = await resolveRes.text()
      throw new Error(`SoundCloud resolve request failed (${resolveRes.status}): ${errBody}`)
    }

    const user = await resolveRes.json()

    const tracksRes = await fetch(
      `https://api.soundcloud.com/users/${user.id}/tracks?limit=50`,
      { headers: { 'Authorization': `OAuth ${token}` } }
    )

    if (!tracksRes.ok) {
      const errBody = await tracksRes.text()
      throw new Error(`SoundCloud tracks request failed (${tracksRes.status}): ${errBody}`)
    }

    const tracksData = await tracksRes.json()
    const items = Array.isArray(tracksData) ? tracksData : (tracksData.collection || [])

    const tracks = items
      .filter(t => t.permalink_url)
      .map(t => ({
        id: t.id,
        title: t.title,
        artwork: upsizeArtwork(t.artwork_url) || upsizeArtwork(user.avatar_url),
        permalinkUrl: t.permalink_url,
        createdAt: t.created_at,
        genre: t.genre || null
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    res.status(200).json({
      user: {
        username: user.username,
        avatarUrl: upsizeArtwork(user.avatar_url),
        permalinkUrl: user.permalink_url
      },
      tracks
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
