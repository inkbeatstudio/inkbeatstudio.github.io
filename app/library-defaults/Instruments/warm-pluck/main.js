// InkBeat Studio plugin: Warm Pluck (instrument)
// Формат: див. PLUGIN_DEV_GUIDE.md
InkBeatPlugins.register({
  id: 'warm-pluck',
  type: 'instrument',
  name: 'Warm Pluck',

  // ctx: AudioContext, dest: AudioNode (куди підключити вихід),
  // note: { freq, time, duration, velocity (0..1), params }
  createVoice(ctx, dest, note) {
    const p = note.params || {};
    const cutoff = p.cutoff ?? 2200;
    const resonance = p.resonance ?? 2.5;
    const decay = p.decay ?? 0.45;
    const vel = note.velocity ?? 1;

    const osc1 = ctx.createOscillator(); osc1.type = 'sawtooth'; osc1.frequency.value = note.freq;
    const osc2 = ctx.createOscillator(); osc2.type = 'sawtooth'; osc2.frequency.value = note.freq; osc2.detune.value = 7;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = resonance;
    filter.frequency.setValueAtTime(cutoff * 2.2, note.time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.5), note.time + decay);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, note.time);
    amp.gain.linearRampToValueAtTime(0.55 * vel, note.time + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0008, note.time + note.duration + decay);

    osc1.connect(filter); osc2.connect(filter);
    filter.connect(amp); amp.connect(dest);

    const stopAt = note.time + note.duration + decay + 0.05;
    osc1.start(note.time); osc1.stop(stopAt);
    osc2.start(note.time); osc2.stop(stopAt);

    return {
      stop(atTime) {
        amp.gain.cancelScheduledValues(atTime);
        amp.gain.setValueAtTime(amp.gain.value, atTime);
        amp.gain.exponentialRampToValueAtTime(0.0008, atTime + 0.05);
        osc1.stop(atTime + 0.06); osc2.stop(atTime + 0.06);
      }
    };
  }
});
