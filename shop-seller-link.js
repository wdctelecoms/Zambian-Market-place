/* Seller CTA for the marketplace shop page. */
(function () {
  function addSellerButton() {
    if (document.getElementById('seller-dashboard-cta')) return;
    const header = document.querySelector('header') || document.querySelector('.header') || document.querySelector('nav');
    if (!header) return;
    const link = document.createElement('a');
    link.id = 'seller-dashboard-cta';
    link.href = 'seller.html';
    link.textContent = 'Sell on Zambian Marketplace';
    link.setAttribute('aria-label', 'Go to seller dashboard and sell products');
    link.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;gap:8px;margin:8px 0;padding:10px 16px;border-radius:10px;background:#0B3D24;color:#fff;text-decoration:none;font-weight:700;white-space:nowrap;';
    const nav = header.querySelector('nav');
    (nav || header).appendChild(link);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addSellerButton);
  else addSellerButton();
})();
