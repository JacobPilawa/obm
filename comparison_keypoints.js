import {
  bandFor,
  onCohortChange,
  loadCohort,
  cohortState,
} from "./cohort_band.js";
import { FullBodyCharts } from "./full_body_charts.js";
import { plotBounds, rangeControls } from "./plot_range.js";
import * as THREE from "three";
import { sample } from "./biomechanics.js";
import { alignedTime } from "./comparison.js";
import { buildKeypointGroups } from "./keypoint_data.js";
import { keypointEvents } from "./chart_events.js";
import { drawChart } from "./keypoint_ui.js";
import { movieCardState } from "./keypoint_movie.js";

const valid = (point) =>
  Array.isArray(point) && point.length === 3 && point.every(Number.isFinite);
const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const categories = [
  ["core", "Essentials"],
  ["full", "Full body"],
  ["joints", "Joints and motion"],
  ["kinetics", "Forces and power"],
  ["raw", "Raw C3D markers"],
];
const valueText = (value, unit) =>
  Number.isFinite(value)
    ? `${value.toLocaleString(undefined, { maximumFractionDigits: unit === "m" ? 3 : 1 })} ${unit}`
    : "No sample";

export class ComparisonKeypoints {
  constructor(stage, { onFocus, onScrub, onVisual }) {
    this.stage = stage;
    this.onFocus = onFocus;
    this.onScrub = onScrub;
    this.onVisual = onVisual;
    onCohortChange(() => {
      if (cohortState().enabled)
        for (const entry of this.entries) loadCohort(entry.data);
      this.updateTime(this.playhead, this.primary, this.sync);
    });
    this.fullBodies = new Map();
    this.entries = [];
    this.primary = null;
    this.sync = "event";
    this.playhead = 0;
    this.inViewer = false;
    this.layoutContext = null;
    this.cardLayouts = new Map();
    this.cardSizes = new Map();
    this.layer = document.createElement("div");
    this.layer.className = "compareKeypointLayer";
    this.layer.hidden = true;
    stage.append(this.layer);
    this.dock = document.createElement("section");
    this.dock.className = "compareKeypointDock";
    this.dock.setAttribute("aria-label", "Selected comparison keypoint charts");
    this.dock.hidden = true;
    stage.after(this.dock);
    this.layer.addEventListener("click", (event) => {
      const button = event.target.closest("[data-comparison-point]");
      if (button)
        this.select(button.dataset.entry, button.dataset.comparisonPoint);
    });
    this.dock.addEventListener("click", (event) => {
      const close = event.target.closest("[data-compare-keypoint-close]"),
        visual = event.target.closest("[data-compare-keypoint-visual]");
      if (close) this.close(close.dataset.compareKeypointClose);
      else if (visual) {
        const entry = this.entry(visual.dataset.compareKeypointVisual),
          metric = this.metric(entry);
        if (entry && metric) this.onVisual(entry, metric);
      }
    });
    this.dock.addEventListener("change", (event) => {
      const events = event.target.closest("[data-compare-keypoint-events]");
      if (events) {
        this.entry(events.dataset.compareKeypointEvents).keypoints.showEvents =
          events.checked;
        this.updateTime(this.playhead, this.primary, this.sync);
        return;
      }
      const control = event.target.closest("[data-compare-keypoint-signal]");
      if (control)
        this.setMetric(control.dataset.compareKeypointSignal, control.value);
    });
    let scrubbing = null;
    const seek = (event) => {
      if (!scrubbing) return;
      const { canvas, entry, metric } = scrubbing,
        bounds = canvas.getBoundingClientRect();
      if (!bounds.width) return;
      const x = ((event.clientX - bounds.left) / bounds.width) * canvas.width,
        fraction = Math.max(0, Math.min(1, (x - 74) / (canvas.width - 102)));
      const range = plotBounds(metric, entry.data, entry.keypoints.range);
      this.onScrub(entry, range.min + fraction * (range.max - range.min));
    };
    this.dock.addEventListener("pointerdown", (event) => {
      const canvas = event.target.closest("[data-compare-keypoint-plot]");
      if (!canvas) return;
      const entry = this.entry(canvas.dataset.compareKeypointPlot),
        metric = this.metric(entry);
      if (!entry || !metric) return;
      scrubbing = { canvas, entry, metric };
      canvas.setPointerCapture(event.pointerId);
      seek(event);
      event.stopPropagation();
    });
    this.dock.addEventListener("pointermove", seek);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      this.dock.addEventListener(type, () => (scrubbing = null));
    let moving = null;
    this.dock.addEventListener("pointerdown", (event) => {
      const header = event.target.closest(".compareKeypointCard header");
      if (!this.inViewer || !header || event.target.closest("button")) return;
      const card = header.closest(".compareKeypointCard"),
        bounds = this.cardBounds(card.dataset.entry);
      moving = {
        card,
        header,
        x: event.clientX,
        y: event.clientY,
        left: card.offsetLeft - bounds.x,
        top: card.offsetTop - bounds.y,
      };
      header.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    });
    this.dock.addEventListener("pointermove", (event) => {
      if (!moving) return;
      const bounds = this.cardBounds(moving.card.dataset.entry),
        clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const x = clamp(
          moving.left + event.clientX - moving.x,
          8,
          Math.max(8, bounds.width - moving.card.offsetWidth - 8),
        ),
        y = clamp(
          moving.top + event.clientY - moving.y,
          8,
          Math.max(8, bounds.height - moving.card.offsetHeight - 8),
        );
      this.cardLayouts.set(this.layoutKey(moving.card.dataset.entry), { x, y });
      moving.card.style.left = `${bounds.x + x}px`;
      moving.card.style.top = `${bounds.y + y}px`;
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      this.dock.addEventListener(type, () => (moving = null));
  }
  entry(id) {
    return this.entries.find((entry) => entry.id === id);
  }
  state(entry) {
    return entry?.keypoints;
  }
  groups(entry) {
    const state = this.state(entry);
    if (!state) return [];
    if (!state.groups)
      state.groups = buildKeypointGroups(entry.data, entry.batSpeed);
    return state.groups;
  }
  selected(entry) {
    return this.groups(entry).find(
      (group) => group.id === this.state(entry)?.selected,
    );
  }
  metric(entry) {
    return this.selected(entry)?.metrics.find(
      (metric) => metric.id === this.state(entry)?.metricId,
    );
  }
  copySelection(source, target) {
    const state = this.state(target),
      selected = source.keypoints?.enabled ? this.selected(source) : null,
      signal = selected ? this.metric(source) : null;
    if (!state) return null;
    state.selected = null;
    state.metricId = null;
    if (!selected || !signal) return null;
    // Raw C3D marker order and physical left/right landmark names can differ.
    const group = this.groups(target).find((item) =>
      selected.categories.includes("raw")
        ? item.categories.includes("raw") && item.anchor === selected.anchor
        : item.id === selected.id,
    );
    const metric =
      group?.metrics.find((item) => item.id === signal.id) ||
      group?.metrics.find(
        (item) =>
          item.label === signal.label &&
          item.family === signal.family &&
          item.unit === signal.unit,
      );
    if (!metric) return null;
    state.selected = group.id;
    state.metricId = metric.id;
    return metric;
  }
  movieState() {
    const frame = this.stage.querySelector("#stage") || this.stage;
    return {
      inViewer: this.inViewer,
      entries: this.entries.map((entry) => {
        const {
            enabled,
            category,
            size,
            search,
            selected,
            metricId,
            showEvents,
            range,
          } = entry.keypoints,
          card = this.dock.querySelector(
            `[data-entry="${CSS.escape(entry.id)}"]`,
          );
        return {
          id: entry.id,
          range,
          fullBody: this.fullBodies.get(entry.id)?.movieState() || [],
          enabled,
          category,
          size,
          search,
          selected,
          metricId,
          showEvents,
          view: this.inViewer ? movieCardState(card, frame) : null,
        };
      }),
    };
  }
  setInViewer(enabled) {
    this.rememberCards();
    this.inViewer = !!enabled;
    this.dock.classList.toggle("inViewer", this.inViewer);
    if (this.inViewer) this.stage.append(this.dock);
    else this.stage.after(this.dock);
    this.renderCards(false);
  }
  layoutKey(id) {
    return `${this.layoutContext?.split ? "split" : "shared"}:${id}`;
  }
  cardBounds(id) {
    const stage = this.stage.getBoundingClientRect(),
      view = this.layoutContext?.split
        ? this.layoutContext.splitViewer?.views.find(
            (item) => item.entry.id === id,
          )
        : null,
      rect = view?.pane.getBoundingClientRect();
    return rect
      ? {
          x: rect.left - stage.left - this.stage.clientLeft,
          y: rect.top - stage.top - this.stage.clientTop,
          width: rect.width,
          height: rect.height,
        }
      : {
          x: 0,
          y: 0,
          width: this.stage.clientWidth,
          height: this.stage.clientHeight,
        };
  }
  rememberCards() {
    for (const card of this.dock.querySelectorAll(".compareKeypointCard")) {
      this.cardSizes.set(
        `${this.inViewer ? "viewer" : "row"}:${card.dataset.entry}`,
        { width: card.offsetWidth, height: card.offsetHeight },
      );
    }
  }
  layoutCards() {
    if (!this.inViewer || this.dock.hidden) return;
    [...this.dock.querySelectorAll(".compareKeypointCard")].forEach(
      (card, index) => {
        const bounds = this.cardBounds(card.dataset.entry),
          maxWidth = Math.max(1, bounds.width - 16),
          maxHeight = Math.max(1, bounds.height - 52);
        card.style.setProperty("--pane-max-width", `${maxWidth}px`);
        card.style.setProperty("--pane-max-height", `${maxHeight}px`);
        card.style.maxWidth = `${maxWidth}px`;
        card.style.maxHeight = `${maxHeight}px`;
        const saved = this.cardLayouts.get(this.layoutKey(card.dataset.entry)),
          split = this.layoutContext?.split;
        const x =
            saved?.x ??
            (split || index % 2 === 0
              ? bounds.width - card.offsetWidth - 10
              : 10),
          y =
            saved?.y ??
            (!split && index > 1 ? bounds.height - card.offsetHeight - 10 : 38);
        card.style.left = `${bounds.x + Math.max(8, Math.min(bounds.width - card.offsetWidth - 8, x))}px`;
        card.style.top = `${bounds.y + Math.max(8, Math.min(bounds.height - card.offsetHeight - 8, y))}px`;
      },
    );
  }
  setEntries(entries) {
    for (const [id, manager] of this.fullBodies)
      if (!entries.some((e) => e.id === id)) {
        manager.destroy();
        this.fullBodies.delete(id);
      }
    this.entries = entries;
    for (const entry of entries)
      if (entry.keypoints?.enabled) this.groups(entry);
    this.render();
  }
  setEnabled(id, enabled) {
    const entry = this.entry(id),
      state = this.state(entry);
    if (!state) return;
    state.enabled = !!enabled;
    if (state.enabled) {
      const groups = this.groups(entry);
      if (
        state.category !== "full" &&
        !groups.some((group) => group.categories.includes(state.category))
      )
        state.category = groups.some((group) =>
          group.categories.includes("core"),
        )
          ? "core"
          : "raw";
    } else this.close(id, false);
    this.render();
  }
  setCategory(id, category) {
    const entry = this.entry(id),
      state = this.state(entry);
    if (!state || !categories.some(([key]) => key === category)) return;
    state.category = category;
    this.close(id, false);
    this.render();
  }
  setSize(id, size) {
    const state = this.state(this.entry(id));
    if (!state) return;
    state.size = Math.max(0, Math.min(1.5, Number(size) / 100));
    this.renderHotspots();
  }
  setSearch(id, query) {
    const state = this.state(this.entry(id));
    if (!state) return;
    state.search = query;
    this.renderHotspots();
  }
  select(id, groupId) {
    const entry = this.entry(id),
      state = this.state(entry),
      group = this.groups(entry).find((item) => item.id === groupId);
    if (!state?.enabled || !group?.metrics.length) return;
    state.selected = group.id;
    state.metricId = group.metrics[0].id;
    this.onFocus(id, group.metrics[0].focus || "none");
    this.render();
  }
  setMetric(id, metricId) {
    const entry = this.entry(id),
      state = this.state(entry),
      metric = this.selected(entry)?.metrics.find(
        (item) => item.id === metricId,
      );
    if (!metric || !state) return;
    state.metricId = metric.id;
    this.onFocus(id, metric.focus || "none");
    this.renderCards();
  }
  close(id, render = true, clearFocus = true) {
    const entry = this.entry(id),
      state = this.state(entry);
    if (!state) return;
    const hadSelection = !!state.selected;
    state.selected = null;
    state.metricId = null;
    if (hadSelection && clearFocus) this.onFocus(id, "none");
    if (render) this.render();
  }
  render() {
    this.renderHotspots();
    this.renderCards();
    this.mountFullBodyControls();
  }
  fullBodyManager(entry) {
    let manager = this.fullBodies.get(entry.id);
    if (!manager) {
      manager = new FullBodyCharts(
        this.stage,
        entry.data,
        (t) => this.onScrub(entry, t),
        () => this.cardBounds(entry.id),
      );
      this.fullBodies.set(entry.id, manager);
    }
    return manager;
  }
  copyFullBodySettings(source, target) {
    const from = this.fullBodies.get(source.id);
    if (!from && !this.fullBodies.has(target.id)) return;
    const manager = this.fullBodyManager(target);
    manager.setEnabled(target.keypoints.enabled);
    manager.applySettings(from?.settings() || []);
    manager.menu.hidden = target.keypoints.category !== "full";
  }
  mountFullBodyControls() {
    for (const entry of this.entries) {
      if (!this.fullBodies.has(entry.id) && entry.keypoints.category !== "full")
        continue;
      const manager = this.fullBodyManager(entry);
      manager.setEnabled(entry.keypoints.enabled);
      manager.menu.hidden = entry.keypoints.category !== "full";
      const select = [
        ...document.querySelectorAll("[data-compare-keypoint-category]"),
      ].find((node) => node.dataset.id === entry.id);
      if (select)
        select.closest(".compareKeypointControls").append(manager.menu);
    }
  }
  renderHotspots() {
    const entries = this.entries.filter((entry) => entry.keypoints?.enabled);
    this.layer.hidden = !entries.length;
    this.layer.innerHTML = entries
      .map((entry) => {
        const state = entry.keypoints;
        if (!state.size) return "";
        const query =
          state.category === "raw"
            ? (state.search || "").trim().toLowerCase()
            : "";
        return this.groups(entry)
          .filter(
            (group) =>
              group.categories.includes(state.category) &&
              (!query || group.label.toLowerCase().includes(query)),
          )
          .map(
            (group) =>
              `<button type="button" class="compareKeypointHotspot" data-entry="${escapeHTML(entry.id)}" data-comparison-point="${escapeHTML(group.id)}" aria-label="${escapeHTML(entry.data.entry.discipline === "pitching" ? "Pitch" : "Swing")} ${escapeHTML(entry.data.entry.id)} · ${escapeHTML(group.label)}" aria-pressed="${state.selected === group.id}" title="${escapeHTML(group.label)}" style="--trial-color:${entry.keypointColor};--point-scale:${state.size}"><span></span></button>`,
          )
          .join("");
      })
      .join("");
  }
  renderCards(remember = true) {
    if (remember) this.rememberCards();
    const entries = this.entries.filter(
      (entry) => entry.keypoints?.enabled && this.metric(entry),
    );
    this.dock.hidden = !entries.length;
    this.dock.innerHTML = entries
      .map((entry) => {
        const group = this.selected(entry),
          metric = this.metric(entry),
          families = [...new Set(group.metrics.map((item) => item.family))],
          label =
            entry.data.entry.discipline === "pitching" ? "Pitch" : "Swing",
          action =
            {
              com: "Show center of mass",
              axis: "Show trunk axis",
              braking: "Show lead-leg force",
              knee: "Show knee extension",
            }[metric.visualAction] ||
            (metric.mapMode
              ? "Color skeleton by this signal"
              : metric.visualAction === "armSweep"
                ? "Show elbow-moment sweep"
                : metric.visualAction === "batSweep"
                  ? "Show bat-speed sweep"
                  : metric.visualAction === "plateArrows"
                    ? "Show force plate arrows"
                    : "");
        return `<article class="compareKeypointCard" data-entry="${escapeHTML(entry.id)}" style="--trial-color:${entry.keypointColor}"><header><span class="compareKeypointCardDot"></span><strong>${escapeHTML(label)} ${escapeHTML(entry.data.entry.id)} · ${escapeHTML(group.label)}</strong><button type="button" data-compare-keypoint-close="${escapeHTML(entry.id)}" aria-label="Close ${escapeHTML(label)} ${escapeHTML(entry.data.entry.id)} keypoint chart">×</button></header><label>Signal<select data-compare-keypoint-signal="${escapeHTML(entry.id)}">${families
          .map(
            (family) =>
              `<optgroup label="${escapeHTML(family)}">${group.metrics
                .filter((item) => item.family === family)
                .map(
                  (item) =>
                    `<option value="${escapeHTML(item.id)}" ${item.id === metric.id ? "selected" : ""}>${escapeHTML(item.label)}</option>`,
                )
                .join("")}</optgroup>`,
          )
          .join(
            "",
          )}</select></label><div class="compareKeypointLive"><strong data-keypoint-value="${escapeHTML(entry.id)}">—</strong><span data-keypoint-local-time="${escapeHTML(entry.id)}"></span></div><label class="keypointEventsToggle" title="Show all available released event timestamps"><input type="checkbox" data-compare-keypoint-events="${escapeHTML(entry.id)}" ${entry.keypoints.showEvents ? "checked" : ""}>Show more key moments</label><canvas data-compare-keypoint-plot="${escapeHTML(entry.id)}" width="640" height="308" aria-label="${escapeHTML(metric.label)} over recording time; drag to scrub all replays"></canvas><div class="compareKeypointFoot"><span>${escapeHTML(metric.source)}</span>${action ? `<button type="button" data-compare-keypoint-visual="${escapeHTML(entry.id)}">${escapeHTML(action)}</button>` : ""}</div><details><summary>Definition</summary><p>${escapeHTML(metric.definition)}</p><small>${escapeHTML(metric.family)} · ${escapeHTML(metric.unit)}${metric.focus ? " · 3D pose guide" : ""}</small></details></article>`;
      })
      .join("");
    for (const card of this.dock.querySelectorAll(".compareKeypointCard")) {
      const entry = this.entry(card.dataset.entry);
      entry.keypoints.range ??= {};
      card
        .querySelector("canvas")
        .before(
          rangeControls(
            entry.data,
            this.metric(entry),
            entry.keypoints.range,
            () => this.updateTime(this.playhead, this.primary, this.sync),
          ),
        );
      const size = this.cardSizes.get(
        `${this.inViewer ? "viewer" : "row"}:${card.dataset.entry}`,
      );
      if (size?.width && size?.height) {
        card.style.width = `${size.width}px`;
        card.style.height = `${size.height}px`;
      }
    }
    this.layoutCards();
    this.updateTime(this.playhead, this.primary, this.sync);
  }
  updateTime(playhead, primary, sync) {
    this.playhead = playhead;
    this.primary = primary;
    this.sync = sync;
    if (!primary) return;
    for (const entry of this.entries)
      this.fullBodies
        .get(entry.id)
        ?.update(alignedTime(playhead, primary, entry.data, sync));
    if (this.dock.hidden) return;
    for (const entry of this.entries) {
      if (!entry.keypoints?.enabled) continue;
      const metric = this.metric(entry);
      if (!metric) continue;
      const canvas = this.dock.querySelector(
        `[data-compare-keypoint-plot="${CSS.escape(entry.id)}"]`,
      );
      if (!canvas) continue;
      const local = alignedTime(playhead, primary, entry.data, sync),
        rect = canvas.getBoundingClientRect(),
        width = Math.max(320, Math.round(rect.width * 2)),
        height = Math.max(180, Math.round(rect.height * 2));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const current = this.dock.querySelector(
          `[data-keypoint-value="${CSS.escape(entry.id)}"]`,
        ),
        at = this.dock.querySelector(
          `[data-keypoint-local-time="${CSS.escape(entry.id)}"]`,
        );
      current.textContent = valueText(sample(metric, local), metric.unit);
      at.textContent = `${local.toFixed(3)} s`;
      drawChart(
        canvas,
        metric,
        local,
        keypointEvents(entry.data, entry.keypoints.showEvents),
        entry.keypointColor,
        plotBounds(metric, entry.data, entry.keypoints.range),
        { bands: [bandFor(entry.data, `key:${metric.id}`)] },
      );
    }
  }
  position({ split, viewer, splitViewer, camera }) {
    this.layoutContext = { split, viewer, splitViewer, camera };
    this.layoutCards();
    for (const manager of this.fullBodies.values()) manager.layout();
    if (this.layer.hidden || !viewer) return;
    const layerRect = this.layer.getBoundingClientRect();
    if (!layerRect.width || !layerRect.height) return;
    for (const button of this.layer.querySelectorAll(
      "[data-comparison-point]",
    )) {
      const entry = this.entry(button.dataset.entry),
        part = viewer.parts.get(entry?.id),
        group = this.groups(entry).find(
          (item) => item.id === button.dataset.comparisonPoint,
        ),
        view = split
          ? splitViewer?.views.find((item) => item.entry.id === entry.id)
          : null,
        cam = view?.camera || camera,
        bounds = view?.pane.getBoundingClientRect() || layerRect,
        local = part?.currentMap,
        point =
          group?.fixedPoint ||
          (group?.categories.includes("raw")
            ? viewer.rawKeypoint(entry.id, group.anchor)
            : local?.[group?.anchor]);
      if (!valid(point) || !part || !cam || (split && !view)) {
        button.hidden = true;
        continue;
      }
      cam.updateMatrixWorld();
      const world = new THREE.Vector3(...point).add(part.group.position),
        forward = new THREE.Vector3();
      cam.getWorldDirection(forward);
      if (world.clone().sub(cam.position).dot(forward) <= 0) {
        button.hidden = true;
        continue;
      }
      const projected = world.project(cam);
      if (
        projected.z < -1 ||
        projected.z > 1 ||
        Math.abs(projected.x) > 1.02 ||
        Math.abs(projected.y) > 1.02
      ) {
        button.hidden = true;
        continue;
      }
      const offset = split ? 0 : entry.colorIndex % 2 ? 6 : -6,
        offsetY = split ? 0 : entry.colorIndex < 2 ? -6 : 6;
      button.hidden = false;
      button.style.left = `${bounds.left - layerRect.left + ((projected.x + 1) * bounds.width) / 2 + offset}px`;
      button.style.top = `${bounds.top - layerRect.top + ((1 - projected.y) * bounds.height) / 2 + offsetY}px`;
    }
    // Native CSS card resizing changes the canvas box without changing time.
    for (const canvas of this.dock.querySelectorAll("canvas")) {
      const rect = canvas.getBoundingClientRect();
      if (
        Math.abs(canvas.width - rect.width * 2) > 2 ||
        Math.abs(canvas.height - rect.height * 2) > 2
      ) {
        this.updateTime(this.playhead, this.primary, this.sync);
        break;
      }
    }
  }
}
