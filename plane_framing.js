import { batPose } from "./bat_pose.js";

// Scan coordinates already loaded for this replay once; no frame/recording cache.
export function motionBounds(records) {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  const add = (p, shift) => {
    if (!p?.every(Number.isFinite) || p.length !== 3) return;
    for (let axis = 0; axis < 3; axis++) {
      const value = p[axis] + shift[axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  };
  for (const { data, names, shift = [0, 0, 0], range } of records) {
    const lm = data.signals?.landmarks;
    const batNames = lm ? ["blast_hand", "sweet_spot"] : ["Marker1", "Marker3"];
    const includeBat = data.entry.discipline === "hitting";
    const addPose = (get) => {
      for (const name of names) add(get(name), shift);
      // Allow for the display skull above the processed neck landmark.
      const neck = get("thorax_prox");
      if (neck?.every(Number.isFinite))
        add([neck[0], neck[1], neck[2] + 0.28], shift);
      if (includeBat) {
        const bat = batPose(
          get(batNames[0]),
          get(batNames[1]),
          data.metadata?.bat_length_in,
        );
        if (bat) {
          add(bat.knob, shift);
          add(
            bat.knob.map((v, axis) => v + bat.direction[axis] * bat.length),
            shift,
          );
        }
      }
    };
    if (lm) {
      for (let i = 0; i < lm.time.length; i++) {
        if (range && (lm.time[i] < range.start || lm.time[i] > range.end))
          continue;
        addPose((name) =>
          ["x", "y", "z"].map((axis) => lm.series[name + "_" + axis]?.[i]),
        );
      }
    }
    const motion = data.motion;
    if (motion?.frames) {
      // Head/feet extend past processed joint centers. Exclude unrelated raw markers.
      const rawNames = lm
        ? ["LFHD", "RFHD", "LBHD", "RBHD", "LTOE", "RTOE", "LHEE", "RHEE"]
        : names;
      const indices = rawNames
        .map((name) => motion.labels.indexOf(name))
        .filter((i) => i >= 0);
      const batIndices = batNames.map((name) => motion.labels.indexOf(name));
      for (let i = 0; i < motion.frames.length; i++) {
        const t = i / motion.rate;
        if (range && (t < range.start || t > range.end)) continue;
        const frame = motion.frames[i];
        for (const index of indices) add(frame[index], shift);
        if (!lm && includeBat) {
          const bat = batPose(
            frame[batIndices[0]],
            frame[batIndices[1]],
            data.metadata?.bat_length_in,
          );
          if (bat) {
            add(bat.knob, shift);
            add(
              bat.knob.map((v, axis) => v + bat.direction[axis] * bat.length),
              shift,
            );
          }
        }
      }
    }
  }
  if (!min.every(Number.isFinite))
    return { min: [-0.5, -0.5, 0], max: [0.5, 0.5, 2] };
  // Small physical allowance for bone/skin thickness around landmark centers.
  return { min: min.map((v) => v - 0.06), max: max.map((v) => v + 0.06) };
}
export function planeFrame(bounds, plane, aspect = 1) {
  const [horizontal, vertical] = { xy: [0, 1], yz: [1, 2], xz: [0, 2] }[plane];
  return {
    target: bounds.min.map((v, i) => (v + bounds.max[i]) / 2),
    halfHeight:
      Math.max(
        0.1,
        (bounds.max[vertical] - bounds.min[vertical]) / 2,
        (bounds.max[horizontal] - bounds.min[horizontal]) / (2 * aspect),
      ) * 1.06,
  };
}
