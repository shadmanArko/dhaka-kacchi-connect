import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { config } from "./config";
import { pool, isUniqueViolation } from "./db";
import { MENU } from "./data";
import {
  hashPassword,
  verifyPassword,
  generateOtpCode,
  hashOtpCode,
  hashesMatch,
  generateSessionToken,
  generatePasswordResetToken,
  hashToken,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS_PER_PHONE_PER_HOUR,
  OTP_MAX_SENDS_PER_PHONE_PER_DAY,
  OTP_MAX_SENDS_PER_IP_PER_HOUR,
  SESSION_TTL_DAYS,
  PASSWORD_RESET_TTL_MINUTES,
  LOGIN_MAX_FAILED_ATTEMPTS,
  LOGIN_LOCKOUT_MINUTES,
} from "./lib/auth";
import { requireAuth, type AuthVariables } from "./lib/authMiddleware";
import { sendOtpSms } from "./lib/berlinSms";
import { toPublicCustomer, type CustomerRecord } from "./lib/customers";
import { createPostgresCustomersRepository } from "./lib/customersRepository";
import { getAvailableDeliveryDates, isDeliveryDateStillOrderable } from "./lib/dates";
import { quoteDeliveryForAddress } from "./lib/delivery";
import { registerEmailNotifications, sendPasswordResetEmail } from "./lib/email";
import { emitOrderCreated } from "./lib/orderEvents";
import { OrderValidationError, priceOrder, type OrderRecord } from "./lib/orders";
import { createPostgresOrdersRepository } from "./lib/ordersRepository";
import { createPostgresOtpRepository } from "./lib/otpRepository";
import { createPostgresPasswordResetTokensRepository } from "./lib/passwordResetTokensRepository";
import { createPostgresSessionsRepository } from "./lib/sessionsRepository";
import { registerTelegramNotifications } from "./lib/telegram";
import {
  AuthResultSchema,
  DeliveryAddressSchema,
  DeliveryQuoteResponseSchema,
  ErrorResponseSchema,
  LoginInputSchema,
  MenuItemSchema,
  MeResultSchema,
  MessageResultSchema,
  OrderInputSchema,
  OrderResultSchema,
  PasswordResetConfirmInputSchema,
  PasswordResetRequestInputSchema,
  RegisterInputSchema,
  RegisterResultSchema,
  VerifyOtpInputSchema,
} from "./schemas";

// Wiring, done once at startup: the concrete Postgres repositories are
// created here and handed to anything that needs to persist or react to
// orders/accounts. Route handlers below only ever see the repository
// interfaces.
const ordersRepository = createPostgresOrdersRepository(pool);
const customersRepository = createPostgresCustomersRepository(pool);
const otpRepository = createPostgresOtpRepository(pool);
const sessionsRepository = createPostgresSessionsRepository(pool);
const passwordResetTokensRepository = createPostgresPasswordResetTokensRepository(pool);
registerEmailNotifications(ordersRepository);
registerTelegramNotifications(ordersRepository);

const app = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "invalid_input", message: result.error.issues[0]?.message ?? "Invalid request." },
        400,
      );
    }
  },
});

app.use(
  "*",
  cors({
    origin: (origin) =>
      origin && config.allowedOrigins.includes(origin) ? origin : config.allowedOrigins[0],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// Health check stays unversioned and outside /v1 - it's for infra probes
// (Docker healthchecks, uptime monitors), not API consumers, and it should
// never break if the API's version ever changes.
app.get("/health", (c) => c.json({ ok: true }));

const v1 = new OpenAPIHono<{ Variables: AuthVariables }>();

// The first real "you must be signed in" checks in this codebase - see
// authMiddleware.ts. Registered before the routes they guard, since Hono
// composes middleware and handlers for a path in registration order.
v1.use("/orders", requireAuth(sessionsRepository));
v1.use("/me", requireAuth(sessionsRepository));
v1.use("/auth/logout", requireAuth(sessionsRepository));

// Lets the generated OpenAPI document at /v1/doc correctly describe which
// routes need a bearer token - the actual enforcement is requireAuth()
// above; this just keeps the documentation (and a future app's generated
// client) accurate.
v1.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
});

const menuRoute = createRoute({
  method: "get",
  path: "/menu",
  operationId: "getMenu",
  summary: "Get the current menu",
  security: [], // deliberately public - this whole API has no auth today
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ items: z.array(MenuItemSchema) }) } },
      description: "The current menu.",
    },
  },
});
v1.openapi(menuRoute, (c) =>
  c.json({
    items: MENU.map(({ sku, name, priceCents, description }) => ({
      sku,
      name,
      priceCents,
      description,
    })),
  }),
);

const availabilityRoute = createRoute({
  method: "get",
  path: "/availability",
  operationId: "getAvailability",
  summary: "Get upcoming orderable delivery/pickup dates",
  security: [], // deliberately public - this whole API has no auth today
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ dates: z.array(z.string()) }) } },
      description: "Upcoming orderable Saturdays (YYYY-MM-DD).",
    },
  },
});
v1.openapi(availabilityRoute, (c) => c.json({ dates: getAvailableDeliveryDates(new Date(), 4) }));

const deliveryQuoteRoute = createRoute({
  method: "post",
  path: "/delivery-quote",
  operationId: "quoteDeliveryFee",
  summary: "Preview the delivery fee for an address",
  security: [], // deliberately public - this whole API has no auth today
  request: {
    body: { content: { "application/json": { schema: DeliveryAddressSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: DeliveryQuoteResponseSchema } },
      description: "Whether the address is deliverable and, if so, at what fee.",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "The request body failed validation.",
    },
  },
});
// Public, no mutation - lets the customer see the delivery fee before they
// submit an order. Deliberately re-run in full by POST /orders below, never
// trusted as-is: this endpoint is a preview, not an authorization.
v1.openapi(deliveryQuoteRoute, (c) => {
  const address = c.req.valid("json");
  const result = quoteDeliveryForAddress(address);
  if (!result.ok) {
    return c.json({ error: result.reason, message: result.message }, 400);
  }
  return c.json(result, 200);
});

// --- Customer accounts -----------------------------------------------------

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string | null {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

async function issueSession(customerId: string): Promise<string> {
  const now = new Date();
  const token = generateSessionToken();
  await sessionsRepository.createSession({
    id: newId("sess"),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60_000),
    customerId,
    tokenHash: hashToken(token),
  });
  return token;
}

const registerRoute = createRoute({
  method: "post",
  path: "/auth/register",
  operationId: "register",
  summary: "Start registration - sends a one-time verification code to the phone number",
  security: [], // deliberately public - this is how a new account begins
  request: {
    body: { content: { "application/json": { schema: RegisterInputSchema } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: RegisterResultSchema } },
      description: "Verification code sent.",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid input, or already registered.",
    },
    429: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Too many codes requested.",
    },
  },
});
v1.openapi(registerRoute, async (c) => {
  const body = c.req.valid("json");
  const phone = body.phone.trim();
  const email = body.email.trim().toLowerCase();

  if (await customersRepository.phoneOrEmailTaken(phone, email)) {
    return c.json(
      {
        error: "already_registered",
        message: "An account with this phone or email already exists. Please log in instead.",
      },
      400,
    );
  }

  const ipAddress = clientIp(c);
  const [byPhoneHour, byPhoneDay, byIp] = await Promise.all([
    otpRepository.countRecentSendsByPhone(phone, 1),
    otpRepository.countRecentSendsByPhone(phone, 24),
    ipAddress ? otpRepository.countRecentSendsByIp(ipAddress, 1) : Promise.resolve(0),
  ]);
  if (
    byPhoneHour >= OTP_MAX_SENDS_PER_PHONE_PER_HOUR ||
    byPhoneDay >= OTP_MAX_SENDS_PER_PHONE_PER_DAY ||
    byIp >= OTP_MAX_SENDS_PER_IP_PER_HOUR
  ) {
    return c.json(
      {
        error: "too_many_requests",
        message: "Too many verification codes requested. Please try again later.",
      },
      429,
    );
  }

  const passwordHash = await hashPassword(body.password);
  const code = generateOtpCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60_000);

  await otpRepository.createOtp({
    id: newId("otp"),
    createdAt: now.toISOString(),
    expiresAt,
    phone,
    ipAddress,
    codeHash: hashOtpCode(code),
    pending: {
      name: body.name.trim(),
      email,
      passwordHash,
      dateOfBirth: body.dateOfBirth,
      address: body.address,
    },
  });

  const sent = await sendOtpSms(phone, code);
  if (!sent) {
    return c.json(
      { error: "sms_failed", message: "Couldn't send the verification code. Please try again." },
      400,
    );
  }

  return c.json(
    {
      phone,
      expiresAt: expiresAt.toISOString(),
      message: "A verification code was sent to your phone.",
    },
    201,
  );
});

const verifyOtpRoute = createRoute({
  method: "post",
  path: "/auth/verify-otp",
  operationId: "verifyOtp",
  summary: "Confirm the registration code and create the account",
  security: [], // deliberately public - can't require login to finish signing up
  request: {
    body: { content: { "application/json": { schema: VerifyOtpInputSchema } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: AuthResultSchema } },
      description: "Account created and logged in.",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No pending/expired code, too many attempts, or incorrect code.",
    },
  },
});
v1.openapi(verifyOtpRoute, async (c) => {
  const { phone, code } = c.req.valid("json");

  const otp = await otpRepository.findLatestActiveByPhone(phone.trim());
  if (!otp) {
    return c.json(
      {
        error: "no_pending_code",
        message: "No pending verification code for this phone. Please register again.",
      },
      400,
    );
  }
  if (otp.expiresAt.getTime() < Date.now()) {
    return c.json(
      {
        error: "code_expired",
        message: "That code has expired. Please register again to get a new one.",
      },
      400,
    );
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return c.json(
      {
        error: "too_many_attempts",
        message: "Too many incorrect attempts. Please register again to get a new code.",
      },
      400,
    );
  }

  if (!hashesMatch(hashOtpCode(code), otp.codeHash)) {
    await otpRepository.incrementAttempts(otp.id);
    return c.json({ error: "incorrect_code", message: "Incorrect code. Please try again." }, 400);
  }

  const now = new Date();
  const customer: CustomerRecord = {
    id: newId("cust"),
    createdAt: now.toISOString(),
    phone: otp.phone,
    email: otp.pending.email,
    name: otp.pending.name,
    dateOfBirth: otp.pending.dateOfBirth,
    address: otp.pending.address,
    passwordHash: otp.pending.passwordHash,
  };

  try {
    await customersRepository.insertCustomer(customer);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json(
        {
          error: "already_registered",
          message: "An account with this phone or email already exists. Please log in instead.",
        },
        400,
      );
    }
    throw err;
  }
  await otpRepository.consumeOtp(otp.id);

  const token = await issueSession(customer.id);
  return c.json({ token, customer: toPublicCustomer(customer) }, 201);
});

const loginRoute = createRoute({
  method: "post",
  path: "/auth/login",
  operationId: "login",
  summary: "Log in with phone or email + password",
  security: [], // deliberately public - this is how a session begins
  request: {
    body: { content: { "application/json": { schema: LoginInputSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AuthResultSchema } },
      description: "Logged in.",
    },
    401: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Incorrect credentials, or the account is temporarily locked.",
    },
  },
});
v1.openapi(loginRoute, async (c) => {
  const body = c.req.valid("json");
  const identifier = body.identifier.trim().toLowerCase();
  const invalidCredentials = () =>
    c.json(
      { error: "invalid_credentials", message: "Incorrect phone/email or password." },
      401 as const,
    );

  // Same generic message whether the account doesn't exist or the password
  // was wrong - never let a login attempt reveal which phone numbers/emails
  // have an account.
  const customer = await customersRepository.findByPhoneOrEmail(identifier);
  if (!customer) {
    return invalidCredentials();
  }

  if (customer.lockedUntil && new Date(customer.lockedUntil).getTime() > Date.now()) {
    return c.json(
      {
        error: "account_locked",
        message: "Too many failed attempts. Please try again in a few minutes.",
      },
      401,
    );
  }

  if (!(await verifyPassword(body.password, customer.passwordHash))) {
    const newCount = customer.failedLoginCount + 1;
    const lockUntil =
      newCount >= LOGIN_MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60_000)
        : null;
    await customersRepository.recordFailedLogin(customer.id, lockUntil);
    return invalidCredentials();
  }

  await customersRepository.recordSuccessfulLogin(customer.id);
  const token = await issueSession(customer.id);
  return c.json({ token, customer: toPublicCustomer(customer) }, 200);
});

const logoutRoute = createRoute({
  method: "post",
  path: "/auth/logout",
  operationId: "logout",
  summary: "Log out (invalidates the current session)",
  security: [{ bearerAuth: [] }],
  responses: {
    204: { description: "Logged out." },
    401: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Not signed in.",
    },
  },
});
v1.openapi(logoutRoute, async (c) => {
  const token = c.req.header("Authorization")!.slice(7);
  await sessionsRepository.deleteByTokenHash(hashToken(token));
  return c.body(null, 204);
});

const meRoute = createRoute({
  method: "get",
  path: "/me",
  operationId: "getMe",
  summary: "Get the currently logged-in customer",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: MeResultSchema } },
      description: "The logged-in customer.",
    },
    401: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Not signed in.",
    },
  },
});
v1.openapi(meRoute, async (c) => {
  const customer = await customersRepository.findById(c.get("customerId"));
  if (!customer) {
    return c.json({ error: "unauthorized", message: "Sign in required." }, 401);
  }
  return c.json({ customer: toPublicCustomer(customer) }, 200);
});

const passwordResetRequestRoute = createRoute({
  method: "post",
  path: "/auth/password-reset/request",
  operationId: "requestPasswordReset",
  summary: "Email a one-time password-reset link",
  security: [], // deliberately public - this is the entry point for someone who's locked out
  request: {
    body: {
      content: { "application/json": { schema: PasswordResetRequestInputSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: MessageResultSchema } },
      description: "Generic confirmation - see description.",
    },
  },
});
// Password reset is email-only, deliberately - never by phone/SMS. Always
// returns the same message regardless of whether the email matched an
// account, so this endpoint can never be used to check which email
// addresses have an account.
v1.openapi(passwordResetRequestRoute, async (c) => {
  const { email } = c.req.valid("json");
  const genericMessage = {
    message: "If an account exists with that email, we've sent a reset link.",
  } as const;

  const customer = await customersRepository.findByPhoneOrEmail(email.trim().toLowerCase());
  if (!customer) {
    return c.json(genericMessage, 200);
  }

  const now = new Date();
  const token = generatePasswordResetToken();
  await passwordResetTokensRepository.createToken({
    id: newId("prt"),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000),
    customerId: customer.id,
    tokenHash: hashToken(token),
  });

  const resetUrl = `${config.publicSiteUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await sendPasswordResetEmail(customer.email, customer.name, resetUrl).catch((err) => {
    console.error("sendPasswordResetEmail failed:", err);
  });

  return c.json(genericMessage, 200);
});

const passwordResetConfirmRoute = createRoute({
  method: "post",
  path: "/auth/password-reset/confirm",
  operationId: "confirmPasswordReset",
  summary: "Set a new password using an emailed reset link",
  security: [], // deliberately public - the token in the link IS the credential here
  request: {
    body: {
      content: { "application/json": { schema: PasswordResetConfirmInputSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: MessageResultSchema } },
      description: "Password updated.",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid or expired token.",
    },
  },
});
v1.openapi(passwordResetConfirmRoute, async (c) => {
  const { token, newPassword } = c.req.valid("json");

  const resetToken = await passwordResetTokensRepository.findValidByTokenHash(hashToken(token));
  if (!resetToken) {
    return c.json(
      {
        error: "invalid_token",
        message: "This reset link is invalid or has expired. Please request a new one.",
      },
      400,
    );
  }

  await customersRepository.updatePassword(resetToken.customerId, await hashPassword(newPassword));
  await passwordResetTokensRepository.markUsed(resetToken.id);
  // Kicks out anyone holding a previously-leaked session token - a real
  // security property of a password reset, not just hygiene.
  await sessionsRepository.deleteAllForCustomer(resetToken.customerId);

  return c.json({ message: "Password updated. Please log in with your new password." }, 200);
});

// --- Orders ------------------------------------------------------------

const ordersRoute = createRoute({
  method: "post",
  path: "/orders",
  operationId: "createOrder",
  summary: "Place a new order (cash on delivery)",
  security: [{ bearerAuth: [] }], // requires a logged-in account - no more guest checkout
  request: {
    body: { content: { "application/json": { schema: OrderInputSchema } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: OrderResultSchema } },
      description: "The order was created.",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "The request was invalid, or the address isn't deliverable.",
    },
    401: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Not signed in.",
    },
  },
});
v1.openapi(ordersRoute, async (c) => {
  const body = c.req.valid("json");
  const { items, deliveryDate, fulfillmentType, address, customerName, notes } = body;

  // customerEmail/customerPhone are never read from the request body - the
  // server always takes the locked, verified values from the logged-in
  // account, same "never trust the client" rule the delivery fee and menu
  // prices already follow (see orders.ts).
  const customer = await customersRepository.findById(c.get("customerId"));
  if (!customer) {
    return c.json({ error: "unauthorized", message: "Sign in required." }, 401);
  }

  if (!isDeliveryDateStillOrderable(deliveryDate, new Date())) {
    return c.json(
      {
        error: "invalid_delivery_date",
        message: "That delivery date is no longer available. Please pick a valid Saturday.",
      },
      400,
    );
  }

  // The server ALWAYS re-derives the delivery fee itself here — mirroring
  // how priceOrder() re-derives menu prices below. The client never sends a
  // fee, distance, or coordinates; a quote fetched from /delivery-quote a
  // moment earlier is only ever a preview, never a token of authorization.
  let addressFields: OrderRecord["address"] = null;
  let addressLat: number | null = null;
  let addressLng: number | null = null;
  let distanceKm: number | null = null;
  let deliveryFeeCents = 0;

  if (fulfillmentType === "delivery") {
    if (!address) {
      return c.json({ error: "address_required", message: "A delivery address is required." }, 400);
    }
    const quote = quoteDeliveryForAddress(address);
    if (!quote.ok) {
      return c.json({ error: quote.reason, message: quote.message }, 400);
    }
    if (!quote.deliverable) {
      const message =
        quote.reason === "address_not_found"
          ? "We couldn't find that address. Please check it and try again."
          : quote.reason === "outside_berlin"
            ? "That address is outside Berlin — delivery isn't available there. You're welcome to pick up for free instead."
            : "That address is too far for delivery. You're welcome to pick up for free instead.";
      return c.json({ error: quote.reason, message }, 400);
    }
    addressFields = address;
    addressLat = quote.lat;
    addressLng = quote.lng;
    distanceKm = quote.distanceKm;
    deliveryFeeCents = quote.feeCents;
  }

  let pricedItems: OrderRecord["items"];
  try {
    pricedItems = priceOrder(items);
  } catch (err) {
    if (err instanceof OrderValidationError) {
      return c.json({ error: "invalid_items", message: err.message }, 400);
    }
    throw err;
  }

  const order: OrderRecord = {
    id: `ord_${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    deliveryDate,
    fulfillmentType,
    address: addressFields,
    addressLat,
    addressLng,
    distanceKm,
    deliveryFeeCents,
    customerId: customer.id,
    customerName: customerName.trim(),
    customerEmail: customer.email,
    customerPhone: customer.phone,
    notes: notes?.trim() || null,
    subtotalCents: pricedItems.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0),
    items: pricedItems,
  };

  await ordersRepository.insertOrder(order);
  // Checkout edits (name always; address when this was a delivery order)
  // write through to the account, so the next checkout starts pre-filled
  // with whatever was last used.
  await customersRepository.updateProfile(customer.id, {
    name: order.customerName,
    address: addressFields ?? undefined,
  });
  // Fans out to every registered listener (currently email + Telegram) and
  // waits for all of them - see orderEvents.ts for why a plain EventEmitter
  // isn't used here.
  await emitOrderCreated(order);

  return c.json(
    {
      orderId: order.id,
      deliveryDate: order.deliveryDate,
      fulfillmentType: order.fulfillmentType,
      distanceKm: order.distanceKm,
      subtotalCents: order.subtotalCents,
      deliveryFeeCents: order.deliveryFeeCents,
      totalCents: order.subtotalCents + order.deliveryFeeCents,
      paymentMethod: "cash_on_delivery" as const,
    },
    201,
  );
});

app.route("/v1", v1);

// The OpenAPI document a future app (or an AI coding agent building one)
// imports to generate a typed client - this IS the API reference; there is
// no separate hand-maintained document to drift from the code.
app.doc("/v1/doc", {
  openapi: "3.0.0",
  info: { title: "Dhaka Kacchi Ordering API", version: "1.0.0" },
  servers: [
    { url: "https://api.dhakakacchi.com/v1", description: "Production" },
    { url: "http://localhost:8787/v1", description: "Local development" },
  ],
});

export default app;
