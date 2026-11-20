const fs = require('fs');
const path = require('path');
const A = require(path.join(__dirname, '..', 'app', 'pages', 'analyzer', 'engine.js'));

function readWav(file) {
  const b = fs.readFileSync(file);
  const ch = b.readUInt16LE(22), sr = b.readUInt32LE(24), bits = b.readUInt16LE(34);
  let off = 12, dataOff = 0, dataLen = 0;
  while (off < b.length - 8) {
    const id = b.toString('ascii', off, off + 4), len = b.readUInt32LE(off + 4);
    if (id === 'data') { dataOff = off + 8; dataLen = len; break; }
    off += 8 + len;
  }
  if (bits !== 16) throw new Error('only 16-bit');
  const n = dataLen / 2 / ch, chans = [];
  for (let c = 0; c < ch; c++) chans.push(new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) chans[c][i] = b.readInt16LE(dataOff + (i * ch + c) * 2) / 32768;
  return { chans, sr };
}

(async () => {
  const [wavPath, jsonPath] = process.argv.slice(2);
  const truth = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const { chans, sr } = readWav(wavPath);
  const x = await A.resampleToMono(chans, sr);

  const t0 = Date.now();
  const an = await A.analyzeMono(x, () => {});
  const ms = Date.now() - t0;
  const G = A.grid(an, an.tempo.bpm);
  const D = A.drums(an, G);
  const C = A.chords(an, G);

  const fmt = v => (typeof v === 'number' ? v.toFixed(3) : v);
  console.log(`файл: ${path.basename(wavPath)}  (${an.duration.toFixed(1)} c, аналіз ${ms} мс)`);
  console.log(`BPM:        знайдено ${fmt(an.tempo.bpm)}   правда ${truth.bpm}   Δ=${fmt(an.tempo.bpm - truth.bpm)}   (дрейф ${fmt(an.tempo.drift)}, впевн. ${fmt(an.tempo.confidence)})`);
  console.log(`кандидати:  ${an.tempo.candidates.map(v => v.toFixed(1)).join(', ')}`);
  console.log(`1-й такт:   знайдено ${fmt(G.d)} c   правда ${truth.firstDownbeatSec} c   Δ=${fmt(G.d - truth.firstDownbeatSec)} c   (фаза долі ${G.downbeatPhase})`);
  console.log(`тональність: знайдено ${an.key.name} (r=${fmt(an.key.score)}, запас ${fmt(an.key.margin)})   правда ${truth.key}`);
  console.log(`акорди (цикл): ${C.loop.map(c => c ? c.label : '?').join(' ')}   правда ${truth.chordLoop.join(' ')}`);
  const barsOk = C.perBar.slice(0, truth.bars).filter((c, i) => !c.nc && c.label === truth.chords[i]).length;
  console.log(`акорди по тактах: збіглося ${barsOk}/${Math.min(C.perBar.length, truth.bars)}`);

  console.log(`ударні: цикл ${D.bars} такт(и), консистентність ${fmt(D.fold && D.fold.consistency)}, правда ${truth.drumLoopBars} такт(и)`);
  const L = 16 * (D.bars || 0);
  if (D.pattern && D.bars) {
    let tp = 0, fp = 0, fn = 0;
    const truthBits = {};
    for (const inst of Object.keys(truth.drumLoop)) {
      truthBits[inst] = new Array(L).fill(false);
      for (let b = 0; b < D.bars; b++) {
        const loop = truth.drumLoop[inst][b % truth.drumLoopBars];
        loop.forEach(s => { truthBits[inst][b * 16 + s] = true; });
      }
    }
    for (const inst of Object.keys(truthBits)) {
      let line = '';
      for (let s = 0; s < L; s++) {
        const got = D.pattern[inst][s], exp = truthBits[inst][s];
        if (got && exp) tp++; else if (got) fp++; else if (exp) fn++;
        line += got && exp ? 'X' : got ? '+' : exp ? '-' : '.';
        if ((s + 1) % 16 === 0) line += ' ';
      }
      console.log(`  ${inst.padEnd(6)} ${line}`);
    }
    const prec = tp / Math.max(1, tp + fp), rec = tp / Math.max(1, tp + fn);
    console.log(`  X=збіг  +=зайве  -=пропущено   precision=${prec.toFixed(2)} recall=${rec.toFixed(2)}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
