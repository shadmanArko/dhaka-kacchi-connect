import { Facebook, Instagram } from "lucide-react";
import { site } from "@/content/site";

export function FloatingSocial() {
  return (
    <div className="fixed right-5 bottom-24 z-40 hidden md:flex flex-col gap-3">
      <a
        href={site.socials.instagram}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Follow on Instagram"
        className="flex items-center justify-center h-11 w-11 rounded-full bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white hover:scale-110 transition-transform"
      >
        <Instagram size={20} />
      </a>
      <a
        href={site.socials.facebook}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Like on Facebook"
        className="flex items-center justify-center h-11 w-11 rounded-full bg-[#1877F2] text-white hover:scale-110 transition-transform"
      >
        <Facebook size={20} />
      </a>
    </div>
  );
}
