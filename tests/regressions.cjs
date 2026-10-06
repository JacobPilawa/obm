const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const origin = process.env.OBM_TEST_URL || "http://127.0.0.1:8773";

(async () => {
  const browser = await chromium.launch({
    ...(process.env.OBM_CHROME
      ? { executablePath: process.env.OBM_CHROME }
      : {}),
    headless: true,
    args: ["--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1700, height: 1100 },
    });
    await page.addInitScript(() => {
      window.__gpuDrawCalls = 0;
      for (const type of [WebGLRenderingContext, WebGL2RenderingContext]) {
        for (const key of [
          "drawElements",
          "drawArrays",
          "drawElementsInstanced",
          "drawArraysInstanced",
        ]) {
          const original = type.prototype[key];
          if (typeof original === "function")
            type.prototype[key] = function (...args) {
              window.__gpuDrawCalls++;
              return original.apply(this, args);
            };
        }
      }
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(
      () => window.__movieReady?.(),
      {},
      { timeout: 60000 },
    );
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);
    const idleStart = await page.evaluate(() => window.__gpuDrawCalls);
    await page.waitForTimeout(500);
    assert.equal(
      await page.evaluate(() => window.__gpuDrawCalls),
      idleStart,
      "Paused scene should not redraw continuously",
    );
    const seek = async (fraction) =>
      page.evaluate((f) => {
        const slider = document.querySelector("#timeline");
        slider.value = Number(slider.min) + f * (slider.max - slider.min);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      }, fraction);
    await seek(0.7);
    await page.waitForFunction(
      (before) => window.__gpuDrawCalls > before,
      idleStart,
    );
    await page.locator("#playButton").click();
    const playingStart = await page.evaluate(() => window.__gpuDrawCalls);
    await page.waitForFunction(
      (before) => window.__gpuDrawCalls > before + 50,
      playingStart,
    );
    await page.locator("#playButton").click();
    await page.locator("#cohortBands").click();
    await page.waitForFunction(
      () =>
        /athletes/.test(document.querySelector("#cohortStatus").textContent),
      {},
      { timeout: 60000 },
    );
    const band = await page.evaluate(async () => {
      const { bandFor } = await import("/cohort_band.js");
      const data = await (
        await fetch(
          "/api/trial?id=" +
            encodeURIComponent(window.__movieSnapshot().primary),
        )
      ).json();
      return bandFor(data, "chart:report_arm_positions:Elbow flexion");
    });
    assert.ok(band && band.time.length === 401);
    await page.locator("#cohortBands").click();

    // A slower prior selection must not overwrite a later selection or enter comparison mid-load.
    await page.route("**/api/trial*", async (route) => {
      if (
        new URL(route.request().url()).searchParams.get("id") ===
        "pitching:processed:1097_1"
      ) {
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      await route.continue().catch(() => {});
    });
    await page.locator("#search").fill("1097_1");
    await page
      .locator('.catalogItem[data-id="pitching:processed:1097_1"]')
      .click();
    assert.equal(await page.locator("#compareModeButton").isDisabled(), true);
    await page.locator("#search").fill("1313_1");
    await page
      .locator('.catalogItem[data-id="pitching:processed:1313_1"]')
      .click();
    await page.waitForFunction(
      () => window.__movieSnapshot().primary === "pitching:processed:1313_1",
      {},
      { timeout: 60000 },
    );
    await page.waitForTimeout(800);
    assert.equal(
      await page.evaluate(() => window.__movieSnapshot().primary),
      "pitching:processed:1313_1",
    );
    await page.unroute("**/api/trial*");
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
    const source = page.locator(".compareTrialCard").first();
    await source.locator("[data-compare-keypoints]").click();
    await source
      .locator("[data-compare-keypoint-category]")
      .selectOption("full");
    await page
      .locator('[data-full-body-chart="report_arm_positions"]')
      .first()
      .check();
    await page
      .locator('[data-full-body-chart="report_sequence"]')
      .first()
      .check();
    await source.locator(".fullBodyMenu summary").click();
    const first = page.locator(".fullBodyCard").first();
    await first.locator("header strong").click();
    await first.locator(".fullBodyLegend button").first().click();
    await first
      .locator('[data-range-side="start"]')
      .selectOption("fp_100_time");
    await first.locator('[data-range-side="end"]').selectOption("MER_time");
    await first.locator(".keypointEventsToggle input").uncheck();
    await source.locator("[data-compare-match]").click();
    assert.equal(await page.locator(".fullBodyCard").count(), 4);
    const cards = page.locator(".compareTrialCard");
    assert.equal(
      await cards
        .nth(1)
        .locator("[data-compare-keypoint-category]")
        .inputValue(),
      "full",
    );
    const matched = page.locator(".fullBodyCard").nth(2);
    assert.equal(
      await matched.locator('[data-range-side="start"]').inputValue(),
      "fp_100_time",
    );
    assert.equal(
      await matched.locator('[data-range-side="end"]').inputValue(),
      "MER_time",
    );
    assert.equal(
      await matched.locator(".keypointEventsToggle input").isChecked(),
      false,
    );
    assert.equal(
      await matched
        .locator(".fullBodyLegend button")
        .first()
        .getAttribute("aria-pressed"),
      await first
        .locator(".fullBodyLegend button")
        .first()
        .getAttribute("aria-pressed"),
    );
    await page.locator("#compareSplit").click();
    await page.locator("#movieInfoBoxes").check();
    // Render complete real replays at a small resolution to keep the smoke check quick.
    const snapshot = await page.evaluate(() => window.__movieSnapshot());
    snapshot.width = 800;
    snapshot.height = 600;
    snapshot.pixelWidth = 320;
    snapshot.pixelHeight = 240;
    for (const entry of snapshot.entries) {
      entry.options.bones = true;
      entry.options.thick = false;
      entry.options.thin = false;
      entry.options.joints = false;
    }
    const submitted = await page.request.post(origin + "/api/video-exports", {
      data: snapshot,
    });
    assert.equal(submitted.status(), 202);
    const job = await submitted.json();
    const deadline = Date.now() + 180000;
    let finished;
    while (Date.now() < deadline) {
      finished = await (
        await page.request.get(origin + "/api/video-exports/" + job.id)
      ).json();
      if (finished.status === "failed") throw Error(finished.error);
      if (finished.status === "completed") break;
      await page.waitForTimeout(500);
    }
    assert.equal(finished.status, "completed", "Export timed out");
    const movie = await page.request.get(
      origin + "/api/video-exports/" + job.id + "/download",
    );
    assert.equal(movie.status(), 200);
    const output = path.join(__dirname, "results", "export.mp4");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, await movie.body());
    const metadata = JSON.parse(
      execFileSync(
        process.env.OBM_FFPROBE || "ffprobe",
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", output],
        { encoding: "utf8" },
      ),
    );
    const stream = metadata.streams[0];
    assert.equal(stream.codec_name, "h264");
    assert.equal(stream.pix_fmt, "yuv420p");
    assert.equal(stream.r_frame_rate, "60/1");
    assert.equal(stream.width, 320);
    assert.equal(stream.height, 240);
    assert.ok(Number(stream.nb_frames) > 1);
    // An interrupted job can be cancelled and never resurrected by worker progress.
    const queued = await (
      await page.request.post(origin + "/api/video-exports", { data: snapshot })
    ).json();
    assert.equal(
      (
        await (
          await page.request.post(
            origin + "/api/video-exports/" + queued.id + "/cancel",
          )
        ).json()
      ).status,
      "cancelled",
    );
    await page.waitForTimeout(250);
    assert.equal(
      (
        await (
          await page.request.get(origin + "/api/video-exports/" + queued.id)
        ).json()
      ).status,
      "cancelled",
    );
    assert.deepEqual(errors, []);
    const result = {
      checks: [
        "Idle GPU draws stop; scrubbing/playback redraw",
        "Cohort bands load after enabling",
        "Rapid selection preserves the newest recording; comparison waits for loading",
        "Latest Full body Match settings preserved",
        "Background split-comparison MP4 with anatomical bones and floating charts",
        "H.264/yuv420p at 60 fps",
        "Export cancellation",
      ],
      movie: {
        frames: stream.nb_frames,
        width: stream.width,
        height: stream.height,
        fps: stream.r_frame_rate,
      },
      errors,
    };
    fs.writeFileSync(
      path.join(__dirname, "results", "regressions.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
