import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/sections/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { canonical } from "@/lib/seo";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History of Kacchi Biriyani — Dhaka Kacchi" },
      {
        name: "description",
        content:
          "The rich history of Kacchi Biriyani — from Mughal royal kitchens to the streets of Old Dhaka.",
      },
      { property: "og:title", content: "History of Kacchi Biriyani" },
      {
        property: "og:description",
        content: "From Mughal royal kitchens to the streets of Old Dhaka.",
      },
      { property: "og:url", content: canonical("/history") },
    ],
    links: [{ rel: "canonical", href: canonical("/history") }],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <>
      <PageHero
        eyebrow="A 400-Year Journey"
        title={
          <>
            The History of
            <br />
            <em>Kacchi Biriyani</em>
          </>
        }
        body="From Persian royal kitchens through Mughal courts to the bustling streets of Old Dhaka — the story of a dish that refused to be simplified."
      />

      <section className="border-t border-line bg-black-ink py-24 md:py-32 px-6 md:px-14">
        <div className="max-w-[860px] mx-auto space-y-14 [&_h2]:font-serif [&_h2]:font-light [&_h2]:text-cream [&_h2]:text-[clamp(1.8rem,3vw,2.6rem)] [&_h2]:leading-[1.1] [&_h2]:mb-5 [&_h2_em]:not-italic [&_h2_em]:italic [&_h2_em]:text-gold [&_h3]:font-serif [&_h3]:text-gold [&_h3]:text-xl [&_h3]:tracking-wide [&_h3]:mb-3.5 [&_p]:font-sans [&_p]:text-[0.96rem] [&_p]:leading-[2.1] [&_p]:text-[#9a9080] [&_p]:mb-5">
          <Reveal>
            <h2>
              Persian <em>Origins</em>
            </h2>
            <p>
              The word <em>biriyani</em> descends from the Persian <em>birinj biriyan</em> — "fried
              rice." Long before it reached the subcontinent, layered rice-and-meat dishes were
              cooked in the courts of Persia, seasoned with saffron and rose water. It was the
              Mughals who carried the technique east.
            </p>
          </Reveal>

          <Reveal>
            <h2>
              The Mughal <em>Court</em>
            </h2>
            <p>
              Under Mughal emperors, biriyani became a staple of royal kitchens. Each capital
              developed its own dialect — Delhi, Lucknow, Hyderabad. Two schools emerged:{" "}
              <em>pakki</em> (cooked meat layered with rice) and <em>kacchi</em> (raw marinated meat
              sealed with partially-cooked rice and dum-steamed together).
            </p>
            <p>
              Kacchi is the harder discipline. Undercook, and the meat is raw; overcook, and the
              rice turns to porridge. Timing, heat control, and the seal of the pot are everything.
            </p>
          </Reveal>

          <Reveal>
            <h2>
              Kacchi in <em>Old Dhaka</em>
            </h2>
            <p>
              When the tradition reached Bengal, Dhaka's cooks made kacchi their own. Young mutton,
              overnight yoghurt-and-papaya marinade, saffron, kewra, and the signature{" "}
              <em>aloo bukhara</em> (dried plum) — plus the whole potato that soaks up every drop of
              flavour. No other city gets that potato right.
            </p>
            <ul className="[&_li]:font-sans [&_li]:text-[0.92rem] [&_li]:leading-[1.9] [&_li]:text-[#9a9080] [&_li]:py-2 [&_li]:pl-7 [&_li]:border-b [&_li]:border-gold/10 [&_li]:relative">
              <li className="before:content-['—'] before:absolute before:left-0 before:text-gold-3">
                Overnight marinade in yoghurt and raw papaya
              </li>
              <li className="before:content-['—'] before:absolute before:left-0 before:text-gold-3">
                Hand-ground family spice blends
              </li>
              <li className="before:content-['—'] before:absolute before:left-0 before:text-gold-3">
                Sealed dum pot cooked over slow heat for 6+ hours
              </li>
              <li className="before:content-['—'] before:absolute before:left-0 before:text-gold-3">
                Served with borhani — never a substitute
              </li>
            </ul>
          </Reveal>

          <Reveal>
            <h2>
              Why It <em>Still Matters</em>
            </h2>
            <p>
              Kacchi is not fast food. It cannot be shortcut. Every step is a decision to honour the
              tradition instead of the clock. That's what we're keeping alive in Berlin — the
              patience, the discipline, and the reward that comes when someone takes the first bite
              and closes their eyes.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
