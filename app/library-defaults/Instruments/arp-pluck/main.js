InkBeatPlugins.register({
  id: 'arp-pluck',
  type: 'instrument',
  name: 'Arp Pluck',

  createVoice(ctx, dest, note) {
    const p = note.params || {};
    const brightness = p.brightness ?? 4500;
    const snap = p.snap ?? 0.08;
    const vel = note.velocity ?? 1;

    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = note.freq;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 4;
    filter.frequency.setValueAtTime(brightness, note.time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(200, brightness * 0.15), note.time + snap);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.5 * vel, note.time);
    amp.gain.exponentialRampToValueAtTime(0.0008, note.time + Math.min(note.duration, snap * 3));

    osc.connect(filter); filter.connect(amp); amp.connect(dest);

    const stopAt = note.time + Math.min(note.duration, snap * 3) + 0.05;
    osc.start(note.time); osc.stop(stopAt);

    return {
      stop(atTime) {
        amp.gain.cancelScheduledValues(atTime);
        amp.gain.setValueAtTime(amp.gain.value, atTime);
        amp.gain.exponentialRampToValueAtTime(0.0008, atTime + 0.03);
        osc.stop(atTime + 0.04);
      }
    };
  }
});
