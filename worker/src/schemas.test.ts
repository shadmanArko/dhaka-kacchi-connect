import { describe, expect, it } from "bun:test";
import {
  OrderInputSchema,
  RegisterInputSchema,
  SubscribeInputSchema,
  VerifyOtpInputSchema,
} from "./schemas";

const validRegister = {
  phone: "0170 1234567",
  name: "  Test Person  ",
  dateOfBirth: "1990-05-14",
  address: { street: " Alexanderstraße ", houseNumber: "1", postalCode: "10178", city: "Berlin" },
  email: "t@example.com",
  password: "password123",
};

describe("RegisterInputSchema", () => {
  it("normalises phone and trims text fields", () => {
    const parsed = RegisterInputSchema.parse(validRegister);
    expect(parsed.phone).toBe("+491701234567");
    expect(parsed.name).toBe("Test Person");
    expect(parsed.address.street).toBe("Alexanderstraße");
  });

  it("accepts international formats with spaces", () => {
    expect(RegisterInputSchema.parse({ ...validRegister, phone: "+49 170 123 4567" }).phone).toBe(
      "+491701234567",
    );
  });

  it("rejects whitespace-only fields and bad phones", () => {
    expect(RegisterInputSchema.safeParse({ ...validRegister, name: "   " }).success).toBe(false);
    expect(
      RegisterInputSchema.safeParse({
        ...validRegister,
        address: { ...validRegister.address, houseNumber: "  " },
      }).success,
    ).toBe(false);
    expect(RegisterInputSchema.safeParse({ ...validRegister, phone: "12" }).success).toBe(false);
    expect(RegisterInputSchema.safeParse({ ...validRegister, phone: "abc" }).success).toBe(false);
  });

  it("rejects absurdly long input", () => {
    expect(RegisterInputSchema.safeParse({ ...validRegister, name: "a".repeat(101) }).success).toBe(
      false,
    );
  });
});

describe("VerifyOtpInputSchema", () => {
  it("normalises the phone like registration did", () => {
    expect(VerifyOtpInputSchema.parse({ phone: "0170 1234567", code: "123456" }).phone).toBe(
      "+491701234567",
    );
  });
});

describe("OrderInputSchema", () => {
  const order = {
    items: [{ sku: "kacchi_regular", quantity: 1 }],
    deliveryDate: "2026-10-10",
    fulfillmentType: "pickup" as const,
    customerName: "A",
  };
  it("rejects blank names and over-long notes", () => {
    expect(OrderInputSchema.safeParse({ ...order, customerName: "  " }).success).toBe(false);
    expect(OrderInputSchema.safeParse({ ...order, notes: "x".repeat(1001) }).success).toBe(false);
    expect(OrderInputSchema.safeParse({ ...order, notes: "ok" }).success).toBe(true);
  });
});

describe("SubscribeInputSchema", () => {
  it("lowercases and trims the email and fills defaults", () => {
    const parsed = SubscribeInputSchema.parse({ email: "  Some.One@Example.COM " });
    expect(parsed.email).toBe("some.one@example.com");
    expect(parsed.locale).toBe("en");
    expect(parsed.source).toBe("subscribe_page");
  });

  it("rejects bad emails, unknown locales and untidy sources", () => {
    expect(SubscribeInputSchema.safeParse({ email: "nope" }).success).toBe(false);
    expect(SubscribeInputSchema.safeParse({ email: "a@b.co", locale: "fr" }).success).toBe(false);
    expect(SubscribeInputSchema.safeParse({ email: "a@b.co", source: "Has Spaces!" }).success).toBe(
      false,
    );
  });

  it("accepts the honeypot field (the route ignores any value in it)", () => {
    expect(
      SubscribeInputSchema.safeParse({ email: "a@b.co", website: "http://spam" }).success,
    ).toBe(true);
  });
});
