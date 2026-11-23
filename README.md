# Surffaces website

One-page, responsive website for Surffaces (www.surffaces.com) — tile, flooring and countertops. Plain HTML, CSS and JavaScript — no build step.

```
index.html          page content
assets/styles.css   all styling (brand colours and font at the top)
assets/script.js    menu, accordion, scroll effects, form demo
```

Open `index.html` in a browser to preview.

## Make it yours

1. **Logo** – `assets/img/logo-white.png` (over photos and the footer), `logo-navy.png` (white header), `logo-black.png` (spare); the big "SURFFACES" at the bottom of the footer is text, not the logo; favicons in the same folder.
2. **Colours & font** – the font is Inter Display (Inter at its display optical size, loaded from Google Fonts). Edit the variables in `:root` at the top of `assets/styles.css` (`--ink` is the Surffaces navy used for type, buttons and the footer; `--paper` is the light grey section background).
3. **Photos** – every placeholder box is a `<div class="photo" data-label="…">` (variants: `stone`, `tile`). Either replace it with `<img src="images/kitchen.jpg" alt="…">` or add a background: `style="background-image:url(images/kitchen.jpg)"` (and remove `data-label`).
4. **Text** – all copy is placeholder; the story section especially needs your own words; check the services and process steps match how you work.
5. **Contact form** – `send-request.php` emails each request (photos attached, shrunk to about 1800 px) to contact@surffaces.com. It sends through the Hostinger Mail API from the contact@ mailbox, so requests land in the inbox; the API key is kept on the server in `private/mail-api.php`, which is not in this repository. If that file is missing or the API fails, it falls back to the server's built-in mail. It needs PHP hosting, so it won't work when opening `index.html` from your computer.

## Sections

Hero · About us · Services · Process · Reviews · FAQ · Blog · Contact · Footer

Blog articles live in `blog/` (one HTML file per post; copy one to add another, then add a card in the Blog section of `index.html`).

## Before launch

- **Reviews are examples.** Replace the three reviews in `index.html` with real customer reviews (with permission), and point "Read reviews on Google" at your Google Business profile.
- **Check the FAQ answers** match how you work (installation, supply-only, trade accounts, timelines).
- **Social links** in the footer point to `#`; add your real profile URLs.

## Search engines

- `robots.txt` allows crawling (except the form handler, thank-you page and `private/`) and points to the sitemap.
- `sitemap.xml` lists the homepage and the blog guides. **Add every new public page to it** (with its `www.surffaces.com` address) when you create one.

## Publishing changes

Browsers keep `assets/styles.css` and `assets/script.js` for 7 days. Whenever either file changes, update the `?v=` number in its links on every page (index.html, blog/*.html, thank-you.html, send-request.php) so visitors get the new version straight away.
