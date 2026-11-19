# Surffaces website

One-page, responsive website for Surffaces (www.surffaces.com) — tile, flooring and countertops. Plain HTML, CSS and JavaScript — no build step.

```
index.html          page content
assets/styles.css   all styling (brand colours and font at the top)
assets/script.js    menu, accordion, scroll effects, form demo
```

Open `index.html` in a browser to preview.

## Make it yours

1. **Logo** – `assets/img/logo-white.png` (over photos and the footer), `logo-black.png` (white header), `logo-navy.png` (spare); favicons in the same folder.
2. **Colours & font** – edit the variables in `:root` at the top of `assets/styles.css` (the site is monochrome: `--ink` for type and buttons, `--paper` for grey sections).
3. **Photos** – every placeholder box is a `<div class="photo" data-label="…">` (variants: `stone`, `tile`). Either replace it with `<img src="images/kitchen.jpg" alt="…">` or add a background: `style="background-image:url(images/kitchen.jpg)"` (and remove `data-label`).
4. **Text** – all copy is placeholder; the story section especially needs your own words; check the services and process steps match how you work.
5. **Contact form** – set the form's `action` to your form service (e.g. Formspree or Netlify Forms). Until then it shows a demo message.

## Sections

Hero · About us · Services · Process · Reviews · FAQ · Blog · Contact · Footer

Blog articles live in `blog/` (one HTML file per post; copy one to add another, then add a card in the Blog section of `index.html`).

## Before launch

- **Reviews are examples.** Replace the three reviews in `index.html` with real customer reviews (with permission), and point "Read reviews on Google" at your Google Business profile.
- **Check the FAQ answers** match how you work (installation, supply-only, trade accounts, timelines).
- **Social links** in the footer point to `#`; add your real profile URLs.
