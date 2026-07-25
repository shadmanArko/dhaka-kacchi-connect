import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { AnchorButton } from "@/components/ui/DkButton";
import { buildWaLink } from "@/lib/whatsapp";
import kacchiBorhani from "@/assets/Kacchi-and-Borhani.png.asset.json";

export const Route = createFileRoute("/order")({
  head: () => ({
    meta: [
      { title: "Order — Dhaka Kacchi Berlin" },
      {
        name: "description",
        content:
          "Order authentic Kacchi Biriyani & Borhani in Berlin via WhatsApp. Minimum 2 plates. 48 hours advance notice.",
      },
      { property: "og:title", content: "Order — Dhaka Kacchi Berlin" },
      {
        property: "og:description",
        content: "One WhatsApp message away from the best kacchi in Berlin.",
      },
    ],
  }),
  component: OrderPage,
});

const info = [
  { label: "What We Serve", value: "Kacchi Biriyani + Borhani" },
  { label: "Minimum Order", value: "2 Plates" },
  { label: "Advance Notice", value: "48 Hours Required" },
  { label: "Location", value: "Berlin, Germany" },
];

function OrderPage() {
  return (
    <section className="relative overflow-hidden bg-black-ink py-32 md:py-40 px-6 md:px-14 text-center min-h-screen flex items-center justify-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center 40%, rgba(200,169,110,0.05) 0%, transparent 65%)",
        }}
      />
      <div className="relative z-10 max-w-[720px] w-full">
        <img
          src={kacchiBorhani.url}
          alt="Kacchi & Borhani"
          className="w-full rounded-[2px] mb-10 border border-line animate-fade-up opacity-0 [animation-delay:.2s]"
          loading="eager"
        />
        <h1 className="animate-fade-up opacity-0 [animation-delay:.4s] font-serif font-light text-cream leading-[1.05] text-[clamp(2.8rem,6vw,5rem)] mb-3">
          Order in <em className="not-italic italic text-gold">Berlin</em>
        </h1>
        <div className="animate-fade-up opacity-0 [animation-delay:.6s] mx-auto my-7 h-px w-[50px] bg-gold" />
        <p className="animate-fade-up opacity-0 [animation-delay:.8s] font-sans text-[0.96rem] leading-[1.95] text-muted-warm mb-8">
          Ordering is simple. One message away from the best kacchi you'll have in Berlin. Each
          batch is prepared fresh, in full — to order.
        </p>

        <div className="animate-fade-up opacity-0 [animation-delay:1s] grid grid-cols-1 sm:grid-cols-2 gap-4 my-10 text-left">
          {info.map((i) => (
            <div key={i.label} className="bg-surface border border-line px-7 py-6">
              <span className="block font-sans text-[0.68rem] uppercase tracking-[0.3em] text-gold-3 mb-2">
                {i.label}
              </span>
              <strong className="font-serif font-normal text-cream text-lg">{i.value}</strong>
            </div>
          ))}
        </div>

        <a
          href={buildWaLink("Hi Dhaka Kacchi — I'd like to order.")}
          target="_blank"
          rel="noopener noreferrer"
          className="animate-fade-up opacity-0 [animation-delay:1.2s] inline-flex items-center gap-4 bg-[#25D366] text-white px-16 py-6 font-sans text-[0.8rem] uppercase tracking-[0.25em] transition-all hover:-translate-y-0.5 hover:bg-[#1da851] hover:shadow-[0_24px_60px_rgba(37,211,102,.3)] mb-6"
        >
          <MessageCircle size={20} />
          <span>Order on WhatsApp</span>
        </a>

        <p className="animate-fade-up opacity-0 [animation-delay:1.4s] font-sans text-[0.96rem] text-muted-warm mb-6">
          Or subscribe to get batch announcements first.
        </p>
        <Link to="/subscribe" className="contents">
          <AnchorButton href="/subscribe" variant="ghost">
            <span>Subscribe for Updates</span>
            <span aria-hidden>→</span>
          </AnchorButton>
        </Link>
      </div>
    </section>
  );
}
