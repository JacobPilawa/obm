import { paintBand, cohortState } from "./cohort_band.js";
import { sample } from "./biomechanics.js";
const caches = new WeakMap();
export const chartSeries = (metric) => metric.series || [metric];
// Use only drawn signals and their bands inside the selected time window.
export function visibleExtent(metric, t0, t1, options = {}) {
  let low = Infinity,
    high = -Infinity;
  const hidden = new Set(options.hidden || []),
    include = (value) => {
      if (Number.isFinite(value)) {
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
    };
  for (const [index, series] of chartSeries(metric).entries()) {
    if (hidden.has(index)) continue;
    for (let i = 0; i < series.time.length; i++)
      if (series.time[i] >= t0 && series.time[i] <= t1)
        include(series.values[i]);
    include(sample(series, t0));
    include(sample(series, t1));
    const band = options.bands?.[index];
    if (!band) continue;
    for (let i = 0; i < band.time.length; i++)
      if (band.time[i] >= t0 && band.time[i] <= t1) {
        include(band.low[i]);
        include(band.high[i]);
      }
    for (const values of [band.low, band.high])
      for (const t of [t0, t1]) include(sample({ time: band.time, values }, t));
  }
  return Number.isFinite(low) ? { low, high } : null;
}
function baseChart(canvas, metric, events, color, bounds, options) {
  const ctx = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height,
    series = chartSeries(metric),
    multi = series.length > 1,
    left = 74,
    right = w - 28,
    top = events.length > 1 ? 53 : 25,
    legendHeight =
      multi && options.showLegend !== false ? series.length * 22 + 8 : 0,
    bottom = Math.max(top + 25, h - 57 - legendHeight);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  const times = series.flatMap((s) =>
      s.time?.length ? [s.time[0], s.time.at(-1)] : [],
    ),
    t0 = bounds?.min ?? Math.min(...times),
    t1 = bounds?.max ?? Math.max(...times);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return;
  const extent = visibleExtent(metric, t0, t1, options);
  if (!extent) {
    ctx.fillStyle = "#68737b";
    ctx.font = "21px Inter, sans-serif";
    const none = series.every((_, i) => options.hidden?.includes(i));
    ctx.fillText(
      none ? "No visible signals" : "No usable samples in this window",
      left,
      top + 40,
    );
    return;
  }
  let { low, high } = extent;
  if (high - low < 1e-8) {
    low -= 1;
    high += 1;
  }
  const pad = (high - low) * 0.07;
  low -= pad;
  high += pad;
  const x = (t) => left + ((t - t0) / (t1 - t0)) * (right - left),
    y = (value) => bottom - ((value - low) / (high - low)) * (bottom - top);
  ctx.font = "18px Inter, sans-serif";
  ctx.fillStyle = "#64717b";
  ctx.strokeStyle = "#e5e9eb";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const value = low + ((high - low) * i) / 3,
      py = y(value);
    ctx.beginPath();
    ctx.moveTo(left, py);
    ctx.lineTo(right, py);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(
      value.toFixed(Math.abs(value) < 10 ? 1 : 0),
      left - 10,
      py + 6,
    );
  }
  ctx.textAlign = "center";
  for (let i = 0; i <= 2; i++) {
    const t = t0 + ((t1 - t0) * i) / 2;
    ctx.fillText(t.toFixed(2), x(t), bottom + 27);
  }
  ctx.fillText("Time (s)", (left + right) / 2, bottom + 49);
  ctx.save();
  ctx.translate(18, (top + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(metric.unit, 0, 0);
  ctx.restore();
  const lanes = [-Infinity, -Infinity, -Infinity];
  for (const event of events) {
    if (event.time < t0 || event.time > t1) continue;
    const px = x(event.time);
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = event.color || "#bd5546";
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.lineTo(px, bottom);
    ctx.stroke();
    ctx.restore();
    ctx.font = "16px Inter, sans-serif";
    ctx.fillStyle = event.color || "#a6463a";
    const width = ctx.measureText(event.label).width,
      tx = Math.min(right - width / 2, Math.max(left + width / 2, px));
    let lane = lanes.findIndex((end) => tx - width / 2 > end + 8);
    if (lane < 0) lane = lanes.indexOf(Math.min(...lanes));
    lanes[lane] = tx + width / 2;
    ctx.fillText(event.label, tx, top - 7 - lane * 16);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  ctx.clip();
  for (const [i, s] of series.entries()) {
    if (options.hidden?.includes(i)) continue;
    paintBand(ctx, options.bands?.[i], x, y, multi ? s.color || color : color);
    ctx.strokeStyle = multi ? s.color || color : color;
    ctx.lineWidth = 3;
    ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    let started = false,
      previous = null;
    const typical =
      (s.time.at(-1) - s.time[0]) / Math.max(1, s.time.length - 1);
    for (let i = 0; i < s.time.length; i++) {
      const t = s.time[i],
        value = s.values[i];
      if (!Number.isFinite(value)) {
        started = false;
        continue;
      }
      if (!started || (previous !== null && t - previous > typical * 1.6))
        ctx.moveTo(x(t), y(value));
      else ctx.lineTo(x(t), y(value));
      started = true;
      previous = t;
    }
    ctx.stroke();
  }
  ctx.restore();
  if (multi && options.showLegend !== false) {
    ctx.font = "17px Inter, sans-serif";
    ctx.textAlign = "left";
    series.forEach((s, i) => {
      const py = bottom + 68 + i * 22;
      ctx.fillStyle = s.color || color;
      ctx.fillRect(left, py - 5, 18, 4);
      ctx.fillStyle = "#43545e";
      ctx.fillText(s.label, left + 26, py, right - left - 26);
    });
  }
  return { x, y, t0, t1, top, bottom };
}
export function drawChart(
  canvas,
  metric,
  playhead,
  event,
  color = "#176b93",
  bounds = null,
  options = {},
) {
  const events = Array.isArray(event) ? event : event ? [event] : [],
    key = JSON.stringify([
      events,
      bounds,
      options.hidden,
      options.showLegend,
      cohortState().version,
    ]),
    old = caches.get(canvas);
  let cached = old;
  if (
    !old ||
    old.metric !== metric ||
    old.w !== canvas.width ||
    old.h !== canvas.height ||
    old.color !== color ||
    old.key !== key
  ) {
    const base = document.createElement("canvas");
    base.width = canvas.width;
    base.height = canvas.height;
    cached = {
      base,
      metric,
      w: canvas.width,
      h: canvas.height,
      color,
      key,
      geometry: baseChart(base, metric, events, color, bounds, options),
    };
    caches.set(canvas, cached);
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(cached.base, 0, 0);
  if (!cached.geometry) return;
  const { x, y, t0, t1, top, bottom } = cached.geometry;
  if (playhead >= t0 && playhead <= t1) {
    const px = x(playhead);
    ctx.strokeStyle = "#293841";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.lineTo(px, bottom);
    ctx.stroke();
    for (const [i, s] of chartSeries(metric).entries()) {
      if (options.hidden?.includes(i)) continue;
      const value = sample(s, playhead);
      if (!Number.isFinite(value)) continue;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = metric.series ? s.color || color : color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, y(value), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
