import { Reveal } from "@/components/ui/Reveal";
import { specs } from "@/content/timeline";
import kacchi from "@/assets/kacchi.jpg";

export function FoodSpotlight() {
  return (
    <section className="border-t border-line bg-deep">
      <div className="relative h-[70vh] min-h-[480px] overflow-hidden flex items-center justify-center">
        <img
          src={kacchi}
          alt="Kacchi Biriyani Berlin"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover object-[center_40%] animate-img-zoom"
        />
        <div
          aria-hidden
          className="absolute inset-0 z-[1]"
          style={{
            background:
              "linear-gradient(0deg, rgba(7,7,10,.9) 0%, rgba(7,7,10,.4) 50%, rgba(7,7,10,.2) 100%)",
          }}
        />
        <Reveal className="relative z-[2] w-full text-center px-8">
          <span className="block mb-5 font-sans text-[0.68rem] uppercase tracking-[0.4em] text-gold">
            Taste that hits your heart
          </span>
          <h2 className="font-serif font-light text-cream leading-none text-[clamp(2.5rem,7vw,5.5rem)] mb-5">
            Kacchi. <em className="not-italic italic text-gold">Borhani.</em>
            <br />
            Berlin.
          </h2>
          <p className="max-w-[580px] mx-auto font-sans text-[0.97rem] leading-[1.95] text-cream/70">
            Tender mutton. Fragrant basmati. A symphony of Bengali spices. Sealed and slow-cooked
            until every grain of rice carries the soul of the dish. Paired with ice-cold Borhani.
            Now in Berlin.
          </p>
        </Reveal>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 border-t border-line">
        {specs.map((s, i) => (
          <div
            key={s.label}
            className={`px-6 md:px-8 py-12 text-center ${
              i < specs.length - 1 ? "md:border-r border-line" : ""
            } ${i % 2 === 0 ? "border-r md:border-r" : ""} ${
              i < specs.length - 2 ? "border-b md:border-b-0 border-line" : ""
            }`}
          >
            <span className="block font-serif font-light text-[3.2rem] text-gold mb-2 leading-none">
              {s.value}
            </span>
            <span className="font-sans text-[0.65rem] uppercase tracking-[0.3em] text-muted-warm">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
