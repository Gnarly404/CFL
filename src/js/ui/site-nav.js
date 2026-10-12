export function initSiteNavigation(root = document) {
  const toggle = root.querySelector('.site-nav-toggle');
  const navigation = root.querySelector('#site-nav-links');
  const navbar = toggle?.closest('.navbar');
  if (!toggle || !navigation || !navbar) return;

  const close = ({ restoreFocus = false } = {}) => {
    delete navbar.dataset.menuOpen;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
    if (restoreFocus) toggle.focus();
  };

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    if (open) {
      navbar.dataset.menuOpen = 'true';
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close navigation');
    } else close();
  });
  navigation.addEventListener('click', (event) => {
    if (event.target.closest('a')) close();
  });
  root.addEventListener('pointerdown', (event) => {
    if (navbar.dataset.menuOpen && !navbar.contains(event.target)) close();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navbar.dataset.menuOpen) close({ restoreFocus: true });
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) close();
  });
}

initSiteNavigation();