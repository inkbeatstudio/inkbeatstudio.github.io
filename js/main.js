// ── НАЛАШТУВАННЯ ─────────────────────────────────────────
// Після деплою Vercel API — вставте сюди свій URL
const SPOTIFY_API = 'https://inkbeat-api.vercel.app'

// ── TELEGRAM BOT ─────────────────────────────────────────
// Замініть на свої дані:
// 1. Створіть бота через @BotFather в Telegram
// 2. Отримайте токен і вставте сюди
// 3. Напишіть боту /start щоб отримати chat_id
// 4. Отримайте chat_id: https://api.telegram.org/bot<TOKEN>/getUpdates
const TELEGRAM_BOT_TOKEN = 'ВАШ_ТОКЕН_СЮДИ'
const TELEGRAM_CHAT_ID = 'ВАШ_CHAT_ID_СЮДИ'

// ── ПЕРЕКЛАДИ ─────────────────────────────────────────────
const translations = {
  uk: {
    nav: { home:'Головна', about:'Про мене', discography:'Дискографія', services:'Послуги', portfolio:'Портфоліо', contact:'Контакти', order:'Замовити' },
    hero: { badge:'Незалежний артист', subtitle:'Музичний артист • Автор пісень • Автор текстів', listen:'Слухати музику', order:'Замовити пісню', contact:"Зв'язатися →" },
    stats: { releases:'Релізів', streams:'Прослуховувань', since:'Рік початку', platforms:'Платформ' },
    releases: { label:'Останні релізи', title:'Моя музика', all:'Вся дискографія →', spotify:'Відкрити в Spotify', error:'Не вдалося завантажити релізи.', errorHint:'Spotify API недоступний.' },
    services: { label:'Послуги', title:'Творчі послуги', subtitle:'Допомагаю артистам та брендам знаходити своє звучання', more:'Детальніше про послуги →' },
    testimonials: { label:'Відгуки', title:'Що кажуть клієнти' },
    faq: { label:'FAQ', title:'Часті питання' },
    cta: { label:'Почнімо', title:'Готові до', highlight:'співпраці?', subtitle:'Розкажіть мені про ваш проєкт. Разом ми створимо щось неймовірне.', contact:'Написати мені', services:'Переглянути послуги' },
    footer: { desc:'Музичний артист • Автор пісень • Автор текстів. Музика, яка залишає слід.', nav:'Навігація', socials:'Соцмережі', rights:'Всі права захищені.', made:'Зроблено з ♥ в Україні' },
    typeAlbum:'Альбом', typeSingle:'Сингл', typeEP:'EP'
  },
  en: {
    nav: { home:'Home', about:'About', discography:'Discography', services:'Services', portfolio:'Portfolio', contact:'Contact', order:'Order' },
    hero: { badge:'Independent Artist', subtitle:'Music Artist • Songwriter • Lyricist', listen:'Listen to Music', order:'Order a Song', contact:'Contact →' },
    stats: { releases:'Releases', streams:'Streams', since:'Started', platforms:'Platforms' },
    releases: { label:'Latest Releases', title:'My Music', all:'Full Discography →', spotify:'Open in Spotify', error:'Failed to load releases.', errorHint:'Spotify API unavailable.' },
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

// ── LOADING SCREEN ────────────────────────────────────────
function initLoading() {
  const screen = document.getElementById('loading-screen')
  if (!screen) return
  const bar = screen.querySelector('.loading-bar')
  const pct = screen.querySelector('.loading-pct')
  let progress = 0

  const interval = setInterval(() => {
    progress = Math.min(progress + Math.random() * 15 + 5, 100)
    if (bar) bar.style.width = progress + '%'
    if (pct) pct.textContent = Math.round(progress) + '%'
    if (progress >= 100) {
      clearInterval(interval)
      setTimeout(() => screen.classList.add('hidden'), 400)
    }
  }, 80)
}

// ── CURSOR ────────────────────────────────────────────────
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

// ── NAVBAR + MOBILE MENU ──────────────────────────────────
function initNavbar() {
  const navbar = document.getElementById('navbar')
  if (!navbar) return

  // Scroll effect
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40)
  })

  // ── MOBILE MENU FIX ──
  const burger = document.querySelector('.burger')
  const mobileMenu = document.querySelector('.mobile-menu')
  const mobileClose = document.querySelector('.mobile-close')

  function openMenu() {
    mobileMenu.classList.add('open')
    document.body.style.overflow = 'hidden' // Блокуємо скрол
  }

  function closeMenu() {
    mobileMenu.classList.remove('open')
    document.body.style.overflow = '' // Повертаємо скрол
  }

  burger?.addEventListener('click', openMenu)
  mobileClose?.addEventListener('click', closeMenu)

  // Закриваємо при кліку на посилання
  mobileMenu?.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', closeMenu)
  })

  // Закриваємо при кліку поза меню (на темний фон)
  mobileMenu?.addEventListener('click', function(e) {
    if (e.target === mobileMenu) closeMenu()
  })

  // Закриваємо клавішею Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu()
  })

  // Lang switcher
  document.querySelectorAll('.lang-toggle').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang))
  })

  updateLangBtn()
  setLang(currentLang)
}

// ── SCROLL REVEAL ─────────────────────────────────────────
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

// ── COUNTERS ──────────────────────────────────────────────
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

// ── TESTIMONIALS ──────────────────────────────────────────
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

// ── FAQ ───────────────────────────────────────────────────
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

// ── TELEGRAM FORM ─────────────────────────────────────────
async function sendToTelegram(name, email, subject, message) {
  const text = `
🎵 *Нове повідомлення з сайту InkBeat*

👤 *Ім'я:* ${name}
📧 *Email:* ${email}
📌 *Тема:* ${subject || '—'}
💬 *Повідомлення:*
${message}
  `.trim()

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'Markdown'
    })
  })

  const data = await res.json()
  if (!data.ok) throw new Error(data.description || 'Telegram error')
  return data
}

// ── SPOTIFY ───────────────────────────────────────────────
async function fetchSpotify() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000) // 10 сек таймаут

    const res = await fetch(`${SPOTIFY_API}/api/spotify`, {
      signal: controller.signal
    })
    clearTimeout(timeout)

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('Spotify fetch error:', err.message)
    return null
  }
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('uk-UA', {
    year: 'numeric', month: 'long', day: 'numeric'
  })
}

function createReleaseCard(album) {
  const img = album.images?.[0]?.url
  const typeMap = { album:'Альбом', single:'Сингл', compilation:'EP' }
  const typeLabel = typeMap[album.album_type] || album.album_type

  return `
    <div class="release-card">
      <div class="release-img">
        ${img
          ? `<img src="${img}" alt="${album.name}" loading="lazy">`
          : `<div class="release-placeholder">♪</div>`
        }
        <span class="release-type-badge">${typeLabel}</span>
      </div>
      <div class="release-info">
        <div class="release-name">${album.name}</div>
        <div class="release-date">${formatDate(album.release_date)}</div>
        <button onclick="toggleEmbed('${album.id}',this)"
          style="background:none;border:none;cursor:pointer;color:var(--blue);font-size:.75rem;margin-bottom:12px;padding:0;font-family:inherit">
          Слухати ▶
        </button>
        <div id="embed-${album.id}" style="display:none;margin-bottom:12px">
          <iframe
            src="https://open.spotify.com/embed/album/${album.id}?utm_source=generator&theme=0"
            width="100%" height="80" frameborder="0"
            allow="autoplay;clipboard-write;encrypted-media;fullscreen;picture-in-picture"
            loading="lazy" style="border-radius:12px;display:block">
          </iframe>
        </div>
        <a href="${album.external_urls.spotify}" target="_blank" rel="noopener noreferrer"
          class="release-spotify-link">
          Відкрити в Spotify ↗
        </a>
      </div>
    </div>`
}

function toggleEmbed(id, btn) {
  const embed = document.getElementById('embed-' + id)
  const isOpen = embed.style.display !== 'none'
  embed.style.display = isOpen ? 'none' : 'block'
  btn.textContent = isOpen ? 'Слухати ▶' : 'Сховати ↑'
}

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initLoading()
  initCursor()
  initNavbar()
  initReveal()
  initCounters()
  initSlider()
  initFAQ()
})
