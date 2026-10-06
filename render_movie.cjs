// Deterministic 60 fps rendering and a non-fragmented H.264 MP4.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { chromium } = require(process.env.OBM_PLAYWRIGHT || "playwright");
const folder = process.argv[2],
  origin = process.argv[3];
const state = JSON.parse(
  fs.readFileSync(path.join(folder, "input.json"), "utf8"),
);
process.env.TMPDIR = folder;
let browser,
  encoder,
  cancelled = false,
  encoderCode = null,
  encoderError = "";
const status = () =>
  JSON.parse(fs.readFileSync(path.join(folder, "status.json"), "utf8"));
const isCancelled = () =>
  cancelled || fs.existsSync(path.join(folder, "cancel"));
function update(data) {
  if (isCancelled()) throw Error("Export cancelled");
  const temp = path.join(folder, "worker-status.tmp");
  fs.writeFileSync(temp, JSON.stringify({ ...status(), ...data }));
  fs.renameSync(temp, path.join(folder, "status.json"));
}
process.on("SIGTERM", async () => {
  cancelled = true;
  encoder?.kill();
  await browser?.close().catch(() => {});
  process.exit(0);
});

(async () => {
  update({ status: "rendering", progress: 0 });
  browser = await chromium.launch({
    ...(process.env.OBM_CHROME
      ? { executablePath: process.env.OBM_CHROME }
      : {}),
    headless: true,
    args: [
      "--enable-unsafe-swiftshader",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-breakpad",
      "--disable-crash-reporter",
      `--disk-cache-dir=${path.join(folder, "chrome-cache")}`,
    ],
  });
  const page = await browser.newPage({
    viewport: {
      width: Math.max(800, state.width),
      height: Math.max(600, state.height),
    },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (error) => console.error(error.message));
  await page.goto(origin + "/index.html");
  await page.waitForFunction(
    () => window.__movieReady?.(),
    {},
    { timeout: 90000 },
  );
  const setup = await page.evaluate(
    (state) => window.__prepareMovie(state),
    state,
  );
  const fps = 60,
    duration = (setup.bounds.max - setup.bounds.min) / state.speed;
  if (!(duration > 0) || duration > 600)
    throw Error("Export duration must be between 0 and 600 seconds.");
  const count = Math.max(1, Math.ceil(duration * fps));
  const output = path.join(folder, status().filename),
    temp = path.join(folder, "render.part.mp4");
  encoder = spawn(
    process.env.OBM_FFMPEG || "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "image2pipe",
      "-framerate",
      String(fps),
      "-i",
      "pipe:0",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(fps),
      "-g",
      String(fps),
      "-movflags",
      "+faststart",
      "-video_track_timescale",
      "30000",
      temp,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  encoder.stderr.on("data", (chunk) => {
    encoderError = (encoderError + chunk).slice(-3000);
  });
  encoder.stdin.on("error", (error) => {
    encoderError ||= error.message;
  });
  // Handle a missing encoder immediately, including before the first frame arrives.
  const closed = once(encoder, "close").then(
    ([code]) => (encoderCode = code),
    (error) => {
      encoderError = error.message;
      return (encoderCode = -1);
    },
  );
  for (let i = 0; i < count; i++) {
    if (isCancelled()) throw Error("Export cancelled");
    if (encoderCode !== null)
      throw Error(encoderError || "Video encoder exited early.");
    const t = Math.min(
      setup.bounds.max,
      setup.bounds.min + (i / fps) * state.speed,
    );
    const png = await page.evaluate((t) => window.__renderMovieFrame(t), t);
    if (encoderCode !== null)
      throw Error(encoderError || "Video encoder exited early.");
    if (!encoder.stdin.write(Buffer.from(png, "base64"))) {
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          encoder.stdin.off("drain", drained);
          encoder.off("close", stopped);
          encoder.off("error", stopped);
        };
        const drained = () => {
          cleanup();
          resolve();
        };
        const stopped = () => {
          cleanup();
          reject(Error(encoderError || "Video encoder stopped"));
        };
        encoder.stdin.once("drain", drained);
        encoder.once("close", stopped);
        encoder.once("error", stopped);
      });
    }
    if (i % (fps / 2) === 0) update({ progress: (i + 1) / count });
  }
  encoder.stdin.end();
  if ((await closed) !== 0)
    throw Error(encoderError || "Video encoding failed");
  fs.renameSync(temp, output);
  update({
    status: "completed",
    progress: 1,
    frames: count,
    fps,
    duration: count / fps,
    bytes: fs.statSync(output).size,
  });
})()
  .catch((error) => {
    console.error(error.stack || error.message);
    if (!isCancelled()) update({ status: "failed", error: error.message });
    process.exitCode = 1;
  })
  .finally(async () => {
    if (encoder && encoder.exitCode === null) encoder.kill();
    await browser?.close();
  });
