// InkBeat Studio plugin: Bit Crusher (effect)
InkBeatPlugins.register({
  id: 'bit-crusher',
  type: 'effect',
  name: 'Bit Crusher',

  createNode(ctx, initialParams) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const shaper = ctx.createWaveShaper();

    input.connect(dry); dry.connect(output);
    input.connect(shaper); shaper.connect(wet); wet.connect(output);

    const p = Object.assign({ bits: 6, mix: 0.6 }, initialParams || {});

    function buildCurve(bits) {
      const steps = Math.pow(2, Math.max(1, Math.min(16, Math.round(bits))));
      const n = 1024;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.round(x * steps) / steps;
      }
      return curve;
    }

    function apply() {
      shaper.curve = buildCurve(p.bits);
      wet.gain.setTargetAtTime(p.mix, ctx.currentTime, 0.01);
      dry.gain.setTargetAtTime(1 - p.mix, ctx.currentTime, 0.01);
    }
    apply();

    return {
      input, output,
      setParam(id, value) { p[id] = value; apply(); }
    };
  }
});
