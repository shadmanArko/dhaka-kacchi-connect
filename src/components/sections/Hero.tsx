import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LocaleButtonLink } from "@/components/layout/LocaleLink";
import { Rings } from "@/components/ui/Rings";
import { Tag } from "@/components/ui/Typography";
import kacchi from "@/assets/kacchi.jpg";
import kacchi900 from "@/assets/kacchi-900.jpg";

export function Hero() {
  const { t } = useTranslation();
  return (
    <section className="relative flex min-h-screen flex-col lg:flex-row overflow-hidden">
      {/* Left: copy */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-8 md:px-16 pt-36 pb-20 bg-gradient-to-br from-black-ink to-deep">
        <Rings className="bottom-[-100px] right-[-100px]" />

        <span className="animate-fade-up opacity-0 [animation-delay:.3s] flex items-center gap-2 font-sans text-[0.68rem] uppercase tracking-[0.4em] text-gold mb-7">
          <MapPin size={12} /> {t("hero.locationBadge")}
        </span>

        <h1 className="animate-fade-up opacity-0 [animation-delay:.5s] font-serif font-light text-cream leading-[1.02] text-[clamp(3rem,6vw,5.5rem)] mb-3">
          {t("hero.titleLine1")}
          <br />
          <em className="not-italic italic text-gold font-serif">{t("hero.titleEm")}</em>
        </h1>

        <div className="animate-fade-up opacity-0 [animation-delay:.7s] my-7 h-px w-[50px] bg-gold" />

        <p className="animate-fade-up opacity-0 [animation-delay:.9s] max-w-md mb-8 text-[0.96rem] leading-[1.95] text-muted-warm">
          {t("hero.paragraph")}
        </p>

        {/* The weekly rhythm, above the fold. BerlinBanner says the same thing
            but sits below a min-h-screen hero, so it can't carry this alone.
            Deliberately ONE pill, not two: at 375px two pills wrap to a second
            line (74px vs 32px) and push the Order Now / Our Story buttons off
            the bottom of a 812px-tall phone screen. Measured: CTAs end at
            736px unchanged, 842px with two pills, 784px like this. */}
        <div className="animate-fade-up opacity-0 [animation-delay:1.1s] mb-8 flex flex-wrap gap-2.5">
          <Tag>{t("hero.weeklyTag")}</Tag>
        </div>

        <div className="animate-fade-up opacity-0 [animation-delay:1.3s] flex flex-wrap gap-4">
          <LocaleButtonLink to="/order" variant="gold">
            <span>{t("hero.orderNow")}</span>
            <span aria-hidden>→</span>
          </LocaleButtonLink>
          <LocaleButtonLink to="/about" variant="ghost">
            <span>{t("hero.ourStory")}</span>
          </LocaleButtonLink>
        </div>
      </div>

      {/* Right: photo */}
      <div className="relative w-full lg:w-[48%] h-[55vw] min-h-[300px] lg:h-auto lg:min-h-full overflow-hidden shrink-0">
        {/* This is the LCP element, so it's worth being precise. The 900w
            variant is sized so a 2x phone actually picks it: at 390 CSS px the
            browser needs 780px, and a 750w candidate was just under that, so
            it fell back to the full 1313px file and the srcset bought nothing.
            3x phones still take the 1313w, correctly. width/height give the
            intrinsic ratio so the box is reserved and the hero doesn't shift
            as it loads; fetchpriority marks it as the one image worth
            fetching first. */}
        <img
          src={kacchi}
          srcSet={`${kacchi900} 900w, ${kacchi} 1313w`}
          sizes="(min-width: 1024px) 48vw, 100vw"
          width={1313}
          height={1050}
          alt="Dhaka Kacchi Biriyani Berlin — authentic slow-cooked kacchi"
          className="absolute inset-0 w-full h-full object-cover object-[center_30%] animate-img-zoom"
          loading="eager"
          fetchPriority="high"
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
