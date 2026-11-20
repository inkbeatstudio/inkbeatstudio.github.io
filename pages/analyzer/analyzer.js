(function () {
  'use strict';

  const AN = window.InkBeatAnalyzer;
  const HO = window.InkBeatHandoff;
  const $ = id => document.getElementById(id);

  const I18N = {
    uk: {
      title: 'Аналіз треку', badge: 'Локально, без інтернету', menu: '← Інструменти', toStudio: 'Студія →',
      heroTitle: 'Мінус → проєкт у студії',
      heroLead: 'Завантаж готовий мінус (наприклад, зі Suno). Програма визначить темп, тональність, акорди та ударний патерн і розкладе їх у студії по тактах — як заготовку, яку далі доводиш руками.',
      dropTitle: 'Перетягни аудіофайл сюди', dropSub: 'або натисни, щоб обрати · mp3, wav, ogg, m4a, flac',
      expectTitle: 'Чого очікувати від аналізу',
      expect1: '<b>Надійно:</b> темп, сітка тактів, тональність.',
      expect2: '<b>Добре:</b> ударні (kick, snare, hi-hat, clap, tom), акорди по тактах, ритм гітари, бас-лінія.',
      expect3: '<b>Приблизно:</b> лід-мелодія (лише якщо повторюється). <b>Не розпізнається:</b> вокал, точні тембри. Звук оригіналу відтворити неможливо — це схожа аранжировка з наших інструментів.',
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
      decoding: 'Декодування файлу…', stageOnsets: 'Аналіз ритму…', stageTempo: 'Пошук темпу й сітки…',
      stageSeparate: 'Розділення на ударні та гармонію…', stageTranscribe: 'Розпізнавання нот моделлю…', errModel: 'Модель нот не завантажилась — показано швидкий результат.', stageChroma: 'Аналіз гармонії…', stageFinish: 'Збираю результат…', stageResample: 'Підготовка звуку…',
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
      rowKick: 'Kick', rowSnare: 'Snare', rowHihat: 'Hi-hat', rowOhat: 'Open hat', rowClap: 'Clap', rowTom: 'Tom',
      modeLabel: 'Режим аналізу', modeFast: 'Швидкий — без моделей, офлайн', modeAccurate: 'Точний — модель нот (довше, офлайн)', modeMax: 'Максимум — окремі доріжки (стеми)', maxHint: 'Вибери одразу всі доріжки (ударні, бас, вокал, гітара, клавіші…). Мінус не потрібен — він збереться з доріжок.', optStems: 'Кожна доріжка окремою доріжкою в студії', stemsAuto: 'Мелодія не повторюється по тактах — показано відрізок треку. Змінити можна в блоці вище.', stemsTrackName: 'Доріжки', decodingStem: n => `Читаю доріжки… ${n}`,
      srcTitle: 'Звідки брати бас, гітару й лід',
      srcLoop: 'Повторюваний цикл (такти згортаються в 1, 2 або 4)', srcWindow: 'Відрізок треку як є (до 16 тактів, без згортання)',
      winFrom: 'від такту', winLen: 'довжина', winAuto: 'Підібрати автоматично',
      srcHint: 'Цикл підходить для повторюваних партій. «Відрізок» переносить ноти такими, як вони звучать у вибраних тактах, тому підходить для мелодій і партій, що не повторюються.',
      bassTitle: 'Бас', compTitle: 'Гітара / ритм акордів', leadTitle: 'Лід-мелодія (експериментально)',
      layerTag: (bars, n, c) => `цикл ${bars} такт(и) · ${n} нот · збіг ${c}%`,
      winTag: (bars, n) => `відрізок ${bars} тактів · ${n} нот`,
      winCompTag: (bars, per, style) => `відрізок ${bars} тактів · ${per} ударів/такт · ${style}`,
      compTag: (bars, per, style) => `цикл ${bars} такт(и) · ${per} ударів/такт · ${style}`,
      styleRhythm: 'ритмічний', stylePad: 'довгі акорди',
      stemsTitle: 'Окремі доріжки (стеми)', stemsHint: 'Якщо в тебе є розділені доріжки зі Suno — завантаж їх: бас, ударні, мелодія й акорди аналізуватимуться окремо, і результат буде набагато точнішим. Роль визначається за назвою файлу, її можна змінити.', stemsPick: 'Вибрати доріжки', stemsRun: 'Проаналізувати доріжки', stemsClear: 'Прибрати доріжки', stemsBusy: 'Аналіз доріжок…', stemsDone: n => `Готово: використано доріжок — ${n}. Шари нижче оновлено.`, stemsNone: 'Жодна доріжка не підійшла (замало звуку або роль «ігнорувати»).', roleDrums: 'Ударні', roleBass: 'Бас', roleVocals: 'Вокал → лід', roleLead: 'Лід', roleHarmony: 'Гітара / клавіші', roleIgnore: 'Ігнорувати',
      editHint: 'Клацни по малюнку: по ноті — видалити, по порожньому — додати.', editReset: 'Скинути правки',
      bassHint: s => `Перші ноти: ${s}. Висоту знайдено автоматично; у студії бас лежить у шарі «Бас».`,
      noBass: 'Стабільної бас-лінії не знайдено (або в треку немає баса).',
      compHint: 'Моменти, коли звучить гітара/клавіші; у студії акорди зіграються саме цим ритмом.',
      noComp: 'Ритм акордів не визначився — акорди триматимуться весь такт.',
      leadHint: 'Мелодія повторюється по тактах; у студії лежить у шарі «Лід». Перевір на слух.',
      leadWeak: 'Мелодія майже не повторюється — результат може бути неточним, за замовчуванням вимкнено.',
      noLead: 'Повторюваної мелодії не знайдено (вокал/соло без чіткого циклу не переносяться).',
      optBass: 'Бас → шар «Бас»', optComp: 'Ритм гітари/акордів (інакше акорд тримається весь такт)', optLead: 'Лід-мелодія → шар «Лід» (експериментально)',
      hits: n => `${n} уд.`,
      barLabel: 'такт', sending: 'Створюю проєкт…'
    },
    en: {
      title: 'Track analysis', badge: 'Local, offline', menu: '← Tools', toStudio: 'Studio →',
      heroTitle: 'Backing track → studio project',
      heroLead: 'Load a finished backing track (e.g. from Suno). The app detects tempo, key, chords and the drum pattern and lays them out in the studio bar by bar — a starting point you then refine by hand.',
      dropTitle: 'Drop an audio file here', dropSub: 'or click to choose · mp3, wav, ogg, m4a, flac',
      expectTitle: 'What to expect',
      expect1: '<b>Reliable:</b> tempo, bar grid, key.',
      expect2: '<b>Good:</b> drums (kick, snare, hi-hat, clap, tom), chords per bar, guitar rhythm, bass line.',
      expect3: '<b>Approximate:</b> lead melody (only if it repeats). <b>Not recognised:</b> vocals, exact timbres. The original sound cannot be reproduced — you get a similar arrangement from our instruments.',
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
      stageSeparate: 'Separating drums from harmony…', stageTranscribe: 'Transcribing notes with the model…', errModel: 'The note model failed to load — showing the fast result.', stageChroma: 'Analysing harmony…', stageFinish: 'Putting results together…', stageResample: 'Preparing audio…',
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
      rowKick: 'Kick', rowSnare: 'Snare', rowHihat: 'Hi-hat', rowOhat: 'Open hat', rowClap: 'Clap', rowTom: 'Tom',
      modeLabel: 'Analysis mode', modeFast: 'Fast — no models, offline', modeAccurate: 'Accurate — note model (slower, offline)', modeMax: 'Maximum — separate tracks (stems)', maxHint: 'Choose all stems at once (drums, bass, vocals, guitar, keys…). No mix needed — it is built from the stems.', optStems: 'Each stem as its own track in the studio', stemsAuto: 'The melody does not repeat bar by bar — showing a segment of the track. You can change it in the block above.', stemsTrackName: 'Stems', decodingStem: n => `Reading stems… ${n}`,
      srcTitle: 'Where to take bass, guitar and lead from',
      srcLoop: 'Repeating loop (bars are folded into 1, 2 or 4)', srcWindow: 'Track section as is (up to 16 bars, no folding)',
      winFrom: 'from bar', winLen: 'length', winAuto: 'Pick automatically',
      srcHint: 'The loop suits repeating parts. “Section” transfers the notes exactly as they sound in the chosen bars, so it suits melodies and parts that do not repeat.',
      bassTitle: 'Bass', compTitle: 'Guitar / chord rhythm', leadTitle: 'Lead melody (experimental)',
      layerTag: (bars, n, c) => `${bars}-bar loop · ${n} notes · match ${c}%`,
      winTag: (bars, n) => `${bars}-bar section · ${n} notes`,
      winCompTag: (bars, per, style) => `${bars}-bar section · ${per} hits/bar · ${style}`,
      compTag: (bars, per, style) => `${bars}-bar loop · ${per} hits/bar · ${style}`,
      styleRhythm: 'rhythmic', stylePad: 'sustained chords',
      stemsTitle: 'Separate tracks (stems)', stemsHint: 'If you have split stems from Suno, upload them: bass, drums, melody and chords are analysed separately, which is much more accurate. The role is guessed from the file name and can be changed.', stemsPick: 'Choose stems', stemsRun: 'Analyse stems', stemsClear: 'Remove stems', stemsBusy: 'Analysing stems…', stemsDone: n => `Done: ${n} stem(s) used. Layers below were updated.`, stemsNone: 'No stem was usable (too short or set to ignore).', roleDrums: 'Drums', roleBass: 'Bass', roleVocals: 'Vocals → lead', roleLead: 'Lead', roleHarmony: 'Guitar / keys', roleIgnore: 'Ignore',
      editHint: 'Click the roll: on a note to delete it, on empty space to add one.', editReset: 'Undo edits',
      bassHint: s => `First notes: ${s}. Pitch is detected automatically; in the studio the bass goes to the “Bass” layer.`,
      noBass: 'No stable bass line found (or the track has no bass).',
      compHint: 'Moments when the guitar/keys play; in the studio the chords follow exactly this rhythm.',
      noComp: 'Chord rhythm not detected — chords will be held for the whole bar.',
      leadHint: 'The melody repeats bar by bar; in the studio it goes to the “Lead” layer. Check by ear.',
      leadWeak: 'The melody hardly repeats — the result may be inaccurate, so it is off by default.',
      noLead: 'No repeating melody found (vocals/solos without a clear loop are not transferred).',
      optBass: 'Bass → “Bass” layer', optComp: 'Guitar/chord rhythm (otherwise a chord is held for the whole bar)', optLead: 'Lead melody → “Lead” layer (experimental)',
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

  const S = {
    ctx: null, audioBuffer: null, A: null, G: null, D: null, C: null,
    baseName: '', bpm: 120, shift: 0,
    srcMode: 'loop', winStart: 0, winLen: 8, refreshSrc: null, mode: 'fast', notes: null, ed: {}, edKey: '', stemFiles: [], stemA: null,
    pattern: null, rowOn: { kick: true, snare: true, hihat: true, ohat: true, clap: true, tom: true },
    pxPerSec: 40, peaks: null, peaksPx: 0,
    playing: false, playStartCtx: 0, playStartPos: 0, src: null, clickTimer: null, nextClick: 0, raf: 0
  };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function show(id) {
    ['an-intro', 'an-working', 'an-result'].forEach(x => { $(x).hidden = x !== id; });
  }
  function showError(msg) { const e = $('an-error'); e.textContent = msg; e.hidden = !msg; }

  async function handleFiles(list) {
    const files = Array.from(list || []);
    if (!files.length) return;
    if (S.mode === 'max' || files.length > 1) return handleStemSet(files);
    return handleFile(files[0]);
  }

  function lightBuffer(audio) {
    const sr = 32000;
    const n = Math.ceil(audio.length * sr / audio.sampleRate);
    const oc = new OfflineAudioContext(1, n, sr);
    const src = oc.createBufferSource();
    src.buffer = audio; src.connect(oc.destination); src.start();
    return oc.startRendering();
  }

  function stemLabel(name) {
    return name.replace(/\.[^.]+$/, '').replace(/^\d+[_\-\s]*/, '').replace(/[_]+/g, ' ').trim() || name;
  }

  function autoWindowIfWeak() {
    const L = S.L;
    if (!L) return;
    const weak = (L.lead.events.length >= 8 && !L.lead.present) || (L.bass.events.length >= 8 && L.bass.consistency < 0.4);
    if (!weak) return;
    S.srcMode = 'window'; S.winTouched = false;
    S.winStart = AN.suggestWindow(L, S.G, S.winLen);
    document.querySelectorAll('input[name="an-src"]').forEach(r => { r.checked = r.value === 'window'; });
    if (S.refreshSrc) S.refreshSrc();
    $('an-stem-status').textContent = ($('an-stem-status').textContent + ' ' + t('stemsAuto')).trim();
  }

  async function handleStemSet(files) {
    showError('');
    stopPlayback();
    S.baseName = t('stemsTrackName');
    $('an-working-name').textContent = files.length + ' × ' + t('stemsTrackName');
    show('an-working');
    setProgress(t('decoding'), 0.02);
    try {
      if (!S.ctx) S.ctx = new (window.AudioContext || window.webkitAudioContext)();
      files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const items = [];
      for (let i = 0; i < files.length; i++) {
        setProgress(t('decodingStem', (i + 1) + '/' + files.length), 0.02 + 0.2 * i / files.length);
        const file = files[i];
        const buf = await file.arrayBuffer();
        let audio;
        try { audio = await S.ctx.decodeAudioData(buf); }
        catch (e) { throw Object.assign(new Error('read'), { code: 'read' }); }
        const clean = /clean/i.test(file.name);
        items.push({ file, audio, role: clean ? 'ignore' : AN.stemRole(file.name), skip: clean });
      }
      const used = items.filter(f => !f.skip);
      const n = Math.max.apply(null, used.map(f => f.audio.length));
      const mix = S.ctx.createBuffer(2, n, used[0].audio.sampleRate);
      used.forEach(f => {
        for (let c = 0; c < 2; c++) {
          const src = f.audio.getChannelData(Math.min(c, f.audio.numberOfChannels - 1)), dst = mix.getChannelData(c);
          for (let i = 0; i < src.length; i++) dst[i] += src[i];
        }
      });
      S.audioBuffer = mix;
      S.stemFiles = items;
      S.stemA = null; S.notes = null;
      const stageMap = { resample: [t('stageResample'), 0.22, 0.28], onsets: [t('stageOnsets'), 0.28, 0.42], tempo: [t('stageTempo'), 0.42, 0.45], chroma: [t('stageChroma'), 0.45, 0.55], separate: [t('stageSeparate'), 0.55, 0.62], done: [t('stageFinish'), 0.62, 0.64] };
      const mixA = await AN.analyzeBuffer(mix, (stage, p) => { const m = stageMap[stage]; if (m) setProgress(m[0], m[1] + (m[2] - m[1]) * (p || 0)); });
      let A = mixA;
      const dr = used.find(f => f.role === 'drums');
      if (dr) {
        setProgress(t('stageTempo'), 0.65);
        const dA = await AN.analyzeBuffer(dr.audio);
        A = Object.assign({}, mixA, { tempo: Object.assign({}, dA.tempo), bt: dA.bt, on: dA.on, nrm: dA.nrm, onP: dA.onP, nrmP: dA.nrmP });
        A.tempo.bpm = AN.fineTempo(dA, dA.tempo.bpm);
      }
      S.A = A;
      S.bpm = A.tempo.bpm; S.shift = 0; S.peaks = null;
      setProgress(t('stageSeparate'), 0.7);
      S.stemA = await analyzeStemGroups(p => setProgress(t('stageSeparate'), 0.7 + 0.28 * p));
      $('an-stem-status').textContent = '';
      recompute(true);
      autoWindowIfWeak();
      renderStemList();
      $('an-result-name').textContent = files.length + ' × ' + t('stemsTrackName');
      $('an-result-sub').textContent = t('subLine', fmtTime(A.duration), Math.round(mix.sampleRate / 100) / 10 + ' kHz');
      $('an-opt-stems').checked = true;
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

  async function analyzeStemGroups(progress) {
    const groups = {};
    for (const f of S.stemFiles) {
      if (f.role === 'ignore') continue;
      if (!f.mono) {
        const ch = [];
        for (let c = 0; c < f.audio.numberOfChannels; c++) ch.push(f.audio.getChannelData(c));
        f.mono = await AN.resampleToMono(ch, f.audio.sampleRate);
      }
      (groups[f.role] = groups[f.role] || []).push(f.mono);
    }
    const res = await AN.analyzeStems(groups, progress);
    return Object.keys(res).length ? res : null;
  }

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

      const stageMap = { resample: [t('stageResample'), 0.04, 0.1], onsets: [t('stageOnsets'), 0.1, 0.4],
        tempo: [t('stageTempo'), 0.4, 0.45], chroma: [t('stageChroma'), 0.45, 0.62], separate: [t('stageSeparate'), 0.62, 0.96], done: [t('stageFinish'), 0.96, 1] };
      const acc = S.mode === 'accurate';
      const sc = acc ? 0.4 : 1;
      const A = await AN.analyzeBuffer(audio, (stage, p) => {
        const m = stageMap[stage]; if (m) setProgress(m[0], (m[1] + (m[2] - m[1]) * (p || 0)) * sc);
      });
      S.A = A;
      S.notes = null;
      resetStems();
      S.stemFiles = [];
      if (acc) {
        try {
          setProgress(t('stageTranscribe'), 0.4);
          await loadScript('vendor/notes-engine.js');
          S.notes = await window.InkBeatNotes.transcribe(A.mono, 'model/model.json', p => setProgress(t('stageTranscribe'), 0.4 + 0.58 * (p || 0)));
        } catch (err) {
          console.error(err);
          S.notes = null;
          showError(t('errModel'));
        }
      }
      S.bpm = AN.fineTempo(A, A.tempo.bpm); S.shift = 0;
      S.peaks = null;
      recompute(true);
      autoWindowIfWeak();
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

  const ROLES = ['drums', 'bass', 'vocals', 'lead', 'harmony', 'ignore'];
  const roleKey = r => 'role' + r.charAt(0).toUpperCase() + r.slice(1);

  function resetStems() {
    S.stemFiles = []; S.stemA = null;
    if ($('an-stem-list')) { renderStemList(); $('an-stem-status').textContent = ''; }
  }

  function renderStemList() {
    const box = $('an-stem-list');
    box.innerHTML = '';
    S.stemFiles.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'an-stem-row';
      const nm = document.createElement('span');
      nm.textContent = f.file.name;
      const sel = document.createElement('select');
      ROLES.forEach(r => { const o = document.createElement('option'); o.value = r; o.textContent = t(roleKey(r)); if (r === f.role) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', () => { f.role = sel.value; });
      row.appendChild(nm); row.appendChild(sel);
      box.appendChild(row);
    });
    $('an-stem-run').hidden = !S.stemFiles.length;
    $('an-stem-clear').hidden = !S.stemFiles.length && !S.stemA;
    $('an-opt-stems-row').hidden = !S.stemFiles.some(f => f.audio);
  }

  async function runStems() {
    const st = $('an-stem-status');
    const run = $('an-stem-run');
    run.disabled = true;
    st.textContent = t('stemsBusy');
    try {
      for (const f of S.stemFiles) {
        if (!f.audio) f.audio = await S.ctx.decodeAudioData((await f.file.arrayBuffer()).slice(0));
      }
      const res = await analyzeStemGroups(p => { st.textContent = t('stemsBusy') + ' ' + Math.round(p * 100) + '%'; });
      if (!res) { st.textContent = t('stemsNone'); S.stemA = null; }
      else { S.stemA = res; stopPlayback(); recompute(true); st.textContent = t('stemsDone', Object.keys(res).length); autoWindowIfWeak(); }
    } catch (e) {
      console.error(e);
      st.textContent = t('errGeneric') + (e && e.message);
    }
    run.disabled = false;
    renderStemList();
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.InkBeatNotes) return res();
      const el = document.createElement('script');
      el.src = src; el.onload = () => res(); el.onerror = () => rej(new Error('script'));
      document.head.appendChild(el);
    });
  }

  function setProgress(label, p) {
    $('an-stage').textContent = label;
    $('an-bar-fill').style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
  }

  function recompute(initial) {
    const A = S.A;
    S.G = AN.grid(A, S.bpm, { shift: S.shift });
    S.ed = {};
    S.L = AN.analyzeLayers(A, S.G, { notes: S.notes, stems: S.stemA || undefined });
    S.D = S.L.drums;
    S.C = S.L.chords;
    S.pattern = S.D.pattern ? JSON.parse(JSON.stringify(S.D.pattern)) : null;
    if (initial && S.D.presence) {
      const cnt = k => (S.pattern && S.pattern[k] ? S.pattern[k].filter(Boolean).length : 0);
      S.rowOn = { kick: true, snare: !!S.D.presence.snare, hihat: !!S.D.presence.hihat, ohat: !!S.D.presence.ohat, clap: cnt('clap') >= 1, tom: cnt('tom') >= 1 };
    }
    renderStats();
    renderDrums();
    renderChords();
    renderLayers();
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

    const alts = $('an-bpm-alts');
    alts.innerHTML = '';
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

  const DRUM_ROWS = [['kick', 'rowKick'], ['snare', 'rowSnare'], ['hihat', 'rowHihat'], ['ohat', 'rowOhat'], ['clap', 'rowClap'], ['tom', 'rowTom']];

  function renderDrums() {
    const box = $('an-drums');
    box.innerHTML = '';
    if (!S.pattern) { box.innerHTML = `<p class="an-hint">${esc(t('noDrums'))}</p>`; $('an-drum-cycle').textContent = ''; return; }
    const L = S.D.bars * 16;
    $('an-drum-cycle').textContent = t('cycle', S.D.bars);
    DRUM_ROWS.forEach(([key, label]) => {
      if (!S.pattern[key]) return;
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

  function renderChords() {
    const box = $('an-chords');
    box.innerHTML = '';
    const { loop, loopBars, perBar } = currentView().chords;
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

  const NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = m => NN[m % 12] + (Math.floor(m / 12) - 1);

  function drawMini(cv, notes, bars, ticks) {
    const w = Math.max(300, cv.clientWidth || 600), h = 96;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
    cv.style.height = h + 'px';
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const L = bars * 16;
    for (let i = 0; i <= L; i++) {
      g.fillStyle = i % 16 === 0 ? 'rgba(255,255,255,.28)' : i % 4 === 0 ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.04)';
      g.fillRect(Math.round(i / L * w), 0, 1, h);
    }
    if (!notes.length) { cv._m = null; return; }
    let lo = 127, hi = 0;
    notes.forEach(n => { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); });
    lo -= 1; hi += 1;
    if (hi - lo < 8) { const c = (hi + lo) / 2; lo = Math.floor(c - 4); hi = Math.ceil(c + 4); }
    const rows = hi - lo + 1, rh = (h - 6) / rows;
    cv._m = { lo, hi, rh, L };
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#B8452C'); grad.addColorStop(1, '#8D84C4');
    g.fillStyle = grad;
    notes.forEach(n => {
      const x = n.s / L * w + 1, wd = Math.max(3, n.len / L * w - 2);
      if (ticks) g.fillRect(x, 6, Math.max(3, w / L - 2), h - 12);
      else g.fillRect(x, 3 + (hi - n.midi) * rh, wd, Math.max(2, rh - 1));
    });
  }

  function baseView() {
    if (S.srcMode === 'window' && S.L) {
      const maxStart = Math.max(0, S.G.totalBars - S.winLen);
      S.winStart = Math.max(0, Math.min(maxStart, S.winStart));
      return AN.windowLayers(S.L, S.G, S.winStart, S.winLen);
    }
    return { bass: S.L.bass, comp: S.L.comp, lead: S.L.lead, chords: S.C };
  }

  function currentView() {
    const v = baseView();
    const key = S.srcMode + ':' + S.winStart + ':' + S.winLen;
    if (key !== S.edKey) { S.edKey = key; S.ed = {}; }
    ['bass', 'lead'].forEach(k => {
      if (S.ed[k]) v[k] = Object.assign({}, v[k], { notes: S.ed[k], present: S.ed[k].length > 0 });
    });
    return v;
  }

  function editNote(layer, ev) {
    const cv = ev.currentTarget, m = cv._m;
    if (!m) return;
    const r = cv.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width, y = ev.clientY - r.top;
    const step = Math.floor(x * m.L);
    const midi = m.hi - Math.floor((y - 3) / m.rh);
    const cur = currentView()[layer];
    const list = (S.ed[layer] || cur.notes).map(n => Object.assign({}, n));
    const hit = list.findIndex(n => step >= n.s && step < n.s + n.len && Math.abs(n.midi - midi) <= 0);
    if (hit >= 0) list.splice(hit, 1);
    else {
      const next = list.filter(n => n.s > step).reduce((a, n) => Math.min(a, n.s), m.L);
      list.push({ s: step, len: Math.max(1, Math.min(2, next - step)), midi });
      list.sort((a, b) => a.s - b.s);
    }
    S.ed[layer] = list;
    renderLayers();
  }

  function renderLayers() {
    const L = currentView();
    const bass = L.bass, comp = L.comp, lead = L.lead;
    const setCard = (id, tag, notes, bars, ticks, hint) => {
      $('an-' + id + '-tag').textContent = tag;
      $('an-' + id + '-hint').textContent = hint;
      const cv = $('an-' + id + '-cv');
      cv.hidden = !notes.length && !S.ed[id];
      if (!cv.hidden) requestAnimationFrame(() => drawMini(cv, notes, bars, ticks));
    };
    const bassHas = bass.notes.length > 0;
    const win = S.srcMode === 'window';
    const tagFor = x => win ? t('winTag', x.bars, x.notes.length) : t('layerTag', x.bars, x.notes.length, Math.round(x.consistency * 100));
    setCard('bass', bassHas ? tagFor(bass) : '',
      bass.notes, bass.bars, false, bassHas ? t('bassHint', bass.notes.slice(0, 6).map(n => noteName(n.midi)).join(' ')) : t('noBass'));
    const compNotes = comp.steps.map(s => ({ s, len: 1, midi: 0 }));
    setCard('comp', compNotes.length ? t(win ? 'winCompTag' : 'compTag', comp.bars, comp.perBar.toFixed(1), comp.style === 'pluck' ? t('styleRhythm') : t('stylePad')) : '',
      compNotes, comp.bars, true, compNotes.length ? t('compHint') : t('noComp'));
    const leadHas = lead.notes.length > 0;
    setCard('lead', leadHas ? tagFor(lead) : '',
      lead.notes, lead.bars, false, leadHas ? (lead.present ? t('leadHint') : t('leadWeak')) : t('noLead'));
    ['bass', 'lead'].forEach(k => { const b = $('an-' + k + '-reset'); if (b) { b.hidden = !S.ed[k]; b.textContent = t('editReset'); } });
    $('an-opt-bass').checked = !!bass.present; $('an-opt-bass').disabled = !bassHas;
    $('an-opt-lead').checked = !!lead.present; $('an-opt-lead').disabled = !leadHas;
    $('an-opt-comp').disabled = !compNotes.length;
    $('an-opt-comp').checked = !!compNotes.length && comp.style === 'pluck';
  }

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

  async function send() {
    const btn = $('an-send'), err = $('an-send-error');
    err.hidden = true;
    btn.disabled = true;
    btn.firstElementChild.textContent = t('sending');
    try {
      let instrumentId = null;
      try {
        if (!/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) throw new Error('no library');
        const lib = await (await fetch('/api/library')).json();
        if ((lib.instruments || []).some(p => p.id === 'analog-strings')) instrumentId = 'analog-strings';
      } catch (e) { }

      const drums = S.pattern ? { pattern: S.pattern, bars: S.D.bars } : null;
      let stemTracks = null;
      if ($('an-opt-stems').checked && S.stemFiles.some(f => f.audio)) {
        stemTracks = [];
        for (const f of S.stemFiles) {
          if (!f.audio) continue;
          stemTracks.push({ name: stemLabel(f.file.name), buffer: await lightBuffer(f.audio), mute: !!f.skip });
        }
      }
      await HO.sendToStudio({
        baseName: S.baseName, audioBuffer: S.audioBuffer, G: S.G, key: S.A.key, stemTracks,
        drums, chords: currentView().chords, bass: currentView().bass, comp: currentView().comp, lead: currentView().lead,
        options: {
          drums: $('an-opt-drums').checked, chords: $('an-opt-chords').checked,
          keepOriginal: $('an-opt-orig').checked, muteOriginal: $('an-opt-mute').checked,
          rows: S.rowOn, instrumentId,
          bass: $('an-opt-bass').checked, comp: $('an-opt-comp').checked, lead: $('an-opt-lead').checked
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
    input.addEventListener('change', () => { const fl = Array.from(input.files); input.value = ''; handleFiles(fl); });
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => { e.preventDefault(); if (!$('an-intro').hidden && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

    $('an-reset').addEventListener('click', () => { stopPlayback(); showError(''); show('an-intro'); });
    $('an-bpm-half').addEventListener('click', () => changeBpm(AN.refine(S.A, S.bpm / 2, 0.01)));
    $('an-bpm-double').addEventListener('click', () => changeBpm(AN.refine(S.A, S.bpm * 2, 0.01)));
    $('an-bpm-dn').addEventListener('click', () => changeBpm(+(S.bpm - 0.1).toFixed(3)));
    $('an-bpm-up').addEventListener('click', () => changeBpm(+(S.bpm + 0.1).toFixed(3)));
    $('an-shift-dn').addEventListener('click', () => { S.shift = (S.shift + 3) % 4; stopPlayback(); recompute(); });
    $('an-shift-up').addEventListener('click', () => { S.shift = (S.shift + 1) % 4; stopPlayback(); recompute(); });

    $('an-mode').addEventListener('change', e => { S.mode = e.target.value; $('an-max-hint').hidden = S.mode !== 'max'; $('an-file').multiple = S.mode === 'max'; });

    ['bass', 'lead'].forEach(k => {
      const cv = $('an-' + k + '-cv');
      cv.style.cursor = 'pointer';
      cv.title = t('editHint');
      cv.addEventListener('click', e => editNote(k, e));
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'an-edit-reset'; b.hidden = true; b.id = 'an-' + k + '-reset';
      b.addEventListener('click', () => { delete S.ed[k]; renderLayers(); });
      cv.insertAdjacentElement('afterend', b);
    });

    $('an-stem-files').addEventListener('change', e => {
      S.stemFiles = Array.from(e.target.files).map(file => ({ file, role: /clean/i.test(file.name) ? 'ignore' : AN.stemRole(file.name), skip: /clean/i.test(file.name) }));
      e.target.value = '';
      $('an-stem-status').textContent = '';
      renderStemList();
    });
    $('an-stem-run').addEventListener('click', runStems);
    $('an-stem-clear').addEventListener('click', () => { const had = !!S.stemA; resetStems(); if (had) recompute(true); });

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
    const refreshSrc = () => {
      $('an-window').hidden = S.srcMode !== 'window';
      if (S.srcMode === 'window') $('an-win-start').value = S.winStart + 1;
      if (S.A) { renderChords(); renderLayers(); }
    };
    S.refreshSrc = refreshSrc;
    document.querySelectorAll('input[name="an-src"]').forEach(r => r.addEventListener('change', () => {
      if (!r.checked) return;
      S.srcMode = r.value;
      if (S.srcMode === 'window' && S.L && !S.winTouched) S.winStart = AN.suggestWindow(S.L, S.G, S.winLen);
      refreshSrc();
    }));
    $('an-win-start').addEventListener('change', e => { S.winTouched = true; S.winStart = Math.max(0, (parseInt(e.target.value, 10) || 1) - 1); refreshSrc(); });
    $('an-win-len').addEventListener('change', e => { S.winLen = parseInt(e.target.value, 10) || 8; S.winTouched = false; if (S.L) S.winStart = AN.suggestWindow(S.L, S.G, S.winLen); refreshSrc(); });
    $('an-win-auto').addEventListener('click', () => { S.winTouched = false; if (S.L) S.winStart = AN.suggestWindow(S.L, S.G, S.winLen); refreshSrc(); });
  }

  document.addEventListener('DOMContentLoaded', init);
  window.__anState = S;
})();
