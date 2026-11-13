import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellRing, CalendarDays, CircleCheck, MailCheck, ShieldCheck } from "lucide-react";
import { PageHero } from "@/components/sections/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { LocaleLink } from "@/components/layout/LocaleLink";
import { api, ApiError } from "@/lib/api";
import { trackWarehouseEvent } from "@/lib/analytics";

type FormState = "idle" | "loading" | "sent";
type LinkState = "none" | "working" | "done" | "failed";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Matches the server's per-address throttle (RESEND_THROTTLE_SECONDS): resending
// sooner would be silently ignored, so the button waits instead of lying.
const RESEND_SECONDS = 120;

const BENEFITS = [
  { Icon: BellRing, key: "subscribe.benefit1" },
  { Icon: CalendarDays, key: "subscribe.benefit2" },
  { Icon: ShieldCheck, key: "subscribe.benefit3" },
] as const;

const panelClass = "mx-auto max-w-[560px] border border-line bg-surface px-8 py-10 text-center";
const buttonClass =
  "bg-gold text-black-ink px-9 py-5 font-sans text-[0.75rem] uppercase tracking-[0.25em] hover:bg-gold-2 active:bg-gold-3 transition-colors disabled:opacity-60";

/**
 * Newsletter sign-up, with three modes picked by the URL:
 *   /subscribe                  the form (and, after submitting, "check your inbox")
 *   /subscribe?confirm=TOKEN    the double-opt-in link from the confirmation email
 *   /subscribe?unsubscribe=TOKEN the opt-out link from any later email
 * The unsubscribe link only SHOWS a button; the opt-out happens on the click,
 * because mail scanners prefetch links and must not unsubscribe people.
 */
export function SubscribePage({
  confirmToken,
  unsubscribeToken,
}: {
  confirmToken?: string;
  unsubscribeToken?: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "de" ? "de" : "en";
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [resendNotice, setResendNotice] = useState("");
  const [confirmState, setConfirmState] = useState<LinkState>(confirmToken ? "working" : "none");
  const [confirmError, setConfirmError] = useState("");
  const [unsubState, setUnsubState] = useState<LinkState>("none");
  const [unsubError, setUnsubError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Confirm automatically when arriving from the email: the person already
  // chose to subscribe, and the link is single-use and expires.
  useEffect(() => {
    if (!confirmToken) return;
    let cancelled = false;
    setConfirmState("working");
    api
      .confirmSubscription(confirmToken)
      .then(() => {
        if (cancelled) return;
        setConfirmState("done");
        // The sign-up only counts once it is confirmed.
        trackWarehouseEvent("newsletter_signup");
      })
      .catch((err) => {
        if (cancelled) return;
        setConfirmState("failed");
        setConfirmError(err instanceof ApiError ? err.message : t("subscribe.genericError"));
      });
    return () => {
      cancelled = true;
    };
    // `t` only changes with the language; the token is what drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmToken]);

  useEffect(() => {
    if (formState !== "sent") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [formState]);

  async function submit(address: string, isResend: boolean) {
    const trimmed = address.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError(t("subscribe.invalidEmail"));
      inputRef.current?.focus();
      return;
    }
    setError("");
    setResendNotice("");
    setFormState("loading");
    try {
      await api.subscribe(trimmed, locale, honeypot);
      setSentTo(trimmed);
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
      setNow(Date.now());
      setFormState("sent");
      if (isResend) setResendNotice(t("subscribe.resent"));
    } catch (err) {
      setFormState(isResend ? "sent" : "idle");
      setError(err instanceof ApiError ? err.message : t("subscribe.genericError"));
    }
  }

  async function unsubscribe() {
    if (!unsubscribeToken) return;
    setUnsubState("working");
    setUnsubError("");
    try {
      await api.unsubscribe(unsubscribeToken);
      setUnsubState("done");
    } catch (err) {
      setUnsubState("failed");
      setUnsubError(err instanceof ApiError ? err.message : t("subscribe.genericError"));
    }
  }

  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const showForm = formState !== "sent" && confirmState !== "done" && !unsubscribeToken;

  return (
    <>
      <PageHero
        eyebrow={t("subscribe.hero.eyebrow")}
        title={
          <>
            {t("subscribe.hero.titleLine1")}
            <br />
            <em>{t("subscribe.hero.titleEm")}</em>
          </>
        }
        body={t("subscribe.hero.body")}
      />

      <section className="border-t border-line bg-deep py-20 md:py-28 px-6 md:px-14">
        <Reveal className="mx-auto max-w-[680px] space-y-10">
          {/* --- Unsubscribe link from an email --- */}
          {unsubscribeToken && unsubState !== "done" && (
            <div className={panelClass}>
              <h2 className="font-serif font-light text-cream text-2xl">
                {t("subscribe.unsub.title")}
              </h2>
              <p className="mt-3 font-sans text-[0.92rem] leading-[1.8] text-muted-warm">
                {t("subscribe.unsub.body")}
              </p>
              {unsubState === "failed" && (
                <p role="alert" className="mt-4 font-sans text-sm text-red-400">
                  {unsubError}
                </p>
              )}
              <button
                type="button"
                onClick={unsubscribe}
                disabled={unsubState === "working"}
                className={`${buttonClass} mt-7`}
              >
                {unsubState === "working" ? t("subscribe.sending") : t("subscribe.unsub.confirm")}
              </button>
              <p className="mt-5 font-sans text-[0.8rem]">
                <LocaleLink to="/" className="text-muted-warm underline underline-offset-4">
                  {t("subscribe.unsub.keep")}
                </LocaleLink>
              </p>
            </div>
          )}
          {unsubscribeToken && unsubState === "done" && (
            <div className={panelClass} role="status">
              <h2 className="font-serif font-light text-cream text-2xl">
                {t("subscribe.unsub.doneTitle")}
              </h2>
              <p className="mt-3 font-sans text-[0.92rem] leading-[1.8] text-muted-warm">
                {t("subscribe.unsub.doneBody")}
              </p>
              <p className="mt-6 font-sans text-[0.8rem]">
                <LocaleLink to="/subscribe" className="text-gold underline underline-offset-4">
                  {t("subscribe.unsub.again")}
                </LocaleLink>
              </p>
            </div>
          )}

          {/* --- Confirmation link from the confirmation email --- */}
          {confirmState === "working" && (
            <p role="status" className="text-center font-sans text-muted-warm">
              {t("subscribe.confirming")}
            </p>
          )}
          {confirmState === "done" && (
            <div className={panelClass} role="status">
              <CircleCheck className="mx-auto text-gold" size={44} strokeWidth={1.25} aria-hidden />
              <h2 className="mt-5 font-serif font-light text-cream text-3xl">
                {t("subscribe.confirmedTitle")}
              </h2>
              <p className="mt-3 font-sans text-[0.92rem] leading-[1.8] text-muted-warm">
                {t("subscribe.confirmed")}
              </p>
              <LocaleLink
                to="/order"
                className="mt-8 inline-flex items-center gap-4 border border-gold/40 px-9 py-[18px] font-sans text-[0.8rem] uppercase tracking-[0.25em] text-cream no-underline transition-all hover:-translate-y-0.5 hover:border-gold hover:text-gold"
              >
                <span>{t("subscribe.orderCta")}</span>
              </LocaleLink>
            </div>
          )}
          {confirmState === "failed" && (
            <p
              role="alert"
              className="mx-auto max-w-[560px] border border-red-400/40 bg-red-400/[0.06] px-5 py-4 text-center font-sans text-sm text-red-300"
            >
              {confirmError || t("subscribe.confirmFailed")}
            </p>
          )}

          {/* --- The sign-up form --- */}
          {showForm && (
            <>
              <ul className="mx-auto grid max-w-[560px] gap-4">
                {BENEFITS.map(({ Icon, key }) => (
                  <li key={key} className="flex items-start gap-4 text-left">
                    <Icon
                      className="mt-0.5 shrink-0 text-gold"
                      size={22}
                      strokeWidth={1.4}
                      aria-hidden
                    />
                    <span className="font-sans text-[0.95rem] leading-[1.7] text-cream">
                      {t(key)}
                    </span>
                  </li>
                ))}
              </ul>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(email, false);
                }}
                noValidate
                className="mx-auto max-w-[560px]"
              >
                <label
                  htmlFor="email"
                  className="mb-2 block font-sans text-[0.68rem] uppercase tracking-[0.3em] text-gold-3"
                >
                  {t("subscribe.emailLabel")}
                </label>
                <div className="flex flex-col sm:flex-row">
                  <input
                    ref={inputRef}
                    id="email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="send"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "subscribe-error" : "subscribe-consent"}
                    placeholder={t("subscribe.emailPlaceholder")}
                    className={`min-w-0 flex-1 border bg-gold/[0.06] px-6 py-5 font-sans text-base text-cream outline-none transition-colors placeholder:text-muted-warm focus:border-gold/50 sm:border-r-0 ${
                      error ? "border-red-400" : "border-line-strong"
                    }`}
                  />
                  {/* Honeypot: invisible to people and screen readers, tempting to bots. */}
                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    className="absolute left-[-9999px] h-0 w-0 opacity-0"
                  />
                  <button type="submit" disabled={formState === "loading"} className={buttonClass}>
                    {formState === "loading" ? t("subscribe.sending") : t("subscribe.subscribe")}
                  </button>
                </div>
                {error && (
                  <p
                    id="subscribe-error"
                    role="alert"
                    className="mt-3 font-sans text-sm text-red-400"
                  >
                    {error}
                  </p>
                )}
                <p
                  id="subscribe-consent"
                  className="mt-4 font-sans text-[0.75rem] leading-[1.7] text-muted-warm"
                >
                  {t("subscribe.consentPre")}{" "}
                  <LocaleLink to="/privacy" className="text-gold underline underline-offset-4">
                    {t("footer.privacy")}
                  </LocaleLink>
                  .
                </p>
              </form>
            </>
          )}

          {/* --- After submitting: check your inbox --- */}
          {formState === "sent" && confirmState !== "done" && !unsubscribeToken && (
            <div className={panelClass} role="status">
              <MailCheck className="mx-auto text-gold" size={44} strokeWidth={1.25} aria-hidden />
              <h2 className="mt-5 font-serif font-light text-cream text-3xl">
                {t("subscribe.sentTitle")}
              </h2>
              <p className="mt-3 font-sans text-[0.92rem] leading-[1.8] text-muted-warm">
                {t("subscribe.sentBody", { email: sentTo })}
              </p>
              <p className="mt-2 font-sans text-[0.8rem] leading-[1.7] text-muted-warm">
                {t("subscribe.sentHint")}
              </p>
              {error && (
                <p role="alert" className="mt-4 font-sans text-sm text-red-400">
                  {error}
                </p>
              )}
              {resendNotice && (
                <p role="status" className="mt-4 font-sans text-sm text-gold">
                  {resendNotice}
                </p>
              )}
              <div className="mt-6 flex flex-col items-center gap-1 sm:flex-row sm:justify-center sm:gap-6">
                <button
                  type="button"
                  disabled={resendSeconds > 0}
                  onClick={() => void submit(sentTo, true)}
                  className="inline-flex min-h-11 items-center font-sans text-[0.8rem] text-gold underline underline-offset-4 disabled:text-muted-warm disabled:no-underline"
                >
                  {resendSeconds > 0
                    ? t("subscribe.resendIn", { seconds: resendSeconds })
                    : t("subscribe.resend")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormState("idle");
                    setError("");
                    setEmail("");
                  }}
                  className="inline-flex min-h-11 items-center font-sans text-[0.8rem] text-muted-warm underline underline-offset-4 hover:text-cream"
                >
                  {t("subscribe.differentEmail")}
                </button>
              </div>
            </div>
          )}

          <p className="text-center font-sans text-[0.68rem] uppercase tracking-[0.25em] text-muted-warm">
            {t("subscribe.footnote")}
          </p>
        </Reveal>
      </section>
    </>
  );
}
