# Changelog

## v0.3.0 — Аналіз треку

- **Нова сторінка «Аналіз треку»** (`pages/analyzer`): темп, сітка тактів, тональність, акорди, ударний цикл;
  прослуховування з метрономом; ручні виправлення; експорт у студію одним кліком.
- Кнопка «Аналіз» у студії та картка в лаунчері.
- **Легато в піано-ролі**: сусідні клітинки зливаються в довгі ноти (для акордів).
- Власний ресемплер з антиаліасингом (браузерний давав хибні snare).
- Тестові інструменти: `tools/make_test_track.py`, `tools/test_engine.js`.

## v0.2.0 — Бібліотека, плагіни, стартовий контент

- **Файлова бібліотека на диску** (`~/InkBeatStudio/Library/`): Samples,
  Instruments, Effects, Projects — незалежна від застосунку, HTTP API
  для читання/запису (`library_backend.py`).
- **Плагін-система** для Web Audio API — інструменти (`createVoice`) та
  ефекти (`createNode`), без збірки, формат теки + `plugin.json` +
  `main.js`. Встановлення через `.zip` прямо з інтерфейсу.
  Див. `PLUGIN_DEV_GUIDE.md`.
- **6 плагінів-інструментів** у комплекті: Warm Pluck, Deep Sub,
  Crystal Bell, FM Bass, Analog Strings, Arp Pluck.
- **6 плагінів-ефектів** у комплекті: Tape Delay, Bit Crusher,
  Stereo Chorus, Hall Reverb, Stereo Widener, Auto Wah. Підключаються
  послідовним ланцюгом на майстер-шину.
- **Стартовий пак семплів** (13 файлів, оригінальні, синтезовані):
  Drums, Bass, Melodic — категоризовані по підтеках, генератор —
  `tools/generate_sample_pack.py`.
- Панель «Бібліотека» в студії: вкладки Семпли / Інструменти / Ефекти /
  Проєкти, імпорт/встановлення/видалення, drag-friendly список семплів.
- Проєкти можна зберігати/відкривати як окремі `.inkbeat.json` файли на
  диску (`saveProjectToDisk`/`loadProjectFromDisk`), паралельно з
  автозбереженням у IndexedDB браузера.
- `install_linux_desktop.sh` — реєструє застосунок у меню застосунків
  Linux (`.desktop` entry + іконка) після збірки.

## v0.1.0 — Перший робочий десктоп-білд

- Обгортка pywebview навколо існуючого веб-сайту/студії.
- Локальний HTTP-сервер (`127.0.0.1:47821`, фіксований порт) замість
  `file://` — потрібно для `getUserMedia`, `MediaRecorder`, IndexedDB.
- Скрипти збірки для Linux (`build_linux.sh`) і Windows
  (`build_windows.bat`) через PyInstaller.
- GitHub Actions workflow (`build-desktop.yml`) для автоматичної
  збірки обох платформ у хмарі.
- jszip завантажено локально (раніше — з CDN), працює офлайн.
