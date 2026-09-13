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

export const products: Product[] = [
  {
    number: "01",
    label: "Signature Dish",
    name: "Kacchi",
    emphasis: "Biriyani",
    subtitle: "dum-sealed · slow-cooked · old Dhaka recipe",
    description:
      "Raw marinated mutton and long-grain basmati, layered and sealed in a dum pot for 6+ hours. Every grain absorbs the saffron, kewra, and generations of spice knowledge. Includes the signature dum potato — a Dhaka trademark no other city gets right.",
    tags: ["Young Mutton", "Overnight Marinade", "Saffron & Kewra", "Dum Potato", "6+ Hours"],
    image: { url: kacchi, alt: "Kacchi Biriyani — Berlin's authentic slow-cooked mutton biriyani" },
  },
  {
    number: "02",
    label: "The Perfect Companion",
    name: "",
    emphasis: "Borhani",
    subtitle: "spiced yoghurt drink · the kacchi companion",
    description:
      "No kacchi meal in Bangladesh is complete without Borhani. Chilled, spiced yoghurt blended with black salt, mint, coriander, and green chilli — it cuts through the richness of the biriyani perfectly. Ours is made from scratch, the traditional way. Cooling, complex, unlike anything from a bottle.",
    tags: ["Spiced Yoghurt", "Black Salt", "Fresh Mint", "Coriander", "Served Chilled"],
    image: { url: borhani, alt: "Borhani — traditional Bangladeshi spiced yoghurt drink" },
  },
];
