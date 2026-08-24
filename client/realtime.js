(() => {
  const LIVE_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='500' viewBox='0 0 800 500'%3E%3Crect width='800' height='500' fill='%23f3f4f6'/%3E%3Ctext x='400' y='250' text-anchor='middle' dominant-baseline='middle' font-family='Arial' font-size='28' fill='%236b7280'%3ENo image available%3C/text%3E%3C/svg%3E";

  const page = () => window.location.pathname.split("/").pop() || "index.html";

  const setLiveStatus = (message) => {
    document.querySelectorAll("[data-live-status]").forEach((el) => {
      el.textContent = message;
      el.classList.add("status-success");
    });
  };

  const renderStats = async () => {
    const targets = document.querySelectorAll("[data-stat]");
    if (!targets.length) return;
    try {
      const stats = await fetch("/api/public/stats", { cache: "no-store" }).then((r) => r.json());
      targets.forEach((el) => {
        const key = el.dataset.stat;
        if (key && key in stats) el.textContent = Number(stats[key]).toLocaleString();
      });
    } catch {
      // The main marketplace content remains usable if statistics are temporarily unavailable.
    }
  };

  const removeDemoImageFallbacks = () => {
    document.querySelectorAll("img.product-image").forEach((img) => {
      if (img.src.includes("images.unsplash.com/photo-1501004318641-b39e6451bec6")) {
        img.src = LIVE_FALLBACK;
      }
    });
  };

  const refreshPageForLiveChange = () => {
    setLiveStatus("Live marketplace update received.");
    window.setTimeout(() => window.location.reload(), 350);
  };

  const connect = () => {
    if (!window.EventSource) return;
    const stream = new EventSource("/api/public/events");
    stream.addEventListener("catalog", (event) => {
      try {
        const snapshot = JSON.parse(event.data);
        window.dispatchEvent(new CustomEvent("marketplace:updated", { detail: snapshot }));
      } catch {
        window.dispatchEvent(new Event("marketplace:updated"));
      }
      refreshPageForLiveChange();
    });
    stream.addEventListener("error", () => setLiveStatus("Reconnecting to live marketplace…"));
  };

  document.addEventListener("DOMContentLoaded", () => {
    renderStats();
    removeDemoImageFallbacks();
    const observer = new MutationObserver(removeDemoImageFallbacks);
    observer.observe(document.body, { childList: true, subtree: true });
    if (["index.html", "shop.html", "cart.html", "seller.html"].includes(page())) connect();
  });
})();
