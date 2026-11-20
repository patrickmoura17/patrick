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
