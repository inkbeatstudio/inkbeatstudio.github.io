(function (root) {
  'use strict';

  const DB_NAME = 'inkbeat-studio';
  const DB_STORE = 'projects';
  const PIANO_LOW = 48, PIANO_HIGH = 72;
  const DRUM_KEYS = ['kick', 'snare', 'hihat', 'ohat', 'clap', 'tom', 'perc'];

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbGet(db, key) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbPutMany(db, entries) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const os = tx.objectStore(DB_STORE);
      entries.forEach(([k, v]) => os.put(v, k));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  }

  function audioBufferToWav(buffer, padSec) {
    const ch = Math.min(2, buffer.numberOfChannels);
    const sr = buffer.sampleRate;
    const pad = Math.max(0, Math.round((padSec || 0) * sr));
    const n = buffer.length + pad;
    const bytes = n * ch * 2;
    const out = new ArrayBuffer(44 + bytes);
    const v = new DataView(out);
    const wr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    wr(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); wr(8, 'WAVE'); wr(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true);
    v.setUint16(34, 16, true); wr(36, 'data'); v.setUint32(40, bytes, true);
    const data = []; for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
    let o = 44 + pad * ch * 2;
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < ch; c++) {
        const s = Math.max(-1, Math.min(1, data[c][i]));
        v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
      }
    }
    return out;
  }

  function tile(bits, len) {
    const out = new Array(64).fill(false);
    for (let i = 0; i < 64; i++) out[i] = !!bits[i % len];
    return out;
  }

  function isEn() {
    try { return localStorage.getItem('lang') === 'en'; } catch (e) { return false; }
  }

  function buildPayload(ctx) {
    const { G, options: o } = ctx;
    const bpm = Math.max(40, Math.min(240, +G.bpm.toFixed(3)));

    const padSec = G.d < 0 ? -G.d : 0;
    const trimStart = G.d > 0 ? G.d : 0;

    const pattern = {};
    DRUM_KEYS.forEach(k => { pattern[k] = new Array(64).fill(false); });
    let seqBars = 2;
    if (o.drums && ctx.drums && ctx.drums.pattern) {
      seqBars = ctx.drums.bars;
      const L = seqBars * 16;
      ['kick', 'snare', 'hihat', 'ohat'].forEach(k => {
        if (o.rows[k] !== false) pattern[k] = tile(ctx.drums.pattern[k], L);
      });
    }

    const melody = {};
    for (let m = PIANO_HIGH; m >= PIANO_LOW; m--) melody[m] = new Array(64).fill(false);
    let melodyBars = 2;
    if (o.chords && ctx.chords && ctx.chords.loop.length) {
      melodyBars = ctx.chords.loopBars;
      ctx.chords.loop.forEach((c, bar) => {
        if (!c) return;
        const root = PIANO_LOW + c.root;
        [root, root + (c.minor ? 3 : 4), root + 7].forEach(m => {
          if (m < PIANO_LOW || m > PIANO_HIGH) return;
          for (let s = bar * 16; s < bar * 16 + 16; s++) melody[m][s] = true;
        });
      });
    }

    const keyShort = ctx.key ? ctx.key.name.replace(' minor', 'm').replace(' major', '') : '';
    const name = `${ctx.baseName} · ${Math.round(bpm * 10) / 10} BPM · ${keyShort}`;

    const tracks = [];
    if (o.keepOriginal && ctx.audioBuffer) {
      tracks.push({
        id: 1, name: isEn() ? 'Original' : 'Оригінал', color: '#8D84C4',
        volume: 0.9, pan: 0, mute: !!o.muteOriginal, solo: false, reverbSend: 0, eqTilt: 0,
        clips: [{
          id: 1, fileName: ctx.baseName, clipStart: 0, trimStart, trimDuration: null,
          fadeIn: 0, fadeOut: 0, gain: 1, playbackRate: 1,
          audio: audioBufferToWav(ctx.audioBuffer, padSec)
        }]
      });
    }

    return {
      name, savedAt: new Date().toISOString(),
      bpm, seqBars, seqSwing: 0, kit: 'modern',
      pattern, melody, melodyBars,
      melodyInstrument: o.instrumentId ? 'plugin:' + o.instrumentId : 'pad',
      melodyLegato: true,
      pluginFxChain: [], pluginInstrumentParams: {},
      markers: [], nextMarkerId: 1,
      tracks,
      analysis: {
        source: ctx.baseName, bpm, key: ctx.key ? ctx.key.name : null,
        firstDownbeatSec: G.d, bars: G.totalBars
      }
    };
  }

  async function sendToStudio(ctx) {
    const payload = buildPayload(ctx);
    const db = await openDB();
    try {
      const entries = [];
      const prev = await idbGet(db, 'current');
      if (prev) {
        entries.push(['proj:backup-before-analysis',
          Object.assign({}, prev, { name: (isEn() ? '(backup) ' : '(резерв) ') + (prev.name || (isEn() ? 'untitled' : 'без назви')), savedAt: new Date().toISOString() })]);
      }
      const id = 'proj_' + Date.now();
      entries.push(['proj:' + id, payload], ['current', payload], ['current-id', id]);
      await idbPutMany(db, entries);
      return id;
    } finally {
      db.close();
    }
  }

  root.InkBeatHandoff = { buildPayload, sendToStudio, audioBufferToWav };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.InkBeatHandoff;
})(typeof window !== 'undefined' ? window : globalThis);
