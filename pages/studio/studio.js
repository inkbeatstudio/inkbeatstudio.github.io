/* ==========================================================================
   INKBEAT STUDIO — client-side DAW built on the Web Audio API.
   Everything runs and stays on the user's device (IndexedDB for persistence,
   File System Access API / <input type=file> for importing audio).
   ========================================================================== */
(function () {
  'use strict';

  const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
  let actx = null;

  let PX_PER_SEC = 70;      // timeline zoom (mutable)
  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD = 0.12;

  const DRUM_ROWS = [
    { key: 'kick',  label: 'Kick'    },
    { key: 'snare', label: 'Snare'   },
    { key: 'hihat', label: 'Hi-Hat'  },
    { key: 'ohat',  label: 'Open Hat'},
    { key: 'clap',  label: 'Clap'    },
    { key: 'tom',   label: 'Tom'     },
    { key: 'perc',  label: 'Perc'    }
  ];
  const TRACK_COLORS = ['#B8452C', '#8D84C4', '#8C5A3C', '#6E1423', '#5C6E8C', '#A8763F'];

  /* ---------------------------------------------------------------------
     STATE
  --------------------------------------------------------------------- */
  const state = {
    tracks: [],           // {id,name,color,buffer,fileName,volume,pan,mute,solo,clipStart, nodes:{gain,pan,analyser}, _source}
    nextTrackId: 1,
    bpm: 120,
    seqBars: 2,
    seqSwing: 0,
    pattern: {},           // key -> boolean[] length 16*bars
    isPlaying: false,
    isLooping: false,
    playbackPosition: 0,   // seconds
    originTime: 0,         // actx.currentTime corresponding to position 0 of current play session
    schedulerTimer: null,
    nextStepTime: 0,
    currentStepIndex: 0,
    rafId: null,
    seqTrack: { volume: 0.9, pan: 0, mute: false, solo: false, nodes: null }, // virtual "Beat" channel
    fx: {
      eqOn: true, eqLow: 0, eqMid: 0, eqHigh: 0,
      compOn: true, compThresh: -24, compRatio: 4, compRelease: 0.25,
      delayOn: false, delayTime: 0.28, delayFb: 0.35, delayMix: 0.25,
      reverbOn: false, reverbSize: 2.2, reverbDecay: 3.0, reverbMix: 0.20,
      distOn: false, distAmount: 0.20, distMix: 0.5
    },
    masterVolume: 0.85,
    browserItems: []
  };
  DRUM_ROWS.forEach(r => { state.pattern[r.key] = new Array(64).fill(false); });

  /* ---------------------------------------------------------------------
     AUDIO GRAPH
  --------------------------------------------------------------------- */
  const graph = {};

  function ensureAudioContext() {
    if (actx) return actx;
    actx = new AudioCtxClass();
    buildGraph(actx);
    return actx;
  }

  function buildGraph(ctx) {
    const mixBus = ctx.createGain(); mixBus.gain.value = 1;

    // --- distortion stage ---
    const distIn = ctx.createGain();
    const distDry = ctx.createGain();
    const distShaper = ctx.createWaveShaper(); distShaper.oversample = '2x';
    const distWet = ctx.createGain();
    const distOut = ctx.createGain();
    distIn.connect(distDry); distDry.connect(distOut);
    distIn.connect(distShaper); distShaper.connect(distWet); distWet.connect(distOut);

    // --- EQ (3-band) ---
    const eqLow = ctx.createBiquadFilter(); eqLow.type = 'lowshelf'; eqLow.frequency.value = 200;
    const eqMid = ctx.createBiquadFilter(); eqMid.type = 'peaking'; eqMid.frequency.value = 1200; eqMid.Q.value = 0.9;
    const eqHigh = ctx.createBiquadFilter(); eqHigh.type = 'highshelf'; eqHigh.frequency.value = 5000;
    distOut.connect(eqLow); eqLow.connect(eqMid); eqMid.connect(eqHigh);

    // --- compressor ---
    const compressor = ctx.createDynamicsCompressor();
    eqHigh.connect(compressor);

    // --- delay stage ---
    const delayIn = ctx.createGain();
    const delayDry = ctx.createGain();
    const delayNode = ctx.createDelay(2.0);
    const delayFeedback = ctx.createGain();
    const delayWet = ctx.createGain();
    const delayOut = ctx.createGain();
    compressor.connect(delayIn);
    delayIn.connect(delayDry); delayDry.connect(delayOut);
    delayIn.connect(delayNode); delayNode.connect(delayFeedback); delayFeedback.connect(delayNode);
    delayNode.connect(delayWet); delayWet.connect(delayOut);

    // --- reverb stage ---
    const reverbIn = ctx.createGain();
    const reverbDry = ctx.createGain();
    const convolver = ctx.createConvolver();
    const reverbWet = ctx.createGain();
    const reverbOut = ctx.createGain();
    delayOut.connect(reverbIn);
    reverbIn.connect(reverbDry); reverbDry.connect(reverbOut);
    reverbIn.connect(convolver); convolver.connect(reverbWet); reverbWet.connect(reverbOut);

    // --- master ---
    const masterGain = ctx.createGain();
    const masterAnalyser = ctx.createAnalyser(); masterAnalyser.fftSize = 1024;
    reverbOut.connect(masterGain); masterGain.connect(masterAnalyser); masterAnalyser.connect(ctx.destination);

    // sequencer virtual bus
    const seqGain = ctx.createGain();
    const seqAnalyser = ctx.createAnalyser(); seqAnalyser.fftSize = 512;
    seqGain.connect(seqAnalyser); seqAnalyser.connect(mixBus);
    state.seqTrack.nodes = { gain: seqGain, analyser: seqAnalyser };

    mixBus.connect(distIn);

    Object.assign(graph, {
      ctx, mixBus, distIn, distDry, distShaper, distWet, distOut,
      eqLow, eqMid, eqHigh, compressor,
      delayIn, delayDry, delayNode, delayFeedback, delayWet, delayOut,
      reverbIn, reverbDry, convolver, reverbWet, reverbOut,
      masterGain, masterAnalyser
    });

    applyFxToGraph();
    regenerateImpulse();
  }

  function makeDistortionCurve(amount) {
    const k = amount * 100;
    const n = 44100;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  function regenerateImpulse() {
    if (!actx) return;
    const dur = state.fx.reverbSize;
    const decay = state.fx.reverbDecay;
    const rate = actx.sampleRate;
    const len = Math.max(1, Math.floor(rate * dur));
    const buf = actx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    graph.convolver.buffer = buf;
  }

  function applyFxToGraph() {
    if (!graph.ctx) return;
    const f = state.fx;
    graph.distShaper.curve = makeDistortionCurve(f.distOn ? f.distAmount : 0);
    graph.distDry.gain.value = f.distOn ? (1 - f.distMix) : 1;
    graph.distWet.gain.value = f.distOn ? f.distMix : 0;

    graph.eqLow.gain.value = f.eqOn ? f.eqLow : 0;
    graph.eqMid.gain.value = f.eqOn ? f.eqMid : 0;
    graph.eqHigh.gain.value = f.eqOn ? f.eqHigh : 0;

    graph.compressor.threshold.value = f.compOn ? f.compThresh : 0;
    graph.compressor.ratio.value = f.compOn ? f.compRatio : 1;
    graph.compressor.release.value = f.compOn ? f.compRelease : 0.05;

    graph.delayNode.delayTime.value = f.delayTime;
    graph.delayFeedback.gain.value = f.delayOn ? f.delayFb : 0;
    graph.delayDry.gain.value = f.delayOn ? (1 - f.delayMix) : 1;
    graph.delayWet.gain.value = f.delayOn ? f.delayMix : 0;

    graph.reverbDry.gain.value = f.reverbOn ? (1 - f.reverbMix) : 1;
    graph.reverbWet.gain.value = f.reverbOn ? f.reverbMix : 0;

    graph.masterGain.gain.value = state.masterVolume;
  }

  /* ---------------------------------------------------------------------
     DRUM SYNTHESIS (no samples needed — all generated on the fly)
  --------------------------------------------------------------------- */
  function noiseBuffer(ctx, duration) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function playKick(ctx, dest, t) {
    const osc = ctx.createOscillator(); osc.type = 'sine';
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.14);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + 0.3);
  }

  function playSnare(ctx, dest, t) {
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer(ctx, 0.2);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.9, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    noise.connect(bp); bp.connect(ng); ng.connect(dest);
    const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 180;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.6, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(og); og.connect(dest);
    noise.start(t); noise.stop(t + 0.2);
    osc.start(t); osc.stop(t + 0.13);
  }

  function playHat(ctx, dest, t, open) {
    const dur = open ? 0.35 : 0.06;
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer(ctx, dur);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(hp); hp.connect(g); g.connect(dest);
    noise.start(t); noise.stop(t + dur);
  }

  function playClap(ctx, dest, t) {
    for (let i = 0; i < 3; i++) {
      const off = t + i * 0.012;
      const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer(ctx, 0.08);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, off);
      g.gain.exponentialRampToValueAtTime(0.001, off + 0.07);
      noise.connect(bp); bp.connect(g); g.connect(dest);
      noise.start(off); noise.stop(off + 0.08);
    }
  }

  function playTom(ctx, dest, t) {
    const osc = ctx.createOscillator(); osc.type = 'sine';
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.22);
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + 0.33);
  }

  function playPerc(ctx, dest, t) {
    const osc = ctx.createOscillator(); osc.type = 'triangle';
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.08);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + 0.11);
  }

  const DRUM_FN = { kick: playKick, snare: playSnare, clap: playClap, tom: playTom, perc: playPerc,
    hihat: (c, d, t) => playHat(c, d, t, false), ohat: (c, d, t) => playHat(c, d, t, true) };

  /* ---------------------------------------------------------------------
     TRANSPORT / SCHEDULING
  --------------------------------------------------------------------- */
  function totalSteps() { return state.seqBars * 16; }
  function stepDuration() { return (60 / state.bpm) / 4; }

  function projectDuration() {
    let end = 0;
    state.tracks.forEach(tr => { if (tr.buffer) end = Math.max(end, tr.clipStart + tr.buffer.duration); });
    const seqLen = totalSteps() * stepDuration();
    if (end === 0) end = seqLen * 4;
    return Math.max(end, seqLen);
  }

  function play() {
    ensureAudioContext();
    if (actx.state === 'suspended') actx.resume();
    if (state.isPlaying) return;
    state.isPlaying = true;
    state.originTime = actx.currentTime - state.playbackPosition;
    state.nextStepTime = state.originTime + Math.ceil(state.playbackPosition / stepDuration()) * stepDuration();
    state.currentStepIndex = Math.round((state.nextStepTime - state.originTime) / stepDuration()) % totalSteps();

    scheduleTrackSources();
    state.schedulerTimer = setInterval(schedulerTick, LOOKAHEAD_MS);
    tickPlayhead();
    updateTransportUI();
  }

  function pause() {
    if (!state.isPlaying) return;
    state.playbackPosition = actx.currentTime - state.originTime;
    stopAllSources();
    clearInterval(state.schedulerTimer);
    cancelAnimationFrame(state.rafId);
    state.isPlaying = false;
    updateTransportUI();
  }

  function stop() {
    stopAllSources();
    clearInterval(state.schedulerTimer);
    cancelAnimationFrame(state.rafId);
    state.isPlaying = false;
    state.playbackPosition = 0;
    updateTransportUI();
    updatePlayheadPosition(0);
    updatePosDisplay(0);
  }

  function stopAllSources() {
    state.tracks.forEach(tr => {
      if (tr._source) { try { tr._source.stop(); } catch (e) {} tr._source = null; }
    });
  }

  function scheduleTrackSources() {
    const pos = state.playbackPosition;
    state.tracks.forEach(tr => {
      if (!tr.buffer) return;
      const clipEnd = tr.clipStart + tr.buffer.duration;
      if (clipEnd <= pos) return;
      const src = actx.createBufferSource();
      src.buffer = tr.buffer;
      src.connect(tr.nodes.gain);
      let when, offset;
      if (tr.clipStart >= pos) { when = state.originTime + tr.clipStart; offset = 0; }
      else { when = actx.currentTime; offset = pos - tr.clipStart; }
      try { src.start(when, offset); } catch (e) {}
      tr._source = src;
    });
  }

  function schedulerTick() {
    const dur = stepDuration();
    while (state.nextStepTime < actx.currentTime + SCHEDULE_AHEAD) {
      const stepInPattern = state.currentStepIndex % totalSteps();
      let t = state.nextStepTime;
      if (stepInPattern % 2 === 1) t += dur * (state.seqSwing / 100) * 0.5;
      DRUM_ROWS.forEach(row => {
        if (state.pattern[row.key][stepInPattern]) {
          DRUM_FN[row.key](actx, state.seqTrack.nodes.gain, t);
        }
      });
      scheduleStepHighlight(stepInPattern, t);
      state.nextStepTime += dur;
      state.currentStepIndex++;
    }

    // loop / end of project handling
    const songTime = actx.currentTime - state.originTime;
    if (songTime >= projectDuration()) {
      if (state.isLooping) {
        pause();
        state.playbackPosition = 0;
        play();
      } else {
        stop();
      }
    }
  }

  function scheduleStepHighlight(stepIndex, atTime) {
    const delayMs = Math.max(0, (atTime - actx.currentTime) * 1000);
    setTimeout(() => highlightStep(stepIndex), delayMs);
  }

  function highlightStep(stepIndex) {
    document.querySelectorAll('.st-seq-step').forEach(el => el.classList.remove('playing-col'));
    document.querySelectorAll(`.st-seq-step[data-step="${stepIndex}"]`).forEach(el => el.classList.add('playing-col'));
  }

  function tickPlayhead() {
    if (!state.isPlaying) return;
    const songTime = actx.currentTime - state.originTime;
    updatePlayheadPosition(songTime);
    updatePosDisplay(songTime);
    updateMeters();
    state.rafId = requestAnimationFrame(tickPlayhead);
  }

  function updatePlayheadPosition(songTime) {
    const el = document.getElementById('playhead');
    if (el) el.style.left = (songTime * PX_PER_SEC) + 'px';
  }

  function updatePosDisplay(songTime) {
    const beatsPerBar = 4;
    const beatDur = 60 / state.bpm;
    const totalBeats = songTime / beatDur;
    const bar = Math.floor(totalBeats / beatsPerBar) + 1;
    const beat = Math.floor(totalBeats % beatsPerBar) + 1;
    const sixteenth = Math.floor((totalBeats * 4) % 4) + 1;
    const el = document.getElementById('pos-display');
    if (el) el.textContent = `${bar}.${beat}.${sixteenth}`;
  }

  function updateTransportUI() {
    const playBtn = document.getElementById('btn-play');
    playBtn.querySelector('.icon-play').style.display = state.isPlaying ? 'none' : 'block';
    playBtn.querySelector('.icon-pause').style.display = state.isPlaying ? 'block' : 'none';
  }

  /* ---------------------------------------------------------------------
     METERS
  --------------------------------------------------------------------- */
  function rmsFromAnalyser(analyser) {
    const arr = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(arr);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) { const v = (arr[i] - 128) / 128; sum += v * v; }
    return Math.sqrt(sum / arr.length);
  }

  function updateMeters() {
    if (graph.masterAnalyser) {
      const v = Math.min(1, rmsFromAnalyser(graph.masterAnalyser) * 2.2);
      const fill = document.getElementById('master-meter-fill');
      if (fill) fill.style.width = (v * 100) + '%';
    }
    state.tracks.forEach(tr => {
      if (!tr.nodes || !tr.nodes.analyser) return;
      const v = Math.min(1, rmsFromAnalyser(tr.nodes.analyser) * 2.2);
      const el = document.getElementById('vu-' + tr.id);
      if (el) el.style.height = (v * 100) + '%';
    });
    if (state.seqTrack.nodes) {
      const v = Math.min(1, rmsFromAnalyser(state.seqTrack.nodes.analyser) * 2.2);
      const el = document.getElementById('vu-seq');
      if (el) el.style.height = (v * 100) + '%';
    }
    drawSpectrum();
  }

  function drawSpectrum() {
    const canvas = document.getElementById('fx-analyser');
    if (!canvas || !graph.masterAnalyser || canvas.offsetParent === null) return;
    const ctx2d = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth;
    const h = canvas.height;
    const data = new Uint8Array(graph.masterAnalyser.frequencyBinCount);
    graph.masterAnalyser.getByteFrequencyData(data);
    ctx2d.clearRect(0, 0, w, h);
    const barCount = 64;
    const step = Math.floor(data.length / barCount);
    const barW = w / barCount;
    const grad = ctx2d.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, '#B8452C'); grad.addColorStop(0.6, '#241F3D'); grad.addColorStop(1, '#8D84C4');
    ctx2d.fillStyle = grad;
    for (let i = 0; i < barCount; i++) {
      const v = data[i * step] / 255;
      const bh = v * h;
      ctx2d.fillRect(i * barW, h - bh, barW - 2, bh);
    }
  }

  /* ---------------------------------------------------------------------
     TRACKS
  --------------------------------------------------------------------- */
  function createTrackNodes(tr) {
    const ctx = actx;
    const gain = ctx.createGain(); gain.gain.value = tr.volume;
    const pan = ctx.createStereoPanner(); pan.pan.value = tr.pan;
    const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
    gain.connect(pan); pan.connect(analyser); analyser.connect(graph.mixBus);
    tr.nodes = { gain, pan, analyser };
  }

  function addTrack(opts) {
    ensureAudioContext();
    const tr = Object.assign({
      id: state.nextTrackId++,
      name: 'Доріжка',
      color: TRACK_COLORS[state.tracks.length % TRACK_COLORS.length],
      buffer: null,
      fileName: '',
      volume: 0.9,
      pan: 0,
      mute: false,
      solo: false,
      clipStart: 0
    }, opts || {});
    createTrackNodes(tr);
    state.tracks.push(tr);
    renderTracks();
    renderMixer();
    return tr;
  }

  function removeTrack(id) {
    const idx = state.tracks.findIndex(t => t.id === id);
    if (idx === -1) return;
    const tr = state.tracks[idx];
    if (tr._source) { try { tr._source.stop(); } catch (e) {} }
    if (tr.nodes) { try { tr.nodes.gain.disconnect(); } catch (e) {} }
    state.tracks.splice(idx, 1);
    renderTracks();
    renderMixer();
  }

  function updateTrackGains() {
    const anySolo = state.tracks.some(t => t.solo) || state.seqTrack.solo;
    state.tracks.forEach(tr => {
      const audible = anySolo ? tr.solo : !tr.mute;
      tr.nodes.gain.gain.value = audible ? tr.volume : 0;
    });
    if (state.seqTrack.nodes) {
      const audible = anySolo ? state.seqTrack.solo : !state.seqTrack.mute;
      state.seqTrack.nodes.gain.gain.value = audible ? state.seqTrack.volume : 0;
    }
  }

  async function importFiles(fileLikeList, targetTrack, dropXSeconds) {
    ensureAudioContext();
    for (const item of fileLikeList) {
      try {
        const file = item.file || item;
        const arrayBuf = await file.arrayBuffer();
        const audioBuf = await actx.decodeAudioData(arrayBuf.slice(0));
        if (targetTrack) {
          targetTrack.buffer = audioBuf;
          targetTrack.fileName = file.name;
          if (targetTrack.name === 'Доріжка') targetTrack.name = file.name.replace(/\.[^.]+$/, '').slice(0, 24);
          if (typeof dropXSeconds === 'number') targetTrack.clipStart = Math.max(0, dropXSeconds);
        } else {
          const tr = addTrack({ name: file.name.replace(/\.[^.]+$/, '').slice(0, 24), fileName: file.name });
          tr.buffer = audioBuf;
          if (typeof dropXSeconds === 'number') tr.clipStart = Math.max(0, dropXSeconds);
        }
      } catch (err) {
        showToast('Не вдалося імпортувати файл: ' + (item.name || item.file?.name || ''));
      }
    }
    renderTracks();
    renderMixer();
  }

  /* ---------------------------------------------------------------------
     RENDER: TIMELINE
  --------------------------------------------------------------------- */
  function renderTracks() {
    const headersEl = document.getElementById('track-headers');
    const lanesEl = document.getElementById('tracks-lanes');
    const rulerEl = document.getElementById('timeline-ruler');
    headersEl.innerHTML = '';
    lanesEl.querySelectorAll('.st-track-lane').forEach(el => el.remove());

    const dur = projectDuration();
    const widthPx = Math.max(dur * PX_PER_SEC + 400, 1200);
    lanesEl.style.width = widthPx + 'px';
    rulerEl.style.width = widthPx + 'px';
    renderRuler(widthPx);

    state.tracks.forEach(tr => {
      const header = document.createElement('div');
      header.className = 'st-track-header';
      header.innerHTML = `
        <div class="st-track-header-top">
          <span class="st-track-color" style="background:${tr.color}"></span>
          <input class="st-track-name" value="${escapeHtml(tr.name)}" data-id="${tr.id}"/>
          <button class="st-track-remove" data-id="${tr.id}" title="Видалити">✕</button>
        </div>
        <div class="st-track-controls">
          <button class="st-mini-btn mute ${tr.mute ? 'active' : ''}" data-id="${tr.id}" data-act="mute">M</button>
          <button class="st-mini-btn solo ${tr.solo ? 'active' : ''}" data-id="${tr.id}" data-act="solo">S</button>
          <div class="st-track-vol"><input type="range" min="0" max="120" value="${Math.round(tr.volume * 100)}" data-id="${tr.id}" data-act="vol"/></div>
        </div>`;
      headersEl.appendChild(header);

      const lane = document.createElement('div');
      lane.className = 'st-track-lane';
      lane.style.width = widthPx + 'px';
      lane.dataset.id = tr.id;
      if (tr.buffer) {
        const clip = document.createElement('div');
        clip.className = 'st-clip';
        clip.style.left = (tr.clipStart * PX_PER_SEC) + 'px';
        clip.style.width = Math.max(30, tr.buffer.duration * PX_PER_SEC) + 'px';
        clip.style.borderColor = tr.color;
        clip.dataset.id = tr.id;
        clip.innerHTML = `<span class="st-clip-label">${escapeHtml(tr.fileName || tr.name)}</span><canvas></canvas>`;
        lane.appendChild(clip);
        requestAnimationFrame(() => drawWaveform(clip.querySelector('canvas'), tr.buffer, tr.color));
        makeClipDraggable(clip, tr);
      }
      lanesEl.appendChild(lane);
      wireLaneDropTarget(lane, tr);
    });

    lanesEl.appendChild(document.getElementById('playhead'));
    updatePlayheadPosition(state.playbackPosition);

    headersEl.querySelectorAll('.st-track-name').forEach(inp => {
      inp.addEventListener('change', e => {
        const tr = state.tracks.find(t => t.id == e.target.dataset.id);
        if (tr) tr.name = e.target.value || 'Доріжка';
      });
    });
    headersEl.querySelectorAll('.st-track-remove').forEach(btn => {
      btn.addEventListener('click', e => removeTrack(+e.target.dataset.id));
    });
    headersEl.querySelectorAll('.st-mini-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const tr = state.tracks.find(t => t.id == e.target.dataset.id);
        if (!tr) return;
        const act = e.target.dataset.act;
        tr[act] = !tr[act];
        updateTrackGains();
        renderTracks(); renderMixer();
      });
    });
    headersEl.querySelectorAll('[data-act="vol"]').forEach(inp => {
      inp.addEventListener('input', e => {
        const tr = state.tracks.find(t => t.id == e.target.dataset.id);
        if (!tr) return;
        tr.volume = e.target.value / 100;
        updateTrackGains();
        syncMixerFader(tr);
      });
    });
  }

  function renderRuler(widthPx) {
    const rulerEl = document.getElementById('timeline-ruler');
    const marksWrap = document.createElement('div');
    marksWrap.className = 'st-timeline-ruler-marks';
    const totalSec = Math.ceil(widthPx / PX_PER_SEC);
    for (let s = 0; s < totalSec; s++) {
      const mark = document.createElement('div');
      mark.className = 'st-ruler-mark';
      mark.style.width = PX_PER_SEC + 'px';
      if (s % 5 === 0) {
        const mm = Math.floor(s / 60), ss = s % 60;
        mark.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
      }
      marksWrap.appendChild(mark);
    }
    rulerEl.innerHTML = '';
    rulerEl.appendChild(marksWrap);
  }

  function drawWaveform(canvas, buffer, color) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, rect.width * dpr);
    canvas.height = Math.max(1, rect.height * dpr);
    const ctx2d = canvas.getContext('2d');
    ctx2d.scale(dpr, dpr);
    const data = buffer.getChannelData(0);
    const w = rect.width, h = rect.height;
    const step = Math.max(1, Math.floor(data.length / w));
    ctx2d.fillStyle = color;
    ctx2d.globalAlpha = 0.85;
    for (let x = 0; x < w; x++) {
      let min = 1, max = -1;
      const start = x * step;
      for (let i = 0; i < step; i++) {
        const v = data[start + i] || 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const y1 = (1 + min) * h / 2;
      const y2 = (1 + max) * h / 2;
      ctx2d.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
  }

  function makeClipDraggable(clipEl, tr) {
    let dragging = false, startX = 0, startClipStart = 0;
    clipEl.addEventListener('mousedown', e => {
      dragging = true; startX = e.clientX; startClipStart = tr.clipStart;
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const deltaSec = (e.clientX - startX) / PX_PER_SEC;
      tr.clipStart = Math.max(0, startClipStart + deltaSec);
      clipEl.style.left = (tr.clipStart * PX_PER_SEC) + 'px';
    });
    window.addEventListener('mouseup', () => {
      if (dragging) { dragging = false; renderTracks(); }
    });
  }

  function wireLaneDropTarget(lane, tr) {
    lane.addEventListener('dragover', e => { e.preventDefault(); lane.classList.add('drag-over'); });
    lane.addEventListener('dragleave', () => lane.classList.remove('drag-over'));
    lane.addEventListener('drop', e => {
      e.preventDefault(); lane.classList.remove('drag-over');
      const rect = lane.getBoundingClientRect();
      const xSec = (e.clientX - rect.left) / PX_PER_SEC;
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        importFiles(Array.from(e.dataTransfer.files), tr.buffer ? null : tr, xSec);
      } else if (window.__draggedBrowserItem) {
        importFiles([window.__draggedBrowserItem], tr.buffer ? null : tr, xSec);
      }
    });
  }

  function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ---------------------------------------------------------------------
     RENDER: SEQUENCER
  --------------------------------------------------------------------- */
  function renderSequencer() {
    const wrap = document.getElementById('seq-rows');
    wrap.innerHTML = '';
    const steps = totalSteps();
    DRUM_ROWS.forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.className = 'st-seq-row';
      const stepsHtml = [];
      for (let i = 0; i < steps; i++) {
        const active = state.pattern[row.key][i];
        stepsHtml.push(`<div class="st-seq-step ${active ? 'active' : ''} ${i % 4 === 0 ? 'beat-start' : ''}" data-row="${row.key}" data-step="${i}"></div>`);
      }
      rowEl.innerHTML = `<div class="st-seq-label">${row.label}</div><div class="st-seq-steps">${stepsHtml.join('')}</div>`;
      wrap.appendChild(rowEl);
    });
    wrap.querySelectorAll('.st-seq-step').forEach(el => {
      el.addEventListener('click', () => {
        const row = el.dataset.row, step = +el.dataset.step;
        state.pattern[row][step] = !state.pattern[row][step];
        el.classList.toggle('active');
        if (state.pattern[row][step]) {
          ensureAudioContext();
          if (actx.state === 'suspended') actx.resume();
          DRUM_FN[row](actx, state.seqTrack.nodes ? state.seqTrack.nodes.gain : graph.mixBus, actx.currentTime);
        }
      });
    });
  }

  /* ---------------------------------------------------------------------
     RENDER: MIXER
  --------------------------------------------------------------------- */
  function renderMixer() {
    const wrap = document.getElementById('mixer-strips');
    wrap.innerHTML = '';
    state.tracks.forEach(tr => wrap.appendChild(buildStrip({
      id: 'track-' + tr.id, name: tr.name, color: tr.color,
      volume: tr.volume, pan: tr.pan, mute: tr.mute, solo: tr.solo,
      vuId: 'vu-' + tr.id,
      onVol: v => { tr.volume = v; updateTrackGains(); },
      onPan: v => { tr.pan = v; tr.nodes.pan.pan.value = v; },
      onMute: () => { tr.mute = !tr.mute; updateTrackGains(); renderTracks(); renderMixer(); },
      onSolo: () => { tr.solo = !tr.solo; updateTrackGains(); renderTracks(); renderMixer(); }
    })));
    wrap.appendChild(buildStrip({
      id: 'seq', name: 'Beat', color: 'var(--cyan)',
      volume: state.seqTrack.volume, pan: state.seqTrack.pan, mute: state.seqTrack.mute, solo: state.seqTrack.solo,
      vuId: 'vu-seq',
      onVol: v => { state.seqTrack.volume = v; updateTrackGains(); },
      onPan: v => { state.seqTrack.pan = v; },
      onMute: () => { state.seqTrack.mute = !state.seqTrack.mute; updateTrackGains(); renderMixer(); },
      onSolo: () => { state.seqTrack.solo = !state.seqTrack.solo; updateTrackGains(); renderMixer(); }
    }));
    const master = document.createElement('div');
    master.className = 'st-strip master-strip';
    master.innerHTML = `
      <div class="st-strip-name">MASTER</div>
      <div class="st-pan-knob" style="opacity:.15;pointer-events:none"></div>
      <div class="st-strip-fader-area">
        <div class="st-vu-meter"><div class="st-vu-fill" id="master-vu"></div></div>
        <input type="range" class="st-fader" id="master-fader" min="0" max="120" value="${Math.round(state.masterVolume * 100)}"/>
      </div>
      <span class="st-db-label" id="master-db">0 dB</span>`;
    wrap.appendChild(master);
    document.getElementById('master-fader').addEventListener('input', e => {
      state.masterVolume = e.target.value / 100;
      applyFxToGraph();
      document.getElementById('master-volume').value = e.target.value;
    });
  }

  function buildStrip(cfg) {
    const strip = document.createElement('div');
    strip.className = 'st-strip';
    strip.innerHTML = `
      <div class="st-strip-name" style="color:${cfg.color}">${escapeHtml(cfg.name)}</div>
      <div class="st-pan-knob" id="pan-${cfg.id}"></div>
      <span class="st-pan-label">Pan</span>
      <div class="st-strip-fader-area">
        <div class="st-vu-meter"><div class="st-vu-fill" id="${cfg.vuId}"></div></div>
        <input type="range" class="st-fader" min="0" max="120" value="${Math.round(cfg.volume * 100)}"/>
      </div>
      <span class="st-db-label">Vol</span>
      <div class="st-strip-btns">
        <button class="st-mini-btn mute ${cfg.mute ? 'active' : ''}">M</button>
        <button class="st-mini-btn solo ${cfg.solo ? 'active' : ''}">S</button>
      </div>`;
    strip.querySelector('.st-fader').addEventListener('input', e => cfg.onVol(e.target.value / 100));
    strip.querySelector('.mute').addEventListener('click', cfg.onMute);
    strip.querySelector('.solo').addEventListener('click', cfg.onSolo);
    initPanKnob(strip.querySelector('.st-pan-knob'), cfg.pan, cfg.onPan);
    return strip;
  }

  function syncMixerFader() { renderMixer(); }

  function initPanKnob(el, initial, onChange) {
    let val = initial;
    const render = () => { el.style.transform = `rotate(${val * 135}deg)`; };
    render();
    let dragging = false, startY = 0, startVal = 0;
    el.addEventListener('mousedown', e => { dragging = true; startY = e.clientY; startVal = val; });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const delta = (startY - e.clientY) / 100;
      val = Math.max(-1, Math.min(1, startVal + delta));
      render(); onChange(val);
    });
    window.addEventListener('mouseup', () => dragging = false);
    el.addEventListener('dblclick', () => { val = 0; render(); onChange(val); });
  }

  /* ---------------------------------------------------------------------
     KNOBS (FX rack)
  --------------------------------------------------------------------- */
  function initKnob(id, valId, fmt, onChange) {
    const el = document.getElementById(id);
    if (!el) return;
    const min = parseFloat(el.dataset.min), max = parseFloat(el.dataset.max);
    let val = parseFloat(el.dataset.val);
    const valEl = document.getElementById(valId);
    function render() {
      const pct = (val - min) / (max - min);
      el.style.transform = `rotate(${(pct * 270) - 135}deg)`;
      if (valEl) valEl.textContent = fmt(val);
    }
    render();
    let dragging = false, startY = 0, startVal = 0;
    el.addEventListener('mousedown', e => { dragging = true; startY = e.clientY; startVal = val; });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const range = max - min;
      const delta = ((startY - e.clientY) / 140) * range;
      val = Math.max(min, Math.min(max, startVal + delta));
      render(); onChange(val);
    });
    window.addEventListener('mouseup', () => dragging = false);
    return { set: v => { val = v; render(); } };
  }

  function initAllKnobs() {
    initKnob('knob-eq-low', 'val-eq-low', v => v.toFixed(0) + ' dB', v => { state.fx.eqLow = v; applyFxToGraph(); });
    initKnob('knob-eq-mid', 'val-eq-mid', v => v.toFixed(0) + ' dB', v => { state.fx.eqMid = v; applyFxToGraph(); });
    initKnob('knob-eq-high', 'val-eq-high', v => v.toFixed(0) + ' dB', v => { state.fx.eqHigh = v; applyFxToGraph(); });
    initKnob('knob-comp-thresh', 'val-comp-thresh', v => v.toFixed(0) + ' dB', v => { state.fx.compThresh = v; applyFxToGraph(); });
    initKnob('knob-comp-ratio', 'val-comp-ratio', v => v.toFixed(0) + ':1', v => { state.fx.compRatio = v; applyFxToGraph(); });
    initKnob('knob-comp-release', 'val-comp-release', v => v.toFixed(0) + ' ms', v => { state.fx.compRelease = v / 1000; applyFxToGraph(); });
    initKnob('knob-delay-time', 'val-delay-time', v => v.toFixed(0) + ' ms', v => { state.fx.delayTime = v / 1000; applyFxToGraph(); });
    initKnob('knob-delay-fb', 'val-delay-fb', v => v.toFixed(0) + '%', v => { state.fx.delayFb = v / 100; applyFxToGraph(); });
    initKnob('knob-delay-mix', 'val-delay-mix', v => v.toFixed(0) + '%', v => { state.fx.delayMix = v / 100; applyFxToGraph(); });
    initKnob('knob-reverb-size', 'val-reverb-size', v => v.toFixed(1) + ' s', v => { state.fx.reverbSize = v; regenerateImpulse(); });
    initKnob('knob-reverb-decay', 'val-reverb-decay', v => v.toFixed(1), v => { state.fx.reverbDecay = v; regenerateImpulse(); });
    initKnob('knob-reverb-mix', 'val-reverb-mix', v => v.toFixed(0) + '%', v => { state.fx.reverbMix = v / 100; applyFxToGraph(); });
    initKnob('knob-dist-amount', 'val-dist-amount', v => v.toFixed(0) + '%', v => { state.fx.distAmount = v / 100; applyFxToGraph(); });
    initKnob('knob-dist-mix', 'val-dist-mix', v => v.toFixed(0) + '%', v => { state.fx.distMix = v / 100; applyFxToGraph(); });

    document.getElementById('fx-eq-on').addEventListener('change', e => { state.fx.eqOn = e.target.checked; applyFxToGraph(); });
    document.getElementById('fx-comp-on').addEventListener('change', e => { state.fx.compOn = e.target.checked; applyFxToGraph(); });
    document.getElementById('fx-delay-on').addEventListener('change', e => { state.fx.delayOn = e.target.checked; applyFxToGraph(); });
    document.getElementById('fx-reverb-on').addEventListener('change', e => { state.fx.reverbOn = e.target.checked; applyFxToGraph(); });
    document.getElementById('fx-dist-on').addEventListener('change', e => { state.fx.distOn = e.target.checked; applyFxToGraph(); });
  }

  /* ---------------------------------------------------------------------
     TOAST
  --------------------------------------------------------------------- */
  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ---------------------------------------------------------------------
     SAMPLE BROWSER / FOLDER IMPORT
  --------------------------------------------------------------------- */
  const AUDIO_RE = /\.(mp3|wav|ogg|m4a|flac|aac|webm)$/i;

  async function openFolder() {
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        const items = [];
        for await (const [name, handle] of dirHandle.entries()) {
          if (handle.kind === 'file' && AUDIO_RE.test(name)) {
            const file = await handle.getFile();
            items.push(file);
          }
        }
        if (!items.length) { showToast('У цій папці не знайдено аудіофайлів.'); return; }
        state.browserItems = items;
        renderBrowserItems();
        openBrowserDrawer();
      } catch (e) { /* user cancelled */ }
    } else {
      document.getElementById('input-file-fallback').click();
    }
  }

  function renderBrowserItems() {
    const list = document.getElementById('browser-list');
    list.innerHTML = '';
    state.browserItems.forEach((file, i) => {
      const item = document.createElement('div');
      item.className = 'st-browser-item';
      item.draggable = true;
      item.innerHTML = `♪ ${escapeHtml(file.name)}`;
      item.addEventListener('dragstart', () => { window.__draggedBrowserItem = file; });
      item.addEventListener('click', () => importFiles([file], null, null));
      list.appendChild(item);
    });
  }

  function openBrowserDrawer() { document.getElementById('sample-browser').classList.add('open'); }
  function closeBrowserDrawer() { document.getElementById('sample-browser').classList.remove('open'); }

  /* ---------------------------------------------------------------------
     PERSISTENCE — IndexedDB
  --------------------------------------------------------------------- */
  const DB_NAME = 'inkbeat-studio';
  const DB_STORE = 'projects';
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbSet(key, val) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveProject() {
    ensureAudioContext();
    const payload = {
      bpm: state.bpm, seqBars: state.seqBars, seqSwing: state.seqSwing,
      pattern: state.pattern, fx: state.fx, masterVolume: state.masterVolume,
      seqTrack: { volume: state.seqTrack.volume, pan: state.seqTrack.pan, mute: state.seqTrack.mute, solo: state.seqTrack.solo },
      tracks: await Promise.all(state.tracks.map(async tr => ({
        id: tr.id, name: tr.name, color: tr.color, fileName: tr.fileName,
        volume: tr.volume, pan: tr.pan, mute: tr.mute, solo: tr.solo, clipStart: tr.clipStart,
        audio: tr.buffer ? await bufferToWavArrayBuffer(tr.buffer) : null
      })))
    };
    await idbSet('current', payload);
    showToast('Проєкт збережено локально на цьому пристрої ✓');
  }

  async function loadProjectFromDB() {
    try {
      const payload = await idbGet('current');
      if (!payload) return;
      ensureAudioContext();
      state.bpm = payload.bpm || 120;
      state.seqBars = payload.seqBars || 2;
      state.seqSwing = payload.seqSwing || 0;
      state.pattern = payload.pattern || state.pattern;
      Object.assign(state.fx, payload.fx || {});
      state.masterVolume = payload.masterVolume ?? 0.85;
      if (payload.seqTrack) Object.assign(state.seqTrack, payload.seqTrack);

      document.getElementById('bpm-input').value = state.bpm;
      document.getElementById('seq-bars').value = state.seqBars;
      document.getElementById('seq-swing').value = state.seqSwing;
      document.getElementById('master-volume').value = Math.round(state.masterVolume * 100);

      for (const trData of (payload.tracks || [])) {
        const tr = addTrack({ name: trData.name, color: trData.color, fileName: trData.fileName,
          volume: trData.volume, pan: trData.pan, mute: trData.mute, solo: trData.solo, clipStart: trData.clipStart });
        tr.nodes.pan.pan.value = trData.pan;
        if (trData.audio) {
          const audioBuf = await actx.decodeAudioData(trData.audio.slice(0));
          tr.buffer = audioBuf;
        }
      }
      updateTrackGains();
      renderTracks(); renderSequencer(); renderMixer(); applyFxToGraph(); regenerateImpulse();
      showToast('Проєкт відновлено з локального сховища');
    } catch (e) { console.error(e); }
  }

  function newProject() {
    if (!confirm('Створити новий проєкт? Незбережені зміни буде втрачено.')) return;
    stop();
    state.tracks.forEach(tr => { if (tr.nodes) try { tr.nodes.gain.disconnect(); } catch (e) {} });
    state.tracks = [];
    DRUM_ROWS.forEach(r => { state.pattern[r.key] = new Array(64).fill(false); });
    renderTracks(); renderSequencer(); renderMixer();
    showToast('Новий проєкт створено');
  }

  /* ---------------------------------------------------------------------
     WAV ENCODE / EXPORT
  --------------------------------------------------------------------- */
  function audioBufferToWavBlob(buffer) {
    const numCh = buffer.numberOfChannels;
    const len = buffer.length * numCh * 2 + 44;
    const arrBuf = new ArrayBuffer(len);
    const view = new DataView(arrBuf);
    const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF'); view.setUint32(4, len - 8, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true); view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * numCh * 2, true); view.setUint16(32, numCh * 2, true);
    view.setUint16(34, 16, true); writeStr(36, 'data'); view.setUint32(40, len - 44, true);
    let offset = 44;
    const chans = []; for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numCh; c++) {
        let s = Math.max(-1, Math.min(1, chans[c][i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
      }
    }
    return new Blob([arrBuf], { type: 'audio/wav' });
  }

  function bufferToWavArrayBuffer(buffer) {
    return audioBufferToWavBlob(buffer).arrayBuffer();
  }

  async function exportMix() {
    ensureAudioContext();
    showToast('Рендеринг міксу…');
    const dur = projectDuration() + 0.5;
    const offlineCtx = new OfflineAudioContext(2, Math.ceil(dur * actx.sampleRate), actx.sampleRate);

    // rebuild the same FX graph offline
    const savedGraph = Object.assign({}, graph);
    buildGraphInto(offlineCtx);

    // tracks
    state.tracks.forEach(tr => {
      if (!tr.buffer) return;
      const src = offlineCtx.createBufferSource(); src.buffer = tr.buffer;
      const g = offlineCtx.createGain();
      const anySolo = state.tracks.some(t => t.solo) || state.seqTrack.solo;
      const audible = anySolo ? tr.solo : !tr.mute;
      g.gain.value = audible ? tr.volume : 0;
      const p = offlineCtx.createStereoPanner(); p.pan.value = tr.pan;
      src.connect(g); g.connect(p); p.connect(graph.mixBus);
      src.start(tr.clipStart);
    });

    // sequencer pattern — repeat to fill duration
    const stepDur = stepDuration();
    const steps = totalSteps();
    const patternLen = steps * stepDur;
    const anySoloSeq = state.tracks.some(t => t.solo) || state.seqTrack.solo;
    const seqAudible = anySoloSeq ? state.seqTrack.solo : !state.seqTrack.mute;
    const seqGain = offlineCtx.createGain(); seqGain.gain.value = seqAudible ? state.seqTrack.volume : 0;
    seqGain.connect(graph.mixBus);
    if (patternLen > 0) {
      for (let t0 = 0; t0 < dur; t0 += patternLen) {
        for (let i = 0; i < steps; i++) {
          const t = t0 + i * stepDur;
          if (t >= dur) break;
          DRUM_ROWS.forEach(row => {
            if (state.pattern[row.key][i]) DRUM_FN[row.key](offlineCtx, seqGain, t);
          });
        }
      }
    }

    applyFxToGraphOn();
    regenerateImpulseOn(offlineCtx);

    const rendered = await offlineCtx.startRendering();
    Object.keys(graph).forEach(k => delete graph[k]);
    Object.assign(graph, savedGraph);

    const blob = audioBufferToWavBlob(rendered);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'inkbeat-mix.wav';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast('Мікс експортовано у WAV ✓');
  }

  // helper variants of graph builder / fx apply that work against an explicit context (used for offline export)
  function buildGraphInto(ctx) { buildGraph(ctx); }
  function applyFxToGraphOn() { applyFxToGraph(); }
  function regenerateImpulseOn(ctx) {
    const dur = state.fx.reverbSize, decay = state.fx.reverbDecay, rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * dur));
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    graph.convolver.buffer = buf;
  }

  /* ---------------------------------------------------------------------
     WIRING / INIT
  --------------------------------------------------------------------- */
  function wireTabs() {
    document.querySelectorAll('.st-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.st-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.st-view').forEach(v => v.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('view-' + tab.dataset.view).classList.add('active');
      });
    });
  }

  function wireTransport() {
    document.getElementById('btn-play').addEventListener('click', () => { state.isPlaying ? pause() : play(); });
    document.getElementById('btn-stop').addEventListener('click', stop);
    document.getElementById('btn-loop').addEventListener('click', e => {
      state.isLooping = !state.isLooping;
      e.currentTarget.classList.toggle('active', state.isLooping);
    });
    document.getElementById('bpm-input').addEventListener('change', e => {
      state.bpm = Math.max(40, Math.min(240, +e.target.value || 120));
    });
    document.getElementById('master-volume').addEventListener('input', e => {
      state.masterVolume = e.target.value / 100;
      applyFxToGraph();
      const mf = document.getElementById('master-fader');
      if (mf) mf.value = e.target.value;
    });
    document.addEventListener('keydown', e => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        state.isPlaying ? pause() : play();
      }
    });
  }

  function wireTopbar() {
    document.getElementById('btn-new-project').addEventListener('click', newProject);
    document.getElementById('btn-save-project').addEventListener('click', saveProject);
    document.getElementById('btn-export-wav').addEventListener('click', exportMix);
    document.getElementById('btn-open-folder').addEventListener('click', openFolder);
    document.getElementById('input-file-fallback').addEventListener('change', e => {
      const files = Array.from(e.target.files);
      state.browserItems = files;
      renderBrowserItems();
      openBrowserDrawer();
      e.target.value = '';
    });
    document.getElementById('browser-close').addEventListener('click', closeBrowserDrawer);
  }

  function wireTimelineDrop() {
    const scroll = document.getElementById('timeline-scroll');
    ['dragover', 'drop'].forEach(evt => scroll.addEventListener(evt, e => e.preventDefault()));
    document.getElementById('btn-add-track').addEventListener('click', () => addTrack());

    document.addEventListener('dragover', e => {
      if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); document.getElementById('drop-overlay').classList.add('active'); }
    });
    document.addEventListener('dragleave', e => {
      if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        document.getElementById('drop-overlay').classList.remove('active');
      }
    });
    document.addEventListener('drop', e => {
      document.getElementById('drop-overlay').classList.remove('active');
      if (e.target.closest('.st-track-lane')) return; // handled by lane's own listener
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        e.preventDefault();
        importFiles(Array.from(e.dataTransfer.files));
      }
    });
  }

  /* ---------------------------------------------------------------------
     GENRE PRESETS — quick-start drum patterns (16-step base, tiled per bar)
  --------------------------------------------------------------------- */
  const GENRE_PRESETS = {
    hiphop: { bpm: 90,  pattern: {
      kick:  [1,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hihat: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      ohat:  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      clap:  [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      tom:   [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      perc:  [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0]
    }},
    trap: { bpm: 140, pattern: {
      kick:  [1,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hihat: [1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1],
      ohat:  [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
      clap:  [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      tom:   [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      perc:  [0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0]
    }},
    lofi: { bpm: 78, pattern: {
      kick:  [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,1],
      hihat: [1,0,1,0,1,0,1,1,1,0,1,0,1,0,1,0],
      ohat:  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      clap:  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      tom:   [0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0],
      perc:  [0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0]
    }},
    house: { bpm: 124, pattern: {
      kick:  [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
      snare: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      hihat: [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
      ohat:  [0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1],
      clap:  [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      tom:   [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      perc:  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
    }},
    dnb: { bpm: 172, pattern: {
      kick:  [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hihat: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      ohat:  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      clap:  [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      tom:   [0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,0],
      perc:  [0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0]
    }}
  };

  function applyGenrePreset(key) {
    const preset = GENRE_PRESETS[key];
    if (!preset) return;
    state.bpm = preset.bpm;
    document.getElementById('bpm-input').value = preset.bpm;
    const steps = totalSteps();
    DRUM_ROWS.forEach(row => {
      const base = preset.pattern[row.key] || new Array(16).fill(0);
      const arr = new Array(64).fill(false);
      for (let i = 0; i < steps; i++) arr[i] = !!base[i % 16];
      state.pattern[row.key] = arr;
    });
    renderSequencer();
    showToast(`Пресет «${key}» застосовано`);
  }

  /* ---------------------------------------------------------------------
     TAP TEMPO
  --------------------------------------------------------------------- */
  let tapTimes = [];
  function tapTempo() {
    const now = performance.now();
    tapTimes.push(now);
    if (tapTimes.length > 5) tapTimes.shift();
    if (tapTimes.length < 2) return;
    const intervals = [];
    for (let i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i - 1]);
    const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avgMs > 2000) { tapTimes = [now]; return; }
    const bpm = Math.round(60000 / avgMs);
    state.bpm = Math.max(40, Math.min(240, bpm));
    document.getElementById('bpm-input').value = state.bpm;
  }

  /* ---------------------------------------------------------------------
     TIMELINE ZOOM
  --------------------------------------------------------------------- */
  function zoomTimeline(factor) {
    PX_PER_SEC = Math.max(20, Math.min(240, PX_PER_SEC * factor));
    renderTracks();
  }

  function wireSequencerToolbar() {
    document.getElementById('seq-bars').addEventListener('change', e => {
      state.seqBars = +e.target.value;
      renderSequencer(); renderTracks();
    });
    document.getElementById('seq-swing').addEventListener('input', e => { state.seqSwing = +e.target.value; });
    document.getElementById('btn-seq-clear').addEventListener('click', () => {
      DRUM_ROWS.forEach(r => state.pattern[r.key] = new Array(64).fill(false));
      renderSequencer();
    });
    document.getElementById('btn-seq-random').addEventListener('click', () => {
      const steps = totalSteps();
      DRUM_ROWS.forEach(r => {
        for (let i = 0; i < steps; i++) state.pattern[r.key][i] = Math.random() < (r.key === 'kick' ? 0.25 : r.key === 'hihat' ? 0.4 : 0.15);
      });
      renderSequencer();
    });
    document.getElementById('seq-preset').addEventListener('change', e => {
      if (e.target.value) applyGenrePreset(e.target.value);
      e.target.value = '';
    });
  }

  function wireZoomAndTap() {
    document.getElementById('btn-zoom-in').addEventListener('click', () => zoomTimeline(1.3));
    document.getElementById('btn-zoom-out').addEventListener('click', () => zoomTimeline(1 / 1.3));
    document.getElementById('btn-tap-tempo').addEventListener('click', tapTempo);
  }

  function init() {
    wireTabs();
    wireTransport();
    wireTopbar();
    wireTimelineDrop();
    wireSequencerToolbar();
    wireZoomAndTap();
    renderTracks();
    renderSequencer();
    renderMixer();
    initAllKnobs();
    loadProjectFromDB();
    setInterval(() => { if (!state.isPlaying) drawSpectrum(); }, 200);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
