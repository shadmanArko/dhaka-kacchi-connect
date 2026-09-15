/**
 * apiFetch is the single seam every backend call goes through, so two of its
 * behaviours are load-bearing far beyond this file:
 *
 *  - It must never render an untrusted response body. order.tsx puts
 *    ApiError.message straight on screen, and a proxy's HTML error page or a
 *    stack trace reaching that spot is both ugly and a leak.
 *  - It must distinguish a TIMEOUT from other failures. The order endpoint
 *    commits the order before it awaits the confirmation email, so a timeout
 *    does not mean the order failed - and the UI tells the customer not to
 *    re-submit based entirely on `kind === "timeout"`.
 *
 * Run with `bun test`.
 */
import { describe, expect, it } from "bun:test";
import { ApiError, apiFetch } from "./api";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * apiFetch only ever calls fetch(url, init), so a stub only needs that shape.
 * The cast lives here once rather than at every call site: `typeof fetch`
 * carries statics (`preconnect`) no plain function can satisfy, and repeating
 * `as unknown as typeof fetch` nine times would bury the actual test bodies.
 */
type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;

function stub(fn: FetchStub) {
  globalThis.fetch = fn as unknown as typeof fetch;
}

/** Mimics a real stalled request: hangs until the caller's signal aborts. */
function stubHang() {
  stub(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      }),
  );
}

async function caught(fn: () => Promise<unknown>): Promise<ApiError> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw new Error(`expected ApiError, got ${String(err)}`);
  }
  throw new Error("expected a rejection");
}

describe("error-body sanitisation", () => {
  it("never renders an HTML error page", async () => {
    stub(async () => new Response("<html><body>502 Bad Gateway</body></html>", { status: 502 }));
    const err = await caught(() => apiFetch("/x"));
    expect(err.message).not.toContain("<");
    expect(err.message).toContain("our end");
    expect(err.detail).toContain("<html>");
  });

  it("shows the backend's human message when there is one", async () => {
    stub(async () => json({ error: "invalid_input", message: "Street is required." }, 400));
    const err = await caught(() => apiFetch("/x"));
    expect(err.message).toBe("Street is required.");
  });

  it("never shows the machine code as if it were prose", async () => {
    stub(async () => json({ error: "invalid_items" }, 400));
    const err = await caught(() => apiFetch("/x"));
    expect(err.message).not.toContain("invalid_items");
  });

  it("rejects a message containing markup", async () => {
    stub(async () => json({ message: "<script>alert(1)</script>" }, 400));
    const err = await caught(() => apiFetch("/x"));
    expect(err.message).not.toContain("<");
  });

  it("rejects an implausibly long message", async () => {
    stub(async () => json({ message: "x".repeat(501) }, 400));
    const err = await caught(() => apiFetch("/x"));
    expect(err.message.length).toBeLessThan(300);
  });

  it("keeps the HTTP status so session handling can still see a 401", async () => {
    stub(async () => json({ message: "Sign in required." }, 401));
    const err = await caught(() => apiFetch("/x"));
    expect(err.status).toBe(401);
    expect(err.kind).toBe("http");
  });
});

describe("timeout and network failures", () => {
  it("surfaces a stalled request as kind=timeout", async () => {
    stubHang();
    const err = await caught(() => apiFetch("/slow", undefined, { timeoutMs: 150 }));
    expect(err.kind).toBe("timeout");
    expect(err.status).toBe(0);
    expect(err.message).toContain("took too long");
  });

  it("does not time out a request that answers in time", async () => {
    stub(async () => json({ ok: true }));
    await expect(apiFetch("/fast", undefined, { timeoutMs: 1000 })).resolves.toEqual({ ok: true });
  });

  it("distinguishes offline from timeout", async () => {
    stub(async () => {
      throw new TypeError("Failed to fetch");
    });
    const err = await caught(() => apiFetch("/x"));
    expect(err.kind).toBe("network");
    expect(err.message).toContain("Couldn't reach the server");
  });

  it("a timeout is never mistaken for a 401, so a flaky connection can't look like a revoked session", async () => {
    stubHang();
    const err = await caught(() => apiFetch("/x", undefined, { timeoutMs: 100 }));
    expect(err.status).not.toBe(401);
  });
});
