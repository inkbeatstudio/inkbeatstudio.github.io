// InkBeat Studio plugin: Deep Sub (instrument)
InkBeatPlugins.register({
  id: 'deep-sub',
  type: 'instrument',
  name: 'Deep Sub',

  createVoice(ctx, dest, note) {
    const p = note.params || {};
    const drive = p.drive ?? 0.25;
    const glide = p.glide ?? 0.02;
    const subLevel = p.sub ?? 0.6;
    const vel = note.velocity ?? 1;

    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(note.freq * 0.98, note.time);
    osc.frequency.linearRampToValueAtTime(note.freq, note.time + glide);

    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = note.freq / 2;
    const subGain = ctx.createGain(); subGain.gain.value = subLevel;

    // легка сатурація через waveshaper — додає "тепла" без грубого спотворення
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * (1 + drive * 4));
    }
    shaper.curve = curve;

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, note.time);
    amp.gain.linearRampToValueAtTime(0.7 * vel, note.time + 0.01);
    amp.gain.setValueAtTime(0.7 * vel, note.time + Math.max(0.01, note.duration - 0.05));
    amp.gain.exponentialRampToValueAtTime(0.0008, note.time + note.duration + 0.15);

    osc.connect(shaper);
    sub.connect(subGain); subGain.connect(shaper);
    shaper.connect(amp); amp.connect(dest);

    const stopAt = note.time + note.duration + 0.2;
    osc.start(note.time); osc.stop(stopAt);
    sub.start(note.time); sub.stop(stopAt);

    return {
      stop(atTime) {
        amp.gain.cancelScheduledValues(atTime);
        amp.gain.setValueAtTime(amp.gain.value, atTime);
        amp.gain.exponentialRampToValueAtTime(0.0008, atTime + 0.08);
        osc.stop(atTime + 0.1); sub.stop(atTime + 0.1);
      }
    };
  }
});
