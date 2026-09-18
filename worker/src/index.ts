import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import * as Sentry from "@sentry/node";
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
  ADMIN_SESSION_TTL_DAYS,
  PASSWORD_RESET_TTL_MINUTES,
  LOGIN_MAX_FAILED_ATTEMPTS,
  LOGIN_LOCKOUT_MINUTES,
} from "./lib/auth";
import { requireAuth, type AuthVariables } from "./lib/authMiddleware";
import { requireAdminAuth, type AdminAuthVariables } from "./lib/adminAuthMiddleware";
import { createPostgresAdminUsersRepository } from "./lib/adminUsersRepository";
import { createPostgresAdminSessionsRepository } from "./lib/adminSessionsRepository";
import { sendOtpSms } from "./lib/berlinSms";
import { toPublicCustomer, type AddressFields, type CustomerRecord } from "./lib/customers";
import { createPostgresCustomersRepository } from "./lib/customersRepository";
import {
  getAvailableDeliveryDates,
  isDeliveryDateStillOrderable,
  isValidSaturday,
} from "./lib/dates";
import { checkPostalCode, quoteDeliveryForAddress } from "./lib/delivery";
import {
  registerEmailNotifications,
  sendDiscountAppliedEmail,
  sendOrderUpdatedEmail,
  sendPasswordResetEmail,
} from "./lib/email";
import { emitOrderCreated } from "./lib/orderEvents";
import { OrderValidationError, priceOrder, totalCents, type OrderRecord } from "./lib/orders";
import { createPostgresOrdersRepository } from "./lib/ordersRepository";
import { createPostgresOtpRepository } from "./lib/otpRepository";
import { createPostgresPasswordResetTokensRepository } from "./lib/passwordResetTokensRepository";
import { createPostgresSessionsRepository } from "./lib/sessionsRepository";
import {
  handleTelegramWebhookBody,
  registerTelegramNotifications,
  sendDiscountAppliedTelegramMessage,
  sendOrderUpdatedTelegramMessage,
  secureCompare,
} from "./lib/telegram";
import {
  AdminAuthResultSchema,
  AdminCustomerSearchQuerySchema,
  AdminCustomerSearchResultSchema,
  AdminDiscountInputSchema,
  AdminLoginInputSchema,
  AdminMeResultSchema,
  AdminOrderInputSchema,
  AdminOrderListQuerySchema,
  AdminOrderListResponseSchema,
  AdminOrderResultSchema,
  AdminOrderUpdateInputSchema,
  AdminStatusInputSchema,
  AuthResultSchema,
  DeliveryAddressSchema,
  DeliveryQuoteResponseSchema,
  ErrorResponseSchema,
  LoginInputSchema,
  MenuItemSchema,
  MeResultSchema,
  CustomerOrderListResponseSchema,
  CustomerOrderResultSchema,
  MessageResultSchema,
  OrderInputSchema,
  OrderResultSchema,
  PasswordResetConfirmInputSchema,
  PasswordResetRequestInputSchema,
  PostalCodeCheckQuerySchema,
  PostalCodeCheckResponseSchema,
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
const adminUsersRepository = createPostgresAdminUsersRepository(pool);
const adminSessionsRepository = createPostgresAdminSessionsRepository(pool);
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
    // PATCH added for the admin panel's discount/status-update endpoints -
    // without it here, the CORS preflight succeeds but the browser then
    // silently refuses to send the actual PATCH request at all
    // (net::ERR_FAILED, no server-side log, since it never arrives).
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// Anything thrown inside a route handler and not caught locally lands here
// instead of Hono's default bare 500 - reported to Sentry (no-ops if
// SENTRY_DSN isn't set, see instrument.ts) so a real bug in, say, an order
// submission is something we find out about instead of only the customer.
app.onError((err, c) => {
  Sentry.captureException(err);
  console.error("Unhandled error:", err);
  return c.json(
    { error: "internal_error", message: "Something went wrong. Please try again." },
    500,
  );
});

// Health check stays unversioned and outside /v1 - it's for infra probes
// (Docker healthchecks, uptime monitors), not API consumers, and it should
// never break if the API's version ever changes.
app.get("/health", (c) => c.json({ ok: true }));

// Telegram webhook: send the bot any message from the owner's own chat, get
// back every upcoming order. Unversioned and outside /v1 like /health above -
// this is Telegram-to-us infra, not a customer/API-consumer surface, and
// deliberately never appears in the generated /v1/doc.
//
// Disabled (404) unless all three Telegram vars are set - same "optional
// integration degrades gracefully" rule the outbound alerts already follow.
// The secret-token header is checked BEFORE the body is ever parsed, both
// to reject non-Telegram traffic as cheaply as possible and so a malformed
// body from something that isn't real Telegram never reaches c.req.json().
//
// Always responds 200 once past the secret check - Telegram retries a
// webhook that doesn't get a fast 2xx, and retries here would mean
// duplicate replies (handleTelegramWebhookBody dedupes by update_id too,
// but there's no reason to invite retries in the first place). The actual
// work is intentionally NOT awaited: it's a DB query plus one-or-more
// outbound Telegram calls (which can be slowed further by rate-limit
// backoff - see telegram.ts), and responding fast avoids any risk of
// Telegram's own webhook timeout. The `.catch()` here is not optional -
// this is a long-lived Node process (not the Cloudflare-Workers-style
// isolate this app used to run on), so an unhandled rejection would crash
// the whole process, taking down real order-taking with it.
app.post("/telegram/webhook", async (c) => {
  if (!config.telegramBotToken || !config.telegramChatId || !config.telegramWebhookSecret) {
    return c.json({ ok: false }, 404);
  }

  const secretHeader = c.req.header("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!secureCompare(secretHeader, config.telegramWebhookSecret)) {
    return c.json({ ok: false }, 401);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: true }); // malformed body - nothing Telegram would ever send us
  }

  handleTelegramWebhookBody(body, ordersRepository).catch((err) => {
    Sentry.captureException(err);
    console.error("Telegram webhook handling failed:", err);
  });

  return c.json({ ok: true });
});

const v1 = new OpenAPIHono<{ Variables: AuthVariables }>();

// The first real "you must be signed in" checks in this codebase - see
// authMiddleware.ts. Registered before the routes they guard, since Hono
// composes middleware and handlers for a path in registration order.
v1.use("/orders", requireAuth(sessionsRepository));
// Hono matches these paths EXACTLY - "/orders" above does not cover
// "/orders/:id". Without this second line the order-detail route below would
// be completely unauthenticated, letting anyone read any order by guessing an
// id. The admin app needs the same pair for the same reason.
v1.use("/orders/*", requireAuth(sessionsRepository));
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

const postalCodeCheckRoute = createRoute({
  method: "get",
  path: "/postal-code-check",
  operationId: "checkPostalCode",
  summary: "Live-check whether a postal code is deliverable, and at what fee",
  security: [], // deliberately public - this whole API has no auth today
  request: { query: PostalCodeCheckQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: PostalCodeCheckResponseSchema } },
      description: "Whether the postal code is deliverable and, if so, at what fee.",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "The postal code isn't a valid 5-digit German PLZ.",
    },
  },
});
// Public, no mutation, postal-code-only - lets the order page show the
// delivery fee live as the customer types, with no button and without
// needing the rest of the address yet (see checkPostalCode's own doc
// comment for why this is a separate endpoint from /delivery-quote rather
// than a loosened version of it). Deliberately re-run in full by POST
// /orders at submission time, same as /delivery-quote - never trusted as
// authorization for the price used when the order is actually placed.
v1.openapi(postalCodeCheckRoute, (c) => {
  const { postalCode } = c.req.valid("query");
  const result = checkPostalCode(postalCode);
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
    Sentry.captureException(err);
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
    status: "received",
    discountCents: 0,
    discountReason: null,
    discountedAt: null,
    createdBy: "customer",
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
      address: order.address,
      distanceKm: order.distanceKm,
      subtotalCents: order.subtotalCents,
      deliveryFeeCents: order.deliveryFeeCents,
      totalCents: totalCents(order),
      paymentMethod: "cash_on_delivery" as const,
    },
    201,
  );
});

/** An OrderRecord as its OWN customer sees it. Deliberately not toAdminOrder:
 * that shape carries the customer's name/email/phone and createdBy, none of
 * which this caller needs handed back to them. Always includes totalCents()
 * rather than making the client recompute it. */
function toCustomerOrder(order: OrderRecord) {
  return {
    id: order.id,
    createdAt: order.createdAt,
    deliveryDate: order.deliveryDate,
    fulfillmentType: order.fulfillmentType,
    address: order.address,
    distanceKm: order.distanceKm,
    subtotalCents: order.subtotalCents,
    deliveryFeeCents: order.deliveryFeeCents,
    discountCents: order.discountCents,
    discountReason: order.discountReason,
    totalCents: totalCents(order),
    status: order.status,
    notes: order.notes,
    items: order.items,
  };
}

const listMyOrdersRoute = createRoute({
  method: "get",
  path: "/orders",
  operationId: "listMyOrders",
  summary: "List the signed-in customer's own orders",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: CustomerOrderListResponseSchema } },
      description: "The customer's orders, newest first.",
    },
    401: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Not signed in.",
    },
  },
});

v1.openapi(listMyOrdersRoute, async (c) => {
  const orders = await ordersRepository.listByCustomerId(c.get("customerId"));
  return c.json({ orders: orders.map(toCustomerOrder) }, 200);
});

const getMyOrderRoute = createRoute({
  method: "get",
  path: "/orders/{id}",
  operationId: "getMyOrder",
  summary: "Get one of the signed-in customer's own orders",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: CustomerOrderResultSchema } },
      description: "The order.",
    },
    401: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Not signed in.",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No such order, or it belongs to someone else.",
    },
  },
});

v1.openapi(getMyOrderRoute, async (c) => {
  const { id } = c.req.valid("param");
  const order = await ordersRepository.findById(id);
  // findById does no ownership check of its own, so it happens here. A
  // mismatch returns 404, NOT 403: a 403 would confirm that an order with
  // this id exists, which is exactly what someone enumerating ids wants.
  if (!order || order.customerId !== c.get("customerId")) {
    return c.json({ error: "not_found", message: "Order not found." }, 404);
  }
  return c.json({ order: toCustomerOrder(order) }, 200);
});

// --- Admin panel ---------------------------------------------------------
// A completely separate OpenAPIHono instance (its own Variables shape,
// AdminAuthVariables, and its own "adminBearerAuth" security scheme) - an
// admin token and a customer token are never interchangeable, and this
// keeps that true structurally, not just by convention. See
// adminAuthMiddleware.ts / adminUsersRepository.ts / adminSessionsRepository.ts,
// and migrations-manual/0001_admin_and_order_extensions.sql for how
// admin_users/admin_sessions actually reach the live database (never via
// `npm run db:migrate` - see that file's own comment).

const v1Admin = new OpenAPIHono<{ Variables: AdminAuthVariables }>();

v1Admin.use("/orders", requireAdminAuth(adminSessionsRepository));
v1Admin.use("/orders/*", requireAdminAuth(adminSessionsRepository));
v1Admin.use("/customers/*", requireAdminAuth(adminSessionsRepository));
v1Admin.use("/me", requireAdminAuth(adminSessionsRepository));
v1Admin.use("/logout", requireAdminAuth(adminSessionsRepository));

v1Admin.openAPIRegistry.registerComponent("securitySchemes", "adminBearerAuth", {
  type: "http",
  scheme: "bearer",
});

async function issueAdminSession(adminUserId: string): Promise<string> {
  const now = new Date();
  const token = generateSessionToken();
  await adminSessionsRepository.createSession({
    id: newId("asess"),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ADMIN_SESSION_TTL_DAYS * 24 * 60 * 60_000),
    adminUserId,
    tokenHash: hashToken(token),
  });
  return token;
}

/** The one place an OrderRecord becomes the shape the admin API hands
 * back - always includes totalCents() rather than making every caller
 * recompute subtotal + delivery - discount by hand. */
function toAdminOrder(order: OrderRecord) {
  return {
    id: order.id,
    createdAt: order.createdAt,
    deliveryDate: order.deliveryDate,
    fulfillmentType: order.fulfillmentType,
    address: order.address,
    distanceKm: order.distanceKm,
    deliveryFeeCents: order.deliveryFeeCents,
    customerId: order.customerId,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    notes: order.notes,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    discountReason: order.discountReason,
    totalCents: totalCents(order),
    status: order.status,
    createdBy: order.createdBy,
    items: order.items,
  };
}

const adminLoginRoute = createRoute({
  method: "post",
  path: "/login",
  operationId: "adminLogin",
  summary: "Admin login",
  security: [], // deliberately public - this is how an admin session begins
  request: {
    body: { content: { "application/json": { schema: AdminLoginInputSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AdminAuthResultSchema } },
      description: "Logged in.",
    },
    401: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Incorrect credentials.",
    },
  },
});
v1Admin.openapi(adminLoginRoute, async (c) => {
  const { email, password } = c.req.valid("json");
  const invalidCredentials = () =>
    c.json({ error: "invalid_credentials", message: "Incorrect email or password." }, 401 as const);

  const adminUser = await adminUsersRepository.findByEmail(email.trim().toLowerCase());
  if (!adminUser) return invalidCredentials();
  if (!(await verifyPassword(password, adminUser.passwordHash))) return invalidCredentials();

  const token = await issueAdminSession(adminUser.id);
  return c.json(
    { token, adminUser: { id: adminUser.id, email: adminUser.email, name: adminUser.name } },
    200,
  );
});

const adminLogoutRoute = createRoute({
  method: "post",
  path: "/logout",
  operationId: "adminLogout",
  summary: "Log out (invalidates the current admin session)",
  security: [{ adminBearerAuth: [] }],
  responses: {
    204: { description: "Logged out." },
    401: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Not signed in.",
    },
  },
});
v1Admin.openapi(adminLogoutRoute, async (c) => {
  const token = c.req.header("Authorization")!.slice(7);
  await adminSessionsRepository.deleteByTokenHash(hashToken(token));
  return c.body(null, 204);
});

const adminMeRoute = createRoute({
  method: "get",
  path: "/me",
  operationId: "adminMe",
  summary: "Get the currently logged-in admin user",
  security: [{ adminBearerAuth: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: AdminMeResultSchema } },
      description: "The logged-in admin.",
    },
    401: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Not signed in.",
    },
  },
});
v1Admin.openapi(adminMeRoute, async (c) => {
  const adminUser = await adminUsersRepository.findById(c.get("adminUserId"));
  if (!adminUser) {
    return c.json({ error: "unauthorized", message: "Sign in required." }, 401);
  }
  return c.json(
    { adminUser: { id: adminUser.id, email: adminUser.email, name: adminUser.name } },
    200,
  );
});

const adminListOrdersRoute = createRoute({
  method: "get",
  path: "/orders",
  operationId: "adminListOrders",
  summary: "List/search orders",
  security: [{ adminBearerAuth: [] }],
  request: { query: AdminOrderListQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: AdminOrderListResponseSchema } },
      description: "Matching orders, most recent first.",
    },
    401: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Not signed in.",
    },
  },
});
v1Admin.openapi(adminListOrdersRoute, async (c) => {
  const { deliveryDate, status, search } = c.req.valid("query");
  const orders = await ordersRepository.listAll({ deliveryDate, status, search });
  return c.json({ orders: orders.map(toAdminOrder) }, 200);
});

const adminGetOrderRoute = createRoute({
  method: "get",
  path: "/orders/{id}",
  operationId: "adminGetOrder",
  summary: "Get one order",
  security: [{ adminBearerAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: AdminOrderResultSchema } },
      description: "The order.",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No such order.",
    },
  },
});
v1Admin.openapi(adminGetOrderRoute, async (c) => {
  const { id } = c.req.valid("param");
  const order = await ordersRepository.findById(id);
  if (!order) return c.json({ error: "not_found", message: "Order not found." }, 404);
  return c.json({ order: toAdminOrder(order) }, 200);
});

const adminCustomerSearchRoute = createRoute({
  method: "get",
  path: "/customers/search",
  operationId: "adminCustomerSearch",
  summary: "Find an existing customer by exact phone or email",
  security: [{ adminBearerAuth: [] }],
  request: { query: AdminCustomerSearchQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: AdminCustomerSearchResultSchema } },
      description: "The matching customer, or null if none.",
    },
  },
});
v1Admin.openapi(adminCustomerSearchRoute, async (c) => {
  const { identifier } = c.req.valid("query");
  const found = await customersRepository.findByPhoneOrEmail(identifier.trim().toLowerCase());
  return c.json({ customer: found ? toPublicCustomer(found) : null }, 200);
});

// Staff order entry: a phone/WhatsApp customer may not have an email or
// date of birth on hand. `customers` requires both NOT NULL (email is also
// UNIQUE) - a deterministic, per-phone placeholder keeps that index happy
// without colliding across different phone-only customers; ".internal" is
// reserved by RFC 8375 specifically so nothing ever tries to route real
// mail there. sendConfirmationEmail already no-ops safely on any SMTP
// failure, so a placeholder just means no confirmation email goes out for
// that order, never a crash.
function staffPlaceholderEmail(phone: string): string {
  return `${phone.replace(/[^0-9]/g, "")}@staff.dhakakacchi.internal`;
}
const STAFF_PLACEHOLDER_DOB = "1970-01-01";
const STAFF_PLACEHOLDER_ADDRESS: AddressFields = {
  street: "N/A",
  houseNumber: "N/A",
  postalCode: "00000",
  city: "N/A",
};

const adminCreateOrderRoute = createRoute({
  method: "post",
  path: "/orders",
  operationId: "adminCreateOrder",
  summary: "Manually record an order placed by phone/WhatsApp",
  security: [{ adminBearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: AdminOrderInputSchema } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: AdminOrderResultSchema } },
      description: "The order was created.",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid input.",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "A customer with this phone or email already exists.",
    },
  },
});
v1Admin.openapi(adminCreateOrderRoute, async (c) => {
  const body = c.req.valid("json");
  const {
    items,
    deliveryDate,
    fulfillmentType,
    address,
    customerName,
    notes,
    existingCustomerId,
    newCustomer,
  } = body;

  if (!existingCustomerId && !newCustomer) {
    return c.json(
      { error: "customer_required", message: "Provide existingCustomerId or newCustomer." },
      400,
    );
  }
  if (existingCustomerId && newCustomer) {
    return c.json(
      { error: "invalid_input", message: "Provide only one of existingCustomerId or newCustomer." },
      400,
    );
  }

  // Deliberately isValidSaturday, not isDeliveryDateStillOrderable - staff
  // recording a late phone order is exactly the point of this endpoint, so
  // the Friday-18:00 cutoff is skipped, but the date must still be a real
  // Saturday.
  if (!isValidSaturday(deliveryDate)) {
    return c.json(
      { error: "invalid_delivery_date", message: "Delivery date must be a Saturday (YYYY-MM-DD)." },
      400,
    );
  }

  let customer: CustomerRecord;
  if (existingCustomerId) {
    const found = await customersRepository.findById(existingCustomerId);
    if (!found) {
      return c.json({ error: "customer_not_found", message: "No customer with that id." }, 400);
    }
    customer = found;
  } else {
    const input = newCustomer!;
    const phone = input.phone.trim();
    const newRecord: CustomerRecord = {
      id: newId("cust"),
      createdAt: new Date().toISOString(),
      phone,
      email: input.email?.trim().toLowerCase() || staffPlaceholderEmail(phone),
      name: input.name.trim(),
      dateOfBirth: input.dateOfBirth ?? STAFF_PLACEHOLDER_DOB,
      address: input.address ?? STAFF_PLACEHOLDER_ADDRESS,
      // A cryptographically random, never-communicated password - not a
      // "readable password" generator, same primitive a session token
      // uses. The customer can use "forgot password" later if they ever
      // want online login and have provided a real email.
      passwordHash: await hashPassword(generateSessionToken()),
    };
    try {
      await customersRepository.insertCustomer(newRecord);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return c.json(
          {
            error: "already_registered",
            message: "A customer with this phone or email already exists — search instead.",
          },
          409,
        );
      }
      throw err;
    }
    customer = newRecord;
  }

  // Same server-side re-derivation as the public POST /orders - never
  // trust the client for price/fee, admin or not.
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
            ? "That address is outside Berlin — delivery isn't available there."
            : "That address is too far for delivery.";
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
    id: newId("ord"),
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
    status: "received",
    discountCents: 0,
    discountReason: null,
    discountedAt: null,
    createdBy: "staff",
  };

  await ordersRepository.insertOrder(order);
  await customersRepository.updateProfile(customer.id, {
    name: order.customerName,
    address: addressFields ?? undefined,
  });
  // Same event as the public flow - Telegram + email fire identically for
  // a staff-entered order, with zero new notification code needed here.
  await emitOrderCreated(order);

  return c.json({ order: toAdminOrder(order) }, 201);
});

const adminApplyDiscountRoute = createRoute({
  method: "patch",
  path: "/orders/{id}/discount",
  operationId: "adminApplyDiscount",
  summary: "Set (or clear) an order's discount",
  security: [{ adminBearerAuth: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: AdminDiscountInputSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AdminOrderResultSchema } },
      description: "Discount applied.",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid discount.",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No such order.",
    },
  },
});
// Replaces (never accumulates) the order's current discount - calling this
// twice sets the discount to whatever the second call says, it doesn't
// stack. Re-fires the discount-applied notifications every successful
// call, by design (see email.ts/telegram.ts) - the admin UI must confirm
// before submitting, since a fumbled double-submit here double-notifies
// the customer/owner.
v1Admin.openapi(adminApplyDiscountRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { discountCents, discountReason } = c.req.valid("json");

  const order = await ordersRepository.findById(id);
  if (!order) return c.json({ error: "not_found", message: "Order not found." }, 404);
  if (order.status === "cancelled") {
    return c.json({ error: "order_cancelled", message: "Can't discount a cancelled order." }, 400);
  }

  const maxDiscount = order.subtotalCents + order.deliveryFeeCents;
  if (discountCents > maxDiscount) {
    return c.json(
      {
        error: "discount_too_large",
        message: `Discount can't exceed the order total (€${(maxDiscount / 100).toFixed(2)}).`,
      },
      400,
    );
  }

  await ordersRepository.applyDiscount(id, {
    discountCents,
    discountReason: discountReason?.trim() || null,
  });
  const updated = (await ordersRepository.findById(id))!;

  await Promise.allSettled([
    sendDiscountAppliedEmail(updated).catch((err) => {
      Sentry.captureException(err);
      console.error("sendDiscountAppliedEmail failed:", err);
    }),
    sendDiscountAppliedTelegramMessage(updated).catch((err) => {
      Sentry.captureException(err);
      console.error("sendDiscountAppliedTelegramMessage failed:", err);
    }),
  ]);

  return c.json({ order: toAdminOrder(updated) }, 200);
});

const adminUpdateOrderRoute = createRoute({
  method: "patch",
  path: "/orders/{id}",
  operationId: "adminUpdateOrder",
  summary: "Correct an already-placed order's items or delivery details",
  security: [{ adminBearerAuth: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: { "application/json": { schema: AdminOrderUpdateInputSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AdminOrderResultSchema } },
      description: "Order updated.",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid input, or the order can no longer be edited.",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No such order.",
    },
  },
});
// Re-fires the order-updated notifications every successful call, same
// "the admin UI must confirm before submitting" contract as
// adminApplyDiscountRoute - a fumbled double-submit here double-notifies the
// customer/owner.
v1Admin.openapi(adminUpdateOrderRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { items, deliveryDate, fulfillmentType, address } = c.req.valid("json");

  const previous = await ordersRepository.findById(id);
  if (!previous) return c.json({ error: "not_found", message: "Order not found." }, 404);
  if (previous.status === "cancelled" || previous.status === "delivered") {
    return c.json(
      {
        error: "order_locked",
        message: `Can't edit a ${previous.status} order.`,
      },
      400,
    );
  }

  // Deliberately isValidSaturday, not isDeliveryDateStillOrderable - same
  // reasoning as adminCreateOrderRoute: staff correcting an order is exactly
  // the point of skipping the customer-facing Friday-18:00 cutoff.
  if (!isValidSaturday(deliveryDate)) {
    return c.json(
      { error: "invalid_delivery_date", message: "Delivery date must be a Saturday (YYYY-MM-DD)." },
      400,
    );
  }

  // Same server-side re-derivation as adminCreateOrderRoute - never trust
  // the client for price/fee, admin or not.
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
            ? "That address is outside Berlin — delivery isn't available there."
            : "That address is too far for delivery.";
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

  await ordersRepository.updateOrder(id, {
    deliveryDate,
    fulfillmentType,
    address: addressFields,
    addressLat,
    addressLng,
    distanceKm,
    deliveryFeeCents,
    subtotalCents: pricedItems.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0),
    items: pricedItems,
  });
  const updated = (await ordersRepository.findById(id))!;

  await Promise.allSettled([
    sendOrderUpdatedEmail(previous, updated).catch((err) => {
      Sentry.captureException(err);
      console.error("sendOrderUpdatedEmail failed:", err);
    }),
    sendOrderUpdatedTelegramMessage(previous, updated).catch((err) => {
      Sentry.captureException(err);
      console.error("sendOrderUpdatedTelegramMessage failed:", err);
    }),
  ]);

  return c.json({ order: toAdminOrder(updated) }, 200);
});

const adminUpdateStatusRoute = createRoute({
  method: "patch",
  path: "/orders/{id}/status",
  operationId: "adminUpdateStatus",
  summary: "Update an order's status",
  security: [{ adminBearerAuth: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: AdminStatusInputSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AdminOrderResultSchema } },
      description: "Status updated.",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Order already cancelled.",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No such order.",
    },
  },
});
v1Admin.openapi(adminUpdateStatusRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { status } = c.req.valid("json");

  const order = await ordersRepository.findById(id);
  if (!order) return c.json({ error: "not_found", message: "Order not found." }, 404);
  if (order.status === "cancelled") {
    return c.json({ error: "order_cancelled", message: "This order is already cancelled." }, 400);
  }

  await ordersRepository.updateStatus(id, status);
  const updated = (await ordersRepository.findById(id))!;
  return c.json({ order: toAdminOrder(updated) }, 200);
});

app.route("/v1", v1);
app.route("/v1/admin", v1Admin);

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
