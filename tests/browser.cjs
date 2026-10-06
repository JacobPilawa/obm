const { chromium } = require("playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs");
const origin = process.env.OBM_TEST_URL || "http://127.0.0.1:8773";
fs.mkdirSync(__dirname + "/results", { recursive: true });
(async () => {
  const browser = await chromium.launch({
      ...(process.env.OBM_CHROME
        ? { executablePath: process.env.OBM_CHROME }
        : {}),
      headless: true,
      args: ["--enable-unsafe-swiftshader"],
    }),
    page = await browser.newPage({ viewport: { width: 1700, height: 1100 } }),
    errors = [],
    checks = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.waitForFunction(
    () => window.__movieReady?.(),
    {},
    { timeout: 60000 },
  );
  const seek = async (fraction) =>
    page.evaluate((f) => {
      const el = document.querySelector("#timeline");
      el.value = Number(el.min) + f * (el.max - el.min);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, fraction);
  const pick = async (id) => {
    await page.locator("#search").fill(id.split(":").at(-1));
    await page.locator(`[data-id="${id}"].catalogItem`).click();
    await page.waitForFunction(
      (id) => window.__movieSnapshot().primary === id,
      id,
      { timeout: 60000 },
    );
  };
  await page.locator("#filterButton").click();
  await page.locator("#moreSort summary").click();
  await page.locator("#moreSortSearch").fill("knee");
  assert.ok(await page.locator("[data-sort-metric]").count());
  await page.locator("[data-sort-metric]").first().click();
  assert.match(await page.locator("#sortFilter").inputValue(), /knee/);
  await page.locator("#clearFilters").click();
  await page.locator("#filterButton").click();
  checks.push("Additional POI sorting");
  await page
    .locator("#soloDisplayLayers summary")
    .filter({ hasText: "Body display" })
    .click();
  assert.equal(
    await page.locator("#showSolid").getAttribute("role"),
    "checkbox",
  );
  await page.locator("#showSolid").click();
  assert.equal(
    await page.locator("#showSolid").getAttribute("aria-checked"),
    "false",
  );
  await page.locator("#showSolid").press("Space");
  assert.equal(
    await page.locator("#showSolid").getAttribute("aria-checked"),
    "true",
  );
  await page.keyboard.press("Escape");
  checks.push("Checkbox menus and keyboard toggles");
  await page.locator("#showPowerMap").click();
  await page.locator("#powerMode").selectOption("angular");
  assert.ok(await page.locator("#powerLegend").isVisible());
  await page.locator("#showPowerMap").click();
  checks.push("Pitching angular speed overlay restored");
  await seek(0.82);
  await page.locator("#keypointModeButton").click();
  await page.locator(".keypointHotspot:not([hidden])").first().click();
  await page.locator("#keypointMoreEvents").check();
  await page.locator("#movieInfoBoxes").check();
  let snapshot = await page.evaluate(() => window.__movieSnapshot());
  assert.ok(snapshot.keypointCharts.solo.showEvents);
  await page.screenshot({ path: __dirname + "/results/keypoints.png" });
  checks.push("Solo keypoint event checkbox and export snapshot");
  await page.locator("#keypointCardClose").click();
  await page.locator("#keypointModeButton").click();
  await page.locator("#chartGrid").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const legends = () =>
    page.locator("#chartGrid .chartLegend").evaluateAll((nodes) =>
      nodes.map((n) => ({
        height: n.getBoundingClientRect().height,
        rows: [...n.children].map((c) => c.getBoundingClientRect().height),
      })),
    );
  const before = await legends();
  for (const t of [0, 0.2, 0.45, 0.8, 0.92, 1]) {
    await seek(t);
    assert.deepEqual(await legends(), before);
  }
  checks.push("Stable legend heights throughout playback");
  await page.screenshot({ path: __dirname + "/results/charts.png" });
  await page.locator("#compareModeButton").click();
  await page.locator("#search").fill("1097_1");
  await page
    .locator('.catalogItem[data-id="pitching:processed:1097_1"]')
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".compareTrialCard").length === 2,
    {},
    { timeout: 60000 },
  );
  const card = page.locator(".compareTrialCard").first();
  await card.locator("[data-compare-keypoints]").click();
  await seek(0.8);
  await page.locator("[data-comparison-point]:not([hidden])").first().click();
  await page.locator("[data-compare-keypoint-events]").first().check();
  await page.locator("#compareKeypointInViewer").click();
  snapshot = await page.evaluate(() => window.__movieSnapshot());
  assert.ok(
    snapshot.keypointCharts.comparison.entries.some((e) => e.showEvents),
  );
  await page.locator("#compareSplit").click();
  assert.equal(await page.locator("[data-compare-snap]:enabled").count(), 2);
  await card.locator("[data-compare-snap]").click();
  await page.screenshot({ path: __dirname + "/results/compare.png" });
  checks.push("Comparison controls, event panels, split cameras");
  // Exercise four replays and independently toggled body layers.
  for (const id of ["pitching:processed:1250_1", "pitching:processed:1313_1"]) {
    await page.locator("#search").fill(id.split(":").at(-1));
    await page.locator(`.catalogItem[data-id="${id}"]`).click();
    await page.waitForFunction(
      (id) => window.__movieSnapshot().entries.some((e) => e.id === id),
      id,
      { timeout: 60000 },
    );
  }
  assert.equal(await page.locator(".compareTrialCard").count(), 4);
  await page.screenshot({ path: __dirname + "/results/compare_four.png" });
  checks.push("Four-replay comparison preserved");
  await page.locator("#compareModeButton").click();
  await page.locator("#hittingTab").click();
  await page.locator("#search").fill("");
  await pick("hitting:processed:6_1");
  await seek(0.8);
  await page.locator("#keypointModeButton").click();
  await page.locator(".keypointHotspot:not([hidden])").first().click();
  assert.ok(await page.locator("#keypointMoreEvents").isChecked());
  await page.screenshot({ path: __dirname + "/results/hitting.png" });
  checks.push("Hitting viewer and keypoints");
  await page.locator("#compareModeButton").click();
  await page.locator("#search").fill("8_1");
  await page.locator('.catalogItem[data-id="hitting:processed:8_1"]').click();
  await page.waitForFunction(
    () => document.querySelectorAll(".compareTrialCard").length === 2,
    {},
    { timeout: 60000 },
  );
  await page.locator("#compareSplit").click();
  checks.push("Hitting comparison");
  await page.locator("#compareModeButton").click();
  await page.locator("#performanceTab").click();
  await page.waitForFunction(
    () => document.querySelectorAll("#hpMetric option").length > 30,
    {},
    { timeout: 60000 },
  );
  assert.ok((await page.locator("#hpMetric option").count()) > 30);
  await page.screenshot({ path: __dirname + "/results/high_performance.png" });
  checks.push("High-performance explorer and full metric list");
  await page.locator("#pitchingTab").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#trialTitle").textContent.startsWith("Pitch "),
    {},
    { timeout: 60000 },
  );
  await page.setViewportSize({ width: 1150, height: 900 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: __dirname + "/results/narrow.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  checks.push("Narrow desktop layout");
  const catalog = await (
    await page.request.get(origin + "/api/catalog")
  ).json();
  for (const status of ["raw-only", "static-model", "processed-only"]) {
    await page.locator("#hittingTab").click();
    const entry = catalog.entries.find(
      (e) => e.discipline === "hitting" && e.status === status,
    );
    await page.locator("#search").fill(entry.processed_key || entry.filename);
    await page.locator(`.catalogItem[data-id="${entry.id}"]`).click();
    await page.waitForFunction(
      (id) => window.__movieSnapshot().primary === id,
      entry.id,
      { timeout: 60000 },
    );
    await seek(0.5);
    assert.ok(
      !/Loading|Could not/.test(
        await page.locator("#trialTitle").textContent(),
      ),
    );
  }
  checks.push("Raw-only, calibration, and processed-only UI paths");
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    __dirname + "/results/browser.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
