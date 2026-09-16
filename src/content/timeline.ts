import type { TFunction } from "i18next";

export function getTimeline(t: TFunction) {
  return [
    {
      step: t("timeline.step1.step"),
      title: t("timeline.step1.title"),
      body: t("timeline.step1.body"),
    },
    {
      step: t("timeline.step2.step"),
      title: t("timeline.step2.title"),
      body: t("timeline.step2.body"),
    },
    {
      step: t("timeline.step3.step"),
      title: t("timeline.step3.title"),
      body: t("timeline.step3.body"),
    },
    {
      step: t("timeline.step4.step"),
      title: t("timeline.step4.title"),
      body: t("timeline.step4.body"),
    },
  ];
}

export function getSpecs(t: TFunction) {
  return [
    { value: t("specs.hours.value"), label: t("specs.hours.label") },
    { value: t("specs.spices.value"), label: t("specs.spices.label") },
    { value: t("specs.marinade.value"), label: t("specs.marinade.label") },
    // Keep `value` to ~3 characters: FoodSpotlight renders it at text-[3.2rem]
    // inside a half-width grid cell, so anything longer wraps at 375px.
    { value: t("specs.batch.value"), label: t("specs.batch.label") },
  ];
}
