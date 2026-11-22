// Header background after scrolling past the hero
const header = document.querySelector('.site-header');
const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 40);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// Mobile menu
const toggle = document.querySelector('.menu-toggle');
const menu = document.getElementById('mobile-menu');
const setMenu = (open) => {
  menu.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  document.body.style.overflow = open ? 'hidden' : '';
  document.body.classList.toggle('menu-open', open);
};
if (toggle && menu) {
  toggle.addEventListener('click', () => setMenu(menu.hidden));
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
}

// Services accordion: click a service to open it (and close the others); click again to close
const items = [...document.querySelectorAll('.acc-item')];
items.forEach((item) => {
  item.querySelector('.acc-head').addEventListener('click', () => {
    const opening = !item.classList.contains('is-open');
    items.forEach((other) => {
      const open = other === item && opening;
      other.classList.toggle('is-open', open);
      other.querySelector('.acc-head').setAttribute('aria-expanded', String(open));
    });
  });
});

// Fade sections in as they scroll into view
const revealTargets = document.querySelectorAll('.section > *, .steps li, .review, .post');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  revealTargets.forEach((el) => { el.classList.add('reveal'); io.observe(el); });
}

// Photo upload: previews, remove buttons, drag and drop, size and count limits
const photoInput = document.getElementById('f-photos');
if (photoInput) {
  const MAX_FILES = 10, MAX_MB = 10;
  const zone = photoInput.closest('.dropzone');
  const list = document.querySelector('.thumbs');
  const note = document.querySelector('.upload-note');
  let files = [];
  const sync = () => {
    // keep the real file input in step with the list shown, so the form sends exactly these
    try { const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f)); photoInput.files = dt.files; } catch (_) {}
    list.innerHTML = '';
    files.forEach((file, i) => {
      const li = document.createElement('li');
      const img = document.createElement('img'); img.alt = file.name; img.src = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(img.src);
      const rm = document.createElement('button'); rm.type = 'button'; rm.textContent = '×'; rm.setAttribute('aria-label', `Remove ${file.name}`);
      rm.addEventListener('click', () => { files.splice(i, 1); note.textContent = ''; sync(); });
      li.append(img, rm); list.append(li);
    });
  };
  const add = (incoming) => {
    const skipped = [];
    for (const f of incoming) {
      if (!f.type.startsWith('image/')) { skipped.push(`${f.name} isn't an image`); continue; }
      if (f.size > MAX_MB * 1024 * 1024) { skipped.push(`${f.name} is over ${MAX_MB} MB`); continue; }
      if (files.length >= MAX_FILES) { skipped.push(`only ${MAX_FILES} photos can be added`); break; }
      files.push(f);
    }
    note.textContent = skipped.length ? `Not added: ${skipped.join('; ')}.` : (files.length ? `${files.length} photo${files.length > 1 ? 's' : ''} added.` : '');
    sync();
  };
  photoInput.addEventListener('change', () => add([...photoInput.files]));
  ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, () => zone.classList.remove('is-over')));
  zone.addEventListener('drop', (e) => { e.preventDefault(); add([...(e.dataTransfer?.files || [])]); });
  photoInput.form?.addEventListener('reset', () => { files = []; note.textContent = ''; setTimeout(sync); });
}

// Contact form: demo message when the form has no handler (the preview);
// on the live site, show "Sending…" while the request and photos upload.
document.querySelector('.contact-form')?.addEventListener('submit', (e) => {
  const form = e.target;
  const note = form.querySelector('.form-note');
  if (form.getAttribute('action') === '#') {
    e.preventDefault();
    note.textContent = 'Thanks! (Demo only: this preview does not send requests.)';
    form.reset();
    return;
  }
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  note.textContent = 'Sending your request. This can take a moment with photos.';
});
// If the visitor comes back to the page, re-enable the button
window.addEventListener('pageshow', () => {
  const btn = document.querySelector('.contact-form button[type="submit"]');
  if (btn) { btn.disabled = false; btn.textContent = 'Send request'; }
});

// Live Google reviews (newest 3), served by reviews.php. Until there are reviews,
// the section shows a short note and the "Review us on Google" button.
(async () => {
  const grid = document.querySelector('#reviews .review-grid');
  if (!grid || !location.protocol.startsWith('http')) return;
  try {
    const res = await fetch('reviews.php', { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const data = await res.json();
    const list = Array.isArray(data.reviews) ? data.reviews : [];
    const summary = document.querySelector('#reviews .rating-summary');
    if (data.rating && data.count && summary) {
      summary.innerHTML = '<span class="stars" aria-hidden="true">★★★★★</span>';
      summary.append(`${data.rating.toFixed(1)} out of 5 from ${data.count} Google review${data.count === 1 ? '' : 's'}`);
      summary.hidden = false;
    }
    if (!list.length) return;
    const g = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.5z"/><path fill="#34A853" d="M12 23.5c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.4 1.1-3.9 1.1-3 0-5.5-2-6.4-4.8H1.8v3A11.5 11.5 0 0 0 12 23.5z"/><path fill="#FBBC05" d="M5.6 14.1a6.9 6.9 0 0 1 0-4.3v-3H1.8a11.5 11.5 0 0 0 0 10.3z"/><path fill="#EA4335" d="M12 4.6c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.5 11.5 0 0 0 1.8 6.8l3.8 3C6.5 6.9 9 4.6 12 4.6z"/></svg>';
    grid.replaceChildren(...list.map((r) => {
      const fig = document.createElement('figure'); fig.className = 'review';
      const stars = document.createElement('div'); stars.className = 'stars';
      const n = Math.max(0, Math.min(5, r.rating | 0));
      stars.textContent = '★'.repeat(n) + '☆'.repeat(5 - n); stars.setAttribute('aria-label', `${n} out of 5 stars`);
      const q = document.createElement('blockquote'); q.textContent = `“${r.text}”`;
      const cap = document.createElement('figcaption');
      const who = document.createElement(r.author_url ? 'a' : 'strong'); who.textContent = r.author;
      if (r.author_url) { who.href = r.author_url; who.target = '_blank'; who.rel = 'noopener'; who.style.fontWeight = '700'; }
      const meta = document.createElement('span'); meta.className = 'g-credit';
      meta.innerHTML = g; meta.append(`${r.when ? r.when + ' · ' : ''}Google review`);
      cap.append(who, meta); fig.append(stars, q, cap); return fig;
    }));
    grid.hidden = false;
    document.querySelector('#reviews .reviews-empty').hidden = true;
  } catch (_) { /* keep the note and button */ }
})();

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

// Floating call button: line it up with the hero's "Start a project" button,
// so it starts at the same height and then stays there as the page scrolls.
// Measured in the browser because phone browsers change the visible screen
// height as their toolbars show and hide.
const fab = document.querySelector('.call-fab');
const heroBtn = document.querySelector('.hero .btn-dot');
if (fab && heroBtn) {
  const alignFab = () => {
    const btnBottom = heroBtn.getBoundingClientRect().bottom + window.scrollY; // position in the page
    const offset = window.innerHeight - btnBottom;                            // gap to the screen bottom at the top of the page
    fab.style.bottom = offset > 8 ? `${Math.round(offset)}px` : '';
  };
  alignFab();
  window.addEventListener('resize', alignFab);
  window.addEventListener('load', alignFab);
  document.fonts?.ready.then(alignFab);
}
