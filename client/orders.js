(() => {
  const esc = (value = "") => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  const money = (value) => new Intl.NumberFormat("en-ZM", { style: "currency", currency: "ZMW" }).format(Number(value || 0));

  const load = async () => {
    const list = document.getElementById("orders-list");
    const status = document.getElementById("orders-status");
    const raw = localStorage.getItem("zmarket-auth");
    let auth = {};
    try { auth = raw ? JSON.parse(raw) : {}; } catch { auth = {}; }
    if (!auth.user || !auth.tokens?.accessToken || auth.user.role?.toLowerCase() !== "customer") {
      status.textContent = "Please sign in as a customer to view orders.";
      list.innerHTML = '<div class="empty-state">Authentication is required.</div>';
      return;
    }
    try {
      status.textContent = "Loading live orders...";
      const response = await fetch("/api/customer/orders", { headers: { Authorization: `Bearer ${auth.tokens.accessToken}` } });
      const orders = await response.json();
      if (!response.ok) throw new Error(orders.message || "Unable to load orders");
      list.innerHTML = orders.length ? orders.map((order) => `
        <article class="card">
          <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
            <h3>Order ${esc(order.id)}</h3><strong>${esc(order.status)}</strong>
          </div>
          <p class="product-card-price">${money(order.total)}</p>
          <p class="text-muted">Placed ${new Date(order.createdAt).toLocaleString()}</p>
          <div>${(order.items || []).map((item) => `<p>${esc(item.product?.name || "Product")} × ${esc(item.quantity)} — ${money(item.price * item.quantity)}</p>`).join("")}</div>
        </article>`).join("") : '<div class="empty-state">You have no orders yet.</div>';
      status.textContent = "Orders loaded from the marketplace database.";
    } catch (error) {
      status.textContent = error.message || "Unable to load orders";
      list.innerHTML = '<div class="empty-state">Order data is temporarily unavailable.</div>';
    }
  };
  document.addEventListener("DOMContentLoaded", load);
})();
