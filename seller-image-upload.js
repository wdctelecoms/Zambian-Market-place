(() => {
  const originalRequestJson = window.requestJson;
  if (typeof originalRequestJson !== "function") return;

  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const MAX_DIMENSION = 1600;
  const MAX_OUTPUT_BYTES = 1.8 * 1024 * 1024;

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to read the selected image."));
      reader.readAsDataURL(file);
    });

  const compressImage = (file) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);

      image.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Your browser could not prepare the image."));
          return;
        }
        context.drawImage(image, 0, 0, width, height);

        let quality = 0.86;
        const makeDataUrl = () => canvas.toDataURL("image/jpeg", quality);
        let dataUrl = makeDataUrl();
        while (dataUrl.length > MAX_OUTPUT_BYTES * 1.37 && quality > 0.5) {
          quality -= 0.08;
          dataUrl = makeDataUrl();
        }
        resolve(dataUrl);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("The selected file is not a valid image."));
      };
      image.src = url;
    });

  async function prepareSelectedImage() {
    const input = document.getElementById("product-image-file");
    const urlInput = document.getElementById("product-image");
    if (!input || !urlInput || !input.files?.[0]) return;

    const file = input.files[0];
    if (!file.type.startsWith("image/")) {
      input.value = "";
      throw new Error("Please select an image file.");
    }
    if (file.size > MAX_FILE_SIZE) {
      input.value = "";
      throw new Error("Image is too large. Please choose an image smaller than 5 MB.");
    }

    urlInput.value = await compressImage(file);
  }

  window.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("product-image-file");
    const urlInput = document.getElementById("product-image");
    if (!input || !urlInput) return;

    input.addEventListener("change", async () => {
      try {
        await prepareSelectedImage();
        const status = document.getElementById("dashboard-status");
        if (status) {
          status.textContent = "Image selected and ready to upload.";
          status.className = "status-message status-success";
        }
      } catch (error) {
        const status = document.getElementById("dashboard-status");
        if (status) {
          status.textContent = error.message || "Unable to prepare image.";
          status.className = "status-message status-error";
        }
      }
    });
  });

  window.requestJson = async (path, options = {}) => {
    if ((options.method === "POST" || options.method === "PATCH") && /^\/seller\/products(?:\/|$)/.test(path)) {
      try {
        await prepareSelectedImage();
      } catch (error) {
        const status = document.getElementById("dashboard-status");
        if (status) {
          status.textContent = error.message || "Unable to prepare image.";
          status.className = "status-message status-error";
        }
        throw error;
      }

      if (typeof options.body === "string") {
        const payload = JSON.parse(options.body);
        const imageUrl = document.getElementById("product-image")?.value.trim();
        if (imageUrl) {
          payload.images = [imageUrl];
          payload.imageUrl = imageUrl;
        }
        options = { ...options, body: JSON.stringify(payload) };
      }
    }

    return originalRequestJson(path, options);
  };
})();
