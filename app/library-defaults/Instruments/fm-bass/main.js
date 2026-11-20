InkBeatPlugins.register({
  id: 'fm-bass',
  type: 'instrument',
  name: 'FM Bass',

  createVoice(ctx, dest, note) {
    const p = note.params || {};
    const modIndex = p.modIndex ?? 4.5;
    const modRatio = p.modRatio ?? 1.5;
    const decay = p.decay ?? 0.35;
    const vel = note.velocity ?? 1;

    const carrier = ctx.createOscillator(); carrier.type = 'sine'; carrier.frequency.value = note.freq;
    const modulator = ctx.createOscillator(); modulator.type = 'sine';
    modulator.frequency.value = note.freq * modRatio;

    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(note.freq * modIndex, note.time);
    modGain.gain.exponentialRampToValueAtTime(Math.max(1, note.freq * 0.3), note.time + decay);
    modulator.connect(modGain); modGain.connect(carrier.frequency);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, note.time);
    amp.gain.linearRampToValueAtTime(0.6 * vel, note.time + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0008, note.time + note.duration + decay);

    carrier.connect(amp); amp.connect(dest);

    const stopAt = note.time + note.duration + decay + 0.05;
    carrier.start(note.time); carrier.stop(stopAt);
    modulator.start(note.time); modulator.stop(stopAt);

    return {
      stop(atTime) {
        amp.gain.cancelScheduledValues(atTime);
        amp.gain.setValueAtTime(amp.gain.value, atTime);
        amp.gain.exponentialRampToValueAtTime(0.0008, atTime + 0.05);
        carrier.stop(atTime + 0.06); modulator.stop(atTime + 0.06);
      }
    };
  }
});
