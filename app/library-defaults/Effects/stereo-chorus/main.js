// InkBeat Studio plugin: Stereo Chorus (effect)
InkBeatPlugins.register({
  id: 'stereo-chorus',
  type: 'effect',
  name: 'Stereo Chorus',

  createNode(ctx, initialParams) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    const dry = ctx.createGain();
    const wet = ctx.createGain();

    const delayL = ctx.createDelay(0.05);
    const delayR = ctx.createDelay(0.05);
    const lfoL = ctx.createOscillator(); lfoL.type = 'sine';
    const lfoR = ctx.createOscillator(); lfoR.type = 'sine';
    const depthL = ctx.createGain();
    const depthR = ctx.createGain();

    lfoL.connect(depthL); depthL.connect(delayL.delayTime);
    lfoR.connect(depthR); depthR.connect(delayR.delayTime);

    input.connect(dry); dry.connect(output);
    // мономіксуємо вхід у обидва канали хоруса для стабільної ширини
    input.connect(delayL);
    input.connect(delayR);
    delayL.connect(merger, 0, 0);
    delayR.connect(merger, 0, 1);
    merger.connect(wet); wet.connect(output);

    lfoL.start(); lfoR.start();

    const p = Object.assign({ rate: 0.8, depth: 0.5, mix: 0.4 }, initialParams || {});

    function apply() {
      lfoL.frequency.setTargetAtTime(p.rate, ctx.currentTime, 0.02);
      lfoR.frequency.setTargetAtTime(p.rate * 1.15, ctx.currentTime, 0.02); // трохи різна швидкість L/R -> ширина
      const depthSec = 0.002 + p.depth * 0.01;
      depthL.gain.setTargetAtTime(depthSec, ctx.currentTime, 0.02);
      depthR.gain.setTargetAtTime(depthSec, ctx.currentTime, 0.02);
      delayL.delayTime.setTargetAtTime(0.012, ctx.currentTime, 0.02);
      delayR.delayTime.setTargetAtTime(0.018, ctx.currentTime, 0.02);
      wet.gain.setTargetAtTime(p.mix, ctx.currentTime, 0.01);
      dry.gain.setTargetAtTime(1, ctx.currentTime, 0.01);
    }
    apply();

    return {
      input, output,
      setParam(id, value) { p[id] = value; apply(); },
      dispose() { try { lfoL.stop(); lfoR.stop(); } catch (e) {} }
    };
  }
});
