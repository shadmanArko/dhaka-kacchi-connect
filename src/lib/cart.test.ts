/**
 * The saved cart is the one piece of customer state that survives a reload,
 * and it is read back UNVALIDATED from localStorage - so every guard here
 * exists because the alternative is restoring a stale or malformed basket.
 *
 * Run with `bun test`.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import { clearCart, readCart, writeCart } from "./cart";

const KEY = "dhaka-kacchi-cart";

// Minimal localStorage stand-in - bun's test runner has no DOM.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
});

const cart = {
  quantities: { kacchi: 2 },
  deliveryDate: "2026-09-19",
  fulfillmentType: "pickup" as const,
  street: "Teststr",
  houseNumber: "1",
  postalCode: "13353",
  city: "Berlin",
  customerName: "Test Person",
  notes: "",
  prefilledForCustomerId: null,
};

describe("writeCart / readCart", () => {
  it("round-trips a cart", () => {
    writeCart(cart);
    const back = readCart();
    expect(back?.quantities).toEqual({ kacchi: 2 });
    expect(back?.deliveryDate).toBe("2026-09-19");
    expect(back?.customerName).toBe("Test Person");
  });

  it("stamps a version and a timestamp", () => {
    writeCart(cart);
    const raw = JSON.parse(store.get(KEY)!);
    expect(raw.version).toBe(1);
    expect(typeof raw.savedAt).toBe("number");
  });

  it("returns null when nothing is stored", () => {
    expect(readCart()).toBeNull();
  });
});

describe("readCart rejects carts it shouldn't restore", () => {
  it("ignores a cart older than 14 days", () => {
    writeCart(cart);
    const raw = JSON.parse(store.get(KEY)!);
    raw.savedAt = Date.now() - 15 * 24 * 60 * 60 * 1000;
    store.set(KEY, JSON.stringify(raw));
    expect(readCart()).toBeNull();
  });

  it("keeps a cart just inside the window", () => {
    writeCart(cart);
    const raw = JSON.parse(store.get(KEY)!);
    raw.savedAt = Date.now() - 13 * 24 * 60 * 60 * 1000;
    store.set(KEY, JSON.stringify(raw));
    expect(readCart()).not.toBeNull();
  });

  it("ignores an unrecognised version rather than guessing at migration", () => {
    store.set(KEY, JSON.stringify({ ...cart, version: 99, savedAt: Date.now() }));
    expect(readCart()).toBeNull();
  });

  it("ignores a cart with no version at all", () => {
    store.set(KEY, JSON.stringify({ ...cart, savedAt: Date.now() }));
    expect(readCart()).toBeNull();
  });

  it("survives corrupted JSON instead of throwing into the page's load path", () => {
    store.set(KEY, "{not json at all");
    expect(readCart()).toBeNull();
  });

  it("rejects a blob whose quantities aren't an object", () => {
    store.set(
      KEY,
      JSON.stringify({ ...cart, quantities: "nope", version: 1, savedAt: Date.now() }),
    );
    expect(readCart()).toBeNull();
  });

  it("rejects a non-numeric savedAt", () => {
    store.set(KEY, JSON.stringify({ ...cart, version: 1, savedAt: "yesterday" }));
    expect(readCart()).toBeNull();
  });
});

describe("clearCart", () => {
  it("removes a stored cart", () => {
    writeCart(cart);
    expect(readCart()).not.toBeNull();
    clearCart();
    expect(readCart()).toBeNull();
  });
});

describe("storage failures degrade instead of throwing", () => {
  it("writeCart swallows a quota/private-mode error", () => {
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage;
    expect(() => writeCart(cart)).not.toThrow();
  });

  it("readCart returns null when storage is unavailable", () => {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage;
    expect(readCart()).toBeNull();
  });
});
