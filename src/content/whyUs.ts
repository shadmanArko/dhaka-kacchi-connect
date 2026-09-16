import type { TFunction } from "i18next";

export type WhyCard = { number: string; icon: string; title: string; body: string };

export function getWhyUs(t: TFunction): WhyCard[] {
  return [
    { number: "01", icon: "🔬", title: t("whyUs.card1.title"), body: t("whyUs.card1.body") },
    { number: "02", icon: "📍", title: t("whyUs.card2.title"), body: t("whyUs.card2.body") },
    { number: "03", icon: "🌿", title: t("whyUs.card3.title"), body: t("whyUs.card3.body") },
    { number: "04", icon: "🥩", title: t("whyUs.card4.title"), body: t("whyUs.card4.body") },
    { number: "05", icon: "❤️", title: t("whyUs.card5.title"), body: t("whyUs.card5.body") },
    { number: "06", icon: "✓", title: t("whyUs.card6.title"), body: t("whyUs.card6.body") },
  ];
}

export function getValues(t: TFunction): WhyCard[] {
  return [
    { number: "01", icon: "🕰️", title: t("values.card1.title"), body: t("values.card1.body") },
    { number: "02", icon: "🔬", title: t("values.card2.title"), body: t("values.card2.body") },
    { number: "03", icon: "🌱", title: t("values.card3.title"), body: t("values.card3.body") },
  ];
}
