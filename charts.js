import {
  cohortKey,
  bandFor,
  paintBand,
  onCohortChange,
  loadCohort,
  cohortState,
  setCohortTrial,
} from "./cohort_band.js";
import { buildQuantities, EVENT_SHORT } from "./quantities.js";
import { timeAxis, phaseEvents, sample } from "./biomechanics.js";
import {
  REPLAY_COLORS,
  alignedTime,
  primaryTime,
  comparisonWindow,
} from "./comparison.js";
const $ = (id) => document.getElementById(id);
const safe = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const layouts = {};
const sourceSizes = new Map();
let cardResizeObserver = null,
  resizeDrag = null,
  resizeFrame = 0;
let trial = null,
  byId = new Map(),
  selected = [],
  tab = "joint_angles",
  cursor = 0,
  onSeek = () => {},
  reference = null,
  referenceQuantities = new Map(),
  comparison = null,
  compareSpecs = new Map(),
  soloTimeMode = "recording",
  activeWindow = null;
const hiddenSeries = new Set();
const visibleCards = new Set();
let chartObserver = null;
const pads = { left: 62, right: 20, top: 36, bottom: 48 };
function fmt(n) {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  return a >= 100 ? n.toFixed(0) : a >= 10 ? n.toFixed(1) : n.toFixed(2);
}
function layoutKey(entry) {
  return entry.id;
}
function save() {
  if (trial) layouts[layoutKey(trial.entry)] = selected.map((x) => ({ ...x }));
}
const DEFAULTS = {
  pitching: [
    "report_arm_positions",
    "report_lower_positions",
    "report_sequence",
    "report_velocity_chain",
    "axial_angles",
    "torso_pelvis_separation",
    "axial_velocities",
    "shoulder_er",
    "shoulder_er_speed",
    "arm_moments",
    "knee_flexion",
    "grf_resultant",
  ],
  hitting: [
    "axial_angles",
    "torso_pelvis_separation",
    "axial_velocities",
    "upper_chain_speed",
    "knee_flexion",
    "bat_speed",
    "bat_attack",
    "grf_resultant",
    "grf_directional",
  ],
};
const CSV_ORDER = [
  "joint_angles",
  "joint_velos",
  "forces_moments",
  "force_plate",
  "energy_flow",
  "landmarks",
];
function defaultIds() {
  return DEFAULTS[trial.entry.discipline].filter((id) => byId.has(id));
}
function origin(x) {
  if (x.id === "bat_speed")
    return { label: "Reconstructed + published POIs", kind: "calculated" };
  if (x.id.startsWith("raw:")) return { label: "Raw C3D", kind: "raw" };
  if (x.source.includes("sign reversed"))
    return { label: "CSV · sign adjusted", kind: "calculated" };
  if (x.source.startsWith("Calculated") || x.source.startsWith("Mixed"))
    return { label: "Calculated here", kind: "calculated" };
  return { label: "Released CSV", kind: "published" };
}
function axis(t = trial) {
  return comparison
    ? {
        ...comparison.window,
        to: (value) => value,
        label: "Reference recording time (s)",
      }
    : timeAxis(t, $("chartTimeMode").value);
}
function chartAxis(x) {
  const base = axis();
  if (activeWindow) return { ...base, ...activeWindow };
  const window = x?.plotWindow;
  if (!window) return base;
  const start = trial.events?.[window.start]?.time,
    end = trial.events?.[window.end]?.time;
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? {
        ...base,
        min: start,
        max: end,
        label: base.label + " · foot plant → release",
      }
    : base;
}
function rangeControl(side) {
  return $("chartRange" + side);
}
function rangeCustom(side) {
  return $("chartRange" + side + "Custom");
}
function showCustomRangeInputs() {
  for (const side of ["Min", "Max"])
    rangeCustom(side).hidden = rangeControl(side).value !== "custom";
}
function rangeEndpoint(side) {
  const choice = rangeControl(side).value;
  if (choice === "full") return side === "Min" ? axis().min : axis().max;
  if (choice === "custom") {
    const input = rangeCustom(side).value.trim();
    return input ? Number(input) : NaN;
  }
  return trial.events?.[choice]?.time;
}
function rangeFeedback(message = "", error = false) {
  const status = $("chartRangeFeedback");
  status.textContent = message;
  status.hidden = !message;
  status.classList.toggle("error", error);
  $("chartOptionsButton").classList.toggle("rangeActive", !!activeWindow);
}
function populateRangeControls() {
  const moments = Object.entries(trial?.events || {})
    .filter(([, event]) => Number.isFinite(event?.time))
    .sort((a, b) => a[1].time - b[1].time);
  for (const side of ["Min", "Max"]) {
    const control = rangeControl(side),
      boundary = side === "Min" ? "Recording start" : "Recording end";
    control.innerHTML =
      '<option value="full">' +
      boundary +
      "</option>" +
      moments
        .map(
          ([key, event]) =>
            '<option value="' +
            safe(key) +
            '">' +
            safe(EVENT_SHORT[key] || event.label || key) +
            " · " +
            event.time.toFixed(3) +
            " s</option>",
        )
        .join("") +
      '<option value="custom">Custom time…</option>';
    control.value = "full";
    rangeCustom(side).value = "";
  }
  activeWindow = null;
  showCustomRangeInputs();
  rangeFeedback();
}
function applyRange() {
  const min = rangeEndpoint("Min"),
    max = rangeEndpoint("Max"),
    available = axis();
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min < available.min - 1e-6 ||
    max > available.max + 1e-6 ||
    max - min < 1e-6
  ) {
    rangeFeedback(
      "Choose a start before the end, within the available recording window.",
      true,
    );
    return;
  }
  activeWindow = { min, max };
  rangeFeedback(
    "Showing " + min.toFixed(3) + "–" + max.toFixed(3) + " s on all plots.",
  );
  invalidate();
}
function resetRange() {
  for (const side of ["Min", "Max"]) {
    rangeControl(side).value = "full";
    rangeCustom(side).value = "";
  }
  activeWindow = null;
  showCustomRangeInputs();
  rangeFeedback();
  invalidate();
}
function comparable() {
  return (
    !comparison &&
    reference &&
    trial &&
    reference.entry.discipline === trial.entry.discipline &&
    ($("chartTimeMode").value !== "phase" || phaseEvents(reference)) &&
    ($("chartTimeMode").value !== "event" ||
      reference.events?.[
        reference.entry.discipline === "pitching" ? "BR_time" : "contact_time"
      ])
  );
}
function lineKey(entryId, chartId, index) {
  return `${entryId}|${chartId}|${index}`;
}
function legendHTML(x) {
  if (!comparison)
    return x.series
      .map((s, j) => {
        const key = lineKey(trial.entry.id, x.id, j),
          visible = !hiddenSeries.has(key);
        return `<button type="button" class="legendToggle ${visible ? "" : "muted"}" data-toggle-line="${safe(key)}" aria-pressed="${visible}" style="--line:${s.color}"><span class="legendLabel">${safe(s.label)}</span><b data-value="${j}"></b></button>`;
      })
      .join("");
  return comparison.entries
    .flatMap((entry) => {
      const spec = compareSpecs.get(entry.id)?.get(x.id),
        color = REPLAY_COLORS[entry.colorIndex].body;
      return (spec?.series || []).map((s, j) => {
        const key = lineKey(entry.id, x.id, j),
          visible = !hiddenSeries.has(key);
        return `<button type="button" class="legendToggle ${visible ? "" : "muted"}" data-toggle-line="${safe(key)}" data-entry="${safe(entry.id)}" data-series-index="${j}" aria-pressed="${visible}" style="--line:${color}" title="${visible ? "Hide" : "Show"} ${safe(entry.label)} ${safe(s.label)}"><span class="legendLabel">${safe(entry.label)} · ${safe(s.label)}</span><b data-value="${j}"></b></button>`;
      });
    })
    .join("");
}
function sourceTabs() {
  const available = CSV_ORDER.filter((name) =>
    [...byId.keys()].some((id) => id.startsWith(`published:${name}:`)),
  );
  return [
    ...available.map((id) => ({ id, label: `${id}.csv` })),
    { id: "comparisons", label: "Comparisons" },
    { id: "calculated", label: "Calculated here" },
    { id: "raw", label: "Raw .c3d" },
  ];
}
function sourceItems() {
  const q = $("chartSearch").value.trim().toLowerCase();
  return [...byId.values()].filter((x) => {
    const match = CSV_ORDER.includes(tab)
      ? x.id.startsWith(`published:${tab}:`)
      : tab === "raw"
        ? x.id.startsWith("raw:")
        : tab === "calculated"
          ? origin(x).kind === "calculated"
          : !x.id.startsWith("published:") &&
            !x.id.startsWith("raw:") &&
            origin(x).kind === "published";
    return (
      match &&
      (!q || `${x.title} ${x.source} ${x.id}`.toLowerCase().includes(q))
    );
  });
}
function renderTabs() {
  $("chartTabs").innerHTML = sourceTabs()
    .map(
      (x) =>
        `<button type="button" role="tab" data-chart-tab="${x.id}" class="${tab === x.id ? "active" : ""}" aria-selected="${tab === x.id}">${x.label}</button>`,
    )
    .join("");
}
function cardHTML(item, i, count, scope) {
  const x = byId.get(item.id);
  const source = origin(x);
  const size =
    scope === "key"
      ? item
      : sourceSizes.get(`${trial.entry.id}|${item.id}`) || item;
  const actions =
    scope === "key"
      ? `<button aria-label="Move chart earlier" data-action="up" ${i === 0 ? "disabled" : ""}>↑</button><button aria-label="Move chart later" data-action="down" ${i === count - 1 ? "disabled" : ""}>↓</button><button aria-label="Toggle full width" data-action="wide">${item.wide ? "½" : "↔"}</button><button aria-label="Remove from key charts" data-action="remove">×</button>`
      : `<button class="pinChart" data-action="pin" ${selected.some((y) => y.id === x.id) ? "disabled" : ""}>${selected.some((y) => y.id === x.id) ? "In key charts" : "Add to key charts"}</button>`;
  return `<article class="chartCard ${item.wide ? "wide" : ""}" data-card="${safe(x.id)}" data-chart-scope="${scope}" style="${size.span ? `--chart-span:${size.span};` : size.wide ? "--chart-span:24;" : ""}${size.height ? `--plot-height:${size.height}px;` : ""}"><header class="chartCardHead"><div><div class="chartTitleLine"><h3>${safe(x.title)}</h3><span class="originTag ${source.kind}">${scope === "source" && CSV_ORDER.includes(tab) ? safe(tab) + ".csv" : source.label}</span></div><p>${safe(x.unit)}</p></div><div class="chartActions"><button data-action="sizeReset" title="Reset chart size" aria-label="Reset chart size" ${size.span || size.height ? "" : "hidden"}>⟲</button>${actions}</div></header><canvas class="scientificPlot" tabindex="0" role="slider" aria-label="${safe(x.title)} playhead; arrow keys step frames"></canvas><div class="chartLegend">${legendHTML(x)}</div>${x.note ? `<p class="chartNote">${safe(x.note)}</p>` : ""}<button class="chartResizeHandle resizeWest" data-chart-resize="w" aria-label="Resize chart width from left edge" title="Drag to resize plot"></button><button class="chartResizeHandle resizeEast" data-chart-resize="e" aria-label="Resize chart width from right edge" title="Drag to resize plot"></button><button class="chartResizeHandle resizeSouth" data-chart-resize="s" aria-label="Resize chart height" title="Drag to resize plot"></button><button class="chartResizeHandle resizeSouthWest" data-chart-resize="sw" aria-label="Resize chart from bottom left corner" title="Drag to resize plot"></button><button class="chartResizeHandle resizeSouthEast" data-chart-resize="se" aria-label="Resize chart from bottom right corner" title="Drag to resize plot"></button></article>`;
}
function renderReference() {
  const active = comparable();
  $("referenceStatus").hidden = !reference || !!comparison;
  $("referenceStatus").textContent = reference
    ? `${active ? "Dashed comparison" : "Comparison unavailable for this recording"}: ${reference.entry.processed_key || reference.entry.filename}`
    : "";
  $("clearReference").disabled = !reference || !!comparison;
  $("pinReference").disabled = !!comparison;
}
function renderGrid() {
  if (resizeDrag) {
    resizeDrag.card.classList.remove("resizing");
    resizeDrag = null;
    document.body.classList.remove("chartResizing");
  }
  selected = selected.filter((x) => byId.has(x.id));
  $("chartGrid").innerHTML = selected.length
    ? selected.map((x, i) => cardHTML(x, i, selected.length, "key")).join("")
    : '<div class="emptyCharts">Choose a plot below to add it here.</div>';
  if ($("sourceCharts").open) {
    const items = sourceItems();
    $("sourceGrid").innerHTML = items.length
      ? items
          .map((x, i) =>
            cardHTML({ id: x.id, wide: false }, i, items.length, "source"),
          )
          .join("")
      : '<div class="emptyCharts">No plots in this source for this recording.</div>';
    $("chartCount").textContent =
      `${items.length} ${items.length === 1 ? "plot" : "plots"}`;
  } else $("sourceGrid").replaceChildren();
  renderTabs();
  chartObserver?.disconnect();
  cardResizeObserver?.disconnect();
  visibleCards.clear();
  chartObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const card = entry.target;
        if (entry.isIntersecting) visibleCards.add(card);
        else {
          visibleCards.delete(card);
          card._base = null;
          const canvas = card.querySelector("canvas");
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
          }
        }
      }
      drawAll();
    },
    { rootMargin: "350px 0px" },
  );
  for (const card of document.querySelectorAll(
    "#chartGrid .chartCard, #sourceGrid .chartCard",
  )) {
    chartObserver.observe(card);
    cardResizeObserver?.observe(card.querySelector("canvas"));
  }
  save();
  renderReference();
}
function handleAction(e) {
  const b = e.target.closest("button[data-action]");
  if (!b) return;
  const card = b.closest("[data-card]"),
    id = card.dataset.card,
    i = selected.findIndex((x) => x.id === id),
    a = b.dataset.action;
  if (a === "sizeReset") {
    const size = chartSize(card);
    delete size.span;
    delete size.height;
    size.wide = false;
    renderGrid();
    return;
  }
  if (a === "pin") {
    if (i < 0)
      selected.push({
        id,
        wide: false,
        ...sourceSizes.get(`${trial.entry.id}|${id}`),
      });
    renderGrid();
    return;
  }
  if (i < 0) return;
  if (a === "remove") selected.splice(i, 1);
  if (a === "up" && i > 0)
    [selected[i], selected[i - 1]] = [selected[i - 1], selected[i]];
  if (a === "down" && i < selected.length - 1)
    [selected[i], selected[i + 1]] = [selected[i + 1], selected[i]];
  if (a === "wide") {
    selected[i].wide = !selected[i].wide;
    delete selected[i].span;
  }
  renderGrid();
}
function niceTicks(lo, hi) {
  const base = 10 ** Math.floor(Math.log10(Math.max(hi - lo, 1e-8) / 4)),
    step = ([1, 2, 5, 10].find((n) => n * base >= (hi - lo) / 4) || 10) * base,
    out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 0.001; v += step)
    out.push(v);
  return out;
}
function plotSeries(x) {
  if (comparison)
    return comparison.entries.flatMap((entry) => {
      const spec = compareSpecs.get(entry.id)?.get(x.id);
      return (spec?.series || []).flatMap((s, j) =>
        hiddenSeries.has(lineKey(entry.id, x.id, j))
          ? []
          : [
              {
                ...s,
                color: REPLAY_COLORS[entry.colorIndex].body,
                band: bandFor(entry.data, cohortKey(x.id, s.label)),
                axis: {
                  to: (t) => primaryTime(t, trial, entry.data, comparison.mode),
                },
                ref: false,
                seriesIndex: j,
              },
            ],
      );
    });
  const all = x.series.flatMap((s, j) =>
    hiddenSeries.has(lineKey(trial.entry.id, x.id, j))
      ? []
      : [
          {
            ...s,
            band: bandFor(trial, cohortKey(x.id, s.label)),
            axis: axis(),
            ref: false,
          },
        ],
  );
  if (comparable() && x.layer !== "raw")
    for (const s of referenceQuantities.get(x.id)?.series || [])
      all.push({ ...s, axis: axis(reference), ref: true });
  return all;
}
function prepare(card, x) {
  const canvas = card.querySelector("canvas"),
    rect = canvas.getBoundingClientRect(),
    dpr = Math.min(devicePixelRatio || 1, 2),
    w = Math.max(200, rect.width),
    h = Math.max(180, rect.height),
    W = Math.round(w * dpr),
    H = Math.round(h * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
    card._base = null;
  }
  if (!card._base) {
    const base = document.createElement("canvas");
    base.width = W;
    base.height = H;
    const g = base.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, h);
    const { left, right, top, bottom } = pads,
      pw = w - left - right,
      ph = h - top - bottom,
      a = chartAxis(x),
      all = plotSeries(x),
      xmin = a.to(a.min),
      xmax = a.to(a.max),
      px = (t) => left + (pw * (t - xmin)) / (xmax - xmin);
    let lo = Infinity,
      hi = -Infinity;
    for (const s of all)
      for (let i = 0; i < s.values.length; i++) {
        const v = s.values[i],
          t = s.axis.to(s.time[i]);
        if (Number.isFinite(v) && t >= xmin && t <= xmax) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
    for (const s of all)
      if (s.band)
        for (let i = 0; i < s.band.time.length; i++)
          if (
            s.axis.to(s.band.time[i]) >= xmin &&
            s.axis.to(s.band.time[i]) <= xmax
          )
            for (const value of [s.band.low[i], s.band.high[i]])
              if (Number.isFinite(value)) {
                lo = Math.min(lo, value);
                hi = Math.max(hi, value);
              }
    if (!Number.isFinite(lo)) {
      lo = -1;
      hi = 1;
    }
    if (hi - lo < 1e-7) {
      lo -= 1;
      hi += 1;
    }
    const margin = (hi - lo) * 0.07;
    lo -= margin;
    hi += margin;
    const py = (v) => top + ph - ((v - lo) / (hi - lo)) * ph;
    g.font = `11px ${getComputedStyle(document.body).fontFamily}`;
    g.textAlign = "right";
    g.fillStyle = "#47505b";
    g.lineWidth = 1;
    for (const value of niceTicks(lo, hi)) {
      const y = py(value);
      g.strokeStyle = value === 0 ? "#aeb6bf" : "#e9ecef";
      g.beginPath();
      g.moveTo(left, y);
      g.lineTo(w - right, y);
      g.stroke();
      g.fillText(fmt(value), left - 8, y + 4);
    }
    g.strokeStyle = "#aeb6bf";
    g.beginPath();
    g.moveTo(left, top);
    g.lineTo(left, top + ph);
    g.lineTo(w - right, top + ph);
    g.stroke();
    g.textAlign = "center";
    for (let i = 0; i <= 4; i++) {
      const value = xmin + ((xmax - xmin) * i) / 4,
        xx = left + (pw * i) / 4;
      g.strokeStyle = "#edf0f2";
      g.beginPath();
      g.moveTo(xx, top);
      g.lineTo(xx, top + ph);
      g.stroke();
      g.fillStyle = "#47505b";
      g.fillText(
        $("chartTimeMode").value === "recording"
          ? value.toFixed(2)
          : value.toFixed(0),
        xx,
        top + ph + 17,
      );
    }
    g.fillText(a.label, left + pw / 2, h - 5);
    g.save();
    g.translate(14, top + ph / 2);
    g.rotate(-Math.PI / 2);
    g.fillText(x.unit, 0, 0);
    g.restore();
    const lanes = [-100, -100, -100];
    for (const [key, val] of Object.entries(trial.events || {}).sort(
      (a, b) => a[1].time - b[1].time,
    )) {
      if (val.time < a.min || val.time > a.max) continue;
      const xx = px(a.to(val.time));
      g.setLineDash([3, 4]);
      g.strokeStyle = "#b5a19a";
      g.beginPath();
      g.moveTo(xx, top);
      g.lineTo(xx, top + ph);
      g.stroke();
      g.setLineDash([]);
      const label = EVENT_SHORT[key] || key;
      g.font = `9px ${getComputedStyle(document.body).fontFamily}`;
      const labelWidth = g.measureText(label).width,
        tx = Math.min(
          w - right - labelWidth / 2,
          Math.max(left + labelWidth / 2, xx),
        );
      let lane = lanes.findIndex((end) => tx - labelWidth / 2 > end + 4);
      if (lane < 0) lane = lanes.indexOf(Math.min(...lanes));
      lanes[lane] = tx + labelWidth / 2;
      g.fillStyle = "#79665e";
      g.fillText(label, tx, top - 6 - lane * 10);
    }
    g.save();
    g.beginPath();
    g.rect(left, top, pw, ph);
    g.clip();
    for (const s of all)
      paintBand(g, s.band, (t) => px(s.axis.to(t)), py, s.color);
    // Reference first, current curves on top. No resampling or invented data.
    for (const s of all.sort((a, b) => Number(b.ref) - Number(a.ref))) {
      g.strokeStyle = s.color;
      g.globalAlpha = s.ref ? 0.55 : 1;
      g.setLineDash(
        s.dash ||
          (s.ref
            ? [6, 4]
            : comparison
              ? [[], [7, 4], [2, 3], [9, 3, 2, 3]][s.seriesIndex % 4]
              : []),
      );
      g.lineWidth = s.ref ? 1.5 : 2;
      g.beginPath();
      let active = false,
        previous = null;
      const typical =
        (s.time.at(-1) - s.time[0]) / Math.max(1, s.time.length - 1);
      for (let i = 0; i < s.values.length; i++) {
        const v = s.values[i],
          t = s.time[i];
        if (!Number.isFinite(v) || !Number.isFinite(t)) {
          active = false;
          continue;
        }
        const xx = px(s.axis.to(t)),
          yy = py(v);
        if (!active || (previous !== null && t - previous > typical * 1.6)) {
          g.moveTo(xx, yy);
          active = true;
        } else g.lineTo(xx, yy);
        previous = t;
      }
      g.stroke();
      if (s.marker) {
        g.setLineDash([]);
        for (let i = 0; i < s.values.length; i++) {
          if (!Number.isFinite(s.values[i])) continue;
          const x = px(s.axis.to(s.time[i])),
            y = py(s.values[i]);
          g.beginPath();
          if (s.marker === "cross") {
            g.moveTo(x - 5, y - 5);
            g.lineTo(x + 5, y + 5);
            g.moveTo(x - 5, y + 5);
            g.lineTo(x + 5, y - 5);
          } else {
            g.arc(x, y, 5.5, 0, Math.PI * 2);
            g.fillStyle = "#fff";
            g.fill();
          }
          g.stroke();
        }
      }
    }
    g.restore();
    card._base = base;
    card._size = { w, h, dpr };
  }
  return { canvas, ...card._size, base: card._base };
}
function drawAll() {
  if (!trial) return;
  const a = chartAxis(null);
  const outside = cursor < a.min || cursor > a.max;
  $("chartWindowStatus").hidden = !outside;
  $("chartWindowStatus").textContent = outside
    ? "Playhead is outside the selected chart window."
    : "";
  for (const card of visibleCards) {
    const x = byId.get(card.dataset.card);
    if (!x) continue;
    const view = chartAxis(x),
      p = prepare(card, x),
      g = p.canvas.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, p.canvas.width, p.canvas.height);
    g.drawImage(p.base, 0, 0);
    g.setTransform(p.dpr, 0, 0, p.dpr, 0, 0);
    if (cursor >= view.min && cursor <= view.max) {
      const xx =
        pads.left +
        ((p.w - pads.left - pads.right) *
          (view.to(cursor) - view.to(view.min))) /
          (view.to(view.max) - view.to(view.min));
      g.strokeStyle = "#184d80";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(xx, pads.top);
      g.lineTo(xx, p.h - pads.bottom);
      g.stroke();
      g.fillStyle = "#184d80";
      g.beginPath();
      g.arc(xx, pads.top, 3, 0, Math.PI * 2);
      g.fill();
    }
    p.canvas.setAttribute("aria-valuemin", view.min);
    p.canvas.setAttribute("aria-valuemax", view.max);
    p.canvas.setAttribute(
      "aria-valuenow",
      Math.min(view.max, Math.max(view.min, cursor)),
    );
    p.canvas.setAttribute("aria-valuetext", `${cursor.toFixed(3)} seconds`);
    card.querySelectorAll("[data-value]").forEach((el) => {
      if (comparison) {
        const entry = comparison.entries.find(
            (item) => item.id === el.closest("[data-entry]")?.dataset.entry,
          ),
          spec = entry && compareSpecs.get(entry.id)?.get(x.id),
          local = entry
            ? alignedTime(cursor, trial, entry.data, comparison.mode)
            : NaN,
          series = spec?.series[Number(el.dataset.value)];
        el.textContent = `${series && local >= 0 && local <= entry.data.duration ? fmt(series.staticReference ? series.values[0] : sample(series, local)) : "—"} ${x.unit}`;
      } else
        el.textContent = `${fmt(x.series[Number(el.dataset.value)].staticReference ? x.series[Number(el.dataset.value)].values[0] : sample(x.series[Number(el.dataset.value)], cursor))} ${x.unit}`;
      el.title = el.textContent;
    });
  }
}
function invalidate() {
  for (const c of visibleCards) c._base = null;
  renderReference();
  drawAll();
}
function seekAt(canvas, event) {
  const rect = canvas.getBoundingClientRect(),
    f =
      (event.clientX - rect.left - pads.left) /
      (rect.width - pads.left - pads.right),
    a = chartAxis(byId.get(canvas.closest("[data-card]")?.dataset.card));
  onSeek(a.min + Math.max(0, Math.min(1, f)) * (a.max - a.min));
}
function chartSize(card) {
  const id = card.dataset.card;
  if (card.dataset.chartScope === "key")
    return selected.find((x) => x.id === id);
  const key = `${trial.entry.id}|${id}`;
  if (!sourceSizes.has(key)) sourceSizes.set(key, {});
  return sourceSizes.get(key);
}
function redrawSize() {
  if (!resizeFrame)
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      invalidate();
    });
}
function applyChartSize(card, span, height) {
  const size = chartSize(card);
  if (!size) return;
  if (span != null) {
    size.span = span;
    size.wide = span === 24;
    card.style.setProperty("--chart-span", span);
    card.classList.toggle("wide", size.wide);
  }
  if (height != null) {
    size.height = height;
    card.style.setProperty("--plot-height", `${height}px`);
  }
  card.querySelector('[data-action="sizeReset"]').hidden = false;
  save();
  redrawSize();
}
function resizeLimits(grid) {
  const gap = parseFloat(getComputedStyle(grid).columnGap) || 12,
    width = grid.getBoundingClientRect().width;
  return {
    minSpan: Math.min(
      24,
      Math.ceil((24 * (Math.min(280, width) + gap)) / (width + gap)),
    ),
    width,
    gap,
  };
}
function startResize(event) {
  const handle = event.target.closest("[data-chart-resize]");
  if (!handle || !trial || event.button !== 0) return;
  event.preventDefault();
  const card = handle.closest(".chartCard"),
    grid = card.parentElement,
    rect = card.getBoundingClientRect();
  resizeDrag = {
    handle,
    card,
    grid,
    edge: handle.dataset.chartResize,
    x: event.clientX,
    y: event.clientY,
    width: rect.width,
    height: card.querySelector("canvas").getBoundingClientRect().height,
    pointer: event.pointerId,
  };
  handle.setPointerCapture(event.pointerId);
  document.body.classList.add("chartResizing");
  card.classList.add("resizing");
}
function moveResize(event) {
  if (!resizeDrag || event.pointerId !== resizeDrag.pointer) return;
  const d = resizeDrag,
    limits = resizeLimits(d.grid),
    width = d.width + (event.clientX - d.x) * (d.edge.includes("w") ? -1 : 1);
  const span =
    d.edge === "s"
      ? null
      : Math.max(
          limits.minSpan,
          Math.min(
            24,
            Math.round(
              (24 * (width + limits.gap)) / (limits.width + limits.gap),
            ),
          ),
        );
  const height = d.edge.includes("s")
    ? Math.max(180, Math.min(900, Math.round(d.height + event.clientY - d.y)))
    : null;
  applyChartSize(d.card, span, height);
}
function endResize(event) {
  if (!resizeDrag || event.pointerId !== resizeDrag.pointer) return;
  resizeDrag.card.classList.remove("resizing");
  resizeDrag = null;
  document.body.classList.remove("chartResizing");
}
function reset() {
  selected = defaultIds().map((id) => ({ id, wide: false }));
  renderGrid();
}
export function initCharts(callbacks) {
  onSeek = callbacks.onSeek;
  onCohortChange(() => {
    if (cohortState().enabled) {
      if (trial) loadCohort(trial);
      for (const entry of comparison?.entries || []) loadCohort(entry.data);
    }
    invalidate();
  });
  $("chartTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-chart-tab]");
    if (b) {
      tab = b.dataset.chartTab;
      $("chartSearch").value = "";
      renderGrid();
    }
  });
  $("chartSearch").addEventListener("input", renderGrid);
  $("sourceCharts").addEventListener("toggle", () => {
    $("sourceToggleLabel").textContent = $("sourceCharts").open
      ? "Collapse"
      : "Expand";
    renderGrid();
  });
  $("jumpToSources").addEventListener("click", () => {
    const panel = $("sourceCharts");
    panel.open = true;
    requestAnimationFrame(() =>
      panel.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  });
  for (const grid of [$("chartGrid"), $("sourceGrid")]) {
    grid.addEventListener("click", handleAction);
    grid.addEventListener("pointerdown", startResize);
    grid.addEventListener("pointermove", moveResize);
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      grid.addEventListener(event, endResize);
    grid.addEventListener("dblclick", (e) => {
      if (e.target.closest("[data-chart-resize]")) {
        const size = chartSize(e.target.closest(".chartCard"));
        delete size.span;
        delete size.height;
        size.wide = false;
        renderGrid();
      }
    });
    grid.addEventListener("keydown", (e) => {
      const handle = e.target.closest("[data-chart-resize]");
      if (
        !handle ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      )
        return;
      e.preventDefault();
      const card = handle.closest(".chartCard"),
        size = chartSize(card),
        limits = resizeLimits(grid);
      if (e.key === "ArrowLeft" || e.key === "ArrowRight")
        applyChartSize(
          card,
          Math.max(
            limits.minSpan,
            Math.min(
              24,
              (size.span || (size.wide ? 24 : 12)) +
                (e.key === "ArrowRight" ? 1 : -1),
            ),
          ),
          null,
        );
      else
        applyChartSize(
          card,
          null,
          Math.max(
            180,
            Math.min(
              900,
              (size.height || 235) + (e.key === "ArrowDown" ? 20 : -20),
            ),
          ),
        );
    });
    grid.addEventListener("click", (e) => {
      const b = e.target.closest("[data-toggle-line]");
      if (!b) return;
      const key = b.dataset.toggleLine;
      if (hiddenSeries.has(key)) hiddenSeries.delete(key);
      else hiddenSeries.add(key);
      for (const item of document.querySelectorAll("[data-toggle-line]"))
        if (item.dataset.toggleLine === key) {
          const visible = !hiddenSeries.has(key);
          item.classList.toggle("muted", !visible);
          item.setAttribute("aria-pressed", String(visible));
          item.title = `${visible ? "Hide" : "Show"} ${item.textContent.trim()}`;
        }
      invalidate();
    });
    grid.addEventListener("pointerdown", (e) => {
      const c = e.target.closest("canvas.scientificPlot");
      if (!c || !trial) return;
      c.setPointerCapture(e.pointerId);
      c.dataset.dragging = "1";
      seekAt(c, e);
    });
    grid.addEventListener("pointermove", (e) => {
      const c = e.target.closest("canvas.scientificPlot");
      if (c?.dataset.dragging === "1") seekAt(c, e);
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      grid.addEventListener(event, (e) => {
        const c = e.target.closest("canvas.scientificPlot");
        if (c) c.dataset.dragging = "0";
      });
    grid.addEventListener("keydown", (e) => {
      if (
        !e.target.matches("canvas") ||
        !trial ||
        !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
      )
        return;
      e.preventDefault();
      const a = chartAxis(
        byId.get(e.target.closest("[data-card]")?.dataset.card),
      );
      onSeek(
        e.key === "Home"
          ? a.min
          : e.key === "End"
            ? a.max
            : Math.min(
                a.max,
                Math.max(
                  a.min,
                  cursor +
                    ((e.key === "ArrowRight" ? 1 : -1) *
                      (e.shiftKey ? 10 : 1)) /
                      (trial.motion?.rate || 360),
                ),
              ),
      );
    });
  }
  $("resetCharts").addEventListener("click", () => {
    if (trial) reset();
  });
  $("chartOptionsButton").addEventListener("click", () => {
    const panel = $("chartOptionsPanel"),
      open = panel.hidden;
    panel.hidden = !open;
    $("chartOptionsButton").setAttribute("aria-expanded", String(open));
  });
  $("chartTimeMode").addEventListener("change", invalidate);
  for (const side of ["Min", "Max"])
    rangeControl(side).addEventListener("change", showCustomRangeInputs);
  $("applyChartRange").addEventListener("click", applyRange);
  $("resetChartRange").addEventListener("click", resetRange);
  $("pinReference").addEventListener("click", () => {
    if (!trial) return;
    reference = { ...trial, motion: null };
    referenceQuantities = new Map(
      buildQuantities(reference).map((x) => [x.id, x]),
    );
    invalidate();
  });
  $("clearReference").addEventListener("click", () => {
    reference = null;
    referenceQuantities.clear();
    invalidate();
  });
  cardResizeObserver = new ResizeObserver(redrawSize);
  const resizeObserver = new ResizeObserver(redrawSize);
  resizeObserver.observe($("chartGrid"));
  resizeObserver.observe($("sourceGrid"));
}
export function setChartTrial(next) {
  trial = next;
  setCohortTrial(trial);
  byId = new Map(buildQuantities(trial).map((x) => [x.id, x]));
  populateRangeControls();
  const mode = $("chartTimeMode"),
    phase = phaseEvents(trial),
    end =
      trial.events?.[
        trial.entry.discipline === "pitching" ? "BR_time" : "contact_time"
      ];
  mode.querySelector('[value="phase"]').disabled = !phase;
  mode.querySelector('[value="event"]').disabled = !end;
  if (mode.selectedOptions[0].disabled) mode.value = "recording";
  selected = (
    layouts[layoutKey(trial.entry)] ||
    defaultIds().map((id) => ({ id, wide: false }))
  ).filter((x) => byId.has(x.id));
  tab =
    sourceTabs().find((x) => CSV_ORDER.includes(x.id))?.id ||
    (trial.motion ? "raw" : "comparisons");
  cursor = 0;
  renderGrid();
}
export function setChartComparison(entries, mode = "event") {
  const wasActive = !!comparison;
  if (!entries?.length) {
    comparison = null;
    compareSpecs.clear();
    hiddenSeries.clear();
    $("chartTimeMode").disabled = false;
    if (wasActive) $("chartTimeMode").value = soloTimeMode;
  } else {
    if (!wasActive) soloTimeMode = $("chartTimeMode").value;
    comparison = {
      entries,
      mode,
      window: comparisonWindow(entries, trial, mode),
    };
    $("chartTimeMode").value = "recording";
    $("chartTimeMode").disabled = true;
    const previous = compareSpecs;
    compareSpecs = new Map(
      entries.map((entry) => [
        entry.id,
        previous.get(entry.id) ||
          new Map(buildQuantities(entry.data).map((spec) => [spec.id, spec])),
      ]),
    );
    for (const key of [...hiddenSeries])
      if (!entries.some((entry) => key.startsWith(entry.id + "|")))
        hiddenSeries.delete(key);
  }
  renderGrid();
}
export function updateCharts(t) {
  cursor = t;
  drawAll();
}
