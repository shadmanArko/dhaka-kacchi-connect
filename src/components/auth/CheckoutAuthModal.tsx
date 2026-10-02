import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/DkButton";
import { PasswordToggle } from "@/components/ui/PasswordToggle";
import { TextField } from "@/components/ui/TextField";
import { useSession } from "@/hooks/useSession";
import { api, ApiError } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import { clearAuthDraft, readAuthDraft, writeAuthDraft } from "@/lib/authDraft";
import { validateDateOfBirth, type DobError } from "@/lib/dateOfBirth";
import { isValidPhone, normalizePhone } from "@/lib/phone";

/**
 * The login/register/OTP pop-up shown when an un-authenticated customer
 * presses "Checkout" on the order page. Deliberately a modal, not a
 * separate route - the item picker underneath never unmounts, so nothing
 * about the cart is lost while this is open.
 *
 * Uses the shadcn Dialog purely as an unstyled modal shell (see the
 * `className` override on DialogContent below) - every field inside is
 * styled to match the rest of the site, same as order.tsx, not shadcn's
 * default look.
 *
 * Form behaviour follows the usual conversion guidance for mobile sign-up:
 * visible labels, validate a field when the customer leaves it (never while
 * they are mid-word), specific messages, focus the first problem on submit,
 * the right keyboard per field, a show-password toggle, auto-submit of the
 * 6-digit code, and a draft that survives the tab being reloaded while the
 * customer reads their SMS (see authDraft.ts).
 */

const linkClass =
  "inline-flex min-h-11 items-center font-sans text-[0.8rem] text-gold hover:text-gold-2 underline underline-offset-4 disabled:opacity-50 disabled:no-underline";

const dobInputClass =
  "ph-no-capture w-full min-w-0 bg-gold/[0.06] border px-4 py-4 text-center font-sans text-base text-cream outline-none transition-colors placeholder:text-muted-warm focus:border-gold/50";

const RESEND_COOLDOWN_SECONDS = 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Step = "start" | "login" | "register" | "otp" | "forgot-password" | "forgot-password-sent";
type OtpChannel = "sms" | "email";
type FieldKey =
  | "phone"
  | "name"
  | "day"
  | "month"
  | "year"
  | "street"
  | "house"
  | "postal"
  | "city"
  | "email"
  | "password";

/** Document order - the first invalid field in this list gets focus on submit. */
const FIELD_ORDER: FieldKey[] = [
  "phone",
  "name",
  "day",
  "month",
  "year",
  "street",
  "house",
  "postal",
  "city",
  "email",
  "password",
];

const FIELD_IDS: Record<FieldKey, string> = {
  phone: "auth-phone",
  name: "auth-name",
  day: "auth-dob-day",
  month: "auth-dob-month",
  year: "auth-dob-year",
  street: "auth-street",
  house: "auth-house",
  postal: "auth-postal",
  city: "auth-city",
  email: "auth-email",
  password: "auth-password",
};

const NO_TOUCH: Record<FieldKey, boolean> = {
  phone: false,
  name: false,
  day: false,
  month: false,
  year: false,
  street: false,
  house: false,
  postal: false,
  city: false,
  email: false,
  password: false,
};

export function CheckoutAuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const session = useSession();
  const [step, setStep] = useState<Step>("start");
  const [error, setError] = useState("");
  // Affirmative messages (currently only "a new code was sent") need their own
  // state - they used to be written into `error`, which renders red, so a
  // successful resend looked like a failure. Must be cleared everywhere
  // setError("") is, or a stale success line sits next to a real error.
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Login fields
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register fields
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  // Three plain numeric fields, not <input type="date">: the native control
  // overflows its container on iOS Safari and renders unusably small mm/dd/yyyy
  // segments on Android Chrome - customers could not fill it and abandoned.
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("Berlin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  // A field's error only shows once the customer has left it (or tried to
  // submit) - never while they're still mid-typing "1" on the way to "15".
  const [touched, setTouched] = useState(NO_TOUCH);
  const [attempted, setAttempted] = useState(false);

  // OTP fields
  const [code, setCode] = useState("");
  // Which channel(s) the last register/resend call actually delivered to -
  // normally both, but may be just one if the other failed. Drives the
  // "we sent a code to X" copy on the otp step. Empty until the first
  // register response comes back.
  const [otpChannels, setOtpChannels] = useState<OtpChannel[]>([]);
  const [otpExpiresAt, setOtpExpiresAt] = useState("");
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const lastSubmittedCode = useRef("");

  // Forgot-password field
  const [forgotEmail, setForgotEmail] = useState("");
  const [restored, setRestored] = useState(false);

  const normalizedPhone = normalizePhone(phone);
  const dob = useMemo(
    () => validateDateOfBirth(dobDay, dobMonth, dobYear),
    [dobDay, dobMonth, dobYear],
  );

  const errors = useMemo(() => {
    const e: Partial<Record<FieldKey, string>> = {};
    const text = (d?: DobError) => (d ? t(d.key, d.values) : undefined);
    if (!isValidPhone(normalizedPhone)) e.phone = t("auth.err.phone");
    if (name.trim().length < 2) e.name = t("auth.err.name");
    if (dob.errors.day) e.day = text(dob.errors.day);
    if (dob.errors.month) e.month = text(dob.errors.month);
    if (dob.errors.year) e.year = text(dob.errors.year);
    // A date that fails only as a whole (31 April, 29 Feb 2001) is reported on
    // the year box, the last one the customer touches.
    if (dob.errors.date) e.year = text(dob.errors.date);
    if (!street.trim()) e.street = t("auth.err.street");
    if (!houseNumber.trim()) e.house = t("auth.err.house");
    if (!/^\d{5}$/.test(postalCode.trim())) e.postal = t("auth.err.postal");
    if (!city.trim()) e.city = t("auth.err.city");
    if (!EMAIL_PATTERN.test(email.trim())) e.email = t("auth.err.email");
    if (password.length < 8) e.password = t("auth.err.password");
    return e;
  }, [t, normalizedPhone, name, dob, street, houseNumber, postalCode, city, email, password]);

  const shown = (f: FieldKey) => (attempted || touched[f] ? errors[f] : undefined);
  const touch = (f: FieldKey) => setTouched((prev) => (prev[f] ? prev : { ...prev, [f]: true }));
  // One message under the whole date-of-birth group - the first problem.
  const dobMessage = shown("day") ?? shown("month") ?? shown("year");

  // Bring a freshly-set error into view: on a phone it is easily below the
  // keyboard or the fold, and "nothing happened" is how orders are lost.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [error]);

  // Restore a draft (and resume at the code step) each time the modal opens.
  useEffect(() => {
    if (!open) return;
    if (!restored) {
      const draft = readAuthDraft();
      if (draft) {
        setPhone(draft.phone ?? "");
        setName(draft.name ?? "");
        setDobDay(draft.dobDay ?? "");
        setDobMonth(draft.dobMonth ?? "");
        setDobYear(draft.dobYear ?? "");
        setStreet(draft.street ?? "");
        setHouseNumber(draft.houseNumber ?? "");
        setPostalCode(draft.postalCode ?? "");
        setCity(draft.city || "Berlin");
        setEmail(draft.email ?? "");
        if (draft.otp && new Date(draft.otp.expiresAt).getTime() > Date.now()) {
          setOtpChannels(draft.otp.channels);
          setOtpExpiresAt(draft.otp.expiresAt);
          setStep("otp");
        }
      }
      setRestored(true);
    } else if (otpExpiresAt && new Date(otpExpiresAt).getTime() > Date.now() && step === "start") {
      setStep("otp");
    }
  }, [open, restored, otpExpiresAt, step]);

  // Mirror the (non-secret) form into sessionStorage so a reload doesn't wipe it.
  useEffect(() => {
    if (!restored) return;
    writeAuthDraft({
      phone,
      name,
      dobDay,
      dobMonth,
      dobYear,
      street,
      houseNumber,
      postalCode,
      city,
      email,
      otp:
        step === "otp" && otpExpiresAt
          ? { channels: otpChannels, expiresAt: otpExpiresAt }
          : undefined,
    });
  }, [
    restored,
    phone,
    name,
    dobDay,
    dobMonth,
    dobYear,
    street,
    houseNumber,
    postalCode,
    city,
    email,
    step,
    otpChannels,
    otpExpiresAt,
  ]);

  // Drives the resend countdown only while it is on screen.
  useEffect(() => {
    if (step !== "otp") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);

  /**
   * Clears everything EXCEPT the non-secret registration fields.
   *
   * Those survive on purpose: registration is nine fields long, an accidental
   * X on a phone is easy, and losing that much typing is exactly how someone
   * abandons the order. The PASSWORD is the one deliberate exception - leave
   * it and a password the customer typed sits in a live DOM input for the
   * rest of the page's life, inside a modal they believe they dismissed, and
   * reopening shows it pre-filled and submittable.
   *
   * Retyping it costs them nothing, because a pending registration lives in
   * an OTP row rather than in `customers` (see the register handler in
   * worker/src/index.ts): `phoneOrEmailTaken` does not fire for an unverified
   * registrant, so re-submitting supersedes the pending record with a new
   * code and the newly typed password.
   */
  function reset() {
    setStep("start");
    setError("");
    setNotice("");
    setLoginIdentifier("");
    setLoginPassword("");
    setPassword("");
    setShowPassword(false);
    setCode("");
    lastSubmittedCode.current = "";
    setForgotEmail("");
  }

  /**
   * After a real login there is no draft left to come back to, so the rest of
   * the registration PII goes too rather than lingering in memory - and in the
   * DOM, and in sessionStorage - for the remainder of the session.
   */
  function resetRegistrationDraft() {
    setPhone("");
    setName("");
    setDobDay("");
    setDobMonth("");
    setDobYear("");
    setTouched(NO_TOUCH);
    setAttempted(false);
    setStreet("");
    setHouseNumber("");
    setPostalCode("");
    setCity("Berlin");
    setEmail("");
    setOtpChannels([]);
    setOtpExpiresAt("");
    clearAuthDraft();
  }

  function close() {
    reset();
    onClose();
  }

  function focusFirstInvalid() {
    const first = FIELD_ORDER.find((f) => errors[f]);
    if (!first) return;
    const el = document.getElementById(FIELD_IDS[first]);
    el?.focus();
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.login({
        identifier: loginIdentifier.trim(),
        password: loginPassword,
      });
      session.login(result.token, result.customer);
      trackEvent("auth_login_succeeded");
      resetRegistrationDraft();
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.login.failed"));
      trackEvent("auth_login_failed");
    } finally {
      setBusy(false);
    }
  }

  function registrationPayload() {
    return {
      phone: normalizedPhone,
      name: name.trim(),
      dateOfBirth: dob.iso,
      address: {
        street: street.trim(),
        houseNumber: houseNumber.trim(),
        postalCode: postalCode.trim(),
        city: city.trim(),
      },
      email: email.trim(),
      password,
    };
  }

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      setAttempted(true);
      // Wait a frame so the error messages are in the DOM before scrolling.
      requestAnimationFrame(focusFirstInvalid);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setPhone(normalizedPhone);
      const result = await api.register(registrationPayload());
      setOtpChannels(result.channels);
      setOtpExpiresAt(result.expiresAt);
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setNow(Date.now());
      setCode("");
      lastSubmittedCode.current = "";
      setStep("otp");
      trackEvent("auth_registration_started");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.register.failed"));
      // No free-text `error` property - a validation message can echo the
      // registrant's own input into PostHog. Status + kind aggregate better.
      trackEvent("auth_registration_failed", {
        status: err instanceof ApiError ? err.status : null,
        kind: err instanceof ApiError ? err.kind : "unknown",
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e?: React.FormEvent, codeOverride?: string) {
    e?.preventDefault();
    const submitted = (codeOverride ?? code).trim();
    if (!/^\d{6}$/.test(submitted)) {
      setError(t("auth.otp.codeInvalid"));
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.verifyOtp({ phone: normalizedPhone, code: submitted });
      session.login(result.token, result.customer);
      trackEvent("auth_otp_verified");
      resetRegistrationDraft();
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.otp.verifyFailed"));
    } finally {
      setBusy(false);
    }
  }

  // Auto-submit the moment the 6th digit lands (iOS/Android fill it straight
  // from the SMS). Guarded so one code is never submitted twice.
  useEffect(() => {
    if (step !== "otp" || busy || code.length !== 6) return;
    if (lastSubmittedCode.current === code) return;
    lastSubmittedCode.current = code;
    void submitOtp(undefined, code);
    // submitOtp is recreated every render; the ref guard makes this safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step, busy]);

  /** Re-runs registration to get a fresh code, sent to both phone and email
   * again (see worker/src/index.ts's registerRoute - every send goes to
   * both channels, not one-then-fallback). The password is never persisted,
   * so after a page reload it has to be typed again first. */
  async function resendCode() {
    if (!password) {
      setStep("register");
      setNotice(t("auth.otp.resendNeedsPassword"));
      requestAnimationFrame(() => document.getElementById(FIELD_IDS.password)?.focus());
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.register(registrationPayload());
      setOtpChannels(result.channels);
      setOtpExpiresAt(result.expiresAt);
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setNow(Date.now());
      setCode("");
      lastSubmittedCode.current = "";
      setNotice(t("auth.otp.resent"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.otp.resendFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function submitForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.requestPasswordReset(forgotEmail.trim());
      setStep("forgot-password-sent");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.forgot.failed"));
    } finally {
      setBusy(false);
    }
  }

  const resendSecondsLeft = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));

  const errorBlock = error && (
    <p ref={errorRef} role="alert" className="font-sans text-sm text-red-400">
      {error}
    </p>
  );
  const noticeBlock = notice && (
    <p role="status" className="font-sans text-sm text-gold">
      {notice}
    </p>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="bg-black-ink border-line rounded-none sm:rounded-none max-w-md max-h-[90dvh] overflow-y-auto overflow-x-hidden"
        // Tapping/clicking outside is a common accidental gesture on mobile
        // (dismissing the keyboard, say) - it shouldn't silently discard a
        // half-finished login/registration. Only the explicit X button (or
        // Escape, left untouched for desktop keyboard users) closes this.
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {step === "start" && (
          <div className="space-y-6">
            <DialogTitle className="font-serif font-light text-cream text-2xl">
              {t("auth.start.title")}
            </DialogTitle>
            <p className="font-sans text-[0.85rem] text-muted-warm">{t("auth.start.intro")}</p>
            <div className="grid grid-cols-1 gap-4">
              <Button
                type="button"
                variant="gold"
                className="justify-center"
                onClick={() => setStep("login")}
              >
                {t("auth.login.submit")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="justify-center"
                onClick={() => setStep("register")}
              >
                {t("auth.register.title")}
              </Button>
            </div>
          </div>
        )}

        {step === "login" && (
          <form onSubmit={submitLogin} className="space-y-5">
            <DialogTitle className="font-serif font-light text-cream text-2xl">
              {t("auth.login.title")}
            </DialogTitle>
            <TextField
              id="auth-login-identifier"
              label={t("auth.login.identifier")}
              type="text"
              required
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              value={loginIdentifier}
              onValueChange={setLoginIdentifier}
            />
            <TextField
              id="auth-login-password"
              label={t("auth.password.label")}
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              enterKeyHint="go"
              value={loginPassword}
              onValueChange={setLoginPassword}
              sensitive={false}
              trailing={
                <PasswordToggle
                  shown={showPassword}
                  onToggle={() => setShowPassword((s) => !s)}
                  showLabel={t("auth.password.show")}
                  hideLabel={t("auth.password.hide")}
                />
              }
            />
            {errorBlock}
            <Button type="submit" variant="gold" className="w-full justify-center" disabled={busy}>
              {busy ? t("auth.login.busy") : t("auth.login.submit")}
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-x-4">
              <button
                type="button"
                className={linkClass}
                onClick={() => {
                  setError("");
                  setStep("forgot-password");
                }}
              >
                {t("auth.login.forgot")}
              </button>
              <button
                type="button"
                className={linkClass}
                onClick={() => {
                  setError("");
                  setStep("register");
                }}
              >
                {t("auth.login.createLink")}
              </button>
            </div>
          </form>
        )}

        {step === "register" && (
          <form onSubmit={submitRegister} noValidate className="space-y-4">
            <DialogTitle className="font-serif font-light text-cream text-2xl">
              {t("auth.register.title")}
            </DialogTitle>
            <TextField
              id={FIELD_IDS.phone}
              label={t("auth.register.phone")}
              hint={t("auth.register.phoneHint")}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="next"
              placeholder="0170 1234567"
              value={phone}
              onValueChange={setPhone}
              onBlur={() => {
                touch("phone");
                // Show the customer exactly what will be sent, once it is usable.
                if (isValidPhone(normalizedPhone)) setPhone(normalizedPhone);
              }}
              error={shown("phone")}
            />
            <TextField
              id={FIELD_IDS.name}
              label={t("auth.register.name")}
              type="text"
              autoComplete="name"
              enterKeyHint="next"
              value={name}
              onValueChange={setName}
              onBlur={() => touch("name")}
              error={shown("name")}
            />
            <fieldset className="min-w-0 space-y-1.5">
              <legend className="block font-sans text-[0.68rem] uppercase tracking-[0.3em] text-gold-3">
                {t("auth.register.dob")}
              </legend>
              <div className="grid grid-cols-[1fr_1fr_1.6fr] gap-3">
                <input
                  id={FIELD_IDS.day}
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder={t("auth.dob.dayPlaceholder")}
                  aria-label={t("auth.dob.dayLabel")}
                  aria-invalid={shown("day") ? true : undefined}
                  aria-describedby={dobMessage ? "auth-dob-error" : undefined}
                  autoComplete="bday-day"
                  enterKeyHint="next"
                  value={dobDay}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    setDobDay(v);
                    if (v.length === 2) monthRef.current?.focus();
                  }}
                  onBlur={() => touch("day")}
                  className={`${dobInputClass} ${shown("day") ? "border-red-400" : "border-line-strong"}`}
                />
                <input
                  ref={monthRef}
                  id={FIELD_IDS.month}
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder={t("auth.dob.monthPlaceholder")}
                  aria-label={t("auth.dob.monthLabel")}
                  aria-invalid={shown("month") ? true : undefined}
                  aria-describedby={dobMessage ? "auth-dob-error" : undefined}
                  autoComplete="bday-month"
                  enterKeyHint="next"
                  value={dobMonth}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    setDobMonth(v);
                    if (v.length === 2) yearRef.current?.focus();
                  }}
                  onBlur={() => touch("month")}
                  className={`${dobInputClass} ${shown("month") ? "border-red-400" : "border-line-strong"}`}
                />
                <input
                  ref={yearRef}
                  id={FIELD_IDS.year}
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder={t("auth.dob.yearPlaceholder")}
                  aria-label={t("auth.dob.yearLabel")}
                  aria-invalid={shown("year") ? true : undefined}
                  aria-describedby={dobMessage ? "auth-dob-error" : undefined}
                  autoComplete="bday-year"
                  enterKeyHint="next"
                  value={dobYear}
                  onChange={(e) => setDobYear(e.target.value.replace(/\D/g, ""))}
                  onBlur={() => touch("year")}
                  className={`${dobInputClass} ${shown("year") ? "border-red-400" : "border-line-strong"}`}
                />
              </div>
              {dobMessage && (
                <p id="auth-dob-error" role="alert" className="font-sans text-sm text-red-400">
                  {dobMessage}
                </p>
              )}
            </fieldset>
            <div className="grid grid-cols-[1fr_6.5rem] gap-3">
              <TextField
                id={FIELD_IDS.street}
                label={t("auth.register.street")}
                type="text"
                autoComplete="address-line1"
                enterKeyHint="next"
                value={street}
                onValueChange={setStreet}
                onBlur={() => touch("street")}
                error={shown("street")}
              />
              <TextField
                id={FIELD_IDS.house}
                label={t("auth.register.house")}
                type="text"
                autoComplete="address-line2"
                enterKeyHint="next"
                maxLength={20}
                value={houseNumber}
                onValueChange={setHouseNumber}
                onBlur={() => touch("house")}
                error={shown("house")}
              />
            </div>
            <div className="grid grid-cols-[1fr_1.4fr] gap-3">
              <TextField
                id={FIELD_IDS.postal}
                label={t("auth.register.postal")}
                type="text"
                inputMode="numeric"
                maxLength={5}
                autoComplete="postal-code"
                enterKeyHint="next"
                value={postalCode}
                onValueChange={(v) => setPostalCode(v.replace(/\D/g, ""))}
                onBlur={() => touch("postal")}
                error={shown("postal")}
              />
              <TextField
                id={FIELD_IDS.city}
                label={t("auth.register.city")}
                type="text"
                autoComplete="address-level2"
                enterKeyHint="next"
                value={city}
                onValueChange={setCity}
                onBlur={() => touch("city")}
                error={shown("city")}
              />
            </div>
            <TextField
              id={FIELD_IDS.email}
              label={t("auth.register.email")}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              value={email}
              onValueChange={setEmail}
              onBlur={() => touch("email")}
              error={shown("email")}
            />
            <TextField
              id={FIELD_IDS.password}
              label={t("auth.password.label")}
              hint={t("auth.password.hint")}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              enterKeyHint="go"
              value={password}
              onValueChange={setPassword}
              onBlur={() => touch("password")}
              error={shown("password")}
              sensitive={false}
              trailing={
                <PasswordToggle
                  shown={showPassword}
                  onToggle={() => setShowPassword((s) => !s)}
                  showLabel={t("auth.password.show")}
                  hideLabel={t("auth.password.hide")}
                />
              }
            />
            {errorBlock}
            {noticeBlock}
            <Button type="submit" variant="gold" className="w-full justify-center" disabled={busy}>
              {busy ? t("auth.register.busy") : t("auth.register.submit")}
            </Button>
            <button
              type="button"
              className={linkClass}
              onClick={() => {
                setError("");
                setNotice("");
                setStep("login");
              }}
            >
              {t("auth.register.haveAccount")}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={(e) => submitOtp(e)} className="space-y-5">
            <DialogTitle className="font-serif font-light text-cream text-2xl">
              {t("auth.otp.title")}
            </DialogTitle>
            <p className="font-sans text-[0.85rem] text-muted-warm">
              {otpChannels.includes("sms") && otpChannels.includes("email")
                ? t("auth.otp.bothSent", { phone: normalizedPhone, email })
                : otpChannels.includes("email")
                  ? t("auth.otp.emailSent", { email })
                  : t("auth.otp.smsSent", { phone: normalizedPhone })}
            </p>
            {otpChannels.includes("email") && (
              <p className="font-sans text-[0.78rem] text-muted-warm/80">
                {t("auth.otp.spamHint")}
              </p>
            )}
            <TextField
              id="auth-otp"
              label={t("auth.otp.codeLabel")}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              enterKeyHint="go"
              autoFocus
              value={code}
              onValueChange={(v) => setCode(v.replace(/\D/g, ""))}
              className="text-center tracking-[0.5em]"
              sensitive={false}
            />
            {errorBlock}
            {noticeBlock}
            <Button
              type="submit"
              variant="gold"
              className="w-full justify-center"
              disabled={busy || code.length !== 6}
            >
              {busy ? t("auth.otp.verifying") : t("auth.otp.verify")}
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-x-4">
              <button
                type="button"
                className={linkClass}
                onClick={() => resendCode()}
                disabled={busy || resendSecondsLeft > 0}
              >
                {resendSecondsLeft > 0
                  ? t("auth.otp.resendIn", { seconds: resendSecondsLeft })
                  : t("auth.otp.resend")}
              </button>
              <button
                type="button"
                className={linkClass}
                onClick={() => {
                  setError("");
                  setNotice("");
                  setOtpExpiresAt("");
                  setStep("register");
                }}
              >
                {t("auth.otp.changeDetails")}
              </button>
            </div>
          </form>
        )}

        {step === "forgot-password" && (
          <form onSubmit={submitForgotPassword} className="space-y-5">
            <DialogTitle className="font-serif font-light text-cream text-2xl">
              {t("auth.forgot.title")}
            </DialogTitle>
            <p className="font-sans text-[0.85rem] text-muted-warm">{t("auth.forgot.intro")}</p>
            <TextField
              id="auth-forgot-email"
              label={t("auth.register.email")}
              type="email"
              inputMode="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              value={forgotEmail}
              onValueChange={setForgotEmail}
            />
            {errorBlock}
            <Button type="submit" variant="gold" className="w-full justify-center" disabled={busy}>
              {busy ? t("auth.forgot.busy") : t("auth.forgot.submit")}
            </Button>
            <button
              type="button"
              className={linkClass}
              onClick={() => {
                setError("");
                setStep("login");
              }}
            >
              {t("auth.forgot.back")}
            </button>
          </form>
        )}

        {step === "forgot-password-sent" && (
          <div className="space-y-5">
            <DialogTitle className="font-serif font-light text-cream text-2xl">
              {t("auth.forgot.sentTitle")}
            </DialogTitle>
            <p className="font-sans text-[0.85rem] text-muted-warm">{t("auth.forgot.sentBody")}</p>
            <Button
              type="button"
              variant="gold"
              className="w-full justify-center"
              onClick={() => setStep("login")}
            >
              {t("auth.forgot.back")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
