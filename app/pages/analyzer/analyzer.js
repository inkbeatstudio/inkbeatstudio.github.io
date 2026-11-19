/* InkBeat — сторінка «Аналіз треку»: інтерфейс поверх engine.js і handoff.js */
(function () {
  'use strict';

  const AN = window.InkBeatAnalyzer;
  const HO = window.InkBeatHandoff;
  const $ = id => document.getElementById(id);

  // ------------------------------------------------------------- i18n ----
  const I18N = {
    uk: {
      title: 'Аналіз треку', badge: 'Локально, без інтернету', menu: '← Меню', toStudio: 'Студія →',
      heroTitle: 'Мінус → проєкт у студії',
      heroLead: 'Завантаж готовий мінус (наприклад, зі Suno). Програма визначить темп, тональність, акорди та ударний патерн і розкладе їх у студії по тактах — як заготовку, яку далі доводиш руками.',
      dropTitle: 'Перетягни аудіофайл сюди', dropSub: 'або натисни, щоб обрати · mp3, wav, ogg, m4a, flac',
      expectTitle: 'Чого очікувати від аналізу',
      expect1: '<b>Надійно:</b> темп, сітка тактів, тональність.',
      expect2: '<b>Добре:</b> ударні (kick / snare / hi-hat) і акорди по тактах.',
      expect3: '<b>Не розпізнається:</b> мелодія, вокал, точні тембри. Звук оригіналу відтворити неможливо — це схожа аранжировка з наших інструментів.',
      expect4: 'Різкі ноти баса іноді читаються як kick — зайві удари можна вимкнути або прибрати вручну перед створенням проєкту.',
      another: 'Інший файл', statTempo: 'Темп', statKey: 'Тональність', statBars: 'Такти',
      firstBar: 'перший такт', altBpm: 'Інші варіанти:', shiftBack: 'Перший такт на долю раніше', shiftFwd: 'Перший такт на долю пізніше',
      wfTitle: 'Сітка на треку', play: 'Грати', pause: 'Пауза', clickOn: 'Клік метронома',
      wfHint: 'Увімкни відтворення з кліком: якщо клік не збігається з долями — зміни перший такт (◀ ▶) або темп.',
      drumTitle: 'Ударні', drumHint: 'Клітинки можна перемикати кліком. Рядок, який виглядає хибно, вимкни галочкою зліва.',
      chordTitle: 'Акорди', allBars: 'Усі такти',
      exportTitle: 'Створити проєкт у студії',
      optDrums: 'Ударні → секвенсор', optChords: 'Акорди → піано-рол',
      optOrig: 'Додати оригінал окремою доріжкою', optMute: 'Оригінал приглушений (щоб чути аранжировку)',
      sendBtn: 'Відкрити у студії →', sendHint: 'Поточний проєкт студії збережеться в «Проєктах» як резервна копія.',
      // динамічні
      decoding: 'Декодування файлу…', stageOnsets: 'Аналіз ритму…', stageTempo: 'Пошук темпу й сітки…',
      stageChroma: 'Аналіз гармонії…', stageFinish: 'Збираю результат…', stageResample: 'Підготовка звуку…',
      errRead: 'Не вдалося прочитати файл. Підтримуються mp3, wav, ogg, m4a, flac.',
      errShort: 'Трек закороткий для аналізу (потрібно щонайменше 8 секунд).',
      errTempo: 'Не вдалося знайти стабільний темп у цьому файлі.',
      errGeneric: 'Помилка аналізу: ', errSend: 'Не вдалося передати в студію: ',
      subLine: (dur, sr) => `${dur} · ${sr}`,
      bpmNoteOk: 'Темп стабільний.',
      bpmNoteDrift: d => `Темп «плаває» (~${d} BPM між початком і кінцем): ближче до кінця звук може розходитись із сіткою.`,
      bpmNoteLow: 'Невисока впевненість — перевір клік і за потреби натисни ÷2 / ×2.',
      keyNote: (rel, conf) => `${rel} — паралельна · ${conf}`,
      confHigh: 'висока впевненість', confMid: 'середня впевненість', confLow: 'низька впевненість',
      barsNote: d => `Перший такт починається на ${d} с.`,
      cycle: n => n === 1 ? 'цикл: 1 такт' : `цикл: ${n} такти`,
      chordLoop: n => n === 1 ? 'цикл: 1 такт' : `цикл: ${n} такти`,
      noDrums: 'Стабільного ударного патерну не знайдено.',
      noChords: 'Акорди не визначились.',
      rowKick: 'Kick', rowSnare: 'Snare', rowHihat: 'Hi-hat', rowOhat: 'Open hat',
      hits: n => `${n} уд.`,
      barLabel: 'такт', sending: 'Створюю проєкт…'
    },
    en: {
      title: 'Track analysis', badge: 'Local, offline', menu: '← Menu', toStudio: 'Studio →',
      heroTitle: 'Backing track → studio project',
      heroLead: 'Load a finished backing track (e.g. from Suno). The app detects tempo, key, chords and the drum pattern and lays them out in the studio bar by bar — a starting point you then refine by hand.',
      dropTitle: 'Drop an audio file here', dropSub: 'or click to choose · mp3, wav, ogg, m4a, flac',
      expectTitle: 'What to expect',
      expect1: '<b>Reliable:</b> tempo, bar grid, key.',
      expect2: '<b>Good:</b> drums (kick / snare / hi-hat) and chords per bar.',
      expect3: '<b>Not recognised:</b> melody, vocals, exact timbres. The original sound cannot be reproduced — you get a similar arrangement from our instruments.',
      expect4: 'Sharp bass notes are sometimes read as kicks — switch off or edit extra hits before creating the project.',
      another: 'Another file', statTempo: 'Tempo', statKey: 'Key', statBars: 'Bars',
      firstBar: 'first bar', altBpm: 'Alternatives:', shiftBack: 'First bar one beat earlier', shiftFwd: 'First bar one beat later',
      wfTitle: 'Grid on the track', play: 'Play', pause: 'Pause', clickOn: 'Metronome click',
      wfHint: 'Play with the click on: if it does not land on the beats, move the first bar (◀ ▶) or change the tempo.',
      drumTitle: 'Drums', drumHint: 'Click cells to toggle them. Switch off a row that looks wrong with its checkbox.',
      chordTitle: 'Chords', allBars: 'All bars',
      exportTitle: 'Create a studio project',
      optDrums: 'Drums → sequencer', optChords: 'Chords → piano roll',
      optOrig: 'Add the original as a separate track', optMute: 'Mute the original (to hear the arrangement)',
      sendBtn: 'Open in studio →', sendHint: 'Your current studio project is kept in “Projects” as a backup.',
      decoding: 'Decoding file…', stageOnsets: 'Analysing rhythm…', stageTempo: 'Finding tempo and grid…',
      stageChroma: 'Analysing harmony…', stageFinish: 'Putting results together…', stageResample: 'Preparing audio…',
      errRead: 'Could not read the file. Supported: mp3, wav, ogg, m4a, flac.',
      errShort: 'Track is too short to analyse (at least 8 seconds needed).',
      errTempo: 'Could not find a steady tempo in this file.',
      errGeneric: 'Analysis error: ', errSend: 'Could not hand over to the studio: ',
      subLine: (dur, sr) => `${dur} · ${sr}`,
      bpmNoteOk: 'Tempo is steady.',
      bpmNoteDrift: d => `Tempo drifts (~${d} BPM between start and end): towards the end the audio may slip off the grid.`,
      bpmNoteLow: 'Low confidence — check the click and use ÷2 / ×2 if needed.',
      keyNote: (rel, conf) => `${rel} — relative · ${conf}`,
      confHigh: 'high confidence', confMid: 'medium confidence', confLow: 'low confidence',
      barsNote: d => `First bar starts at ${d} s.`,
      cycle: n => `loop: ${n} bar${n > 1 ? 's' : ''}`,
      chordLoop: n => `loop: ${n} bar${n > 1 ? 's' : ''}`,
      noDrums: 'No stable drum pattern found.',
      noChords: 'No chords detected.',
      rowKick: 'Kick', rowSnare: 'Snare', rowHihat: 'Hi-hat', rowOhat: 'Open hat',
      hits: n => `${n} hits`,
      barLabel: 'bar', sending: 'Creating project…'
    }
  };
  let lang = 'uk';
  try { lang = localStorage.getItem('lang') === 'en' ? 'en' : 'uk'; } catch (e) {}
  const t = (k, ...a) => { const v = I18N[lang][k]; return typeof v === 'function' ? v(...a) : v; };

  function applyStaticI18n() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = I18N[lang][el.dataset.i18n] || el.innerHTML; });
    document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = I18N[lang][el.dataset.i18nTitle] || el.title; });
    document.querySelectorAll('.lang-toggle').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    document.title = 'InkBeat — ' + t('title');
  }

  // ------------------------------------------------------------ state ----
  const S = {
    ctx: null, audioBuffer: null, A: null, G: null, D: null, C: null,
    baseName: '', bpm: 120, shift: 0,
    pattern: null, rowOn: { kick: true, snare: true, hihat: true, ohat: true },
    pxPerSec: 40, peaks: null, peaksPx: 0,
    playing: false, playStartCtx: 0, playStartPos: 0, src: null, clickTimer: null, nextClick: 0, raf: 0
  };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function show(id) {
    ['an-intro', 'an-working', 'an-result'].forEach(x => { $(x).hidden = x !== id; });
  }
  function showError(msg) { const e = $('an-error'); e.textContent = msg; e.hidden = !msg; }

  // ---------------------------------------------------------- loading ----
  async function handleFile(file) {
    if (!file) return;
    showError('');
    stopPlayback();
    S.baseName = file.name.replace(/\.[^.]+$/, '');
    $('an-working-name').textContent = file.name;
    show('an-working');
    setProgress(t('decoding'), 0.02);

    try {
      if (!S.ctx) S.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buf = await file.arrayBuffer();
      let audio;
      try { audio = await S.ctx.decodeAudioData(buf.slice(0)); }
      catch (e) { throw Object.assign(new Error('read'), { code: 'read' }); }
      S.audioBuffer = audio;

      const stageMap = { resample: [t('stageResample'), 0.05, 0.12], onsets: [t('stageOnsets'), 0.12, 0.55],
        tempo: [t('stageTempo'), 0.55, 0.62], chroma: [t('stageChroma'), 0.62, 0.96], done: [t('stageFinish'), 0.96, 1] };
      const A = await AN.analyzeBuffer(audio, (stage, p) => {
        const m = stageMap[stage]; if (m) setProgress(m[0], m[1] + (m[2] - m[1]) * (p || 0));
      });
      S.A = A;
      S.bpm = A.tempo.bpm; S.shift = 0;
      S.peaks = null;
      recompute(true);
      $('an-result-name').textContent = file.name;
      $('an-result-sub').textContent = t('subLine', fmtTime(A.duration), Math.round(audio.sampleRate / 100) / 10 + ' kHz');
      show('an-result');
      requestAnimationFrame(drawWave);
    } catch (e) {
      console.error(e);
      let msg = t('errGeneric') + (e && e.message);
      if (e && e.code === 'read') msg = t('errRead');
      else if (e && e.message === 'short') msg = t('errShort');
      else if (e && e.message === 'no-tempo') msg = t('errTempo');
      showError(msg);
      show('an-intro');
    }
  }

  function setProgress(label, p) {
    $('an-stage').textContent = label;
    $('an-bar-fill').style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
  }

  // -------------------------------------------------------- recompute ----
  function recompute(initial) {
    const A = S.A;
    S.G = AN.grid(A, S.bpm, { shift: S.shift });
    S.D = AN.drums(A, S.G);
    // рядки, яких у звуку немає (напр., трек без ударних), одразу вимкнені
    if (initial && S.D.presence) S.rowOn = { kick: true, snare: !!S.D.presence.snare, hihat: !!S.D.presence.hihat, ohat: !!S.D.presence.ohat };
    S.C = AN.chords(A, S.G);
    S.pattern = S.D.pattern ? JSON.parse(JSON.stringify(S.D.pattern)) : null;
    renderStats();
    renderDrums();
    renderChords();
    drawWave();
  }

  function confLabel(v, hi, mid) { return v >= hi ? t('confHigh') : v >= mid ? t('confMid') : t('confLow'); }

  function renderStats() {
    const { A, G } = S;
    $('an-bpm').textContent = S.bpm.toFixed(1);
    const note = $('an-bpm-note');
    note.className = 'an-stat-note';
    if (A.tempo.drift > 0.15) { note.textContent = t('bpmNoteDrift', A.tempo.drift.toFixed(1)); note.classList.add('warn'); }
    else if (A.tempo.confidence < 0.35) { note.textContent = t('bpmNoteLow'); note.classList.add('warn'); }
    else note.textContent = t('bpmNoteOk');

    // альтернативні варіанти темпу (інші піки автокореляції), окрім майже збіжних із поточним
    const alts = $('an-bpm-alts');
    alts.innerHTML = '';
    // без майже збіжних із поточним і без октав (×2, ÷2) — для них є окремі кнопки
    const farFrom = (c, k) => Math.abs(c - S.bpm * k) / (S.bpm * k) > 0.03;
    const others = A.tempo.candidates.filter(c => farFrom(c, 1) && farFrom(c, 2) && farFrom(c, 0.5)).slice(0, 3);
    if (others.length) {
      const lab = document.createElement('span'); lab.className = 'an-stat-mini'; lab.textContent = t('altBpm');
      alts.appendChild(lab);
      others.forEach(c => {
        const b = document.createElement('button');
        b.className = 'an-chip'; b.textContent = c.toFixed(1);
        b.addEventListener('click', () => changeBpm(AN.refine(S.A, c, 0.02)));
        alts.appendChild(b);
      });
    }

    $('an-key').textContent = A.key.name;
    const kn = $('an-key-note');
    kn.textContent = t('keyNote', A.key.relativeName, confLabel(A.key.margin, 0.08, 0.04));
    kn.className = 'an-stat-note' + (A.key.margin < 0.04 ? ' warn' : '');

    $('an-bars').textContent = G.totalBars;
    $('an-bars-note').textContent = t('barsNote', G.d.toFixed(2));
  }

  // ------------------------------------------------------------ drums ----
  const DRUM_ROWS = [['kick', 'rowKick'], ['snare', 'rowSnare'], ['hihat', 'rowHihat'], ['ohat', 'rowOhat']];

  function renderDrums() {
    const box = $('an-drums');
    box.innerHTML = '';
    if (!S.pattern) { box.innerHTML = `<p class="an-hint">${esc(t('noDrums'))}</p>`; $('an-drum-cycle').textContent = ''; return; }
    const L = S.D.bars * 16;
    $('an-drum-cycle').textContent = t('cycle', S.D.bars);
    DRUM_ROWS.forEach(([key, label]) => {
      const row = document.createElement('div');
      row.className = 'an-drum-row' + (S.rowOn[key] ? '' : ' off');
      const count = S.pattern[key].filter(Boolean).length;
      row.innerHTML = `<label class="an-drum-label"><input type="checkbox" ${S.rowOn[key] ? 'checked' : ''}/> ${esc(t(label))}<em>${esc(t('hits', count))}</em></label>`;
      row.querySelector('input').addEventListener('change', e => { S.rowOn[key] = e.target.checked; row.classList.toggle('off', !e.target.checked); });
      const steps = document.createElement('div');
      steps.className = 'an-steps';
      steps.style.gridTemplateColumns = `repeat(${L}, 1fr)`;
      for (let i = 0; i < L; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'an-step' + (S.pattern[key][i] ? ' on' : '') + (i % 4 === 0 ? ' beat' : '');
        b.addEventListener('click', () => {
          S.pattern[key][i] = !S.pattern[key][i];
          b.classList.toggle('on', S.pattern[key][i]);
          row.querySelector('em').textContent = t('hits', S.pattern[key].filter(Boolean).length);
        });
        steps.appendChild(b);
      }
      row.appendChild(steps);
      box.appendChild(row);
    });
  }

  // ----------------------------------------------------------- chords ----
  function renderChords() {
    const box = $('an-chords');
    box.innerHTML = '';
    const { loop, loopBars, perBar } = S.C;
    const valid = loop.some(Boolean);
    $('an-chord-cycle').textContent = valid ? t('chordLoop', loopBars) : '';
    if (!valid) { box.innerHTML = `<p class="an-hint">${esc(t('noChords'))}</p>`; $('an-chords-all').textContent = ''; return; }
    loop.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = 'an-chord';
      d.innerHTML = `${esc(c ? c.label : '—')}<small>${esc(t('barLabel'))} ${i + 1}</small>`;
      box.appendChild(d);
    });
    const parts = [];
    for (let i = 0; i < perBar.length; i += 4) {
      parts.push(perBar.slice(i, i + 4).map(c => (c.nc ? '—' : c.label)).join(' '));
    }
    $('an-chords-all').textContent = parts.join('  |  ');
  }

  // --------------------------------------------------------- waveform ----
  const WAVE_H = 150, LANE_H = 7;

  function computePeaks(px) {
    const x = S.A.mono, spp = x.length / px;
    const mins = new Float32Array(px), maxs = new Float32Array(px);
    for (let i = 0; i < px; i++) {
      const a = Math.floor(i * spp), b = Math.min(x.length, Math.floor((i + 1) * spp));
      let mn = 0, mx = 0;
      for (let j = a; j < b; j++) { const v = x[j]; if (v < mn) mn = v; if (v > mx) mx = v; }
      mins[i] = mn; maxs[i] = mx;
    }
    return { mins, maxs };
  }

  function drawWave() {
    if (!S.A || $('an-result').hidden) return;
    const A = S.A, G = S.G, pps = S.pxPerSec;
    const scroll = $('an-wave-scroll');
    const cssW = Math.max(scroll.clientWidth, Math.ceil(A.duration * pps));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = $('an-wave');
    cv.width = Math.floor(cssW * dpr); cv.height = Math.floor(WAVE_H * dpr);
    cv.style.width = cssW + 'px'; cv.style.height = WAVE_H + 'px';
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cssW, WAVE_H);

    const wavePx = Math.ceil(A.duration * pps);
    if (!S.peaks || S.peaksPx !== wavePx) { S.peaks = computePeaks(wavePx); S.peaksPx = wavePx; }
    const mid = (WAVE_H - 3 * LANE_H - 6) / 2 + 14;
    const amp = (WAVE_H - 3 * LANE_H - 28) / 2;
    g.fillStyle = 'rgba(141,132,196,.75)';
    for (let i = 0; i < wavePx; i++) {
      const y1 = mid - S.peaks.maxs[i] * amp * 1.6, y2 = mid - S.peaks.mins[i] * amp * 1.6;
      g.fillRect(i, y1, 1, Math.max(1, y2 - y1));
    }

    // сітка: долі та такти
    const beatPx = G.beatSec * pps;
    for (let k = 0, tt = G.d; tt < A.duration; k++, tt = G.d + k * G.beatSec) {
      if (tt < 0) continue;
      const isBar = k % 4 === 0, x = Math.round(tt * pps) + 0.5;
      if (!isBar && beatPx < 14) continue;
      g.strokeStyle = isBar ? 'rgba(184,69,44,.9)' : 'rgba(255,255,255,.12)';
      g.lineWidth = isBar ? 1.2 : 1;
      g.beginPath(); g.moveTo(x, isBar ? 0 : 12); g.lineTo(x, WAVE_H - 3 * LANE_H - 4); g.stroke();
    }
    g.font = '10px "JetBrains Mono", monospace';
    g.fillStyle = 'rgba(255,255,255,.55)';
    const barPx = G.barSec * pps, every = barPx >= 46 ? 1 : barPx >= 23 ? 2 : barPx >= 12 ? 4 : 8;
    for (let b = 0; b < G.totalBars; b += every) {
      const x = (G.d + b * G.barSec) * pps;
      if (x >= 0) g.fillText(String(b + 1), x + 3, 10);
    }

    // знайдені удари по всьому треку (для візуальної перевірки)
    const lanes = [['kick', '#B8452C'], ['snare', '#8D84C4'], ['hat', '#d8d2c6']];
    const H = S.D.hits, stepSec = G.beatSec / 4;
    lanes.forEach(([lane, color], li) => {
      const y = WAVE_H - (3 - li) * LANE_H - 2;
      g.fillStyle = color;
      const n = S.D.stepsTotal;
      for (let i = 0; i < n; i++) {
        const on = lane === 'hat' ? (H.hihat[i] || H.ohat[i]) : H[lane][i];
        if (on) g.fillRect(Math.round((G.d + i * stepSec) * pps) - 1, y, 2, LANE_H - 2);
      }
    });
  }

  // --------------------------------------------------------- playback ----
  function curPos() {
    if (!S.playing) return S.playStartPos;
    return S.playStartPos + (S.ctx.currentTime - S.playStartCtx);
  }

  function startPlayback(from) {
    if (!S.audioBuffer) return;
    stopPlayback(true);
    if (S.ctx.state === 'suspended') S.ctx.resume();
    const src = S.ctx.createBufferSource();
    src.buffer = S.audioBuffer; src.connect(S.ctx.destination);
    S.playStartPos = Math.max(0, Math.min(S.audioBuffer.duration - 0.05, from));
    S.playStartCtx = S.ctx.currentTime + 0.05;
    src.start(S.playStartCtx, S.playStartPos);
    src.onended = () => { if (S.src === src && S.playing) stopPlayback(); };
    S.src = src; S.playing = true;
    S.nextClick = Math.max(0, Math.ceil((S.playStartPos - S.G.d) / S.G.beatSec - 1e-6));
    S.clickTimer = setInterval(scheduleClicks, 100);
    scheduleClicks();
    $('an-play').innerHTML = `⏸ <span>${esc(t('pause'))}</span>`;
    $('an-playhead').style.display = 'block';
    S.raf = requestAnimationFrame(tickPlayhead);
  }

  function stopPlayback(keepPos) {
    if (S.playing && !keepPos) S.playStartPos = Math.min(S.audioBuffer.duration, curPos());
    S.playing = false;
    if (S.src) { try { S.src.onended = null; S.src.stop(); } catch (e) {} S.src = null; }
    clearInterval(S.clickTimer); S.clickTimer = null;
    cancelAnimationFrame(S.raf);
    const btn = $('an-play');
    if (btn) btn.innerHTML = `▶ <span>${esc(t('play'))}</span>`;
  }

  function scheduleClicks() {
    if (!S.playing || !$('an-click').checked) { if (S.playing) S.nextClick = Math.ceil((curPos() - S.G.d) / S.G.beatSec); return; }
    const ahead = S.ctx.currentTime + 0.3;
    for (;;) {
      const audioT = S.G.d + S.nextClick * S.G.beatSec;
      const when = S.playStartCtx + (audioT - S.playStartPos);
      if (when > ahead) break;
      if (when >= S.ctx.currentTime - 0.01 && audioT >= 0) {
        const accent = ((S.nextClick % 4) + 4) % 4 === 0;
        const o = S.ctx.createOscillator(), gn = S.ctx.createGain();
        o.frequency.value = accent ? 1760 : 1100;
        gn.gain.setValueAtTime(accent ? 0.5 : 0.3, when);
        gn.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
        o.connect(gn); gn.connect(S.ctx.destination);
        o.start(when); o.stop(when + 0.06);
      }
      S.nextClick++;
    }
  }

  function tickPlayhead() {
    if (!S.playing) return;
    const x = curPos() * S.pxPerSec;
    const ph = $('an-playhead'), sc = $('an-wave-scroll');
    ph.style.left = x + 'px';
    if (x < sc.scrollLeft + 20 || x > sc.scrollLeft + sc.clientWidth - 60) sc.scrollLeft = Math.max(0, x - 80);
    S.raf = requestAnimationFrame(tickPlayhead);
  }

  // ------------------------------------------------------------- send ----
  async function send() {
    const btn = $('an-send'), err = $('an-send-error');
    err.hidden = true;
    btn.disabled = true;
    btn.firstElementChild.textContent = t('sending');
    try {
      let instrumentId = null;
      try {
        const lib = await (await fetch('/api/library')).json();
        if ((lib.instruments || []).some(p => p.id === 'analog-strings')) instrumentId = 'analog-strings';
      } catch (e) { /* бібліотеки немає — студія використає вбудований pad */ }

      const drums = S.pattern ? { pattern: S.pattern, bars: S.D.bars } : null;
      await HO.sendToStudio({
        baseName: S.baseName, audioBuffer: S.audioBuffer, G: S.G, key: S.A.key,
        drums, chords: S.C,
        options: {
          drums: $('an-opt-drums').checked, chords: $('an-opt-chords').checked,
          keepOriginal: $('an-opt-orig').checked, muteOriginal: $('an-opt-mute').checked,
          rows: S.rowOn, instrumentId
        }
      });
      stopPlayback();
      location.href = '../studio/index.html';
    } catch (e) {
      console.error(e);
      err.textContent = t('errSend') + (e && e.message);
      err.hidden = false;
      btn.disabled = false;
      btn.firstElementChild.textContent = t('sendBtn');
    }
  }

  // ------------------------------------------------------------- wire ----
  function changeBpm(v) {
    S.bpm = Math.max(40, Math.min(240, v));
    stopPlayback();
    recompute();
  }

  function init() {
    applyStaticI18n();
    document.querySelectorAll('.lang-toggle').forEach(b => b.addEventListener('click', () => {
      lang = b.dataset.lang;
      try { localStorage.setItem('lang', lang); } catch (e) {}
      applyStaticI18n();
      if (S.A) { renderStats(); renderDrums(); renderChords(); $('an-play').innerHTML = `${S.playing ? '⏸' : '▶'} <span>${esc(t(S.playing ? 'pause' : 'play'))}</span>`; }
    }));

    const drop = $('an-drop'), input = $('an-file');
    input.addEventListener('change', () => { handleFile(input.files[0]); input.value = ''; });
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));
    // перетягування будь-де на сторінці в початковому стані
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => { e.preventDefault(); if (!$('an-intro').hidden && e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });

    $('an-reset').addEventListener('click', () => { stopPlayback(); showError(''); show('an-intro'); });
    $('an-bpm-half').addEventListener('click', () => changeBpm(AN.refine(S.A, S.bpm / 2, 0.01)));
    $('an-bpm-double').addEventListener('click', () => changeBpm(AN.refine(S.A, S.bpm * 2, 0.01)));
    $('an-bpm-dn').addEventListener('click', () => changeBpm(+(S.bpm - 0.1).toFixed(3)));
    $('an-bpm-up').addEventListener('click', () => changeBpm(+(S.bpm + 0.1).toFixed(3)));
    $('an-shift-dn').addEventListener('click', () => { S.shift = (S.shift + 3) % 4; stopPlayback(); recompute(); });
    $('an-shift-up').addEventListener('click', () => { S.shift = (S.shift + 1) % 4; stopPlayback(); recompute(); });

    $('an-play').addEventListener('click', () => { if (S.playing) stopPlayback(); else startPlayback(S.playStartPos || 0); });
    $('an-zoom-in').addEventListener('click', () => { S.pxPerSec = Math.min(160, S.pxPerSec * 1.5); drawWave(); });
    $('an-zoom-out').addEventListener('click', () => { S.pxPerSec = Math.max(6, S.pxPerSec / 1.5); drawWave(); });
    $('an-wave').addEventListener('click', e => {
      const r = $('an-wave').getBoundingClientRect();
      const pos = (e.clientX - r.left) / S.pxPerSec;
      if (S.playing) startPlayback(pos);
      else { S.playStartPos = pos; $('an-playhead').style.display = 'block'; $('an-playhead').style.left = (pos * S.pxPerSec) + 'px'; }
    });
    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && !$('an-result').hidden && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName)) {
        e.preventDefault(); $('an-play').click();
      }
    });
    window.addEventListener('resize', () => { if (S.A) drawWave(); });
    $('an-send').addEventListener('click', send);
  }

  document.addEventListener('DOMContentLoaded', init);
  window.__anState = S;   // для налагодження/тестів
})();
