import { useTranslation } from "react-i18next";
import { PageHero } from "@/components/sections/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { site } from "@/content/site";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="font-serif font-light text-cream text-2xl">{title}</h2>
      <div className="space-y-3 font-sans text-[0.92rem] leading-[1.9] text-muted-warm">
        {children}
      </div>
    </div>
  );
}

export function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHero
        eyebrow={t("privacy.hero.eyebrow")}
        title={
          <>
            {t("privacy.hero.titlePre")} <em>{t("privacy.hero.titleEm")}</em>
          </>
        }
        body={t("privacy.hero.body")}
      />

      <section className="bg-black-ink border-t border-line py-20 md:py-28 px-6 md:px-14">
        <Reveal className="max-w-[720px] mx-auto space-y-12">
          <p className="font-sans text-[0.85rem] leading-[1.9] text-gold">
            {t("privacy.intro", { siteName: site.name })}
          </p>

          <Section title={t("privacy.section1.title")}>
            <p>{t("privacy.section1.body")}</p>
          </Section>

          <Section title={t("privacy.section2.title")}>
            <p>{t("privacy.section2.body1")}</p>
            <p>{t("privacy.section2.body2")}</p>
            <p>{t("privacy.section2.body3")}</p>
          </Section>

          <Section title={t("privacy.section3.title")}>
            <p>
              {t("privacy.section3.bodyPre")}{" "}
              <a
                href={`mailto:${site.email}`}
                className="text-gold underline underline-offset-4 hover:text-gold-2"
              >
                {site.email}
              </a>
              .
            </p>
          </Section>
        </Reveal>
      </section>
    </>
  );
}
