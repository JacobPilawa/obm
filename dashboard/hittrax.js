// HitTrax launch angles are trial-level outcomes, not a measured ball trajectory.
export function hitTraxLaunch(hittrax) {
  const elevation = hittrax?.la,
    bearing = hittrax?.bearing;
  if (!Number.isFinite(elevation) || !Number.isFinite(bearing)) return null;
  const e = (elevation * Math.PI) / 180,
    b = (bearing * Math.PI) / 180;
  // +X faces the mound; +Y faces the right-handed box. Positive HitTrax
  // bearing is left-handed pull (right field), opposite the lab's +Y.
  return [Math.cos(e) * Math.cos(b), -Math.cos(e) * Math.sin(b), Math.sin(e)];
}
