export type MenuItem = {
  sku: string;
  name: string;
  priceCents: number;
  description: string;
};

// Prices are the single source of truth here — the frontend never sets its
// own price, it only sends { sku, quantity } and the worker prices the order.
export const MENU: MenuItem[] = [
  {
    sku: "kacchi_taster",
    name: "Kacchi Biriyani — Taster Box (750ml, 1 person)",
    priceCents: 999,
    description: "1 piece of lamb, 1 whole potato, fresh salad.",
  },
  {
    sku: "kacchi_regular",
    name: "Kacchi Biriyani — Regular Box (1000ml, 2 people)",
    priceCents: 1500,
    description: "2 pieces of lamb, 1 whole potato, fresh salad, homemade chutney.",
  },
  {
    sku: "borhani",
    name: "Shahi Borhani (500ml)",
    priceCents: 600,
    description: "Traditional yogurt-based drink with mint and aromatic spices.",
  },
];

export const MENU_BY_SKU = new Map(MENU.map((item) => [item.sku, item]));

// The kitchen's own location - Müllerstraße 25, 13353 Berlin (the Lidl in the
// former Karstadt building, ~180m from Leopoldplatz square, opened April
// 2025). This is BOTH the free-pickup point shown to customers and the point
// delivery distance is measured from. Verified via a real address lookup
// (Lidl's own press release naming the address, cross-checked against
// OpenStreetMap/Nominatim geocoding), not an approximation.
export const KITCHEN_LOCATION = {
  label: "Leopoldplatz, Wedding — in front of Lidl",
  street: "Müllerstraße",
  houseNumber: "25",
  postalCode: "13353",
  city: "Berlin",
  lat: 52.5461042,
  lng: 13.3606482,
};

// Distance-tiered doorstep delivery pricing. Ordered, contiguous bands - the
// tier for a given distance is the FIRST entry whose maxKm the distance does
// not exceed. Deliberately a flat editable list, not inline conditionals:
// the business expects to keep adding tiers / adjusting prices, so a change
// here should never require touching quote/order logic.
//
// Beyond the last tier's maxKm - or outside Berlin's real boundary
// (see lib/geo.ts) regardless of distance - delivery is not offered at all;
// pickup remains free and always available.
export const DELIVERY_FEE_TIERS: { maxKm: number; feeCents: number }[] = [
  { maxKm: 5, feeCents: 500 },
  { maxKm: 10, feeCents: 700 },
  { maxKm: 15, feeCents: 900 },
  { maxKm: 20, feeCents: 1200 },
  { maxKm: 25, feeCents: 1500 },
];
