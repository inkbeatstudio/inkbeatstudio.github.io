(function (root) {
  'use strict';

  const SR = 22050;
  const N1 = 1024, HOP1 = 256;
  const N2 = 4096, HOP2 = 2048;
  const FPS = SR / HOP1;
  const LATENCY = 0.0;

  const BAND = {
    low:   [2, 7],
    body:  [8, 18],
    noise: [84, 255],
    hat:   [325, 487],
    full:  [2, 300]
  };

  const tick = () => new Promise(r => setTimeout(r, 0));

  const fftCache = {};
  function makeFFT(n) {
    if (fftCache[n]) return fftCache[n];
    const levels = Math.round(Math.log2(n));
    const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0, x = i;
      for (let b = 0; b < levels; b++) { r = (r << 1) | (x & 1); x >>= 1; }
      rev[i] = r;
    }
    const fn = function (re, im) {
      for (let i = 0; i < n; i++) {
        const j = rev[i];
        if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
      }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = i, k = 0; j < i + half; j++, k += step) {
            const l = j + half;
            const tre = re[l] * cos[k] + im[l] * sin[k];
            const tim = -re[l] * sin[k] + im[l] * cos[k];
            re[l] = re[j] - tre; im[l] = im[j] - tim;
            re[j] += tre; im[j] += tim;
          }
        }
      }
    };
    fftCache[n] = fn;
    return fn;
  }

  function hann(n) {
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    return w;
  }

  function percentile(arr, p) {
    if (!arr.length) return 0;
    const c = Float32Array.from(arr).sort();
    return c[Math.min(c.length - 1, Math.max(0, Math.floor(p * (c.length - 1))))];
  }

  function scaledByP99(arr) {
    const p = percentile(arr, 0.99);
    const out = new Float32Array(arr.length);
    if (p <= 1e-9) return out;
    for (let i = 0; i < arr.length; i++) out[i] = arr[i] / p;
    return out;
  }

  function movingMeanSubtract(env, win) {
    const n = env.length, cs = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + env[i];
    const out = new Float32Array(n), h = win >> 1;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - h), b = Math.min(n, i + h + 1);
      const m = (cs[b] - cs[a]) / (b - a);
      out[i] = Math.max(0, env[i] - m);
    }
    return out;
  }

  function smooth3(env) {
    const n = env.length, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = 0.25 * env[Math.max(0, i - 1)] + 0.5 * env[i] + 0.25 * env[Math.min(n - 1, i + 1)];
    }
    return out;
  }

  const frameToTime = f => (f + (N1 / 2) / HOP1) / FPS - LATENCY;
  const timeToFrame = t => (t + LATENCY) * FPS - (N1 / 2) / HOP1;

  async function stftOnsets(x, progress) {
    const nF = Math.max(0, Math.floor((x.length - N1) / HOP1) + 1);
    const out = {
      nF,
      low: new Float32Array(nF), body: new Float32Array(nF), noise: new Float32Array(nF),
      hat: new Float32Array(nF), full: new Float32Array(nF), hatE: new Float32Array(nF),
      rms: new Float32Array(nF)
    };
    const win = hann(N1), fft = makeFFT(N1);
    const re = new Float32Array(N1), im = new Float32Array(N1);
    const nb = N1 / 2, scale = 4 / N1;
    let prev = new Float32Array(nb), cur = new Float32Array(nb);
    let prevL = new Float32Array(nb), curL = new Float32Array(nb);
    const mag = new Float32Array(nb);

    for (let f = 0; f < nF; f++) {
      const off = f * HOP1;
      let e = 0;
      for (let i = 0; i < N1; i++) { const v = x[off + i]; re[i] = v * win[i]; im[i] = 0; e += v * v; }
      out.rms[f] = Math.sqrt(e / N1);
      fft(re, im);
      for (let k = 1; k < nb; k++) {
        const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * scale;
        mag[k] = m;
        cur[k] = Math.log(1 + 1000 * m);
        curL[k] = Math.log(1 + 12 * m);
      }
      if (f > 0) {
        for (const name of ['low', 'body', 'noise', 'hat', 'full']) {
          const [a, b] = BAND[name];
          const C = name === 'full' ? cur : curL, P = name === 'full' ? prev : prevL;
          let s = 0;
          for (let k = a; k <= b; k++) { const d = C[k] - P[k]; if (d > 0) s += d; }
          out[name][f] = s / (b - a + 1);
        }
      }
      let he = 0;
      for (let k = BAND.hat[0]; k <= BAND.hat[1]; k++) he += mag[k] * mag[k];
      out.hatE[f] = he;
      let t = prev; prev = cur; cur = t;
      t = prevL; prevL = curL; curL = t;
      if ((f & 255) === 0) { if (progress) progress(f / nF); await tick(); }
    }
    return out;
  }

  function estimateTempo(bt) {
    const n = bt.length;
    const maxLag = Math.min(n - 1, 420);
    let mean = 0; for (let i = 0; i < n; i++) mean += bt[i]; mean /= n;
    const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = bt[i] - mean;
    const acf = new Float64Array(maxLag + 2);
    for (let lag = 0; lag <= maxLag; lag++) {
      let s = 0; for (let i = lag; i < n; i++) s += x[i] * x[i - lag];
      acf[lag] = s / (n - lag);
    }
    const a0 = acf[0] || 1;
    for (let l = 0; l <= maxLag; l++) acf[l] /= a0;

    const lagLo = Math.floor(60 * FPS / 200), lagHi = Math.ceil(60 * FPS / 55);
    const score = new Float64Array(lagHi + 2);
    for (let L = lagLo; L <= lagHi; L++) {
      let s = acf[L];
      if (2 * L <= maxLag) s += 0.5 * acf[2 * L];
      if (4 * L <= maxLag) s += 0.25 * acf[4 * L];
      const bpm = 60 * FPS / L;
      const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 115) / 0.65, 2));
      score[L] = s * prior;
    }
    const peaks = [];
    for (let L = lagLo + 1; L < lagHi; L++) {
      if (score[L] > score[L - 1] && score[L] >= score[L + 1] && score[L] > 0) {
        const y0 = score[L - 1], y1 = score[L], y2 = score[L + 1];
        const den = y0 - 2 * y1 + y2;
        const off = den !== 0 ? 0.5 * (y0 - y2) / den : 0;
        peaks.push({ lag: L + off, score: y1, bpm: 60 * FPS / (L + off) });
      }
    }
    peaks.sort((a, b) => b.score - a.score);
    return peaks.slice(0, 4);
  }

  function fitGrid(env, bpmLo, bpmHi, bpmStep, f0, f1) {
    const hi = f1 === undefined ? env.length - 2 : Math.min(f1, env.length - 2);
    const lo = f0 || 0;
    let best = { score: -1, bpm: bpmLo, phase: 0 };
    let sumAll = 0, cntAll = 0;
    for (let b = bpmLo; b <= bpmHi + 1e-9; b += bpmStep) {
      const period = 60 * FPS / b;
      const nPh = Math.max(8, Math.ceil(period * 3));
      for (let ip = 0; ip < nPh; ip++) {
        const ph = lo + ip * period / nPh;
        let s = 0, c = 0;
        for (let pos = ph; pos < hi; pos += period) {
          const i = Math.floor(pos), fr = pos - i;
          s += env[i] * (1 - fr) + env[i + 1] * fr; c++;
        }
        if (!c) continue;
        const sc = s / c;
        sumAll += sc; cntAll++;
        if (sc > best.score) best = { score: sc, bpm: b, phase: ph - lo };
      }
    }
    best.mean = cntAll ? sumAll / cntAll : 0;
    return best;
  }

  function refineTempo(bt, bpm, rel) {
    const coarse = fitGrid(bt, bpm * (1 - rel), bpm * (1 + rel), Math.max(0.02, bpm * rel / 40));
    const fine = fitGrid(bt, coarse.bpm - 0.12, coarse.bpm + 0.12, 0.005);
    fine.mean = coarse.mean;
    return fine;
  }

  async function chromaPass(x, progress) {
    const nF = Math.max(0, Math.floor((x.length - N2) / HOP2) + 1);
    const data = new Float32Array(nF * 12);
    const energy = new Float32Array(nF);
    const win = hann(N2), fft = makeFFT(N2);
    const re = new Float32Array(N2), im = new Float32Array(N2);
    const binHz = SR / N2;
    const kLo = Math.ceil(80 / binHz), kHi = Math.floor(2000 / binHz);
    const pcOf = new Int8Array(kHi + 1).fill(-1);
    for (let k = kLo; k <= kHi; k++) {
      const midi = 69 + 12 * Math.log2((k * binHz) / 440);
      pcOf[k] = ((Math.round(midi) % 12) + 12) % 12;
    }
    for (let f = 0; f < nF; f++) {
      const off = f * HOP2;
      for (let i = 0; i < N2; i++) { re[i] = x[off + i] * win[i]; im[i] = 0; }
      fft(re, im);
      let tot = 0;
      for (let k = kLo; k <= kHi; k++) {
        const m = Math.sqrt(Math.sqrt(re[k] * re[k] + im[k] * im[k]));
        data[f * 12 + pcOf[k]] += m; tot += m;
      }
      energy[f] = tot;
      if ((f & 63) === 0) { if (progress) progress(f / nF); await tick(); }
    }
    return { data, energy, nF };
  }

  const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function pearson(a, b) {
    let ma = 0, mb = 0; for (let i = 0; i < 12; i++) { ma += a[i]; mb += b[i]; } ma /= 12; mb /= 12;
    let n = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) { const x = a[i] - ma, y = b[i] - mb; n += x * y; da += x * x; db += y * y; }
    return n / (Math.sqrt(da * db) || 1);
  }

  function detectKey(chroma) {
    const sum = new Float64Array(12);
    const { data, energy, nF } = chroma;
    const gate = percentile(energy, 0.2);
    for (let f = 0; f < nF; f++) {
      if (energy[f] <= gate) continue;
      let t = 0; for (let i = 0; i < 12; i++) t += data[f * 12 + i];
      for (let i = 0; i < 12; i++) sum[i] += data[f * 12 + i] / (t || 1);
    }
    const scores = [];
    for (let r = 0; r < 12; r++) {
      const rotMaj = new Array(12), rotMin = new Array(12);
      for (let i = 0; i < 12; i++) { rotMaj[(i + r) % 12] = KS_MAJOR[i]; rotMin[(i + r) % 12] = KS_MINOR[i]; }
      scores.push({ root: r, minor: false, r: pearson(sum, rotMaj) });
      scores.push({ root: r, minor: true, r: pearson(sum, rotMin) });
    }
    scores.sort((a, b) => b.r - a.r);
    const best = scores[0], second = scores[1];
    const rel = best.minor
      ? { root: (best.root + 3) % 12, minor: false }
      : { root: (best.root + 9) % 12, minor: true };
    return {
      root: best.root, minor: best.minor,
      name: NAMES[best.root] + (best.minor ? ' minor' : ' major'),
      relativeName: NAMES[rel.root] + (rel.minor ? ' minor' : ' major'),
      score: best.r, margin: best.r - second.r,
      runnerUp: NAMES[second.root] + (second.minor ? ' minor' : ' major')
    };
  }

  function diatonicSet(key) {
    const set = new Set();
    const major = [[0, 0], [2, 1], [4, 1], [5, 0], [7, 0], [9, 1]];
    const minor = [[0, 1], [2, 1], [3, 0], [5, 1], [7, 1], [7, 0], [8, 0], [10, 0]];
    (key.minor ? minor : major).forEach(([iv, mn]) => set.add(((key.root + iv) % 12) + ':' + mn));
    return set;
  }

  const TRIAD_MAJ = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0];
  const TRIAD_MIN = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0];

  function cosine(a, b) {
    let n = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) { n += a[i] * b[i]; da += a[i] * a[i]; db += b[i] * b[i]; }
    return n / (Math.sqrt(da * db) || 1);
  }

  function chordLabel(root, minor) { return NAMES[root] + (minor ? 'm' : ''); }

  async function analyzeMono(x, progress) {
    if (x.length < SR * 8) throw new Error('short');
    const report = (stage, p) => { if (progress) progress(stage, p); };

    report('onsets', 0);
    const on = await stftOnsets(x, p => report('onsets', p));

    const nrm = {
      kick: scaledByP99(on.low),
      hat: scaledByP99(on.hat),
      full: scaledByP99(on.full)
    };
    const bodyN = scaledByP99(on.body), noiseN = scaledByP99(on.noise);
    nrm.snare = new Float32Array(on.nF);
    for (let i = 0; i < on.nF; i++) nrm.snare[i] = Math.sqrt(bodyN[i] * noiseN[i]);

    report('tempo', 0);
    const bt = smooth3(movingMeanSubtract(nrm.full, 43));
    const cands = estimateTempo(bt);
    if (!cands.length) throw new Error('no-tempo');
    const top = cands[0];
    const fit = refineTempo(bt, top.bpm, 0.04);

    const mid = bt.length >> 1;
    const fa = fitGrid(bt, fit.bpm * 0.985, fit.bpm * 1.015, 0.02, 0, mid);
    const fb = fitGrid(bt, fit.bpm * 0.985, fit.bpm * 1.015, 0.02, mid, bt.length - 2);
    const drift = Math.abs(fa.bpm - fb.bpm);
    const confidence = Math.max(0, Math.min(1, (fit.score / (fit.mean || 1) - 1) / 2.5));

    report('chroma', 0);
    const chroma = await chromaPass(x, p => report('chroma', p));
    const key = detectKey(chroma);

    report('separate', 0);
    const hp = await hpssPass(x, p => report('separate', p));
    const A0 = { on, hp };
    const pe = percEnvelopes(A0);

    report('done', 1);
    return {
      sr: SR, duration: x.length / SR, mono: x, on, nrm, bt, hp, onP: pe.on, nrmP: pe.nrm,
      tempo: { bpm: fit.bpm, candidates: cands.map(c => c.bpm), confidence, drift },
      chroma, key
    };
  }

  async function resampleToMono(channels, srIn, progress) {
    const nCh = channels.length, nIn = channels[0].length;
    const mono = new Float32Array(nIn);
    for (let c = 0; c < nCh; c++) { const d = channels[c]; for (let i = 0; i < nIn; i++) mono[i] += d[i] / nCh; }
    if (srIn === SR) return mono;

    const ratio = srIn / SR;
    const fcN = Math.min(1, 1 / ratio) * 0.94;
    const W = Math.ceil(16 / fcN);
    const RES = 128;
    const table = new Float32Array(2 * W * RES + 1);
    for (let k = 0; k < table.length; k++) {
      const tt = k / RES - W, u = tt / W;
      const a = Math.PI * fcN * tt;
      const sinc = Math.abs(tt) < 1e-9 ? 1 : Math.sin(a) / a;
      table[k] = fcN * sinc * 0.5 * (1 + Math.cos(Math.PI * u));
    }
    const nOut = Math.floor(nIn / ratio);
    const out = new Float32Array(nOut);
    for (let n = 0; n < nOut; n++) {
      const c = n * ratio, i0 = Math.floor(c), frac = c - i0;
      let acc = 0;
      for (let j = -W + 1; j <= W; j++) {
        const idx = i0 + j;
        if (idx < 0 || idx >= nIn) continue;
        acc += mono[idx] * table[Math.round((j - frac + W) * RES)];
      }
      out[n] = acc;
      if ((n & 0x3ffff) === 0) { if (progress) progress(n / nOut); await tick(); }
    }
    return out;
  }

  async function analyzeBuffer(audioBuffer, progress) {
    if (progress) progress('resample', 0);
    const ch = [];
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) ch.push(audioBuffer.getChannelData(c));
    const mono = await resampleToMono(ch, audioBuffer.sampleRate, p => { if (progress) progress('resample', p); });
    return analyzeMono(mono, progress);
  }

  function grid(A, bpm, opts) {
    opts = opts || {};
    const shift = ((opts.shift || 0) % 4 + 4) % 4;
    const fit = fitGrid(A.bt, bpm, bpm, 1, 0, undefined);
    const periodF = 60 * FPS / bpm;
    const beatSec = 60 / bpm;
    const phaseSec = frameToTime(fit.phase);

    const sums = { kick: [0, 0, 0, 0], snare: [0, 0, 0, 0], cnt: [0, 0, 0, 0] };
    let k = 0;
    for (let pos = fit.phase; pos < A.on.nF - 3; pos += periodF, k++) {
      const c = Math.round(pos), p = k & 3;
      let mk = 0, ms = 0;
      for (let d = -2; d <= 2; d++) {
        const i = Math.min(A.on.nF - 1, Math.max(0, c + d));
        mk = Math.max(mk, A.nrm.kick[i]); ms = Math.max(ms, A.nrm.snare[i]);
      }
      sums.kick[p] += mk; sums.snare[p] += ms; sums.cnt[p]++;
    }
    const kM = sums.kick.map((v, i) => v / (sums.cnt[i] || 1));
    const sM = sums.snare.map((v, i) => v / (sums.cnt[i] || 1));
    let p0 = 0, bestS = -1e9;
    for (let p = 0; p < 4; p++) {
      const s = 1.0 * kM[p] + 0.5 * kM[(p + 2) & 3] + 0.7 * sM[(p + 1) & 3] + 0.7 * sM[(p + 3) & 3];
      if (s > bestS) { bestS = s; p0 = p; }
    }
    const p = (p0 + shift) & 3;
    const barSec = beatSec * 4;
    let dSec = phaseSec + p * beatSec;
    while (dSec - barSec >= -0.25) dSec -= barSec;
    return {
      bpm, beatSec, barSec, phaseSec, downbeatPhase: p0, shift,
      d: dSec, totalBars: Math.max(0, Math.floor((A.duration - dSec) / barSec)),
      kickPhase: kM, snarePhase: sM
    };
  }

  function refine(A, bpm, rel) {
    const r = refineTempo(A.bt, bpm, rel || 0.01);
    return r.bpm;
  }

  function maxIn(env, a, b) {
    let m = 0;
    for (let i = Math.max(0, a); i <= Math.min(env.length - 1, b); i++) if (env[i] > m) m = env[i];
    return m;
  }

  function drums(A, G, opts) {
    opts = opts || {};
    const perc = opts.src !== 'raw' && !!A.nrmP;
    const NR = perc ? A.nrmP : A.nrm;
    const stepSec = G.beatSec / 4;
    const nSteps = Math.max(0, Math.floor((A.duration - G.d) / stepSec));
    const stepF = stepSec * FPS;
    const w = Math.max(1, Math.round(0.35 * stepF));
    const vals = { kick: new Float32Array(nSteps), snare: new Float32Array(nSteps), hat: new Float32Array(nSteps), noise: new Float32Array(nSteps) };
    const gap = { kick: new Float32Array(nSteps), snare: new Float32Array(nSteps), hat: new Float32Array(nSteps) };
    if (perc) {
      ['body', 'tomb', 'sub'].forEach(k => { vals[k] = new Float32Array(nSteps); });
      ['noise', 'tomb'].forEach(k => { gap[k] = new Float32Array(nSteps); });
    }
    const noiseN = perc ? A.nrmP.noise : scaledByP99(A.on.noise);
    const halfF = stepF / 2, wg = Math.max(1, Math.round(0.2 * stepF));
    const between = (env, f) => Math.max(
      maxIn(env, Math.round(f - halfF) - wg, Math.round(f - halfF) + wg),
      maxIn(env, Math.round(f + halfF) - wg, Math.round(f + halfF) + wg));
    const centers = new Int32Array(nSteps);
    for (let i = 0; i < nSteps; i++) {
      const f = Math.round(timeToFrame(G.d + i * stepSec));
      centers[i] = f;
      vals.kick[i] = maxIn(NR.kick, f - w, f + w);
      vals.snare[i] = maxIn(NR.snare, f - w, f + w);
      vals.hat[i] = maxIn(NR.hat, f - w, f + w);
      vals.noise[i] = maxIn(noiseN, f - w, f + w);
      gap.kick[i] = between(NR.kick, f);
      gap.snare[i] = between(NR.snare, f);
      gap.hat[i] = between(NR.hat, f);
      if (perc) {
        vals.body[i] = maxIn(NR.body, f - w, f + w);
        vals.tomb[i] = maxIn(NR.tomb, f - w, f + w);
        vals.sub[i] = maxIn(NR.sub, f - w, f + w);
        gap.noise[i] = between(noiseN, f);
        gap.tomb[i] = between(NR.tomb, f);
      }
    }
    const present = {
      kick: true,
      snare: percentile(A.on.noise, 0.99) >= 0.006,
      hat: percentile(A.on.hat, 0.99) >= 0.01
    };
    const thrFrac = { kick: opts.kickThr || 0.4, snare: opts.snareThr || 0.35, hat: opts.hatThr || 0.3, noise: 0.4, body: 0.4, tomb: 0.4, sub: 0.4 };
    const thr = {};
    const p95 = {};
    for (const k of Object.keys(vals)) {
      p95[k] = Math.max(1e-6, percentile(vals[k], 0.95));
      const floor = Math.min(percentile(vals[k], 0.10), 0.8 * p95[k]);
      thr[k] = floor + thrFrac[k] * (p95[k] - floor);
    }
    const CONTRAST = 1.4;
    const stands = (k, i) => vals[k][i] >= CONTRAST * (gap[k][i] + 0.05 * p95[k]);

    const hits = {
      kick: new Uint8Array(nSteps), snare: new Uint8Array(nSteps),
      hihat: new Uint8Array(nSteps), ohat: new Uint8Array(nSteps),
      clap: new Uint8Array(nSteps), tom: new Uint8Array(nSteps)
    };
    const hatRatio = new Float32Array(nSteps).fill(-1);
    for (let i = 0; i < nSteps; i++) {
      if (vals.kick[i] > thr.kick && stands('kick', i) && (!perc || vals.sub[i] >= 0.6 * vals.kick[i])) hits.kick[i] = 1;
      if (present.snare && vals.snare[i] > thr.snare && vals.noise[i] > thr.noise && stands('snare', i) && vals.kick[i] < 0.6 * vals.snare[i] && (!perc || vals.body[i] >= 0.4 * vals.noise[i])) hits.snare[i] = 1;
      if (perc) {
        if (!hits.snare[i] && present.snare && vals.noise[i] > thr.noise && stands('noise', i) && vals.body[i] < 0.4 * vals.noise[i] && vals.kick[i] < 0.5 * vals.noise[i]) hits.clap[i] = 1;
        if (!hits.snare[i] && !hits.kick[i] && vals.tomb[i] > thr.tomb && stands('tomb', i) && vals.noise[i] < 0.35 * vals.tomb[i] && vals.sub[i] < 0.6 * vals.tomb[i]) hits.tom[i] = 1;
      }
      if (present.hat && vals.hat[i] > thr.hat && stands('hat', i)) {
        const f = centers[i];
        const HE = perc ? A.onP.hatE : A.on.hatE;
        let pk = 0; for (let d = -1; d <= 2; d++) pk = Math.max(pk, HE[Math.min(A.on.nF - 1, Math.max(0, f + d))]);
        let tail = 0, c = 0;
        for (let d = 3; d <= 9; d++) { const j = f + d; if (j < A.on.nF) { tail += HE[j]; c++; } }
        hatRatio[i] = pk > 0 && c ? (tail / c) / pk : 0;
      }
    }
    {
      const cand = [];
      for (let i = 0; i < nSteps; i++) if (hatRatio[i] >= 0) cand.push(hatRatio[i]);
      let openThr = perc ? 0.3 : 0.12;
      if (perc && cand.length >= 8) {
        const sorted = cand.slice().sort((a, b) => a - b);
        let best = -1, bt = openThr;
        for (let q = 1; q < sorted.length; q++) {
          const lo = sorted.slice(0, q), hi = sorted.slice(q);
          const ml = lo.reduce((a, b) => a + b, 0) / lo.length, mh = hi.reduce((a, b) => a + b, 0) / hi.length;
          const sc = lo.length * hi.length * (mh - ml) * (mh - ml);
          if (sc > best) { best = sc; bt = (sorted[q - 1] + sorted[q]) / 2; if (mh < 2.2 * ml + 0.05) bt = bt; }
        }
        const lo = sorted.filter(v => v <= bt), hi = sorted.filter(v => v > bt);
        const ml = lo.length ? lo.reduce((a, b) => a + b, 0) / lo.length : 0, mh = hi.length ? hi.reduce((a, b) => a + b, 0) / hi.length : 0;
        if (hi.length && hi.length <= 0.45 * sorted.length && mh >= 2.2 * ml + 0.1) openThr = Math.max(0.2, bt);
      }
      for (let i = 0; i < nSteps; i++) {
        if (hatRatio[i] < 0) continue;
        const thrO = hits.snare[i] ? openThr + 0.15 : openThr;
        if (hatRatio[i] > thrO) hits.ohat[i] = 1; else hits.hihat[i] = 1;
      }
    }

    const names = perc ? ['kick', 'snare', 'hihat', 'ohat', 'clap', 'tom'] : ['kick', 'snare', 'hihat', 'ohat'];
    const fold = (barsN) => {
      const L = 16 * barsN, cycles = Math.floor(nSteps / L);
      if (cycles < 1) return null;
      const tot = new Array(cycles).fill(0);
      for (let c = 0; c < cycles; c++) for (const nm of names) for (let s = 0; s < L; s++) tot[c] += hits[nm][c * L + s];
      const sorted = tot.filter(v => v > 0).sort((a, b) => a - b);
      const med = sorted.length ? sorted[sorted.length >> 1] : 0;
      const active = []; for (let c = 0; c < cycles; c++) if (tot[c] >= 0.3 * med && tot[c] > 0) active.push(c);
      if (!active.length) return null;
      const prob = {}, cons = {};
      for (const nm of names) {
        prob[nm] = new Float32Array(L); cons[nm] = new Uint8Array(L);
        for (let s = 0; s < L; s++) {
          let sum = 0; for (const c of active) sum += hits[nm][c * L + s];
          prob[nm][s] = sum / active.length;
          cons[nm][s] = prob[nm][s] >= 0.5 ? 1 : 0;
        }
      }
      let inter = 0, uni = 0;
      for (const c of active) for (const nm of names) for (let s = 0; s < L; s++) {
        const h = hits[nm][c * L + s], k = cons[nm][s];
        if (h && k) inter++; if (h || k) uni++;
      }
      return { bars: barsN, L, cycles, active: active.length, prob, cons, consistency: uni ? inter / uni : 0 };
    };
    const folds = [1, 2, 4].map(fold).filter(Boolean);
    let chosen = folds[folds.length - 1];
    if (folds.length) {
      const ref = Math.max.apply(null, folds.map(f => f.consistency));
      chosen = folds.find(f => f.consistency >= ref - 0.03 && f.active >= 2)
        || folds.reduce((a, b) => (b.consistency > a.consistency ? b : a));
    }
    const result = {
      stepsTotal: nSteps, hits, fold: chosen, folds, debug: { vals, thr },
      presence: { kick: present.kick, snare: present.snare, hihat: present.hat, ohat: present.hat, clap: perc && present.snare, tom: perc }
    };
    if (chosen) {
      result.bars = chosen.bars;
      result.pattern = {};
      for (const nm of names) result.pattern[nm] = Array.from(chosen.cons[nm]).map(v => !!v);
      for (const nm of perc ? ['kick', 'snare', 'clap', 'tom'] : ['kick', 'snare']) {
        const dens = result.pattern[nm].filter(Boolean).length / result.pattern[nm].length;
        if (dens > 0.45) { result.pattern[nm] = result.pattern[nm].map(() => false); result.presence[nm] = false; }
      }
      result.counts = {};
      for (const nm of names) result.counts[nm] = result.pattern[nm].filter(Boolean).length;
    }
    return result;
  }

  function chords(A, G, copts) {
    const { data, energy, nF } = A.chroma;
    const times = f => (f * HOP2 + N2 / 2) / SR;
    const gate = percentile(energy, 0.15);
    const dia = diatonicSet(A.key);
    const perBar = [];
    for (let b = 0; b < G.totalBars; b++) {
      const t0 = G.d + b * G.barSec, t1 = t0 + G.barSec;
      const acc = new Float64Array(12); let cnt = 0;
      for (let f = Math.max(0, Math.floor((t0 * SR - N2 / 2) / HOP2)); f < nF; f++) {
        const tc = times(f);
        if (tc >= t1) break;
        if (tc < t0 || energy[f] <= gate) continue;
        let tot = 0; for (let i = 0; i < 12; i++) tot += data[f * 12 + i];
        for (let i = 0; i < 12; i++) acc[i] += data[f * 12 + i] / (tot || 1);
        cnt++;
      }
      if (!cnt) { perBar.push({ nc: true, scores: null }); continue; }
      const scores = [];
      for (let r = 0; r < 12; r++) for (const minor of [false, true]) {
        const tpl = new Array(12);
        const base = minor ? TRIAD_MIN : TRIAD_MAJ;
        for (let i = 0; i < 12; i++) tpl[(i + r) % 12] = base[i];
        let s = cosine(acc, tpl);
        if (!dia.has(r + ':' + (minor ? 1 : 0))) s *= 0.9;
        if (copts && copts.rootPrior && copts.rootPrior[b] === r) s += (copts.priorWeight || 0.12);
        scores.push({ root: r, minor, s });
      }
      scores.sort((a, b) => b.s - a.s);
      perBar.push({ nc: false, root: scores[0].root, minor: scores[0].minor, label: chordLabel(scores[0].root, scores[0].minor), sim: scores[0].s, scores });
    }
    const loopBars = G.totalBars >= 4 ? 4 : G.totalBars >= 2 ? 2 : 1;
    const loop = [];
    for (let p = 0; p < loopBars; p++) {
      const agg = new Map();
      for (let b = p; b < perBar.length; b += loopBars) {
        const pb = perBar[b]; if (!pb || pb.nc) continue;
        for (const sc of pb.scores.slice(0, 3)) {
          const key = sc.root + ':' + (sc.minor ? 1 : 0);
          agg.set(key, (agg.get(key) || 0) + sc.s);
        }
      }
      let bestK = null, bestV = -1;
      for (const [k, v] of agg) if (v > bestV) { bestV = v; bestK = k; }
      if (bestK === null) { loop.push(null); continue; }
      const [r, mn] = bestK.split(':').map(Number);
      loop.push({ root: r, minor: !!mn, label: chordLabel(r, !!mn) });
    }
    return { perBar, loop, loopBars };
  }

  const HN = 2048, HHOP = 512, HK = 980;
  const HFPS = SR / HHOP;
  const HBIN = SR / HN;
  const hbin = hz => Math.round(hz / HBIN);
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const toMidi = f => 69 + 12 * Math.log2(f / 440);

  function medLine(src, out, base, st, n, w, buf) {
    const h = w >> 1;
    for (let j = 0; j < w; j++) buf[j] = src[base + Math.min(n - 1, Math.max(0, j - h)) * st];
    const sorted = buf.subarray(0, w);
    sorted.sort();
    out[base] = sorted[h];
    for (let i = 1; i < n; i++) {
      const outV = src[base + Math.min(n - 1, Math.max(0, i - 1 - h)) * st];
      const inV = src[base + Math.min(n - 1, Math.max(0, i + h)) * st];
      if (outV !== inV) {
        let lo = 0, hi = w - 1;
        while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < outV) lo = m + 1; else hi = m; }
        let j = lo;
        if (inV > outV) { while (j + 1 < w && sorted[j + 1] < inV) { sorted[j] = sorted[j + 1]; j++; } }
        else { while (j > 0 && sorted[j - 1] > inV) { sorted[j] = sorted[j - 1]; j--; } }
        sorted[j] = inV;
      }
      out[base + i * st] = sorted[h];
    }
  }

  async function hpssPass(x, progress) {
    const nF = Math.max(0, Math.floor((x.length - HN) / HHOP) + 1);
    const mag = new Float32Array(nF * HK);
    const win = hann(HN), fft = makeFFT(HN);
    const re = new Float32Array(HN), im = new Float32Array(HN);
    const sc = 4 / HN;
    for (let f = 0; f < nF; f++) {
      const off = f * HHOP;
      for (let i = 0; i < HN; i++) { re[i] = x[off + i] * win[i]; im[i] = 0; }
      fft(re, im);
      const o = f * HK;
      for (let k = 1; k < HK; k++) mag[o + k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * sc;
      if ((f & 127) === 0) { if (progress) progress(0.5 * f / nF); await tick(); }
    }
    const H = new Float32Array(nF * HK), P = new Float32Array(nF * HK);
    const buf = new Float32Array(32);
    for (let k = 0; k < HK; k++) {
      medLine(mag, H, k, HK, nF, 17, buf);
      if ((k & 63) === 0) { if (progress) progress(0.5 + 0.25 * k / HK); await tick(); }
    }
    for (let f = 0; f < nF; f++) {
      medLine(mag, P, f * HK, 1, HK, 17, buf);
      if ((f & 127) === 0) { if (progress) progress(0.75 + 0.25 * f / nF); await tick(); }
    }
    for (let i = 0; i < H.length; i++) {
      const h2 = H[i] * H[i], p2 = P[i] * P[i];
      const mh = h2 / (h2 + p2 + 1e-12);
      H[i] = mag[i] * mh;
      P[i] = mag[i] * (1 - mh);
    }
    return { nF, K: HK, mag, H, P };
  }

  const PB = {
    sub: [hbin(40), hbin(90)], low: [hbin(43), hbin(150)], tomb: [hbin(108), hbin(260)],
    body: [hbin(172), hbin(390)], noise: [hbin(1800), hbin(5500)], hat: [hbin(7000), hbin(10400)],
    full: [hbin(43), hbin(6500)]
  };

  function percEnvelopes(A) {
    const hp = A.hp, nH = hp.nF, K = hp.K;
    const names = Object.keys(PB);
    const raw = {};
    names.forEach(n => { raw[n] = new Float32Array(nH); });
    const prev = new Float32Array(K), cur = new Float32Array(K);
    const prevF = new Float32Array(K), curF = new Float32Array(K);
    for (let f = 0; f < nH; f++) {
      const o = f * K;
      for (let k = 1; k < K; k++) {
        const m = hp.P[o + k];
        cur[k] = Math.log(1 + 12 * m);
        curF[k] = Math.log(1 + 1000 * m);
      }
      if (f > 0) {
        for (const n of names) {
          const [a, b] = PB[n];
          const C = n === 'full' ? curF : cur, Pv = n === 'full' ? prevF : prev;
          let s = 0;
          for (let k = a; k <= b; k++) { const d = C[k] - Pv[k]; if (d > 0) s += d; }
          raw[n][f] = s / (b - a + 1);
        }
      }
      prev.set(cur); prevF.set(curF);
    }
    const nF = A.on.nF;
    const up = src => {
      const out = new Float32Array(nF);
      for (let f = 0; f < nF; f++) {
        const p = f / 2 - 1, i0 = Math.max(0, Math.min(nH - 1, Math.floor(p))), i1 = Math.min(nH - 1, i0 + 1), t = p - Math.floor(p);
        out[f] = src[i0] * (1 - t) + src[i1] * t;
      }
      return out;
    };
    const hatE = new Float32Array(nH);
    for (let f = 0; f < nH; f++) {
      let e = 0; const base = f * K;
      for (let k = PB.hat[0]; k <= PB.hat[1]; k++) { const v = hp.P[base + k]; e += v * v; }
      hatE[f] = e;
    }
    const o = {};
    names.forEach(n => { o[n] = up(raw[n]); });
    o.hatE = up(hatE);
    const nrm = {};
    names.forEach(n => { nrm[n] = scaledByP99(o[n]); });
    nrm.kick = nrm.low;
    nrm.snare = new Float32Array(nF);
    for (let i = 0; i < nF; i++) nrm.snare[i] = Math.sqrt(nrm.body[i] * nrm.noise[i]);
    return { on: o, nrm };
  }

  function lowpassDecimate(x, factor, cutoff) {
    const taps = 255, half = taps >> 1;
    const fc = cutoff / SR;
    const h = new Float32Array(taps);
    let sum = 0;
    for (let i = 0; i < taps; i++) {
      const n = i - half;
      const s = n === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * n) / (Math.PI * n);
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (taps - 1));
      h[i] = s * w; sum += h[i];
    }
    for (let i = 0; i < taps; i++) h[i] /= sum;
    const n = Math.floor((x.length - taps) / factor);
    const y = new Float32Array(Math.max(0, n));
    for (let i = 0; i < n; i++) {
      const base = i * factor;
      let s = 0;
      for (let j = 0; j < taps; j++) s += x[base + j] * h[j];
      y[i] = s;
    }
    return { y, fs: SR / factor, delay: half / SR };
  }

  function yinTrack(y, fs, hopDec, W, fLo, fHi, gate, rms) {
    const nF = Math.max(0, Math.floor((y.length - W - Math.ceil(fs / fLo)) / hopDec) + 1);
    const tauMin = Math.max(2, Math.floor(fs / fHi)), tauMax = Math.ceil(fs / fLo);
    const f0 = new Float32Array(nF), ap = new Float32Array(nF).fill(1);
    const d = new Float32Array(tauMax + 2), cm = new Float32Array(tauMax + 2);
    for (let f = 0; f < nF; f++) {
      if (rms[f] < gate) continue;
      const s = f * hopDec;
      d[0] = 0;
      for (let tau = 1; tau <= tauMax; tau++) {
        let acc = 0;
        for (let j = 0; j < W; j++) { const df = y[s + j] - y[s + j + tau]; acc += df * df; }
        d[tau] = acc;
      }
      let run = 0;
      cm[0] = 1;
      for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; cm[tau] = run > 0 ? d[tau] * tau / run : 1; }
      let tauBest = -1;
      for (let tau = tauMin; tau <= tauMax; tau++) {
        if (cm[tau] < 0.2) {
          while (tau + 1 <= tauMax && cm[tau + 1] < cm[tau]) tau++;
          tauBest = tau; break;
        }
      }
      if (tauBest < 0) {
        let m = 1, mt = -1;
        for (let tau = tauMin; tau <= tauMax; tau++) if (cm[tau] < m) { m = cm[tau]; mt = tau; }
        if (mt > 0 && m < 0.3) tauBest = mt;
      }
      if (tauBest < 0) continue;
      let t = tauBest;
      if (t > 1 && t < tauMax) {
        const a = cm[t - 1], b = cm[t], c = cm[t + 1];
        const den = a - 2 * b + c;
        if (Math.abs(den) > 1e-9) t += 0.5 * (a - c) / den;
      }
      f0[f] = fs / t; ap[f] = cm[tauBest];
    }
    return { nF, f0, ap };
  }

  function bandRatio(hp, f, loA, loB, hiB) {
    const o = f * hp.K;
    let lo = 0, all = 0;
    for (let k = loA; k <= hiB; k++) { const v = hp.H[o + k]; const e = v * v; all += e; if (k <= loB) lo += e; }
    return all > 1e-12 ? lo / all : 0;
  }

  function rleSegments(midi, minLen, bridge, anyGap) {
    const n = midi.length, segs = [];
    let i = 0;
    while (i < n) {
      if (midi[i] < 0) { i++; continue; }
      let j = i, last = i;
      while (j + 1 < n) {
        if (midi[j + 1] === midi[i]) { j++; last = j; continue; }
        let k = j + 1, gap = 0;
        while (k < n && (anyGap ? midi[k] !== midi[i] : midi[k] < 0) && gap <= bridge) { k++; gap++; }
        if (k < n && midi[k] === midi[i] && gap <= bridge) { j = k; last = k; continue; }
        break;
      }
      if (last - i + 1 >= minLen) segs.push({ a: i, b: last, midi: midi[i] });
      i = last + 1;
    }
    return segs;
  }

  function medianOf(a) {
    const s = Array.from(a).sort((p, q) => p - q);
    return s.length ? s[s.length >> 1] : 0;
  }

  function quantizeNotes(notes, G, nSteps) {
    const stepSec = G.beatSec / 4;
    const events = [];
    for (const nt of notes) {
      let s = Math.round((nt.t0 - G.d) / stepSec);
      if (s < 0 || s >= nSteps) continue;
      let e = Math.round((nt.t1 - G.d) / stepSec);
      events.push({ s, len: Math.max(1, e - s), midi: nt.midi });
    }
    events.sort((p, q) => p.s - q.s || p.midi - q.midi);
    const out = [];
    for (const ev of events) {
      const prev = out[out.length - 1];
      if (prev && prev.s === ev.s) continue;
      out.push(ev);
    }
    for (let i = 0; i + 1 < out.length; i++) {
      const gapEnd = out[i + 1].s - out[i].s;
      if (out[i].len > gapEnd) out[i].len = gapEnd;
    }
    return out;
  }

  function foldNotes(events, nSteps) {
    const bySt = new Map();
    events.forEach(e => bySt.set(e.s, e));
    const folds = [];
    for (const barsN of [1, 2, 4]) {
      const L = 16 * barsN, cycles = Math.floor(nSteps / L);
      if (cycles < 1) continue;
      const cnt = new Array(cycles).fill(0);
      for (const e of events) { const c = Math.floor(e.s / L); if (c < cycles) cnt[c]++; }
      const sorted = cnt.filter(v => v > 0).sort((a, b) => a - b);
      const med = sorted.length ? sorted[sorted.length >> 1] : 0;
      const active = []; for (let c = 0; c < cycles; c++) if (cnt[c] >= 0.3 * med && cnt[c] > 0) active.push(c);
      if (!active.length) continue;
      const loop = [];
      for (let s = 0; s < L; s++) {
        const votes = new Map();
        for (const c of active) {
          const e = bySt.get(c * L + s);
          if (e) { const v = votes.get(e.midi) || { n: 0, lens: [] }; v.n++; v.lens.push(e.len); votes.set(e.midi, v); }
        }
        let best = null;
        for (const [m, v] of votes) if (!best || v.n > best.v.n) best = { m, v };
        if (best && best.v.n >= 0.5 * active.length) loop.push({ s, midi: best.m, len: Math.max(1, medianOf(best.v.lens)) });
      }
      const key = (s, m) => s * 128 + m;
      const cons = new Set(loop.map(e => key(e.s, e.midi)));
      let inter = 0, uni = 0;
      for (const c of active) {
        const set = new Set();
        for (let s = 0; s < L; s++) { const e = bySt.get(c * L + s); if (e) set.add(key(s, e.midi)); }
        let i2 = 0; for (const k of set) if (cons.has(k)) i2++;
        inter += i2; uni += set.size + cons.size - i2;
      }
      folds.push({ bars: barsN, L, cycles, active: active.length, loop, consistency: uni ? inter / uni : 0 });
    }
    if (!folds.length) return null;
    const ref = Math.max.apply(null, folds.map(f => f.consistency));
    return folds.find(f => f.consistency >= ref - 0.03 && f.active >= 2) || folds.reduce((a, b) => (b.consistency > a.consistency ? b : a));
  }

  function bassLine(A, G, kickHits) {
    const hp = A.hp;
    const stepSec = G.beatSec / 4;
    const nSteps = Math.max(0, Math.floor((A.duration - G.d) / stepSec));
    const lp = lowpassDecimate(A.mono, 4, 330);
    const hop = HHOP / 4, W = 512;
    const nH = hp.nF;
    const rmsF = new Float32Array(nH);
    for (let f = 0; f < nH; f++) {
      let e = 0, c = 0;
      for (let j = f * hop; j < f * hop + W && j < lp.y.length; j++) { e += lp.y[j] * lp.y[j]; c++; }
      rmsF[f] = c ? Math.sqrt(e / c) : 0;
    }
    const eLow = new Float32Array(nH);
    const kA = hbin(30), kB = hbin(170);
    for (let f = 0; f < nH; f++) { let e = 0; const o = f * hp.K; for (let k = kA; k <= kB; k++) e += hp.H[o + k] * hp.H[o + k]; eLow[f] = Math.sqrt(e); }
    const gate = Math.max(1e-4, 0.08 * percentile(rmsF, 0.95));
    const yin = yinTrack(lp.y, lp.fs, hop, W, 32, 330, gate, rmsF);
    const nF = Math.min(nH, yin.nF);
    const midi = new Int16Array(nF).fill(-1);
    const loB = hbin(200), hiB = hbin(2000), loA = hbin(30);
    for (let f = 0; f < nF; f++) {
      const f0 = yin.f0[f];
      if (f0 < 32 || f0 > 200 || yin.ap[f] > 0.25) continue;
      if (bandRatio(hp, f, loA, loB, hiB) < 0.2) continue;
      midi[f] = Math.round(toMidi(f0));
    }
    {
      const copy = Int16Array.from(midi);
      for (let f = 0; f < nF; f++) {
        if (copy[f] < 0) continue;
        const neigh = [];
        for (let j = Math.max(0, f - 4); j <= Math.min(nF - 1, f + 4); j++) if (j !== f && copy[j] >= 0) neigh.push(copy[j]);
        if (neigh.length < 3) continue;
        neigh.sort((a, b) => a - b);
        const med = neigh[neigh.length >> 1];
        const diff = copy[f] - med;
        if (Math.abs(diff) === 12 || Math.abs(diff) === 11 || Math.abs(diff) === 13) midi[f] = med;
      }
    }
    for (let f = 1; f + 1 < nF; f++) {
      if (midi[f] >= 0 && midi[f - 1] === midi[f + 1] && midi[f - 1] !== midi[f]) midi[f] = midi[f - 1];
    }
    const segs = rleSegments(midi, 3, 3, true);
    const frameT = f => (f * hop + W / 2) / lp.fs - lp.delay;
    if (kickHits) {
      for (let i = 0; i + 1 < segs.length; i++) {
        const s1 = segs[i], s2 = segs[i + 1];
        const gapN = s2.a - s1.b - 1;
        if (s1.midi !== s2.midi || gapN < 1 || gapN > 10) continue;
        let kick = false, mn = 1e9, pk = 0;
        for (let f = Math.max(s1.a, s1.b - 2); f <= s1.b; f++) pk = Math.max(pk, eLow[f]);
        for (let f = s1.b + 1; f < s2.a; f++) {
          mn = Math.min(mn, eLow[f]);
          const st = Math.round((frameT(f) - G.d) / stepSec);
          if (st >= 0 && st < kickHits.length && kickHits[st]) kick = true;
        }
        if (kick && mn >= 0.35 * pk && eLow[s2.a] >= 0.5 * pk) { s1.b = s2.b; segs.splice(i + 1, 1); i--; }
      }
    }
    const fineHop = 32, fineW = 128;
    const nFine = Math.max(0, Math.floor((lp.y.length - fineW) / fineHop));
    const env = new Float32Array(nFine);
    for (let i = 0; i < nFine; i++) { let e = 0; for (let j = 0; j < fineW; j++) { const v = lp.y[i * fineHop + j]; e += v * v; } env[i] = Math.sqrt(e / fineW); }
    const fineT = i => (i * fineHop + fineW / 2) / lp.fs - lp.delay;
    const refineOnset = tc => {
      const a = Math.max(2, Math.floor(((tc - 0.14 + lp.delay) * lp.fs - fineW / 2) / fineHop));
      const b = Math.min(nFine - 3, Math.floor(((tc + 0.02 + lp.delay) * lp.fs - fineW / 2) / fineHop));
      let best = -1, bv = 0;
      for (let i = a; i <= b; i++) { const d = env[i + 2] - env[i - 2]; if (d > bv) { bv = d; best = i; } }
      return best < 0 ? tc : fineT(best);
    };
    const notes = [];
    for (const sg of segs) {
      const parts = [];
      let start = sg.a;
      for (let f = sg.a + 3; f <= sg.b; f++) {
        const m = Math.min(eLow[f - 1], eLow[f - 2], eLow[f - 3]);
        const stIdx = Math.round((frameT(f) - G.d) / stepSec);
        const k = kickHits && stIdx >= 0 && stIdx < kickHits.length && kickHits[stIdx] ? 1.6 : 1;
        if (eLow[f] > 2.0 * k * m && eLow[f] > 1.4 * eLow[f - 1] && f - start >= 3) { parts.push([start, f - 1]); start = f; }
      }
      parts.push([start, sg.b]);
      for (let pi = 0; pi < parts.length; pi++) {
        const [a, b] = parts[pi];
        const t0 = refineOnset(frameT(a));
        const limit = pi + 1 < parts.length ? parts[pi + 1][0] - 1 : Math.min(nF - 1, b + 40);
        let pk = 0; for (let f = a; f <= Math.min(a + 2, nF - 1); f++) pk = Math.max(pk, eLow[f]);
        let e = b;
        while (e + 1 <= limit && eLow[e + 1] >= 0.35 * pk && (midi[e + 1] < 0 || midi[e + 1] === sg.midi)) e++;
        notes.push({ t0, t1: Math.max(frameT(e) + 0.5 * (hop * 2 / lp.fs), t0 + 0.04), midi: sg.midi });
      }
    }
    const events = quantizeNotes(notes, G, nSteps);
    const chosen = foldNotes(events, nSteps);
    const voiced = Array.from(midi).filter(v => v >= 0).length / Math.max(1, nF);
    return {
      events, fold: chosen, voicedShare: voiced, dbg: { midi, ap: yin.ap, f0: yin.f0, eLow },
      bars: chosen ? chosen.bars : 0, notes: chosen ? chosen.loop : [], consistency: chosen ? chosen.consistency : 0,
      present: !!chosen && chosen.loop.length >= 2 && voiced > 0.05
    };
  }

  function harmonicOnsets(A) {
    const hp = A.hp, nH = hp.nF, K = hp.K;
    const a = hbin(200), b = hbin(3500);
    const out = new Float32Array(nH);
    const prev = new Float32Array(K), cur = new Float32Array(K);
    for (let f = 0; f < nH; f++) {
      const o = f * K;
      for (let k = a; k <= b; k++) cur[k] = Math.log(1 + 30 * hp.H[o + k]);
      if (f > 0) { let s = 0; for (let k = a; k <= b; k++) { const d = cur[k] - prev[k]; if (d > 0) s += d; } out[f] = s / (b - a + 1); }
      prev.set(cur);
    }
    return out;
  }

  function compRhythm(A, G) {
    const env = scaledByP99(harmonicOnsets(A));
    const stepSec = G.beatSec / 4;
    const nSteps = Math.max(0, Math.floor((A.duration - G.d) / stepSec));
    const toH = t => (t * SR - HN / 2) / HHOP;
    const w = 0.4 * stepSec * HFPS;
    const vals = new Float32Array(nSteps), gap = new Float32Array(nSteps);
    const mx = (a, b) => { let m = 0; for (let i = Math.max(0, Math.round(a)); i <= Math.min(env.length - 1, Math.round(b)); i++) if (env[i] > m) m = env[i]; return m; };
    for (let i = 0; i < nSteps; i++) {
      const c = toH(G.d + i * stepSec) + 1;
      vals[i] = mx(c - w, c + w);
      const g = 0.5 * stepSec * HFPS;
      gap[i] = Math.max(mx(c - g - 0.3 * w, c - g + 0.3 * w), mx(c + g - 0.3 * w, c + g + 0.3 * w));
    }
    const p95 = Math.max(1e-6, percentile(vals, 0.95));
    const floor = Math.min(percentile(vals, 0.1), 0.8 * p95);
    const thr = floor + 0.5 * (p95 - floor);
    const events = [];
    for (let i = 0; i < nSteps; i++) if (vals[i] > thr && vals[i] >= 1.5 * (gap[i] + 0.05 * p95)) events.push({ s: i, midi: 0, len: 1 });
    const chosen = foldNotes(events, nSteps);
    const bars = chosen ? chosen.bars : 0;
    const steps = chosen ? chosen.loop.map(e => e.s) : [];
    const perBar = chosen ? steps.length / bars : 0;
    return { events, fold: chosen, bars, steps, perBar, style: perBar <= 1.5 ? 'pad' : 'pluck', consistency: chosen ? chosen.consistency : 0 };
  }

  function leadLine(A, G) {
    const hp = A.hp, nH = hp.nF, K = hp.K;
    const stepSec = G.beatSec / 4;
    const nSteps = Math.max(0, Math.floor((A.duration - G.d) / stepSec));
    const mLo = 55, mHi = 88, nm = mHi - mLo + 1;
    const val = (o, f) => {
      const k0 = Math.floor(f * Math.pow(2, -0.5 / 12) / HBIN), k1 = Math.ceil(f * Math.pow(2, 0.5 / 12) / HBIN);
      let m = 0;
      for (let k = Math.max(1, k0); k <= Math.min(K - 1, k1); k++) { const v = hp.H[o + k]; if (v > m) m = v; }
      return m;
    };
    const midi = new Int16Array(nH).fill(-1);
    const conf = new Float32Array(nH);
    const S = new Float32Array(nm);
    const sal = [];
    for (let f = 0; f < nH; f++) {
      const o = f * K;
      let best = -1, bv = 0, tot = 0;
      for (let i = 0; i < nm; i++) {
        const f0 = hz(mLo + i);
        let s = 0, wgt = 1;
        for (let h = 1; h <= 6; h++) { const fr = f0 * h; if (fr > 10000) break; s += wgt * val(o, fr); wgt *= 0.85; }
        S[i] = s; tot += s;
        if (s > bv) { bv = s; best = i; }
      }
      if (best < 0) continue;
      const mean = tot / nm;
      sal.push(bv);
      let m = mLo + best;
      const e1 = val(o, hz(m)), e2 = val(o, hz(m) * 2);
      if (e1 < 0.25 * e2 && m + 12 <= mHi) m += 12;
      if (bv > 3.0 * mean && bv > 0) { midi[f] = m; conf[f] = bv; }
    }
    const gateV = 0.25 * percentile(Float32Array.from(sal), 0.9);
    for (let f = 0; f < nH; f++) if (conf[f] < gateV) midi[f] = -1;
    for (let f = 1; f + 1 < nH; f++) if (midi[f] >= 0 && midi[f - 1] === midi[f + 1] && midi[f - 1] !== midi[f]) midi[f] = midi[f - 1];
    const segs = rleSegments(midi, 3, 1);
    const frameT = f => (f * HHOP + HN / 2) / SR;
    const notes = segs.map(sg => ({ t0: frameT(sg.a) - 0.012, t1: frameT(sg.b) + 0.012, midi: sg.midi }));
    const events = quantizeNotes(notes, G, nSteps);
    const chosen = foldNotes(events, nSteps);
    return {
      events, fold: chosen, bars: chosen ? chosen.bars : 0, notes: chosen ? chosen.loop : [],
      consistency: chosen ? chosen.consistency : 0,
      present: !!chosen && chosen.loop.length >= 3 && chosen.consistency >= 0.45
    };
  }

  function barRoots(events, G) {
    const stepsPerBar = 16;
    const res = [];
    for (let b = 0; b < G.totalBars; b++) {
      const w = new Float64Array(12);
      let any = false;
      for (const e of events) {
        if (e.s >= b * stepsPerBar && e.s < (b + 1) * stepsPerBar) { w[((e.midi % 12) + 12) % 12] += e.len + (e.s % 16 === 0 ? 2 : 0); any = true; }
      }
      let bi = -1, bv = 0;
      if (any) for (let i = 0; i < 12; i++) if (w[i] > bv) { bv = w[i]; bi = i; }
      res.push(bi);
    }
    return res;
  }

  function monoVoice(notes, pick) {
    const ns = notes.slice().sort((a, b) => a.t0 - b.t0 || pick(b) - pick(a));
    const out = [];
    for (const n of ns) {
      const prev = out[out.length - 1];
      if (prev && n.t0 - prev.t0 < 0.05) { if (pick(n) > pick(prev)) out[out.length - 1] = n; continue; }
      if (prev && prev.t1 > n.t0) prev.t1 = n.t0;
      out.push({ t0: n.t0, t1: n.t1, midi: n.midi, amp: n.amp });
    }
    return out.filter(n => n.t1 - n.t0 > 0.03);
  }

  function voiceLayer(notes, G, A, minAmp) {
    const stepSec = G.beatSec / 4;
    const nSteps = Math.max(0, Math.floor((A.duration - G.d) / stepSec));
    const events = quantizeNotes(notes.filter(n => n.amp >= minAmp), G, nSteps);
    const chosen = foldNotes(events, nSteps);
    return {
      events, fold: chosen, bars: chosen ? chosen.bars : 0, notes: chosen ? chosen.loop : [],
      consistency: chosen ? chosen.consistency : 0,
      present: !!chosen && chosen.loop.length >= 3 && chosen.consistency >= 0.45
    };
  }

  function layersFromNotes(notes, G, A) {
    const bassN = monoVoice(notes.filter(n => n.midi <= 50), n => -n.midi);
    const leadN = monoVoice(notes.filter(n => n.midi >= 62), n => n.midi + 4 * n.amp);
    const amps = leadN.map(n => n.amp).sort((a, b) => a - b);
    const leadMin = amps.length ? 0.6 * amps[Math.floor(amps.length * 0.25)] : 0;
    const bamps = bassN.map(n => n.amp).sort((a, b) => a - b);
    const bassMin = bamps.length ? 0.6 * bamps[Math.floor(bamps.length * 0.25)] : 0;
    return { bass: voiceLayer(bassN, G, A, bassMin), lead: voiceLayer(leadN, G, A, leadMin) };
  }

  function analyzeLayers(A, G, opts) {
    opts = opts || {};
    const st = opts.stems || {};
    const D = drums(st.drums || A, G, opts.drums);
    let bass = bassLine(st.bass || A, G, D.hits && D.hits.kick);
    let lead = leadLine(st.lead || A, G);
    if (opts.notes && opts.notes.length) {
      const nl = layersFromNotes(opts.notes, G, A);
      const better = (o, n) => n.events.length >= 3 && (!o.present || n.consistency >= o.consistency - 0.02 || o.events.length < 3);
      if (!st.bass && better(bass, nl.bass)) bass = Object.assign(bass, nl.bass);
      if (!st.lead && better(lead, nl.lead)) lead = Object.assign(lead, nl.lead);
    }
    const H = st.harmony || A;
    const C = chords(H, G, { rootPrior: barRoots(bass.events, G) });
    const comp = compRhythm(H, G);
    return { drums: D, bass, chords: C, comp, lead };
  }

  function stemRole(name) {
    const n = String(name || '').toLowerCase();
    if (/fx|effect|sfx|noise/.test(n)) return 'ignore';
    if (/backing|backup|harmon|choir/.test(n)) return 'ignore';
    if (/vocal|vox|voice|sing|lead\s*vocal/.test(n)) return 'vocals';
    if (/drum|perc|kit|beat/.test(n)) return 'drums';
    if (/bass|sub/.test(n)) return 'bass';
    if (/lead|melod|solo|flute|violin|sax/.test(n)) return 'lead';
    return 'harmony';
  }

  function mixStems(list) {
    let n = 0;
    list.forEach(x => { if (x.length > n) n = x.length; });
    const out = new Float32Array(n);
    list.forEach(x => { for (let i = 0; i < x.length; i++) out[i] += x[i]; });
    return out;
  }

  async function analyzeStems(groups, progress) {
    const out = {};
    const roles = Object.keys(groups).filter(r => groups[r].length);
    let i = 0;
    for (const r of roles) {
      const key = r === 'vocals' ? 'lead' : r;
      if (r === 'vocals' && groups.lead && groups.lead.length) { i++; continue; }
      const x = groups[r].length === 1 ? groups[r][0] : mixStems(groups[r]);
      try { out[key] = await analyzeMono(x, (st, p) => { if (progress) progress((i + (p || 0)) / roles.length); }); }
      catch (e) { out[key] = null; }
      i++;
      if (progress) progress(i / roles.length);
    }
    Object.keys(out).forEach(k => { if (!out[k]) delete out[k]; });
    return out;
  }

  function windowLayers(L, G, startBar, nBars) {
    const s0 = startBar * 16, s1 = (startBar + nBars) * 16;
    const cut = events => events.filter(e => e.s >= s0 && e.s < s1).map(e => ({ s: e.s - s0, midi: e.midi, len: Math.max(1, Math.min(e.len, s1 - e.s)) }));
    const mk = events => { const notes = cut(events); return { notes, bars: nBars, consistency: 1, present: notes.length >= 3 }; };
    const bass = mk(L.bass.events), lead = mk(L.lead.events);
    const compEv = cut(L.comp.events);
    const comp = { steps: compEv.map(e => e.s), bars: nBars, perBar: compEv.length / nBars, style: compEv.length / nBars <= 1.5 ? 'pad' : 'pluck', consistency: 1 };
    const loop = [];
    for (let b = startBar; b < startBar + nBars; b++) {
      const pb = L.chords.perBar[b];
      loop.push(pb && !pb.nc ? { root: pb.root, minor: pb.minor, label: pb.label } : null);
    }
    return { bass, lead, comp, chords: { loop, loopBars: nBars, perBar: L.chords.perBar } };
  }

  function suggestWindow(L, G, nBars) {
    const total = G.totalBars;
    let best = 0, bv = -1;
    const cnt = new Float32Array(total + 1);
    [L.bass.events, L.lead.events, L.comp.events].forEach(ev => ev.forEach(e => { const b = Math.floor(e.s / 16); if (b < total) cnt[b]++; }));
    for (let a = 0; a + nBars <= total; a += 1) {
      let v = 0; for (let b = a; b < a + nBars; b++) v += Math.min(cnt[b], 24);
      v -= 0.01 * a;
      if (v > bv) { bv = v; best = a; }
    }
    return best;
  }

  root.InkBeatAnalyzer = {
    SR, FPS, NAMES, stemRole, analyzeStems, windowLayers, suggestWindow, bassLine, compRhythm, leadLine, analyzeLayers,
    analyzeMono, analyzeBuffer, resampleToMono, grid, refine, drums, chords,
    frameToTime, timeToFrame, chordLabel
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.InkBeatAnalyzer;
})(typeof window !== 'undefined' ? window : globalThis);
