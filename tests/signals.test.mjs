import test from "node:test";
import assert from "node:assert/strict";
import {
  sample,
  derivative,
  cumulativeIntegral,
  massKg,
} from "../biomechanics.js";
import { plotBounds } from "../plot_range.js";

const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
test("native irregular timestamps preserve the quadratic derivative", () => {
  const time = [0, 0.1, 0.21, 0.3, 0.4];
  derivative(
    time,
    time.map((t) => t * t),
  )
    .slice(1, -1)
    .forEach((v, i) => near(v, 2 * time[i + 1]));
});
test("sample gaps and unknown work are never converted into zeros", () => {
  assert.equal(
    sample(
      { time: [0, 0.1, 0.2, 0.8, 0.9, 1], values: [0, 1, 2, 8, 9, 10] },
      0.5,
    ),
    null,
  );
  assert.equal(sample({ time: [0, 1], values: [0, 2] }, 0), 0);
  assert.deepEqual(cumulativeIntegral([0, 1, 2, 3], [2, 2, null, 2], 0), [
    0,
    2,
    null,
    null,
  ]);
  assert.deepEqual(cumulativeIntegral([0, 1, 2, 3], [2, 2, 2, 2], 0.5), [
    null,
    1,
    3,
    5,
  ]);
  near(
    massKg({
      entry: { discipline: "hitting" },
      metadata: { session_mass_lbs: 200 },
    }),
    90.718474,
  );
});
test("chart event windows fall back when a target recording lacks an event", () => {
  const metric = { time: [0, 0.5, 1], values: [0, 1, 2] };
  const trial = {
    duration: 1,
    events: { fp_100_time: { time: 0.2 }, BR_time: { time: 0.8 } },
  };
  assert.deepEqual(
    plotBounds(metric, trial, { start: "fp_100_time", end: "BR_time" }),
    { min: 0.2, max: 0.8 },
  );
  assert.deepEqual(
    plotBounds(metric, trial, { start: "missing", end: "BR_time" }),
    { min: 0, max: 1 },
  );
});
