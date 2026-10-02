import { afterAll, expect, mock, test } from "bun:test";

// lib/sentry.ts reads the DSN at module load and talks to `window`, so both
// have to exist before it is imported. The SDK itself is replaced by a stub:
// what is under test is the buffering/replay contract, not Sentry.
process.env.VITE_SENTRY_DSN = "https://key@o1.ingest.de.sentry.io/1";

const win = new EventTarget() as EventTarget & {
  requestIdleCallback?: (cb: () => void) => void;
};
const idleCallbacks: Array<() => void> = [];
win.requestIdleCallback = (cb) => void idleCallbacks.push(cb);
Object.assign(globalThis, { window: win, document: { readyState: "complete" } });

const captured: Array<{ error: unknown; hint: unknown }> = [];
const started: string[] = [];
mock.module("./sentry-sdk", () => ({
  startSentry: (dsn: string) => {
    started.push(dsn);
    return (error: unknown, hint: unknown) => void captured.push({ error, hint });
  },
}));

// bun runs every test file in one process; don't leave a fake `window` behind
// for the others.
afterAll(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
});

function fire(type: string, props: Record<string, unknown>) {
  const event = new Event(type);
  Object.assign(event, props);
  win.dispatchEvent(event);
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("errors before the SDK loads are buffered, then replayed once, with no duplicate listeners", async () => {
  const { initSentry, captureException } = await import("./sentry");

  initSentry();
  initSentry(); // idempotent
  expect(idleCallbacks).toHaveLength(1); // SDK load deferred to idle, not started
  expect(started).toHaveLength(0);

  // An early window error and an early rejection: both must be kept.
  const boom = new Error("boom");
  fire("error", { error: boom, message: "boom" });
  const rejected = new Error("rejected");
  fire("unhandledrejection", { reason: rejected });
  // A non-Error rejection is intentionally dropped (ignoreErrors discards it).
  fire("unhandledrejection", { reason: "just a string" });

  await flush();
  // The first error brought the load forward instead of waiting for idle.
  expect(started).toEqual(["https://key@o1.ingest.de.sentry.io/1"]);
  expect(captured.map((c) => c.error)).toEqual([boom, rejected]);
  expect((captured[0].hint as { mechanism: { handled: boolean } }).mechanism.handled).toBe(false);

  // The idle callback firing later must not start a second init.
  idleCallbacks[0]();
  await flush();
  expect(started).toHaveLength(1);

  // Our listeners are gone (the real SDK installs its own): a later raw window
  // error is no longer captured by us.
  fire("error", { error: new Error("after"), message: "after" });
  await flush();
  expect(captured).toHaveLength(2);

  // Direct reports now pass straight through.
  const direct = new Error("direct");
  captureException(direct, { tags: { area: "x" } });
  expect(captured.at(-1)?.error).toBe(direct);
});
