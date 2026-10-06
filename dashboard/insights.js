import { buildQuantities } from "./quantities.js";
import { phaseEvents, sample, peakInWindow } from "./biomechanics.js";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const number = (v, n = 1) => (Number.isFinite(v) ? v.toFixed(n) : "—");
export function renderInsights(trial) {
  const host = document.getElementById("eventAnalysis"),
    phase = phaseEvents(trial),
    pitch = trial.entry.discipline === "pitching";
  if (!phase) {
    host.innerHTML =
      '<p class="caption">Event analysis needs published foot contact and release/contact times.</p>';
    return;
  }
  const quantities = new Map(
    buildQuantities({ ...trial, motion: null }).map((q) => [q.id, q]),
  );
  const rows = [];
  for (const id of [
    "axial_velocities",
    "lead_knee_velocity",
    ...(pitch ? ["shoulder_er", "arm_moments"] : ["bat_speed"]),
  ]) {
    const q = quantities.get(id);
    if (!q) continue;
    for (const s of q.series) {
      const p = peakInWindow(s, phase.start, phase.end);
      rows.push(
        `<tr><th scope="row">${esc(s.label)}</th><td>${number(sample(s, phase.start))}</td><td>${number(sample(s, phase.end))}</td><td>${p ? `${number(p.value)} <small>(${number((p.time - phase.end) * 1000, 0)} ms)</small>` : "—"}</td><td>${esc(q.unit)}</td></tr>`,
      );
    }
  }
  const g = trial.signals.joint_angles,
    key = "lead_knee_angle_x",
    knee = g?.series[key] ? { time: g.time, values: g.series[key] } : null,
    fp = trial.events.fp_100_time?.time;
  const k0 = sample(knee, fp),
    k1 = sample(knee, phase.end),
    extension = [k0, k1].every(Number.isFinite) ? k0 - k1 : null;
  host.innerHTML = `<p class="analysisSummary">Foot contact → ${pitch ? "release" : "contact"}: <strong>${number((phase.end - phase.start) * 1000, 1)} ms</strong>${extension !== null ? ` · Lead-knee extension from 100% BW foot plant: <strong>${number(extension)}°</strong>` : ""}</p><div class="tableScroll"><table class="eventTable"><thead><tr><th>Signal</th><th>Foot contact</th><th>${pitch ? "Release" : "Bat contact"}</th><th>Maximum in phase</th><th>Unit</th></tr></thead><tbody>${rows.join("")}</tbody></table></div><p class="caption">Values at events use linear interpolation between adjacent valid samples. Maxima are signed sampled maxima from 10% BW foot contact to release/contact; parentheses give time before that endpoint. A maximum knee flexion velocity is not a peak extension speed. Positive knee-extension change means straightening. Missing samples remain missing; these calculations are not published POI metrics or technique scores.</p>`;
}
