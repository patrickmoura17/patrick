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

// Placeholder form handler — replace with your form service
document.querySelector('.contact-form')?.addEventListener('submit', (e) => {
  if (e.target.getAttribute('action') === '#') {
    e.preventDefault();
    e.target.querySelector('.form-note').textContent =
      'Thanks! (Demo only — connect this form to a service to receive enquiries.)';
    e.target.reset();
  }
});

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
