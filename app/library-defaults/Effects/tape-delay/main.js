InkBeatPlugins.register({
  id: 'tape-delay',
  type: 'effect',
  name: 'Tape Delay',

  createNode(ctx, initialParams) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();

    const delay = ctx.createDelay(2.0);
    const feedback = ctx.createGain();
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 3200;

    const wobbleLfo = ctx.createOscillator(); wobbleLfo.type = 'sine'; wobbleLfo.frequency.value = 0.7;
    const wobbleDepth = ctx.createGain(); wobbleDepth.gain.value = 0;
    wobbleLfo.connect(wobbleDepth); wobbleDepth.connect(delay.delayTime);
    wobbleLfo.start();

    input.connect(dry); dry.connect(output);
    input.connect(delay); delay.connect(tone); tone.connect(feedback);
    feedback.connect(delay); tone.connect(wet); wet.connect(output);

    const p = Object.assign({ time: 0.32, feedback: 0.42, wobble: 0.25, mix: 0.35 }, initialParams || {});

    function apply() {
      delay.delayTime.setTargetAtTime(p.time, ctx.currentTime, 0.01);
      feedback.gain.setTargetAtTime(p.feedback, ctx.currentTime, 0.01);
      wobbleDepth.gain.setTargetAtTime(p.wobble * 0.006, ctx.currentTime, 0.01);
      wet.gain.setTargetAtTime(p.mix, ctx.currentTime, 0.01);
      dry.gain.setTargetAtTime(1 - p.mix * 0.5, ctx.currentTime, 0.01);
    }
    apply();

    return {
      input, output,
      setParam(id, value) { p[id] = value; apply(); },
      dispose() { try { wobbleLfo.stop(); } catch (e) {} }
    };
  }
});
