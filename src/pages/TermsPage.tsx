import { useTranslation } from "react-i18next";
import { PageHero } from "@/components/sections/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { LocaleLink } from "@/components/layout/LocaleLink";

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

export function TermsPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHero
        eyebrow={t("terms.hero.eyebrow")}
        title={
          <>
            {t("terms.hero.titlePre")} <em>{t("terms.hero.titleEm")}</em>
          </>
        }
        body={t("terms.hero.body")}
      />

      <section className="bg-black-ink border-t border-line py-20 md:py-28 px-6 md:px-14">
        <Reveal className="max-w-[720px] mx-auto space-y-12">
          <p className="font-sans text-[0.85rem] leading-[1.9] text-gold">{t("terms.updated")}</p>

          <Section title={t("terms.s1.title")}>
            <p>{t("terms.s1.p1")}</p>
          </Section>

          <Section title={t("terms.s2.title")}>
            <p>{t("terms.s2.p1")}</p>
            <p>{t("terms.s2.p2")}</p>
          </Section>

          <Section title={t("terms.s3.title")}>
            <p>{t("terms.s3.p1")}</p>
          </Section>

          <Section title={t("terms.s4.title")}>
            <p>{t("terms.s4.p1")}</p>
          </Section>

          <Section title={t("terms.s5.title")}>
            <p>{t("terms.s5.p1")}</p>
          </Section>

          <Section title={t("terms.s6.title")}>
            <p>{t("terms.s6.p1")}</p>
          </Section>

          <Section title={t("terms.s7.title")}>
            <p>{t("terms.s7.p1")}</p>
          </Section>

          <Section title={t("terms.s8.title")}>
            <p>{t("terms.s8.p1")}</p>
          </Section>

          <Section title={t("terms.s9.title")}>
            <p>{t("terms.s9.p1")}</p>
          </Section>

          <Section title={t("terms.s10.title")}>
            <p>{t("terms.s10.p1")}</p>
          </Section>

          <Section title={t("terms.s11.title")}>
            <p>
              {t("terms.s11.p1")}{" "}
              <LocaleLink
                to="/privacy"
                className="text-gold underline underline-offset-4 hover:text-gold-2"
              >
                {t("footer.privacy")}
              </LocaleLink>
              .
            </p>
          </Section>

          <Section title={t("terms.s12.title")}>
            <p>{t("terms.s12.p1")}</p>
          </Section>
        </Reveal>
      </section>
    </>
  );
}
