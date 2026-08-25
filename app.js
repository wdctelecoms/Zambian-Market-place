// Safe to expose in client-side code: this key only allows what Supabase's
// Auth API is designed for (sign up/in as the person using the page), not
// admin access to your project.
const SUPABASE_URL = "https://iqurvvxmfjfvlkvfsanq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_0F_NAcjt5hB7cqq8t6y2qA_tFWGv8Oi";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const AUTH_STORAGE_KEY = "zmarket-auth";
const MAIN_APP_SHOP_URL = "https://zambian-market-place.wdcentreprenuer.workers.dev/shop.html";

const authState = loadAuthState();

function loadAuthState() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistAuthState(user, tokens) {
  authState.user = user;
  authState.tokens = tokens;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
}

function clearAuthState() {
  authState.user = null;
  authState.tokens = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function isAuthenticated() {
  return Boolean(authState.user && authState.tokens?.accessToken);
}

function getUserRole() {
  return authState.user?.role?.toLowerCase() ?? "";
}

function getAccessToken() {
  return authState.tokens?.accessToken || "";
}

async function hydrateAuthSessionFromSupabase() {
  if (authState.user && authState.tokens?.accessToken) {
    return authState.user;
  }

  const {
    data: { session },
    error,
  } = await supabaseClient.auth.getSession();

  if (error || !session?.access_token) {
    return null;
  }

  authState.tokens = { accessToken: session.access_token };

  try {
    const { user } = await requestJson("/auth/me", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    persistAuthState(user, { accessToken: session.access_token });
    return user;
  } catch (meError) {
    const email = session.user?.email || "";
    const fullName = session.user?.user_metadata?.full_name || email.split("@")[0] || "Google user";
    const { user } = await requestJson("/auth/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        fullName,
        role: "CUSTOMER",
        phone: "",
        paymentMethod: "CARD",
        street: "",
        city: "",
        province: "",
        country: "Zambia",
        postalCode: "",
      }),
    });

    persistAuthState(user, { accessToken: session.access_token });
    return user;
  }
}

function getReturnUrl() {
  const raw = new URLSearchParams(window.location.search).get("returnUrl");
  if (!raw) return "";

  try {
    const parsed = new URL(raw, window.location.origin);
    const allowedPages = new Set(["shop.html", "cart.html", "seller.html", "chat.html", "account.html"]);
    if (allowedPages.has(parsed.pathname.split("/").pop() || "")) {
      return parsed.pathname.replace(/^\//, "");
    }
  } catch {
    // Ignore malformed return URLs and fall back to the role-based redirect.
  }

  return "";
}

function redirectToLoginIfNeeded() {
  const protectedPages = new Set(["shop.html", "cart.html", "seller.html", "chat.html", "account.html"]);
  const currentPage = window.location.pathname.split("/").pop() || "index.html";

  if (!protectedPages.has(currentPage) || isAuthenticated()) {
    return false;
  }

  const returnUrl = encodeURIComponent(currentPage);
  window.location.replace(`login.html?returnUrl=${returnUrl}`);
  return true;
}

// Supabase refreshes the access token in the background on its own timer;
// mirror that into our storage so getAccessToken() always has a live token
// without every page needing to know about the refresh.
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    if (authState.user) clearAuthState();
    return;
  }
  if (authState.user) {
    authState.tokens = { accessToken: session.access_token };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
  }
});

function formatCurrency(value) {
  return new Intl.NumberFormat("en-ZM", {
    style: "currency",
    currency: "ZMW",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function setStatus(elementId, message, type = "info") {
  const target = document.getElementById(elementId);
  if (!target) return;
  target.textContent = message;
  target.className = `status-message ${type === "error" ? "status-error" : type === "success" ? "status-success" : ""}`.trim();
}

function redirectAfterAuth(user) {
  const role = user?.role;
  const returnUrl = getReturnUrl();
  if (returnUrl) {
    window.location.href = returnUrl;
    return;
  }

  if (role === "SELLER") {
    window.location.href = "seller.html";
    return;
  }

  window.location.href = MAIN_APP_SHOP_URL;
}

async function requestJson(path, options = {}) {
  const doFetch = () => {
    const headers = new Headers(options.headers || {});
    if (!(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    if (getAccessToken()) {
      headers.set("Authorization", `Bearer ${getAccessToken()}`);
    }
    return fetch(`/api${path}`, { ...options, headers });
  };

  let response = await doFetch();

  // The cached access token can go stale if the tab sat idle past its ~1hr
  // expiry. Supabase keeps a refresh token in its own storage regardless,
  // so try once to get a fresh access token before giving up.
  if (response.status === 401 && authState.user) {
    const { data } = await supabaseClient.auth.getSession();
    if (data.session) {
      authState.tokens = { accessToken: data.session.access_token };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
      response = await doFetch();
    }
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === "object" && payload && "message" in payload ? payload.message : "Request failed";
    throw new Error(message);
  }

  return payload;
}

async function bindHomePage() {
  const productsContainer = document.getElementById("home-products");
  const categoriesContainer = document.getElementById("home-categories");

  if (!productsContainer || !categoriesContainer) return;

  try {
    setStatus("home-status", "Loading the live marketplace feed...", "info");
    const [products, categories] = await Promise.all([
      requestJson("/public/products"),
      requestJson("/public/categories"),
    ]);

    if (!products.length) {
      productsContainer.innerHTML = '<div class="empty-state">No approved products are available right now.</div>';
    } else {
      productsContainer.innerHTML = products
        .slice(0, 6)
        .map(
          (product) => `
            <article class="card">
              <img class="product-image" src="${product.imageUrl || "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=800&q=80"}" alt="${product.name}" />
              <h3>${product.name}</h3>
              <p class="text-muted">${product.description}</p>
              <p class="product-card-price">${formatCurrency(product.price)}</p>
              <p class="text-muted">${product.seller?.storeName || "Verified seller"}</p>
            </article>
          `,
        )
        .join("");
    }

    if (!categories.length) {
      categoriesContainer.innerHTML = '<div class="empty-state">No categories are available yet.</div>';
    } else {
      categoriesContainer.innerHTML = categories
        .slice(0, 6)
        .map(
          (category) => `
            <article class="card">
              <h3>${category.name}</h3>
              <p class="text-muted">${category.description || "Browse this category in the marketplace."}</p>
              <p class="text-muted">${category.productCount} live products</p>
            </article>
          `,
        )
        .join("");
    }

    setStatus("home-status", "Live marketplace data loaded.", "success");
  } catch (error) {
    productsContainer.innerHTML = '<div class="empty-state">The marketplace feed could not be loaded.</div>';
    categoriesContainer.innerHTML = '<div class="empty-state">Category data is currently unavailable.</div>';
    setStatus("home-status", error.message || "Unable to load marketplace home feed", "error");
  }
}

function bindLogoutLinks() {
  document.querySelectorAll("[data-action='logout']").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      supabaseClient.auth.signOut();
      clearAuthState();
      window.location.href = "login.html";
    });
  });
}

function bindLoginForm() {
  const form = document.getElementById("login-form");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  if (isAuthenticated()) {
    redirectAfterAuth(authState.user);
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      setStatus("form-status", "Signing you in...", "info");
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { user } = await requestJson("/auth/me", {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });

      persistAuthState(user, { accessToken: data.session.access_token });
      setStatus("form-status", "Login successful. Redirecting...", "success");
      setTimeout(() => redirectAfterAuth(user), 350);
    } catch (error) {
      setStatus("form-status", error.message || "Unable to login", "error");
    }
  });
}

function bindGoogleOAuthButton() {
  const button = document.getElementById("google-oauth-button");
  if (!button || button.dataset.bound === "true") return;
  button.dataset.bound = "true";

  button.addEventListener("click", async () => {
    try {
      setStatus("form-status", "Redirecting to Google...", "info");
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: new URL("login.html", window.location.href).href,
        },
      });
      if (error) throw error;
    } catch (error) {
      setStatus("form-status", error.message || "Unable to continue with Google", "error");
    }
  });
}

function bindRegisterForm() {
  const form = document.getElementById("register-form");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  if (isAuthenticated()) {
    redirectAfterAuth(authState.user);
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fullName = document.getElementById("full-name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;
    const phone = document.getElementById("phone").value.trim();
    const paymentMethod = document.getElementById("payment-method")?.value || "CARD";
    const street = document.getElementById("street")?.value.trim() || "";
    const city = document.getElementById("city")?.value.trim() || "";
    const province = document.getElementById("province")?.value.trim() || "";
    const country = document.getElementById("country")?.value.trim() || "Zambia";
    const postalCode = document.getElementById("postal-code")?.value.trim() || "";

    try {
      setStatus("form-status", "Creating your account...", "info");
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: MAIN_APP_SHOP_URL,
          data: {
            fullName,
            role,
            phone,
            paymentMethod,
            street,
            city,
            province,
            country,
            postalCode,
            storeName: role === "SELLER" ? fullName : undefined,
          },
        },
      });
      if (error) throw error;

      if (!data.session) {
        setStatus(
          "form-status",
          "Account created. Check your email to confirm before logging in.",
          "success",
        );
        return;
      }

      const { user } = await requestJson("/auth/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({
          fullName,
          role,
          phone,
          paymentMethod,
          street,
          city,
          province,
          country,
          postalCode,
        }),
      });

      persistAuthState(user, { accessToken: data.session.access_token });
      setStatus("form-status", "Account created. Redirecting...", "success");
      setTimeout(() => redirectAfterAuth(user), 350);
    } catch (error) {
      setStatus("form-status", error.message || "Unable to register", "error");
    }
  });
}

function bindShopPage() {
  const searchForm = document.getElementById("shop-search-form");
  const productsGrid = document.getElementById("products-grid");
  const categoryFilter = document.getElementById("category-filter");
  const minPrice = document.getElementById("min-price");
  const maxPrice = document.getElementById("max-price");
  const details = document.getElementById("product-details");
  if (!searchForm || !productsGrid || searchForm.dataset.bound === "true") return;
  searchForm.dataset.bound = "true";
  productsGrid.dataset.bound = "true";

  const renderCategories = async () => {
    if (!categoryFilter) return;
    const categories = await requestJson("/public/categories");
    categoryFilter.innerHTML = '<option value="">All categories</option>' + categories
      .map((category) => `<option value="${category.slug}">${category.name}</option>`)
      .join("");
  };

  const renderProductDetails = async (productId) => {
    if (!details) return;
    try {
      const payload = await requestJson(`/public/products/${productId}`);
      const { product, relatedProducts } = payload;
      details.style.display = "block";
      details.innerHTML = `
        <h2>${product.name}</h2>
        <p class="text-muted">${product.description}</p>
        <p class="product-card-price">${formatCurrency(product.price)}</p>
        <p class="text-muted">Seller: ${product.seller?.storeName || "Verified seller"}</p>
        <p class="text-muted">${product.reviewCount || 0} review(s) • ${product.reviewAverage ? product.reviewAverage.toFixed(1) : "0.0"} average rating</p>
        <div class="product-actions">
          <button type="button" class="button-secondary" data-action="add-to-cart" data-product-id="${product.id}">Add to cart</button>
          <button type="button" data-action="preorder" data-product-id="${product.id}">Pre-order</button>
        </div>
        <div class="grid grid-3" style="margin-top: 1rem;">
          ${relatedProducts.map((related) => `
            <article class="card">
              <h3>${related.name}</h3>
              <p class="text-muted">${related.description}</p>
              <p class="product-card-price">${formatCurrency(related.price)}</p>
            </article>
          `).join("")}
        </div>
      `;
    } catch (error) {
      details.style.display = "block";
      details.innerHTML = '<div class="empty-state">Unable to load product details.</div>';
      setStatus("shop-status", error.message || "Unable to load product details", "error");
    }
  };

  const renderProducts = async (query = "") => {
    try {
      setStatus("shop-status", "Loading products...", "info");
      productsGrid.innerHTML = '<div class="empty-state">Loading products from the live marketplace...</div>';
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      const selectedCategory = categoryFilter?.value || "";
      const min = minPrice?.value?.trim() || "";
      const max = maxPrice?.value?.trim() || "";
      if (selectedCategory) params.set("category", selectedCategory);
      if (min) params.set("minPrice", min);
      if (max) params.set("maxPrice", max);
      const products = await requestJson(`/public/products?${params.toString()}`);
      if (!products.length) {
        productsGrid.innerHTML = '<div class="empty-state">No products found yet.</div>';
        setStatus("shop-status", "No products match your search right now.", "info");
        return;
      }

      productsGrid.innerHTML = products
        .map(
          (product) => `
            <article class="product-card">
              <img class="product-image" src="${product.imageUrl || "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=800&q=80"}" alt="${product.name}" />
              <div class="product-card-content">
                <h3 class="product-card-title">${product.name}</h3>
                <p class="text-muted">${product.description}</p>
                <p class="product-card-price">${formatCurrency(product.price)}</p>
                <p class="text-muted">Sold by ${product.seller?.storeName || "a seller"}</p>
                <div class="product-actions">
                  <button type="button" class="button-secondary" data-action="add-to-cart" data-product-id="${product.id}">Add to cart</button>
                  <button type="button" data-action="preorder" data-product-id="${product.id}">Pre-order</button>
                  <button type="button" data-action="details" data-product-id="${product.id}">Details</button>
                </div>
              </div>
            </article>
          `,
        )
        .join("");

      setStatus("shop-status", `Showing ${products.length} products from the marketplace.`, "success");
    } catch (error) {
      productsGrid.innerHTML = '<div class="empty-state">Unable to load products right now.</div>';
      setStatus("shop-status", error.message || "Unable to load products", "error");
    }
  };

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = document.getElementById("search").value.trim();
    renderProducts(query);
  });

  productsGrid.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;

    const productId = target.dataset.productId;
    if (!productId) return;

    try {
      if (target.dataset.action === "details") {
        await renderProductDetails(productId);
        return;
      }

      if (!isAuthenticated()) {
        window.location.href = `login.html?returnUrl=${encodeURIComponent("shop.html")}`;
        return;
      }

      if (target.dataset.action === "add-to-cart") {
        await requestJson("/customer/cart", {
          method: "POST",
          body: JSON.stringify({ productId, quantity: 1 }),
        });
        setStatus("shop-status", "Added to cart.", "success");
      }

      if (target.dataset.action === "preorder") {
        const pickupDate = prompt("Pickup date (YYYY-MM-DD)");
        const pickupTime = prompt("Pickup time (HH:MM)");
        if (!pickupDate || !pickupTime) {
          setStatus("shop-status", "Pre-order cancelled.", "info");
          return;
        }
        await requestJson("/preorders/create", {
          method: "POST",
          body: JSON.stringify({ productId, quantity: 1, pickupDate, pickupTime, notes: "Placed from the storefront" }),
        });
        setStatus("shop-status", "Pre-order request created.", "success");
      }
    } catch (error) {
      setStatus("shop-status", error.message || "Action failed", "error");
    }
  });

  renderCategories();
  renderProducts();
}

async function bindSellerPage() {
  const dashboardStats = document.getElementById("dashboard-stats");
  const sellerProducts = document.getElementById("seller-products");
  const form = document.getElementById("seller-product-form");
  const categorySelect = document.getElementById("product-category");
  const cancelEditButton = document.getElementById("cancel-edit");
  const submitButton = document.getElementById("seller-product-submit");
  if (!dashboardStats || !sellerProducts) return;

  const loadCategoryOptions = async () => {
    if (!categorySelect) return;
    try {
      const categories = await requestJson("/public/categories");
      categorySelect.innerHTML = categories
        .map((category) => `<option value="${category.slug}">${category.name}</option>`)
        .join("");
    } catch {
      categorySelect.innerHTML = '<option value="">General</option>';
    }
  };

  if (form && form.dataset.bound !== "true") {
    form.dataset.bound = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const productId = document.getElementById("product-id").value.trim();
      const payload = {
        name: document.getElementById("product-name").value.trim(),
        description: document.getElementById("product-description").value.trim(),
        price: Number(document.getElementById("product-price").value),
        stock: Number(document.getElementById("product-stock").value),
        imageUrl: document.getElementById("product-image").value.trim(),
        categoryName: categorySelect?.value || "General",
      };

      try {
        setStatus("dashboard-status", productId ? "Updating product..." : "Creating product...", "info");
        await requestJson(productId ? `/seller/products/${productId}` : "/seller/products", {
          method: productId ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        });
        form.reset();
        if (cancelEditButton) cancelEditButton.style.display = "none";
        if (submitButton) submitButton.textContent = "Create product";
        await bindSellerPage();
      } catch (error) {
        setStatus("dashboard-status", error.message || "Unable to save product", "error");
      }
    });
  }

  if (cancelEditButton && cancelEditButton.dataset.bound !== "true") {
    cancelEditButton.dataset.bound = "true";
    cancelEditButton.addEventListener("click", () => {
      form.reset();
      document.getElementById("product-id").value = "";
      cancelEditButton.style.display = "none";
      if (submitButton) submitButton.textContent = "Create product";
    });
  }

  if (!isAuthenticated()) {
    setStatus("dashboard-status", "Please login as a seller to manage your store.", "error");
    dashboardStats.innerHTML = '<div class="empty-state">Sign in to view dashboard metrics.</div>';
    sellerProducts.innerHTML = '<div class="empty-state">No products to display yet.</div>';
    return;
  }

  if (getUserRole() !== "seller") {
    setStatus("dashboard-status", "You need a seller account to open this dashboard.", "error");
    dashboardStats.innerHTML = '<div class="empty-state">Switch to a seller account to view dashboard metrics.</div>';
    sellerProducts.innerHTML = '<div class="empty-state">No products to display yet.</div>';
    return;
  }

  try {
    await loadCategoryOptions();
    setStatus("dashboard-status", "Loading seller dashboard...", "info");
    const [dashboard, products] = await Promise.all([requestJson("/seller/dashboard"), requestJson("/seller/products")]);

    dashboardStats.innerHTML = `
      <article class="card">
        <h2>Today</h2>
        <p class="product-card-price">${formatCurrency(dashboard.todaySales)}</p>
        <p class="text-muted">Sales recorded today</p>
      </article>
      <article class="card">
        <h2>Overview</h2>
        <p class="product-card-price">${formatCurrency(dashboard.totalSales)}</p>
        <p class="text-muted">${dashboard.totalProducts} active products • ${dashboard.totalOrders} orders</p>
      </article>
    `;

    sellerProducts.innerHTML = products.length
      ? products
          .map(
            (product) => `
              <article class="card">
                <h3>${product.name}</h3>
                <p class="text-muted">${product.description}</p>
                <p class="product-card-price">${formatCurrency(product.price)}</p>
                <p class="text-muted">Stock: ${product.stock} • ${product.isAvailable ? "Available" : "Unavailable"}</p>
                <div class="product-actions">
                  <button type="button" data-action="edit-product" data-product-id="${product.id}">Edit</button>
                  <button type="button" class="button-secondary" data-action="delete-product" data-product-id="${product.id}">Delete</button>
                </div>
              </article>
            `,
          )
          .join("")
      : '<div class="empty-state">No products listed yet.</div>';

    sellerProducts.addEventListener("click", async (event) => {
      const target = event.target.closest("button");
      if (!target) return;
      const productId = target.dataset.productId;
      if (!productId) return;

      try {
        if (target.dataset.action === "delete-product") {
          await requestJson(`/seller/products/${productId}`, { method: "DELETE" });
          await bindSellerPage();
          setStatus("dashboard-status", "Product deleted.", "success");
          return;
        }

        if (target.dataset.action === "edit-product") {
          const product = await requestJson(`/seller/products/${productId}`);
          document.getElementById("product-id").value = product.id;
          document.getElementById("product-name").value = product.name;
          document.getElementById("product-description").value = product.description || "";
          document.getElementById("product-price").value = product.price;
          document.getElementById("product-stock").value = product.stock;
          document.getElementById("product-image").value = product.imageUrl || "";
          categorySelect.value = product.category?.slug || categorySelect.value;
          if (cancelEditButton) cancelEditButton.style.display = "inline-block";
          if (submitButton) submitButton.textContent = "Update product";
          setStatus("dashboard-status", "Product loaded for editing.", "success");
        }
      } catch (error) {
        setStatus("dashboard-status", error.message || "Unable to update seller product", "error");
      }
    });

    setStatus("dashboard-status", "Dashboard ready.", "success");
  } catch (error) {
    setStatus("dashboard-status", error.message || "Unable to load seller dashboard", "error");
  }
}

function getUserRole() {
  return authState.user?.role?.toLowerCase() ?? "";
}

function getAccessToken() {
  return authState.tokens?.accessToken || "";
}

async function hydrateAuthSessionFromSupabase() {
  if (authState.user && authState.tokens?.accessToken) {
    return authState.user;
  }

  const {
    data: { session },
    error,
  } = await supabaseClient.auth.getSession();

  if (error || !session?.access_token) {
    return null;
  }

  authState.tokens = { accessToken: session.access_token };

  try {
    const { user } = await requestJson("/auth/me", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    persistAuthState(user, { accessToken: session.access_token });
    return user;
  } catch (meError) {
    const email = session.user?.email || "";
    const fullName = session.user?.user_metadata?.full_name || email.split("@")[0] || "Google user";
    const { user } = await requestJson("/auth/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        fullName,
        role: "CUSTOMER",
        phone: "",
        paymentMethod: "CARD",
        street: "",
        city: "",
        province: "",
        country: "Zambia",
        postalCode: "",
      }),
    });

    persistAuthState(user, { accessToken: session.access_token });
    return user;
  }
}

// Supabase refreshes the access token in the background on its own timer;
// mirror that into our storage so getAccessToken() always has a live token
// without every page needing to know about the refresh.
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    if (authState.user) clearAuthState();
    return;
  }
  if (authState.user) {
    authState.tokens = { accessToken: session.access_token };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
  }
});

function formatCurrency(value) {
  return new Intl.NumberFormat("en-ZM", {
    style: "currency",
    currency: "ZMW",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function setStatus(elementId, message, type = "info") {
  const target = document.getElementById(elementId);
  if (!target) return;
  target.textContent = message;
  target.className = `status-message ${type === "error" ? "status-error" : type === "success" ? "status-success" : ""}`.trim();
}


async function requestJson(path, options = {}) {
  const doFetch = () => {
    const headers = new Headers(options.headers || {});
    if (!(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    if (getAccessToken()) {
      headers.set("Authorization", `Bearer ${getAccessToken()}`);
    }
    return fetch(`/api${path}`, { ...options, headers });
  };

  let response = await doFetch();

  // The cached access token can go stale if the tab sat idle past its ~1hr
  // expiry. Supabase keeps a refresh token in its own storage regardless,
  // so try once to get a fresh access token before giving up.
  if (response.status === 401 && authState.user) {
    const { data } = await supabaseClient.auth.getSession();
    if (data.session) {
      authState.tokens = { accessToken: data.session.access_token };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
      response = await doFetch();
    }
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === "object" && payload && "message" in payload ? payload.message : "Request failed";
    throw new Error(message);
  }

  return payload;
}

function bindLogoutLinks() {
  document.querySelectorAll("[data-action='logout']").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      supabaseClient.auth.signOut();
      clearAuthState();
      window.location.href = "login.html";
    });
  });
}


function bindGoogleOAuthButton() {
  const button = document.getElementById("google-oauth-button");
  if (!button || button.dataset.bound === "true") return;
  button.dataset.bound = "true";

  button.addEventListener("click", async () => {
    try {
      setStatus("form-status", "Redirecting to Google...", "info");
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: new URL("login.html", window.location.href).href,
        },
      });
      if (error) throw error;
    } catch (error) {
      setStatus("form-status", error.message || "Unable to continue with Google", "error");
    }
  });
}


function bindShopPage() {
  const searchForm = document.getElementById("shop-search-form");
  const productsGrid = document.getElementById("products-grid");
  if (!searchForm || !productsGrid) return;

  const renderProducts = async (query = "") => {
    if (!isAuthenticated()) {
      setStatus("shop-status", "Please login as a customer to browse products.", "error");
      productsGrid.innerHTML = '<div class="empty-state">Login to continue shopping.</div>';
      return;
    }

    if (getUserRole() !== "customer") {
      setStatus("shop-status", "Seller accounts can manage products from the dashboard.", "error");
      productsGrid.innerHTML = '<div class="empty-state">Switch to a customer account to place orders.</div>';
      return;
    }

    try {
      setStatus("shop-status", "Loading products...", "info");
      const products = await requestJson(`/customer/search/products?q=${encodeURIComponent(query)}`);
      if (!products.length) {
        productsGrid.innerHTML = '<div class="empty-state">No products found yet.</div>';
        setStatus("shop-status", "No products match your search right now.", "info");
        return;
      }

      productsGrid.innerHTML = products
        .map(
          (product) => `
            <article class="product-card">
              <img class="product-image" src="${product.imageUrl || "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=800&q=80"}" alt="${product.name}" />
              <div class="product-card-content">
                <h3 class="product-card-title">${product.name}</h3>
                <p class="text-muted">${product.description}</p>
                <p class="product-card-price">${formatCurrency(product.price)}</p>
                <p class="text-muted">Sold by ${product.seller?.storeName || "a seller"}</p>
                <div class="product-actions">
                  <button type="button" class="button-secondary" data-action="add-to-cart" data-product-id="${product.id}">Add to cart</button>
                  <button type="button" data-action="preorder" data-product-id="${product.id}">Pre-order</button>
                </div>
              </div>
            </article>
          `,
        )
        .join("");

      setStatus("shop-status", `Showing ${products.length} products from the marketplace.`, "success");
    } catch (error) {
      setStatus("shop-status", error.message || "Unable to load products", "error");
    }
  };

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = document.getElementById("search").value.trim();
    renderProducts(query);
  });

  productsGrid.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;

    const productId = target.dataset.productId;
    if (!productId) return;

    try {
      if (target.dataset.action === "add-to-cart") {
        await requestJson("/customer/cart", {
          method: "POST",
          body: JSON.stringify({ productId, quantity: 1 }),
        });
        setStatus("shop-status", "Added to cart.", "success");
      }

      if (target.dataset.action === "preorder") {
        const pickupDate = prompt("Pickup date (YYYY-MM-DD)");
        const pickupTime = prompt("Pickup time (HH:MM)");
        if (!pickupDate || !pickupTime) {
          setStatus("shop-status", "Pre-order cancelled.", "info");
          return;
        }
        await requestJson("/preorders/create", {
          method: "POST",
          body: JSON.stringify({ productId, quantity: 1, pickupDate, pickupTime, notes: "Placed from the storefront" }),
        });
        setStatus("shop-status", "Pre-order request created.", "success");
      }
    } catch (error) {
      setStatus("shop-status", error.message || "Action failed", "error");
    }
  });

  renderProducts();
}

async function bindSellerPage() {
  const dashboardStats = document.getElementById("dashboard-stats");
  const sellerProducts = document.getElementById("seller-products");
  const form = document.getElementById("seller-product-form");
  if (!dashboardStats || !sellerProducts) return;

  if (!isAuthenticated()) {
    setStatus("dashboard-status", "Please login as a seller to manage your store.", "error");
    dashboardStats.innerHTML = '<div class="empty-state">Sign in to view dashboard metrics.</div>';
    sellerProducts.innerHTML = '<div class="empty-state">No products to display yet.</div>';
    return;
  }

  if (getUserRole() !== "seller") {
    setStatus("dashboard-status", "You need a seller account to open this dashboard.", "error");
    dashboardStats.innerHTML = '<div class="empty-state">Switch to a seller account to view dashboard metrics.</div>';
    sellerProducts.innerHTML = '<div class="empty-state">No products to display yet.</div>';
    return;
  }

  try {
    setStatus("dashboard-status", "Loading seller dashboard...", "info");
    const [dashboard, products] = await Promise.all([requestJson("/seller/dashboard"), requestJson("/seller/products")]);

    dashboardStats.innerHTML = `
      <article class="card">
        <h2>Today</h2>
        <p class="product-card-price">${formatCurrency(dashboard.todaySales)}</p>
        <p class="text-muted">Sales recorded today</p>
      </article>
      <article class="card">
        <h2>Overview</h2>
        <p class="product-card-price">${formatCurrency(dashboard.totalSales)}</p>
        <p class="text-muted">${dashboard.totalProducts} active products • ${dashboard.totalOrders} orders</p>
      </article>
    `;

    sellerProducts.innerHTML = products.length
      ? products
          .map(
            (product) => `
              <article class="card">
                <h3>${product.name}</h3>
                <p class="text-muted">${product.description}</p>
                <p class="product-card-price">${formatCurrency(product.price)}</p>
                <p class="text-muted">Stock: ${product.stock} • ${product.isAvailable ? "Available" : "Unavailable"}</p>
              </article>
            `,
          )
          .join("")
      : '<div class="empty-state">No products listed yet.</div>';

    setStatus("dashboard-status", "Dashboard ready.", "success");
  } catch (error) {
    setStatus("dashboard-status", error.message || "Unable to load seller dashboard", "error");
  }

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        name: document.getElementById("product-name").value.trim(),
        description: document.getElementById("product-description").value.trim(),
        price: Number(document.getElementById("product-price").value),
        stock: Number(document.getElementById("product-stock").value),
        imageUrl: document.getElementById("product-image").value.trim(),
        categoryName: document.getElementById("product-category").value.trim() || "General",
      };

      try {
        setStatus("dashboard-status", "Creating product...", "info");
        await requestJson("/seller/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        form.reset();
        bindSellerPage();
      } catch (error) {
        setStatus("dashboard-status", error.message || "Unable to create product", "error");
      }
    });
  }
}

async function bindCartPage() {
  const summaryElement = document.getElementById("cart-summary");
  const itemsElement = document.getElementById("cart-items");
  if (!summaryElement || !itemsElement) return;

  if (!isAuthenticated()) {
    setStatus("cart-status", "Please login as a customer to view your cart.", "error");
    summaryElement.innerHTML = '<div class="empty-state">Login to view your cart.</div>';
    itemsElement.innerHTML = '<div class="empty-state">No items yet.</div>';
    return;
  }

  if (getUserRole() !== "customer") {
    setStatus("cart-status", "Only customer accounts can use the cart.", "error");
    summaryElement.innerHTML = '<div class="empty-state">Switch to a customer account to view the cart.</div>';
    itemsElement.innerHTML = '<div class="empty-state">No items yet.</div>';
    return;
  }

  try {
    setStatus("cart-status", "Loading your cart...", "info");
    const cart = await requestJson("/customer/cart");
    const activeItems = cart.activeItems || [];
    const subtotal = Number(cart.subtotal || 0);
    const deliveryFee = Number(cart.deliveryFee || 0);
    const total = Number(cart.total || 0);

    summaryElement.innerHTML = `
      <div class="grid grid-3">
        <div class="card">
          <h3>Cart total</h3>
          <p class="product-card-price">${formatCurrency(subtotal)}</p>
        </div>
        <div class="card">
          <h3>Delivery fee</h3>
          <p class="text-muted">${formatCurrency(deliveryFee)}</p>
        </div>
        <div class="card">
          <h3>Grand total</h3>
          <p class="product-card-price">${formatCurrency(total)}</p>
        </div>
      </div>
    `;

    if (!activeItems.length) {
      itemsElement.innerHTML = '<div class="empty-state">Your cart is empty. Browse the shop to add items.</div>';
      setStatus("cart-status", "Your cart is empty.", "info");
      return;
    }

    itemsElement.innerHTML = activeItems
      .map(
        (item) => `
          <article class="card">
            <h3>${item.product?.name || "Item"}</h3>
            <p class="text-muted">Quantity: ${item.quantity}</p>
            <p class="product-card-price">${formatCurrency(item.product?.price * item.quantity || 0)}</p>
            <div class="product-actions">
              <button type="button" class="button-secondary" data-action="remove-item" data-product-id="${item.productId}">Remove</button>
              <button type="button" data-action="increase-quantity" data-product-id="${item.productId}">+1</button>
            </div>
          </article>
        `,
      )
      .join("");

    setStatus("cart-status", "Cart ready.", "success");
  } catch (error) {
    setStatus("cart-status", error.message || "Unable to load cart", "error");
  }

  itemsElement.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;

    const productId = target.dataset.productId;
    if (!productId) return;

    try {
      if (target.dataset.action === "remove-item") {
        await requestJson(`/customer/cart/${productId}`, { method: "DELETE" });
      }
      if (target.dataset.action === "increase-quantity") {
        await requestJson(`/customer/cart/${productId}`, { method: "PATCH", body: JSON.stringify({ quantity: 1 }) });
      }
      bindCartPage();
    } catch (error) {
      setStatus("cart-status", error.message || "Unable to update cart", "error");
    }
  });
}

async function bindChatPage() {
  const conversationsList = document.getElementById("conversation-list");
  const chatThread = document.getElementById("chat-thread");
  const form = document.getElementById("chat-form");
  if (!conversationsList || !chatThread || !form) return;

  let activePeerId = null;

  const loadConversations = async () => {
    try {
      setStatus("chat-status", "Loading conversations...", "info");
      const messages = await requestJson("/messages/conversations");
      const currentUserId = authState.user?.id;
      const grouped = new Map();

      messages.forEach((message) => {
        const peer = message.senderId === currentUserId ? message.receiver : message.sender;
        const key = peer?.id;
        if (!key) return;
        if (!grouped.has(key)) {
          grouped.set(key, {
            user: peer,
            lastMessage: message,
          });
          return;
        }
        const entry = grouped.get(key);
        if (new Date(message.createdAt) > new Date(entry.lastMessage.createdAt)) {
          entry.lastMessage = message;
        }
      });

      const entries = Array.from(grouped.values());
      if (!entries.length) {
        conversationsList.innerHTML = '<div class="empty-state">No conversations yet. Start from the shop or seller pages.</div>';
        setStatus("chat-status", "No conversations yet.", "info");
        chatThread.innerHTML = '<div class="empty-state">Choose a conversation to view messages.</div>';
        return;
      }

      conversationsList.innerHTML = entries
        .map(
          (entry) => `
            <button type="button" class="list-item" data-user-id="${entry.user.id}">
              <strong>${entry.user.fullName || entry.user.email}</strong>
              <span>${entry.lastMessage.content || "New message"}</span>
            </button>
          `,
        )
        .join("");

      if (!activePeerId && entries[0]) {
        activePeerId = entries[0].user.id;
      }
      if (activePeerId) {
        loadThread(activePeerId);
      }
    } catch (error) {
      setStatus("chat-status", error.message || "Unable to load chat", "error");
    }
  };

  const loadThread = async (peerId) => {
    try {
      const messages = await requestJson(`/messages/conversations/${peerId}`);
      chatThread.innerHTML = messages
        .map((message) => {
          const isSent = message.senderId === authState.user?.id;
          return `
            <div class="chat-message ${isSent ? "sent" : "received"}">
              <div class="chat-meta">
                <span>${isSent ? "You" : "Seller"}</span>
                <span>${new Date(message.createdAt).toLocaleString()}</span>
              </div>
              <p>${message.content || "Shared an item"}</p>
            </div>
          `;
        })
        .join("");
      setStatus("chat-status", "Conversation loaded.", "success");
    } catch (error) {
      setStatus("chat-status", error.message || "Unable to load messages", "error");
    }
  };

  conversationsList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-user-id]");
    if (!button) return;
    activePeerId = button.dataset.userId;
    loadThread(activePeerId);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("chat-message");
    if (!activePeerId) {
      setStatus("chat-status", "Select a conversation first.", "error");
      return;
    }
    try {
      await requestJson("/messages/send", {
        method: "POST",
        body: JSON.stringify({ receiverId: activePeerId, type: "TEXT", content: input.value.trim() }),
      });
      input.value = "";
      loadThread(activePeerId);
      loadConversations();
    } catch (error) {
      setStatus("chat-status", error.message || "Unable to send message", "error");
    }
  });

  loadConversations();
}

async function initializePage() {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  const user = await hydrateAuthSessionFromSupabase().catch(() => null);

  // Block direct access to authenticated marketplace pages.
  // Supabase session hydration runs first so a valid session is accepted.
  if (redirectToLoginIfNeeded()) return;

  if (user && (currentPage === "login.html" || currentPage === "register.html")) {
    redirectAfterAuth(user);
    return;
  }

  bindLogoutLinks();
  bindLoginForm();
  bindRegisterForm();
  bindGoogleOAuthButton();
  bindShopPage();
  bindSellerPage();
  bindCartPage();
  bindChatPage();
}

document.addEventListener("DOMContentLoaded", initializePage);
