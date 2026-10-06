import test from "node:test";
import assert from "node:assert/strict";
import { TrialClient } from "../trial_client.js";
import { buildPowerOverlay } from "../energy_overlay.js";
import { buildQuantities } from "../quantities.js";
import { buildKeypointGroups } from "../keypoint_data.js";
const response = (value) => new Response(JSON.stringify(value));

test("parsed payloads are reused and concurrent requests share one fetch", async () => {
  let calls = 0,
    release;
  const client = new TrialClient({
    fetcher: async () => {
      calls++;
      await new Promise((resolve) => (release = resolve));
      return response({ id: "a" });
    },
  });
  const first = client.load("a"),
    second = client.load("a");
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, b);
  assert.equal(await client.load("a"), a);
  assert.equal(calls, 1);
});
test("superseding one selection preserves a shared prefetch", async () => {
  let release;
  const client = new TrialClient({
    fetcher: async () => {
      await new Promise((resolve) => (release = resolve));
      return response({ id: "a" });
    },
  });
  const prefetch = client.load("a"),
    controller = new AbortController();
  const selection = client.load("a", { signal: controller.signal });
  controller.abort();
  await assert.rejects(selection, { name: "AbortError" });
  release();
  const data = await prefetch;
  assert.equal(await client.load("a"), data);
});
test("failures retry, and parsed-payload retention has entry and byte limits", async () => {
  let calls = 0;
  const client = new TrialClient({
    maxEntries: 2,
    maxBytes: 64,
    fetcher: async (url) => {
      calls++;
      if (calls === 1) throw Error("offline");
      return response({
        id: new URL(url, "http://local").searchParams.get("id"),
      });
    },
  });
  await assert.rejects(client.load("a"), /offline/);
  await client.load("a");
  await client.load("b");
  await client.load("a");
  await client.load("c");
  assert.equal(client.peek("b"), undefined);
  assert.ok(client.peek("a"));
  assert.ok(client.bytes <= 64);
  await client.load("large".repeat(30));
  assert.equal(client.peek("large".repeat(30)), undefined);
});
test("immutable derived signals are reused without mixing recordings or bat variants", () => {
  const trial = {
    entry: { discipline: "pitching" },
    metadata: {},
    signals: {},
    events: {},
    poi: {},
    motion: null,
    duration: 1,
  };
  const groups = buildKeypointGroups(trial);
  assert.equal(buildKeypointGroups(trial), groups);
  assert.notEqual(buildKeypointGroups(structuredClone(trial)), groups);
  const all = buildQuantities(trial);
  assert.equal(buildQuantities(trial), all);
  assert.deepEqual(
    buildQuantities(trial, { includePublished: false }),
    all.filter((spec) => !spec.id.startsWith("published:")),
  );
  assert.equal(buildPowerOverlay(trial), null);
});
