import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHero } from "@/components/sections/PageHero";
import { PasswordToggle } from "@/components/ui/PasswordToggle";
import { Reveal } from "@/components/ui/Reveal";
import { TextField } from "@/components/ui/TextField";
import { LocaleLink } from "@/components/layout/LocaleLink";
import { api, ApiError } from "@/lib/api";

type Mode = "set" | "request" | "requestSent" | "done";

const submitClass =
  "w-full bg-gold text-black-ink px-9 py-5 font-sans text-[0.8rem] uppercase tracking-[0.25em] hover:bg-gold-2 transition-colors disabled:opacity-50";

/**
 * Reached from the emailed reset link (`?token=...`). An expired or used link
 * used to be a dead end - "request a new one" with nowhere to do it - so the
 * request-a-new-link form lives right here, shown whenever there is no usable
 * token.
 */
export function ResetPasswordPage({ token }: { token?: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>(token ? "set" : "request");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);

  const passwordError = touched && newPassword.length < 8 ? t("auth.err.password") : undefined;

  async function onSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (newPassword.length < 8) {
      setTouched(true);
      document.getElementById("reset-password")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.confirmPasswordReset(token, newPassword);
      setMode("done");
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_token") {
        // Expired or already used: send them straight to getting a fresh link.
        setError(err.message);
        setMode("request");
      } else {
        setError(err instanceof ApiError ? err.message : t("resetPassword.failed"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRequestLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.requestPasswordReset(email.trim());
      setMode("requestSent");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.forgot.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHero
        eyebrow={t("resetPassword.eyebrow")}
        title={<>{t("resetPassword.title")}</>}
        body={t("resetPassword.body")}
      />
      <section className="bg-deep border-t border-line py-20 md:py-28 px-6 md:px-14">
        <Reveal className="max-w-[480px] mx-auto">
          {mode === "done" && (
            <div className="text-center space-y-6">
              <p className="font-sans text-[0.96rem] text-muted-warm">{t("resetPassword.done")}</p>
              <LocaleLink
                to="/order"
                className="inline-flex items-center gap-4 font-sans text-[0.8rem] tracking-[0.25em] uppercase font-normal transition-all duration-300 no-underline border border-gold/40 text-cream px-9 py-[18px] hover:border-gold hover:text-gold hover:-translate-y-0.5"
              >
                <span>{t("resetPassword.goToOrder")}</span>
              </LocaleLink>
            </div>
          )}

          {mode === "set" && (
            <form onSubmit={onSetPassword} noValidate className="space-y-5">
              <TextField
                id="reset-password"
                label={t("resetPassword.newPassword")}
                hint={t("auth.password.hint")}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                enterKeyHint="go"
                autoFocus
                value={newPassword}
                onValueChange={setNewPassword}
                onBlur={() => setTouched(true)}
                error={passwordError}
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
              {error && (
                <p role="alert" className="font-sans text-sm text-red-400">
                  {error}
                </p>
              )}
              <button type="submit" disabled={busy} className={submitClass}>
                {busy ? t("resetPassword.updating") : t("resetPassword.submit")}
              </button>
            </form>
          )}

          {mode === "request" && (
            <form onSubmit={onRequestLink} className="space-y-5">
              <p className="font-sans text-[0.9rem] leading-[1.8] text-muted-warm">
                {error || t("resetPassword.missingToken")}
              </p>
              <TextField
                id="reset-email"
                label={t("auth.register.email")}
                type="email"
                inputMode="email"
                required
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                value={email}
                onValueChange={setEmail}
              />
              <button type="submit" disabled={busy} className={submitClass}>
                {busy ? t("auth.forgot.busy") : t("auth.forgot.submit")}
              </button>
            </form>
          )}

          {mode === "requestSent" && (
            <div className="text-center space-y-4">
              <p className="font-serif font-light text-cream text-2xl">
                {t("auth.forgot.sentTitle")}
              </p>
              <p className="font-sans text-[0.9rem] leading-[1.8] text-muted-warm">
                {t("auth.forgot.sentBody")}
              </p>
            </div>
          )}
        </Reveal>
      </section>
    </>
  );
}
