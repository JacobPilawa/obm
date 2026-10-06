// Presentation-only fit: the released handle and sweet spot are never altered.
export function batPose(handle, sweetSpot, declaredLengthInches) {
  const valid = (p) =>
    Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  if (!valid(handle) || !valid(sweetSpot)) return null;
  const delta = sweetSpot.map((v, i) => v - handle[i]);
  const separation = Math.hypot(...delta);
  if (separation < 0.001) return null;
  const direction = delta.map((v) => v / separation);
  const sweetFraction = 0.82;
  const declared = declaredLengthInches * 0.0254;
  const length =
    Number.isFinite(declared) &&
    declared > separation / sweetFraction &&
    declared < separation * 3
      ? declared
      : separation / 0.62;
  const handleOffset = sweetFraction * length - separation;
  return {
    direction,
    length,
    handleOffset,
    sweetOffset: sweetFraction * length,
    knob: handle.map((v, i) => v - direction[i] * handleOffset),
  };
}
