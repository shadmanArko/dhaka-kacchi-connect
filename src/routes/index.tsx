import { createFileRoute } from "@tanstack/react-router";
import { Hero } from "@/components/sections/Hero";
import { BerlinBanner } from "@/components/sections/BerlinBanner";
import { ProductGrid } from "@/components/sections/ProductGrid";
import { CardGrid } from "@/components/sections/CardGrid";
import { StoryBlock } from "@/components/sections/StoryBlock";
import { FoodSpotlight } from "@/components/sections/FoodSpotlight";
import { Timeline } from "@/components/sections/Timeline";
import { CTASection } from "@/components/sections/CTASection";
import { SocialSection } from "@/components/sections/SocialSection";
import { whyUs } from "@/content/whyUs";
import { canonical } from "@/lib/seo";
import kacchiBorhani from "@/assets/Kacchi-and-Borhani.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dhaka Kacchi Berlin — Authentic Kacchi Biriyani & Borhani" },
      {
        name: "description",
        content:
          "Berlin's only authentic Kacchi Biriyani and Borhani — prepared by a Bangladeshi doctor with generations of family tradition.",
      },
      { property: "og:title", content: "Dhaka Kacchi Berlin" },
      {
        property: "og:description",
        content: "Authentic Kacchi Biriyani & Borhani, made in Berlin.",
      },
      { property: "og:url", content: canonical("/") },
    ],
    links: [{ rel: "canonical", href: canonical("/") }],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <>
      <Hero />
      <BerlinBanner />
      <ProductGrid />
      <CardGrid
        eyebrow="Why Dhaka Kacchi Berlin"
        title={
          <>
            Cooked the <em>Old Way.</em>
            <br />
            Served in Berlin.
          </>
        }
        cards={whyUs}
      />
      <StoryBlock
        eyebrow="The Story Behind the Pot"
        title={
          <>
            I searched all of
            <br />
            <em>Berlin. Then I cooked.</em>
          </>
        }
        paragraphs={[
          "I came to Berlin to pursue my German medical license — juggling the demands of study, a young family, and life in a new country. And through it all, I craved kacchi. Real kacchi. The kind from Old Dhaka.",
          "I searched everywhere. Nobody had it. Not even close. So between medical studies and motherhood, I started Dhaka Kacchi — for the community, for the memory, and for the joy of watching someone take that first bite and close their eyes.",
        ]}
        quote={'"Not a business first — a love of food, heritage, and community."'}
        tags={["Berlin-based", "Family Recipe", "Doctor & Cook", "Made with Love"]}
        image={{ url: kacchiBorhani, alt: "Kacchi and Borhani — Dhaka Kacchi Berlin" }}
        badge={{ value: "Berlin", label: "Germany" }}
      />
      <FoodSpotlight />
      <Timeline />
      <CTASection
        eyebrow="Join the Circle"
        title={
          <>
            Be the first to
            <br />
            <em>know everything.</em>
          </>
        }
        body="Subscribe and get exclusive offers, Eid menus, seasonal specials, batch announcements — and food stories. Subscribers always get first access."
        ctaLabel="Subscribe — It's Free"
        ctaTo="/subscribe"
        footnote="📍 Berlin, Germany  ·  No spam · Unsubscribe anytime"
      />
      <SocialSection />
    </>
  );
}
