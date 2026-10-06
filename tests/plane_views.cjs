const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
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
    const errors = [];
    const attach = async (page) => {
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/app.js", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body:
            (await response.text()) +
            `
window.__planeDebug=()=>({id:trial.entry.id,compare:compareEntries.length,bounds:planeMotionBounds,cameras:planeCameras.map(v=>({position:v.camera.position.toArray(),target:v.target.toArray(),matrix:v.camera.matrixWorld.toArray(),projection:v.camera.projectionMatrix.toArray(),span:v.halfHeight})),controls:planeCameras.some(v=>!!v.controls)});
window.__planeSweep=()=>{ensurePlaneFrames();const initial=JSON.stringify(window.__planeDebug().cameras);const {min,max}=playbackBounds();for(let i=0;i<=30;i++){time=min+(max-min)*i/30;updateTimeline();renderMovieViewer();if(initial!==JSON.stringify(window.__planeDebug().cameras))throw Error('Plane cameras followed motion');}return window.__planeDebug();};
`,
        });
      });
    };
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1050 },
    });
    await attach(page);
    await page.goto(origin);
    await page.waitForFunction(() => window.__movieReady?.());
    await page.locator("#planeViewsToggle").click();
    await page.waitForFunction(() => window.__planeDebug().bounds);
    const pitch = await page.evaluate(() => window.__planeSweep());
    assert.equal(pitch.controls, false);
    assert.equal(await page.locator(".planeView button").count(), 0);
    assert.equal(
      await page
        .locator(".planeViews")
        .evaluate((e) => getComputedStyle(e).pointerEvents),
      "none",
    );
    const assertTight = (state) => {
      for (const [i, axes] of [
        [0, [0, 1]],
        [1, [1, 2]],
        [2, [0, 2]],
      ]) {
        const maxExtent = Math.max(
          ...axes.map((a) => state.bounds.max[a] - state.bounds.min[a]),
        );
        const occupancy = maxExtent / (2 * state.cameras[i].span);
        assert.ok(
          occupancy > 0.93 && occupancy < 0.95,
          "Motion tightly fits its fixed frame",
        );
      }
    };
    assertTight(pitch);
    await page.locator("#hittingTab").click();
    await page.locator("#search").fill("6_1");
    await page.locator('.catalogItem[data-id="hitting:processed:6_1"]').click();
    await page.waitForFunction(
      () => window.__planeDebug().id === "hitting:processed:6_1",
    );
    const hit = await page.evaluate(() => window.__planeSweep());
    assertTight(hit);
    assert.notDeepEqual(
      pitch.cameras,
      hit.cameras,
      "New recording gets a fresh frame",
    );
    const before = hit.cameras;
    await page.locator("#planeViewsToggle").click();
    await page.locator("#planeViewsToggle").click();
    await page.locator("#cameraPreset").selectOption("front");
    assert.deepEqual(
      (await page.evaluate(() => window.__planeSweep())).cameras,
      before,
      "Main camera and toggling do not move plane cameras",
    );
    await page.setViewportSize({ width: 1400, height: 900 });
    assert.deepEqual(
      (await page.evaluate(() => window.__planeSweep())).cameras,
      before,
      "Resize preserves square plane framing",
    );
    await page.locator("#compareModeButton").click();
    await page.locator("#search").fill("8_1");
    await page.locator('.catalogItem[data-id="hitting:processed:8_1"]').click();
    await page.waitForFunction(() => window.__planeDebug().compare === 2);
    assertTight(await page.evaluate(() => window.__planeSweep()));
    await page.locator("#comparePosition").selectOption("lab");
    const comparison = await page.evaluate(() => window.__planeSweep());
    assertTight(comparison);
    const snapshot = await page.evaluate(() => window.__movieSnapshot());
    const movie = await browser.newPage({
      viewport: { width: 1400, height: 900 },
    });
    await attach(movie);
    await movie.goto(origin);
    await movie.waitForFunction(() => window.__movieReady?.());
    await movie.evaluate((s) => window.__prepareMovie(s), snapshot);
    await movie.evaluate(() => window.__renderMovieFrame(0));
    const exportState = await movie.evaluate(() => window.__planeSweep());
    assert.deepEqual(
      exportState.cameras,
      comparison.cameras,
      "Movie uses identical fixed plane framing",
    );
    await movie.close();
    fs.mkdirSync(__dirname + "/results", { recursive: true });
    await page
      .locator(".stageWrap")
      .screenshot({ path: __dirname + "/results/fixed-plane-views.png" });
    snapshot.width = 800;
    snapshot.height = 600;
    snapshot.pixelWidth = 320;
    snapshot.pixelHeight = 240;
    const submission = await page.request.post(origin + "/api/video-exports", {
      data: snapshot,
    });
    assert.equal(submission.status(), 202);
    const job = await submission.json();
    let finished;
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      finished = await (
        await page.request.get(origin + "/api/video-exports/" + job.id)
      ).json();
      if (finished.status === "failed") throw Error(finished.error);
      if (finished.status === "completed") break;
      await page.waitForTimeout(500);
    }
    assert.equal(finished.status, "completed");
    const output = __dirname + "/results/fixed-plane-views.mp4";
    fs.writeFileSync(
      output,
      await (
        await page.request.get(
          origin + "/api/video-exports/" + job.id + "/download",
        )
      ).body(),
    );
    const probe = JSON.parse(
      execFileSync(
        "/opt/homebrew/bin/ffprobe",
        [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=codec_name,pix_fmt,avg_frame_rate,nb_frames",
          "-of",
          "json",
          output,
        ],
        { encoding: "utf8" },
      ),
    ).streams[0];
    assert.equal(probe.codec_name, "h264");
    assert.equal(probe.avg_frame_rate, "60/1");
    assert.ok(Number(probe.nb_frames) > 60);
    assert.deepEqual(errors, []);
    console.log(
      "Fixed planes: pitching/hitting, full-motion fit, stable scrubbing/toggles/resize/main camera, comparison alignment, movie framing, complete 60 fps export:",
      probe,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
