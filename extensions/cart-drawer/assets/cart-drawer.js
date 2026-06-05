(function () {
  var mount = document.getElementById("lavoc-cart-drawer-app");
  if (!mount || mount.dataset.ready === "true") return;
  mount.dataset.ready = "true";

  var state = {
    appUrl: (mount.dataset.appUrl || "").replace(/\/$/, ""),
    shop: mount.dataset.shop || "",
    config: null,
    cart: null,
    ready: false,
    open: false,
    busy: false
  };

  function isCartMutationUrl(value) {
    var url = String(value || "");
    return /\/cart\/(add|change|update|clear)(\.js)?(\?|$)/.test(url);
  }

  function cartUrl(path) {
    var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
    return root.replace(/\/$/, "/") + path.replace(/^\//, "");
  }

  function money(cents) {
    if (window.Shopify && typeof window.Shopify.formatMoney === "function") {
      return window.Shopify.formatMoney(cents);
    }

    return (cents / 100).toLocaleString(undefined, {
      style: "currency",
      currency: (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || "USD"
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fetchCart() {
    return fetch(cartUrl("cart.js"), {
      headers: { Accept: "application/json" },
      cache: "no-store"
    }).then(function (response) {
      if (!response.ok) throw new Error("Cart fetch failed: HTTP " + response.status);
      return response.json();
    });
  }

  function fetchConfig() {
    if (!state.appUrl || !state.shop) return Promise.reject(new Error("Missing app URL or shop"));
    return fetch(state.appUrl + "/api/public/config?shop=" + encodeURIComponent(state.shop), {
      cache: "no-store"
    }).then(function (response) {
      if (!response.ok) throw new Error("Config fetch failed: HTTP " + response.status);
      return response.json();
    });
  }

  function applyTheme() {
    var cfg = state.config || {};
    var colors = cfg.colors || {};
    var layout = cfg.layout || {};
    mount.style.setProperty("--lavoc-cart-accent", colors.accent || "#7c6243");
    mount.style.setProperty("--lavoc-cart-bg", colors.background || "#fffaf4");
    mount.style.setProperty("--lavoc-cart-text", colors.text || "#1f2933");
    mount.style.setProperty("--lavoc-cart-muted", colors.mutedText || "#667085");
    mount.style.setProperty("--lavoc-cart-border", colors.border || "#e6dccf");
    mount.style.setProperty("--lavoc-cart-button-bg", colors.buttonBackground || "#1f2933");
    mount.style.setProperty("--lavoc-cart-button-text", colors.buttonText || "#ffffff");
    mount.style.setProperty("--lavoc-cart-width", (layout.drawerWidth || 440) + "px");
    mount.style.setProperty("--lavoc-cart-radius", (layout.borderRadius || 8) + "px");
  }

  function progressHtml() {
    var cfg = state.config || {};
    var freeShipping = cfg.freeShipping || {};
    var cart = state.cart || { total_price: 0 };
    if (!freeShipping.enabled || !freeShipping.thresholdCents) return "";

    var remaining = Math.max(0, freeShipping.thresholdCents - cart.total_price);
    var complete = remaining === 0;
    var width = Math.min(100, Math.round((cart.total_price / freeShipping.thresholdCents) * 100));
    var copy = complete
      ? freeShipping.successMessage
      : freeShipping.message + " - " + money(remaining) + " away";

    return (
      '<div class="lavoc-cart-progress">' +
      '<div class="lavoc-cart-progress-copy">' + escapeHtml(copy) + "</div>" +
      '<div class="lavoc-cart-progress-track"><div class="lavoc-cart-progress-fill" style="width:' +
      width +
      '%"></div></div>' +
      "</div>"
    );
  }

  function lineHtml(item) {
    var image = item.image || (item.featured_image && item.featured_image.url) || "";
    var variant = item.variant_title && item.variant_title !== "Default Title" ? item.variant_title : "";
    return (
      '<article class="lavoc-cart-line">' +
      (image ? '<img alt="' + escapeHtml(item.product_title || item.title) + '" src="' + escapeHtml(image) + '">' : "<div></div>") +
      '<div class="lavoc-cart-line-main">' +
      '<div class="lavoc-cart-line-top">' +
      '<div><div class="lavoc-cart-line-title">' + escapeHtml(item.product_title || item.title) + "</div>" +
      (variant ? '<div class="lavoc-cart-line-meta">' + escapeHtml(variant) + "</div>" : "") +
      "</div>" +
      '<div class="lavoc-cart-line-price">' + money(item.final_line_price || item.line_price) + "</div>" +
      "</div>" +
      '<div class="lavoc-cart-line-top">' +
      '<div class="lavoc-cart-qty">' +
      '<button type="button" data-lavoc-qty="' + escapeHtml(item.key) + '" data-next="' + Math.max(0, item.quantity - 1) + '">-</button>' +
      "<span>" + item.quantity + "</span>" +
      '<button type="button" data-lavoc-qty="' + escapeHtml(item.key) + '" data-next="' + (item.quantity + 1) + '">+</button>' +
      "</div>" +
      '<button type="button" class="lavoc-cart-remove" data-lavoc-qty="' + escapeHtml(item.key) + '" data-next="0">Remove</button>' +
      "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function upsellsHtml() {
    var cfg = state.config || {};
    var upsells = cfg.upsells || [];
    if (!upsells.length) return "";

    return (
      '<section class="lavoc-cart-upsells"><h3 class="lavoc-cart-title">' +
      escapeHtml(cfg.upsellsHeading || "Complete your routine") +
      "</h3>" +
      upsells
        .map(function (item) {
          return (
            '<article class="lavoc-cart-upsell">' +
            (item.imageUrl ? '<img alt="' + escapeHtml(item.title) + '" src="' + escapeHtml(item.imageUrl) + '">' : "<div></div>") +
            "<div>" +
            '<div class="lavoc-cart-upsell-title">' + escapeHtml(item.title) + "</div>" +
            (item.badgeText ? '<div class="lavoc-cart-badge">' + escapeHtml(item.badgeText) + "</div>" : "") +
            (item.priceCents != null ? '<div class="lavoc-cart-line-meta">' + money(item.priceCents) + "</div>" : "") +
            "</div>" +
            '<button type="button" data-lavoc-add="' + escapeHtml(item.variantId) + '">Add</button>' +
            "</article>"
          );
        })
        .join("") +
      "</section>"
    );
  }

  function render() {
    var cfg = state.config || {};
    var copy = cfg.copy || {};
    var cart = state.cart || { items: [], item_count: 0, total_price: 0 };
    applyTheme();

    var body = cart.item_count
      ? progressHtml() + '<div class="lavoc-cart-lines">' + cart.items.map(lineHtml).join("") + "</div>" + upsellsHtml()
      : '<div class="lavoc-cart-empty"><h3>' +
        escapeHtml(copy.emptyTitle || "Your cart is empty") +
        "</h3><p>" +
        escapeHtml(copy.emptyBody || "") +
        "</p></div>";

    mount.className = "lavoc-cart-shell" + (state.open ? " is-open" : "") + (state.busy ? " lavoc-cart-loading" : "");
    mount.innerHTML =
      '<div class="lavoc-cart-backdrop" data-lavoc-close></div>' +
      '<aside class="lavoc-cart-drawer" role="dialog" aria-modal="true" aria-label="' +
      escapeHtml(copy.drawerTitle || "Your cart") +
      '">' +
      '<header class="lavoc-cart-header"><h2 class="lavoc-cart-title">' +
      escapeHtml(copy.drawerTitle || "Your cart") +
      '</h2><button class="lavoc-cart-close" type="button" data-lavoc-close aria-label="Close cart">&times;</button></header>' +
      '<div class="lavoc-cart-body">' +
      body +
      "</div>" +
      '<footer class="lavoc-cart-footer">' +
      '<div class="lavoc-cart-subtotal"><span>Subtotal</span><span>' +
      money(cart.total_price || 0) +
      "</span></div>" +
      '<a class="lavoc-cart-checkout" href="' +
      cartUrl("checkout") +
      '">' +
      escapeHtml(copy.checkoutButtonText || "Check out") +
      "</a>" +
      '<button class="lavoc-cart-secondary" type="button" data-lavoc-close>' +
      escapeHtml(copy.continueShoppingText || "Continue shopping") +
      "</button>" +
      "</footer>" +
      "</aside>";

    document.documentElement.classList.toggle("lavoc-cart-lock", state.open);
  }

  function refreshSections() {
    return fetch(cartUrl("cart?sections=cart-drawer,cart-icon-bubble"), { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) return null;
        return response.json();
      })
      .then(function (sections) {
        if (!sections) return;
        if (sections["cart-icon-bubble"]) {
          var bubble = document.getElementById("cart-icon-bubble");
          var parser = new DOMParser();
          var doc = parser.parseFromString(sections["cart-icon-bubble"], "text/html");
          var nextBubble = doc.getElementById("cart-icon-bubble");
          if (bubble && nextBubble) bubble.outerHTML = nextBubble.outerHTML;
        }
      })
      .catch(function () {});
  }

  function refreshCart() {
    return fetchCart().then(function (cart) {
      state.cart = cart;
      render();
      document.dispatchEvent(new CustomEvent("lavoc:cart:updated", { detail: { cart: cart } }));
      refreshSections();
      return cart;
    });
  }

  function openDrawer() {
    if (!state.ready || state.config.enabled === false) return;
    closeNativeDrawer();
    state.open = true;
    render();
    refreshCart();
  }

  function closeDrawer() {
    state.open = false;
    render();
  }

  function closeNativeDrawer() {
    document.documentElement.classList.add("lavoc-native-cart-suppressed");
    document.body.classList.add("lavoc-native-cart-suppressed");

    [
      "cart-drawer",
      "cart-notification",
      "#CartDrawer",
      "#cart-drawer",
      ".cart-drawer",
      ".drawer--cart",
      "[data-cart-drawer]",
      "[aria-modal='true'][id*='cart' i]",
      "[aria-modal='true'][class*='cart' i]"
    ].forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (node) {
        if (node === mount || mount.contains(node)) return;
        node.setAttribute("aria-hidden", "true");
        node.classList.remove("animate", "active", "open", "is-open", "drawer--is-open");
        node.removeAttribute("open");
      });
    });

    [
      ".cart-drawer__overlay",
      ".drawer__overlay",
      "#CartDrawer-Overlay",
      ".modal-overlay"
    ].forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (node) {
        if (mount.contains(node)) return;
        node.setAttribute("aria-hidden", "true");
      });
    });
  }

  function scheduleOpenAfterCartMutation() {
    window.setTimeout(function () {
      refreshCart().then(function () {
        openDrawer();
      });
    }, 150);
  }

  function changeLine(lineKey, quantity) {
    state.busy = true;
    render();
    return fetch(cartUrl("cart/change.js"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lineKey, quantity: Number(quantity) })
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Cart change failed");
        return refreshCart();
      })
      .finally(function () {
        state.busy = false;
        render();
      });
  }

  function addUpsell(variantId) {
    state.busy = true;
    render();
    return fetch(cartUrl("cart/add.js"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] })
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Upsell add failed");
        return refreshCart();
      })
      .finally(function () {
        state.busy = false;
        render();
      });
  }

  mount.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;

    var close = target.closest("[data-lavoc-close]");
    if (close) {
      closeDrawer();
      return;
    }

    var qty = target.closest("[data-lavoc-qty]");
    if (qty) {
      changeLine(qty.getAttribute("data-lavoc-qty"), qty.getAttribute("data-next"));
      return;
    }

    var add = target.closest("[data-lavoc-add]");
    if (add) {
      addUpsell(add.getAttribute("data-lavoc-add"));
    }
  });

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var trigger = target.closest(
      'a[href="/cart"], a[href$="/cart"], a[href*="/cart?"], #cart-icon-bubble, [aria-controls="cart-drawer"], [aria-controls="CartDrawer"], [data-cart-drawer-toggle], [data-cart-toggle], [data-drawer-id*="cart" i], [data-drawer-trigger*="cart" i]'
    );

    if (!trigger || !state.ready || state.config.enabled === false) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openDrawer();
  }, true);

  document.addEventListener("submit", function (event) {
    var target = event.target;
    if (!(target instanceof HTMLFormElement)) return;
    var action = target.getAttribute("action") || "";
    if (!/\/cart\/add/.test(action) || !state.ready || state.config.enabled === false) return;
    scheduleOpenAfterCartMutation();
  }, true);

  var originalFetch = window.fetch;
  window.fetch = function () {
    var input = arguments[0];
    var url = typeof input === "string" ? input : input && input.url;
    var isMutation = isCartMutationUrl(url);
    return originalFetch.apply(this, arguments).then(function (response) {
      if (isMutation && response.ok && state.ready && state.config.enabled !== false) {
        scheduleOpenAfterCartMutation();
      }
      return response;
    });
  };

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && state.open) closeDrawer();
  });

  Promise.all([fetchConfig(), fetchCart()])
    .then(function (results) {
      state.config = results[0];
      state.cart = results[1];
      state.ready = true;
      render();
    })
    .catch(function (error) {
      console.error("[LavocDerma Cart Drawer]", error);
    });
})();
