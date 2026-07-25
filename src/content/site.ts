/**
 * Site-wide content and configuration.
 * One-file edit changes the WhatsApp number, email, socials, or nav.
 */

export const site = {
  name: "Dhaka Kacchi Berlin",
  tagline: "Authentic Kacchi Biriyani & Borhani",
  location: "Berlin, Germany",
  email: "hello@dhakakacchi.com",
  website: "www.dhakakacchi.com",
  whatsappNumber: "4915563583687", // country code + number, no +
  socials: {
    instagram: "https://www.instagram.com/dhakakacchi",
    facebook: "https://www.facebook.com/DhakaKacchi/",
  },
} as const;

export const nav = [
  { label: "Home", to: "/" as const },
  { label: "About", to: "/about" as const },
  { label: "History", to: "/history" as const },
  { label: "Subscribe", to: "/subscribe" as const },
] as const;

export const orderCTA = { label: "Order Now", to: "/order" as const };
