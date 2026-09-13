import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { AnchorButton } from "@/components/ui/DkButton";
import { Rings } from "@/components/ui/Rings";
import kacchi from "@/assets/kacchi.jpg";

export function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col lg:flex-row overflow-hidden">
      {/* Left: copy */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-8 md:px-16 pt-36 pb-20 bg-gradient-to-br from-black-ink to-deep">
        <Rings className="bottom-[-100px] right-[-100px]" />

        <span className="animate-fade-up opacity-0 [animation-delay:.3s] flex items-center gap-2 font-sans text-[0.68rem] uppercase tracking-[0.4em] text-gold mb-7">
          <MapPin size={12} /> Berlin, Germany · Authentic Since Day One
        </span>

        <h1 className="animate-fade-up opacity-0 [animation-delay:.5s] font-serif font-light text-cream leading-[1.02] text-[clamp(3rem,6vw,5.5rem)] mb-3">
          The Kacchi
          <br />
          <em className="not-italic italic text-gold font-serif">Berlin Deserves</em>
        </h1>

        <div className="animate-fade-up opacity-0 [animation-delay:.7s] my-7 h-px w-[50px] bg-gold" />

        <p className="animate-fade-up opacity-0 [animation-delay:.9s] max-w-md mb-12 text-[0.96rem] leading-[1.95] text-muted-warm">
          Not a fusion. Not an imitation. The real thing — slow-cooked, sealed in dum, fragrant with
          saffron and generations of tradition. Prepared by a Bangladeshi doctor who couldn't find
          it in Berlin, so she made it herself.
        </p>

        <div className="animate-fade-up opacity-0 [animation-delay:1.1s] flex flex-wrap gap-4">
          <Link to="/order" className="contents">
            <AnchorButton href="/order" variant="gold">
              <span>Order Now</span>
              <span aria-hidden>→</span>
            </AnchorButton>
          </Link>
          <Link to="/about" className="contents">
            <AnchorButton href="/about" variant="ghost">
              <span>Our Story</span>
            </AnchorButton>
          </Link>
        </div>
      </div>

      {/* Right: photo */}
      <div className="relative w-full lg:w-[48%] h-[55vw] min-h-[300px] lg:h-auto lg:min-h-full overflow-hidden shrink-0">
        <img
          src={kacchi}
          alt="Dhaka Kacchi Biriyani Berlin — authentic slow-cooked kacchi"
          className="absolute inset-0 w-full h-full object-cover object-[center_30%] animate-img-zoom"
          loading="eager"
          decoding="async"
        />
        <div
          className="absolute inset-0 z-[1]"
          style={{
            background:
              "linear-gradient(90deg, oklch(0.06 0.006 275) 0%, transparent 40%), linear-gradient(0deg, rgba(7,7,10,.4) 0%, transparent 50%)",
          }}
        />
      </div>
    </section>
  );
}
