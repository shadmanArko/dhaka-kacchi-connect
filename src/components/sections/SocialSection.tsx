import { Facebook, Instagram } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "@/components/ui/Typography";
import { site } from "@/content/site";

export function SocialSection() {
  return (
    <section className="border-t border-line bg-deep py-20 px-6 md:px-14 text-center">
      <Reveal className="max-w-[900px] mx-auto">
        <Eyebrow>Stay Connected</Eyebrow>
        <h2 className="font-serif font-light text-cream text-[clamp(2rem,4vw,3rem)] leading-[1.15] mb-3.5 [&_em]:not-italic [&_em]:italic [&_em]:text-gold">
          Follow our <em>journey</em>
        </h2>
        <p className="font-sans text-[0.94rem] leading-[1.85] text-muted-warm mb-12">
          Behind every plate is a story. See the cooking, the chaos, the joy.
          <br />
          Follow Dhaka Kacchi and never miss a batch.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-[680px] mx-auto">
          <a
            href={site.socials.facebook}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex items-center gap-5 border border-line rounded-[2px] px-8 py-7 overflow-hidden transition-transform hover:-translate-y-1"
          >
            <span
              aria-hidden
              className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{ background: "linear-gradient(135deg, #1877F2, #0c5bc4)" }}
            />
            <Facebook className="relative z-10 text-[#1877F2] group-hover:text-white transition-colors" />
            <div className="relative z-10 text-left">
              <strong className="block font-serif text-xl text-cream group-hover:text-white transition-colors">
                Facebook
              </strong>
              <span className="font-sans text-[0.7rem] uppercase tracking-[0.15em] text-muted-warm group-hover:text-white/90">
                Like our page →
              </span>
            </div>
          </a>

          <a
            href={site.socials.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex items-center gap-5 border border-line rounded-[2px] px-8 py-7 overflow-hidden transition-transform hover:-translate-y-1"
          >
            <span
              aria-hidden
              className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{ background: "linear-gradient(135deg,#833ab4 0%,#fd1d1d 50%,#fcb045 100%)" }}
            />
            <Instagram className="relative z-10 text-[#e1306c] group-hover:text-white transition-colors" />
            <div className="relative z-10 text-left">
              <strong className="block font-serif text-xl text-cream group-hover:text-white transition-colors">
                Instagram
              </strong>
              <span className="font-sans text-[0.7rem] uppercase tracking-[0.15em] text-muted-warm group-hover:text-white/90">
                Follow us →
              </span>
            </div>
          </a>
        </div>
      </Reveal>
    </section>
  );
}
