// InkBeat Studio plugin: Hall Reverb (effect)
// Генерує імпульсну характеристику (білий шум із загасанням) і згортає
// через ConvolverNode — класичний спосіб алгоритмічної реверберації.
InkBeatPlugins.register({
  id: 'hall-reverb',
  type: 'effect',
  name: 'Hall Reverb',

  createNode(ctx, initialParams) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const convolver = ctx.createConvolver();

    input.connect(dry); dry.connect(output);
    input.connect(convolver); convolver.connect(wet); wet.connect(output);

    const p = Object.assign({ size: 3.2, damping: 2.2, mix: 0.32 }, initialParams || {});

    function buildImpulse(size, damping) {
      const rate = ctx.sampleRate;
      const len = Math.max(1, Math.floor(rate * size));
      const buf = ctx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, damping);
        }
      }
      return buf;
    }

    function apply(regenImpulse) {
      if (regenImpulse) convolver.buffer = buildImpulse(p.size, p.damping);
      wet.gain.setTargetAtTime(p.mix, ctx.currentTime, 0.02);
      dry.gain.setTargetAtTime(1, ctx.currentTime, 0.02);
    }
    apply(true);

    return {
      input, output,
      setParam(id, value) {
        p[id] = value;
        apply(id === 'size' || id === 'damping');
      }
    };
  }
});
