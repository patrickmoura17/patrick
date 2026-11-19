# Surffaces website

One-page, responsive website for Surffaces (www.surffaces.com) — tile, flooring and countertops. Plain HTML, CSS and JavaScript — no build step.

```
index.html          page content
assets/styles.css   all styling (brand colours and font at the top)
assets/script.js    menu, accordion, scroll effects, form demo
```

Open `index.html` in a browser to preview.

## Make it yours

1. **Logo** – `assets/img/logo-white.png` (on dark) and `logo-navy.png` (on light); favicons in the same folder.
2. **Colours & font** – edit the variables in `:root` at the top of `assets/styles.css` (`--accent` is the warm highlight colour).
3. **Photos** – every placeholder box is a `<div class="photo" data-label="…">` (variants: `stone`, `tile`). Either replace it with `<img src="images/kitchen.jpg" alt="…">` or add a background: `style="background-image:url(images/kitchen.jpg)"` (and remove `data-label`).
4. **Text** – all copy is placeholder; the story section especially needs your own words; check the services and process steps match how you work.
5. **Contact form** – set the form's `action` to your form service (e.g. Formspree or Netlify Forms). Until then it shows a demo message.

## Sections

Header with pill CTA · full-screen hero · company statement · story with stats · services accordion with image swap · 6-step process · project grid · contact form · footer with large wordmark.
