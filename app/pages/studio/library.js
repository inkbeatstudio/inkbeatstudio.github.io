/*
 * InkBeat Studio — Library panel
 * ================================
 * З'єднує UI "Бібліотека" (модалка з вкладками Семпли / Інструменти /
 * Ефекти / Проєкти) з on-disk API (/api/library, /api/projects) та
 * з window.InkBeatStudio / window.InkBeatPlugins.
 *
 * Не залежить від внутрішньої структури studio.js — використовує лише
 * публічний контракт window.InkBeatStudio, тож безпечний для розширення.
 */
(function () {
  'use strict';

  let libraryData = { samples: [], instruments: [], effects: [], projects: [] };

  function studio() { return window.InkBeatStudio; }

  async function refreshLibraryData() {
    try {
      const res = await fetch('/api/library');
      libraryData = await res.json();
    } catch (e) {
      console.warn('[library] API недоступне', e);
    }
    return libraryData;
  }

  // ---------- Modal scaffold ----------
  function ensureModal() {
    if (document.getElementById('lib-modal')) return;
    const overlay = document.createElement('div');
    overlay.className = 'st-modal-overlay';
    overlay.id = 'lib-modal';
    overlay.innerHTML = `
      <div class="st-modal" style="max-width:640px">
        <div class="st-modal-head">
          <span>📚 Бібліотека</span>
          <button class="st-browser-close" id="lib-modal-close">✕</button>
        </div>
        <div class="st-lib-tabs">
          <button class="st-lib-tab active" data-tab="samples">Семпли</button>
          <button class="st-lib-tab" data-tab="instruments">Інструменти</button>
          <button class="st-lib-tab" data-tab="effects">Ефекти</button>
          <button class="st-lib-tab" data-tab="projects">Проєкти (файли)</button>
        </div>
        <div class="st-modal-body" id="lib-modal-body"></div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('lib-modal-close').addEventListener('click', closeLibraryModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeLibraryModal(); });
    overlay.querySelectorAll('.st-lib-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.st-lib-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTab(btn.dataset.tab);
      });
    });
  }

  function openLibraryModal(initialTab) {
    ensureModal();
    document.getElementById('lib-modal').classList.add('open');
    refreshLibraryData().then(() => renderTab(initialTab || 'samples'));
    if (initialTab) {
      document.querySelectorAll('#lib-modal .st-lib-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === initialTab);
      });
    }
  }
  function closeLibraryModal() {
    const el = document.getElementById('lib-modal');
    if (el) el.classList.remove('open');
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- Tab: Samples ----------
  function renderSamplesTab() {
    const body = document.getElementById('lib-modal-body');
    const items = libraryData.samples || [];
    const groups = {};
    items.forEach(s => {
      const key = s.folder || 'Інше';
      (groups[key] = groups[key] || []).push(s);
    });
    const groupOrder = Object.keys(groups).sort((a, b) => a === 'Інше' ? 1 : b === 'Інше' ? -1 : a.localeCompare(b));

    body.innerHTML = `
      <div class="st-lib-upload-row">
        <input type="file" id="lib-sample-upload" accept="audio/*" multiple hidden/>
        <select id="lib-sample-upload-folder" class="st-save-as-input" style="flex:0 0 160px">
          <option value="">Без категорії</option>
          <option value="Drums">Drums</option>
          <option value="Bass">Bass</option>
          <option value="Melodic">Melodic</option>
          <option value="Vocals">Vocals</option>
          <option value="FX">FX</option>
        </select>
        <button class="st-icon-btn" id="lib-sample-upload-btn">＋ Імпортувати семпли з диска</button>
      </div>
      <p class="st-hint" style="margin-bottom:12px">Клік по семплу — додає його на нову доріжку в проєкт. У комплекті йде стартовий пак семплів (барабани, бас, мелодика) — можеш одразу перетягувати їх у секвенсор.</p>
      ${groupOrder.length ? groupOrder.map(g => `
        <div class="st-lib-group">
          <div class="st-lib-group-title">${g === 'Інше' ? '📁 Без категорії' : '📁 ' + escapeHtml(g)}</div>
          <div class="st-projects-list">
            ${groups[g].map(s => `
              <div class="st-project-item">
                <div class="st-project-item-name">🎵 ${escapeHtml(s.name)}</div>
                <div class="st-project-item-btns">
                  <button data-add="${escapeHtml(s.relPath)}">Додати</button>
                  <button class="danger" data-del="${escapeHtml(s.relPath)}">Видалити</button>
                </div>
              </div>`).join('')}
          </div>
        </div>`).join('') : '<p class="st-hint">Поки що немає семплів.</p>'}
      `;

    document.getElementById('lib-sample-upload-btn').addEventListener('click', () => {
      document.getElementById('lib-sample-upload').click();
    });
    document.getElementById('lib-sample-upload').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      const folder = document.getElementById('lib-sample-upload-folder').value;
      for (const file of files) {
        try {
          const qs = 'name=' + encodeURIComponent(file.name) + (folder ? '&folder=' + encodeURIComponent(folder) : '');
          await fetch('/api/library/upload-sample?' + qs, { method: 'POST', body: file });
        } catch (err) { console.error(err); }
      }
      await refreshLibraryData();
      renderSamplesTab();
    });

    body.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', () => addSampleToProject(btn.dataset.add));
    });
    body.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await fetch('/api/library/item?category=samples&name=' + encodeURIComponent(btn.dataset.del), { method: 'DELETE' });
        await refreshLibraryData();
        renderSamplesTab();
      });
    });
  }

  async function addSampleToProject(relPath) {
    const s = studio();
    if (!s) return;
    const entry = (libraryData.samples || []).find(x => x.relPath === relPath);
    if (!entry) return;
    try {
      const res = await fetch(entry.url);
      const blob = await res.blob();
      const fileLike = new File([blob], entry.name, { type: blob.type });
      await s.importFiles([fileLike], null, 0);
    } catch (e) {
      console.error('[library] не вдалось додати семпл', e);
    }
  }

  // Дозволяє відкрити семпли бібліотеки у вже готовому drawer'і
  // (той самий, що й для "Папка" з диска) — щоб можна було
  // перетягувати їх прямо на доріжки, а не тільки клікати.
  function openLibrarySamplesInDrawer() {
    const s = studio();
    if (!s) return;
    const items = (libraryData.samples || []).map(entry => ({
      name: entry.name,
      arrayBuffer: () => fetch(entry.url).then(r => r.arrayBuffer())
    }));
    s.state.browserItems = items;
    s.renderBrowserItems();
    s.openBrowserDrawer();
  }

  // ---------- Tab: Instruments / Effects (plugins) ----------
  function renderPluginsTab(kind) {
    const body = document.getElementById('lib-modal-body');
    const list = kind === 'instruments' ? libraryData.instruments : libraryData.effects;
    const kindLabel = kind === 'instruments' ? 'інструмент' : 'ефект';

    body.innerHTML = `
      <div class="st-lib-upload-row">
        <input type="file" id="lib-plugin-upload" accept=".zip" hidden/>
        <button class="st-icon-btn" id="lib-plugin-upload-btn">＋ Встановити плагін (.zip)</button>
        <span class="st-hint" style="margin-left:8px">ZIP з plugin.json + main.js. Дивись PLUGIN_DEV_GUIDE.md, щоб зробити свій.</span>
      </div>
      <div class="st-projects-list">
        ${list.length ? list.map(p => `
          <div class="st-project-item">
            <div>
              <div class="st-project-item-name">🧩 ${escapeHtml(p.name)}</div>
              <div class="st-project-item-date">${escapeHtml(p.description || p.version || '')}</div>
            </div>
            <div class="st-project-item-btns">
              ${kind === 'effects' ? `<button data-fx-add="${escapeHtml(p.id)}">До майстер-шини</button>` : ''}
              <button class="danger" data-plugin-del="${escapeHtml(p.folder || p.id)}" data-kind="${kind}">Видалити</button>
            </div>
          </div>`).join('') : `<p class="st-hint">Поки що немає встановлених плагінів-${kindLabel}ів.</p>`}
      </div>
      ${kind === 'effects' ? renderMasterFxChainBlock() : ''}
    `;

    document.getElementById('lib-plugin-upload-btn').addEventListener('click', () => {
      document.getElementById('lib-plugin-upload').click();
    });
    document.getElementById('lib-plugin-upload').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const singularKind = kind === 'instruments' ? 'instrument' : 'effect';
      try {
        const buf = await file.arrayBuffer();
        const res = await fetch('/api/library/install-plugin?kind=' + singularKind, { method: 'POST', body: buf });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        await window.InkBeatPlugins.loadAll();
        studio() && studio().refreshInstrumentOptions();
        await refreshLibraryData();
        renderPluginsTab(kind);
      } catch (err) {
        alert('Не вдалося встановити плагін: ' + err.message);
      }
    });

    body.querySelectorAll('[data-plugin-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const category = btn.dataset.kind === 'instruments' ? 'instruments' : 'effects';
        await fetch('/api/library/item?category=' + category + '&name=' + encodeURIComponent(btn.dataset.pluginDel), { method: 'DELETE' });
        await refreshLibraryData();
        renderPluginsTab(kind);
      });
    });

    body.querySelectorAll('[data-fx-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = studio();
        if (!s) return;
        const chain = (s.state.pluginFxChain || []).slice();
        chain.push({ id: btn.dataset.fxAdd, params: {} });
        s.rebuildPluginFxChain(chain);
        renderPluginsTab('effects');
      });
    });

    wireMasterFxChainBlock();
  }

  function renderMasterFxChainBlock() {
    const s = studio();
    const chain = (s && s.state.pluginFxChain) || [];
    if (!chain.length) return '';
    return `
      <div class="st-lib-fxchain">
        <div class="st-hint" style="margin:14px 0 8px">Активний ланцюг плагінів на майстер-шині (застосовується по порядку):</div>
        <div class="st-projects-list">
          ${chain.map((entry, i) => {
            const def = window.InkBeatPlugins.effects[entry.id];
            return `<div class="st-project-item">
              <div class="st-project-item-name">${i + 1}. ${escapeHtml(def ? def.name : entry.id)}</div>
              <div class="st-project-item-btns">
                <button data-fx-remove="${i}">Прибрати</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function wireMasterFxChainBlock() {
    document.querySelectorAll('[data-fx-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = studio();
        if (!s) return;
        const idx = parseInt(btn.dataset.fxRemove, 10);
        const chain = (s.state.pluginFxChain || []).slice();
        chain.splice(idx, 1);
        s.rebuildPluginFxChain(chain);
        renderPluginsTab('effects');
      });
    });
  }

  // ---------- Tab: Projects (files on disk) ----------
  function renderProjectsTab() {
    const s = studio();
    const body = document.getElementById('lib-modal-body');
    const items = libraryData.projects || [];
    body.innerHTML = `
      <div class="st-lib-upload-row">
        <input type="text" id="lib-project-save-name" class="st-save-as-input" placeholder="Назва файлу проєкту…"
               value="${escapeHtml((s && s.currentProjectName) || '')}"/>
        <button class="st-icon-btn" id="lib-project-save-btn">💾 Зберегти у файл</button>
      </div>
      <p class="st-hint">Ці проєкти — реальні файли в <code>Library/Projects/*.inkbeat.json</code> на диску (окремо від автозбереження в браузері).</p>
      <div class="st-projects-list">
        ${items.length ? items.map(p => `
          <div class="st-project-item">
            <div>
              <div class="st-project-item-name">${escapeHtml(p.name)}</div>
              <div class="st-project-item-date">${new Date(p.mtime * 1000).toLocaleString()}</div>
            </div>
            <div class="st-project-item-btns">
              <button data-load-project="${escapeHtml(p.name)}">Відкрити</button>
              <button class="danger" data-del-project="${escapeHtml(p.name)}">Видалити</button>
            </div>
          </div>`).join('') : '<p class="st-hint">Ще немає файлів проєктів.</p>'}
      </div>`;

    document.getElementById('lib-project-save-btn').addEventListener('click', async () => {
      const name = document.getElementById('lib-project-save-name').value.trim();
      if (!name) return;
      try {
        await studio().saveProjectToDisk(name);
        await refreshLibraryData();
        renderProjectsTab();
      } catch (e) { alert('Не вдалося зберегти: ' + e.message); }
    });
    body.querySelectorAll('[data-load-project]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await studio().loadProjectFromDisk(btn.dataset.loadProject);
          closeLibraryModal();
        } catch (e) { alert('Не вдалося відкрити: ' + e.message); }
      });
    });
    body.querySelectorAll('[data-del-project]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await fetch('/api/projects/' + encodeURIComponent(btn.dataset.delProject), { method: 'DELETE' });
        await refreshLibraryData();
        renderProjectsTab();
      });
    });
  }

  function renderTab(tab) {
    if (tab === 'samples') renderSamplesTab();
    else if (tab === 'instruments') renderPluginsTab('instruments');
    else if (tab === 'effects') renderPluginsTab('effects');
    else if (tab === 'projects') renderProjectsTab();
  }

  // ---------- Toolbar wiring ----------
  function wireToolbarButton() {
    const topbarRight = document.querySelector('.st-topbar-right');
    if (!topbarRight) return;
    const btn = document.createElement('button');
    btn.className = 'st-icon-btn';
    btn.id = 'btn-library';
    btn.title = 'Бібліотека: семпли, інструменти, ефекти, плагіни';
    btn.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg><span>Бібліотека</span>';
    const folderBtn = document.getElementById('btn-open-folder');
    if (folderBtn && folderBtn.parentElement) {
      folderBtn.insertAdjacentElement('afterend', btn);
    } else {
      topbarRight.appendChild(btn);
    }
    btn.addEventListener('click', () => openLibraryModal('samples'));
  }

  function init() {
    wireToolbarButton();
    window.InkBeatStudio && (window.InkBeatStudio.refreshPluginFxUI = () => {
      if (document.getElementById('lib-modal') && document.getElementById('lib-modal').classList.contains('open')) {
        renderTab('effects');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Дочекатись, поки studio.js виставить window.InkBeatStudio (він робить
    // це синхронно при завантаженні скрипта, тому до DOMContentLoaded вже готово).
    init();
    if (window.InkBeatPlugins) {
      window.InkBeatPlugins.loadAll().then(() => {
        window.InkBeatStudio && window.InkBeatStudio.refreshInstrumentOptions();
      });
    }
  });

  window.InkBeatLibrary = { openLibraryModal, closeLibraryModal, openLibrarySamplesInDrawer, refreshLibraryData };
})();
