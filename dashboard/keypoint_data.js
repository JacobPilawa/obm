import { motionAnalysis, leadForceLabX } from "./motion_analysis.js";
import { derivative } from "./biomechanics.js";

// Anatomical hotspots are display anchors. The numeric traces retain their
// released definitions and are never recomputed from the drawn stick figure.
const finite = Number.isFinite;
const group = (id, label, anchor, categories) => ({
  id,
  label,
  anchor,
  categories,
  metrics: [],
});
const add = (group, metric) => {
  if (metric) group.metrics.push(metric);
};
const source = (
  trial,
  table,
  key,
  label,
  unit,
  definition,
  focus = "",
  family = "Published model output",
) => {
  const data = trial.signals?.[table],
    values = data?.series?.[key];
  return values
    ? {
        id: `${table}:${key}`,
        label,
        unit,
        definition,
        focus,
        family,
        source: `${table}.csv · ${key}`,
        time: data.time,
        values,
      }
    : null;
};
const magnitude = (trial, table, stem, label, unit, definition, sourceName) => {
  const data = trial.signals?.[table],
    parts = ["x", "y", "z"].map((axis) => data?.series?.[`${stem}_${axis}`]);
  if (parts.some((part) => !part)) return null;
  return {
    id: `magnitude:${table}:${stem}`,
    label,
    unit,
    definition,
    focus: "",
    family: "Calculated here",
    source: `${sourceName || table + ".csv"} · √(X² + Y² + Z²)`,
    time: data.time,
    values: parts[0].map((_, i) =>
      parts.every((part) => finite(part[i]))
        ? Math.hypot(...parts.map((part) => part[i]))
        : null,
    ),
  };
};
function addPosition(group, trial, point) {
  for (const [axis, label] of [
    ["x", "X"],
    ["y", "Y"],
    ["z", "Z"],
  ])
    add(
      group,
      source(
        trial,
        "landmarks",
        `${point}_${axis}`,
        `${label} position`,
        "m",
        `Released ${point} joint-center or landmark ${label} position in the lab coordinate system. This is a reconstructed point, not a raw skin marker.`,
        "",
        "Published landmarks",
      ),
    );
}
function addFoot(group, trial, foot) {
  const total = magnitude(
    trial,
    "force_plate",
    `${foot}_force`,
    "Ground reaction force magnitude",
    "N",
    `Vector magnitude of the released processed ${foot}-foot ground reaction force. The hotspot is placed near the ankle for display; it does not measure force in the ankle joint.`,
    "force_plate.csv",
  );
  if (total) total.mapMode = "grf";
  add(group, total);
  for (const [axis, label] of [
    ["z", "Vertical"],
    ["x", "X"],
    ["y", "Y"],
  ]) {
    const component = source(
      trial,
      "force_plate",
      `${foot}_force_${axis}`,
      `${label} ground reaction force`,
      "N",
      `Released processed ${foot}-foot ground reaction force ${axis.toUpperCase()} component. The display anchor is near the ankle; the force is associated with the foot and force plates.`,
      "",
      "Published processed force",
    );
    if (component && axis === "z") component.mapMode = "grfVertical";
    add(group, component);
  }
}
function addEnergy(group, trial, joint) {
  const generated = source(
    trial,
    "energy_flow",
    `${joint}_energy_generated`,
    "Joint generation / absorption",
    "W",
    `Published signed joint-power term at the ${joint.replaceAll("_", " ")}. Positive indicates generation; negative indicates absorption. Watts are inferred from agreement with released joule totals. This does not identify muscle metabolic energy or a direction of transfer along the limb.`,
    "",
    "Published model power",
  );
  if (generated) generated.mapMode = "generated";
  add(group, generated);
  const transferred = source(
    trial,
    "energy_flow",
    `${joint}_energy_transfer_jfp`,
    "Joint-force transfer power",
    "W",
    `Published joint-force transfer-power term. Its sign is retained from the release; the documentation does not establish an anatomical flow direction from this sign alone.`,
    "",
    "Published model power",
  );
  if (transferred) transferred.mapMode = "jfp";
  add(group, transferred);
}
function rawMarkerGroup(trial, name, index) {
  const motion = trial.motion,
    g = group(`raw:${index}`, name, name, ["raw"]);
  const times = motion.frames.map((_, i) => i / motion.rate),
    coords = [0, 1, 2].map((axis) =>
      motion.frames.map((frame) =>
        finite(frame[index]?.[axis]) ? frame[index][axis] : null,
      ),
    );
  for (let axis = 0; axis < 3; axis++)
    add(g, {
      id: `raw:${index}:${axis}`,
      label: `${"XYZ"[axis]} position`,
      unit: "m",
      definition: `Measured C3D marker ${name} position on lab axis ${"XYZ"[axis]}. A skin marker is not the underlying joint center.`,
      focus: "",
      family: "Raw C3D marker",
      source: `C3D · ${name} · ${"XYZ"[axis]}`,
      time: times,
      values: coords[axis],
    });
  const velocities = coords.map((values) => derivative(times, values));
  add(g, {
    id: `raw:${index}:speed`,
    label: "Marker speed",
    unit: "m/s",
    definition: `Dashboard magnitude of the three-point derivative of marker ${name} XYZ. This is marker motion; skin movement and numerical differentiation can affect it. Endpoints and gaps remain missing.`,
    focus: "",
    family: "Calculated here",
    source: `C3D ${name} XYZ · √(vx² + vy² + vz²)`,
    time: times,
    values: times.map((_, i) =>
      velocities.every((part) => finite(part[i]))
        ? Math.hypot(...velocities.map((part) => part[i]))
        : null,
    ),
  });
  const accelerations = velocities.map((values) => derivative(times, values));
  add(g, {
    id: `raw:${index}:acceleration`,
    label: "Marker acceleration · diagnostic",
    unit: "m/s²",
    definition: `Dashboard magnitude of the second derivative of raw marker ${name} XYZ. Differentiation strongly amplifies marker noise and skin motion; use this as an exploratory diagnostic, not a published joint acceleration. Endpoints and gaps remain missing.`,
    focus: "",
    family: "Calculated here",
    source: `C3D ${name} XYZ · √(ax² + ay² + az²)`,
    time: times,
    values: times.map((_, i) =>
      accelerations.every((part) => finite(part[i]))
        ? Math.hypot(...accelerations.map((part) => part[i]))
        : null,
    ),
  });
  return g;
}
function plateGroup(trial, platform) {
  const samples = platform.force_global,
    rate = trial.motion?.analog?.rate,
    corners = platform.corners;
  if (!rate || !samples?.length || !corners?.length) return null;
  const center = [0, 1, 2].map(
    (axis) =>
      corners.reduce((sum, corner) => sum + corner[axis], 0) / corners.length,
  );
  const g = group(
    `plate:${platform.number}`,
    `Force plate ${platform.number}`,
    null,
    ["kinetics"],
  );
  g.fixedPoint = center;
  const times = samples.map((_, i) => i / rate),
    base = `C3D platform ${platform.number} · reconstructed lab XYZ`;
  const description =
    "Individual C3D force plate measurement reconstructed in laboratory coordinates. The green 3D arrow uses this vector; its origin is the plate center for display, not a measured center of pressure. This is distinct from the processed rear/lead ground reaction force in force_plate.csv.";
  add(g, {
    id: `plate:${platform.number}:magnitude`,
    label: "Force plate vector magnitude",
    unit: "N",
    definition: description,
    focus: "",
    family: "C3D force plate",
    source: `${base} · √(X² + Y² + Z²)`,
    time: times,
    values: samples.map((row) =>
      row?.every(finite) ? Math.hypot(...row) : null,
    ),
    visualAction: "plateArrows",
  });
  for (let axis = 0; axis < 3; axis++)
    add(g, {
      id: `plate:${platform.number}:${axis}`,
      label: `Force plate ${"XYZ"[axis]} component`,
      unit: "N",
      definition: description,
      focus: "",
      family: "C3D force plate",
      source: `${base} · ${"XYZ"[axis]}`,
      time: times,
      values: samples.map((row) => (finite(row?.[axis]) ? row[axis] : null)),
    });
  return g;
}
const groupCache = new WeakMap();
export function buildKeypointGroups(trial, bat) {
  if (!trial) return [];
  let variants = groupCache.get(trial);
  if (!variants) groupCache.set(trial, (variants = new Map()));
  const key = bat || null;
  if (!variants.has(key)) variants.set(key, computeKeypointGroups(trial, bat));
  return variants.get(key);
}
function computeKeypointGroups(trial, bat) {
  if (!trial) return [];
  const pitch = trial.entry.discipline === "pitching",
    side = trial.entry.side || trial.metadata?.hitter_side || "R",
    lead = side === "L" ? "r" : "l",
    rear = side === "L" ? "l" : "r";
  const groups = [];
  const make = (id, label, anchor, categories) => {
    const g = group(id, label, anchor, categories);
    groups.push(g);
    return g;
  };
  const analysis = motionAnalysis(trial),
    lm = trial.signals?.landmarks;
  if (analysis.available.com) {
    const com = make("com", "Center of mass", "centerofmass", [
      "core",
      "joints",
    ]);
    addPosition(com, trial, "centerofmass");
    for (const metric of com.metrics) metric.visualAction = "com";
    const vx = derivative(lm.time, lm.series.centerofmass_x);
    add(com, {
      id: "com:velocityX",
      label: "COM lab-X velocity",
      unit: "m/s",
      definition:
        "Native three-point derivative of released whole-body centerofmass X. Positive toward home plate for pitching, toward the pitcher for hitting. Not estimated from the displayed skeleton.",
      family: "Calculated here",
      source: "landmarks.csv · centerofmass_x derivative",
      time: lm.time,
      values: vx,
      visualAction: "com",
    });
    com.metrics.unshift(com.metrics.pop());
  }
  const torso = make("torso", "Trunk", "torso_center", ["core", "joints"]);
  add(
    torso,
    source(
      trial,
      "joint_angles",
      "torso_angle_x",
      "Forward trunk tilt",
      "°",
      `Published trunk angle X component: ${pitch ? "flexion positive, extension negative" : "extension positive, flexion negative"}. The orange 3D guide compares the displayed trunk line with vertical in a body-oriented plane; that geometric guide need not equal the model angle.`,
      "trunkForward",
    ),
  );
  add(
    torso,
    source(
      trial,
      "joint_angles",
      "torso_angle_y",
      "Lateral trunk tilt",
      "°",
      `Published lateral trunk tilt component: positive toward the ${pitch ? "glove side" : "rear leg"}. The 3D guide projects the trunk into a body-oriented plane and may differ from the model-based anatomical angle.`,
      "trunkLateral",
    ),
  );
  add(
    torso,
    source(
      trial,
      "joint_angles",
      "torso_angle_z",
      "Torso axial rotation",
      "°",
      `Published modeled axial rotation ${pitch ? "toward home plate" : "toward the mound"} (positive) or away (negative). The horizontal guide at the trunk has a blue zero-reference arrow and an amber chest-facing arrow derived from the shoulder line. The signed wedge uses joint-center geometry and may differ from the calibrated model angle.`,
      "torso",
    ),
  );
  add(
    torso,
    source(
      trial,
      "joint_velos",
      pitch ? "torso_velo_z" : "torso_angular_velocity_z",
      "Torso axial rotation velocity",
      "°/s",
      "Published signed axial rotation velocity of the modeled torso. The hotspot marks the torso, not a velocity vector in lab space.",
    ),
  );
  addPosition(torso, trial, "thorax_prox");
  if (analysis.available.axis)
    add(torso, {
      id: "trunk:axisTilt",
      label: "Geometric trunk-axis tilt",
      unit: "°",
      definition:
        "Angle from vertical of the hip-midpoint to shoulder-midpoint line. A geometric orientation proxy, not the spinal curvature, instantaneous rotation axis, angular momentum, or a validated stability score. Short ghosts span 240 ms.",
      family: "Calculated here",
      source: "landmarks.csv · hip and shoulder midpoint geometry",
      time: lm.time,
      values: lm.time.map((t) => analysis.at(t).axis?.tilt ?? null),
      visualAction: "axis",
    });

  const pelvis = make("pelvis", "Pelvis", "pelvis_center", ["core", "joints"]);
  add(
    pelvis,
    source(
      trial,
      "joint_angles",
      "pelvis_angle_z",
      "Pelvis axial rotation",
      "°",
      "Published pelvis axial rotation. The overhead 3D wedge compares the hip-derived facing direction with the discipline-specific zero reference; it is a signed joint-center pose guide and may differ from the calibrated model angle.",
      "pelvis",
    ),
  );
  add(
    pelvis,
    source(
      trial,
      "joint_velos",
      pitch ? "pelvis_velo_z" : "pelvis_angular_velocity_z",
      "Pelvis axial rotation velocity",
      "°/s",
      "Published signed pelvis axial rotation velocity.",
    ),
  );
  add(
    pelvis,
    source(
      trial,
      "joint_angles",
      "torso_pelvis_angle_z",
      "Torso–pelvis separation",
      "°",
      "Published relative Z rotation between the torso and pelvis segment frames. The horizontal guide near the lower trunk has an amber shoulder-derived facing arrow and a blue hip-derived facing arrow. The wedge preserves direction; its joint-center geometry may differ from the calibrated model angle.",
      "torsoPelvis",
    ),
  );

  if (pitch) {
    const shoulder = make("shoulder", "Throwing shoulder", "shoulder_jc", [
      "core",
      "joints",
      "kinetics",
    ]);
    add(
      shoulder,
      source(
        trial,
        "joint_angles",
        "shoulder_angle_z",
        "Shoulder external rotation",
        "°",
        "Published shoulder external (+) / internal (−) rotation of the humerus relative to the thorax. The 3D guide rotates in a plane perpendicular to the shoulder-to-elbow axis. Its blue zero ray is perpendicular to the projected trunk-up direction; its orange ray follows the projected forearm. The wedge is placed at the elbow on that same axis so the forearm can show the twist; it is not elbow flexion. Joint-center geometry approximates the calibrated segment model, so the wedge and published angle can differ. Near a straight elbow, the forearm cannot reliably show axial rotation and the wedge is hidden.",
        "shoulder",
      ),
    );
    add(
      shoulder,
      source(
        trial,
        "joint_angles",
        "shoulder_angle_x",
        "Scap load · horizontal abduction",
        "°",
        "Published shoulder horizontal-abduction angle, used here as a scap-load proxy. The signed wedge lies in the torso transverse plane and uses projected joint centers and need not equal the model angle. It does not measure scapular-blade retraction.",
        "shoulderHorizontal",
      ),
    );
    add(
      shoulder,
      source(
        trial,
        "joint_velos",
        "shoulder_velo_z",
        "Shoulder axial rotation velocity",
        "°/s",
        "Published signed shoulder axial angular velocity.",
      ),
    );
    add(
      shoulder,
      source(
        trial,
        "forces_moments",
        "shoulder_upper_arm_moment_z",
        "Shoulder internal-rotation moment",
        "N·m",
        "Published internal joint moment about the upper-arm local Z axis. This is a modeled moment, not a force arrow or direct tissue load.",
      ),
    );
    addEnergy(shoulder, trial, "shoulder");
    addPosition(shoulder, trial, "shoulder_jc");
    const elbow = make("elbow", "Throwing elbow", "elbow_jc", [
      "core",
      "joints",
      "kinetics",
    ]);
    add(
      elbow,
      source(
        trial,
        "joint_angles",
        "elbow_angle_x",
        "Elbow flexion",
        "°",
        "Published anatomical elbow flexion. The orange wedge shows the bend between reconstructed upper-arm and forearm joint centers; it can differ from the model angle.",
        "elbow",
      ),
    );
    add(
      elbow,
      source(
        trial,
        "joint_velos",
        "elbow_velo_x",
        "Elbow flexion velocity",
        "°/s",
        "Published signed elbow flexion/extension angular velocity.",
      ),
    );
    const varus = source(
      trial,
      "forces_moments",
      "elbow_moment_y",
      "Elbow varus moment",
      "N·m",
      "Published internal elbow varus (+) / valgus (−) moment, modeled about local Y. This is not direct UCL force or injury risk.",
    );
    if (varus) varus.visualAction = "armSweep";
    add(elbow, varus);
    addEnergy(elbow, trial, "elbow");
    addPosition(elbow, trial, "elbow_jc");
    const gloveShoulder = make(
      "gloveShoulder",
      "Glove shoulder",
      "glove_shoulder_jc",
      ["joints"],
    );
    add(
      gloveShoulder,
      source(
        trial,
        "joint_angles",
        "glove_shoulder_angle_z",
        "Glove shoulder axial rotation",
        "°",
        "Published modeled glove-shoulder axial rotation component. The hotspot locates the reconstructed joint center.",
      ),
    );
    add(
      gloveShoulder,
      source(
        trial,
        "joint_velos",
        "glove_shoulder_velo_z",
        "Glove shoulder axial velocity",
        "°/s",
        "Published signed glove-shoulder axial angular velocity.",
      ),
    );
    addPosition(gloveShoulder, trial, "glove_shoulder_jc");
    const gloveElbow = make("gloveElbow", "Glove elbow", "glove_elbow_jc", [
      "joints",
    ]);
    add(
      gloveElbow,
      source(
        trial,
        "joint_angles",
        "glove_elbow_angle_x",
        "Glove elbow flexion",
        "°",
        "Published modeled glove-elbow flexion component.",
      ),
    );
    addPosition(gloveElbow, trial, "glove_elbow_jc");
  } else {
    const shoulder = make("shoulder", "Lead shoulder", `${lead}sjc`, [
      "core",
      "joints",
    ]);
    add(
      shoulder,
      source(
        trial,
        "joint_angles",
        "lead_shoulder_angle_z",
        "Lead shoulder axial rotation",
        "°",
        "Published lead-shoulder external (+) / internal (−) rotation. The signed 3D guide uses the upper arm as the rotation axis and the projected forearm as a lever; it is placed at the elbow on that axis. Its zero reference comes from trunk-up and the upper arm, so it approximates the calibrated shoulder model rather than reproducing its segment frames.",
        "shoulder",
      ),
    );
    add(
      shoulder,
      source(
        trial,
        "joint_velos",
        "lead_shoulder_angular_velocity_z",
        "Lead shoulder axial velocity",
        "°/s",
        "Published signed lead-shoulder axial angular velocity.",
      ),
    );
    addPosition(shoulder, trial, `${lead}sjc`);
    const elbow = make("elbow", "Lead elbow", `${lead}ejc`, ["joints"]);
    add(
      elbow,
      source(
        trial,
        "joint_angles",
        "lead_elbow_angle_x",
        "Lead elbow flexion",
        "°",
        "Published modeled lead-elbow flexion. The orange wedge uses reconstructed joint centers and is a geometric guide.",
        "elbow",
      ),
    );
    add(
      elbow,
      source(
        trial,
        "joint_velos",
        "lead_elbow_angular_velocity_x",
        "Lead elbow flexion velocity",
        "°/s",
        "Published signed lead-elbow flexion/extension angular velocity.",
      ),
    );
    addPosition(elbow, trial, `${lead}ejc`);
    const rearShoulder = make("rearShoulder", "Rear shoulder", `${rear}sjc`, [
      "joints",
    ]);
    add(
      rearShoulder,
      source(
        trial,
        "joint_angles",
        "rear_shoulder_angle_z",
        "Rear shoulder axial rotation",
        "°",
        "Published rear-shoulder axial rotation component in its modeled frame.",
      ),
    );
    add(
      rearShoulder,
      source(
        trial,
        "joint_velos",
        "rear_shoulder_angular_velocity_z",
        "Rear shoulder axial velocity",
        "°/s",
        "Published signed rear-shoulder axial angular velocity.",
      ),
    );
    addPosition(rearShoulder, trial, `${rear}sjc`);
    const rearElbow = make("rearElbow", "Rear elbow", `${rear}ejc`, ["joints"]);
    add(
      rearElbow,
      source(
        trial,
        "joint_angles",
        "rear_elbow_angle_x",
        "Rear elbow flexion",
        "°",
        "Published modeled rear-elbow flexion component.",
      ),
    );
    add(
      rearElbow,
      source(
        trial,
        "joint_velos",
        "rear_elbow_angular_velocity_x",
        "Rear elbow flexion velocity",
        "°/s",
        "Published signed rear-elbow flexion/extension angular velocity.",
      ),
    );
    addPosition(rearElbow, trial, `${rear}ejc`);
    const batPoint = make("bat", "Bat sweet spot", "sweet_spot", [
      "core",
      "joints",
    ]);
    if (bat?.time?.length)
      add(batPoint, {
        id: "bat:speed",
        label: "Reconstructed bat speed",
        unit: "mph",
        definition:
          "Dashboard magnitude of the unfiltered three-point derivative of released sweet-spot XYZ at native CSV timestamps. This is a time series estimate, separate from the published contact and peak bat-speed POIs. Endpoint and gap samples remain missing.",
        focus: "",
        family: "Calculated here",
        source: "landmarks.csv · sweet_spot XYZ derivative",
        time: bat.time,
        values: bat.speed.map((value) =>
          finite(value) ? value * 2.2369362921 : null,
        ),
        visualAction: "batSweep",
      });
    addPosition(batPoint, trial, "sweet_spot");
  }

  for (const [role, anchor] of pitch
    ? [
        ["lead", "lead_knee_jc"],
        ["rear", "rear_knee_jc"],
      ]
    : [
        ["lead", `${lead}kjc`],
        ["rear", `${rear}kjc`],
      ]) {
    const knee = make(
      `${role}Knee`,
      `${role === "lead" ? "Lead" : "Rear"} knee`,
      anchor,
      role === "lead" ? ["core", "joints", "kinetics"] : ["joints", "kinetics"],
    );
    add(
      knee,
      source(
        trial,
        "joint_angles",
        `${role}_knee_angle_x`,
        "Knee flexion",
        "°",
        "Published modeled knee flexion. The orange 3D wedge is the visible bend between reconstructed hip, knee and ankle centers; its angle can differ from the modeled quantity.",
        role === "lead" ? "leadKnee" : "rearKnee",
      ),
    );
    add(
      knee,
      source(
        trial,
        "joint_velos",
        pitch ? `${role}_knee_velo_x` : `${role}_knee_angular_velocity_x`,
        "Knee flexion velocity",
        "°/s",
        "Published signed knee flexion/extension angular velocity.",
      ),
    );
    if (role === "lead") {
      const extension = source(
        trial,
        "joint_velos",
        pitch ? "lead_knee_velo_x" : "lead_knee_angular_velocity_x",
        "Lead-knee extension velocity",
        "°/s",
        "Negative of released knee flexion velocity. Positive means extension, negative means flexion. The displayed arc shows joint-center geometry; the flexion readout is the published model angle.",
        "",
        "Calculated here",
      );
      if (extension) {
        extension.id = "leadKnee:extension";
        extension.values = extension.values.map((v) => (finite(v) ? -v : null));
        extension.visualAction = "knee";
        add(knee, extension);
      }
    }
    if (pitch) {
      add(
        knee,
        source(
          trial,
          "forces_moments",
          `${role}_knee_moment_x`,
          "Knee moment X",
          "N·m",
          "Published modeled knee moment X component in the joint coordinate frame.",
        ),
      );
      addEnergy(knee, trial, `${role}_knee`);
    }
    addPosition(knee, trial, anchor);
  }
  for (const [role, anchor] of pitch
    ? [
        ["lead", "lead_ankle_jc"],
        ["rear", "rear_ankle_jc"],
      ]
    : [
        ["lead", `${lead}ajc`],
        ["rear", `${rear}ajc`],
      ]) {
    const foot = make(
      `${role}Foot`,
      `${role === "lead" ? "Lead" : "Rear"} foot`,
      anchor,
      role === "lead" ? ["core", "kinetics"] : ["kinetics"],
    );
    addFoot(foot, trial, role);
    if (role === "lead") {
      const braking = source(
        trial,
        "force_plate",
        "lead_force_x",
        "Lead-foot force · lab X",
        "N",
        "Signed lead-foot horizontal GRF: pitching processed posterior-positive X is reversed into lab X; hitting retains lab X. Cyan indicates force opposing COM X velocity, not a complete measure of the lead-leg block. Arrow origin is an ankle display anchor, not measured COP.",
        "",
        "Calculated here",
      );
      if (braking) {
        braking.id = "leadFoot:labX";
        braking.values = braking.values.map((value) =>
          leadForceLabX(trial.entry.discipline, value),
        );
        braking.visualAction = "braking";
        add(foot, braking);
      }
    }
    addPosition(foot, trial, anchor);
  }
  if (pitch) {
    const hand = make("hand", "Throwing hand", "hand_jc", ["joints"]);
    addPosition(hand, trial, "hand_jc");
  }
  for (const platform of trial.motion?.platforms || []) {
    const plate = plateGroup(trial, platform);
    if (plate) groups.push(plate);
  }
  if (trial.motion?.frames?.length)
    for (const [index, name] of trial.motion.labels.entries())
      groups.push(rawMarkerGroup(trial, name, index));
  return groups.filter((g) => g.metrics.length);
}
