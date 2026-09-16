import { useTranslation } from "react-i18next";
import { PageHero } from "@/components/sections/PageHero";
import { Reveal } from "@/components/ui/Reveal";

export function HistoryPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHero
        eyebrow={t("history.hero.eyebrow")}
        title={
          <>
            {t("history.hero.titleLine1")}
            <br />
            <em>{t("history.hero.titleEm")}</em>
          </>
        }
        body={t("history.hero.body")}
      />

      <section className="border-t border-line bg-black-ink py-24 md:py-32 px-6 md:px-14">
        <div className="max-w-[860px] mx-auto space-y-14 [&_h2]:font-serif [&_h2]:font-light [&_h2]:text-cream [&_h2]:text-[clamp(1.8rem,3vw,2.6rem)] [&_h2]:leading-[1.1] [&_h2]:mb-5 [&_h2_em]:not-italic [&_h2_em]:italic [&_h2_em]:text-gold [&_h3]:font-serif [&_h3]:text-gold [&_h3]:text-xl [&_h3]:tracking-wide [&_h3]:mb-3.5 [&_p]:font-sans [&_p]:text-[0.96rem] [&_p]:leading-[2.1] [&_p]:text-[#9a9080] [&_p]:mb-5">
          <Reveal>
            <h2>
              {t("history.persian.titlePre")} <em>{t("history.persian.titleEm")}</em>
            </h2>
            <p>{t("history.persian.body")}</p>
          </Reveal>

          <Reveal>
            <h2>
              {t("history.mughal.titlePre")} <em>{t("history.mughal.titleEm")}</em>
            </h2>
            <p>{t("history.mughal.body1")}</p>
            <p>{t("history.mughal.body2")}</p>
          </Reveal>

          <Reveal>
            <h2>
              {t("history.oldDhaka.titlePre")} <em>{t("history.oldDhaka.titleEm")}</em>
            </h2>
            <p>{t("history.oldDhaka.body")}</p>
            <ul className="[&_li]:font-sans [&_li]:text-[0.92rem] [&_li]:leading-[1.9] [&_li]:text-[#9a9080] [&_li]:py-2 [&_li]:pl-7 [&_li]:border-b [&_li]:border-gold/10 [&_li]:relative">
              <li className="before:content-['—'] before:absolute before:left-0 before:text-gold-3">
                {t("history.oldDhaka.li1")}
              </li>
              <li className="before:content-['—'] before:absolute before:left-0 before:text-gold-3">
                {t("history.oldDhaka.li2")}
              </li>
              <li className="before:content-['—'] before:absolute before:left-0 before:text-gold-3">
                {t("history.oldDhaka.li3")}
              </li>
              <li className="before:content-['—'] before:absolute before:left-0 before:text-gold-3">
                {t("history.oldDhaka.li4")}
              </li>
            </ul>
          </Reveal>

          <Reveal>
            <h2>
              {t("history.stillMatters.titlePre")} <em>{t("history.stillMatters.titleEm")}</em>
            </h2>
            <p>{t("history.stillMatters.body")}</p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
