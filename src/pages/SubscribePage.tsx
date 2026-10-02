import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHero } from "@/components/sections/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { api, ApiError } from "@/lib/api";
import { trackWarehouseEvent } from "@/lib/analytics";

type State = "idle" | "loading" | "success" | "error";
type ConfirmState = "none" | "confirming" | "confirmed" | "failed";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** `confirmToken` is the `?confirm=` value from the double-opt-in email link. */
export function SubscribePage({ confirmToken }: { confirmToken?: string }) {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState>(
    confirmToken ? "confirming" : "none",
  );

  useEffect(() => {
    if (!confirmToken) return;
    let cancelled = false;
    setConfirmState("confirming");
    api
      .confirmSubscription(confirmToken)
      .then(() => {
        if (cancelled) return;
        setConfirmState("confirmed");
        // The sign-up only counts once it is confirmed.
        trackWarehouseEvent("newsletter_signup");
      })
      .catch((err) => {
        if (cancelled) return;
        setConfirmState("failed");
        setMessage(err instanceof ApiError ? err.message : t("subscribe.genericError"));
      });
    return () => {
      cancelled = true;
    };
    // `t` only changes with the language; the token is what drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmToken]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setState("error");
      setMessage(t("subscribe.invalidEmail"));
      document.getElementById("email")?.focus();
      return;
    }
    setState("loading");
    setMessage("");
    try {
      await api.subscribe(trimmed, i18n.language === "de" ? "de" : "en");
      setState("success");
      setEmail("");
    } catch (err) {
      setState("error");
      setMessage(err instanceof ApiError ? err.message : t("subscribe.genericError"));
    }
  }

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

      <section className="border-t border-line bg-deep py-24 md:py-32 px-6 md:px-14 text-center">
        <Reveal className="max-w-[680px] mx-auto">
          {confirmState === "confirming" && (
            <p role="status" className="mb-10 font-sans text-muted-warm">
              {t("subscribe.confirming")}
            </p>
          )}
          {confirmState === "confirmed" && (
            <p role="status" className="mb-10 font-serif italic text-gold text-xl">
              {t("subscribe.confirmed")}
            </p>
          )}
          {confirmState === "failed" && (
            <p role="alert" className="mb-10 font-sans text-sm text-red-400">
              {message || t("subscribe.confirmFailed")}
            </p>
          )}

          {confirmState !== "confirmed" && (
            <form
              onSubmit={onSubmit}
              noValidate
              className="flex flex-col sm:flex-row gap-0 max-w-[560px] mx-auto"
            >
              <label htmlFor="email" className="sr-only">
                {t("subscribe.emailLabel")}
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="send"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={state === "error" ? true : undefined}
                aria-describedby={
                  state === "error" || state === "success" ? "subscribe-status" : undefined
                }
                placeholder={t("subscribe.emailPlaceholder")}
                autoComplete="email"
                className="flex-1 min-w-0 px-6 py-5 bg-gold/[0.06] border border-line-strong sm:border-r-0 text-cream placeholder:text-muted-warm font-sans text-base outline-none focus:border-gold/50 transition-colors"
              />
              <button
                type="submit"
                disabled={state === "loading"}
                className="bg-gold text-black-ink px-9 py-5 font-sans text-[0.75rem] uppercase tracking-[0.25em] hover:bg-gold-2 transition-colors disabled:opacity-60"
              >
                {state === "loading" ? t("subscribe.sending") : t("subscribe.subscribe")}
              </button>
            </form>
          )}

          {state === "success" && (
            <p
              id="subscribe-status"
              role="status"
              className="mt-6 font-serif italic text-gold text-lg"
            >
              {t("subscribe.success")}
            </p>
          )}
          {state === "error" && (
            <p id="subscribe-status" role="alert" className="mt-6 font-sans text-sm text-red-400">
              {message}
            </p>
          )}

          <p className="mt-8 font-sans text-[0.68rem] uppercase tracking-[0.25em] text-muted-warm">
            {t("subscribe.footnote")}
          </p>
        </Reveal>
      </section>
    </>
  );
}
