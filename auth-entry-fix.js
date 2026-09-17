/* Zambian Marketplace: login/register entry flow.
   Loaded before auth-runtime so it is the single handler for these two forms. */
(function () {
  const URL = 'https://iqurvvxmfjfvlkvfsanq.supabase.co';
  const KEY = 'sb_publishable_0F_NAcjt5hB7cqq8t6y2qA_tFWGv8Oi';

  function client() {
    if (!window.supabase) return null;
    if (!window.__zmarketEntryClient) {
      window.__zmarketEntryClient = window.supabase.createClient(URL, KEY, {
        auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'implicit' }
      });
    }
    return window.__zmarketEntryClient;
  }
  function form(id) { return document.getElementById(id); }
  function status(text, type) {
    const el = document.getElementById('form-status') || document.getElementById('status') || document.getElementById('auth-status');
    if (el) { el.textContent = text; el.style.display = 'block'; el.dataset.type = type || 'info'; }
  }
  function busy(f, value) {
    f?.querySelectorAll('button[type="submit"],input[type="submit"]').forEach(b => {
      if (!b.dataset.entryText) b.dataset.entryText = b.textContent;
      b.disabled = value;
      b.textContent = value ? 'Please wait…' : b.dataset.entryText;
    });
  }
  async function sync(session, fallback = {}) {
    const u = session?.user || {}, m = u.user_metadata || {};
    const email = u.email || fallback.email || '';
    const fullName = m.full_name || m.fullName || fallback.fullName || email.split('@')[0] || 'Customer';
    const role = String(m.role || fallback.role || 'CUSTOMER').toUpperCase() === 'SELLER' ? 'SELLER' : 'CUSTOMER';
    const body = {
      fullName, role,
      phone: fallback.phone || m.phone || u.phone || '',
      paymentMethod: fallback.paymentMethod || m.paymentMethod || 'CARD',
      street: fallback.street || m.street || '', city: fallback.city || m.city || '',
      province: fallback.province || m.province || '', country: fallback.country || m.country || 'Zambia',
      postalCode: fallback.postalCode || m.postalCode || ''
    };
    let r = await fetch('/api/auth/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body)
    });
    if (!r.ok) {
      let detail = ''; try { const p = await r.json(); detail = p.message || p.error || ''; } catch {}
      throw new Error(detail || 'Your login is valid, but the marketplace account could not be created.');
    }
    const p = await r.json();
    return p.user || p;
  }
  async function callback(c) {
    try {
      const u = new window.URL(location.href), code = u.searchParams.get('code');
      if (code) {
        const { data, error } = await c.auth.exchangeCodeForSession(code);
        if (!error && data?.session) { try { history.replaceState({}, document.title, location.pathname); } catch {} return data.session; }
        if (error) throw error;
      }
    } catch (e) { status(e.message || 'Account verification failed.', 'error'); }
    return null;
  }
  async function finish(session, forceShop = true) {
    const user = await sync(session);
    try { localStorage.setItem('zmarket-auth', JSON.stringify({ user, tokens: { accessToken: session.access_token } })); } catch {}
    window.__zmarketSession = session; window.__zmarketUser = user;
    status('Login successful. Opening the marketplace…', 'success');
    const role = String(user?.role || 'CUSTOMER').toUpperCase();
    setTimeout(() => location.replace(role === 'SELLER' ? 'seller.html' : 'shop.html'), 150);
  }

  async function init() {
    if (!window.supabase) return;
    const c = client();
    const p = location.pathname.split('/').pop() || '';
    if (p === 'login.html') {
      const verified = await callback(c);
      if (verified) { try { await finish(verified); return; } catch (e) { status(e.message, 'error'); } }
      const f = form('login-form');
      if (!f || f.dataset.entryBound) return;
      f.dataset.entryBound = '1'; f.dataset.zmarketBound = '1';
      f.addEventListener('submit', async e => {
        e.preventDefault(); e.stopImmediatePropagation(); busy(f, true); status('Signing you in…', 'info');
        try {
          const email = document.getElementById('email')?.value.trim();
          const password = document.getElementById('password')?.value;
          if (!email || !password) throw new Error('Enter your email and password.');
          const { data, error } = await c.auth.signInWithPassword({ email, password });
          if (error) throw error;
          if (!data?.session) throw new Error('Login did not create a valid session.');
          await finish(data.session);
        } catch (e) {
          status(/email not confirmed/i.test(e.message || '') ? 'Your account exists, but your email is not verified. Check your email, verify it, then log in again.' : (e.message || 'Unable to log in.'), 'error');
          busy(f, false);
        }
      }, true);
    }
    if (p === 'register.html') {
      const f = form('register-form');
      if (!f || f.dataset.entryBound) return;
      f.dataset.entryBound = '1'; f.dataset.zmarketBound = '1';
      f.addEventListener('submit', async e => {
        e.preventDefault(); e.stopImmediatePropagation(); busy(f, true); status('Creating your account…', 'info');
        try {
          const email = document.getElementById('email')?.value.trim();
          const password = document.getElementById('password')?.value;
          const confirm = document.querySelector('#confirm-password,#confirmPassword,#password_confirmation,[name="password_confirmation"]');
          if (!email || !password) throw new Error('Enter an email address and password.');
          if (confirm && confirm.value !== password) throw new Error('Passwords do not match.');
          if (password.length < 6) throw new Error('Password must be at least 6 characters.');
          const fullName = document.getElementById('full-name')?.value.trim() || '';
          const role = String(document.getElementById('role')?.value || 'CUSTOMER').toUpperCase() === 'SELLER' ? 'SELLER' : 'CUSTOMER';
          const phone = document.getElementById('phone')?.value.trim() || '';
          const paymentMethod = document.getElementById('payment-method')?.value || 'CARD';
          const street = document.getElementById('street')?.value.trim() || '';
          const city = document.getElementById('city')?.value.trim() || '';
          const province = document.getElementById('province')?.value.trim() || '';
          const country = document.getElementById('country')?.value.trim() || 'Zambia';
          const postalCode = document.getElementById('postal-code')?.value.trim() || '';
          const { data, error } = await c.auth.signUp({
            email, password,
            options: {
              emailRedirectTo: new window.URL('login.html', location.href).href,
              data: { full_name: fullName, fullName, role, phone, paymentMethod, street, city, province, country, postalCode, storeName: role === 'SELLER' ? fullName : undefined }
            }
          });
          if (error) throw error;
          if (data?.session) {
            await finish(data.session);
            return;
          }
          status('Account created. Check your email and verify your account. After verification, log in and you will be taken to the shop.', 'success');
          busy(f, false);
        } catch (e) {
          status(e.message || 'Unable to create your account.', 'error');
          busy(f, false);
        }
      }, true);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else void init();
})();
