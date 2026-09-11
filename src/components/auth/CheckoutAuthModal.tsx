import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/DkButton";
import { useSession } from "@/hooks/useSession";
import { api, ApiError, type DeliveryAddressInput } from "@/lib/api";

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
  "w-full px-4 py-4 bg-gold/[0.06] border border-line text-cream placeholder:text-muted-warm font-sans text-[0.88rem] outline-none focus:border-gold/50 transition-colors";

const linkClass =
  "font-sans text-[0.78rem] text-gold hover:text-gold-2 underline underline-offset-4";

type Step = "start" | "login" | "register" | "otp" | "forgot-password" | "forgot-password-sent";

export function CheckoutAuthModal({
  open,
  onClose,
  prefillAddress,
}: {
  open: boolean;
  onClose: () => void;
  prefillAddress?: DeliveryAddressInput;
}) {
  const session = useSession();
  const [step, setStep] = useState<Step>("start");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Login fields
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register fields
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [street, setStreet] = useState(prefillAddress?.street ?? "");
  const [houseNumber, setHouseNumber] = useState(prefillAddress?.houseNumber ?? "");
  const [postalCode, setPostalCode] = useState(prefillAddress?.postalCode ?? "");
  const [city, setCity] = useState(prefillAddress?.city ?? "Berlin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // OTP fields
  const [code, setCode] = useState("");

  // Forgot-password field
  const [forgotEmail, setForgotEmail] = useState("");

  function reset() {
    setStep("start");
    setError("");
    setLoginIdentifier("");
    setLoginPassword("");
    setCode("");
    setForgotEmail("");
  }

  function close() {
    reset();
    onClose();
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.login({
        identifier: loginIdentifier.trim(),
        password: loginPassword,
      });
      session.login(result.token, result.customer);
      close();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't log in right now. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.register({
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
      setStep("otp");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't start registration right now. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.verifyOtp({ phone: phone.trim(), code: code.trim() });
      session.login(result.token, result.customer);
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

  async function resendCode() {
    setBusy(true);
    setError("");
    try {
      await api.register({
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
      setError("A new code was sent.");
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
      <DialogContent className="bg-black-ink border-line rounded-none sm:rounded-none max-w-md">
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
              value={loginIdentifier}
              onChange={(e) => setLoginIdentifier(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className={inputClass}
            />
            {error && <p className="font-sans text-sm text-red-400">{error}</p>}
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
              placeholder="Phone number (e.g. +491701234567)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              required
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
            <input
              type="date"
              required
              placeholder="Date of birth"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className={inputClass}
            />
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
              <input
                type="text"
                required
                placeholder="Street"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                className={inputClass}
              />
              <input
                type="text"
                required
                placeholder="No."
                value={houseNumber}
                onChange={(e) => setHouseNumber(e.target.value)}
                className={`sm:w-24 ${inputClass}`}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="Postal code"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className={inputClass}
              />
              <input
                type="text"
                required
                placeholder="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={inputClass}
              />
            </div>
            <input
              type="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="Set a password (min. 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            {error && <p className="font-sans text-sm text-red-400">{error}</p>}
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
              We sent a 6-digit code to {phone}. Enter it below to finish creating your account.
            </p>
            <input
              type="text"
              required
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={`text-center tracking-[0.5em] ${inputClass}`}
            />
            {error && <p className="font-sans text-sm text-red-400">{error}</p>}
            <Button type="submit" variant="gold" className="w-full justify-center" disabled={busy}>
              {busy ? "Verifying…" : "Verify & create account"}
            </Button>
            <button type="button" className={linkClass} onClick={resendCode} disabled={busy}>
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
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              className={inputClass}
            />
            {error && <p className="font-sans text-sm text-red-400">{error}</p>}
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
