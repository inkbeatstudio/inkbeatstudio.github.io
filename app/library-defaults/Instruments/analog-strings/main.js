InkBeatPlugins.register({
  id: 'analog-strings',
  type: 'instrument',
  name: 'Analog Strings',

  createVoice(ctx, dest, note) {
    const p = note.params || {};
    const attack = p.attack ?? 0.35;
    const detune = p.detune ?? 9;
    const cutoff = p.cutoff ?? 3200;
    const vel = note.velocity ?? 1;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = 0.7;

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, note.time);
    amp.gain.linearRampToValueAtTime(0.4 * vel, note.time + attack);
    amp.gain.setValueAtTime(0.4 * vel, note.time + Math.max(attack, note.duration - 0.1));
    amp.gain.exponentialRampToValueAtTime(0.0008, note.time + note.duration + 0.4);

    const detunes = [-detune, 0, detune, detune * 1.8];
    const oscs = detunes.map(d => {
      const osc = ctx.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.value = note.freq; osc.detune.value = d;
      osc.connect(filter);
      return osc;
    });

    filter.connect(amp); amp.connect(dest);

    const stopAt = note.time + note.duration + 0.5;
    oscs.forEach(o => { o.start(note.time); o.stop(stopAt); });

    return {
      stop(atTime) {
        amp.gain.cancelScheduledValues(atTime);
        amp.gain.setValueAtTime(amp.gain.value, atTime);
        amp.gain.exponentialRampToValueAtTime(0.0008, atTime + 0.35);
        oscs.forEach(o => o.stop(atTime + 0.4));
      }
    };
  }
});
