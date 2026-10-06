import { batPose } from "./bat_pose.js";
const valid = (p) =>
  Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a) => {
  const n = Math.hypot(...a);
  return n > 1e-7 ? mul(a, 1 / n) : null;
};
// Artistic finger pose. Only its wrist, hand position and bat axis come from data.
export function gripPose(wrist, hand, handle, sweetSpot, batLength, isLeft) {
  if (!valid(wrist) || !valid(hand)) return null;
  const bat = batPose(handle, sweetSpot, batLength);
  if (!bat) return null;
  const axis = bat.direction;
  const center = add(handle, mul(axis, dot(sub(hand, handle), axis)));
  const towardWrist = sub(wrist, center);
  const radial = unit(sub(towardWrist, mul(axis, dot(towardWrist, axis)))) ||
    unit(cross(axis, [0, 0, 1])) || [1, 0, 0];
  const tangent = mul(cross(axis, radial), isLeft ? 1 : -1);
  const palmward = unit(sub(center, wrist)) || mul(radial, -1);
  const span = Math.max(
    0.045,
    Math.min(0.068, Math.hypot(...sub(hand, wrist)) * 0.8),
  );
  const batRadius = bat.length * 0.0175;
  const fingerRadius = batRadius + 0.009;
  const onRing = (along, angle, r = fingerRadius) =>
    add(
      add(center, mul(axis, along)),
      add(mul(radial, r * Math.cos(angle)), mul(tangent, r * Math.sin(angle))),
    );
  const bones = [];
  const fingers = ["index", "middle", "ring", "little"];
  for (let i = 0; i < 4; i++) {
    const along = span * (0.5 - i / 3);
    const base = add(add(wrist, mul(palmward, 0.014)), mul(axis, along * 0.45));
    const points = [0, 1.1, 2.2, 3.25].map((angle) =>
      onRing(along, angle, fingerRadius - i * 0.0004),
    );
    bones.push({
      name: fingers[i] + "-metacarpal",
      a: base,
      b: points[0],
      width: 0.0065,
    });
    for (let j = 0; j < 3; j++)
      bones.push({
        name: fingers[i] + "-" + j,
        a: points[j],
        b: points[j + 1],
        width: 0.0055 - j * 0.0006,
      });
  }
  const along = span * 0.65;
  const thumb = [-0.35, -1.55, -2.75].map((angle, i) =>
    onRing(along - i * 0.008, angle, fingerRadius + 0.002),
  );
  bones.push({
    name: "thumb-metacarpal",
    a: add(wrist, mul(axis, span * 0.25)),
    b: thumb[0],
    width: 0.007,
  });
  for (let i = 0; i < 2; i++)
    bones.push({
      name: "thumb-" + i,
      a: thumb[i],
      b: thumb[i + 1],
      width: 0.006 - i * 0.001,
    });
  const carpals = Array.from({ length: 8 }, (_, i) =>
    add(
      add(wrist, mul(palmward, 0.004 + (i >> 2) * 0.008)),
      mul(axis, ((i % 4) - 1.5) * 0.009),
    ),
  );
  return { wrist: wrist.slice(), center, batRadius, bones, carpals };
}
