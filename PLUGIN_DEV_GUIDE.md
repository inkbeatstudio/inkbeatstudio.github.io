# InkBeat Studio — Розробка плагінів

Студія підтримує два типи плагінів на чистому Web Audio API — без
збірки, без npm, без компіляції. Один плагін = одна тека з двома
файлами.

```
MyPlugin/
├── plugin.json   — маніфест (назва, параметри, опис)
└── main.js       — реалізація, реєструється через InkBeatPlugins.register(...)
```

Готові приклади лежать у `app/library-defaults/Instruments/` та
`app/library-defaults/Effects/` — найкращий спосіб почати це
скопіювати найближчий за духом плагін і змінити.

**У комплекті вже є 6 інструментів** (Warm Pluck, Deep Sub, Crystal
Bell, FM Bass, Analog Strings, Arp Pluck) **і 6 ефектів** (Tape Delay,
Bit Crusher, Stereo Chorus, Hall Reverb, Stereo Widener, Auto Wah) —
усі різні за складністю техніки (проста хвиля з фільтром, FM-синтез,
mid/side-обробка, згенерована імпульсна характеристика для реверба
тощо), тож серед них точно є приклад, близький до того, що ти хочеш
зробити.

## Куди встановлюються плагіни

- **З коду / вручну:** поклади теку прямо в
  `~/InkBeatStudio/Library/Instruments/<id>/` або `.../Effects/<id>/`.
- **З інтерфейсу:** кнопка «Бібліотека» → вкладка «Інструменти» або
  «Ефекти» → «Встановити плагін (.zip)». Архів повинен містити
  `plugin.json` і `main.js` (у корені або в одній підтеці).

Студія бачить нові/змінені плагіни після перезавантаження бібліотеки
(автоматично при відкритті вкладки «Бібліотека», або перезапуску
застосунку).

---

## 1. Плагін-інструмент (`"type": "instrument"`)

### plugin.json

```json
{
  "id": "my-synth",
  "name": "My Synth",
  "type": "instrument",
  "version": "1.0.0",
  "author": "Твоє ім'я",
  "description": "Короткий опис тембру.",
  "params": [
    { "id": "cutoff", "name": "Cutoff", "min": 200, "max": 8000, "default": 2000, "step": 10, "unit": "Hz" }
  ]
}
```

`params` — список параметрів, які потенційно можна виводити як
регулятори в UI (наразі використовуються як значення за замовчуванням;
повноцінний UI-рек для параметрів інструментів — у планах, дивись
розділ «Наступні кроки»).

### main.js

```js
InkBeatPlugins.register({
  id: 'my-synth',          // МАЄ збігатися з id у plugin.json
  type: 'instrument',
  name: 'My Synth',

  // Викликається один раз на кожну ноту з піано-рола.
  // ctx  — AudioContext
  // dest — AudioNode, куди підключити фінальний вихід голосу
  // note — { freq, time, duration, velocity (0..1), params }
  createVoice(ctx, dest, note) {
    const osc = ctx.createOscillator();
    osc.frequency.value = note.freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, note.time);
    gain.gain.linearRampToValueAtTime(note.velocity, note.time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, note.time + note.duration);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(note.time);
    osc.stop(note.time + note.duration + 0.05);

    // (опційно) повернути об'єкт з stop(), якщо потрібна дострокова зупинка
    return { stop(atTime) { osc.stop(atTime); } };
  }
});
```

Обраний інструмент з'являється в Piano Roll → селектор «Інструмент» під
позначкою 🧩.

---

## 2. Плагін-ефект (`"type": "effect"`)

### plugin.json

```json
{
  "id": "my-effect",
  "name": "My Effect",
  "type": "effect",
  "version": "1.0.0",
  "params": [
    { "id": "mix", "name": "Mix", "min": 0, "max": 1, "default": 0.5, "step": 0.01 }
  ]
}
```

### main.js

```js
InkBeatPlugins.register({
  id: 'my-effect',
  type: 'effect',
  name: 'My Effect',

  // Викликається один раз, коли ефект додається у ланцюг.
  // ctx           — AudioContext
  // initialParams — { paramId: value, ... }
  createNode(ctx, initialParams) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    input.connect(output); // базовий байпас — заміни на свою обробку

    return {
      input,   // AudioNode для підключення попереднього вузла
      output,  // AudioNode для підключення наступного вузла
      setParam(id, value) { /* реагуй на зміну параметра тут */ },
      dispose() { /* (опційно) зупинити осцилятори/таймери при видаленні */ }
    };
  }
});
```

Встановлені ефекти додаються на майстер-шину через «Бібліотека» →
«Ефекти» → «До майстер-шини» і йдуть послідовно в тому порядку, в
якому додані (порядок можна змінити, видаливши й додавши заново —
повноцінне drag-переупорядкування у планах).

---

## Формат ZIP для встановлення через інтерфейс

```
my-plugin.zip
├── plugin.json
└── main.js
```

(або все те саме всередині однієї підтеки — обидва варіанти
підтримуються).

---

## Наступні кроки (роадмап)

Поточна версія — **Phase 1**: робоча інфраструктура бібліотеки на
диску + реальний плагін-API + приклади. Природні напрямки розвитку:

1. **UI-рек параметрів** — авто-генеровані регулятори (knobs) для
   `params` кожного встановленого плагіна, з live-редагуванням і
   збереженням значень у проєкті (поле `state.pluginInstrumentParams`
   / `params` в `pluginFxChain` вже зберігаються — бракує лише UI).
2. **Per-track ефекти** — зараз плагіни-ефекти живуть на майстер-шині;
   можна розширити до окремого insert-рeку на кожній доріжці (потрібно
   продублювати `pluginFxIn/pluginFxOut` логіку в `buildTrackGraph`).
3. **AudioWorklet-плагіни** — для важчої DSP-обробки (замість
   `ScriptProcessorNode`/чистих Web Audio нод) — власний процесор,
   що виконується в audio-потоці.
4. **AI-плагін** (заплановано пізніше) — може бути реалізований як
   звичайний ефект- або інструмент-плагін: `createNode`/`createVoice`
   викликає локальну/віддалену модель (наприклад, генерація мелодії,
   auto-mastering за референсом, розділення стемів) і повертає
   Web Audio вузол з результатом. Формат плагіна вже це підтримує —
   не потрібно міняти архітектуру, коли дійде черга.
5. **Маркетплейс/спільний реєстр плагінів** — окрема JSON-стрічка з
   посиланнями на ZIP-архіви сторонніх плагінів, яку можна буде
   переглядати прямо у вкладці «Бібліотека».
