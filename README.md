# Cabinetry website template

A one-page, responsive website template for a custom cabinetry business. Plain HTML, CSS and JavaScript — no build step.

```
index.html          page content
assets/styles.css   all styling (brand colours and font at the top)
assets/script.js    menu, accordion, scroll effects, form demo
```

Open `index.html` in a browser to preview.

## Make it yours

1. **Name & contact** – search `index.html` for `Your Company`, `hello@yourcompany.com`, `(000) 000-0000` and `123 Main Street`.
2. **Colours & font** – edit the variables in `:root` at the top of `assets/styles.css` (`--accent` is the wood tone).
3. **Photos** – every brown box is a `<div class="photo" data-label="…">`. Either replace it with `<img src="images/kitchen.jpg" alt="…">` or add a background: `style="background-image:url(images/kitchen.jpg)"` (and remove `data-label`).
4. **Text** – all copy is placeholder; rewrite the story, services and process steps in your own words.
5. **Contact form** – set the form's `action` to your form service (e.g. Formspree or Netlify Forms). Until then it shows a demo message.
6. **Footer wordmark** – adjust `font-size` on `.wordmark` so your company name fills the width.

## Sections

Header with pill CTA · full-screen hero · company statement · story with stats · services accordion with image swap · 6-step process · project grid · contact form · footer with large wordmark.
