import type { TFunction } from "i18next";
import kacchi from "@/assets/kacchi.jpg";
import borhani from "@/assets/borhani-3-web.jpg";

export type Product = {
  number: string;
  label: string;
  name: string;
  emphasis: string;
  subtitle: string;
  description: string;
  tags: string[];
  image: { url: string; alt: string };
};

/** Translated at render time (locale-independent shape - images, numbers -
 * lives here; display strings come from the current language via `t`). */
export function getProducts(t: TFunction): Product[] {
  return [
    {
      number: "01",
      label: t("product.kacchi.label"),
      name: t("product.kacchi.name"),
      emphasis: t("product.kacchi.emphasis"),
      subtitle: t("product.kacchi.subtitle"),
      description: t("product.kacchi.description"),
      tags: t("product.kacchi.tags").split("|"),
      image: {
        url: kacchi,
        alt: "Kacchi Biriyani — Berlin's authentic slow-cooked mutton biriyani",
      },
    },
    {
      number: "02",
      label: t("product.borhani.label"),
      name: "",
      emphasis: t("product.borhani.emphasis"),
      subtitle: t("product.borhani.subtitle"),
      description: t("product.borhani.description"),
      tags: t("product.borhani.tags").split("|"),
      image: { url: borhani, alt: "Borhani — traditional Bangladeshi spiced yoghurt drink" },
    },
  ];
}
