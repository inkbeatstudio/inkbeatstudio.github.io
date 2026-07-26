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
    nav: { home:'Головна', about:'Про мене', discography:'Дискографія', services:'Послуги', portfolio:'Портфоліо', contact:'Контакти', order:'Замовити', master:'Студія', studio:'InkBeat Студія', videoAudio:'Відео → Аудіо' },
    hero: { badge:'Незалежний артист', subtitle:'Музичний артист • Автор пісень • Автор текстів', listen:'Слухати музику', order:'Замовити пісню', contact:"Зв'язатися →", scroll:'Гортати' },
    stats: { releases:'Релізів', streams:'Прослуховувань', since:'Рік початку', platforms:'Платформ' },
    releases: { label:'Останні релізи', title:'Моя музика', all:'Вся дискографія →', spotify:'Слухати на SoundCloud', error:'Не вдалося завантажити релізи.', errorHint:'SoundCloud API недоступний.', loading:'Завантажую треки з SoundCloud…' },
    services: { label:'Послуги', title:'Творчі послуги', subtitle:'Допомагаю артистам та брендам знаходити своє звучання', more:'Детальніше про послуги →',
      card1Title:'Написання пісень', card1Desc:'Авторські пісні під ваш стиль',
      card2Title:'Тексти пісень', card2Desc:'Глибокі тексти для вашої музики',
      card3Title:'Вірші та поезія', card3Desc:'Авторська поезія для будь-яких цілей'
    },
    testimonials: { label:'Відгуки', title:'Що кажуть клієнти',
      t1:'"InkBeat написав для мене текст, який точно відобразив те, що я хотів сказати. Професійно, швидко, з душею."', n1:'Олексій М.', r1:'Музикант',
      t2:'"Замовила вірш для особливого моменту — отримала шедевр. Слова торкнулися серця. Буду повертатись ще."', n2:'Вікторія К.', r2:'Блогер',
      t3:'"Дуже задоволений колаборацією. InkBeat розуміє музику на глибокому рівні. Наша спільна пісня вийшла неймовірно."', n3:'Дмитро Л.', r3:'Артист-початківець',
      t4:'"Замовили авторський текст для корпоративного гімну. Результат перевершив очікування. Дуже рекомендую."', n4:'Марія П.', r4:'Event-менеджер'
    },
    faq: { label:'FAQ', title:'Часті питання',
      q1:'Як замовити пісню або текст?', a1:'Заповніть форму на сторінці Контакти або напишіть на inkbeat.mail@gmail.com. Опишіть запит, стиль та бажаний результат. Відповідаю протягом 24 годин.',
      q2:'Скільки коштують послуги?', a2:'Вартість залежить від типу замовлення, обсягу та терміновості. Напишіть — обговоримо деталі та погодимо ціну індивідуально.',
      q3:'Які терміни виконання?', a3:'Зазвичай від 2 до 7 робочих днів. Термінові замовлення — до 24 годин (за домовленістю).',
      q4:'Чи можна переглянути приклади робіт?', a4:'Так! Перейдіть на сторінку Портфоліо — там є приклади текстів, лірики та кейси.',
      q5:'Чи можливе виправлення після здачі?', a5:'Включено 2 безкоштовних раунди правок. Ваша задоволеність — мій пріоритет.',
      q6:'Хто отримує авторські права?', a6:'Після оплати всі права передаються вам. Я зберігаю право вказувати роботу в портфоліо (за погодженням).'
    },
    studioPromo: { label:'— Новинка', title1:'InkBeat', title2:'Студія', desc:'Безкоштовна музична студія прямо в браузері: багатодоріжковий редактор, степ-секвенсор, мікшер та вбудовані ефекти. Все зберігається локально на вашому пристрої — без реєстрації.', btn:'Відкрити InkBeat Студія →' },
    cta: { label:'Почнімо', title:'Готові до', highlight:'співпраці?', subtitle:'Розкажіть мені про ваш проєкт. Разом ми створимо щось неймовірне.', contact:'Написати мені', services:'Переглянути послуги' },
    footer: { desc:'Музичний артист • Автор пісень • Автор текстів. Музика, яка залишає слід.', nav:'Навігація', socials:'Соцмережі', rights:'Всі права захищені.', made:'Зроблено з ♥ в Україні' },
    typeAlbum:'Альбом', typeSingle:'Сингл', typeEP:'EP',

    aboutPage: {
      label:'Про мене', title1:'Музика — це', title2:'мова душі',
      greeting:'Привіт, я — InkBeat',
      bio1:"Я незалежний музичний артист з України, який пише музику, яка торкається серця. Моє ім'я — InkBeat — відображає суть того, що я роблю: чорнило слів + пульс ритму.",
      bio2:'Починаючи з 2024 року я активно випускаю авторську музику на всіх стримінгових платформах — Spotify, Apple Music, YouTube Music, SoundCloud. Кожен трек — це особиста історія, емоція або послання.',
      bio3:'Паралельно я допомагаю іншим артистам та брендам знаходити своє звучання через слова. Написання пісень, текстів, поезії на замовлення — це частина моєї творчої місії.',
      skillMusic:'Музика', skillVocal:'Вокал', skillLyrics:'Тексти', skillOriginal:'Оригінальність',
      pathLabel:'— Шлях', pathTitle:'Творчий шлях',
      y1title:'Перший реліз', y1desc:'Вихід першого синглу на всіх стримінгових платформах.',
      y2title:'Spotify for Artists', y2desc:'Верифікація профілю на Spotify та перші слухачі.',
      y3title:'Зростання аудиторії', y3desc:'Тисячі прослуховувань та активна присутність у соцмережах.',
      y4title:'Розширення послуг', y4desc:'Початок написання пісень та текстів на замовлення.',
      y5title:'Новий рівень', y5desc:'Активна студійна робота та колаборації з іншими артистами.'
    },

    contactPage: {
      label:'Контакти', title1:'Напиши', title2:'мені',
      email:'Email', active:'Активний',
      statusText:'Відповідаю протягом <strong style="color:#fff">24 годин</strong>. Для термінових замовлень напишіть "ТЕРМІНОВО" у темі.',
      socials:'Соцмережі',
      formName:"Ім'я *", formNamePh:"Ваше ім'я",
      formEmail:'Email *', formEmailPh:'your@email.com',
      formSubject:'Тема', formSubjectPh:'Замовлення пісні, Колаборація...',
      formMessage:'Повідомлення *', formMessagePh:'Розкажіть про ваш проєкт...',
      submit:'Надіслати повідомлення', sending:'Надсилаємо...',
      telegramNote:'Повідомлення надійде напряму в Telegram',
      errName:"Введіть ваше ім'я", errEmail:'Введіть email', errEmailFormat:'Невірний формат email',
      errMessage:'Введіть повідомлення', errMessageShort:'Повідомлення занадто коротке (мінімум 10 символів)',
      successMsg:'✓ Повідомлення надіслано в Telegram! Відповімо протягом 24 годин.',
      errorMsg:'✗ Помилка відправки. Напишіть напряму: inkbeat.mail@gmail.com'
    },

    discographyPage: {
      label:'Дискографія', title1:'Вся', title2:'музика', loadingCount:'Завантаження...',
      searchPh:'Пошук...', empty:'Нічого не знайдено',
      loadError:'Не вдалося завантажити релізи.', loadErrorHint:'Перевірте налаштування SoundCloud API.',
      loadErrorCount:'Помилка завантаження', countSuffix:'релізів • Автоматично з SoundCloud'
    },

    servicesPage: {
      label:'Послуги', title1:'Творчі', title2:'рішення', sub:'Від ідеї до готового тексту — допомагаю артистам та брендам знаходити своє звучання.',
      s1title:'Написання пісень під замовлення', s1price:'Від 500 грн', s1desc:'Створю авторську пісню спеціально для вас — від ідеї до готового тексту з мелодійним рішенням. Враховую ваш стиль, настрій та цільову аудиторію.', s1order:'Замовити →',
      s1b1:'Повністю авторський текст', s1b2:'Відповідає вашому жанру', s1b3:'2 раунди безкоштовних правок', s1b4:'Передача всіх прав', s1b5:'Швидко та якісно',
      s2title:'Написання текстів пісень', s2price:'Від 300 грн', s2desc:'Глибокі, виразні тексти для вашої музики. Підходить для артистів, які мають мелодію, але потребують слів. Будь-який жанр, будь-яка мова.', s2order:'Замовити →',
      s2b1:'Творчий та унікальний підхід', s2b2:'Аналіз вашого стилю', s2b3:'Рима, ритм, структура', s2b4:'Різні мови (UA/EN/RU)', s2b5:'Швидкий дедлайн',
      s3title:'Написання віршів', s3price:'Від 200 грн', s3desc:'Авторська поезія для будь-яких цілей — особисті привітання, публікації, подарунки, мотиваційний контент. Поезія, яка залишає слід.', s3order:'Замовити →',
      s3b1:'Персоналізовано під вас', s3b2:'Різні стилі та форми', s3b3:'Подарункова упаковка тексту', s3b4:'Цифровий та друкований формат', s3b5:'Від 1 дня'
    },

    portfolioPage: {
      label:'Портфоліо', title1:'Мої', title2:'роботи', sub:'Приклади текстів, лірики, кейси та досягнення. Кожна робота — унікальна історія.',
      badgeSong:'Текст пісні', badgePoetry:'Поезія',
      p1title:'Заряд на весь день', p1tag1:'#поп', p1tag2:'#лірика',
      p2title:'Небо', p2tag1:'#лірика', p2tag2:'#почуття',
      p3title:'Незламний', p3tag1:'#рок', p3tag2:'#мотивація',
      p4title:'Ти — моя гавань', p4tag1:'#R&B', p4tag2:'#поп',
      p5title:'Струмок', p5tag1:'#поезія',
      statTexts:'Написаних текстів', statReleases:'Релізів на Spotify', statTypes:'Типів послуг', statHappy:'Задоволені клієнти'
    }
  },
  en: {
    nav: { home:'Home', about:'About', discography:'Discography', services:'Services', portfolio:'Portfolio', contact:'Contact', order:'Order', master:'Studio', studio:'InkBeat Studio', videoAudio:'Video → Audio' },
    hero: { badge:'Independent Artist', subtitle:'Music Artist • Songwriter • Lyricist', listen:'Listen to Music', order:'Order a Song', contact:'Contact →', scroll:'Scroll' },
    stats: { releases:'Releases', streams:'Streams', since:'Started', platforms:'Platforms' },
    releases: { label:'Latest Releases', title:'My Music', all:'Full Discography →', spotify:'Listen on SoundCloud', error:'Failed to load releases.', errorHint:'SoundCloud API unavailable.', loading:'Loading tracks from SoundCloud…' },
    services: { label:'Services', title:'Creative Services', subtitle:'Helping artists and brands find their sound', more:'View all services →',
      card1Title:'Songwriting', card1Desc:'Original songs tailored to your style',
      card2Title:'Lyrics', card2Desc:'Deep, meaningful lyrics for your music',
      card3Title:'Poems & Poetry', card3Desc:'Original poetry for any occasion'
    },
    testimonials: { label:'Testimonials', title:'What Clients Say',
      t1:'"InkBeat wrote lyrics for me that captured exactly what I wanted to say. Professional, fast, and heartfelt."', n1:'Oleksii M.', r1:'Musician',
      t2:'"I ordered a poem for a special moment — got a masterpiece. The words touched my heart. I\u2019ll be back."', n2:'Viktoriia K.', r2:'Blogger',
      t3:'"Really happy with the collaboration. InkBeat understands music on a deep level. Our joint track turned out amazing."', n3:'Dmytro L.', r3:'Emerging Artist',
      t4:'"We ordered original lyrics for a corporate anthem. The result exceeded expectations. Highly recommend."', n4:'Mariia P.', r4:'Event Manager'
    },
    faq: { label:'FAQ', title:'Frequently Asked Questions',
      q1:'How do I order a song or lyrics?', a1:'Fill out the form on the Contact page or write to inkbeat.mail@gmail.com. Describe your request, style, and desired outcome. I reply within 24 hours.',
      q2:'How much do services cost?', a2:'The price depends on the type of order, scope, and urgency. Message me and we\u2019ll work out the details and agree on a price individually.',
      q3:'What are the turnaround times?', a3:'Usually 2 to 7 business days. Rush orders — within 24 hours (by arrangement).',
      q4:'Can I see examples of your work?', a4:'Sure! Check out the Portfolio page — it has examples of lyrics, poetry, and case studies.',
      q5:'Are revisions possible after delivery?', a5:'Two free rounds of revisions are included. Your satisfaction is my priority.',
      q6:'Who owns the copyright?', a6:'After payment, all rights are transferred to you. I retain the right to feature the work in my portfolio (by agreement).'
    },
    studioPromo: { label:'— New', title1:'InkBeat', title2:'Studio', desc:'A free music studio right in your browser: multitrack editor, step sequencer, mixer, and built-in effects. Everything is saved locally on your device — no sign-up required.', btn:'Open InkBeat Studio →' },
    cta: { label:"Let's Start", title:'Ready to', highlight:'collaborate?', subtitle:"Tell me about your project. Together we'll create something incredible.", contact:'Write to Me', services:'View Services' },
    footer: { desc:'Music Artist • Songwriter • Lyricist. Music that leaves a mark.', nav:'Navigation', socials:'Social Media', rights:'All rights reserved.', made:'Made with ♥ in Ukraine' },
    typeAlbum:'Album', typeSingle:'Single', typeEP:'EP',

    aboutPage: {
      label:'About', title1:'Music is the', title2:'language of the soul',
      greeting:"Hi, I'm InkBeat",
      bio1:"I'm an independent music artist from Ukraine who writes music that touches the heart. My name — InkBeat — reflects the essence of what I do: the ink of words + the pulse of rhythm.",
      bio2:'Since 2024 I\u2019ve been actively releasing original music on every streaming platform — Spotify, Apple Music, YouTube Music, SoundCloud. Every track is a personal story, emotion, or message.',
      bio3:'Alongside that, I help other artists and brands find their sound through words. Writing songs, lyrics, and poetry on commission is part of my creative mission.',
      skillMusic:'Music', skillVocal:'Vocals', skillLyrics:'Lyrics', skillOriginal:'Originality',
      pathLabel:'— Journey', pathTitle:'Creative Journey',
      y1title:'First Release', y1desc:'Debut single released on every streaming platform.',
      y2title:'Spotify for Artists', y2desc:'Verified Spotify profile and first listeners.',
      y3title:'Growing Audience', y3desc:'Thousands of streams and an active social media presence.',
      y4title:'Expanding Services', y4desc:'Started writing songs and lyrics on commission.',
      y5title:'A New Level', y5desc:'Active studio work and collaborations with other artists.'
    },

    contactPage: {
      label:'Contact', title1:'Write to', title2:'me',
      email:'Email', active:'Active',
      statusText:'I reply within <strong style="color:#fff">24 hours</strong>. For urgent orders, write "URGENT" in the subject line.',
      socials:'Social Media',
      formName:'Name *', formNamePh:'Your name',
      formEmail:'Email *', formEmailPh:'your@email.com',
      formSubject:'Subject', formSubjectPh:'Song order, Collaboration...',
      formMessage:'Message *', formMessagePh:'Tell me about your project...',
      submit:'Send Message', sending:'Sending...',
      telegramNote:'Your message will go straight to Telegram',
      errName:'Please enter your name', errEmail:'Please enter your email', errEmailFormat:'Invalid email format',
      errMessage:'Please enter a message', errMessageShort:'Message is too short (minimum 10 characters)',
      successMsg:'✓ Message sent to Telegram! We\u2019ll reply within 24 hours.',
      errorMsg:'✗ Sending failed. Please email directly: inkbeat.mail@gmail.com'
    },

    discographyPage: {
      label:'Discography', title1:'All', title2:'music', loadingCount:'Loading...',
      searchPh:'Search...', empty:'Nothing found',
      loadError:'Failed to load releases.', loadErrorHint:'Check the SoundCloud API settings.',
      loadErrorCount:'Failed to load', countSuffix:'releases • Automatically from SoundCloud'
    },

    servicesPage: {
      label:'Services', title1:'Creative', title2:'Solutions', sub:'From idea to finished lyrics — helping artists and brands find their sound.',
      s1title:'Custom Songwriting', s1price:'From 500 UAH', s1desc:'I\u2019ll create an original song just for you — from concept to a finished lyric with a melodic idea. I take into account your style, mood, and target audience.', s1order:'Order →',
      s1b1:'Fully original lyrics', s1b2:'Matches your genre', s1b3:'2 rounds of free revisions', s1b4:'Full rights transfer', s1b5:'Fast and high-quality',
      s2title:'Songwriting (Lyrics)', s2price:'From 300 UAH', s2desc:'Deep, expressive lyrics for your music. Great for artists who already have a melody but need words. Any genre, any language.', s2order:'Order →',
      s2b1:'Creative, unique approach', s2b2:'Analysis of your style', s2b3:'Rhyme, rhythm, structure', s2b4:'Multiple languages (UA/EN/RU)', s2b5:'Fast turnaround',
      s3title:'Poetry Writing', s3price:'From 200 UAH', s3desc:'Original poetry for any occasion — personal greetings, publications, gifts, motivational content. Poetry that leaves a mark.', s3order:'Order →',
      s3b1:'Personalized just for you', s3b2:'A variety of styles and forms', s3b3:'Gift-ready text presentation', s3b4:'Digital and print format', s3b5:'From 1 day'
    },

    portfolioPage: {
      label:'Portfolio', title1:'My', title2:'Work', sub:'Examples of lyrics, poetry, case studies, and achievements. Every piece is a unique story.',
      badgeSong:'Song Lyrics', badgePoetry:'Poetry',
      p1title:'Charge for the Whole Day', p1tag1:'#pop', p1tag2:'#lyrics',
      p2title:'Sky', p2tag1:'#lyrics', p2tag2:'#feelings',
      p3title:'Unbreakable', p3tag1:'#rock', p3tag2:'#motivation',
      p4title:'You Are My Harbor', p4tag1:'#R&B', p4tag2:'#pop',
      p5title:'The Stream', p5tag1:'#poetry',
      statTexts:'Lyrics Written', statReleases:'Spotify Releases', statTypes:'Service Types', statHappy:'Happy Clients'
    }
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
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-ph'))
  })
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'))
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

  const tasks = []

  tasks.push(new Promise(resolve => {
    if (document.readyState === 'complete') resolve()
    else window.addEventListener('load', () => resolve(), { once: true })
  }))

  if (document.fonts && document.fonts.ready) {
    tasks.push(document.fonts.ready.catch(() => {}))
  }

  tasks.push(Promise.all(
    Array.from(document.images).map(img => {
      if (img.complete) return Promise.resolve()
      return new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true })
        img.addEventListener('error', resolve, { once: true })
      })
    })
  ))

  if (window.__soundcloudDataPromise) {
    tasks.push(window.__soundcloudDataPromise.catch(() => {}))
  }

  const allReady = Promise.all(tasks)

  const safetyTimeout = new Promise(resolve => setTimeout(resolve, 8000))

  let settledCount = 0
  tasks.forEach(t => {
    Promise.resolve(t).then(() => {
      settledCount++
      setProgress((settledCount / tasks.length) * 92)
    })
  })

  function trickle() {
    if (finished) return
    setProgress(Math.min(progress + (90 - progress) * 0.04 + 0.15, 90))
    requestAnimationFrame(trickle)
  }
  requestAnimationFrame(trickle)

  Promise.race([allReady, safetyTimeout]).then(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      finished = true
      setProgress(100)
      setTimeout(() => screen.classList.add('hidden'), 420)
    }))
  })
}

function initCursor() {
  return
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
