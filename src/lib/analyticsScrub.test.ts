/**
 * The scrubber is the only thing standing between a password-reset token in a
 * URL and a third party's database, so it is tested against the exact shapes
 * found in production on 2026-10-07 and, just as importantly, against the clean
 * URLs it must leave alone - a scrubber that mangles ordinary pageviews would
 * quietly break attribution instead.
 *
 * Run with `bun test`.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { scrubEvent, scrubUrl } from "./analyticsScrub";

const SECRET = "SECRET-RESET-TOKEN-9f8e7d";

describe("scrubUrl: what is removed", () => {
  it("removes a password-reset token", () => {
    const out = scrubUrl(`https://dhakakacchi.com/reset-password/?token=${SECRET}`) as string;
    expect(out).toBe("https://dhakakacchi.com/reset-password/");
    expect(out).not.toContain(SECRET);
  });

  it("removes an order id", () => {
    expect(scrubUrl("https://dhakakacchi.com/orders/?order=ord_123")).toBe(
      "https://dhakakacchi.com/orders/",
    );
  });

  it("removes ad-click ids, and the ?internal= flag", () => {
    expect(scrubUrl("https://dhakakacchi.com/?fbclid=AbC123&gclid=x&internal=1")).toBe(
      "https://dhakakacchi.com/",
    );
  });

  it("removes a parameter nobody has thought of yet (the point of an allowlist)", () => {
    expect(scrubUrl("https://dhakakacchi.com/x?code=1&key=2&session=3&email=a@b.c")).toBe(
      "https://dhakakacchi.com/x",
    );
  });

  it("matches parameter names case-insensitively on the way IN, so UTM_SOURCE survives", () => {
    expect(scrubUrl("https://dhakakacchi.com/?UTM_SOURCE=ig&TOKEN=t")).toBe(
      "https://dhakakacchi.com/?UTM_SOURCE=ig",
    );
  });

  it("removes the #fragment", () => {
    expect(scrubUrl(`https://dhakakacchi.com/a#token=${SECRET}`)).toBe("https://dhakakacchi.com/a");
  });

  it("removes credentials embedded in the URL", () => {
    expect(scrubUrl("https://user:hunter2@dhakakacchi.com/a")).toBe("https://dhakakacchi.com/a");
  });
});

describe("scrubUrl: what must survive", () => {
  it("keeps every UTM parameter, which attribution depends on", () => {
    const url =
      "https://dhakakacchi.com/?utm_source=instagram&utm_medium=social&utm_campaign=eid&utm_content=bio_link&utm_term=kacchi";
    expect(scrubUrl(url)).toBe(url);
  });

  it("keeps UTMs while dropping a secret sitting between them", () => {
    expect(scrubUrl(`https://dhakakacchi.com/?utm_source=ig&token=${SECRET}&utm_content=bio`)).toBe(
      "https://dhakakacchi.com/?utm_source=ig&utm_content=bio",
    );
  });

  it("leaves clean URLs byte-identical, including the German locale path", () => {
    for (const url of [
      "https://dhakakacchi.com/",
      "https://dhakakacchi.com/de/order/",
      "https://dhakakacchi.com/about/",
    ]) {
      expect(scrubUrl(url)).toBe(url);
    }
  });

  it("leaves PostHog's $direct marker, empty strings and non-strings alone", () => {
    expect(scrubUrl("$direct")).toBe("$direct");
    expect(scrubUrl("")).toBe("");
    expect(scrubUrl(undefined)).toBeUndefined();
    expect(scrubUrl(null)).toBeNull();
    expect(scrubUrl(42)).toBe(42);
  });

  it("falls back to cutting at ? or # for something that is not an absolute URL", () => {
    expect(scrubUrl(`/reset-password?token=${SECRET}`)).toBe("/reset-password");
    expect(scrubUrl(`not a url #frag`)).toBe("not a url ");
  });
});

/** A reset-password pageview shaped like the real ones found in PostHog. */
function resetEvent() {
  const dirty = `https://dhakakacchi.com/reset-password/?token=${SECRET}&utm_source=email`;
  return {
    event: "$pageview",
    properties: {
      $current_url: dirty,
      $referrer: `https://mail.example/?token=${SECRET}`,
      $pathname: "/reset-password/",
      title: "Reset password",
      $session_entry_url: dirty,
    },
    $set: { $current_url: dirty, $referrer: "$direct", $browser: "Chrome" },
    $set_once: { $initial_current_url: dirty, $initial_referrer: dirty },
  };
}

describe("scrubEvent", () => {
  it("scrubs every place a URL appears: properties, $set and $set_once", () => {
    const out = scrubEvent(resetEvent());
    expect(JSON.stringify(out)).not.toContain(SECRET);
    expect(out.properties?.$current_url).toBe(
      "https://dhakakacchi.com/reset-password/?utm_source=email",
    );
    expect(out.$set?.$current_url).toBe("https://dhakakacchi.com/reset-password/?utm_source=email");
    expect(out.$set_once?.$initial_current_url).toBe(
      "https://dhakakacchi.com/reset-password/?utm_source=email",
    );
  });

  it("catches URL properties it was never told about, by name (session_entry_url)", () => {
    const out = scrubEvent(resetEvent());
    expect(out.properties?.$session_entry_url).not.toContain(SECRET);
  });

  it("leaves unrelated properties exactly as they were", () => {
    const out = scrubEvent(resetEvent());
    expect(out.event).toBe("$pageview");
    expect(out.properties?.title).toBe("Reset password");
    expect(out.properties?.$pathname).toBe("/reset-password/");
    expect(out.$set?.$browser).toBe("Chrome");
    expect(out.$set?.$referrer).toBe("$direct");
  });

  it("does not mutate the event it was given", () => {
    const original = resetEvent();
    const snapshot = JSON.stringify(original);
    scrubEvent(original);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("scrubs the link target of an autocapture element", () => {
    const out = scrubEvent({
      event: "$autocapture",
      properties: {
        $elements: [
          { tag_name: "a", attr__href: `/orders?order=ord_9&token=${SECRET}`, $el_text: "View" },
          { tag_name: "button" },
        ],
      },
    });
    const [link, button] = out.properties?.$elements as Array<Record<string, unknown>>;
    expect(link.attr__href).toBe("/orders");
    expect(link.$el_text).toBe("View");
    expect(button).toEqual({ tag_name: "button" });
  });

  it("scrubs the page address inside session-replay metadata (best effort)", () => {
    const out = scrubEvent({
      event: "$snapshot",
      properties: {
        $current_url: `https://dhakakacchi.com/reset-password/?token=${SECRET}`,
        $snapshot_data: [
          { type: 4, data: { href: `https://dhakakacchi.com/reset-password/?token=${SECRET}` } },
          { type: 3, data: { source: 1, text: "kept" } },
        ],
      },
    });
    expect(JSON.stringify(out)).not.toContain(SECRET);
    const data = out.properties?.$snapshot_data as Array<Record<string, unknown>>;
    expect(data[1]).toEqual({ type: 3, data: { source: 1, text: "kept" } });
  });

  it("drops click ids that PostHog copies into properties named after the parameter", () => {
    // Observed in the real SDK's traffic: the URL was clean, but `fbclid` still
    // travelled as its own property.
    const out = scrubEvent({
      event: "$pageview",
      properties: {
        $current_url: "https://dhakakacchi.com/?fbclid=FBCLICK42&utm_source=ig",
        fbclid: "FBCLICK42",
        gclid: null,
        $initial_fbclid: "FBCLICK42",
        utm_source: "ig",
        utm_content: "bio_link",
      },
      $set_once: { $initial_gclid: "G-CLICK", $initial_utm_source: "ig" },
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain("FBCLICK42");
    expect(text).not.toContain("G-CLICK");
    expect(out.properties).not.toHaveProperty("fbclid");
    expect(out.properties).not.toHaveProperty("gclid");
    expect(out.properties).not.toHaveProperty("$initial_fbclid");
    // ...while the marketing labels attribution depends on are untouched.
    expect(out.properties?.utm_source).toBe("ig");
    expect(out.properties?.utm_content).toBe("bio_link");
    expect(out.$set_once?.$initial_utm_source).toBe("ig");
  });

  it("drops derived click-id variants, e.g. $session_entry_fbclid (leaked to production once)", () => {
    // Found by querying the live PostHog after the first version shipped: the URL
    // and the plain fbclid were clean, but PostHog also stores the landing page's
    // click id under a name built from a prefix the first rule did not list.
    const out = scrubEvent({
      event: "$pageview",
      properties: {
        $session_entry_fbclid: "FBVERIFYTEST",
        $session_entry_gclid: "GVERIFYTEST",
        $initial_msclkid: "MSVERIFYTEST",
        $some_future_prefix_ttclid: "TTVERIFYTEST",
        _kx: "KXVERIFYTEST",
        $session_entry_utm_source: "ig",
        $session_entry_pathname: "/",
      },
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain("VERIFYTEST");
    expect(out.properties?.$session_entry_utm_source).toBe("ig");
    expect(out.properties?.$session_entry_pathname).toBe("/");
  });

  it("drops Facebook's cookie copies ($fbc embeds the click id in its value)", () => {
    // Observed: $set: { "$fbc": "fb.1.1791378119665.<fbclid>" } on every pageview.
    const out = scrubEvent({
      event: "$pageview",
      properties: { $fbp: "fb.1.123.456", utm_source: "ig" },
      $set: { $fbc: "fb.1.1791378119665.FBCLICK42", $browser: "Chrome" },
      $set_once: { $initial_fbc: "fb.1.1791378119665.FBCLICK42" },
    });
    expect(JSON.stringify(out)).not.toContain("FBCLICK42");
    expect(out.$set).not.toHaveProperty("$fbc");
    expect(out.properties).not.toHaveProperty("$fbp");
    expect(out.$set?.$browser).toBe("Chrome");
    expect(out.properties?.utm_source).toBe("ig");
  });

  it("does not choke on snapshot data it does not recognise (e.g. compressed)", () => {
    const out = scrubEvent({ event: "$snapshot", properties: { $snapshot_data: "H4sIAAAA" } });
    expect(out.properties?.$snapshot_data).toBe("H4sIAAAA");
  });

  it("passes null through (PostHog reads null as 'drop this event') and tolerates sparse events", () => {
    expect(scrubEvent(null)).toBeNull();
    // Variables, not literals: the parameter type lists only the fields the
    // scrubber touches, so a literal carrying `event` trips excess-property checks.
    const bare = { event: "x" };
    const empty = { event: "x", properties: {} };
    expect(JSON.stringify(scrubEvent(bare))).toBe('{"event":"x"}');
    expect(JSON.stringify(scrubEvent(empty))).toBe('{"event":"x","properties":{}}');
  });
});

describe("wiring", () => {
  it("analytics.ts really installs the scrubber on the PostHog client", () => {
    // A test that the FUNCTION works says nothing if the line that installs it
    // is later deleted in a refactor - and nothing else would notice.
    const source = readFileSync(new URL("./analytics.ts", import.meta.url), "utf8");
    expect(source).toContain('import { scrubEvent } from "./analyticsScrub"');
    expect(source).toMatch(/before_send:\s*scrubEvent/);
  });
});
