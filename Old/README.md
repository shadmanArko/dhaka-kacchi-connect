# Dhaka Kacchi — Website v3 (Berlin Edition)

## What's New in This Version
- **Berlin-focused**: All copy updated to reflect Berlin location
- **2 Products on homepage**: Kacchi Biriyani + Borhani side by side
- **SVG Logo**: "Dhaka Kacchi" wordmark in nav + footer on every page
- **Your real story**: "I searched all over Berlin, couldn't find it, so I made it myself" — from old website, now on About page and homepage
- **Order page updated**: WhatsApp CTA + 48h advance / 2 plate minimum info

## Folder Structure
```
dhakakacchi/
├── index.html              ← Homepage (Berlin, 2 products, your story)
├── css/style.css           ← All shared styles
├── js/nav.js               ← Navigation with SVG logo, footer
└── pages/
    ├── about.html          ← Your full story (doctor, Berlin, family)
    ├── history.html        ← History of Kacchi Biriyani
    ├── subscribe.html      ← Email subscribe page
    └── order.html          ← Order via WhatsApp (Berlin)
```

## To Customise

### WhatsApp Number
In `pages/order.html`, find:
```
href="https://wa.me/491234567890"
```
Replace `491234567890` with your actual WhatsApp number (country code + number, no +).

### Logo
The logo is currently an SVG text in `js/nav.js`. If you have an image logo (PNG/SVG file), replace the `logoSVG` variable with an `<img>` tag pointing to your logo file.

### Food Photos
Replace emoji placeholders with real photos:
```html
<div class="story-img-placeholder">🫕</div>
```
→
```html
<img src="../images/kacchi-photo.jpg" alt="Kacchi Biriyani" style="width:100%;border-radius:2px;">
```

### Connect Subscribe Form
See `pages/subscribe.html` for Mailchimp/Brevo instructions.
