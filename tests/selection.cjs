const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1700, height: 1100 },
    });
    await page.route("**/app.js", async (route) => {
      const r = await route.fetch();
      let source = await r.text();
      source =
        `const measures=[];window.__selectionMeasures=measures;function measured(name,fn){const t=performance.now();const result=fn();measures.at(-1)?.phases.push([name,performance.now()-t]);return result;}\n` +
        source;
      source = source.replace(
        "async function selectTrial(id) {",
        "async function selectTrial(id) {\n const measure={id,start:performance.now(),phases:[]};measures.push(measure);",
      );
      source = source.replace(
        "trial = data;",
        'measure.phases.push(["fetch/parse",performance.now()-measure.start]);trial = data;',
      );
      source = source.replace(
        "    populateTrial();",
        '    measured("populate total",populateTrial);measure.total=performance.now()-measure.start;',
        1,
      );
      source = source.replace(
        "powerState = buildPowerOverlay(trial);",
        'powerState = measured("power overlay",()=>buildPowerOverlay(trial));',
      );
      source = source.replace(
        "keypointExplorer?.setTrial(trial, liveBatSpeed);",
        'measured("keypoints",()=>keypointExplorer?.setTrial(trial, liveBatSpeed));',
      );
      source = source.replace(
        "  renderPitchReport();",
        '  measured("report",renderPitchReport);',
      );
      source = source.replace(
        "  setChartTrial(trial);",
        '  measured("chart specs",()=>setChartTrial(trial));',
      );
      source = source.replace(
        "    buildGround();",
        '    measured("ground",buildGround);',
      );
      source = source.replace(
        "    buildDynamic();",
        '    measured("scene",buildDynamic);',
      );
      await route.fulfill({ response: r, body: source });
    });
    await page.goto(process.env.OBM_TEST_URL || "http://127.0.0.1:8773/");
    await page.waitForFunction(
      () => window.__movieReady?.(),
      {},
      { timeout: 60000 },
    );
    for (const id of ["1097_1", "1313_1", "1097_1", "1313_1"]) {
      await page.locator("#search").fill(id);
      await page
        .locator(`.catalogItem[data-id="pitching:processed:${id}"]`)
        .click();
      await page.waitForFunction(
        (id) => window.__movieSnapshot().primary === `pitching:processed:${id}`,
        id,
        { timeout: 60000 },
      );
    }
    const result = await page.evaluate(() => window.__selectionMeasures);
    require("node:fs").mkdirSync(__dirname + "/results", { recursive: true });
    require("node:fs").writeFileSync(
      __dirname + "/results/selection.json",
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
