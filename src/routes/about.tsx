import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/sections/PageHero";
import { StoryBlock } from "@/components/sections/StoryBlock";
import { CardGrid } from "@/components/sections/CardGrid";
import { CTASection } from "@/components/sections/CTASection";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "@/components/ui/Typography";
import { values } from "@/content/whyUs";
import kacchi from "@/assets/kacchi.jpg";
import borhani2 from "@/assets/borhani-2-web.jpg";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Dhaka Kacchi Berlin" },
      {
        name: "description",
        content:
          "The story of Dhaka Kacchi Berlin — a Bangladeshi doctor who searched all of Berlin for real kacchi and couldn't find it, so she made it herself.",
      },
      { property: "og:title", content: "About — Dhaka Kacchi Berlin" },
      {
        property: "og:description",
        content: "A doctor, a craving, and a pot of kacchi. Born in Dhaka. Living in Berlin.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Berlin · Our Story"
        title={
          <>
            A Doctor,
            <br />
            a Craving, and
            <br />
            <em>a Pot of Kacchi</em>
          </>
        }
        body="How a Bangladeshi physician pursuing her German medical license became Berlin's only authentic kacchi maker — and why she wouldn't have it any other way."
      />

      <StoryBlock
        eyebrow="Who We Are"
        title={
          <>
            Born in Dhaka.
            <br />
            <em>Living in Berlin.</em>
          </>
        }
        paragraphs={[
          "I came to Berlin to pursue my German medical license — juggling the demands of study, a young family, and life in a new country. It's a reality many immigrant families know well: the chaos, the joy, and the deep hunger for something from home.",
          "That something, for me, was kacchi. Real kacchi. The kind you get in Old Dhaka — sealed in a dum pot, fragrant with saffron and kewra, with the whole potato that absorbs everything. I searched all over Berlin. I found nothing even close.",
        ]}
        quote={'"I searched all over Berlin for real kacchi. I couldn\'t find it. So I made it myself."'}
        tags={["Bangladesh", "Berlin", "Medical Doctor", "Family Recipe"]}
        image={{ url: kacchi, alt: "Dhaka Kacchi Berlin" }}
        badge={{ value: "Berlin", label: "Germany" }}
      />

      <StoryBlock
        background="deep"
        reverse
        eyebrow="Why Dhaka Kacchi"
        title={
          <>
            Between studies
            <br />
            <em>and motherhood.</em>
          </>
        }
        paragraphs={[
          "Millions across Europe share that longing — Bangladeshis, Pakistanis, Arabs, and Germans who've tasted kacchi once and never forgotten it. The craving is real, and nobody was answering it in Berlin.",
          "So between medical studies and raising a young family, I started Dhaka Kacchi. Not as a business first — as an act of love. For the community, for the memory, and for the joy of watching someone take that first bite and close their eyes.",
          "The recipe is my family's — unchanged and uncompromised. The same spice balance, the same overnight marinade, the same patience. The only thing new is the city.",
        ]}
        quote={'"Not a business first — a love of food, heritage, and community."'}
        image={{ url: borhani2, alt: "Borhani Berlin" }}
        badge={{ value: "400+", label: "Years of Tradition" }}
      />

      <CardGrid
        eyebrow="What We Stand For"
        title={<>Our <em>Values</em></>}
        cards={values}
      />

      <section className="border-t border-line bg-black-ink py-24 md:py-32 px-6 md:px-14 text-center">
        <Reveal className="max-w-[900px] mx-auto">
          <Eyebrow className="mb-7">Our Mission</Eyebrow>
          <blockquote className="font-serif font-light italic text-cream leading-[1.5] text-[clamp(1.6rem,3vw,2.6rem)] border-l-2 border-gold pl-10 text-left mb-8">
            "To serve the most authentic Kacchi Biriyani in Berlin — not the fastest, not the
            cheapest, but the most honest expression of a 400-year-old tradition, now available in
            Germany."
          </blockquote>
          <cite className="not-italic font-sans text-[0.68rem] uppercase tracking-[0.3em] text-gold-3">
            — Dhaka Kacchi, Berlin
          </cite>
        </Reveal>
      </section>

      <CTASection
        eyebrow="Stay Connected"
        title={<>Get our <em>latest news</em></>}
        body="Subscribe to our email list for batch announcements, seasonal menus, exclusive offers, and the stories behind each pot."
        ctaLabel="Subscribe Now"
        ctaTo="/subscribe"
        footnote="📍 Berlin, Germany"
      />
    </>
  );
}
