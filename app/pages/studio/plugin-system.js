/*
 * InkBeat Plugin System
 * =====================
 * Легкий "VST-подібний" реєстр плагінів для Web Audio API.
 *
 * Плагін — це тека в Library/Instruments/<id>/ або Library/Effects/<id>/,
 * що містить:
 *   plugin.json  — маніфест { id, name, type, version, author, params[] }
 *   main.js      — викликає InkBeatPlugins.register({...}) при завантаженні
 *
 * Детальний опис формату — у PLUGIN_DEV_GUIDE.md.
 *
 * Використання з боку студії (studio.js):
 *   InkBeatPlugins.instruments['warm-pluck']   // визначення інструмента
 *   InkBeatPlugins.effects['tape-delay']       // визначення ефекту
 *   await InkBeatPlugins.loadAll()             // підвантажити все з бібліотеки
 *   InkBeatPlugins.onReady(cb)                 // підписка на подію готовності
 */
(function (global) {
  'use strict';

  const registry = { instruments: {}, effects: {} };
  const readyCallbacks = [];
  let loaded = false;

  function register(def) {
    if (!def || !def.id || !def.type) {
      console.error('[InkBeatPlugins] Некоректна реєстрація плагіна', def);
      return;
    }
    if (def.type === 'instrument') registry.instruments[def.id] = def;
    else if (def.type === 'effect') registry.effects[def.id] = def;
    else console.error('[InkBeatPlugins] Невідомий тип плагіна:', def.type);
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url + '?t=' + Date.now(); // без кешу — щоб бачити зміни під час розробки плагіна
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Не вдалося завантажити ' + url));
      document.head.appendChild(script);
    });
  }

  async function loadAll() {
    let manifest;
    try {
      const res = await fetch('/api/library');
      manifest = await res.json();
    } catch (e) {
      console.warn('[InkBeatPlugins] Бібліотека недоступна (не в десктоп-режимі?)', e);
      manifest = { instruments: [], effects: [] };
    }

    const jobs = [];
    (manifest.instruments || []).forEach(p => {
      window.__inkbeatPluginMeta = window.__inkbeatPluginMeta || {};
      window.__inkbeatPluginMeta[p.id] = p;
      jobs.push(loadScript(p.mainUrl).catch(e => console.error('[InkBeatPlugins]', p.id, e)));
    });
    (manifest.effects || []).forEach(p => {
      window.__inkbeatPluginMeta = window.__inkbeatPluginMeta || {};
      window.__inkbeatPluginMeta[p.id] = p;
      jobs.push(loadScript(p.mainUrl).catch(e => console.error('[InkBeatPlugins]', p.id, e)));
    });

    await Promise.all(jobs);
    loaded = true;
    readyCallbacks.forEach(cb => { try { cb(registry); } catch (e) { console.error(e); } });
    readyCallbacks.length = 0;
    return { manifest, registry };
  }

  function onReady(cb) {
    if (loaded) cb(registry);
    else readyCallbacks.push(cb);
  }

  function paramsWithDefaults(def, overrides) {
    const out = {};
    (def.params || []).forEach(p => { out[p.id] = p.default; });
    Object.assign(out, overrides || {});
    return out;
  }

  global.InkBeatPlugins = {
    registry, register, loadAll, onReady, paramsWithDefaults,
    get instruments() { return registry.instruments; },
    get effects() { return registry.effects; },
  };
})(window);
