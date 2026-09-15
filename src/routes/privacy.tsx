import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/sections/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { site } from "@/content/site";
import { canonical } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Dhaka Kacchi Berlin" },
      {
        name: "description",
        content: "What Dhaka Kacchi Berlin collects, why, and how to ask about your data.",
      },
      { property: "og:url", content: canonical("/privacy") },
    ],
    links: [{ rel: "canonical", href: canonical("/privacy") }],
  }),
  component: PrivacyPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="font-serif font-light text-cream text-2xl">{title}</h2>
      <div className="space-y-3 font-sans text-[0.92rem] leading-[1.9] text-muted-warm">
        {children}
      </div>
    </div>
  );
}

function PrivacyPage() {
  return (
    <>
      <PageHero
        eyebrow="Legal"
        title={
          <>
            Privacy <em>Policy</em>
          </>
        }
        body="What we collect, why, and how to reach us about your data."
      />

      <section className="bg-black-ink border-t border-line py-20 md:py-28 px-6 md:px-14">
        <Reveal className="max-w-[720px] mx-auto space-y-12">
          <p className="font-sans text-[0.85rem] leading-[1.9] text-gold">
            This page describes, in plain language, exactly what {site.name} collects today. It's a
            placeholder pending review by a lawyer — treat the substance as accurate, not the legal
            wording.
          </p>

          <Section title="Account &amp; order information">
            <p>
              When you create an account to place an order, we collect your name, date of birth,
              address, email, and phone number. Your phone number is verified with a one-time code
              at signup. This information is used only to take and fulfil your order (contacting
              you, delivering to your address, sending an order confirmation) — never sold, and
              never shared beyond what's needed to run the business (e.g. our SMS and email
              providers, acting only on our instructions).
            </p>
          </Section>

          <Section title="Analytics">
            <p>
              We use PostHog, an analytics tool hosted in the EU (Frankfurt), to understand how
              people use this site and where the ordering process could be easier — for example,
              which step people most often stop at before finishing an order.
            </p>
            <p>
              We ask for your consent before any of this data is linked to you individually or
              stored with cookies. If you decline, we still see anonymous, aggregate usage patterns
              (which pages are visited, roughly where people drop off) with no cookie set and no way
              to identify you or link your visit to a later one. If you accept, we may also record
              an anonymized replay of how you interacted with the page (to see exactly where
              something was confusing) — sensitive fields like your phone number, date of birth, and
              address are never included in these recordings, even then.
            </p>
            <p>
              You can change your mind at any time by clearing this site's data in your browser.
            </p>
          </Section>

          <Section title="Your rights">
            <p>
              Under GDPR, you can ask what data we hold about you, ask us to correct or delete it,
              or withdraw consent for analytics at any time. To do any of this, email us at{" "}
              <a
                href={`mailto:${site.email}`}
                className="text-gold underline underline-offset-4 hover:text-gold-2"
              >
                {site.email}
              </a>
              .
            </p>
          </Section>
        </Reveal>
      </section>
    </>
  );
}
