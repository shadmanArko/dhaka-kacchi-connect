import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/sections/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { api } from "@/lib/api";
import { canonical } from "@/lib/seo";

export const Route = createFileRoute("/subscribe")({
  head: () => ({
    meta: [
      { title: "Subscribe — Dhaka Kacchi Berlin" },
      {
        name: "description",
        content:
          "Subscribe to Dhaka Kacchi for exclusive offers, Eid specials, and batch announcements.",
      },
      { property: "og:title", content: "Subscribe — Dhaka Kacchi Berlin" },
      {
        property: "og:description",
        content: "Batch announcements and Eid specials, delivered before anyone else hears.",
      },
      { property: "og:url", content: canonical("/subscribe") },
    ],
    links: [{ rel: "canonical", href: canonical("/subscribe") }],
  }),
  component: SubscribePage,
});

type State = "idle" | "loading" | "success" | "error";

function SubscribePage() {
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
      setMessage(
        err instanceof Error
          ? err.message
          : "Couldn't subscribe right now. Please try again later.",
      );
    }
  }

  return (
    <>
      <PageHero
        eyebrow="Join the Circle"
        title={
          <>
            First bite,
            <br />
            <em>first to know.</em>
          </>
        }
        body="Subscribers hear about every batch first — Eid specials, seasonal menus, and quiet Sunday cookouts. No spam. Unsubscribe anytime."
      />

      <section className="border-t border-line bg-deep py-24 md:py-32 px-6 md:px-14 text-center">
        <Reveal className="max-w-[680px] mx-auto">
          <form
            onSubmit={onSubmit}
            className="flex flex-col sm:flex-row gap-0 max-w-[560px] mx-auto"
          >
            <label htmlFor="email" className="sr-only">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              className="flex-1 px-6 py-5 bg-gold/[0.06] border border-line sm:border-r-0 text-cream placeholder:text-muted-warm font-sans text-[0.88rem] outline-none focus:border-gold/50 transition-colors"
            />
            <button
              type="submit"
              disabled={state === "loading"}
              className="bg-gold text-black-ink px-9 py-5 font-sans text-[0.75rem] uppercase tracking-[0.25em] hover:bg-gold-2 transition-colors disabled:opacity-60"
            >
              {state === "loading" ? "Sending…" : "Subscribe"}
            </button>
          </form>

          {state === "success" && (
            <p className="mt-6 font-serif italic text-gold text-lg">
              You're in. Watch your inbox for the next batch.
            </p>
          )}
          {state === "error" && <p className="mt-6 font-sans text-sm text-red-400">{message}</p>}

          <p className="mt-8 font-sans text-[0.68rem] uppercase tracking-[0.25em] text-muted-warm">
            No spam · Unsubscribe anytime
          </p>
        </Reveal>
      </section>
    </>
  );
}
