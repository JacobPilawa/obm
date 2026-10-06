import { derivative, sample } from "./biomechanics.js";

// These are single-pitch readouts, not the cohort averages or SDs in the reference slides.
export function buildPitchReport(trial) {
  if (trial.entry.discipline !== "pitching") return [];
  const angles = trial.signals?.joint_angles,
    velos = trial.signals?.joint_velos,
    poi = trial.poi || {},
    events = trial.events || {};
  if (!angles && !Object.keys(poi).length) return [];
  const fp = events.fp_100_time?.time,
    br = events.BR_time?.time,
    mer = events.MER_time?.time;
  const series = (table, key, scale = 1) => {
    const values = table?.series?.[key];
    return values
      ? {
          time: table.time,
          values:
            scale === 1
              ? values
              : values.map((value) =>
                  Number.isFinite(value) ? value * scale : null,
                ),
        }
      : null;
  };
  const at = (table, key, time, scale = 1) =>
    Number.isFinite(time) ? sample(series(table, key, scale), time) : null;
  const peak = (table, key, scale = 1, end = null) => {
    const trace = series(table, key, scale);
    let best = null;
    for (let i = 0; i < (trace?.values.length || 0); i++) {
      const value = trace.values[i];
      if (Number.isFinite(end) && trace.time[i] > end) break;
      if (Number.isFinite(value) && (best === null || value > best))
        best = value;
    }
    return best;
  };
  const field = (key, fallback = null) =>
    Number.isFinite(poi[key]) ? poi[key] : fallback;
  const row = (label, key, scale = 1) => ({
    label,
    values: [
      at(angles, key, fp, scale),
      at(angles, key, br, scale),
      peak(angles, key, scale, br),
    ],
  });
  const arm = [
    row("Elbow flexion", "elbow_angle_x"),
    row("Shoulder external rotation", "shoulder_angle_z"),
    row("Shoulder abduction", "shoulder_angle_y"),
    row("Shoulder horizontal abduction", "shoulder_angle_x"),
    row("Wrist extension", "wrist_angle_x"),
  ];
  const lower = [
    {
      label: "Forward trunk tilt",
      values: [
        at(angles, "torso_angle_x", fp),
        at(angles, "torso_angle_x", br),
      ],
    },
    {
      label: "Lateral trunk tilt",
      values: [
        at(angles, "torso_angle_y", fp),
        at(angles, "torso_angle_y", br),
      ],
    },
    {
      label: "Trunk angle",
      values: [
        at(angles, "torso_angle_z", fp),
        at(angles, "torso_angle_z", br),
      ],
    },
    {
      label: "Pelvis angle",
      values: [
        at(angles, "pelvis_angle_z", fp),
        at(angles, "pelvis_angle_z", br),
      ],
    },
    {
      label: "Front knee flexion",
      values: [
        at(angles, "lead_knee_angle_x", fp),
        at(angles, "lead_knee_angle_x", br),
      ],
    },
    {
      label: "Stride length",
      values: [
        null,
        null,
        field("stride_length") != null ? field("stride_length") * 100 : null,
      ],
      unit: "% height",
      source: "Published POI",
    },
    {
      label: "Foot position",
      values: [null, null, null],
      unit: "in",
      source: "Not released as a matching scalar",
    },
    {
      label: "Max hip–shoulder separation",
      values: [
        null,
        null,
        field(
          "max_rotation_hip_shoulder_separation",
          peak(angles, "torso_pelvis_angle_z"),
        ),
      ],
      source: "Published POI, or CSV peak",
    },
  ];
  const com = trial.signals?.landmarks,
    comX = com?.series?.centerofmass_x,
    comSpeed = comX
      ? { time: com.time, values: derivative(com.time, comX) }
      : null;
  let comPeak = null;
  if (comSpeed)
    for (let i = 0; i < comSpeed.time.length; i++) {
      const t = comSpeed.time[i],
        value = comSpeed.values[i];
      if (
        Number.isFinite(value) &&
        (!Number.isFinite(fp) || t <= fp) &&
        (!comPeak || value > comPeak.value)
      )
        comPeak = { time: t, value };
    }
  const pelvis = series(velos, "pelvis_velo_z"),
    torso = series(velos, "torso_velo_z");
  const peakTime = (s) => {
    let result = null;
    if (s)
      for (let i = 0; i < s.time.length; i++)
        if (
          Number.isFinite(s.values[i]) &&
          (!result || s.values[i] > result.value)
        )
          result = { time: s.time[i], value: s.values[i] };
    return result?.time;
  };
  const pelvisPeakTime = peakTime(pelvis),
    torsoPeakTime = peakTime(torso);
  const delta = (end, start) =>
    Number.isFinite(end) && Number.isFinite(start) ? end - start : null;
  const sequencing = [
    {
      label: "Peak COG velocity to foot plant",
      values: [delta(fp, comPeak?.time)],
      source: "Calculated from landmarks.csv and event time",
    },
    {
      label: "Foot plant to max external rotation",
      values: [delta(mer, fp)],
      source: "Calculated from published event times",
    },
    {
      label: "Max external rotation to ball release",
      values: [delta(br, mer)],
      source: "Calculated from published event times",
    },
    {
      label: "Peak pelvis to peak torso angular velocity",
      values: [
        field(
          "timing_peak_torso_to_peak_pelvis_rot_velo",
          delta(torsoPeakTime, pelvisPeakTime),
        ),
      ],
      source: Number.isFinite(poi.timing_peak_torso_to_peak_pelvis_rot_velo)
        ? "Published POI"
        : "Calculated from joint_velos.csv",
    },
  ];
  const velocities = [
    {
      label: "Maximum COG velocity",
      values: [
        field(
          "max_cog_velo_x",
          peak(
            comSpeed
              ? { time: comSpeed.time, series: { speed: comSpeed.values } }
              : null,
            "speed",
          ),
        ),
      ],
      unit: "m/s",
      source: "Published POI, or calculated from landmarks.csv",
    },
    {
      label: "Maximum pelvis angular velocity",
      values: [
        field("max_pelvis_rotational_velo", peak(velos, "pelvis_velo_z")),
      ],
      unit: "deg/s",
    },
    {
      label: "Maximum upper trunk angular velocity",
      values: [field("max_torso_rotational_velo", peak(velos, "torso_velo_z"))],
      unit: "deg/s",
    },
    {
      label: "Maximum elbow extension angular velocity",
      values: [
        field("max_elbow_extension_velo", peak(velos, "elbow_velo_x", -1)),
      ],
      unit: "deg/s",
    },
    {
      label: "Maximum arm internal rotation angular velocity",
      values: [
        field(
          "max_shoulder_internal_rotational_velo",
          peak(velos, "shoulder_velo_z", -1),
        ),
      ],
      unit: "deg/s",
    },
    {
      label: "Maximum lead knee extension angular velocity",
      values: [
        field(
          "lead_knee_extension_angular_velo_max",
          peak(velos, "lead_knee_velo_x", -1),
        ),
      ],
      unit: "deg/s",
    },
    {
      label: "Lead knee extension angular velocity at BR",
      values: [
        field(
          "lead_knee_extension_angular_velo_br",
          at(velos, "lead_knee_velo_x", br, -1),
        ),
      ],
      unit: "deg/s",
    },
    {
      label: "Pitch speed",
      values: [field("pitch_speed_mph", trial.entry.speed_mph)],
      unit: "mph",
      source: "Published POI or metadata",
    },
  ];
  return [
    {
      title: "Throwing Arm Kinematic Positions",
      columns: ["Foot plant", "Release", "Maximum"],
      unit: "deg",
      rows: arm,
      note: "Single pitch. Values sampled from joint_angles.csv; maxima are through release. Shoulder Y is shown as released; its positive values agree with the abduction POI.",
    },
    {
      title: "Torso and Lower Body Kinematic Positions",
      columns: ["Foot plant", "Release", "Other"],
      unit: "deg",
      rows: lower,
      note: "Single pitch. Joint angles come from joint_angles.csv; stride length and separation use the published POI when present.",
    },
    {
      title: "Kinematic Sequencing",
      columns: ["Interval"],
      unit: "s",
      rows: sequencing,
      note: "Single-pitch event intervals. COG peak is searched before foot plant. A negative peak-to-peak interval means the torso peak occurred first.",
    },
    {
      title: "Kinematic Velocities",
      columns: ["Peak / value"],
      unit: "deg/s",
      rows: velocities.map((row) => ({
        ...row,
        source: row.source || "Published POI, or peak from joint_velos.csv",
      })),
      note: "Single-pitch published POI values are preferred; CSV peaks are used when a POI is unavailable. COG velocity is in m/s.",
    },
  ];
}
