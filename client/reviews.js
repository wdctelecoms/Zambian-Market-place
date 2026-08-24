(() => {
  const esc = (value = "") => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");

  const attachReviewUI = () => {
    const details = document.getElementById("product-details");
    if (!details || details.dataset.reviewBound !== "true") return;
    const addButton = details.querySelector("[data-action='add-to-cart']");
    const productId = addButton?.dataset.productId;
    if (!productId || details.querySelector("[data-review-form]")) return;

    const section = document.createElement("section");
    section.className = "card";
    section.style.marginTop = "1rem";
    section.dataset.reviewForm = "true";
    section.innerHTML = `
      <h3>Customer reviews</h3>
      <div data-review-list class="grid"></div>
      <form data-review-submit class="grid" style="margin-top:1rem;">
        <label>Rating <select name="rating"><option value="5">5 — Excellent</option><option value="4">4 — Good</option><option value="3">3 — Average</option><option value="2">2 — Poor</option><option value="1">1 — Very poor</option></select></label>
        <textarea name="comment" placeholder="Share your experience..."></textarea>
        <button type="submit">Submit review</button>
        <div data-review-status class="status-message"></div>
      </form>`;
    details.appendChild(section);
    details.dataset.reviewBound = "true";

    const list = section.querySelector("[data-review-list]");
    const status = section.querySelector("[data-review-status]");
    fetch(`/api/reviews/product/${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then((r) => r.json()).then((reviews) => {
        list.innerHTML = reviews.length ? reviews.map((r) => `<article class="card"><strong>${esc(r.customerName || "Customer")}</strong><span> ${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}</span><p>${esc(r.comment || "No comment")}</p></article>`).join("") : '<div class="empty-state">No reviews yet.</div>';
      }).catch(() => { list.innerHTML = '<div class="empty-state">Reviews are temporarily unavailable.</div>'; });

    section.querySelector("[data-review-submit]").addEventListener("submit", async (event) => {
      event.preventDefault();
      let auth = {};
      try { auth = JSON.parse(localStorage.getItem("zmarket-auth") || "{}"); } catch { auth = {}; }
      if (!auth.tokens?.accessToken) { status.textContent = "Please sign in to leave a review."; return; }
      const form = event.currentTarget;
      try {
        const response = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.tokens.accessToken}` }, body: JSON.stringify({ productId, rating: Number(form.rating.value), comment: form.comment.value.trim() }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "Unable to save review");
        status.textContent = "Review saved.";
        form.reset();
        setTimeout(() => window.location.reload(), 300);
      } catch (error) { status.textContent = error.message || "Unable to save review"; }
    });
  };

  document.addEventListener("DOMContentLoaded", () => {
    const details = document.getElementById("product-details");
    if (!details) return;
    const observer = new MutationObserver(attachReviewUI);
    observer.observe(details, { childList: true, subtree: true });
  });
})();
