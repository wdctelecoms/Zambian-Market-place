/* Zambian Marketplace: global authentication guard.
   Every non-public HTML page is protected by the current Supabase user.
   This file uses only the public publishable key and never a service-role key. */
(function () {
  const SUPABASE_URL = 'https://iqurvvxmfjfvlkvfsanq.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_0F_NAcjt5hB7cqq8t6y2qA_tFWGv8Oi';
  const PUBLIC_PAGES = new Set(['index.html', 'intro.html', 'login.html', 'register.html']);
  const LOGIN = 'login.html';
  const CHECK_MS = 30000;
  const originalFetch = window.fetch.bind(window);

  function currentPage() {
    return location.pathname.split('/').pop() || 'index.html';
  }

  function isPublic() {
    return PUBLIC_PAGES.has(currentPage());
  }

  function getClient() {
    if (!window.supabase) return null;
    if (!window.__zmarketGuardClient) {
      window.__zmarketGuardClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          flowType: 'implicit'
        }
      });
    }
    return window.__zmarketGuardClient;
  }

  function loginUrl() {
    const returnUrl = currentPage() + (location.search || '');
    return `${new URL(LOGIN, location.href).href}?returnUrl=${encodeURIComponent(returnUrl)}`;
  }

  function reveal() {
    document.documentElement.removeAttribute('data-zmarket-auth-pending');
    document.documentElement.style.visibility = '';
    document.body?.removeAttribute('data-zmarket-auth-pending');
    window.dispatchEvent(new CustomEvent('zmarket:auth-ready'));
  }

  function hideUntilReady() {
    if (isPublic()) return;
    document.documentElement.setAttribute('data-zmarket-auth-pending', '1');
    document.documentElement.style.visibility = 'hidden';
  }

  async function getValidSession(client) {
    if (!client) return null;
    try {
      const { data } = await client.auth.getSession();
      if (!data?.session?.access_token) return null;
      return data.session;
    } catch {
      return null;
    }
  }

  async function verifyUser(client, session) {
    if (!session?.access_token) return null;
    try {
      const { data, error } = await client.auth.getUser(session.access_token);
      if (!error && data?.user) return data.user;
    } catch {}
    return null;
  }

  async function ensureAuth() {
    const client = getClient();
    if (!client) {
      if (!isPublic()) {
        location.replace(loginUrl());
        return null;
      }
      reveal();
      return null;
    }

    const session = await getValidSession(client);
    if (!session) {
      if (!isPublic()) {
        reveal();
        location.replace(loginUrl());
        return null;
      }
      reveal();
      return null;
    }

    const user = await verifyUser(client, session);
    if (!user) {
      try { await client.auth.signOut(); } catch {}
      if (!isPublic()) {
        reveal();
        location.replace(loginUrl());
        return null;
      }
      reveal();
      return null;
    }

    window.__zmarketSession = session;
    window.__zmarketUser = user;
    window.__zmarketAuthReady = Promise.resolve({ session, user });
    try {
      localStorage.setItem('zmarket-auth', JSON.stringify({
        user,
        tokens: { accessToken: session.access_token }
      }));
    } catch {}

    reveal();
    return { session, user };
  }

  function installAuthenticatedFetch() {
    if (window.__zmarketFetchInstalled) return;
    window.__zmarketFetchInstalled = true;

    window.fetch = async function (input, init = {}) {
      const url = typeof input === 'string' ? input : input?.url || '';
      const isApi = url.startsWith('/api/') || url.startsWith(location.origin + '/api/');
      if (!isApi) return originalFetch(input, init);

      const client = getClient();
      const session = await getValidSession(client);
      if (!session) {
        if (!isPublic()) location.replace(loginUrl());
        throw new Error('Authentication required.');
      }

      const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
      headers.set('Authorization', `Bearer ${session.access_token}`);
      if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
      }

      const nextInit = { ...init, headers };
      let response = await originalFetch(input, nextInit);

      if (response.status === 401 && client) {
        try {
          const { data, error } = await client.auth.refreshSession();
          if (!error && data?.session?.access_token) {
            headers.set('Authorization', `Bearer ${data.session.access_token}`);
            window.__zmarketSession = data.session;
            response = await originalFetch(input, { ...nextInit, headers });
          }
        } catch {}
      }

      return response;
    };
  }

  async function heartbeat() {
    if (isPublic()) return;
    const client = getClient();
    const session = await getValidSession(client);
    if (!session) {
      try { await client?.auth.signOut(); } catch {}
      location.replace(loginUrl());
      return;
    }
    window.__zmarketSession = session;
  }

  async function init() {
    hideUntilReady();
    installAuthenticatedFetch();
    const result = await ensureAuth();
    if (!result && !isPublic()) return;

    const client = getClient();
    client?.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && !isPublic()) {
        location.replace(loginUrl());
        return;
      }
      if (session) {
        window.__zmarketSession = session;
        window.__zmarketUser = session.user || window.__zmarketUser;
      }
    });

    if (!isPublic()) {
      setInterval(() => { void heartbeat(); }, CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void heartbeat();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void init(); }, { once: true });
  } else {
    void init();
  }
})();
