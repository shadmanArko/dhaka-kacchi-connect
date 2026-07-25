# How to Change Images — Dhaka Kacchi Berlin

## Image Files (all in the `images/` folder)

| File | Used For | How to Replace |
|---|---|---|
| `logo-nav.png` | Logo in navigation bar | Replace file, keep same name |
| `kacchi.jpg` | Hero section, product card, food spotlight | Replace file, keep same name |
| `borhani-3-web.jpg` | Borhani product card | Replace file, keep same name |
| `borhani-1-web.jpg` | Story section photo | Replace file, keep same name |
| `borhani-2-web.jpg` | About page photo | Replace file, keep same name |

## To Change the Logo
The logo appears in the nav bar and footer on **every page** automatically.
- **Option A (easiest):** Replace `images/logo-nav.png` with your new logo file. Keep the same filename.
- **Option B:** Open `js/nav.js` and change the `logoSrc` variable to point to your new file.

## To Change Food Photos
Simply replace the image file in the `images/` folder with your new photo, keeping the same filename.

For example, to update the kacchi photo:
1. Take your new photo
2. Name it `kacchi.jpg`
3. Drop it into the `images/` folder, replacing the old file

That's it — the change will appear on all pages that use that photo.

## Recommended Photo Sizes
- Logo: PNG with transparent background, ~400×200px
- Food photos: JPG, ~1200×800px minimum, keep under 500KB for fast loading
- Hero photo: JPG, ~1400×1050px, optimised for web
