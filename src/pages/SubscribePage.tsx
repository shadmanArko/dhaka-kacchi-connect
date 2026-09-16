import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHero } from "@/components/sections/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { api } from "@/lib/api";

type State = "idle" | "loading" | "success" | "error";

export function SubscribePage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setMessage("");
    try {
      await api.subscribe(email);
      setState("success");
      setEmail("");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : t("subscribe.genericError"));
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
          <form
            onSubmit={onSubmit}
            className="flex flex-col sm:flex-row gap-0 max-w-[560px] mx-auto"
          >
            <label htmlFor="email" className="sr-only">
              {t("subscribe.emailLabel")}
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("subscribe.emailPlaceholder")}
              autoComplete="email"
              className="flex-1 px-6 py-5 bg-gold/[0.06] border border-line-strong sm:border-r-0 text-cream placeholder:text-muted-warm font-sans text-base outline-none focus:border-gold/50 transition-colors"
            />
            <button
              type="submit"
              disabled={state === "loading"}
              className="bg-gold text-black-ink px-9 py-5 font-sans text-[0.75rem] uppercase tracking-[0.25em] hover:bg-gold-2 transition-colors disabled:opacity-60"
            >
              {state === "loading" ? t("subscribe.sending") : t("subscribe.subscribe")}
            </button>
          </form>

          {state === "success" && (
            <p className="mt-6 font-serif italic text-gold text-lg">{t("subscribe.success")}</p>
          )}
          {state === "error" && <p className="mt-6 font-sans text-sm text-red-400">{message}</p>}

          <p className="mt-8 font-sans text-[0.68rem] uppercase tracking-[0.25em] text-muted-warm">
            {t("subscribe.footnote")}
          </p>
        </Reveal>
      </section>
    </>
  );
}
