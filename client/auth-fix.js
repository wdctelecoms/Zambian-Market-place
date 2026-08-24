(() => {
  const LOGIN_URL = new URL("login.html", window.location.href).href;
  const SHOP_URL = new URL("shop.html", window.location.href).href;
  const supabase = window.supabaseClient;

  if (!supabase) {
    console.error("Supabase client is not available.");
    return;
  }

  const setStatus = (message, type = "info") => {
    const el = document.getElementById("form-status");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("is-error", type === "error");
    el.classList.toggle("status-error", type === "error");
    el.classList.toggle("status-success", type === "success");
  };

  const getMeta = (user) => {
    const m = user?.user_metadata || {};
    const email = user?.email || "";
    return {
      fullName: m.fullName || m.full_name || m.name || email.split("@")[0] || "Marketplace User",
      role: m.role === "SELLER" ? "SELLER" : "CUSTOMER",
      phone: m.phone || "",
      paymentMethod: m.paymentMethod || "CARD",
      street: m.street || "",
      city: m.city || "",
      province: m.province || "",
      country: m.country || "Zambia",
      postalCode: m.postalCode || "",
      storeName: m.storeName || m.fullName || m.full_name || m.name || "",
    };
  };

  const api = async (path, token, body) => {
    const response = await fetch(`/api${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
    return payload;
  };

  const syncProfile = async (session, fallbackMeta = null) => {
    const token = session?.access_token;
    if (!token || !session.user) throw new Error("Authentication session was not created.");
    try {
      const result = await api("/auth/me", token);
      return result.user;
    } catch {
      const meta = fallbackMeta || getMeta(session.user);
      const result = await api("/auth/sync", token, meta);
      return result.user;
    }
  };

  const redirectForRole = (user) => {
    const role = String(user?.role || "CUSTOMER").toUpperCase();
    const returnUrl = new URLSearchParams(window.location.search).get("returnUrl");
    if (returnUrl && /^[a-zA-Z0-9_-]+\.html$/.test(returnUrl)) {
      window.location.replace(new URL(returnUrl, window.location.href).href);
      return;
    }
    window.location.replace(role === "SELLER" ? new URL("seller.html", window.location.href).href : SHOP_URL);
  };

  const handleOAuthCallback = async () => {
    const params = new URLSearchParams(window.location.search);
    const hasCode = params.has("code");
    const hasOAuthError = params.has("error") || params.has("error_description");
    if (hasOAuthError) {
      setStatus(params.get("error_description") || "Google sign-in was cancelled or failed.", "error");
      return;
    }

    try {
      if (hasCode) {
        const { error } = await supabase.auth.exchangeCodeForSession(params.get("code"));
        if (error) throw error;
        window.history.replaceState({}, document.title, LOGIN_URL);
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data.session) return false;

      setStatus("Finishing sign-in...", "info");
      const user = await syncProfile(data.session);
      localStorage.setItem("zmarket-auth", JSON.stringify({ user, tokens: { accessToken: data.session.access_token } }));
      setStatus("Sign-in successful. Redirecting...", "success");
      setTimeout(() => redirectForRole(user), 250);
      return true;
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Unable to complete sign-in.", "error");
      return false;
    }
  };

  const replaceForm = (id) => {
    const form = document.getElementById(id);
    if (!form) return null;
    const clone = form.cloneNode(true);
    form.replaceWith(clone);
    return clone;
  };

  const bindLogin = async () => {
    const form = replaceForm("login-form");
    if (!form) return;
    const callbackHandled = await handleOAuthCallback();
    if (callbackHandled) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = document.getElementById("email")?.value.trim();
      const password = document.getElementById("password")?.value || "";
      if (!email || !password) return setStatus("Enter your email and password.", "error");

      const submit = form.querySelector("button[type='submit']");
      if (submit) submit.disabled = true;
      try {
        setStatus("Signing you in...", "info");
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session) throw new Error("No login session was returned. Please verify your email first.");
        const user = await syncProfile(data.session);
        localStorage.setItem("zmarket-auth", JSON.stringify({ user, tokens: { accessToken: data.session.access_token } }));
        setStatus("Login successful. Redirecting...", "success");
        setTimeout(() => redirectForRole(user), 250);
      } catch (error) {
        setStatus(error.message || "Unable to login.", "error");
      } finally {
        if (submit) submit.disabled = false;
      }
    });

    const google = document.getElementById("google-oauth-button");
    google?.addEventListener("click", async () => {
      try {
        setStatus("Connecting to Google...", "info");
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: LOGIN_URL },
        });
        if (error) throw error;
      } catch (error) {
        setStatus(error.message || "Unable to continue with Google.", "error");
      }
    });
  };

  const bindRegister = async () => {
    const form = replaceForm("register-form");
    if (!form) return;
    const callbackHandled = await handleOAuthCallback();
    if (callbackHandled) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fullName = document.getElementById("full-name")?.value.trim() || "";
      const email = document.getElementById("email")?.value.trim() || "";
      const password = document.getElementById("password")?.value || "";
      const role = document.getElementById("role")?.value || "CUSTOMER";
      const meta = {
        fullName,
        role,
        phone: document.getElementById("phone")?.value.trim() || "",
        paymentMethod: document.getElementById("payment-method")?.value || "CARD",
        street: document.getElementById("street")?.value.trim() || "",
        city: document.getElementById("city")?.value.trim() || "",
        province: document.getElementById("province")?.value.trim() || "",
        country: document.getElementById("country")?.value.trim() || "Zambia",
        postalCode: document.getElementById("postal-code")?.value.trim() || "",
        storeName: role === "SELLER" ? fullName : "",
      };

      if (!fullName || !email || password.length < 6) {
        return setStatus("Enter your name, a valid email, and a password of at least 6 characters.", "error");
      }

      const submit = form.querySelector("button[type='submit']");
      if (submit) submit.disabled = true;
      try {
        setStatus("Creating your account...", "info");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: LOGIN_URL,
            data: meta,
          },
        });
        if (error) throw error;

        if (!data.session) {
          sessionStorage.setItem("zmarket-pending-signup", JSON.stringify(meta));
          setStatus("Account created. Check your email and click the verification link. After verification, you will be returned to the login page.", "success");
          if (!document.getElementById("resend-confirmation")) {
            const button = document.createElement("button");
            button.type = "button";
            button.id = "resend-confirmation";
            button.className = "button-secondary";
            button.textContent = "Resend verification email";
            button.style.marginTop = "8px";
            form.appendChild(button);
            button.addEventListener("click", async () => {
              try {
                button.disabled = true;
                const result = await supabase.auth.resend({ type: "signup", email });
                if (result.error) throw result.error;
                setStatus("Verification email sent again. Check your inbox and spam folder.", "success");
              } catch (error) {
                setStatus(error.message || "Unable to resend verification email.", "error");
              } finally {
                button.disabled = false;
              }
            });
          }
          return;
        }

        const user = await syncProfile(data.session, meta);
        localStorage.setItem("zmarket-auth", JSON.stringify({ user, tokens: { accessToken: data.session.access_token } }));
        setStatus("Account created. Redirecting...", "success");
        setTimeout(() => redirectForRole(user), 250);
      } catch (error) {
        setStatus(error.message || "Unable to create account.", "error");
      } finally {
        if (submit) submit.disabled = false;
      }
    });

    const google = document.getElementById("google-oauth-button");
    google?.addEventListener("click", async () => {
      try {
        setStatus("Connecting to Google...", "info");
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: LOGIN_URL },
        });
        if (error) throw error;
      } catch (error) {
        setStatus(error.message || "Unable to continue with Google.", "error");
      }
    });
  };

  document.addEventListener("DOMContentLoaded", async () => {
    const page = window.location.pathname.split("/").pop() || "";
    if (page === "login.html") await bindLogin();
    if (page === "register.html") await bindRegister();
  });
})();
