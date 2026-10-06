import assert from "node:assert/strict";
import fs from "node:fs";
import {
  sample,
  derivative,
  cumulativeIntegral,
  massKg,
  timeAxis,
  batKinematics,
} from "../biomechanics.js";
import { buildQuantities } from "../quantities.js";
import { buildPowerOverlay, powerValues } from "../energy_overlay.js";
import { alignedTime, primaryTime } from "../comparison.js";
import { keypointEvents } from "../chart_events.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const t = [0, 0.1, 0.21, 0.3, 0.4];
derivative(
  t,
  t.map((x) => x * x),
)
  .slice(1, -1)
  .forEach((v, i) => near(v, 2 * t[i + 1]));
assert.equal(
  sample(
    { time: [0, 0.1, 0.2, 0.8, 0.9, 1], values: [0, 1, 2, 8, 9, 10] },
    0.5,
  ),
  null,
);
assert.deepEqual(cumulativeIntegral([0, 1, 2, 3], [2, 2, 2, 2], 0.5), [
  null,
  1,
  3,
  5,
]);
assert.deepEqual(cumulativeIntegral([0, 1, 2, 3], [2, 2, null, 2], 0), [
  0,
  2,
  null,
  null,
]);
assert.deepEqual(
  cumulativeIntegral([0, 0.1, 0.2, 1, 1.1, 1.2], [2, 2, 2, 2, 2, 2], 0),
  [0, 0.2, 0.4, null, null, null],
);
near(
  massKg({
    entry: { discipline: "hitting" },
    metadata: { session_mass_lbs: 200 },
  }),
  90.718474,
);
fs.mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
const results = [];
const origin = process.env.OBM_TEST_URL || "http://127.0.0.1:8773";
const catalog = await (await fetch(origin + "/api/catalog")).json();
const targets = [];
for (const kind of ["pitching", "hitting"])
  for (const status of [
    "linked",
    "processed-only",
    "raw-only",
    "static-model",
  ]) {
    const rows = catalog.entries.filter(
      (e) => e.discipline === kind && e.status === status,
    );
    for (const side of ["R", "L", null]) {
      const e = rows.find((e) => (side === null ? true : e.side === side));
      if (e && !targets.includes(e)) targets.push(e);
    }
  }
for (const entry of targets) {
  const data = await (
    await fetch(origin + "/api/trial?id=" + encodeURIComponent(entry.id))
  ).json();
  assert.ok(!data.error, data.error);
  const quantities = buildQuantities(data);
  assert.equal(new Set(quantities.map((q) => q.id)).size, quantities.length);
  let published = 0;
  for (const [table, g] of Object.entries(data.signals)) {
    for (const key of Object.keys(g.series)) {
      if (key.endsWith("_time")) continue;
      published++;
      assert.ok(
        quantities.some((q) => q.id === `published:${table}:${key}`),
        key,
      );
    }
  }
  for (const q of quantities)
    for (const s of q.series) {
      assert.equal(s.time.length, s.values.length, q.id);
      assert.ok(
        s.values.every((v) => v === null || Number.isFinite(v)),
        q.id,
      );
    }
  const events = keypointEvents(data, true);
  assert.equal(
    events.length,
    Object.values(data.events).filter((e) => Number.isFinite(e.time)).length,
  );
  for (const mode of [
    "start",
    "event",
    "foot_contact",
    "foot_plant",
    "normalized",
  ])
    near(
      primaryTime(alignedTime(0.1, data, data, mode), data, data, mode),
      0.1,
    );
  const power = buildPowerOverlay(data);
  if (power) {
    for (const mode of Object.keys(power.available)) {
      const values = powerValues(power, mode, data.duration / 2);
      assert.ok(
        Object.values(values).every((v) => v === null || Number.isFinite(v)),
        mode,
      );
    }
  }
  if (entry.discipline === "pitching" && entry.has_processed) {
    assert.ok(power.available.angular);
    for (const [key, values] of Object.entries(power.series.angular)) {
      const i = values.findIndex(Number.isFinite);
      near(
        values[i],
        Math.hypot(
          ...["x", "y", "z"].map(
            (axis) => data.signals.joint_velos.series[key + "_velo_" + axis][i],
          ),
        ),
      );
    }
    const q = quantities.find((q) => q.id === "report_arm_positions");
    assert.equal(
      q.series[2].values,
      data.signals.joint_angles.series.shoulder_angle_y,
    );
    assert.ok(!q.source.includes("sign reversed"));
  }
  results.push({
    id: entry.id,
    quantities: quantities.length,
    publishedSignals: published,
    events: events.length,
    modes: Object.keys(power?.available || {}),
  });
}
fs.writeFileSync(
  new URL("./results/numerics.json", import.meta.url),
  JSON.stringify({ syntheticChecks: "passed", trials: results }, null, 2),
);
console.log(JSON.stringify(results, null, 2));
