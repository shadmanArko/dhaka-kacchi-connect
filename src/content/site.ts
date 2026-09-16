/**
 * Site-wide content and configuration.
 * One-file edit changes the WhatsApp number, email, socials, or nav.
 */

export const site = {
  name: "Dhaka Kacchi Berlin",
  tagline: "Authentic Kacchi Biriyani & Borhani",
  location: "Berlin, Germany",
  email: "hello@dhakakacchi.com",
  // Apex, not www - www 301s here (see public/.htaccess), so printing the
  // www form in the footer would advertise the non-canonical hostname.
  website: "dhakakacchi.com",
  whatsappNumber: "4915563583687", // country code + number, no +
  socials: {
    instagram: "https://www.instagram.com/dhakakacchi",
    facebook: "https://www.facebook.com/DhakaKacchi/",
  },
} as const;

// `labelKey` is looked up via t() at render time (see SiteHeader) - kept as
// a key here, not the English label, so this file doesn't need touching
// when a translation changes.
export const nav = [
  { labelKey: "nav.home", to: "/" as const },
  { labelKey: "nav.about", to: "/about" as const },
  { labelKey: "nav.history", to: "/history" as const },
  { labelKey: "nav.subscribe", to: "/subscribe" as const },
] as const;

export const orderCTA = { labelKey: "nav.orderNow", to: "/order" as const };
