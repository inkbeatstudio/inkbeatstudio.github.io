(function (root) {
  'use strict';

  const DB_NAME = 'inkbeat-studio';
  const DB_STORE = 'projects';
  const PIANO_LOW = 24, PIANO_HIGH = 84;
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
      ['kick', 'snare', 'hihat', 'ohat', 'clap', 'tom'].forEach(k => {
        if (ctx.drums.pattern[k] && o.rows[k] !== false) pattern[k] = tile(ctx.drums.pattern[k], L);
      });
    }

    const emptyMap = () => { const m = {}; for (let n = PIANO_HIGH; n >= PIANO_LOW; n--) m[n] = new Array(256).fill(false); return m; };
    const putNote = (map, midi, s0, len) => {
      if (!map[midi]) return;
      for (let i = s0; i < Math.min(256, s0 + len); i++) map[midi][i] = true;
    };
    const noteLayer = (notes, bars, instrument) => {
      const map = emptyMap();
      (notes || []).forEach((e, i) => {
        const nx = notes[i + 1];
        let len = e.len;
        if (nx && nx.midi === e.midi && nx.s === e.s + len && len > 1) len -= 1;
        putNote(map, e.midi, e.s, len);
      });
      return { melody: map, bars, instrument, legato: true };
    };

    const chordsLayer = { melody: emptyMap(), bars: 2, instrument: o.instrumentId ? 'plugin:' + o.instrumentId : 'pad', legato: true };
    if (o.chords && ctx.chords && ctx.chords.loop.length) {
      const loopBars = ctx.chords.loopBars;
      const comp = o.comp && ctx.comp && ctx.comp.bars && ctx.comp.style === 'pluck' ? ctx.comp : null;
      const bars = comp ? Math.max(loopBars, comp.bars) : loopBars;
      chordsLayer.bars = bars;
      if (comp) chordsLayer.instrument = 'pluck';
      for (let b = 0; b < bars; b++) {
        const c = ctx.chords.loop[b % loopBars];
        if (!c) continue;
        let steps = comp ? comp.steps.filter(x => Math.floor(x / 16) === b % comp.bars).map(x => x % 16) : [0];
        if (!steps.length) steps = [0];
        steps.sort((p, q) => p - q);
        const onsets = [];
        steps.forEach(x => { if (!onsets.length || x - onsets[onsets.length - 1] > 1) onsets.push(x); });
        const r = PIANO_LOW + 24 + c.root;
        const voicing = comp ? [r, r + (c.minor ? 3 : 4), r + 7, r + 12] : [r, r + (c.minor ? 3 : 4), r + 7];
        onsets.forEach((x, k) => {
          const next = k + 1 < onsets.length ? onsets[k + 1] : 16;
          const len = comp ? Math.max(1, next - x - 1) : 16;
          voicing.forEach(m => putNote(chordsLayer.melody, m, b * 16 + x, len));
        });
      }
    }
    const bassLayer = o.bass && ctx.bass && ctx.bass.notes.length ? noteLayer(ctx.bass.notes, ctx.bass.bars, 'bass') : { melody: emptyMap(), bars: 2, instrument: 'bass', legato: true };
    const leadLayer = o.lead && ctx.lead && ctx.lead.notes.length ? noteLayer(ctx.lead.notes, ctx.lead.bars, 'lead') : { melody: emptyMap(), bars: 2, instrument: 'lead', legato: true };
    const melody = chordsLayer.melody, melodyBars = chordsLayer.bars;

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
      melodyInstrument: chordsLayer.instrument,
      melodyLegato: true,
      layers: { chords: chordsLayer, bass: bassLayer, lead: leadLayer },
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
