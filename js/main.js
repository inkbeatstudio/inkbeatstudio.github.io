const API_BASE = 'https://inkbeat-api.vercel.app'

window.__contentReadyResolve = null
window.__contentReadyPromise = new Promise(resolve => { window.__contentReadyResolve = resolve })

function getSoundCloudData() {
  if (!window.__soundcloudDataPromise) {
    window.__soundcloudDataPromise = fetchSoundCloud()
  }
  return window.__soundcloudDataPromise
}
getSoundCloudData()

const translations = {
  uk: {
    nav: { home:'Головна', about:'Про мене', discography:'Дискографія', services:'Послуги', portfolio:'Портфоліо', contact:'Контакти', order:'Замовити', master:'Студія' },
    hero: { badge:'Незалежний артист', subtitle:'Музичний артист • Автор пісень • Автор текстів', listen:'Слухати музику', order:'Замовити пісню', contact:"Зв'язатися →" },
    stats: { releases:'Релізів', streams:'Прослуховувань', since:'Рік початку', platforms:'Платформ' },
    releases: { label:'Останні релізи', title:'Моя музика', all:'Вся дискографія →', spotify:'Слухати на SoundCloud', error:'Не вдалося завантажити релізи.', errorHint:'SoundCloud API недоступний.', loading:'Завантажую треки з SoundCloud…' },
    services: { label:'Послуги', title:'Творчі послуги', subtitle:'Допомагаю артистам та брендам знаходити своє звучання', more:'Детальніше про послуги →' },
    testimonials: { label:'Відгуки', title:'Що кажуть клієнти' },
    faq: { label:'FAQ', title:'Часті питання' },
    cta: { label:'Почнімо', title:'Готові до', highlight:'співпраці?', subtitle:'Розкажіть мені про ваш проєкт. Разом ми створимо щось неймовірне.', contact:'Написати мені', services:'Переглянути послуги' },
    footer: { desc:'Музичний артист • Автор пісень • Автор текстів. Музика, яка залишає слід.', nav:'Навігація', socials:'Соцмережі', rights:'Всі права захищені.', made:'Зроблено з ♥ в Україні' },
    typeAlbum:'Альбом', typeSingle:'Сингл', typeEP:'EP'
  },
  en: {
    nav: { home:'Home', about:'About', discography:'Discography', services:'Services', portfolio:'Portfolio', contact:'Contact', order:'Order', master:'Studio' },
    hero: { badge:'Independent Artist', subtitle:'Music Artist • Songwriter • Lyricist', listen:'Listen to Music', order:'Order a Song', contact:'Contact →' },
    stats: { releases:'Releases', streams:'Streams', since:'Started', platforms:'Platforms' },
    releases: { label:'Latest Releases', title:'My Music', all:'Full Discography →', spotify:'Listen on SoundCloud', error:'Failed to load releases.', errorHint:'SoundCloud API unavailable.', loading:'Loading tracks from SoundCloud…' },
    services: { label:'Services', title:'Creative Services', subtitle:'Helping artists and brands find their sound', more:'View all services →' },
    testimonials: { label:'Testimonials', title:'What Clients Say' },
    faq: { label:'FAQ', title:'Frequently Asked Questions' },
    cta: { label:"Let's Start", title:'Ready to', highlight:'collaborate?', subtitle:"Tell me about your project. Together we'll create something incredible.", contact:'Write to Me', services:'View Services' },
    footer: { desc:'Music Artist • Songwriter • Lyricist. Music that leaves a mark.', nav:'Navigation', socials:'Social Media', rights:'All rights reserved.', made:'Made with ♥ in Ukraine' },
    typeAlbum:'Album', typeSingle:'Single', typeEP:'EP'
  }
}

let currentLang = localStorage.getItem('lang') || 'uk'

function t(path) {
  const keys = path.split('.')
  let val = translations[currentLang]
  for (const k of keys) val = val?.[k]
  return val || path
}

function setLang(lang) {
  currentLang = lang
  localStorage.setItem('lang', lang)
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'))
  })
  updateLangBtn()
  if (typeof onLangChange === 'function') onLangChange()
}

function updateLangBtn() {
  document.querySelectorAll('.lang-ua').forEach(el => el.classList.toggle('active', currentLang === 'uk'))
  document.querySelectorAll('.lang-en').forEach(el => el.classList.toggle('active', currentLang === 'en'))
}

function initLoading() {
  const screen = document.getElementById('loading-screen')
  if (!screen) return
  const bar = screen.querySelector('.loading-bar')
  const pct = screen.querySelector('.loading-pct')
  let progress = 0
  let finished = false

  function setProgress(p) {
    progress = Math.max(progress, Math.min(p, 100))
    if (bar) bar.style.width = progress + '%'
    if (pct) pct.textContent = Math.round(progress) + '%'
    const stage = progress >= 100 ? 3 : progress >= 66 ? 2 : progress >= 33 ? 1 : 0
    screen.setAttribute('data-stage', String(stage))
  }

  // Real readiness signals: every real-world thing that has to finish loading
  // AND running before we consider the page "done" — not a fake timer.
  const tasks = []

  // 1) All sub-resources the browser knows about (images, css, scripts, media).
  tasks.push(new Promise(resolve => {
    if (document.readyState === 'complete') resolve()
    else window.addEventListener('load', () => resolve(), { once: true })
  }))

  // 2) Web fonts actually loaded and ready to paint (avoids flash of unstyled text
  // counting as "loaded" before the real typography is in).
  if (document.fonts && document.fonts.ready) {
    tasks.push(document.fonts.ready.catch(() => {}))
  }

  // 3) Every <img> on the page fully decoded (covers late-inserted / lazy images
  // already present in markup at load time).
  tasks.push(Promise.all(
    Array.from(document.images).map(img => {
      if (img.complete) return Promise.resolve()
      return new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true })
        img.addEventListener('error', resolve, { once: true })
      })
    })
  ))

  // 4) Any in-flight data fetch kicked off at page start (e.g. the SoundCloud
  // releases feed on the homepage) — the loader stays up until that data has
  // actually arrived and is ready to render, not just until assets are cached.
  if (window.__soundcloudDataPromise) {
    tasks.push(window.__soundcloudDataPromise.catch(() => {}))
  }

  const allReady = Promise.all(tasks)

  // Hard safety net: never trap the user behind the loader if something stalls.
  const safetyTimeout = new Promise(resolve => setTimeout(resolve, 8000))

  // Progress reflects genuine completion of the tasks above, weighted so the
  // bar/equalizer only reaches 100% once everything has actually resolved.
  let settledCount = 0
  tasks.forEach(t => {
    Promise.resolve(t).then(() => {
      settledCount++
      setProgress((settledCount / tasks.length) * 92)
    })
  })

  // Gentle trickle underneath so the bar/equalizer never looks stuck while
  // waiting on slow network tasks, but it can never finish the job on its own.
  function trickle() {
    if (finished) return
    setProgress(Math.min(progress + (90 - progress) * 0.04 + 0.15, 90))
    requestAnimationFrame(trickle)
  }
  requestAnimationFrame(trickle)

  Promise.race([allReady, safetyTimeout]).then(() => {
    // Double rAF: let the browser actually paint the final frame before we
    // declare victory, so "loaded" also means "rendered on screen".
    requestAnimationFrame(() => requestAnimationFrame(() => {
      finished = true
      setProgress(100)
      setTimeout(() => screen.classList.add('hidden'), 420)
    }))
  })
}

function initCursor() {
  if (window.innerWidth <= 768) return
  const dot = document.querySelector('.cursor-dot')
  const ring = document.querySelector('.cursor-ring')
  if (!dot || !ring) return

  let mx = 0, my = 0, rx = 0, ry = 0

  document.addEventListener('mousemove', e => {
    mx = e.clientX
    my = e.clientY
    dot.style.left = mx + 'px'
    dot.style.top = my + 'px'
  })

  function animRing() {
    rx += (mx - rx) * 0.12
    ry += (my - ry) * 0.12
    ring.style.left = rx + 'px'
    ring.style.top = ry + 'px'
    requestAnimationFrame(animRing)
  }
  animRing()
}

function initNavbar() {
  const navbar = document.getElementById('navbar')
  if (!navbar) return

  
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40)
  })

  
  const burger = document.querySelector('.burger')
  const mobileMenu = document.querySelector('.mobile-menu')
  const mobileClose = document.querySelector('.mobile-close')

  function openMenu() {
    mobileMenu.classList.add('open')
    document.body.style.overflow = 'hidden'
  }

  function closeMenu() {
    mobileMenu.classList.remove('open')
    document.body.style.overflow = ''
  }

  burger?.addEventListener('click', openMenu)
  mobileClose?.addEventListener('click', closeMenu)

  mobileMenu?.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', closeMenu)
  })

  mobileMenu?.addEventListener('click', function(e) {
    if (e.target === mobileMenu) closeMenu()
  })

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu()
  })

  document.querySelectorAll('.lang-toggle').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang))
  })

  updateLangBtn()
  setLang(currentLang)
}

function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible')
        obs.unobserve(e.target)
      }
    })
  }, { threshold: 0.08, rootMargin: '-40px' })

  document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach(el => obs.observe(el))
}

function initCounters() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return
      const el = e.target
      const to = parseInt(el.dataset.to)
      const suffix = el.dataset.suffix || ''
      const duration = 2000
      const start = Date.now()

      const frame = () => {
        const p = Math.min((Date.now() - start) / duration, 1)
        el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * to) + suffix
        if (p < 1) requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
      obs.unobserve(el)
    })
  }, { threshold: 0.3 })

  document.querySelectorAll('[data-to]').forEach(el => obs.observe(el))
}

function initSlider() {
  const cards = document.querySelectorAll('.testimonial-card')
  const dots = document.querySelectorAll('.dot')
  if (!cards.length) return

  let idx = 0

  function show(i) {
    cards.forEach((c, j) => c.style.display = j === i ? 'flex' : 'none')
    dots.forEach((d, j) => d.classList.toggle('active', j === i))
    idx = i
  }
  show(0)

  document.querySelector('.slider-prev')?.addEventListener('click', () => show((idx - 1 + cards.length) % cards.length))
  document.querySelector('.slider-next')?.addEventListener('click', () => show((idx + 1) % cards.length))
  dots.forEach((d, i) => d.addEventListener('click', () => show(i)))
  setInterval(() => show((idx + 1) % cards.length), 5000)
}


function initFAQ() {
  document.querySelectorAll('.faq-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const answer = btn.nextElementSibling
      const icon = btn.querySelector('.faq-icon')
      const isOpen = answer.classList.contains('open')

      document.querySelectorAll('.faq-answer').forEach(a => a.classList.remove('open'))
      document.querySelectorAll('.faq-icon').forEach(i => i.textContent = '+')

      if (!isOpen) {
        answer.classList.add('open')
        icon.textContent = '−'
      }
    })
  })
}

async function sendToTelegram(name, email, subject, message) {
  const res = await fetch(`${API_BASE}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, subject, message })
  })

  const data = await res.json()
  if (!res.ok || !data.success) throw new Error(data.error || 'Contact API error')
  return data
}

async function fetchSoundCloud() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(`${API_BASE}/api/soundcloud`, {
      signal: controller.signal
    })
    clearTimeout(timeout)

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('SoundCloud fetch error:', err.message)
    return null
  }
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('uk-UA', {
    year: 'numeric', month: 'long', day: 'numeric'
  })
}

function scWidgetUrl(track) {
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(track.permalinkUrl)}` +
    `&color=%230038ff&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false`
}

function createReleaseCard(track) {
  const img = track.artwork

  return `
    <div class="release-card">
      <div class="release-img">
        ${
          img
            ? `<img src="${img}" alt="${track.title}" loading="lazy">`
            : `<div class="release-placeholder">♪</div>`
        }
        <span class="release-type-badge">SoundCloud</span>
      </div>

      <div class="release-info">
        <div class="release-name">${track.title}</div>

        <div class="release-date">
          ${formatDate(track.createdAt)}
        </div>

        <div id="embed-${track.id}" class="release-embed" style="display:none"></div>

        <div class="release-actions">
          <button
            class="release-play-btn"
            id="play-btn-${track.id}"
            onclick="toggleEmbed('${track.id}', '${scWidgetUrl(track).replace(/'/g, "\\'")}')">
            <svg class="play-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            <span class="spinner"></span>
            <span class="play-btn-label">Слухати</span>
          </button>

          <a
            href="${track.permalinkUrl}"
            target="_blank"
            rel="noopener noreferrer"
            class="release-listen-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>
            SoundCloud
          </a>
        </div>
      </div>
    </div>
  `
}

function toggleEmbed(id, widgetUrl) {
  const embed = document.getElementById('embed-' + id)
  const btn = document.getElementById('play-btn-' + id)
  if (!embed || !btn) return

  const label = btn.querySelector('.play-btn-label')
  const isOpen = embed.style.display !== 'none' && embed.dataset.loaded === 'true'

  if (isOpen) {
    embed.style.display = 'none'
    if (label) label.textContent = 'Слухати'
    return
  }

  if (embed.dataset.loaded === 'true') {
    embed.style.display = 'block'
    if (label) label.textContent = 'Сховати'
    return
  }

  btn.classList.add('is-loading')
  btn.disabled = true

  const iframe = document.createElement('iframe')
  iframe.width = '100%'
  iframe.height = '166'
  iframe.frameBorder = '0'
  iframe.allow = 'autoplay'
  iframe.style.display = 'block'
  iframe.style.borderRadius = '12px'

  iframe.onload = () => {
    embed.dataset.loaded = 'true'
    embed.style.display = 'block'
    btn.classList.remove('is-loading')
    btn.disabled = false
    if (label) label.textContent = 'Сховати'
  }

  iframe.src = widgetUrl
  embed.appendChild(iframe)
}

function initInlineLoader(scope) {
  const bar = scope.querySelector('.loading-bar')
  const pct = scope.querySelector('.loading-pct')
  let progress = 0
  let stopped = false

  function setProgress(p) {
    progress = p
    if (bar) bar.style.width = progress + '%'
    if (pct) pct.textContent = Math.round(progress) + '%'
  }

  function trickle() {
    if (stopped) return
    setProgress(Math.min(progress + (90 - progress) * 0.06 + 0.3, 90))
    requestAnimationFrame(trickle)
  }
  requestAnimationFrame(trickle)

  return function finish() {
    stopped = true
    setProgress(100)
  }
}

async function loadSoundCloud() {
  const container = document.getElementById('releases-grid')

  if (!container) {
    return
  }

  const loaderEl = document.getElementById('releases-loading')
  const finishLoader = loaderEl ? initInlineLoader(loaderEl) : null

  const [data] = await Promise.all([
    getSoundCloudData(),
    new Promise(r => setTimeout(r, 5000))
  ])
  if (finishLoader) finishLoader()

  if (!data || !data.tracks || !data.tracks.length) {
    await new Promise(r => setTimeout(r, 150))
    container.innerHTML = `
      <p style="color:#888;text-align:center">
        Музика поки недоступна.
      </p>
    `
    return
  }

  await new Promise(r => setTimeout(r, 150))
  container.innerHTML = data.tracks
    .slice(0, 6)
    .map(track => createReleaseCard(track))
    .join('')
}

document.addEventListener('DOMContentLoaded', () => {
  initLoading()
  initCursor()
  initNavbar()
  initReveal()
  initCounters()
  initSlider()
  initFAQ()
  loadSoundCloud()
})
