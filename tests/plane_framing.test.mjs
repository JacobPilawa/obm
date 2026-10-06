import test from "node:test";
import assert from "node:assert/strict";
import { motionBounds, planeFrame } from "../plane_framing.js";

test("fixed motion bounds cover native movement, bat tips, and aligned replays without unrelated raw outliers", () => {
  const data = {
    entry: { discipline: "hitting" },
    metadata: { bat_length_in: 34 },
    signals: {
      landmarks: {
        time: [0, 0.5, 1],
        series: {
          hand_x: [-1, 0, 1],
          hand_y: [0, 0, 0],
          hand_z: [1, 1, 1],
          blast_hand_x: [0, 0, 0],
          blast_hand_y: [0, 0, 0],
          blast_hand_z: [1, 1, 1],
          sweet_spot_x: [0.5, 0.5, 0.5],
          sweet_spot_y: [0, 0, 0],
          sweet_spot_z: [1, 1, 1],
        },
      },
    },
    motion: {
      rate: 2,
      labels: ["LFHD", "unrelated"],
      frames: [
        [
          [0, 0, 2],
          [100, 100, 100],
        ],
        [
          [0, 0, 2],
          [100, 100, 100],
        ],
        [
          [0, 0, 2],
          [100, 100, 100],
        ],
      ],
    },
  };
  const records = [
    { data, names: ["hand"] },
    { data, names: ["hand"], shift: [2, 0, 0], range: { start: 0.5, end: 1 } },
  ];
  const original = JSON.stringify(data);
  const bounds = motionBounds(records);
  assert.ok(bounds.min[0] < -1 && bounds.max[0] > 3);
  assert.ok(bounds.max[2] > 2 && bounds.max[2] < 2.2);
  assert.equal(
    JSON.stringify(data),
    original,
    "Framing leaves native data intact",
  );
  const batOnly = motionBounds([
    { data, names: [], range: { start: 0.5, end: 0.5 } },
  ]);
  assert.ok(
    batOnly.min[0] < 0 && batOnly.max[0] > 0.65,
    "Includes knob and tip beyond tracked bat anchors",
  );
});

test("orthographic fit fills the limiting dimension and respects viewport aspect", () => {
  const bounds = { min: [-1, -0.25, 0], max: [1, 0.25, 2] };
  for (const plane of ["xy", "yz", "xz"])
    for (const aspect of [0.5, 1, 2]) {
      const frame = planeFrame(bounds, plane, aspect);
      const [a, b] = { xy: [0, 1], yz: [1, 2], xz: [0, 2] }[plane];
      const x =
        (bounds.max[a] - bounds.min[a]) / (2 * frame.halfHeight * aspect);
      const y = (bounds.max[b] - bounds.min[b]) / (2 * frame.halfHeight);
      assert.ok(x < 1 && y < 1);
      assert.ok(Math.max(x, y) > 0.94, "No oversized minimum frustum");
    }
});
