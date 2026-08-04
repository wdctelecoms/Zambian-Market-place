// Safe to expose in client-side code: this key only allows what Supabase's
// Auth API is designed for (sign up/in as the person using the page), not
// admin access to your project.
const SUPABASE_URL = "https://iqurvvxmfjfvlkvfsanq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_0F_NAcjt5hB7cqq8t6y2qA_tFWGv8Oi";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const AUTH_STORAGE_KEY = "zmarket-auth";

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

function getReturnUrl() {
  const raw = new URLSearchParams(window.location.search).get("returnUrl");
  if (!raw) return "";

  try {
    const parsed = new URL(raw, window.location.origin);
    const allowedPages = new Set(["shop.html", "cart.html", "seller.html", "chat.html"]);
    if (allowedPages.has(parsed.pathname.split("/").pop() || "")) {
      return parsed.pathname.replace(/^\//, "");
    }
  } catch {
    // Ignore malformed return URLs and fall back to the role-based redirect.
  }

  return "";
}

function redirectToLoginIfNeeded() {
  const protectedPages = new Set(["shop.html", "cart.html", "seller.html", "chat.html"]);
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

  window.location.href = role === "SELLER" ? "seller.html" : "shop.html";
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

async function bindCartPage() {
  const summaryElement = document.getElementById("cart-summary");
  const itemsElement = document.getElementById("cart-items");
  const addressList = document.getElementById("saved-addresses");
  const addressForm = document.getElementById("address-form");
  const paymentSelect = document.getElementById("checkout-payment-method");
  const placeOrderButton = document.getElementById("place-order-button");
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
    const [cart, profile, addresses] = await Promise.all([
      requestJson("/customer/cart"),
      requestJson("/customer/profile"),
      requestJson("/customer/addresses"),
    ]);
    const activeItems = cart.activeItems || [];
    const subtotal = Number(cart.subtotal || 0);
    const deliveryFee = Number(cart.deliveryFee || 0);
    const total = Number(cart.total || 0);

    if (paymentSelect) {
      paymentSelect.value = profile.customer?.preferredPaymentMethod || paymentSelect.value || "CARD";
    }

    if (addressList) {
      addressList.innerHTML = addresses.length
        ? addresses
            .map(
              (address) => `
                <label class="card" style="display:block; cursor:pointer;">
                  <input type="radio" name="checkout-address" value="${address.id}" ${address.isDefault ? "checked" : ""} />
                  <p><strong>${address.street}</strong></p>
                  <p class="text-muted">${address.city}, ${address.province}, ${address.country} • ${address.postalCode}</p>
                  <p class="text-muted">${address.isDefault ? "Default delivery address" : "Saved address"}</p>
                </label>
              `,
            )
            .join("")
        : '<div class="empty-state">No saved addresses yet.</div>';
    }

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

  if (paymentSelect && paymentSelect.dataset.bound !== "true") {
    paymentSelect.dataset.bound = "true";
    paymentSelect.addEventListener("change", async () => {
      try {
        await requestJson("/customer/profile", {
          method: "PATCH",
          body: JSON.stringify({ preferredPaymentMethod: paymentSelect.value }),
        });
        setStatus("cart-status", "Preferred payment method saved.", "success");
      } catch (error) {
        setStatus("cart-status", error.message || "Unable to save payment method", "error");
      }
    });
  }

  if (addressList && addressList.dataset.bound !== "true") {
    addressList.dataset.bound = "true";
    addressList.addEventListener("change", () => {
      const selectedRadio = addressList.querySelector('input[name="checkout-address"]:checked');
      if (selectedRadio) {
        setStatus("cart-status", "Selected delivery address for checkout.", "info");
      }
    });
  }

  if (addressForm && addressForm.dataset.bound !== "true") {
    addressForm.dataset.bound = "true";
    addressForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        street: document.getElementById("delivery-street")?.value.trim(),
        city: document.getElementById("delivery-city")?.value.trim(),
        province: document.getElementById("delivery-province")?.value.trim(),
        country: document.getElementById("delivery-country")?.value.trim(),
        postalCode: document.getElementById("delivery-postal-code")?.value.trim(),
        isDefault: true,
      };

      try {
        await requestJson("/customer/addresses", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        addressForm.reset();
        bindCartPage();
        setStatus("cart-status", "Delivery address saved.", "success");
      } catch (error) {
        setStatus("cart-status", error.message || "Unable to save address", "error");
      }
    });
  }

  if (placeOrderButton && placeOrderButton.dataset.bound !== "true") {
    placeOrderButton.dataset.bound = "true";
    placeOrderButton.addEventListener("click", async () => {
      try {
        const selectedAddress = addressList?.querySelector('input[name="checkout-address"]:checked')?.value;
        if (!selectedAddress) {
          setStatus("cart-status", "Please save and select a delivery address before ordering.", "error");
          return;
        }

        const order = await requestJson("/customer/orders", {
          method: "POST",
          body: JSON.stringify({
            addressId: selectedAddress,
            paymentMethod: paymentSelect?.value || "CARD",
          }),
        });

        bindCartPage();
        setStatus("cart-status", `Order ${order.id} created successfully for ${formatCurrency(order.total)}.`, "success");
      } catch (error) {
        setStatus("cart-status", error.message || "Unable to place order", "error");
      }
    });
  }

  if (itemsElement.dataset.bound !== "true") {
    itemsElement.dataset.bound = "true";
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
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

async function bindChatPage() {
  const conversationsList = document.getElementById("conversation-list");
  const chatThread = document.getElementById("chat-thread");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-message");
  const imageInput = document.getElementById("chat-image");
  const imageButton = document.getElementById("chat-image-button");
  const voiceButton = document.getElementById("chat-voice-button");
  const orderButton = document.getElementById("chat-order-button");
  const productButton = document.getElementById("chat-product-button");
  const typingIndicator = document.getElementById("typing-indicator");
  if (!conversationsList || !chatThread || !form) return;

  let activePeerId = null;
  let chatMessages = [];
  let socket = null;
  let typingTimeout = null;
  let mediaRecorder = null;
  let recordingStream = null;
  let recordedChunks = [];
  let isRecording = false;
  let readMessageIds = new Set();

  if (!isAuthenticated()) {
    setStatus("chat-status", "Please sign in to use live chat.", "error");
    conversationsList.innerHTML = '<div class="empty-state">Log in to start chatting.</div>';
    chatThread.innerHTML = '<div class="empty-state">Authentication is required.</div>';
    return;
  }

  const renderThread = () => {
    if (!chatMessages.length) {
      chatThread.innerHTML = '<div class="empty-state">Start a conversation and share details in real time.</div>';
      return;
    }

    chatThread.innerHTML = chatMessages
      .map((message) => {
        const isSent = message.senderId === authState.user?.id;
        let body = "";

        if (message.type === "IMAGE" && message.mediaUrl) {
          body = `<img class="chat-media" src="${escapeHtml(message.mediaUrl)}" alt="Shared image" />`;
        } else if (message.type === "VOICE" && message.mediaUrl) {
          body = `<audio controls src="${escapeHtml(message.mediaUrl)}"></audio>`;
        } else if (message.type === "ORDER" && message.orderId) {
          body = `<div class="chat-attachment">Order attachment: <strong>${escapeHtml(message.orderId)}</strong></div>`;
        } else if (message.type === "PRODUCT" && message.productId) {
          body = `<div class="chat-attachment">Shared product: <strong>${escapeHtml(message.productId)}</strong></div>`;
        } else {
          body = `<p>${escapeHtml(message.content || "Shared an item")}</p>`;
        }

        const statusText = isSent ? (message.isRead ? "Seen" : "Sent") : "";
        return `
          <div class="chat-message ${isSent ? "sent" : "received"}">
            <div class="chat-meta">
              <span>${isSent ? "You" : "Seller"}</span>
              <span>${new Date(message.createdAt).toLocaleString()}</span>
            </div>
            ${body}
            ${statusText ? `<div class="chat-meta"><span>${statusText}</span></div>` : ""}
          </div>
        `;
      })
      .join("");

    chatThread.scrollTop = chatThread.scrollHeight;

    chatMessages.forEach((message) => {
      if (message.senderId !== authState.user?.id && !message.isRead && !readMessageIds.has(message.id)) {
        readMessageIds.add(message.id);
        markMessageAsRead(message.id);
      }
    });
  };

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
              <strong>${escapeHtml(entry.user.fullName || entry.user.email)}</strong>
              <span>${escapeHtml(entry.lastMessage.content || "New message")}</span>
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

  const addMessageToThread = (message) => {
    if (!message?.id) return;
    const exists = chatMessages.some((entry) => entry.id === message.id);
    if (exists) {
      chatMessages = chatMessages.map((entry) => (entry.id === message.id ? { ...entry, ...message } : entry));
    } else {
      chatMessages = [...chatMessages, message];
    }
    renderThread();
  };

  const markMessageAsRead = async (messageId) => {
    if (!messageId) return;
    try {
      if (socket?.connected) {
        socket.emit("message_read", { messageId });
      }
      await requestJson(`/messages/${messageId}/read`, { method: "PATCH" });
    } catch {
      // Ignore read receipt failures for now.
    }
  };

  const loadThread = async (peerId) => {
    if (!peerId) return;
    try {
      const messages = await requestJson(`/messages/conversations/${peerId}`);
      chatMessages = messages;
      renderThread();
      setStatus("chat-status", "Conversation loaded.", "success");
    } catch (error) {
      setStatus("chat-status", error.message || "Unable to load messages", "error");
    }
  };

  const connectSocket = () => {
    if (socket || !window.io) return;
    socket = window.io(window.location.origin, {
      auth: { token: getAccessToken() },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      setStatus("chat-status", "Connected to live chat.", "success");
      if (activePeerId) {
        loadThread(activePeerId);
      }
    });

    socket.on("connect_error", () => {
      setStatus("chat-status", "Realtime chat is temporarily unavailable.", "info");
    });

    socket.on("typing", ({ from, isTyping }) => {
      if (from !== activePeerId) return;
      if (typingTimeout) clearTimeout(typingTimeout);
      typingIndicator.textContent = isTyping ? "Typing..." : "";
      if (isTyping) {
        typingTimeout = setTimeout(() => {
          typingIndicator.textContent = "";
        }, 1200);
      }
    });

    socket.on("message_sent", (message) => {
      addMessageToThread(message);
      loadConversations();
    });

    socket.on("message_received", (message) => {
      if (!activePeerId || (message.senderId !== activePeerId && message.receiverId !== activePeerId)) {
        return;
      }

      addMessageToThread(message);
      if (message.receiverId === authState.user?.id) {
        markMessageAsRead(message.id);
      }
      loadConversations();
    });

    socket.on("message_read", (message) => {
      if (!message?.id) return;
      chatMessages = chatMessages.map((entry) => (entry.id === message.id ? { ...entry, ...message } : entry));
      renderThread();
    });
  };

  const sendMessage = async (payload) => {
    if (!activePeerId) {
      setStatus("chat-status", "Select a conversation first.", "error");
      return;
    }

    if (socket?.connected) {
      socket.emit("send_message", { to: activePeerId, ...payload });
    } else {
      const response = await requestJson("/messages/send", {
        method: "POST",
        body: JSON.stringify({ receiverId: activePeerId, ...payload }),
      });
      if (response?.id) {
        loadThread(activePeerId);
      }
    }
  };

  conversationsList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-user-id]");
    if (!button) return;
    activePeerId = button.dataset.userId;
    loadThread(activePeerId);
    if (socket?.connected) {
      socket.emit("typing", { to: activePeerId, isTyping: false });
    }
  });

  input.addEventListener("input", () => {
    if (!activePeerId || !socket?.connected) return;
    if (typingTimeout) clearTimeout(typingTimeout);
    socket.emit("typing", { to: activePeerId, isTyping: true });
    typingTimeout = setTimeout(() => {
      socket.emit("typing", { to: activePeerId, isTyping: false });
    }, 900);
  });

  imageButton?.addEventListener("click", () => imageInput?.click());
  imageInput?.addEventListener("change", async () => {
    const [file] = imageInput.files || [];
    if (!file) return;
    try {
      const mediaUrl = await readFileAsDataUrl(file);
      await sendMessage({ type: "IMAGE", mediaUrl, mediaMimeType: file.type || "image/*" });
      imageInput.value = "";
    } catch (error) {
      setStatus("chat-status", error.message || "Unable to attach image", "error");
    }
  });

  voiceButton?.addEventListener("click", async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("chat-status", "Voice notes are not supported in this browser.", "error");
      return;
    }

    if (isRecording) {
      mediaRecorder?.stop();
      isRecording = false;
      voiceButton.textContent = "Voice";
      return;
    }

    try {
      recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(recordingStream);
      recordedChunks = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) recordedChunks.push(event.data);
      };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || "audio/webm" });
        if (blob.size) {
          const mediaUrl = await readFileAsDataUrl(new File([blob], "voice-note.webm", { type: blob.type }));
          await sendMessage({ type: "VOICE", mediaUrl, mediaMimeType: blob.type || "audio/webm" });
        }
        recordingStream?.getTracks().forEach((track) => track.stop());
      };
      mediaRecorder.start();
      isRecording = true;
      voiceButton.textContent = "Stop";
      setStatus("chat-status", "Recording voice note...", "info");
    } catch (error) {
      setStatus("chat-status", error.message || "Microphone access denied", "error");
    }
  });

  orderButton?.addEventListener("click", async () => {
    const orderId = window.prompt("Enter an order reference to attach")?.trim();
    if (!orderId) return;
    await sendMessage({ type: "ORDER", orderId });
  });

  productButton?.addEventListener("click", async () => {
    const productId = window.prompt("Enter a product reference to share")?.trim();
    if (!productId) return;
    await sendMessage({ type: "PRODUCT", productId });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = input.value.trim();
    if (!activePeerId) {
      setStatus("chat-status", "Select a conversation first.", "error");
      return;
    }
    if (!content) {
      setStatus("chat-status", "Type a message or attach media first.", "info");
      return;
    }
    try {
      await sendMessage({ type: "TEXT", content });
      input.value = "";
      setStatus("chat-status", "Message sent.", "success");
    } catch (error) {
      setStatus("chat-status", error.message || "Unable to send message", "error");
    }
  });

  connectSocket();
  loadConversations();
}

function initializePage() {
  if (redirectToLoginIfNeeded()) {
    return;
  }

  bindHomePage();
  bindLogoutLinks();
  bindLoginForm();
  bindRegisterForm();
  bindShopPage();
  bindSellerPage();
  bindCartPage();
  bindChatPage();
}

document.addEventListener("DOMContentLoaded", initializePage);
