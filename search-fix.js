/* Global marketplace search fallback.
   Works with existing search forms without replacing page-specific logic. */
(function () {
  function getSearchInput(form) {
    return form.querySelector('input[type="search"], input[name*="search" i], input[placeholder*="search" i]');
  }

  function getItems() {
    const selectors = [
      '#products-grid > *',
      '.products-grid > *',
      '.product-grid > *',
      '.product-list > *',
      '[data-searchable]',
      '.product-card',
      '.product-item',
      '.card',
      '.order-item',
      'article'
    ];
    const found = [];
    selectors.forEach(selector => document.querySelectorAll(selector).forEach(el => {
      if (!found.includes(el)) found.push(el);
    }));
    return found;
  }

  function filterPage(query) {
    const q = String(query || '').trim().toLowerCase();
    const items = getItems();
    if (!items.length) return false;

    let matches = 0;
    items.forEach(item => {
      const text = (item.textContent || '').toLowerCase();
      const match = !q || text.includes(q);
      item.hidden = !match;
      if (match) matches++;
    });

    let empty = document.getElementById('search-no-results');
    if (!empty) {
      empty = document.createElement('div');
      empty.id = 'search-no-results';
      empty.className = 'empty-state';
      empty.textContent = 'No matching results found.';
      empty.style.margin = '20px 0';
    }
    if (items[0]?.parentElement && !empty.parentElement) items[0].parentElement.appendChild(empty);
    empty.hidden = matches !== 0 || !q;
    return true;
  }

  function bind() {
    document.querySelectorAll('form').forEach(form => {
      const input = getSearchInput(form);
      if (!input || form.dataset.searchFixBound === 'true') return;
      form.dataset.searchFixBound = 'true';

      form.addEventListener('submit', event => {
        // Let the dedicated shop search handler perform its live API search.
        if (form.id === 'shop-search-form') return;
        event.preventDefault();
        filterPage(input.value);
      });

      input.addEventListener('input', () => {
        if (form.id !== 'shop-search-form') filterPage(input.value);
      });
    });

    // Search buttons that are not inside a form.
    document.querySelectorAll('button, a').forEach(button => {
      const label = (button.getAttribute('aria-label') || button.textContent || '').toLowerCase();
      if (!label.includes('search') || button.dataset.searchFixBound === 'true') return;
      button.dataset.searchFixBound = 'true';
      button.addEventListener('click', event => {
        const form = button.closest('form');
        const input = form ? getSearchInput(form) : document.querySelector('input[type="search"], input[name*="search" i], input[placeholder*="search" i]');
        if (!input) return;
        if (form?.id === 'shop-search-form') return;
        event.preventDefault();
        filterPage(input.value);
        input.focus();
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
