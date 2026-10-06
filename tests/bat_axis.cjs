const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const origin = process.env.OBM_TEST_URL || "http://127.0.0.1:8773";
(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.OBM_CHROME ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1050 },
    });
    const errors = [],
      requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.url().includes("/assets/bat/")) requests.push(r.url());
    });
    await page.route("**/app.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body:
          (await response.text()) +
          `
window.__batAxisDebug=()=>({id:trial.entry.id,bat:batMesh?.loaded,batVisible:batMesh?.visible,batScale:batMesh?.scale.x,axis:soloMotionVisuals?.axis.visible,compare:[...compareViewer.parts.values()].map(p=>({id:p.entry.id,bat:p.bat.loaded,visible:p.bat.visible,axis:p.motionVisuals.axis.visible,pose:p.poseTime,local:alignedTime(time,trial,p.data,compareSync)}))});
window.__batCloseup=()=>{const target=batMesh.localToWorld(new THREE.Vector3(0,.5,0));controls.target.copy(target);camera.position.copy(target).add(new THREE.Vector3(.5,-1.2,.5));camera.lookAt(target);controls.update();invalidateViewer();};`,
      });
    });
    await page.goto(origin);
    await page.waitForFunction(() => window.__movieReady?.());
    assert.equal(requests.length, 0, "Pitching does not load bat assets");
    await page.locator("#hittingTab").click();
    await page.locator("#search").fill("6_1");
    await page.locator('.catalogItem[data-id="hitting:processed:6_1"]').click();
    await page.waitForFunction(
      () =>
        window.__batAxisDebug().id === "hitting:processed:6_1" &&
        window.__batAxisDebug().bat,
    );
    const bodyMenu = page
      .locator(".layerMenu")
      .filter({ has: page.locator("#showTrunkAxis") });
    await bodyMenu.locator("summary").click();
    await page.locator("#showTrunkAxis").click();
    await bodyMenu.locator("summary").click();
    const seek = async (fraction) =>
      page.evaluate((fraction) => {
        const slider = document.querySelector("#timeline");
        slider.value =
          Number(slider.min) + fraction * (slider.max - slider.min);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      }, fraction);
    for (const fraction of [0, 0.5, 1]) {
      await seek(fraction);
      assert.ok(
        (await page.evaluate(() => window.__batAxisDebug())).axis,
        "Solo trunk axis visible throughout the timeline",
      );
    }
    await seek(0.7);
    const solo = await page.evaluate(() => window.__batAxisDebug());
    assert.ok(solo.batVisible);
    assert.ok(Math.abs(solo.batScale - 34 * 0.0254) < 1e-9);
    fs.mkdirSync(__dirname + "/results", { recursive: true });
    await page
      .locator(".stageWrap")
      .screenshot({ path: __dirname + "/results/realistic-bat-hitter.png" });
    await page.evaluate(() => window.__batCloseup());
    await page
      .locator(".stageWrap")
      .screenshot({ path: __dirname + "/results/realistic-bat-closeup.png" });
    await page.locator("#compareModeButton").click();
    await page.locator("#search").fill("8_1");
    await page.locator('.catalogItem[data-id="hitting:processed:8_1"]').click();
    await page.waitForFunction(
      () =>
        window.__batAxisDebug().compare.length === 2 &&
        window.__batAxisDebug().compare.every((p) => p.bat),
    );
    const card = page.locator(".compareTrialCard").first();
    const menu = card
      .locator(".layerMenu")
      .filter({ has: page.locator('[data-compare-option="axis"]') });
    await menu.locator("summary").click();
    const axis = card.locator('[data-compare-option="axis"]');
    if ((await axis.getAttribute("aria-pressed")) !== "true")
      await axis.click();
    await card.locator('[data-compare-option="bones"]').click();
    for (const key of ["thick", "thin", "joints"]) {
      const button = card.locator(`[data-compare-option="${key}"]`);
      if ((await button.getAttribute("aria-pressed")) === "true")
        await button.click();
    }
    await menu.locator("summary").click();
    await card.locator("[data-compare-match]").click();
    await page.locator("#compareSplit").click();
    let held = false;
    for (const fraction of [0, 0.5, 1]) {
      await seek(fraction);
      const parts = (await page.evaluate(() => window.__batAxisDebug()))
        .compare;
      assert.ok(
        parts.every((p) => p.axis && p.visible),
        "Comparison axis and bone-only bats visible through both boundaries",
      );
      held ||= parts.some((p) => p.local < 0 || p.local > p.pose);
    }
    assert.ok(held, "Aligned comparison exercises an endpoint hold");
    assert.equal(
      requests.length,
      5,
      "Fixed bat assets reused across trials, without recording preloads",
    );
    const snapshot = await page.evaluate(() => window.__movieSnapshot());
    const movie = await browser.newPage({
      viewport: { width: 1200, height: 800 },
    });
    await movie.goto(origin);
    await movie.waitForFunction(() => window.__movieReady?.());
    await movie.evaluate((s) => window.__prepareMovie(s), snapshot);
    assert.ok(await movie.evaluate(() => window.__renderMovieFrame(0)));
    await movie.close();
    const cleanup = await page.evaluate(async () => {
      const { BaseballBat } = await import("/baseball_bat.js");
      const a = new BaseballBat({ entry: { discipline: "hitting" } });
      a.dispose();
      await a.load();
      return !a.loaded && a.mesh.geometry.type === "LatheGeometry";
    });
    assert.ok(
      cleanup,
      "Disposed pending bat loads do not recreate GPU objects",
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          checks: [
            "No bat downloads for pitchers",
            "Realistic 34-inch bat",
            "Solo axis at start/middle/end",
            "Aligned comparison axis at both boundaries",
            "Bats visible with anatomical bones alone",
            "Shared fixed model assets",
            "Movie preparation awaits textures",
            "Pending bat disposal",
          ],
          errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
