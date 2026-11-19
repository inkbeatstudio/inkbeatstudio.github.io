/*
 * InkBeat Analyzer — рушій аналізу треку (Етап 1)
 * =================================================
 * Чистий JS, без залежностей і без DOM — працює і в застосунку, і в Node для тестів.
 *
 * Що вміє:
 *   - BPM (автокореляція onset-огинаючої + точне підлаштування сітки),
 *   - позиція першого такту (downbeat) і стабільність темпу,
 *   - тональність (хрома + профілі Крумгансла-Кесслера),
 *   - акорди по тактах (хрома + шаблони тріад, з урахуванням тональності),
 *   - ударні по сітці 16-х: kick / snare / hi-hat / open hat + згортка в цикл 1/2/4 такти.
 *
 * Чого НЕ вміє (чесно): мелодію, вокал, точні тембри. Це наближення, яке потім
 * доводять руками. Усе рахується локально.
 *
 * Публічний API: InkBeatAnalyzer.{analyzeMono, analyzeBuffer, grid, refine, drums, chords}
 */
(function (root) {
  'use strict';

  const SR = 22050;
  const N1 = 1024, HOP1 = 256;     // для onset-огинаючих
  const N2 = 4096, HOP2 = 2048;    // для хроми
  const FPS = SR / HOP1;
  // Системна затримка між піком флюсу та реальним моментом удару (с).
  // Калібрується на синтетичному треку (tools/test_engine.js).
  const LATENCY = 0.0;

  // межі смуг у бінах FFT (N1=1024, 21.53 Гц/бін)
  const BAND = {
    low:   [2, 7],      //  43–151 Гц  — kick
    body:  [8, 18],     // 172–388 Гц  — тіло малого
    noise: [84, 255],   // 1.8–5.5 кГц — шум малого
    hat:   [325, 487],  //   7–10.5 кГц — хет
    full:  [2, 300]     // широка смуга для темпу
  };

  const tick = () => new Promise(r => setTimeout(r, 0));

  // ---------------------------------------------------------------- DSP ----
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

  // ------------------------------------------------- time <-> frame (N1) ----
  const frameToTime = f => (f + (N1 / 2) / HOP1) / FPS - LATENCY;
  const timeToFrame = t => (t + LATENCY) * FPS - (N1 / 2) / HOP1;

  // ----------------------------------------------------- pass 1: onsets ----
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
    // 'full' (для темпу) — сильне стиснення; смуги ударних — м'яке, щоб витоки між смугами не роздувались
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

  // -------------------------------------------------------------- tempo ----
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

  // Підбір сітки: максимізує середнє значення огинаючої в точках сітки.
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

  // ----------------------------------------------------------- chroma/key ----
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

  // діатонічні тріади для штрафу недіатонічних
  function diatonicSet(key) {
    const set = new Set();
    const major = [[0, 0], [2, 1], [4, 1], [5, 0], [7, 0], [9, 1]]; // [півтони, minor?]
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

  // ------------------------------------------------------------ analysis ----
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

    // стабільність: підлаштування окремо по половинах
    const mid = bt.length >> 1;
    const fa = fitGrid(bt, fit.bpm * 0.985, fit.bpm * 1.015, 0.02, 0, mid);
    const fb = fitGrid(bt, fit.bpm * 0.985, fit.bpm * 1.015, 0.02, mid, bt.length - 2);
    const drift = Math.abs(fa.bpm - fb.bpm);
    const confidence = Math.max(0, Math.min(1, (fit.score / (fit.mean || 1) - 1) / 2.5));

    report('chroma', 0);
    const chroma = await chromaPass(x, p => report('chroma', p));
    const key = detectKey(chroma);

    report('done', 1);
    return {
      sr: SR, duration: x.length / SR, mono: x, on, nrm, bt,
      tempo: { bpm: fit.bpm, candidates: cands.map(c => c.bpm), confidence, drift },
      chroma, key
    };
  }

  /**
   * Моно-мікс і зниження частоти до 22.05 кГц віконним sinc-фільтром (антиаліасинг).
   * Вбудований ресемплер браузера (OfflineAudioContext) використовує лінійну інтерполяцію без фільтра:
   * вміст вище 11 кГц (хети, тарілки) «складається» у смугу аналізу й хибно активує детектори.
   */
  async function resampleToMono(channels, srIn, progress) {
    const nCh = channels.length, nIn = channels[0].length;
    const mono = new Float32Array(nIn);
    for (let c = 0; c < nCh; c++) { const d = channels[c]; for (let i = 0; i < nIn; i++) mono[i] += d[i] / nCh; }
    if (srIn === SR) return mono;

    const ratio = srIn / SR;                         // вхідних відліків на один вихідний
    const fcN = Math.min(1, 1 / ratio) * 0.94;       // зріз як частка Найквіста входу
    const W = Math.ceil(16 / fcN);                   // півширина ядра у вхідних відліках
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

  // ---------------------------------------------------------------- grid ----
  /** Сітка для заданого BPM: підлаштовує фазу, знаходить 1-шу долю такту (downbeat). */
  function grid(A, bpm, opts) {
    opts = opts || {};
    const shift = ((opts.shift || 0) % 4 + 4) % 4;
    const fit = fitGrid(A.bt, bpm, bpm, 1, 0, undefined); // фіксований BPM, пошук фази
    const periodF = 60 * FPS / bpm;
    const beatSec = 60 / bpm;
    const phaseSec = frameToTime(fit.phase);                // час першої долі (k=0), завжди > 0

    // середня сила kick/snare по позиціях долі в такті (k mod 4)
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
    // перший такт починається з долі k = p (серед перших чотирьох), з урахуванням ручного зсуву
    const p = (p0 + shift) & 3;
    const barSec = beatSec * 4;
    let dSec = phaseSec + p * beatSec;
    // перший такт може починатись трохи «до» початку файлу (downbeat рівно в 0 с) — тоді сітка стартує з від'ємного часу
    while (dSec - barSec >= -0.25) dSec -= barSec;
    return {
      bpm, beatSec, barSec, phaseSec, downbeatPhase: p0, shift,
      d: dSec, totalBars: Math.max(0, Math.floor((A.duration - dSec) / barSec)),
      kickPhase: kM, snarePhase: sM
    };
  }

  /** Підлаштувати BPM навколо значення (після ÷2 / ×2 / ручної правки). */
  function refine(A, bpm, rel) {
    const r = refineTempo(A.bt, bpm, rel || 0.01);
    return r.bpm;
  }

  // --------------------------------------------------------------- drums ----
  function maxIn(env, a, b) {
    let m = 0;
    for (let i = Math.max(0, a); i <= Math.min(env.length - 1, b); i++) if (env[i] > m) m = env[i];
    return m;
  }

  function drums(A, G, opts) {
    opts = opts || {};
    const stepSec = G.beatSec / 4;
    const nSteps = Math.max(0, Math.floor((A.duration - G.d) / stepSec));
    const stepF = stepSec * FPS;
    const w = Math.max(1, Math.round(0.35 * stepF));
    const vals = { kick: new Float32Array(nSteps), snare: new Float32Array(nSteps), hat: new Float32Array(nSteps), noise: new Float32Array(nSteps) };
    const gap = { kick: new Float32Array(nSteps), snare: new Float32Array(nSteps), hat: new Float32Array(nSteps) };
    const noiseN = scaledByP99(A.on.noise);
    const halfF = stepF / 2, wg = Math.max(1, Math.round(0.2 * stepF));
    // рівень «між кроками»: максимум у вікнах на пів-кроку лівіше й правіше (удар лишає після себе майже нуль флюсу,
    // а тривалий звук — однаковий рівень скрізь, тому контрасту не дає)
    const between = (env, f) => Math.max(
      maxIn(env, Math.round(f - halfF) - wg, Math.round(f - halfF) + wg),
      maxIn(env, Math.round(f + halfF) - wg, Math.round(f + halfF) + wg));
    const centers = new Int32Array(nSteps);
    for (let i = 0; i < nSteps; i++) {
      const f = Math.round(timeToFrame(G.d + i * stepSec));
      centers[i] = f;
      vals.kick[i] = maxIn(A.nrm.kick, f - w, f + w);
      vals.snare[i] = maxIn(A.nrm.snare, f - w, f + w);
      vals.hat[i] = maxIn(A.nrm.hat, f - w, f + w);
      vals.noise[i] = maxIn(noiseN, f - w, f + w);
      gap.kick[i] = between(A.nrm.kick, f);
      gap.snare[i] = between(A.nrm.snare, f);
      gap.hat[i] = between(A.nrm.hat, f);
    }
    // Чи є що аналізувати у смузі взагалі: абсолютний рівень флюсу (у «порожній» смузі він на порядок нижчий).
    // Піковість p99/медіана тут не годиться: тривалі гармонічні звуки (пад, гітара, вокал) тримають смугу «зайнятою».
    const present = {
      kick: true, // низька смуга не відрізняє kick від баса — вирішує користувач
      snare: percentile(A.on.noise, 0.99) >= 0.006,
      hat: percentile(A.on.hat, 0.99) >= 0.01
    };
    const thrFrac = { kick: opts.kickThr || 0.4, snare: opts.snareThr || 0.35, hat: opts.hatThr || 0.3, noise: 0.4 };
    const thr = {};
    const p95 = {};
    for (const k of Object.keys(vals)) {
      // поріг відраховується від «підлоги» (p10), а не від нуля: у щільному міксі фон не нульовий
      p95[k] = Math.max(1e-6, percentile(vals[k], 0.95));
      const floor = Math.min(percentile(vals[k], 0.10), 0.8 * p95[k]);
      thr[k] = floor + thrFrac[k] * (p95[k] - floor);
    }
    const CONTRAST = 1.4;
    const stands = (k, i) => vals[k][i] >= CONTRAST * (gap[k][i] + 0.05 * p95[k]);

    const hits = {
      kick: new Uint8Array(nSteps), snare: new Uint8Array(nSteps),
      hihat: new Uint8Array(nSteps), ohat: new Uint8Array(nSteps)
    };
    for (let i = 0; i < nSteps; i++) {
      if (vals.kick[i] > thr.kick && stands('kick', i)) hits.kick[i] = 1;
      // малий: геометричне середнє «тіло×шум» І окремо справжній шум (kick шуму майже не дає)
      // + малий має бути помітно сильнішим за низ у цей момент (у справжнього малого витік kick ≈ 0.2 від його рівня);
      //   інакше це kick/бас, до якого просто домішаний хет
      if (present.snare && vals.snare[i] > thr.snare && vals.noise[i] > thr.noise && stands('snare', i) && vals.kick[i] < 0.6 * vals.snare[i]) hits.snare[i] = 1;
      if (present.hat && vals.hat[i] > thr.hat && stands('hat', i)) {
        const f = centers[i];
        let pk = 0; for (let d = -1; d <= 2; d++) pk = Math.max(pk, A.on.hatE[Math.min(A.on.nF - 1, Math.max(0, f + d))]);
        let tail = 0, c = 0;
        for (let d = 3; d <= 9; d++) { const j = f + d; if (j < A.on.nF) { tail += A.on.hatE[j]; c++; } }
        const ratio = pk > 0 && c ? (tail / c) / pk : 0;
        // на кроках малого його власний шумовий хвіст схожий на відкритий хет — поріг суворіший
        const openThr = hits.snare[i] ? 0.35 : 0.12;
        if (ratio > openThr) hits.ohat[i] = 1; else hits.hihat[i] = 1;
      }
    }

    const names = ['kick', 'snare', 'hihat', 'ohat'];
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
    // найкоротший цикл, консистентність якого в межах 3% від найкращої серед усіх варіантів
    let chosen = folds[folds.length - 1];
    if (folds.length) {
      const ref = Math.max.apply(null, folds.map(f => f.consistency));
      chosen = folds.find(f => f.consistency >= ref - 0.03 && f.active >= 2)
        || folds.reduce((a, b) => (b.consistency > a.consistency ? b : a));
    }
    const result = {
      stepsTotal: nSteps, hits, fold: chosen, folds, debug: { vals, thr },
      presence: { kick: present.kick, snare: present.snare, hihat: present.hat, ohat: present.hat }
    };
    if (chosen) {
      result.bars = chosen.bars;
      result.pattern = {};
      for (const nm of names) result.pattern[nm] = Array.from(chosen.cons[nm]).map(v => !!v);
      // у kick/малого не буває понад ~45% заповнених кроків — це означає, що детектор спрацював на фон
      for (const nm of ['kick', 'snare']) {
        const dens = result.pattern[nm].filter(Boolean).length / result.pattern[nm].length;
        if (dens > 0.45) { result.pattern[nm] = result.pattern[nm].map(() => false); result.presence[nm] = false; }
      }
      result.counts = {};
      for (const nm of names) result.counts[nm] = result.pattern[nm].filter(Boolean).length;
    }
    return result;
  }

  // --------------------------------------------------------------- chords ----
  function chords(A, G) {
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
        scores.push({ root: r, minor, s });
      }
      scores.sort((a, b) => b.s - a.s);
      perBar.push({ nc: false, root: scores[0].root, minor: scores[0].minor, label: chordLabel(scores[0].root, scores[0].minor), sim: scores[0].s, scores });
    }
    // згортка в цикл із 4 тактів (або менше, якщо трек короткий)
    // у студії піано-рол підтримує цикл 1/2/4 такти
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

  root.InkBeatAnalyzer = {
    SR, FPS, NAMES,
    analyzeMono, analyzeBuffer, resampleToMono, grid, refine, drums, chords,
    frameToTime, timeToFrame, chordLabel
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.InkBeatAnalyzer;
})(typeof window !== 'undefined' ? window : globalThis);
