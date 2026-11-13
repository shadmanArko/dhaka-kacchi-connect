import { describe, expect, it } from "bun:test";
import { buildSubscriptionEmail } from "./subscriptionEmails";

const base = {
  actionUrl: "https://dhakakacchi.com/subscribe/?confirm=abc123",
  logoUrl: "https://dhakakacchi.com/email-logo.png",
  siteUrl: "https://dhakakacchi.com",
  contactEmail: "hello@dhakakacchi.com",
};

describe("buildSubscriptionEmail", () => {
  it("confirmation: link in both bodies, English copy, no unsubscribe", () => {
    const m = buildSubscriptionEmail({ ...base, kind: "confirm", locale: "en" });
    expect(m.subject).toContain("confirm your subscription");
    expect(m.text).toContain(base.actionUrl);
    expect(m.html).toContain(`href="${base.actionUrl}"`);
    expect(m.html).toContain("Confirm my subscription");
    expect(m.html).not.toContain("Unsubscribe");
  });

  it("confirmation in German uses German copy", () => {
    const m = buildSubscriptionEmail({ ...base, kind: "confirm", locale: "de" });
    expect(m.subject).toContain("bestätigen");
    expect(m.html).toContain("Anmeldung bestätigen");
    expect(m.html).toContain('lang="de"');
    expect(m.text).toContain("Berlin, Deutschland");
  });

  it("welcome: carries the unsubscribe link in text and HTML", () => {
    const un = "https://dhakakacchi.com/subscribe/?unsubscribe=tok";
    const m = buildSubscriptionEmail({
      ...base,
      kind: "welcome",
      locale: "en",
      actionUrl: "https://dhakakacchi.com/order/",
      unsubscribeUrl: un,
    });
    expect(m.subject).toContain("on the list");
    expect(m.text).toContain(un);
    expect(m.html).toContain(`href="${un}"`);
    expect(m.html).toContain("Order for Saturday");
  });

  it("escapes anything that could break out of an attribute", () => {
    const m = buildSubscriptionEmail({
      ...base,
      kind: "confirm",
      locale: "en",
      actionUrl: 'https://x.test/?a="><script>alert(1)</script>',
    });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&quot;&gt;&lt;script&gt;");
  });
});
