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
      if (r.url().includes("/assets/anatomy/")) requests.push(r.url());
    });
    await page.route("**/app.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body:
          (await response.text()) +
          `\nwindow.__boneDebug=()=>({solo:anatomicalBody?.group.children.filter(m=>m.visible && m.isMesh).map(m=>({name:m.name,position:m.position.toArray(),scale:m.scale.toArray(),localSize:new THREE.Box3().setFromBufferAttribute(m.geometry.getAttribute("position")).getSize(new THREE.Vector3()).toArray()})),compare:[...compareViewer.parts.values()].map(p=>({id:p.entry.id,enabled:p.entry.options.bones,visible:p.anatomy.group.visible,meshes:p.anatomy.group.children.filter(m=>m.visible).length}))});`,
      });
    });
    await page.goto(origin);
    await page.waitForFunction(() => window.__movieReady?.());
    assert.equal(requests.length, 0, "No atlas download before activation");
    const toggleBody = async (id) => {
      const menu = page
        .locator(".layerMenu")
        .filter({ has: page.locator(`#${id}`) });
      if ((await menu.getAttribute("open")) === null)
        await menu.locator("summary").click();
      await page.locator(`#${id}`).click();
      await menu.locator("summary").click();
    };
    await toggleBody("showBones");
    await page.waitForFunction(() => window.__boneDebug().solo.length >= 12);
    assert.equal(requests.length, 2, "Atlas uses two small static files");
    const checkPelvis = async () => {
      const pelvis = (
        await page.evaluate(() => window.__boneDebug())
      ).solo.find((m) => m.name === "pelvis");
      assert.ok(pelvis, "Pelvis is displayed");
      assert.ok(
        Math.abs(pelvis.localSize[0] - 1) < 1e-6,
        "Pelvis outer width uses the fitting convention, without the old 1.65x amplification",
      );
      assert.ok(
        pelvis.localSize[2] > 0.6 && pelvis.localSize[2] < 0.9,
        "Replacement pelvis keeps its source height-to-width proportion",
      );
    };
    await checkPelvis();
    assert.equal(
      (await page.evaluate(() => window.__movieSnapshot())).layers.showBones,
      true,
    );
    for (const id of ["showSolid", "showThin", "showJoints"])
      await toggleBody(id);
    fs.mkdirSync(__dirname + "/results", { recursive: true });
    await page.evaluate(() => {
      const slider = document.querySelector("#timeline");
      slider.value = Number(slider.min) + 0.75 * (slider.max - slider.min);
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page
      .locator(".stageWrap")
      .screenshot({ path: __dirname + "/results/anatomical-pitcher.png" });
    await page.locator("#hittingTab").click();
    await page.locator("#search").fill("6_1");
    await page.locator('.catalogItem[data-id="hitting:processed:6_1"]').click();
    await page.waitForFunction(
      () =>
        window.__movieSnapshot().primary === "hitting:processed:6_1" &&
        window.__boneDebug().solo.length >= 12,
    );
    await page.evaluate(() => {
      const el = document.querySelector("#timeline");
      el.value = Number(el.min) + 0.7 * (el.max - el.min);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await checkPelvis();
    fs.mkdirSync(__dirname + "/results", { recursive: true });
    await page
      .locator(".stageWrap")
      .screenshot({ path: __dirname + "/results/anatomical-hitter.png" });
    await page.locator("#compareModeButton").click();
    const card = page.locator(".compareTrialCard").first();
    const menu = card
      .locator(".layerMenu")
      .filter({ has: page.locator('[data-compare-option="bones"]') });
    await menu.locator("summary").click();
    await card.locator('[data-compare-option="bones"]').click();
    for (const key of ["thick", "thin", "joints"])
      await card.locator(`[data-compare-option="${key}"]`).click();
    await menu.locator("summary").click();
    await page.locator("#search").fill("8_1");
    await page.locator('.catalogItem[data-id="hitting:processed:8_1"]').click();
    await page.waitForFunction(
      () => window.__movieSnapshot().entries.length === 2,
    );
    await card.locator("[data-compare-match]").click();
    await page.waitForFunction(() =>
      window.__boneDebug().compare.every((p) => p.enabled && p.meshes >= 12),
    );
    await page.locator("#compareSplit").click();
    await page
      .locator(".stageWrap")
      .screenshot({ path: __dirname + "/results/anatomical-compare.png" });
    assert.ok(
      (await page.evaluate(() => window.__movieSnapshot())).entries.every(
        (e) => e.options.bones,
      ),
    );
    assert.equal(
      requests.length,
      2,
      "No per-record atlas requests or recording preloads",
    );
    // Export renderer must finish loading the same bones before its first frame.
    const snapshot = await page.evaluate(() => window.__movieSnapshot());
    const movie = await browser.newPage({
      viewport: { width: 1200, height: 800 },
    });
    await movie.goto(origin);
    await movie.waitForFunction(() => window.__movieReady?.());
    await movie.evaluate((s) => window.__prepareMovie(s), snapshot);
    assert.ok(await movie.evaluate(() => window.__renderMovieFrame(0)));
    await movie.close();
    const fitting = await page.evaluate(async () => {
      const { AnatomicalBody } = await import("/anatomical_body.js");
      const THREE = await import("three");
      const data = {
        entry: { discipline: "pitching", side: "L" },
        signals: { landmarks: {} },
      };
      const parent = new THREE.Group(),
        model = new AnatomicalBody(parent, data);
      await model.load();
      const map = {
        rear_hip: [1, 0, 1],
        lead_hip: [-1, 0, 1],
        rear_knee_jc: [1, 0.2, 0.5],
        rear_ankle_jc: [1, 0.3, 0],
        thorax_dist: [0, 0, 1.5],
        thorax_prox: [0, 0, 2],
      };
      model.update(map, 0, true);
      const pelvis = model.meshes.get("pelvis");
      const pelvisWidth =
        new THREE.Box3()
          .setFromBufferAttribute(pelvis.geometry.getAttribute("position"))
          .getSize(new THREE.Vector3()).x * pelvis.scale.x;
      const centeredPelvis = pelvis.position.equals(new THREE.Vector3(0, 0, 1));
      const femur = model.meshes.get("leftFemur");
      femur.updateMatrix();
      const proximal = new THREE.Vector3(0, 0, 1)
        .applyMatrix4(femur.matrix)
        .toArray();
      const distal = femur.position.toArray();
      const sideCorrect =
        femur.visible && !model.meshes.get("rightFemur").visible;
      map.rear_knee_jc = null;
      model.update(map, 0, true);
      const gapHidden = !femur.visible;
      model.dispose();
      return {
        proximal,
        distal,
        pelvisWidth,
        centeredPelvis,
        sideCorrect,
        gapHidden,
        detached: parent.children.length === 0,
      };
    });
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(fitting.proximal[i] - [1, 0, 1][i]) < 1e-6);
      assert.equal(fitting.distal[i], [1, 0.2, 0.5][i]);
    }
    assert.ok(fitting.sideCorrect && fitting.gapHidden && fitting.detached);
    assert.ok(
      fitting.centeredPelvis && Math.abs(fitting.pelvisWidth - 2) < 1e-6,
      "Replacement pelvis remains centered and scales to released hip spacing",
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          checks: [
            "Atlas loads only on activation",
            "Pitcher and hitter bone layers",
            "Bone-only view",
            "OpenSim pelvis proportions and hip fitting",
            "Comparison and Match settings",
            "Split view",
            "Movie preparation includes bones",
            "Left-handed joint fitting, missing samples and disposal",
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
