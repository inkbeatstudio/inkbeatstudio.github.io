// InkBeat Studio plugin: Stereo Widener (effect)
// Mid/Side обробка чистими Web Audio нодами (без AudioWorklet):
//   M = (L+R)*0.5, S = (L-R)*0.5
//   L' = M + S*width, R' = M - S*width
InkBeatPlugins.register({
  id: 'stereo-widener',
  type: 'effect',
  name: 'Stereo Widener',

  createNode(ctx, initialParams) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);

    input.connect(splitter);

    const lToMid = ctx.createGain(); lToMid.gain.value = 0.5;
    const rToMid = ctx.createGain(); rToMid.gain.value = 0.5;
    const lToSide = ctx.createGain(); lToSide.gain.value = 0.5;
    const rToSide = ctx.createGain(); rToSide.gain.value = -0.5;

    const mid = ctx.createGain();
    const side = ctx.createGain();
    splitter.connect(lToMid, 0); splitter.connect(rToMid, 1);
    lToMid.connect(mid); rToMid.connect(mid);
    splitter.connect(lToSide, 0); splitter.connect(rToSide, 1);
    lToSide.connect(side); rToSide.connect(side);

    const sideToL = ctx.createGain();
    const sideToR = ctx.createGain();
    side.connect(sideToL); side.connect(sideToR);

    mid.connect(merger, 0, 0); mid.connect(merger, 0, 1);
    sideToL.connect(merger, 0, 0);
    sideToR.connect(merger, 0, 1);

    merger.connect(output);

    const p = Object.assign({ width: 1.4 }, initialParams || {});
    function apply() {
      sideToL.gain.setTargetAtTime(p.width, ctx.currentTime, 0.02);
      sideToR.gain.setTargetAtTime(-p.width, ctx.currentTime, 0.02);
    }
    apply();

    return {
      input, output,
      setParam(id, value) { p[id] = value; apply(); }
    };
  }
});
