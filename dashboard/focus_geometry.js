import { sample } from "./biomechanics.js";
// The shaded wedges locate a movement in the recorded pose. Published joint
// angles come from the model's segment frames and need not equal these wedges.
const valid = (p) =>
  Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a.reduce((out, v, i) => out + v * b[i], 0);
const norm = (a) => Math.hypot(...a);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a) => (norm(a) > 0.001 ? scale(a, 1 / norm(a)) : null);
const project = (a, axis) => {
  const u = unit(axis);
  return u ? sub(a, scale(u, dot(a, u))) : null;
};
const midpoint = (a, b) =>
  valid(a) && valid(b) ? scale(add(a, b), 0.5) : null;
// In the lab XY plane, the normal to the anatomical right-to-left shoulder
// (or hip) line is an approximate facing direction. Z is vertical in both labs.
const facing = (right, left) => {
  if (!valid(right) || !valid(left)) return null;
  const across = sub(right, left);
  return unit([-across[1], across[0], 0]);
};
function bend(a, joint, b, label, key, table = "joint_angles", sign = 1) {
  if (![a, joint, b].every(valid))
    return {
      center: joint,
      segments: [
        [joint, a],
        [joint, b],
      ],
      label,
      key,
      table,
      sign,
    };
  // A straight joint is 0°: extend the proximal bone through the joint.
  const ray = add(joint, sub(joint, a));
  return {
    center: joint,
    segments: [
      [joint, a],
      [joint, b],
    ],
    bend: [ray, joint, b],
    label,
    key,
    table,
    sign,
  };
}
function guide(
  center,
  reference,
  direction,
  label,
  key,
  table = "joint_angles",
  sign = 1,
) {
  if (!valid(center) || !reference || !direction)
    return { center, segments: [], label, key, table, sign };
  const a = unit(reference),
    b = unit(direction);
  if (!a || !b) return { center, segments: [], label, key, table, sign };
  const p = add(center, scale(a, 0.4)),
    q = add(center, scale(b, 0.4));
  return {
    center,
    segments: [
      [center, p],
      [center, q],
    ],
    bend: [p, center, q],
    label,
    key,
    table,
    sign,
  };
}
function axialGuide(
  center,
  reference,
  direction,
  label,
  key,
  table = "joint_angles",
  axis = [0, 0, 1],
) {
  const a = reference && unit(reference),
    b = direction && unit(direction);
  if (!valid(center) || !a || !b)
    return { center, segments: [], referenceSegments: [], label, key, table };
  const p = add(center, scale(a, 0.58)),
    q = add(center, scale(b, 0.58));
  return {
    center,
    segments: [],
    referenceSegments: [],
    bend: [p, center, q],
    axes: [a, b],
    sectorRadius: 0.43,
    rotationAxis: axis,
    label,
    key,
    table,
  };
}
const onPlane = (point, z) => (valid(point) ? [point[0], point[1], z] : null);
export function focusSpec(data, map, which, time) {
  const pitch = data.entry.discipline === "pitching",
    right = (data.entry.side || data.metadata?.hitter_side || "R") === "R",
    lead = right ? "l" : "r",
    rear = right ? "r" : "l";
  const torsoBase = map.thorax_dist,
    torsoTop = map.thorax_prox,
    shoulder = map.shoulder_jc,
    elbow = map.elbow_jc,
    wrist = map.wrist_jc;
  const trunk =
    valid(torsoTop) && valid(torsoBase) ? sub(torsoTop, torsoBase) : null;
  const rightShoulder = pitch
    ? right
      ? map.shoulder_jc
      : map.glove_shoulder_jc
    : map.rsjc;
  const leftShoulder = pitch
    ? right
      ? map.glove_shoulder_jc
      : map.shoulder_jc
    : map.lsjc;
  const rightHip = pitch
    ? right
      ? map.rear_hip
      : map.lead_hip
    : map.right_hip;
  const leftHip = pitch ? (right ? map.lead_hip : map.rear_hip) : map.left_hip;
  const chest = midpoint(rightShoulder, leftShoulder),
    hips = midpoint(rightHip, leftHip);
  const chestFacing = facing(rightShoulder, leftShoulder),
    hipFacing = facing(rightHip, leftHip);
  const trunkCenter = midpoint(torsoBase, torsoTop) || chest;
  const separationCenter = valid(torsoBase) ? torsoBase : trunkCenter;
  const pelvisCenter = hips || separationCenter;
  // Shoulder axial rotation is a twist about the humeral long axis. The
  // forearm is a lever showing that twist; the wedge is translated to the elbow
  // (on the same rotation axis), not an elbow-flexion measurement.
  const shoulderGuide = (label, key, table = "joint_angles", sign = 1) => {
    const s = pitch ? shoulder : map[`${lead}sjc`],
      e = pitch ? elbow : map[`${lead}ejc`],
      w = pitch ? wrist : map[`${lead}wjc`];
    const side = pitch ? (right ? 1 : -1) : lead === "r" ? 1 : -1;
    const upper = valid(e) && valid(s) ? unit(sub(e, s)) : null;
    const foreVector = upper && valid(w) ? sub(w, e) : null;
    const projectedFore = foreVector ? project(foreVector, upper) : null;
    const fore =
      projectedFore && norm(projectedFore) > norm(foreVector) * 0.15
        ? unit(projectedFore)
        : null;
    const up = upper && trunk ? unit(project(trunk, upper)) : null;
    // Zero points anteriorly in the plane perpendicular to the humerus;
    // trunk-up was the old (incorrect, roughly 90-degree-offset) reference.
    const zero = up && upper ? unit(scale(cross(up, upper), side)) : null;
    const result = guide(e, zero, fore, label, key, table, sign);
    if (!result.bend) return { ...result, center: s };
    result.center = s;
    result.sectorRadius = 0.24;
    result.rotationAxis = scale(upper, side);
    result.referenceSegments = [result.segments[0]];
    result.segments = [[s, e], result.segments[1]];
    result.poseGuide = "signed humeral-axis pose guide";
    const angleKey = pitch ? "shoulder_angle_z" : "lead_shoulder_angle_z";
    const angles = data.signals?.joint_angles;
    result.branchDegrees = angles?.series?.[angleKey]
      ? sample({ time: angles.time, values: angles.series[angleKey] }, time)
      : null;
    return result;
  };
  if (which === "torso" || which === "torsoSpeed") {
    const result = axialGuide(
      trunkCenter,
      pitch ? [0, right ? -1 : 1, 0] : [1, 0, 0],
      chestFacing,
      which === "torsoSpeed" ? "Torso rotation speed" : "Torso axial rotation",
      pitch
        ? which === "torsoSpeed"
          ? "torso_velo_z"
          : "torso_angle_z"
        : which === "torsoSpeed"
          ? "torso_angular_velocity_z"
          : "torso_angle_z",
      which === "torsoSpeed" ? "joint_velos" : "joint_angles",
      [0, 0, right ? 1 : -1],
    );
    result.segments = [
      [
        onPlane(leftShoulder, trunkCenter?.[2]),
        onPlane(rightShoulder, trunkCenter?.[2]),
      ],
    ];
    result.poseGuide = "signed overhead shoulder-facing guide";
    return result;
  }
  if (which === "torsoPelvis") {
    const result = axialGuide(
      separationCenter,
      hipFacing,
      chestFacing,
      "Torso–pelvis separation",
      "torso_pelvis_angle_z",
      "joint_angles",
      [0, 0, (right ? -1 : 1) * (pitch ? 1 : -1)],
    );
    result.referenceSegments = [
      [
        onPlane(leftHip, separationCenter?.[2]),
        onPlane(rightHip, separationCenter?.[2]),
      ],
    ];
    result.segments = [
      [
        onPlane(leftShoulder, separationCenter?.[2]),
        onPlane(rightShoulder, separationCenter?.[2]),
      ],
    ];
    result.poseGuide = "signed overhead shoulder–hip guide";
    return result;
  }
  if (which === "pelvis" || which === "pelvisSpeed") {
    const result = axialGuide(
      pelvisCenter,
      pitch ? [0, right ? -1 : 1, 0] : [1, 0, 0],
      hipFacing,
      which === "pelvisSpeed" ? "Pelvis rotation speed" : "Pelvis rotation",
      pitch
        ? which === "pelvisSpeed"
          ? "pelvis_velo_z"
          : "pelvis_angle_z"
        : which === "pelvisSpeed"
          ? "pelvis_angular_velocity_z"
          : "pelvis_angle_z",
      which === "pelvisSpeed" ? "joint_velos" : "joint_angles",
      [0, 0, right ? 1 : -1],
    );
    result.referenceSegments = [
      [
        onPlane(leftHip, pelvisCenter?.[2]),
        onPlane(rightHip, pelvisCenter?.[2]),
      ],
    ];
    result.poseGuide = "signed overhead hip-facing guide";
    return result;
  }
  if (which === "shoulder")
    return shoulderGuide(
      pitch ? "Shoulder external rotation" : "Lead shoulder axial rotation",
      pitch ? "shoulder_angle_z" : "lead_shoulder_angle_z",
    );
  if (which === "shoulderAbduction")
    return guide(
      shoulder,
      trunk ? scale(trunk, -1) : null,
      valid(elbow) && valid(shoulder) ? sub(elbow, shoulder) : null,
      "Shoulder abduction",
      "shoulder_angle_y",
      "joint_angles",
      1,
    );
  if (which === "shoulderHorizontal") {
    // Horizontal abduction is in the torso transverse plane, which tilts
    // with the trunk; the laboratory floor is not that anatomical plane.
    const across =
      valid(shoulder) && valid(map.glove_shoulder_jc)
        ? sub(shoulder, map.glove_shoulder_jc)
        : null;
    const arm = valid(elbow) && valid(shoulder) ? sub(elbow, shoulder) : null;
    const vertical = trunk && unit(trunk),
      reference = vertical && across ? project(across, vertical) : null,
      upper = vertical && arm ? project(arm, vertical) : null;
    return {
      ...guide(
        shoulder,
        reference,
        upper,
        "Scap load (horizontal abduction)",
        "shoulder_angle_x",
      ),
      rotationAxis: vertical && scale(vertical, right ? -1 : 1),
      poseGuide: "signed torso-plane joint-center guide",
    };
  }
  // Three centers cannot distinguish wrist extension from radial/ulnar deviation
  // or recover hand/forearm axial frames. Locate the wrist without a false wedge.
  if (which === "wrist")
    return {
      center: wrist,
      segments: [
        [elbow, wrist],
        [wrist, map.hand_jc],
      ],
      label: "Wrist extension",
      key: "wrist_angle_x",
      table: "joint_angles",
    };
  if (which === "armInternalSpeed")
    return shoulderGuide(
      "Arm internal rotation speed",
      "shoulder_velo_z",
      "joint_velos",
      -1,
    );
  if (which === "elbow" || which === "elbowExtensionSpeed")
    return pitch
      ? bend(
          shoulder,
          elbow,
          wrist,
          which === "elbow"
            ? "Throwing elbow flexion"
            : "Elbow extension speed",
          which === "elbow" ? "elbow_angle_x" : "elbow_velo_x",
          which === "elbow" ? "joint_angles" : "joint_velos",
          which === "elbow" ? 1 : -1,
        )
      : bend(
          map[`${lead}sjc`],
          map[`${lead}ejc`],
          map[`${lead}wjc`],
          "Lead elbow flexion",
          "lead_elbow_angle_x",
        );
  if (which === "leadKnee" || which === "leadKneeExtensionSpeed")
    return pitch
      ? bend(
          map.lead_hip,
          map.lead_knee_jc,
          map.lead_ankle_jc,
          which === "leadKnee"
            ? "Lead knee flexion"
            : "Lead knee extension speed",
          which === "leadKnee" ? "lead_knee_angle_x" : "lead_knee_velo_x",
          which === "leadKnee" ? "joint_angles" : "joint_velos",
          which === "leadKnee" ? 1 : -1,
        )
      : bend(
          map[lead === "l" ? "left_hip" : "right_hip"],
          map[`${lead}kjc`],
          map[`${lead}ajc`],
          "Lead knee flexion",
          "lead_knee_angle_x",
        );
  if (which === "rearKnee")
    return pitch
      ? bend(
          map.rear_hip,
          map.rear_knee_jc,
          map.rear_ankle_jc,
          "Rear knee flexion",
          "rear_knee_angle_x",
        )
      : bend(
          map[rear === "l" ? "left_hip" : "right_hip"],
          map[`${rear}kjc`],
          map[`${rear}ajc`],
          "Rear knee flexion",
          "rear_knee_angle_x",
        );
  if (which === "trunkForward" || which === "trunkLateral") {
    const across =
      valid(rightShoulder) && valid(leftShoulder)
        ? sub(rightShoulder, leftShoulder)
        : null;
    const lateral = across && unit([across[0], across[1], 0]);
    const basis = which === "trunkForward" ? chestFacing : lateral;
    const direction =
      trunk && basis
        ? add(scale(basis, dot(trunk, basis)), [0, 0, trunk[2]])
        : null;
    const sign =
      which === "trunkForward"
        ? pitch
          ? 1
          : -1
        : (right ? 1 : -1) * (pitch ? -1 : 1);
    return {
      ...guide(
        torsoBase,
        [0, 0, 1],
        direction,
        which === "trunkForward" ? "Forward trunk tilt" : "Lateral trunk tilt",
        which === "trunkForward" ? "torso_angle_x" : "torso_angle_y",
      ),
      rotationAxis: basis && scale(cross([0, 0, 1], basis), sign),
      poseGuide: "signed body-oriented trunk guide",
    };
  }
  return null;
}

// Shared by solo, overlay, split panes and movie rendering. Signed angles keep
// their direction; half-turns remain drawable and >180-degree shoulder rotations
// use the CSV only to choose the continuous branch, not to change the pose angle.
export function focusSectorGeometry(focus) {
  if (!focus?.bend?.every(valid)) return null;
  const [p, center, q] = focus.bend,
    a0 = sub(p, center),
    b0 = sub(q, center),
    a = unit(a0),
    b = unit(b0);
  if (!a || !b) return null;
  let axis = focus.rotationAxis && unit(focus.rotationAxis),
    angle;
  if (axis) {
    angle = Math.atan2(
      dot(axis, cross(a, b)),
      Math.max(-1, Math.min(1, dot(a, b))),
    );
    if (Number.isFinite(focus.branchDegrees))
      angle +=
        2 *
        Math.PI *
        Math.round(
          ((focus.branchDegrees * Math.PI) / 180 - angle) / (2 * Math.PI),
        );
  } else {
    angle = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
    axis = unit(cross(a, b));
    if (!axis && angle > 3)
      axis = unit(cross(a, Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]));
  }
  if (!axis || Math.abs(angle) < 0.002) return null;
  const radius =
    focus.sectorRadius ||
    Math.min(0.22, Math.max(0.09, Math.min(norm(a0), norm(b0)) * 0.4));
  const steps = Math.max(10, Math.ceil(Math.abs(angle) * 25)),
    arc = [];
  for (let i = 0; i <= steps; i++) {
    const t = (angle * i) / steps,
      c = Math.cos(t),
      s = Math.sin(t);
    const rotated = add(
      add(scale(a, c), scale(cross(axis, a), s)),
      scale(axis, dot(axis, a) * (1 - c)),
    );
    arc.push(add(center, scale(rotated, radius)));
  }
  const vertices = [];
  for (let i = 0; i < steps; i++)
    vertices.push(...center, ...arc[i], ...arc[i + 1]);
  return { arc, vertices, degrees: (angle * 180) / Math.PI };
}
