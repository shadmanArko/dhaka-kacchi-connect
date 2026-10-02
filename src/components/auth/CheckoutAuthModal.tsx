import { useMemo, useRef, useState } from "react";
import { validateDateOfBirth } from "@/lib/dateOfBirth";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/DkButton";
import { useSession } from "@/hooks/useSession";
import { api, ApiError } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";

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
 */

const inputClass =
  "w-full min-w-0 px-4 py-4 bg-gold/[0.06] border border-line-strong text-cream placeholder:text-muted-warm font-sans text-base outline-none focus:border-gold/50 transition-colors";

const invalidClass = "!border-red-400";

const linkClass =
  "font-sans text-[0.78rem] text-gold hover:text-gold-2 underline underline-offset-4";

type Step = "start" | "login" | "register" | "otp" | "forgot-password" | "forgot-password-sent";

export function CheckoutAuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession();
  const [step, setStep] = useState<Step>("start");
  const [error, setError] = useState("");
  // Affirmative messages (currently only "a new code was sent") need their own
  // state - they used to be written into `error`, which renders red, so a
  // successful resend looked like a failure. Must be cleared everywhere
  // setError("") is, or a stale success line sits next to a real error.
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

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
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  // A field's error only shows once the customer has left it (or tried to
  // submit) - never while they're still mid-typing "1" on the way to "15".
  const [dobTouched, setDobTouched] = useState({ day: false, month: false, year: false });
  const [dobSubmitAttempted, setDobSubmitAttempted] = useState(false);
  const { iso: dateOfBirth, errors: dobErrors } = useMemo(
    () => validateDateOfBirth(dobDay, dobMonth, dobYear),
    [dobDay, dobMonth, dobYear],
  );
  const showDob = (field: "day" | "month" | "year") => dobSubmitAttempted || dobTouched[field];
  const dayError = showDob("day") ? dobErrors.day : undefined;
  const monthError = showDob("month") ? dobErrors.month : undefined;
  const yearError = showDob("year") ? dobErrors.year : undefined;
  const dateError =
    showDob("year") && showDob("month") && showDob("day") ? dobErrors.date : undefined;
  const dobMessage = dayError ?? monthError ?? yearError ?? dateError;
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("Berlin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // OTP fields
  const [code, setCode] = useState("");
  // Which channel(s) the last register/resend call actually delivered to -
  // normally both, but may be just one if the other failed. Drives the
  // "we sent a code to X" copy on the otp step. Empty until the first
  // register response comes back.
  const [otpChannels, setOtpChannels] = useState<("sms" | "email")[]>([]);

  // Forgot-password field
  const [forgotEmail, setForgotEmail] = useState("");

  /**
   * Clears everything EXCEPT the eight non-secret registration fields.
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
    setCode("");
    setOtpChannels([]);
    setForgotEmail("");
  }

  /**
   * After a real login there is no draft left to come back to, so the rest of
   * the registration PII goes too rather than lingering in memory - and in the
   * DOM - for the remainder of the session.
   */
  function resetRegistrationDraft() {
    setPhone("");
    setName("");
    setDobDay("");
    setDobMonth("");
    setDobYear("");
    setDobTouched({ day: false, month: false, year: false });
    setDobSubmitAttempted(false);
    setStreet("");
    setHouseNumber("");
    setPostalCode("");
    setCity("Berlin");
    setEmail("");
  }

  function close() {
    reset();
    onClose();
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
      setError(
        err instanceof ApiError ? err.message : "Couldn't log in right now. Please try again.",
      );
      trackEvent("auth_login_failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!dateOfBirth) {
      setDobSubmitAttempted(true);
      const first = dobErrors.day ? dayRef : dobErrors.month ? monthRef : yearRef;
      first.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.register({
        phone: phone.trim(),
        name: name.trim(),
        dateOfBirth,
        address: {
          street: street.trim(),
          houseNumber: houseNumber.trim(),
          postalCode: postalCode.trim(),
          city: city.trim(),
        },
        email: email.trim(),
        password,
      });
      setOtpChannels(result.channels);
      setStep("otp");
      trackEvent("auth_registration_started");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't start registration right now. Please try again.",
      );
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

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.verifyOtp({ phone: phone.trim(), code: code.trim() });
      session.login(result.token, result.customer);
      trackEvent("auth_otp_verified");
      resetRegistrationDraft();
      close();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't verify that code right now. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  /** Re-runs registration to get a fresh code, sent to both phone and email
   * again (see worker/src/index.ts's registerRoute - every send goes to
   * both channels, not one-then-fallback). */
  async function resendCode() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.register({
        phone: phone.trim(),
        name: name.trim(),
        dateOfBirth,
        address: {
          street: street.trim(),
          houseNumber: houseNumber.trim(),
          postalCode: postalCode.trim(),
          city: city.trim(),
        },
        email: email.trim(),
        password,
      });
      setOtpChannels(result.channels);
      setNotice("A new code was sent.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't resend the code right now.");
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
      setError(
        err instanceof ApiError ? err.message : "Couldn't send that right now. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
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
              Checkout
            </DialogTitle>
            <p className="font-sans text-[0.85rem] text-muted-warm">
              Log in or create an account to finish your order.
            </p>
            <div className="grid grid-cols-1 gap-4">
              <Button
                type="button"
                variant="gold"
                className="justify-center"
                onClick={() => setStep("login")}
              >
                Log in
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="justify-center"
                onClick={() => setStep("register")}
              >
                Create account
              </Button>
            </div>
          </div>
        )}

        {step === "login" && (
          <form onSubmit={submitLogin} className="space-y-5">
            <DialogTitle className="font-serif font-light text-cream text-2xl">Log in</DialogTitle>
            <input
              type="text"
              required
              placeholder="Phone or email"
              aria-label="Phone number or email"
              autoComplete="username"
              value={loginIdentifier}
              onChange={(e) => setLoginIdentifier(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              required
              placeholder="Password"
              aria-label="Password"
              autoComplete="current-password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className={inputClass}
            />
            {error && (
              <p role="alert" className="font-sans text-sm text-red-400">
                {error}
              </p>
            )}
            <Button type="submit" variant="gold" className="w-full justify-center" disabled={busy}>
              {busy ? "Logging in…" : "Log in"}
            </Button>
            <div className="flex items-center justify-between">
              <button
                type="button"
                className={linkClass}
                onClick={() => setStep("forgot-password")}
              >
                Forgot password?
              </button>
              <button type="button" className={linkClass} onClick={() => setStep("register")}>
                Create an account
              </button>
            </div>
          </form>
        )}

        {step === "register" && (
          <form onSubmit={submitRegister} className="space-y-4">
            <DialogTitle className="font-serif font-light text-cream text-2xl">
              Create account
            </DialogTitle>
            <input
              type="tel"
              required
              inputMode="tel"
              placeholder="Phone number (e.g. +491701234567)"
              aria-label="Phone number"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={`ph-no-capture ${inputClass}`}
            />
            <input
              type="text"
              required
              placeholder="Full name"
              aria-label="Full name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`ph-no-capture ${inputClass}`}
            />
            <fieldset className="space-y-1.5 min-w-0">
              <legend className="block font-sans text-[0.68rem] uppercase tracking-[0.3em] text-gold-3">
                Date of birth
              </legend>
              <div className="grid grid-cols-[1fr_1fr_1.6fr] gap-3">
                <input
                  ref={dayRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="DD"
                  aria-label="Day of birth"
                  aria-invalid={!!(dayError ?? dateError)}
                  aria-describedby={dobMessage ? "dob-error" : undefined}
                  autoComplete="bday-day"
                  value={dobDay}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    setDobDay(v);
                    if (v.length === 2) monthRef.current?.focus();
                  }}
                  onBlur={() => setDobTouched((t) => ({ ...t, day: true }))}
                  className={`ph-no-capture min-w-0 text-center ${inputClass} ${dayError || dateError ? invalidClass : ""}`}
                />
                <input
                  ref={monthRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="MM"
                  aria-label="Month of birth"
                  aria-invalid={!!(monthError ?? dateError)}
                  aria-describedby={dobMessage ? "dob-error" : undefined}
                  autoComplete="bday-month"
                  value={dobMonth}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    setDobMonth(v);
                    if (v.length === 2) yearRef.current?.focus();
                  }}
                  onBlur={() => setDobTouched((t) => ({ ...t, month: true }))}
                  className={`ph-no-capture min-w-0 text-center ${inputClass} ${monthError || dateError ? invalidClass : ""}`}
                />
                <input
                  ref={yearRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="YYYY"
                  aria-label="Year of birth"
                  aria-invalid={!!(yearError ?? dateError)}
                  aria-describedby={dobMessage ? "dob-error" : undefined}
                  autoComplete="bday-year"
                  value={dobYear}
                  onChange={(e) => setDobYear(e.target.value.replace(/\D/g, ""))}
                  onBlur={() => setDobTouched((t) => ({ ...t, year: true }))}
                  className={`ph-no-capture min-w-0 text-center ${inputClass} ${yearError || dateError ? invalidClass : ""}`}
                />
              </div>
              {dobMessage && (
                <p id="dob-error" role="alert" className="font-sans text-sm text-red-400">
                  {dobMessage}
                </p>
              )}
            </fieldset>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
              <input
                type="text"
                required
                placeholder="Street"
                aria-label="Street"
                autoComplete="address-line1"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                className={`ph-no-capture ${inputClass}`}
              />
              <input
                type="text"
                required
                placeholder="No."
                aria-label="House number"
                autoComplete="address-line2"
                value={houseNumber}
                onChange={(e) => setHouseNumber(e.target.value)}
                className={`ph-no-capture sm:w-24 ${inputClass}`}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                inputMode="numeric"
                maxLength={5}
                placeholder="Postal code"
                aria-label="Postal code"
                autoComplete="postal-code"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className={`ph-no-capture ${inputClass}`}
              />
              <input
                type="text"
                required
                placeholder="City"
                aria-label="City"
                autoComplete="address-level2"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={`ph-no-capture ${inputClass}`}
              />
            </div>
            <input
              type="email"
              required
              placeholder="Email address"
              aria-label="Email address"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`ph-no-capture ${inputClass}`}
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="Set a password (min. 8 characters)"
              aria-label="Password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            {error && (
              <p role="alert" className="font-sans text-sm text-red-400">
                {error}
              </p>
            )}
            <Button type="submit" variant="gold" className="w-full justify-center" disabled={busy}>
              {busy ? "Sending code…" : "Continue"}
            </Button>
            <button type="button" className={linkClass} onClick={() => setStep("login")}>
              Already have an account? Log in
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={submitOtp} className="space-y-5">
            <DialogTitle className="font-serif font-light text-cream text-2xl">
              Verify your phone
            </DialogTitle>
            <p className="font-sans text-[0.85rem] text-muted-warm">
              {otpChannels.includes("sms") && otpChannels.includes("email")
                ? `We sent a 6-digit code to ${phone} and to ${email}. Enter it below to finish creating your account.`
                : otpChannels.includes("email")
                  ? `We emailed a 6-digit code to ${email}. Enter it below to finish creating your account.`
                  : `We sent a 6-digit code to ${phone}. Enter it below to finish creating your account.`}
            </p>
            {otpChannels.includes("email") && (
              <p className="font-sans text-[0.78rem] text-muted-warm/80">
                Don't see the email? Please check your spam or junk folder too.
              </p>
            )}
            <input
              type="text"
              required
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              aria-label="6-digit verification code"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={`text-center tracking-[0.5em] ${inputClass}`}
            />
            {error && (
              <p role="alert" className="font-sans text-sm text-red-400">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="font-sans text-sm text-gold">
                {notice}
              </p>
            )}
            <Button type="submit" variant="gold" className="w-full justify-center" disabled={busy}>
              {busy ? "Verifying…" : "Verify & create account"}
            </Button>
            <button
              type="button"
              className={linkClass}
              onClick={() => resendCode()}
              disabled={busy}
            >
              Resend code
            </button>
          </form>
        )}

        {step === "forgot-password" && (
          <form onSubmit={submitForgotPassword} className="space-y-5">
            <DialogTitle className="font-serif font-light text-cream text-2xl">
              Reset password
            </DialogTitle>
            <p className="font-sans text-[0.85rem] text-muted-warm">
              Enter your account email and we'll send you a link to set a new password.
            </p>
            <input
              type="email"
              required
              placeholder="Email address"
              autoComplete="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              className={inputClass}
            />
            {error && (
              <p role="alert" className="font-sans text-sm text-red-400">
                {error}
              </p>
            )}
            <Button type="submit" variant="gold" className="w-full justify-center" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
            <button type="button" className={linkClass} onClick={() => setStep("login")}>
              Back to log in
            </button>
          </form>
        )}

        {step === "forgot-password-sent" && (
          <div className="space-y-5">
            <DialogTitle className="font-serif font-light text-cream text-2xl">
              Check your email
            </DialogTitle>
            <p className="font-sans text-[0.85rem] text-muted-warm">
              If an account exists with that email, we've sent a link to reset your password.
            </p>
            <Button
              type="button"
              variant="gold"
              className="w-full justify-center"
              onClick={() => setStep("login")}
            >
              Back to log in
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
