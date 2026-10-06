import test from "node:test";
import assert from "node:assert/strict";
import { batPose } from "../bat_pose.js";
import { motionAnalysis } from "../motion_analysis.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
test("bat prop preserves handle/sweet-spot anchors and declared length", () => {
  const handle = [0.2, -0.4, 1.2],
    sweet = [0.2, 0.1375, 1.2];
  const pose = batPose(handle, sweet, 34);
  near(pose.length, 34 * 0.0254);
  for (let i = 0; i < 3; i++) {
    near(pose.knob[i] + pose.direction[i] * pose.handleOffset, handle[i]);
    near(pose.knob[i] + pose.direction[i] * pose.sweetOffset, sweet[i]);
  }
  assert.deepEqual(handle, [0.2, -0.4, 1.2]);
  const fallback = batPose(handle, sweet, null);
  near(fallback.length, 0.5375 / 0.62);
  assert.equal(batPose(handle, [null, 0, 0], 34), null);
  assert.equal(batPose(handle, handle, 34), null);
});
function hitter() {
  const series = {};
  for (const [name, x, y, z] of [
    ["left_hip", 0, 0.15, 1],
    ["right_hip", 0, -0.15, 1],
    ["lsjc", 0.1, 0.2, 1.5],
    ["rsjc", 0.1, -0.2, 1.5],
  ]) {
    series[name + "_x"] = [x, x + 0.1, x + 0.2];
    series[name + "_y"] = [y, y, y];
    series[name + "_z"] = [z, z, z];
  }
  return {
    entry: { discipline: "hitting", side: "R" },
    signals: { landmarks: { time: [1, 1.5, 2], series } },
  };
}
test("trunk display holds both endpoints without extending native signals", () => {
  const analysis = motionAnalysis(hitter());
  assert.deepEqual(analysis.axisGuideAt(-3), analysis.at(1).axis);
  assert.deepEqual(analysis.axisGuideAt(5), analysis.at(2).axis);
  assert.equal(analysis.at(0).axis, null);
  assert.equal(analysis.at(3).axis, null);
  assert.equal(analysis.axisGuideAt(NaN), null);
});
test("trunk display preserves internal landmark gaps", () => {
  const data = hitter();
  data.signals.landmarks.series.lsjc_x[1] = null;
  const analysis = motionAnalysis(data);
  assert.ok(analysis.axisGuideAt(0));
  assert.equal(analysis.axisGuideAt(1.25), null);
  assert.equal(analysis.axisGuideAt(1.5), null);
  assert.ok(analysis.axisGuideAt(3));
});
