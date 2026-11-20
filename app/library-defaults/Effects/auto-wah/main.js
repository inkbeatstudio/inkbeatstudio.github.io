InkBeatPlugins.register({
  id: 'auto-wah',
  type: 'effect',
  name: 'Auto Wah',

  createNode(ctx, initialParams) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.Q.value = 6;

    const lfo = ctx.createOscillator(); lfo.type = 'sine';
    const lfoDepthGain = ctx.createGain();
    lfo.connect(lfoDepthGain);
    lfoDepthGain.connect(filter.frequency);
    lfo.start();

    input.connect(filter); filter.connect(output);

    const p = Object.assign({ rate: 2.2, depth: 0.7, base: 700 }, initialParams || {});
    function apply() {
      lfo.frequency.setTargetAtTime(p.rate, ctx.currentTime, 0.02);
      filter.frequency.setTargetAtTime(p.base, ctx.currentTime, 0.02);
      lfoDepthGain.gain.setTargetAtTime(p.base * p.depth * 0.9, ctx.currentTime, 0.02);
    }
    apply();

    return {
      input, output,
      setParam(id, value) { p[id] = value; apply(); },
      dispose() { try { lfo.stop(); } catch (e) {} }
    };
  }
});
