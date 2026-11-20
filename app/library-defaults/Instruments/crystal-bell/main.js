InkBeatPlugins.register({
  id: 'crystal-bell',
  type: 'instrument',
  name: 'Crystal Bell',

  createVoice(ctx, dest, note) {
    const p = note.params || {};
    const brightness = p.brightness ?? 2.4;
    const decay = p.decay ?? 1.6;
    const vel = note.velocity ?? 1;

    const carrier = ctx.createOscillator(); carrier.type = 'sine'; carrier.frequency.value = note.freq;
    const modulator = ctx.createOscillator(); modulator.type = 'sine';
    modulator.frequency.value = note.freq * 1.41;

    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(note.freq * brightness, note.time);
    modGain.gain.exponentialRampToValueAtTime(Math.max(1, note.freq * 0.1), note.time + decay);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, note.time);
    amp.gain.linearRampToValueAtTime(0.45 * vel, note.time + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0006, note.time + decay);

    carrier.connect(amp); amp.connect(dest);

    const stopAt = note.time + decay + 0.1;
    carrier.start(note.time); carrier.stop(stopAt);
    modulator.start(note.time); modulator.stop(stopAt);

    return {
      stop(atTime) {
        amp.gain.cancelScheduledValues(atTime);
        amp.gain.setValueAtTime(amp.gain.value, atTime);
        amp.gain.exponentialRampToValueAtTime(0.0006, atTime + 0.3);
      }
    };
  }
});
