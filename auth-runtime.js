/* Zambian Marketplace: browser-side Supabase auth runtime.
   Uses only the public publishable key. Never put a service-role key here. */
(function () {
  const SUPABASE_URL = 'https://iqurvvxmfjfvlkvfsanq.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_0F_NAcjt5hB7cqq8t6y2qA_tFWGv8Oi';
  const PROTECTED = new Set(['shop.html','cart.html','seller.html','chat.html','account.html','checkout.html','orders.html']);
  const PUBLIC_AUTH = new Set(['login.html','register.html']);

  function page() { return location.pathname.split('/').pop() || 'index.html'; }
  function client() {
    if (!window.supabase) return null;
    if (!window.__zmarketSupabase) window.__zmarketSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return window.__zmarketSupabase;
  }
  function message(text, type) {
    const ids = ['status','auth-status','login-status','register-status','form-status','message'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) { el.textContent = text; el.style.display = 'block'; el.dataset.type = type || 'info'; return; }
    }
    let el = document.getElementById('zmarket-auth-status');
    if (!el) { el = document.createElement('div'); el.id='zmarket-auth-status'; el.style.cssText='position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:99999;padding:12px 18px;border-radius:10px;background:#0B3D24;color:#fff;font:500 14px Inter,Arial,sans-serif;max-width:90vw;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.2)'; document.body.appendChild(el); }
    el.textContent=text;
  }
  function setBusy(form, busy) {
    if (!form) return;
    form.querySelectorAll('button[type="submit"],input[type="submit"]').forEach(b => { b.disabled=busy; b.dataset.oldText=b.dataset.oldText||b.textContent; if (busy) b.textContent='Please wait…'; else if (b.dataset.oldText) b.textContent=b.dataset.oldText; });
  }
  function findInput(form, names, type) {
    for (const n of names) { const x=form.querySelector(`[name="${n}"],#${n}`); if (x) return x; }
    return type ? form.querySelector(`input[type="${type}"]`) : null;
  }
  function getAuthForm(kind) {
    const forms=[...document.forms];
    return forms.find(f => {
      const text=(f.id+' '+f.className+' '+f.textContent).toLowerCase();
      if (kind==='login') return /login|sign.?in/.test(text) && findInput(f,['email'],'email') && findInput(f,['password'],'password');
      return /register|sign.?up|create account/.test(text) && findInput(f,['email'],'email') && findInput(f,['password','password_confirmation','confirmPassword'],'password');
    });
  }
  async function syncProfile(session, fallback={}) {
    if (!session?.access_token) return null;
    const authUser=session.user || {};
    const metadata=authUser.user_metadata || {};
    const email=authUser.email || fallback.email || '';
    const fullName=metadata.full_name || metadata.fullName || metadata.name || fallback.fullName || email.split('@')[0] || 'Customer';
    const role=(metadata.role || fallback.role || 'CUSTOMER').toUpperCase()==='SELLER'?'SELLER':'CUSTOMER';
    const body={
      fullName,
      role,
      phone:fallback.phone || metadata.phone || authUser.phone || '',
      paymentMethod:fallback.paymentMethod || metadata.paymentMethod || 'CARD',
      street:fallback.street || metadata.street || '',
      city:fallback.city || metadata.city || '',
      province:fallback.province || metadata.province || '',
      country:fallback.country || metadata.country || 'Zambia',
      postalCode:fallback.postalCode || metadata.postalCode || ''
    };
    const response=await fetch('/api/auth/sync',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body)});
    if(!response.ok) throw new Error('Your account was authenticated, but the marketplace profile could not be synchronized.');
    const payload=await response.json();
    return payload.user || payload;
  }
  async function getMarketplaceUser(session) {
    if (!session?.access_token) return null;
    try {
      const response=await fetch('/api/auth/me',{headers:{Authorization:`Bearer ${session.access_token}`}});
      if(response.ok){const payload=await response.json();return payload.user||payload;}
    } catch {}
    return null;
  }
  async function ensureMarketplaceUser(session, fallback={}) {
    const existing=await getMarketplaceUser(session);
    if (existing) return existing;
    return await syncProfile(session,fallback);
  }
  async function redirectForUser(user) {
    const role=(user?.role||user?.user_metadata?.role||'CUSTOMER').toUpperCase();
    const params=new URLSearchParams(location.search);
    const returnUrl=params.get('returnUrl');
    const allowed=['shop.html','cart.html','seller.html','chat.html','account.html','checkout.html','orders.html'];
    if (returnUrl && allowed.includes(returnUrl.split('/').pop())) { location.replace(returnUrl); return; }
    location.replace(role==='SELLER' ? 'seller.html' : 'shop.html');
  }
  async function guard() {
    const c=client(); if (!c) return;
    const p=page();
    const {data:{session}}=await c.auth.getSession();
    if (PROTECTED.has(p) && !session) { location.replace('login.html?returnUrl='+encodeURIComponent(p)); return; }
    if (PUBLIC_AUTH.has(p) && session) {
      try {
        const user=await ensureMarketplaceUser(session);
        await redirectForUser(user || session.user);
      } catch (err) {
        message(err?.message||'We could not load your marketplace profile. Please try again.','error');
      }
    }
  }
  async function bindLogin() {
    const c=client(), form=getAuthForm('login'); if (!c || !form || form.dataset.zmarketBound) return;
    form.dataset.zmarketBound='1';
    form.addEventListener('submit',async e=>{
      e.preventDefault(); e.stopImmediatePropagation(); setBusy(form,true); message('Signing you in…','info');
      try {
        const email=findInput(form,['email'],'email')?.value.trim();
        const password=findInput(form,['password'],'password')?.value;
        if (!email || !password) throw new Error('Enter your email and password.');
        const {data,error}=await c.auth.signInWithPassword({email,password});
        if (error) throw error;
        if (!data.session) throw new Error('Login did not create a session.');
        const user=await ensureMarketplaceUser(data.session,{email});
        message('Login successful. Opening your marketplace account…','success');
        await redirectForUser(user || data.user);
      } catch(err) { message(err?.message||'Login failed. Please try again.','error'); setBusy(form,false); }
    },true);
  }
  async function bindRegister() {
    const c=client(), form=getAuthForm('register'); if (!c || !form || form.dataset.zmarketBound) return;
    form.dataset.zmarketBound='1';
    form.addEventListener('submit',async e=>{
      e.preventDefault(); e.stopImmediatePropagation(); setBusy(form,true); message('Creating your account…','info');
      try {
        const email=findInput(form,['email'],'email')?.value.trim();
        const password=findInput(form,['password'],'password')?.value;
        const confirm=findInput(form,['password_confirmation','confirmPassword','confirm-password','confirm_password'],'password');
        if (!email || !password) throw new Error('Enter an email address and password.');
        if (confirm && confirm.value!==password) throw new Error('Passwords do not match.');
        if (password.length<6) throw new Error('Password must be at least 6 characters.');
        const name=findInput(form,['fullName','full_name','name','username'],'text')?.value.trim() || '';
        const roleInput=findInput(form,['role']);
        const role=((roleInput?.value||'CUSTOMER').toUpperCase()==='SELLER')?'SELLER':'CUSTOMER';
        const phone=findInput(form,['phone'],'tel')?.value.trim() || '';
        const paymentMethod=findInput(form,['payment-method','paymentMethod'])?.value || 'CARD';
        const {data,error}=await c.auth.signUp({email,password,options:{data:{full_name:name,fullName:name,role,phone,paymentMethod}}});
        if (error) throw error;
        if (data.session) {
          const user=await syncProfile(data.session,{email,fullName:name,role,phone,paymentMethod});
          message('Account created. Opening your marketplace account…','success');
          await redirectForUser(user || data.user);
        } else {
          message('Account created. Check your email to verify your account, then log in.','success');
          setBusy(form,false);
        }
      } catch(err) { message(err?.message||'Registration failed. Please try again.','error'); setBusy(form,false); }
    },true);
  }
  function bindGoogle() {
    const c=client(); if (!c) return;
    document.querySelectorAll('button,a').forEach(el=>{
      const text=(el.textContent+' '+el.getAttribute('aria-label')).toLowerCase();
      if (!/google/.test(text) || el.dataset.zgoogle) return;
      el.dataset.zgoogle='1';
      el.addEventListener('click',async e=>{
        e.preventDefault(); message('Connecting to Google…','info');
        const {error}=await c.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/login.html'}});
        if(error) message(error.message,'error');
      },true);
    });
  }
  async function handleAuthChange(event, session) {
    if (event==='SIGNED_OUT') {
      if (PROTECTED.has(page())) location.replace('login.html');
      return;
    }
    if (!session) return;
    if (PUBLIC_AUTH.has(page()) && event==='SIGNED_IN') {
      try {
        const user=await ensureMarketplaceUser(session);
        await redirectForUser(user || session.user);
      } catch (err) {
        message(err?.message||'Signed in, but your marketplace profile could not be loaded.','error');
      }
    }
  }
  async function init() {
    if (!window.supabase) { message('Authentication service is still loading. Refresh the page if this message remains.','error'); return; }
    const c=client();
    await guard();
    await bindLogin(); await bindRegister(); bindGoogle();
    c.auth.onAuthStateChange((event,session)=>{ void handleAuthChange(event,session); });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();