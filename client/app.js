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
  window.location.href = role === "SELLER" ? "seller.html" : "shop.html";
}

async function requestJson(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (getAccessToken()) {
    headers.set("Authorization", `Bearer ${getAccessToken()}`);
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
  });

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
      const data = await requestJson("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      persistAuthState(data.user, data.tokens);
      setStatus("form-status", "Login successful. Redirecting...", "success");
      setTimeout(() => redirectAfterAuth(data.user), 350);
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

    try {
      setStatus("form-status", "Creating your account...", "info");
      const data = await requestJson("/auth/register", {
        method: "POST",
        body: JSON.stringify({ fullName, email, password, role, phone }),
      });
      persistAuthState(data.user, data.tokens);
      setStatus("form-status", "Account created. Redirecting...", "success");
      setTimeout(() => redirectAfterAuth(data.user), 350);
    } catch (error) {
      setStatus("form-status", error.message || "Unable to register", "error");
    }
  });
}

function bindShopPage() {
  const searchForm = document.getElementById("shop-search-form");
  const productsGrid = document.getElementById("products-grid");
  if (!searchForm || !productsGrid || searchForm.dataset.bound === "true") return;
  searchForm.dataset.bound = "true";
  productsGrid.dataset.bound = "true";

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

  if (form && form.dataset.bound !== "true") {
    form.dataset.bound = "true";
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
  bindLogoutLinks();
  bindLoginForm();
  bindRegisterForm();
  bindShopPage();
  bindSellerPage();
  bindCartPage();
  bindChatPage();
}

document.addEventListener("DOMContentLoaded", initializePage);
