
(function () {
  'use strict';

  const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
  let actx = null;

  let PX_PER_SEC = 70;
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

  
  const PIANO_NOTES = [];
  for (let midi = 72; midi >= 48; midi--) {
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const name = names[midi % 12] + (Math.floor(midi / 12) - 1);
    const isBlack = names[midi % 12].includes('#');
    PIANO_NOTES.push({ midi, name, isBlack });
  }
  function midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  
  const KITS = {
    modern:   { kickStart:150, kickEnd:35, kickDecay:0.28, snareFreq:1800, snareDecay:0.18, hatClosed:0.06, hatOpen:0.35, clapFreq:1500, tomStart:180, tomEnd:70, tomDecay:0.32, lofi:false },
    '808':    { kickStart:120, kickEnd:28, kickDecay:0.5,  snareFreq:1600, snareDecay:0.22, hatClosed:0.05, hatOpen:0.3,  clapFreq:1400, tomStart:140, tomEnd:50, tomDecay:0.4,  lofi:false },
    acoustic: { kickStart:170, kickEnd:50, kickDecay:0.18, snareFreq:2200, snareDecay:0.14, hatClosed:0.045,hatOpen:0.22, clapFreq:1700, tomStart:220, tomEnd:90, tomDecay:0.22, lofi:false },
    lofi:     { kickStart:140, kickEnd:40, kickDecay:0.3,  snareFreq:1500, snareDecay:0.2,  hatClosed:0.07, hatOpen:0.3,  clapFreq:1200, tomStart:160, tomEnd:60, tomDecay:0.3,  lofi:true }
  };
  function currentKit() { return KITS[state.kit] || KITS.modern; }

  
  const state = {
    tracks: [],
    nextTrackId: 1,
    bpm: 120,
    seqBars: 2,
    seqSwing: 0,
    kit: 'modern',
    pattern: {},
    melody: {},
    melodyBars: 2,
    melodyInstrument: 'bass',
    isPlaying: false,
    isLooping: false,
    metronomeOn: false,
    playbackPosition: 0,
    originTime: 0,
    schedulerTimer: null,
    nextStepTime: 0,
    currentStepIndex: 0,
    rafId: null,
    seqTrack: { volume: 0.9, pan: 0, mute: false, solo: false, nodes: null },
    melodyTrack: { volume: 0.8, pan: 0, mute: false, solo: false, nodes: null },
    fx: {
      eqOn: true, eqLow: 0, eqMid: 0, eqHigh: 0,
      compOn: true, compThresh: -24, compRatio: 4, compRelease: 0.25,
      delayOn: false, delayTime: 0.28, delayFb: 0.35, delayMix: 0.25,
      reverbOn: false, reverbSize: 2.2, reverbDecay: 3.0, reverbMix: 0.20,
      distOn: false, distAmount: 0.20, distMix: 0.5
    },
    sidechain: { on: false, amount: 0.6, release: 0.18 },
    masterVolume: 0.85,
    browserItems: [],
    currentProjectId: null,
    currentProjectName: 'Проєкт без назви'
  };
  DRUM_ROWS.forEach(r => { state.pattern[r.key] = new Array(64).fill(false); });
  PIANO_NOTES.forEach(n => { state.melody[n.midi] = new Array(64).fill(false); });

  const trackBufferCache = new Map();

  
  const graph = {};

  function ensureAudioContext() {
    if (actx) return actx;
    actx = new AudioCtxClass();
    buildGraph(actx);
    return actx;
  }

  function buildGraph(ctx) {
    const mixBus = ctx.createGain(); mixBus.gain.value = 1;

    const duckGain = ctx.createGain(); duckGain.gain.value = 1;

    const distIn = ctx.createGain();
    const distDry = ctx.createGain();
    const distShaper = ctx.createWaveShaper(); distShaper.oversample = '2x';
    const distWet = ctx.createGain();
    const distOut = ctx.createGain();
    distIn.connect(distDry); distDry.connect(distOut);
    distIn.connect(distShaper); distShaper.connect(distWet); distWet.connect(distOut);

    const eqLow = ctx.createBiquadFilter(); eqLow.type = 'lowshelf'; eqLow.frequency.value = 200;
    const eqMid = ctx.createBiquadFilter(); eqMid.type = 'peaking'; eqMid.frequency.value = 1200; eqMid.Q.value = 0.9;
    const eqHigh = ctx.createBiquadFilter(); eqHigh.type = 'highshelf'; eqHigh.frequency.value = 5000;
    distOut.connect(eqLow); eqLow.connect(eqMid); eqMid.connect(eqHigh);

    const compressor = ctx.createDynamicsCompressor();
    eqHigh.connect(compressor);

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

    const reverbIn = ctx.createGain();
    const reverbDry = ctx.createGain();
    const convolver = ctx.createConvolver();
    const reverbWet = ctx.createGain();
    const reverbOut = ctx.createGain();
    delayOut.connect(reverbIn);
    reverbIn.connect(reverbDry); reverbDry.connect(reverbOut);
    reverbIn.connect(convolver); convolver.connect(reverbWet); reverbWet.connect(reverbOut);

    const masterGain = ctx.createGain();
    const masterAnalyser = ctx.createAnalyser(); masterAnalyser.fftSize = 1024;
    reverbOut.connect(masterGain); masterGain.connect(masterAnalyser); masterAnalyser.connect(ctx.destination);

    const seqGain = ctx.createGain();
    const seqAnalyser = ctx.createAnalyser(); seqAnalyser.fftSize = 512;
    seqGain.connect(seqAnalyser); seqAnalyser.connect(mixBus);
    state.seqTrack.nodes = { gain: seqGain, analyser: seqAnalyser };

    const meloGain = ctx.createGain();
    const meloAnalyser = ctx.createAnalyser(); meloAnalyser.fftSize = 512;
    meloGain.connect(meloAnalyser); meloAnalyser.connect(mixBus);
    state.melodyTrack.nodes = { gain: meloGain, analyser: meloAnalyser };

    mixBus.connect(duckGain);
    duckGain.connect(distIn);

    const metronomeGain = ctx.createGain(); metronomeGain.gain.value = 0.5;
    metronomeGain.connect(ctx.destination);

    Object.assign(graph, {
      ctx, mixBus, duckGain, distIn, distDry, distShaper, distWet, distOut,
      eqLow, eqMid, eqHigh, compressor,
      delayIn, delayDry, delayNode, delayFeedback, delayWet, delayOut,
      reverbIn, reverbDry, convolver, reverbWet, reverbOut,
      masterGain, masterAnalyser, metronomeGain
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

  function makeCrunchCurve() {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.round(x * 10) / 10;
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

  
  function triggerSidechain(ctx, duckNode, t) {
    if (!state.sidechain.on) return;
    const amt = state.sidechain.amount;
    const rel = state.sidechain.release;
    duckNode.gain.cancelScheduledValues(t);
    duckNode.gain.setValueAtTime(Math.max(0.05, 1 - amt), t);
    duckNode.gain.linearRampToValueAtTime(1, t + rel);
  }

  
  function noiseBuffer(ctx, duration) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function maybeLofi(ctx, node, kit) {
    if (!kit.lofi) return node;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    const crunch = ctx.createWaveShaper(); crunch.curve = makeCrunchCurve();
    node.connect(lp); lp.connect(crunch);
    return crunch;
  }

  function playKick(ctx, dest, t, kit) {
    kit = kit || currentKit();
    const osc = ctx.createOscillator(); osc.type = 'sine';
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(kit.kickStart, t);
    osc.frequency.exponentialRampToValueAtTime(kit.kickEnd, t + kit.kickDecay * 0.5);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + kit.kickDecay);
    osc.connect(g);
    maybeLofi(ctx, g, kit).connect(dest);
    osc.start(t); osc.stop(t + kit.kickDecay + 0.05);
  }

  function playSnare(ctx, dest, t, kit) {
    kit = kit || currentKit();
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer(ctx, kit.snareDecay + 0.05);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = kit.snareFreq;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.9, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + kit.snareDecay);
    noise.connect(bp); bp.connect(ng);
    maybeLofi(ctx, ng, kit).connect(dest);
    const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = kit.snareFreq / 10;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.6, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + kit.snareDecay * 0.65);
    osc.connect(og); og.connect(dest);
    noise.start(t); noise.stop(t + kit.snareDecay + 0.05);
    osc.start(t); osc.stop(t + kit.snareDecay * 0.7);
  }

  function playHat(ctx, dest, t, open, kit) {
    kit = kit || currentKit();
    const dur = open ? kit.hatOpen : kit.hatClosed;
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer(ctx, dur);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(hp); hp.connect(g);
    maybeLofi(ctx, g, kit).connect(dest);
    noise.start(t); noise.stop(t + dur);
  }

  function playClap(ctx, dest, t, kit) {
    kit = kit || currentKit();
    for (let i = 0; i < 3; i++) {
      const off = t + i * 0.012;
      const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer(ctx, 0.08);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = kit.clapFreq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, off);
      g.gain.exponentialRampToValueAtTime(0.001, off + 0.07);
      noise.connect(bp); bp.connect(g);
      maybeLofi(ctx, g, kit).connect(dest);
      noise.start(off); noise.stop(off + 0.08);
    }
  }

  function playTom(ctx, dest, t, kit) {
    kit = kit || currentKit();
    const osc = ctx.createOscillator(); osc.type = 'sine';
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(kit.tomStart, t);
    osc.frequency.exponentialRampToValueAtTime(kit.tomEnd, t + kit.tomDecay * 0.6);
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + kit.tomDecay);
    osc.connect(g);
    maybeLofi(ctx, g, kit).connect(dest);
    osc.start(t); osc.stop(t + kit.tomDecay + 0.05);
  }

  function playPerc(ctx, dest, t, kit) {
    kit = kit || currentKit();
    const osc = ctx.createOscillator(); osc.type = 'triangle';
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.08);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g);
    maybeLofi(ctx, g, kit).connect(dest);
    osc.start(t); osc.stop(t + 0.11);
  }

  const DRUM_FN = { kick: playKick, snare: playSnare, clap: playClap, tom: playTom, perc: playPerc,
    hihat: (c, d, t, k) => playHat(c, d, t, false, k), ohat: (c, d, t, k) => playHat(c, d, t, true, k) };

  
  function playSynthNote(ctx, dest, freq, t, dur, instrument) {
    if (instrument === 'bass') {
      const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = freq;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.8, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(lp); lp.connect(g); g.connect(dest);
      osc.start(t); osc.stop(t + dur + 0.05);
    } else if (instrument === 'lead') {
      const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = freq;
      const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 2600; bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(bp); bp.connect(g); g.connect(dest);
      osc.start(t); osc.stop(t + dur + 0.05);
    } else if (instrument === 'pad') {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.18);
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3);
      [0, -6, 7].forEach(detune => {
        const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq; osc.detune.value = detune;
        osc.connect(g);
        osc.start(t); osc.stop(t + dur + 0.35);
      });
      g.connect(dest);
    } else {
      const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = freq;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(4000, t);
      lp.frequency.exponentialRampToValueAtTime(300, t + 0.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + Math.min(dur, 0.25));
      osc.connect(lp); lp.connect(g); g.connect(dest);
      osc.start(t); osc.stop(t + 0.3);
    }
  }

  
  function totalSteps() { return state.seqBars * 16; }
  function melodyTotalSteps() { return state.melodyBars * 16; }
  function stepDuration() { return (60 / state.bpm) / 4; }

  function projectDuration() {
    let end = 0;
    state.tracks.forEach(tr => { if (tr.buffer) end = Math.max(end, tr.clipStart + clipDuration(tr)); });
    const seqLen = totalSteps() * stepDuration();
    if (end === 0) end = seqLen * 4;
    return Math.max(end, seqLen);
  }

  function clipDuration(tr) {
    if (!tr.buffer) return 0;
    const full = tr.buffer.duration - (tr.trimStart || 0);
    return tr.trimDuration != null ? Math.min(tr.trimDuration, full) : full;
  }

  function play() {
    ensureAudioContext();
    if (actx.state === 'suspended') actx.resume();
    if (state.isPlaying) return;
    state.isPlaying = true;
    state.originTime = actx.currentTime - state.playbackPosition;
    state.nextStepTime = state.originTime + Math.ceil(state.playbackPosition / stepDuration()) * stepDuration();
    state.currentStepIndex = Math.round((state.nextStepTime - state.originTime) / stepDuration());

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
      const dur = clipDuration(tr);
      const clipEnd = tr.clipStart + dur;
      if (clipEnd <= pos) return;
      const src = actx.createBufferSource();
      src.buffer = tr.buffer;
      src.playbackRate.value = tr.playbackRate || 1;
      src.connect(tr.nodes.gain);
      let when, offsetIntoClip;
      if (tr.clipStart >= pos) { when = state.originTime + tr.clipStart; offsetIntoClip = 0; }
      else { when = actx.currentTime; offsetIntoClip = pos - tr.clipStart; }
      const bufferOffset = (tr.trimStart || 0) + offsetIntoClip;
      const remaining = dur - offsetIntoClip;
      applyClipGainEnvelope(tr, when, Math.max(0, remaining));
      try { src.start(when, bufferOffset, Math.max(0, remaining)); } catch (e) {}
      tr._source = src;
    });
  }

  function applyClipGainEnvelope(tr, when, remaining) {
    const g = tr.nodes.gain.gain;
    const vol = tr.volume;
    g.cancelScheduledValues(when);
    const fadeIn = Math.min(tr.fadeIn || 0, remaining);
    const fadeOut = Math.min(tr.fadeOut || 0, remaining);
    if (fadeIn > 0) {
      g.setValueAtTime(0, when);
      g.linearRampToValueAtTime(vol, when + fadeIn);
    } else {
      g.setValueAtTime(vol, when);
    }
    if (fadeOut > 0) {
      g.setValueAtTime(vol, when + Math.max(0, remaining - fadeOut));
      g.linearRampToValueAtTime(0, when + remaining);
    }
  }

  function schedulerTick() {
    const dur = stepDuration();
    while (state.nextStepTime < actx.currentTime + SCHEDULE_AHEAD) {
      const drumStep = state.currentStepIndex % totalSteps();
      const melodyStep = state.currentStepIndex % melodyTotalSteps();
      let t = state.nextStepTime;
      if (drumStep % 2 === 1) t += dur * (state.seqSwing / 100) * 0.5;

      DRUM_ROWS.forEach(row => {
        if (state.pattern[row.key][drumStep]) {
          DRUM_FN[row.key](actx, state.seqTrack.nodes.gain, t, currentKit());
          if (row.key === 'kick') triggerSidechain(actx, graph.duckGain, t);
        }
      });

      PIANO_NOTES.forEach(n => {
        if (state.melody[n.midi][melodyStep]) {
          playSynthNote(actx, state.melodyTrack.nodes.gain, midiToFreq(n.midi), t, dur * 0.92, state.melodyInstrument);
        }
      });

      if (state.metronomeOn) {
        const accent = state.currentStepIndex % 16 === 0;
        if (state.currentStepIndex % 4 === 0) playMetronomeClick(actx, graph.metronomeGain, t, accent);
      }

      scheduleStepHighlight(drumStep, melodyStep, t);
      state.nextStepTime += dur;
      state.currentStepIndex++;
    }

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

  function playMetronomeClick(ctx, dest, t, accent) {
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = accent ? 1600 : 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(accent ? 0.9 : 0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + 0.05);
  }

  function scheduleStepHighlight(drumStep, melodyStep, atTime) {
    const delayMs = Math.max(0, (atTime - actx.currentTime) * 1000);
    setTimeout(() => { highlightStep(drumStep); highlightPianoStep(melodyStep); }, delayMs);
  }

  function highlightStep(stepIndex) {
    document.querySelectorAll('.st-seq-step').forEach(el => el.classList.remove('playing-col'));
    document.querySelectorAll(`.st-seq-step[data-step="${stepIndex}"]`).forEach(el => el.classList.add('playing-col'));
  }

  function highlightPianoStep(stepIndex) {
    document.querySelectorAll('.st-piano-cell').forEach(el => el.classList.remove('playing-col'));
    document.querySelectorAll(`.st-piano-cell[data-step="${stepIndex}"]`).forEach(el => el.classList.add('playing-col'));
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
    if (state.melodyTrack.nodes) {
      const v = Math.min(1, rmsFromAnalyser(state.melodyTrack.nodes.analyser) * 2.2);
      const el = document.getElementById('vu-melody');
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

  
  function createTrackNodes(tr) {
    const ctx = actx;
    const gain = ctx.createGain(); gain.gain.value = tr.volume;
    const tiltLow = ctx.createBiquadFilter(); tiltLow.type = 'lowshelf'; tiltLow.frequency.value = 300; tiltLow.gain.value = -(tr.eqTilt || 0);
    const tiltHigh = ctx.createBiquadFilter(); tiltHigh.type = 'highshelf'; tiltHigh.frequency.value = 3000; tiltHigh.gain.value = (tr.eqTilt || 0);
    const pan = ctx.createStereoPanner(); pan.pan.value = tr.pan;
    const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
    const sendGain = ctx.createGain(); sendGain.gain.value = tr.reverbSend || 0;
    gain.connect(tiltLow); tiltLow.connect(tiltHigh); tiltHigh.connect(pan);
    pan.connect(analyser); analyser.connect(graph.mixBus);
    pan.connect(sendGain); sendGain.connect(graph.reverbIn);
    tr.nodes = { gain, tiltLow, tiltHigh, pan, analyser, sendGain };
  }

  function addTrack(opts, skipHistory) {
    ensureAudioContext();
    if (!skipHistory) commit();
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
      clipStart: 0,
      trimStart: 0,
      trimDuration: null,
      fadeIn: 0,
      fadeOut: 0,
      playbackRate: 1,
      reverbSend: 0,
      eqTilt: 0
    }, opts || {});
    createTrackNodes(tr);
    state.tracks.push(tr);
    if (tr.buffer) trackBufferCache.set(tr.id, tr.buffer);
    renderTracks();
    renderMixer();
    return tr;
  }

  function removeTrack(id) {
    commit();
    const idx = state.tracks.findIndex(t => t.id === id);
    if (idx === -1) return;
    const tr = state.tracks[idx];
    if (tr._source) { try { tr._source.stop(); } catch (e) {} }
    if (tr.nodes) { try { tr.nodes.gain.disconnect(); } catch (e) {} }
    state.tracks.splice(idx, 1);
    renderTracks();
    renderMixer();
  }

  function duplicateTrack(id) {
    const tr = state.tracks.find(t => t.id === id);
    if (!tr) return;
    commit();
    const copy = addTrack({
      name: tr.name + ' (копія)', color: tr.color, fileName: tr.fileName,
      volume: tr.volume, pan: tr.pan, mute: tr.mute, solo: false, clipStart: tr.clipStart,
      trimStart: tr.trimStart, trimDuration: tr.trimDuration, fadeIn: tr.fadeIn, fadeOut: tr.fadeOut,
      playbackRate: tr.playbackRate, reverbSend: tr.reverbSend, eqTilt: tr.eqTilt
    }, true);
    if (tr.buffer) { copy.buffer = tr.buffer; trackBufferCache.set(copy.id, tr.buffer); }
    renderTracks(); renderMixer();
    showToast('Доріжку продубльовано');
  }

  function splitTrackAtPlayhead(id) {
    const tr = state.tracks.find(t => t.id === id);
    if (!tr || !tr.buffer) return;
    const dur = clipDuration(tr);
    const splitPoint = state.playbackPosition - tr.clipStart;
    if (splitPoint <= 0.02 || splitPoint >= dur - 0.02) { showToast('Плейхед має бути всередині кліпу'); return; }
    commit();
    const secondTrimStart = (tr.trimStart || 0) + splitPoint;
    const secondDuration = dur - splitPoint;
    const second = addTrack({
      name: tr.name + ' (2)', color: tr.color, fileName: tr.fileName,
      volume: tr.volume, pan: tr.pan, mute: tr.mute, solo: tr.solo,
      clipStart: tr.clipStart + splitPoint, trimStart: secondTrimStart, trimDuration: secondDuration,
      fadeIn: 0, fadeOut: tr.fadeOut, playbackRate: tr.playbackRate, reverbSend: tr.reverbSend, eqTilt: tr.eqTilt
    }, true);
    second.buffer = tr.buffer;
    trackBufferCache.set(second.id, tr.buffer);
    tr.trimDuration = splitPoint;
    tr.fadeOut = 0;
    renderTracks(); renderMixer();
    showToast('Кліп розділено');
  }

  function updateTrackGains() {
    const anySolo = state.tracks.some(t => t.solo) || state.seqTrack.solo || state.melodyTrack.solo;
    state.tracks.forEach(tr => {
      const audible = anySolo ? tr.solo : !tr.mute;
      tr.nodes.gain.gain.value = audible ? tr.volume : 0;
    });
    if (state.seqTrack.nodes) {
      const audible = anySolo ? state.seqTrack.solo : !state.seqTrack.mute;
      state.seqTrack.nodes.gain.gain.value = audible ? state.seqTrack.volume : 0;
    }
    if (state.melodyTrack.nodes) {
      const audible = anySolo ? state.melodyTrack.solo : !state.melodyTrack.mute;
      state.melodyTrack.nodes.gain.gain.value = audible ? state.melodyTrack.volume : 0;
    }
  }

  async function importFiles(fileLikeList, targetTrack, dropXSeconds) {
    ensureAudioContext();
    commit();
    for (const item of fileLikeList) {
      try {
        const file = item.file || item;
        const arrayBuf = await file.arrayBuffer();
        const audioBuf = await actx.decodeAudioData(arrayBuf.slice(0));
        if (targetTrack) {
          targetTrack.buffer = audioBuf;
          targetTrack.trimStart = 0; targetTrack.trimDuration = null;
          targetTrack.fileName = file.name;
          if (targetTrack.name === 'Доріжка') targetTrack.name = file.name.replace(/\.[^.]+$/, '').slice(0, 24);
          if (typeof dropXSeconds === 'number') targetTrack.clipStart = Math.max(0, dropXSeconds);
          trackBufferCache.set(targetTrack.id, audioBuf);
        } else {
          const tr = addTrack({ name: file.name.replace(/\.[^.]+$/, '').slice(0, 24), fileName: file.name }, true);
          tr.buffer = audioBuf;
          trackBufferCache.set(tr.id, audioBuf);
          if (typeof dropXSeconds === 'number') tr.clipStart = Math.max(0, dropXSeconds);
        }
      } catch (err) {
        showToast('Не вдалося імпортувати файл: ' + (item.name || item.file?.name || ''));
      }
    }
    renderTracks();
    renderMixer();
  }

  
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
      header.style.position = 'relative';
      header.innerHTML = `
        <div class="st-track-header-top">
          <span class="st-track-color" data-id="${tr.id}" style="background:${tr.color}"></span>
          <input class="st-track-name" value="${escapeHtml(tr.name)}" data-id="${tr.id}"/>
          <button class="st-track-dup" data-id="${tr.id}" title="Дублювати">⧉</button>
          <button class="st-track-remove" data-id="${tr.id}" title="Видалити">✕</button>
        </div>
        <div class="st-track-controls">
          <button class="st-mini-btn mute ${tr.mute ? 'active' : ''}" data-id="${tr.id}" data-act="mute">M</button>
          <button class="st-mini-btn solo ${tr.solo ? 'active' : ''}" data-id="${tr.id}" data-act="solo">S</button>
          <div class="st-track-vol"><input type="range" min="0" max="120" value="${Math.round(tr.volume * 100)}" data-id="${tr.id}" data-act="vol"/></div>
        </div>
        <div class="st-color-picker" id="color-picker-${tr.id}">
          ${TRACK_COLORS.map(c => `<span class="st-color-swatch" style="background:${c}" data-id="${tr.id}" data-color="${c}"></span>`).join('')}
        </div>`;
      headersEl.appendChild(header);

      const lane = document.createElement('div');
      lane.className = 'st-track-lane';
      lane.style.width = widthPx + 'px';
      lane.dataset.id = tr.id;
      if (tr.buffer) {
        const cDur = clipDuration(tr);
        const clip = document.createElement('div');
        clip.className = 'st-clip';
        clip.style.left = (tr.clipStart * PX_PER_SEC) + 'px';
        clip.style.width = Math.max(30, cDur * PX_PER_SEC) + 'px';
        clip.style.borderColor = tr.color;
        clip.dataset.id = tr.id;
        clip.innerHTML = `
          <div class="st-clip-inner">
            <span class="st-clip-label">${escapeHtml(tr.fileName || tr.name)}</span>
            <canvas></canvas>
          </div>
          <div class="st-fade-handle in" data-id="${tr.id}" title="Fade in"></div>
          <div class="st-fade-handle out" data-id="${tr.id}" title="Fade out"></div>
          <div class="st-trim-handle left" data-id="${tr.id}"></div>
          <div class="st-trim-handle right" data-id="${tr.id}"></div>
          <button class="st-clip-split-btn" data-id="${tr.id}" title="Розділити на плейхеді">✂</button>`;
        lane.appendChild(clip);
        requestAnimationFrame(() => drawWaveform(clip.querySelector('canvas'), tr.buffer, tr.color, tr));
        makeClipDraggable(clip, tr);
        wireClipHandles(clip, tr);
      }
      lanesEl.appendChild(lane);
      wireLaneDropTarget(lane, tr);
    });

    lanesEl.appendChild(document.getElementById('playhead'));
    updatePlayheadPosition(state.playbackPosition);

    headersEl.querySelectorAll('.st-track-name').forEach(inp => {
      inp.addEventListener('change', e => {
        commit();
        const tr = state.tracks.find(t => t.id == e.target.dataset.id);
        if (tr) tr.name = e.target.value || 'Доріжка';
      });
    });
    headersEl.querySelectorAll('.st-track-remove').forEach(btn => {
      btn.addEventListener('click', e => removeTrack(+e.target.dataset.id));
    });
    headersEl.querySelectorAll('.st-track-dup').forEach(btn => {
      btn.addEventListener('click', e => duplicateTrack(+e.target.dataset.id));
    });
    headersEl.querySelectorAll('.st-track-color').forEach(sw => {
      sw.addEventListener('click', e => {
        const picker = document.getElementById('color-picker-' + e.target.dataset.id);
        document.querySelectorAll('.st-color-picker').forEach(p => { if (p !== picker) p.classList.remove('open'); });
        picker.classList.toggle('open');
      });
    });
    headersEl.querySelectorAll('.st-color-swatch').forEach(sw => {
      sw.addEventListener('click', e => {
        commit();
        const tr = state.tracks.find(t => t.id == e.target.dataset.id);
        if (tr) { tr.color = e.target.dataset.color; renderTracks(); renderMixer(); }
      });
    });
    headersEl.querySelectorAll('.st-mini-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        commit();
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
      });
      inp.addEventListener('change', () => commit());
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

  function drawWaveform(canvas, buffer, color, tr) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, rect.width * dpr);
    canvas.height = Math.max(1, rect.height * dpr);
    const ctx2d = canvas.getContext('2d');
    ctx2d.scale(dpr, dpr);
    const data = buffer.getChannelData(0);
    const w = rect.width, h = rect.height;
    const startSample = Math.floor((tr && tr.trimStart || 0) * buffer.sampleRate);
    const durSamples = Math.floor(clipDuration(tr || { buffer, trimStart: 0, trimDuration: null }) * buffer.sampleRate);
    const step = Math.max(1, Math.floor(durSamples / w));
    ctx2d.fillStyle = color;
    ctx2d.globalAlpha = 0.85;
    for (let x = 0; x < w; x++) {
      let min = 1, max = -1;
      const start = startSample + x * step;
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
    clipEl.querySelector('.st-clip-inner').addEventListener('mousedown', e => {
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
      if (dragging) { dragging = false; commit(); renderTracks(); }
    });
  }

  function wireClipHandles(clipEl, tr) {
    ['left', 'right'].forEach(side => {
      const handle = clipEl.querySelector('.st-trim-handle.' + side);
      let dragging = false, startX = 0, startTrimStart = 0, startTrimDur = 0, startClipStart = 0;
      handle.addEventListener('mousedown', e => {
        e.stopPropagation(); dragging = true; startX = e.clientX;
        startTrimStart = tr.trimStart || 0;
        startTrimDur = tr.trimDuration != null ? tr.trimDuration : (tr.buffer.duration - startTrimStart);
        startClipStart = tr.clipStart;
      });
      window.addEventListener('mousemove', e => {
        if (!dragging) return;
        const deltaSec = (e.clientX - startX) / PX_PER_SEC;
        if (side === 'left') {
          const newTrimStart = Math.max(0, Math.min(startTrimStart + startTrimDur - 0.05, startTrimStart + deltaSec));
          const shift = newTrimStart - startTrimStart;
          tr.trimStart = newTrimStart;
          tr.trimDuration = startTrimDur - shift;
          tr.clipStart = Math.max(0, startClipStart + shift);
        } else {
          const maxDur = tr.buffer.duration - startTrimStart;
          tr.trimDuration = Math.max(0.05, Math.min(maxDur, startTrimDur + deltaSec));
        }
        clipEl.style.left = (tr.clipStart * PX_PER_SEC) + 'px';
        clipEl.style.width = Math.max(30, clipDuration(tr) * PX_PER_SEC) + 'px';
      });
      window.addEventListener('mouseup', () => {
        if (dragging) { dragging = false; commit(); renderTracks(); }
      });
    });

    ['in', 'out'].forEach(side => {
      const handle = clipEl.querySelector('.st-fade-handle.' + side);
      let dragging = false, startX = 0, startVal = 0;
      handle.addEventListener('mousedown', e => {
        e.stopPropagation(); dragging = true; startX = e.clientX;
        startVal = side === 'in' ? (tr.fadeIn || 0) : (tr.fadeOut || 0);
      });
      window.addEventListener('mousemove', e => {
        if (!dragging) return;
        const deltaSec = (e.clientX - startX) / PX_PER_SEC * (side === 'in' ? 1 : -1);
        const cDur = clipDuration(tr);
        const val = Math.max(0, Math.min(cDur / 2, startVal + deltaSec));
        if (side === 'in') tr.fadeIn = val; else tr.fadeOut = val;
      });
      window.addEventListener('mouseup', () => { if (dragging) { dragging = false; commit(); } });
    });

    clipEl.querySelector('.st-clip-split-btn').addEventListener('click', e => {
      e.stopPropagation();
      splitTrackAtPlayhead(+e.target.dataset.id);
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
        commit();
        const row = el.dataset.row, step = +el.dataset.step;
        state.pattern[row][step] = !state.pattern[row][step];
        el.classList.toggle('active');
        if (state.pattern[row][step]) {
          ensureAudioContext();
          if (actx.state === 'suspended') actx.resume();
          DRUM_FN[row](actx, state.seqTrack.nodes ? state.seqTrack.nodes.gain : graph.mixBus, actx.currentTime, currentKit());
        }
      });
    });
  }

  
  function renderPianoRoll() {
    const keysEl = document.getElementById('piano-keys');
    const gridEl = document.getElementById('piano-grid');
    const steps = melodyTotalSteps();
    keysEl.innerHTML = PIANO_NOTES.map(n =>
      `<div class="st-piano-key ${n.isBlack ? 'black-key' : ''}">${n.name}</div>`
    ).join('');
    gridEl.innerHTML = PIANO_NOTES.map(n => {
      let cells = '';
      for (let i = 0; i < steps; i++) {
        const on = state.melody[n.midi][i];
        cells += `<div class="st-piano-cell ${on ? 'on' : ''} ${i % 4 === 0 ? 'beat-start' : ''}" data-midi="${n.midi}" data-step="${i}"></div>`;
      }
      return `<div class="st-piano-row ${n.isBlack ? 'black-key' : ''}">${cells}</div>`;
    }).join('');
    gridEl.querySelectorAll('.st-piano-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        commit();
        const midi = +cell.dataset.midi, step = +cell.dataset.step;
        state.melody[midi][step] = !state.melody[midi][step];
        cell.classList.toggle('on');
        if (state.melody[midi][step]) {
          ensureAudioContext();
          if (actx.state === 'suspended') actx.resume();
          playSynthNote(actx, state.melodyTrack.nodes ? state.melodyTrack.nodes.gain : graph.mixBus, midiToFreq(midi), actx.currentTime, 0.3, state.melodyInstrument);
        }
      });
    });
  }

  
  function renderMixer() {
    const wrap = document.getElementById('mixer-strips');
    wrap.innerHTML = '';
    state.tracks.forEach(tr => wrap.appendChild(buildStrip({
      id: 'track-' + tr.id, name: tr.name, color: tr.color,
      volume: tr.volume, pan: tr.pan, mute: tr.mute, solo: tr.solo,
      vuId: 'vu-' + tr.id, reverbSend: tr.reverbSend, eqTilt: tr.eqTilt,
      onVol: v => { tr.volume = v; updateTrackGains(); },
      onPan: v => { tr.pan = v; tr.nodes.pan.pan.value = v; },
      onMute: () => { commit(); tr.mute = !tr.mute; updateTrackGains(); renderTracks(); renderMixer(); },
      onSolo: () => { commit(); tr.solo = !tr.solo; updateTrackGains(); renderTracks(); renderMixer(); },
      onSend: v => { tr.reverbSend = v; tr.nodes.sendGain.gain.value = v; },
      onTilt: v => { tr.eqTilt = v; tr.nodes.tiltLow.gain.value = -v; tr.nodes.tiltHigh.gain.value = v; }
    })));
    wrap.appendChild(buildStrip({
      id: 'seq', name: 'Beat', color: 'var(--violet)',
      volume: state.seqTrack.volume, pan: state.seqTrack.pan, mute: state.seqTrack.mute, solo: state.seqTrack.solo,
      vuId: 'vu-seq',
      onVol: v => { state.seqTrack.volume = v; updateTrackGains(); },
      onPan: v => { state.seqTrack.pan = v; },
      onMute: () => { state.seqTrack.mute = !state.seqTrack.mute; updateTrackGains(); renderMixer(); },
      onSolo: () => { state.seqTrack.solo = !state.seqTrack.solo; updateTrackGains(); renderMixer(); }
    }));
    wrap.appendChild(buildStrip({
      id: 'melody', name: 'Melody', color: 'var(--brick)',
      volume: state.melodyTrack.volume, pan: state.melodyTrack.pan, mute: state.melodyTrack.mute, solo: state.melodyTrack.solo,
      vuId: 'vu-melody',
      onVol: v => { state.melodyTrack.volume = v; updateTrackGains(); },
      onPan: v => { state.melodyTrack.pan = v; },
      onMute: () => { state.melodyTrack.mute = !state.melodyTrack.mute; updateTrackGains(); renderMixer(); },
      onSolo: () => { state.melodyTrack.solo = !state.melodyTrack.solo; updateTrackGains(); renderMixer(); }
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
      </div>
      ${cfg.onSend ? `<div class="st-strip-fx">
        <div class="st-knob-item"><div class="st-knob" id="tilt-${cfg.id}" data-min="-12" data-max="12" data-val="${cfg.eqTilt || 0}"></div><label>Tilt</label></div>
        <div class="st-knob-item"><div class="st-knob" id="send-${cfg.id}" data-min="0" data-max="100" data-val="${Math.round((cfg.reverbSend||0)*100)}"></div><label>Verb</label></div>
      </div>` : ''}`;
    strip.querySelector('.st-fader').addEventListener('input', e => cfg.onVol(e.target.value / 100));
    strip.querySelector('.mute').addEventListener('click', cfg.onMute);
    strip.querySelector('.solo').addEventListener('click', cfg.onSolo);
    initPanKnob(strip.querySelector('.st-pan-knob'), cfg.pan, cfg.onPan);
    if (cfg.onSend) {
      initKnob('tilt-' + cfg.id, null, v => v.toFixed(0), v => cfg.onTilt(v));
      initKnob('send-' + cfg.id, null, v => v.toFixed(0), v => cfg.onSend(v / 100));
    }
    return strip;
  }

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

  
  function initKnob(id, valId, fmt, onChange) {
    const el = document.getElementById(id);
    if (!el) return;
    const min = parseFloat(el.dataset.min), max = parseFloat(el.dataset.max);
    let val = parseFloat(el.dataset.val);
    const valEl = valId ? document.getElementById(valId) : null;
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
    window.addEventListener('mouseup', () => { if (dragging) { dragging = false; commit(); } });
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
    initKnob('knob-sc-amount', 'val-sc-amount', v => v.toFixed(0) + '%', v => { state.sidechain.amount = v / 100; });
    initKnob('knob-sc-release', 'val-sc-release', v => v.toFixed(0) + ' ms', v => { state.sidechain.release = v / 1000; });

    document.getElementById('fx-eq-on').addEventListener('change', e => { state.fx.eqOn = e.target.checked; applyFxToGraph(); });
    document.getElementById('fx-comp-on').addEventListener('change', e => { state.fx.compOn = e.target.checked; applyFxToGraph(); });
    document.getElementById('fx-delay-on').addEventListener('change', e => { state.fx.delayOn = e.target.checked; applyFxToGraph(); });
    document.getElementById('fx-reverb-on').addEventListener('change', e => { state.fx.reverbOn = e.target.checked; applyFxToGraph(); });
    document.getElementById('fx-dist-on').addEventListener('change', e => { state.fx.distOn = e.target.checked; applyFxToGraph(); });
    document.getElementById('fx-sidechain-on').addEventListener('change', e => { state.sidechain.on = e.target.checked; });
  }

  
  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  
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
      } catch (e) {  }
    } else {
      document.getElementById('input-file-fallback').click();
    }
  }

  function renderBrowserItems() {
    const list = document.getElementById('browser-list');
    list.innerHTML = '';
    state.browserItems.forEach((file) => {
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

  
  let mediaRecorder = null, recordedChunks = [], micStream = null;

  async function toggleRecording() {
    const btn = document.getElementById('btn-record');
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      return;
    }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      showToast('Не вдалося отримати доступ до мікрофона');
      return;
    }
    ensureAudioContext();
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(micStream);
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      btn.classList.remove('recording');
      micStream.getTracks().forEach(t => t.stop());
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      try {
        const arrBuf = await blob.arrayBuffer();
        const audioBuf = await actx.decodeAudioData(arrBuf);
        commit();
        const tr = addTrack({ name: 'Запис ' + (state.tracks.length + 1), clipStart: state.playbackPosition }, true);
        tr.buffer = audioBuf;
        trackBufferCache.set(tr.id, audioBuf);
        renderTracks(); renderMixer();
        showToast('Запис додано як нову доріжку');
      } catch (err) {
        showToast('Не вдалося обробити запис');
      }
    };
    mediaRecorder.start();
    btn.classList.add('recording');
    showToast('Запис… натисніть ще раз, щоб зупинити');
  }

  
  const historyStack = [];
  const redoStack = [];
  const HISTORY_LIMIT = 60;

  function serializeState() {
    return JSON.stringify({
      tracks: state.tracks.map(t => ({
        id: t.id, name: t.name, color: t.color, fileName: t.fileName,
        volume: t.volume, pan: t.pan, mute: t.mute, solo: t.solo, clipStart: t.clipStart,
        trimStart: t.trimStart, trimDuration: t.trimDuration, fadeIn: t.fadeIn, fadeOut: t.fadeOut,
        playbackRate: t.playbackRate, reverbSend: t.reverbSend, eqTilt: t.eqTilt, hasBuffer: !!t.buffer
      })),
      nextTrackId: state.nextTrackId,
      bpm: state.bpm, seqBars: state.seqBars, seqSwing: state.seqSwing, kit: state.kit,
      pattern: state.pattern, melody: state.melody, melodyBars: state.melodyBars, melodyInstrument: state.melodyInstrument,
      seqTrack: { volume: state.seqTrack.volume, pan: state.seqTrack.pan, mute: state.seqTrack.mute, solo: state.seqTrack.solo },
      melodyTrack: { volume: state.melodyTrack.volume, pan: state.melodyTrack.pan, mute: state.melodyTrack.mute, solo: state.melodyTrack.solo },
      fx: state.fx, sidechain: state.sidechain, masterVolume: state.masterVolume
    });
  }

  function restoreState(json) {
    const d = JSON.parse(json);
    state.tracks.forEach(tr => { if (tr.nodes) try { tr.nodes.gain.disconnect(); } catch (e) {} });
    state.tracks = d.tracks.map(td => {
      const tr = Object.assign({}, td);
      createTrackNodes(tr);
      if (td.hasBuffer && trackBufferCache.has(td.id)) tr.buffer = trackBufferCache.get(td.id);
      tr.nodes.pan.pan.value = tr.pan;
      return tr;
    });
    state.nextTrackId = d.nextTrackId;
    state.bpm = d.bpm; state.seqBars = d.seqBars; state.seqSwing = d.seqSwing; state.kit = d.kit || 'modern';
    state.pattern = d.pattern; state.melody = d.melody || state.melody;
    state.melodyBars = d.melodyBars || 2; state.melodyInstrument = d.melodyInstrument || 'bass';
    Object.assign(state.seqTrack, d.seqTrack);
    Object.assign(state.melodyTrack, d.melodyTrack || {});
    Object.assign(state.fx, d.fx);
    Object.assign(state.sidechain, d.sidechain || {});
    state.masterVolume = d.masterVolume;

    updateTrackGains();
    applyFxToGraph(); regenerateImpulse();
    document.getElementById('bpm-input').value = state.bpm;
    document.getElementById('seq-bars').value = state.seqBars;
    document.getElementById('seq-swing').value = state.seqSwing;
    document.getElementById('seq-kit').value = state.kit;
    document.getElementById('piano-bars').value = state.melodyBars;
    document.getElementById('piano-instrument').value = state.melodyInstrument;
    document.getElementById('master-volume').value = Math.round(state.masterVolume * 100);
    renderTracks(); renderSequencer(); renderPianoRoll(); renderMixer();
  }

  function commit() {
    if (!actx) return;
    historyStack.push(serializeState());
    if (historyStack.length > HISTORY_LIMIT) historyStack.shift();
    redoStack.length = 0;
  }

  function undo() {
    if (!historyStack.length) { showToast('Нічого скасовувати'); return; }
    redoStack.push(serializeState());
    const prev = historyStack.pop();
    restoreState(prev);
    showToast('Скасовано');
  }

  function redo() {
    if (!redoStack.length) { showToast('Нічого повторювати'); return; }
    historyStack.push(serializeState());
    const next = redoStack.pop();
    restoreState(next);
    showToast('Повторено');
  }

  
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
  async function idbDelete(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbListKeys(prefix) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).getAllKeys();
      req.onsuccess = () => resolve((req.result || []).filter(k => String(k).startsWith(prefix)));
      req.onerror = () => reject(req.error);
    });
  }

  function buildProjectPayload() {
    return {
      name: state.currentProjectName,
      savedAt: new Date().toISOString(),
      bpm: state.bpm, seqBars: state.seqBars, seqSwing: state.seqSwing, kit: state.kit,
      pattern: state.pattern, melody: state.melody, melodyBars: state.melodyBars, melodyInstrument: state.melodyInstrument,
      fx: state.fx, sidechain: state.sidechain, masterVolume: state.masterVolume,
      seqTrack: { volume: state.seqTrack.volume, pan: state.seqTrack.pan, mute: state.seqTrack.mute, solo: state.seqTrack.solo },
      melodyTrack: { volume: state.melodyTrack.volume, pan: state.melodyTrack.pan, mute: state.melodyTrack.mute, solo: state.melodyTrack.solo }
    };
  }

  async function saveProject() {
    ensureAudioContext();
    const id = state.currentProjectId || ('proj_' + Date.now());
    state.currentProjectId = id;
    const payload = Object.assign(buildProjectPayload(), {
      tracks: await Promise.all(state.tracks.map(async tr => ({
        id: tr.id, name: tr.name, color: tr.color, fileName: tr.fileName,
        volume: tr.volume, pan: tr.pan, mute: tr.mute, solo: tr.solo, clipStart: tr.clipStart,
        trimStart: tr.trimStart, trimDuration: tr.trimDuration, fadeIn: tr.fadeIn, fadeOut: tr.fadeOut,
        playbackRate: tr.playbackRate, reverbSend: tr.reverbSend, eqTilt: tr.eqTilt,
        audio: tr.buffer ? await bufferToWavArrayBuffer(tr.buffer) : null
      })))
    });
    await idbSet('proj:' + id, payload);
    await idbSet('current', payload);
    await idbSet('current-id', id);
    showToast('Проєкт «' + state.currentProjectName + '» збережено локально ✓');
  }

  async function saveProjectAs(name) {
    state.currentProjectId = 'proj_' + Date.now();
    state.currentProjectName = name || ('Проєкт ' + new Date().toLocaleDateString());
    await saveProject();
    await refreshProjectsList();
  }

  async function loadProjectPayload(payload) {
    ensureAudioContext();
    stop();
    state.tracks.forEach(tr => { if (tr.nodes) try { tr.nodes.gain.disconnect(); } catch (e) {} });
    state.tracks = [];
    state.currentProjectName = payload.name || 'Проєкт без назви';
    state.bpm = payload.bpm || 120;
    state.seqBars = payload.seqBars || 2;
    state.seqSwing = payload.seqSwing || 0;
    state.kit = payload.kit || 'modern';
    state.pattern = payload.pattern || state.pattern;
    state.melody = payload.melody || state.melody;
    state.melodyBars = payload.melodyBars || 2;
    state.melodyInstrument = payload.melodyInstrument || 'bass';
    Object.assign(state.fx, payload.fx || {});
    Object.assign(state.sidechain, payload.sidechain || {});
    state.masterVolume = payload.masterVolume ?? 0.85;
    if (payload.seqTrack) Object.assign(state.seqTrack, payload.seqTrack);
    if (payload.melodyTrack) Object.assign(state.melodyTrack, payload.melodyTrack);

    document.getElementById('bpm-input').value = state.bpm;
    document.getElementById('seq-bars').value = state.seqBars;
    document.getElementById('seq-swing').value = state.seqSwing;
    document.getElementById('seq-kit').value = state.kit;
    document.getElementById('piano-bars').value = state.melodyBars;
    document.getElementById('piano-instrument').value = state.melodyInstrument;
    document.getElementById('master-volume').value = Math.round(state.masterVolume * 100);

    for (const trData of (payload.tracks || [])) {
      const tr = addTrack({
        name: trData.name, color: trData.color, fileName: trData.fileName,
        volume: trData.volume, pan: trData.pan, mute: trData.mute, solo: trData.solo, clipStart: trData.clipStart,
        trimStart: trData.trimStart || 0, trimDuration: trData.trimDuration != null ? trData.trimDuration : null,
        fadeIn: trData.fadeIn || 0, fadeOut: trData.fadeOut || 0, playbackRate: trData.playbackRate || 1,
        reverbSend: trData.reverbSend || 0, eqTilt: trData.eqTilt || 0
      }, true);
      tr.nodes.pan.pan.value = trData.pan;
      if (trData.audio) {
        const audioBuf = await actx.decodeAudioData(trData.audio.slice(0));
        tr.buffer = audioBuf;
        trackBufferCache.set(tr.id, audioBuf);
      }
    }
    updateTrackGains();
    renderTracks(); renderSequencer(); renderPianoRoll(); renderMixer(); applyFxToGraph(); regenerateImpulse();
  }

  async function loadProjectFromDB() {
    try {
      const id = await idbGet('current-id');
      const payload = await idbGet('current');
      if (!payload) return;
      state.currentProjectId = id || null;
      await loadProjectPayload(payload);
      showToast('Проєкт відновлено з локального сховища');
    } catch (e) { console.error(e); }
  }

  async function refreshProjectsList() {
    const listEl = document.getElementById('projects-list');
    const keys = await idbListKeys('proj:');
    if (!keys.length) { listEl.innerHTML = '<p class="st-hint">Ще немає збережених проєктів.</p>'; return; }
    const items = await Promise.all(keys.map(k => idbGet(k).then(p => ({ key: k, payload: p }))));
    items.sort((a, b) => new Date(b.payload.savedAt) - new Date(a.payload.savedAt));
    listEl.innerHTML = items.map(it => `
      <div class="st-project-item">
        <div>
          <div class="st-project-item-name">${escapeHtml(it.payload.name)}</div>
          <div class="st-project-item-date">${new Date(it.payload.savedAt).toLocaleString()}</div>
        </div>
        <div class="st-project-item-btns">
          <button data-key="${it.key}" data-act="open">Відкрити</button>
          <button data-key="${it.key}" data-act="delete" class="danger">Видалити</button>
        </div>
      </div>`).join('');
    listEl.querySelectorAll('[data-act="open"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const payload = await idbGet(btn.dataset.key);
        state.currentProjectId = btn.dataset.key.replace('proj:', '');
        await loadProjectPayload(payload);
        closeProjectsModal();
        showToast('Проєкт «' + payload.name + '» завантажено');
      });
    });
    listEl.querySelectorAll('[data-act="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Видалити цей проєкт назавжди?')) return;
        await idbDelete(btn.dataset.key);
        refreshProjectsList();
      });
    });
  }

  function openProjectsModal() { document.getElementById('projects-modal').classList.add('open'); refreshProjectsList(); }
  function closeProjectsModal() { document.getElementById('projects-modal').classList.remove('open'); }

  function newProject() {
    if (!confirm('Створити новий проєкт? Незбережені зміни буде втрачено.')) return;
    stop();
    state.tracks.forEach(tr => { if (tr.nodes) try { tr.nodes.gain.disconnect(); } catch (e) {} });
    state.tracks = [];
    state.currentProjectId = null;
    state.currentProjectName = 'Проєкт без назви';
    DRUM_ROWS.forEach(r => { state.pattern[r.key] = new Array(64).fill(false); });
    PIANO_NOTES.forEach(n => { state.melody[n.midi] = new Array(64).fill(false); });
    historyStack.length = 0; redoStack.length = 0;
    renderTracks(); renderSequencer(); renderPianoRoll(); renderMixer();
    showToast('Новий проєкт створено');
  }

  
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

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function renderOfflineMix(options) {
    const dur = projectDuration() + 0.5;
    const offlineCtx = new OfflineAudioContext(2, Math.ceil(dur * actx.sampleRate), actx.sampleRate);
    const savedGraph = Object.assign({}, graph);
    buildGraph(offlineCtx);

    const anySolo = state.tracks.some(t => t.solo) || state.seqTrack.solo || state.melodyTrack.solo;

    state.tracks.forEach(tr => {
      if (!tr.buffer) return;
      if (options.onlyTrackId != null && tr.id !== options.onlyTrackId) return;
      const cDur = clipDuration(tr);
      const src = offlineCtx.createBufferSource(); src.buffer = tr.buffer; src.playbackRate.value = tr.playbackRate || 1;
      const g = offlineCtx.createGain();
      const audible = options.onlyTrackId != null ? true : (anySolo ? tr.solo : !tr.mute);
      g.gain.value = audible ? tr.volume : 0;
      const p = offlineCtx.createStereoPanner(); p.pan.value = tr.pan;
      const tiltLow = offlineCtx.createBiquadFilter(); tiltLow.type = 'lowshelf'; tiltLow.frequency.value = 300; tiltLow.gain.value = -(tr.eqTilt || 0);
      const tiltHigh = offlineCtx.createBiquadFilter(); tiltHigh.type = 'highshelf'; tiltHigh.frequency.value = 3000; tiltHigh.gain.value = (tr.eqTilt || 0);
      src.connect(g); g.connect(tiltLow); tiltLow.connect(tiltHigh); tiltHigh.connect(p); p.connect(graph.mixBus);
      const sendGain = offlineCtx.createGain(); sendGain.gain.value = tr.reverbSend || 0;
      p.connect(sendGain); sendGain.connect(graph.reverbIn);
      src.start(tr.clipStart, tr.trimStart || 0, cDur);
    });

    if (options.includeBeat !== false) {
      const stepDur = stepDuration();
      const steps = totalSteps();
      const patternLen = steps * stepDur;
      const seqAudible = options.onlyTrackId != null ? true : (anySolo ? state.seqTrack.solo : !state.seqTrack.mute);
      const seqGain = offlineCtx.createGain(); seqGain.gain.value = seqAudible ? state.seqTrack.volume : 0;
      seqGain.connect(graph.mixBus);
      if (patternLen > 0) {
        for (let t0 = 0; t0 < dur; t0 += patternLen) {
          for (let i = 0; i < steps; i++) {
            const t = t0 + i * stepDur;
            if (t >= dur) break;
            DRUM_ROWS.forEach(row => {
              if (state.pattern[row.key][i]) {
                DRUM_FN[row.key](offlineCtx, seqGain, t, currentKit());
                if (row.key === 'kick') triggerSidechain(offlineCtx, graph.duckGain, t);
              }
            });
          }
        }
      }
    }

    if (options.includeMelody !== false) {
      const stepDur = stepDuration();
      const steps = melodyTotalSteps();
      const patternLen = steps * stepDur;
      const meloAudible = options.onlyTrackId != null ? true : (anySolo ? state.melodyTrack.solo : !state.melodyTrack.mute);
      const meloGain = offlineCtx.createGain(); meloGain.gain.value = meloAudible ? state.melodyTrack.volume : 0;
      meloGain.connect(graph.mixBus);
      if (patternLen > 0) {
        for (let t0 = 0; t0 < dur; t0 += patternLen) {
          for (let i = 0; i < steps; i++) {
            const t = t0 + i * stepDur;
            if (t >= dur) break;
            PIANO_NOTES.forEach(n => {
              if (state.melody[n.midi][i]) playSynthNote(offlineCtx, meloGain, midiToFreq(n.midi), t, stepDur * 0.92, state.melodyInstrument);
            });
          }
        }
      }
    }

    applyFxToGraph();
    const dur2 = state.fx.reverbSize, decay2 = state.fx.reverbDecay, rate2 = offlineCtx.sampleRate;
    const len2 = Math.max(1, Math.floor(rate2 * dur2));
    const buf2 = offlineCtx.createBuffer(2, len2, rate2);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf2.getChannelData(ch);
      for (let i = 0; i < len2; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len2, decay2);
    }
    graph.convolver.buffer = buf2;

    const rendered = await offlineCtx.startRendering();
    Object.keys(graph).forEach(k => delete graph[k]);
    Object.assign(graph, savedGraph);
    return rendered;
  }

  async function exportMix() {
    ensureAudioContext();
    showToast('Рендеринг міксу…');
    const rendered = await renderOfflineMix({});
    downloadBlob(audioBufferToWavBlob(rendered), 'inkbeat-mix.wav');
    showToast('Мікс експортовано у WAV ✓');
  }

  async function exportStems() {
    ensureAudioContext();
    if (!state.tracks.length && !Object.values(state.pattern).some(a => a.some(Boolean)) && !Object.values(state.melody).some(a => a.some(Boolean))) {
      showToast('Немає що експортувати'); return;
    }
    showToast('Рендеринг стемів… це може зайняти хвилину');
    for (const tr of state.tracks) {
      if (!tr.buffer) continue;
      const rendered = await renderOfflineMix({ onlyTrackId: tr.id, includeBeat: false, includeMelody: false });
      downloadBlob(audioBufferToWavBlob(rendered), `inkbeat-${tr.name.replace(/[^a-zA-Zа-яА-ЯіІїЇєЄ0-9]+/g, '_')}.wav`);
      await new Promise(r => setTimeout(r, 250));
    }
    if (Object.values(state.pattern).some(a => a.some(Boolean))) {
      const rendered = await renderOfflineMix({ onlyTrackId: -1, includeBeat: true, includeMelody: false });
      downloadBlob(audioBufferToWavBlob(rendered), 'inkbeat-beat.wav');
      await new Promise(r => setTimeout(r, 250));
    }
    if (Object.values(state.melody).some(a => a.some(Boolean))) {
      const rendered = await renderOfflineMix({ onlyTrackId: -1, includeBeat: false, includeMelody: true });
      downloadBlob(audioBufferToWavBlob(rendered), 'inkbeat-melody.wav');
    }
    showToast('Стеми експортовано ✓');
  }

  
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
    commit();
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

  
  function zoomTimeline(factor) {
    PX_PER_SEC = Math.max(20, Math.min(240, PX_PER_SEC * factor));
    renderTracks();
  }

  
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
    document.getElementById('btn-metronome').addEventListener('click', e => {
      state.metronomeOn = !state.metronomeOn;
      e.currentTarget.classList.toggle('active', state.metronomeOn);
    });
    document.getElementById('bpm-input').addEventListener('change', e => {
      commit();
      state.bpm = Math.max(40, Math.min(240, +e.target.value || 120));
    });
    document.getElementById('master-volume').addEventListener('input', e => {
      state.masterVolume = e.target.value / 100;
      applyFxToGraph();
      const mf = document.getElementById('master-fader');
      if (mf) mf.value = e.target.value;
    });
    document.addEventListener('keydown', e => {
      const tag = document.activeElement.tagName;
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        e.preventDefault();
        state.isPlaying ? pause() : play();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA'].includes(tag)) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !['INPUT', 'TEXTAREA'].includes(tag)) {
        e.preventDefault(); redo();
      }
    });
  }

  function wireTopbar() {
    document.getElementById('btn-new-project').addEventListener('click', newProject);
    document.getElementById('btn-save-project').addEventListener('click', saveProject);
    document.getElementById('btn-export-wav').addEventListener('click', exportMix);
    document.getElementById('btn-export-stems').addEventListener('click', exportStems);
    document.getElementById('btn-open-folder').addEventListener('click', openFolder);
    document.getElementById('btn-record').addEventListener('click', toggleRecording);
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    document.getElementById('btn-projects').addEventListener('click', openProjectsModal);
    document.getElementById('projects-close').addEventListener('click', closeProjectsModal);
    document.getElementById('btn-save-as').addEventListener('click', async () => {
      const name = document.getElementById('save-as-name').value.trim();
      if (!name) { showToast('Введіть назву проєкту'); return; }
      await saveProjectAs(name);
      document.getElementById('save-as-name').value = '';
      showToast('Збережено як «' + name + '»');
    });
    document.getElementById('input-file-fallback').addEventListener('change', e => {
      const files = Array.from(e.target.files);
      state.browserItems = files;
      renderBrowserItems();
      openBrowserDrawer();
      e.target.value = '';
    });
    document.getElementById('browser-close').addEventListener('click', closeBrowserDrawer);
    document.addEventListener('click', e => {
      if (!e.target.closest('.st-color-picker') && !e.target.closest('.st-track-color')) {
        document.querySelectorAll('.st-color-picker').forEach(p => p.classList.remove('open'));
      }
    });
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
      if (e.target.closest('.st-track-lane')) return;
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        e.preventDefault();
        importFiles(Array.from(e.dataTransfer.files));
      }
    });
  }

  function wireSequencerToolbar() {
    document.getElementById('seq-bars').addEventListener('change', e => {
      commit();
      state.seqBars = +e.target.value;
      renderSequencer(); renderTracks();
    });
    document.getElementById('seq-swing').addEventListener('input', e => { state.seqSwing = +e.target.value; });
    document.getElementById('seq-kit').addEventListener('change', e => { commit(); state.kit = e.target.value; });
    document.getElementById('btn-seq-clear').addEventListener('click', () => {
      commit();
      DRUM_ROWS.forEach(r => state.pattern[r.key] = new Array(64).fill(false));
      renderSequencer();
    });
    document.getElementById('btn-seq-random').addEventListener('click', () => {
      commit();
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

  function wirePianoToolbar() {
    document.getElementById('piano-instrument').addEventListener('change', e => { state.melodyInstrument = e.target.value; });
    document.getElementById('piano-bars').addEventListener('change', e => {
      commit();
      state.melodyBars = +e.target.value;
      renderPianoRoll();
    });
    document.getElementById('btn-piano-clear').addEventListener('click', () => {
      commit();
      PIANO_NOTES.forEach(n => state.melody[n.midi] = new Array(64).fill(false));
      renderPianoRoll();
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
    wirePianoToolbar();
    wireZoomAndTap();
    renderTracks();
    renderSequencer();
    renderPianoRoll();
    renderMixer();
    initAllKnobs();
    loadProjectFromDB();
    setInterval(() => { if (!state.isPlaying) drawSpectrum(); }, 200);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
