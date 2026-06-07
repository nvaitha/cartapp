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
    busy: false,
    timerEndsAt: null,
    giftAddingRewardId: null,
    giftAddedRewardIds: {},
    giftClaimedRewardIds: {},
    giftErrorsByRewardId: {}
  };
  var nativeOpenTimer = null;
  var internalCartMutationDepth = 0;
  var cartSequence = 0;
  var sectionSequence = 0;
  var timerInterval = null;

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

  function replaceTemplate(template, values) {
    return String(template || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/g, function (_, key) {
      return values[key] == null ? "" : values[key];
    });
  }

  function currentCountry() {
    var shopify = window.Shopify || {};
    return String(
      shopify.country ||
        (shopify.localization && shopify.localization.country && shopify.localization.country.iso_code) ||
        document.documentElement.getAttribute("data-country") ||
        ""
    ).toUpperCase();
  }

  function passesCountryTargeting(targeting) {
    if (!targeting || !targeting.enabled || !targeting.countries || !targeting.countries.length) return true;
    var country = currentCountry();
    if (!country) return true;
    var countries = targeting.countries.map(function (item) {
      return String(item).toUpperCase();
    });
    var matched = countries.indexOf(country) !== -1;
    return targeting.mode === "exclude" ? !matched : matched;
  }

  function getGamification() {
    var cfg = state.config || {};
    var gamification = cfg.gamification || (cfg.layout && cfg.layout.gamification);
    if (!gamification || gamification.enabled === false || !passesCountryTargeting(gamification.country_targeting)) return null;
    return gamification;
  }

  function getFrequentlyBoughtTogether() {
    var cfg = state.config || {};
    var fbt = cfg.frequentlyBoughtTogether || (cfg.layout && cfg.layout.frequentlyBoughtTogether);
    if (!fbt || fbt.enabled === false || !passesCountryTargeting(fbt.country_targeting)) return null;
    return fbt;
  }

  function hasSubscriptionCart(cart) {
    return Boolean(
      cart &&
        cart.items &&
        cart.items.some(function (item) {
          var properties = item.properties || {};
          return (
            item.selling_plan_allocation ||
            item.selling_plan_name ||
            Object.keys(properties).some(function (key) {
              return /subscription|selling[_ -]?plan/i.test(key + " " + properties[key]);
            })
          );
        })
    );
  }

  function rewardIncludedBySubscription(reward, gamification, cart) {
    return Boolean(
      gamification &&
        gamification.subscription_perks_included !== false &&
        hasSubscriptionCart(cart) &&
        (reward.type === "free_shipping" || reward.type === "free_gift")
    );
  }

  function cartHasVariant(variantId) {
    var numericId = Number(variantId);
    if (!Number.isFinite(numericId)) return false;
    var cart = state.cart || { items: [] };
    return (cart.items || []).some(function (item) {
      return Number(item.variant_id) === numericId;
    });
  }

  function variantNumericId(variantId) {
    var match = String(variantId || "").match(/(\d+)$/);
    return match ? Number(match[1]) : NaN;
  }

  function cleanDiscountCode(code) {
    return String(code || "").trim();
  }

  function discountCheckoutUrl(code) {
    return cartUrl(
      "discount/" +
        encodeURIComponent(code) +
        "?redirect=" +
        encodeURIComponent(cartUrl("checkout"))
    );
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

  function nextCartSequence() {
    cartSequence += 1;
    return cartSequence;
  }

  function withInternalCartMutation(callback) {
    internalCartMutationDepth += 1;
    return callback().finally(function () {
      internalCartMutationDepth = Math.max(0, internalCartMutationDepth - 1);
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
    var width = Math.min(100, Math.max(0, Math.round((cart.total_price / freeShipping.thresholdCents) * 100)));
    var copy = complete
      ? (freeShipping.successMessage || "Free shipping unlocked")
      : "Spend " + money(remaining) + " more for free shipping";

    return (
      '<div class="lavoc-cart-progress' + (complete ? " is-complete" : "") + '">' +
      '<div class="lavoc-cart-progress-copy">' +
      (complete ? '<span class="lavoc-cart-progress-icon" aria-hidden="true">✓</span>' : "") +
      "<span>" + escapeHtml(copy) + "</span></div>" +
      '<div class="lavoc-cart-progress-track"><div class="lavoc-cart-progress-fill" style="width:' +
      width +
      '%"></div></div>' +
      "</div>"
    );
  }

  function timerText() {
    if (!state.timerEndsAt) return "00:00";
    var remaining = Math.max(0, state.timerEndsAt - Date.now());
    var totalSeconds = Math.ceil(remaining / 1000);
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  }

  function updateTimerDom() {
    var node = mount.querySelector(".lavoc-cart-timer-time");
    if (node) node.textContent = timerText();
  }

  function ensureTimer(gamification) {
    if (!gamification || !gamification.timer_enabled) {
      if (timerInterval) window.clearInterval(timerInterval);
      timerInterval = null;
      state.timerEndsAt = null;
      return;
    }

    if (!state.timerEndsAt || state.timerEndsAt <= Date.now()) {
      state.timerEndsAt = Date.now() + Math.max(1, Number(gamification.timer_minutes || 5)) * 60 * 1000;
    }

    if (!timerInterval) {
      timerInterval = window.setInterval(updateTimerDom, 1000);
    }
    updateTimerDom();
  }

  function timerHtml(gamification) {
    if (!gamification || !gamification.timer_enabled) return "";
    return (
      '<div class="lavoc-cart-timer"><span class="lavoc-cart-timer-icon" aria-hidden="true">🔥</span><span>' +
      escapeHtml(gamification.timer_text || "These skin savers are yours for...") +
      ' </span><strong class="lavoc-cart-timer-time">' +
      timerText() +
      "</strong><span> minutes</span></div>"
    );
  }

  function activeRewards(gamification) {
    return ((gamification && gamification.rewards) || [])
      .filter(function (reward) {
        return reward.enabled !== false;
      })
      .slice(0, 4)
      .sort(function (a, b) {
        return Number(a.threshold_cents || 0) - Number(b.threshold_cents || 0);
      });
  }

  function rewardProgressPercent(rewards, cartTotal) {
    if (!rewards.length) return 0;

    var thresholds = rewards.map(function (reward) {
      return Math.max(0, Number(reward.threshold_cents || 0));
    });
    var total = Math.max(0, Number(cartTotal || 0));

    if (rewards.length === 1) {
      var onlyGoal = Math.max(1, thresholds[0]);
      return Math.min(100, Math.max(0, Math.round((total / onlyGoal) * 100)));
    }

    function milestonePosition(index) {
      return ((index + 0.5) / rewards.length) * 100;
    }

    if (total <= thresholds[0]) {
      var firstGoal = Math.max(1, thresholds[0]);
      var firstFill = milestonePosition(0);
      return Math.min(firstFill, Math.max(0, (total / firstGoal) * firstFill));
    }

    for (var index = 1; index < thresholds.length; index += 1) {
      var previousGoal = thresholds[index - 1];
      var currentGoal = Math.max(previousGoal + 1, thresholds[index]);
      var previousFill = milestonePosition(index - 1);
      var currentFill = milestonePosition(index);

      if (total < currentGoal) {
        var segmentProgress = (total - previousGoal) / (currentGoal - previousGoal);
        return Math.min(
          currentFill,
          Math.max(previousFill, previousFill + segmentProgress * (currentFill - previousFill))
        );
      }
    }

    return 100;
  }

  function rewardUnavailable(reward) {
    return reward && reward.available === false;
  }

  function unlockedDiscountCode() {
    var gamification = getGamification();
    var cart = state.cart || { total_price: 0 };
    var rewards = activeRewards(gamification)
      .filter(function (reward) {
        return cart.total_price >= Number(reward.threshold_cents || 0);
      })
      .reverse();

    for (var index = 0; index < rewards.length; index += 1) {
      var reward = rewards[index];
      if (rewardIncludedBySubscription(reward, gamification, cart)) continue;
      var code = cleanDiscountCode(reward.discount_code);
      if (!code) continue;
      if (reward.type === "free_gift" && reward.variant_id && !cartHasVariant(reward.variant_id)) continue;
      return code;
    }

    return "";
  }

  function checkoutHref() {
    var discountCode = unlockedDiscountCode();
    return discountCode ? discountCheckoutUrl(discountCode) : cartUrl("checkout");
  }

  function rewardsHtml(gamification) {
    var rewards = activeRewards(gamification);
    var cart = state.cart || { total_price: 0 };
    if (!rewards.length) return "";

    var width = rewardProgressPercent(rewards, cart.total_price);
    var nextReward = rewards.find(function (reward) {
      return cart.total_price < Number(reward.threshold_cents || 0) && !rewardIncludedBySubscription(reward, gamification, cart);
    });
    var subscriptionIncluded = hasSubscriptionCart(cart) && gamification.subscription_perks_included !== false;
    var message = "";

    if (subscriptionIncluded) {
      message = gamification.subscription_message || "Subscription orders already include your gift and free shipping.";
    } else if (nextReward) {
      message = replaceTemplate(nextReward.before_text, {
        amount_left: money(Math.max(0, Number(nextReward.threshold_cents || 0) - cart.total_price)),
        reward: nextReward.title,
        goal: money(Number(nextReward.threshold_cents || 0))
      });
    } else {
      var finalReward = rewards[rewards.length - 1];
      message = replaceTemplate(finalReward.after_text, {
        amount_left: money(0),
        reward: finalReward.title,
        goal: money(Number(finalReward.threshold_cents || 0))
      });
    }

    return (
      '<section class="lavoc-cart-rewards" aria-label="Cart rewards">' +
      '<div class="lavoc-cart-reward-message">' + escapeHtml(message) + "</div>" +
      '<div class="lavoc-cart-reward-track"><div class="lavoc-cart-reward-rail" style="--lavoc-cart-reward-progress:' +
      width +
      "%; --lavoc-cart-reward-count:" +
      rewards.length +
      '">' +
      '<div class="lavoc-cart-reward-fill"></div>' +
      rewards
        .map(function (reward) {
          var unlocked = cart.total_price >= Number(reward.threshold_cents || 0);
          var included = rewardIncludedBySubscription(reward, gamification, cart);
          return (
            '<div class="lavoc-cart-reward-node' +
            (unlocked || included ? " is-unlocked" : "") +
            '">' +
            '<div class="lavoc-cart-reward-dot"><span>' +
            escapeHtml(reward.icon || "✓") +
            "</span></div>" +
            '<div class="lavoc-cart-reward-title">' +
            escapeHtml(reward.title) +
            "</div>" +
            '<div class="lavoc-cart-reward-goal">' +
            money(Number(reward.threshold_cents || 0)) +
            "</div></div>"
          );
        })
        .join("") +
      "</div></div></section>"
    );
  }

  function giftTeaserHtml(gamification) {
    var cart = state.cart || { total_price: 0 };
    var giftReward = activeRewards(gamification).find(function (reward) {
      return reward.type === "free_gift" && reward.teaser_enabled !== false;
    });
    if (!giftReward) return "";

    var threshold = Number(giftReward.threshold_cents || 0);
    var unlocked = cart.total_price >= threshold;
    var included = rewardIncludedBySubscription(giftReward, gamification, cart);
    var added =
      giftReward.variant_id &&
      (cartHasVariant(giftReward.variant_id) || state.giftAddedRewardIds[giftReward.id]);
    var adding = state.giftAddingRewardId === giftReward.id;
    var unavailable = rewardUnavailable(giftReward);
    var error = state.giftErrorsByRewardId[giftReward.id];
    var templateValues = {
      reward: giftReward.title,
      amount_left: money(Math.max(0, threshold - cart.total_price)),
      goal: money(threshold)
    };
    var message = included
      ? replaceTemplate(
          giftReward.subscription_text || gamification.subscription_message || "{{reward}} is already included with subscription.",
          templateValues
        )
      : unlocked
        ? replaceTemplate(giftReward.after_text, templateValues)
        : replaceTemplate(giftReward.before_text, templateValues);

    return (
      '<section class="lavoc-cart-gift">' +
      '<div class="lavoc-cart-gift-message">' + escapeHtml(message) + "</div>" +
      '<div class="lavoc-cart-gift-card">' +
      (giftReward.image_url
        ? '<img alt="' + escapeHtml(giftReward.product_title || giftReward.title) + '" src="' + escapeHtml(giftReward.image_url) + '">'
        : '<div class="lavoc-cart-gift-placeholder">' + escapeHtml(giftReward.icon || "🎁") + "</div>") +
      "<div>" +
      '<div class="lavoc-cart-gift-heading">' + escapeHtml(giftReward.teaser_heading || giftReward.product_title || giftReward.title) + "</div>" +
      '<div class="lavoc-cart-gift-price">' +
      (giftReward.compare_at_cents ? '<s>' + money(Number(giftReward.compare_at_cents)) + "</s> " : "") +
      "<strong>" +
      escapeHtml(giftReward.teaser_subheading || "$0 Free") +
      "</strong></div>" +
      (unlocked && giftReward.variant_id && unavailable && !added
        ? '<button type="button" disabled>Gift unavailable</button>'
        : unlocked && giftReward.variant_id && !included && !added
        ? '<button type="button" data-lavoc-gift="' +
          escapeHtml(giftReward.id) +
          '"' +
          (adding ? " disabled" : "") +
          ">" +
          (adding ? "Adding gift..." : "Add gift") +
          "</button>"
        : added
          ? '<button type="button" class="lavoc-cart-gift-added" disabled>Gift added</button>'
          : !unlocked && !included
            ? '<button type="button" disabled>Unlock gift</button>'
          : "") +
      (unlocked && giftReward.price_cents > 0 && !cleanDiscountCode(giftReward.discount_code)
        ? '<div class="lavoc-cart-gift-error">This gift needs a Shopify discount code to be free at checkout.</div>'
        : "") +
      (error ? '<div class="lavoc-cart-gift-error">' + escapeHtml(error) + "</div>" : "") +
      "</div></div></section>"
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

  function fbtHtml() {
    var fbt = getFrequentlyBoughtTogether();
    if (!fbt || !fbt.products || !fbt.products.length) return "";
    var cart = state.cart || { items: [] };
    var cartVariantIds = (cart.items || []).map(function (item) {
      return String(item.variant_id);
    });
    var products = fbt.products
      .filter(function (item) {
        return item.enabled !== false && cartVariantIds.indexOf(String(item.variant_id)) === -1;
      })
      .slice(0, Math.max(1, Number(fbt.display_limit || 4)));
    if (!products.length) return "";

    return (
      '<section class="lavoc-cart-fbt"><h3>' +
      escapeHtml(fbt.heading || "Popular Right Now🔥!!") +
      "</h3>" +
      products
        .map(function (item) {
          return (
            '<article class="lavoc-cart-fbt-item">' +
            (item.image_url ? '<img alt="' + escapeHtml(item.title) + '" src="' + escapeHtml(item.image_url) + '">' : "<div></div>") +
            '<div class="lavoc-cart-fbt-copy"><div class="lavoc-cart-fbt-title">' +
            escapeHtml(item.title) +
            "</div>" +
            (item.price_cents != null ? '<div class="lavoc-cart-fbt-price">' + money(Number(item.price_cents)) + "</div>" : "") +
            '<div class="lavoc-cart-fbt-details">' +
            escapeHtml(fbt.details_text || "Show details") +
            "</div></div>" +
            '<button type="button" data-lavoc-add="' + escapeHtml(item.variant_id) + '">' +
            escapeHtml(fbt.add_button_text || "Add to cart") +
            "</button></article>"
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
    var gamification = getGamification();
    var drawerTitle = gamification ? gamification.header_text : copy.drawerTitle || "Your cart";
    applyTheme();

    var body = cart.item_count
      ? (gamification ? rewardsHtml(gamification) : progressHtml()) +
        '<div class="lavoc-cart-lines">' +
        cart.items.map(lineHtml).join("") +
        "</div>" +
        (gamification ? giftTeaserHtml(gamification) : "") +
        fbtHtml()
      : (gamification ? rewardsHtml(gamification) : "") +
        '<div class="lavoc-cart-empty"><h3>' +
        escapeHtml(copy.emptyTitle || "Your cart is empty") +
        "</h3><p>" +
        escapeHtml(copy.emptyBody || "") +
        "</p></div>";

    mount.className = "lavoc-cart-shell" + (state.open ? " is-open" : "") + (state.busy ? " lavoc-cart-loading" : "") + (gamification ? " is-gamified" : "");
    mount.innerHTML =
      '<div class="lavoc-cart-backdrop" data-lavoc-close></div>' +
      '<aside class="lavoc-cart-drawer" role="dialog" aria-modal="true" aria-label="' +
      escapeHtml(drawerTitle) +
      '">' +
      '<header class="lavoc-cart-header"><h2 class="lavoc-cart-title">' +
      escapeHtml(drawerTitle) +
      '</h2><button class="lavoc-cart-close" type="button" data-lavoc-close aria-label="Close cart">&times;</button></header>' +
      timerHtml(gamification) +
      '<div class="lavoc-cart-body">' +
      body +
      "</div>" +
      '<footer class="lavoc-cart-footer">' +
      '<div class="lavoc-cart-subtotal"><span>Subtotal</span><span>' +
      money(cart.total_price || 0) +
      "</span></div>" +
      '<a class="lavoc-cart-checkout" href="' +
      checkoutHref() +
      '">' +
      escapeHtml(copy.checkoutButtonText || "Check out") +
      "</a>" +
      '<button class="lavoc-cart-secondary" type="button" data-lavoc-close>' +
      escapeHtml(copy.continueShoppingText || "Continue shopping") +
      "</button>" +
      "</footer>" +
      "</aside>";

    document.documentElement.classList.toggle("lavoc-cart-lock", state.open);
    document.body.classList.toggle("lavoc-cart-lock", state.open);
    ensureTimer(gamification);
  }

  function updateThemeCartIndicators(cart) {
    var count = Number(cart && cart.item_count ? cart.item_count : 0);
    var text = String(count);

    document.querySelectorAll("[data-cart-count], .cart-count, .header__cart-count, .site-header__cart-count").forEach(function (node) {
      if (mount.contains(node)) return;
      node.textContent = text;
      node.toggleAttribute("hidden", count === 0);
    });

    document.querySelectorAll(".cart-count-bubble, [data-cart-count-bubble]").forEach(function (bubble) {
      if (mount.contains(bubble)) return;
      bubble.toggleAttribute("hidden", count === 0);
      bubble.style.display = count === 0 ? "none" : "";

      var visibleCount =
        bubble.querySelector("[data-cart-count]") ||
        bubble.querySelector("span[aria-hidden='true']") ||
        bubble.querySelector("span:not(.visually-hidden)");

      if (visibleCount) visibleCount.textContent = text;
    });
  }

  function refreshSections(cart) {
    var requestSequence = sectionSequence += 1;
    updateThemeCartIndicators(cart || state.cart || { item_count: 0 });

    return fetch(cartUrl("cart?sections=cart-drawer,cart-icon-bubble"), { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) return null;
        return response.json();
      })
      .then(function (sections) {
        if (!sections || requestSequence !== sectionSequence) return;
        if (sections["cart-icon-bubble"]) {
          var bubble = document.getElementById("cart-icon-bubble");
          var parser = new DOMParser();
          var doc = parser.parseFromString(sections["cart-icon-bubble"], "text/html");
          var nextBubble = doc.getElementById("cart-icon-bubble");
          if (bubble && nextBubble) bubble.outerHTML = nextBubble.outerHTML;
        }
        updateThemeCartIndicators(cart || state.cart || { item_count: 0 });
      })
      .catch(function () {});
  }

  function refreshCart(sequence) {
    var requestSequence = sequence || nextCartSequence();
    return fetchCart().then(function (cart) {
      return applyCart(cart, requestSequence);
    });
  }

  function applyCart(cart, sequence) {
    if (sequence && sequence < cartSequence) return cart;
    state.cart = cart;
    syncGiftAddedState();
    render();
    document.dispatchEvent(new CustomEvent("lavoc:cart:updated", { detail: { cart: cart } }));
    refreshSections(cart);
    return cart;
  }

  function syncGiftAddedState() {
    var gamification = getGamification();
    var rewards = activeRewards(gamification);
    rewards.forEach(function (reward) {
      if (reward.type !== "free_gift" || !reward.variant_id) return;
      if (cartHasVariant(reward.variant_id)) state.giftAddedRewardIds[reward.id] = true;
      else delete state.giftAddedRewardIds[reward.id];
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
    if (nativeOpenTimer) window.clearTimeout(nativeOpenTimer);
    nativeOpenTimer = null;
    state.busy = false;
    state.open = false;
    clearNativeCartLocks();
    render();
  }

  function clearNativeCartLocks() {
    [
      "overflow-hidden",
      "no-scroll",
      "scroll-locked",
      "modal-open",
      "drawer-open",
      "js-drawer-open",
      "js-drawer-open-cart",
      "cart-drawer-open",
      "cart-notification-open"
    ].forEach(function (className) {
      document.documentElement.classList.remove(className);
      document.body.classList.remove(className);
    });

    if (!state.open) {
      document.documentElement.style.removeProperty("overflow");
      document.body.style.removeProperty("overflow");
    }
  }

  function closeNativeDrawer() {
    document.documentElement.classList.add("lavoc-native-cart-suppressed");
    document.body.classList.add("lavoc-native-cart-suppressed");
    clearNativeCartLocks();

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
    if (nativeOpenTimer) window.clearTimeout(nativeOpenTimer);
    nativeOpenTimer = window.setTimeout(function () {
      nativeOpenTimer = null;
      closeNativeDrawer();
      state.open = true;
      state.busy = true;
      render();
      refreshCart().finally(function () {
        state.busy = false;
        render();
      });
    }, 120);
  }

  function changeLine(lineKey, quantity) {
    var requestSequence = nextCartSequence();
    state.busy = true;
    render();
    return withInternalCartMutation(function () {
      return fetch(cartUrl("cart/change.js"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lineKey, quantity: Number(quantity) })
      });
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Cart change failed");
        return response.json();
      })
      .then(function (cart) {
        return applyCart(cart, requestSequence);
      })
      .finally(function () {
        state.busy = false;
        render();
      });
  }

  function cartAddPayloads(variantId, properties) {
    var numericId = variantNumericId(variantId);
    if (!Number.isFinite(numericId)) return [];
    var item = { id: numericId, quantity: 1, properties: properties || {} };
    return [
      { id: item.id, quantity: item.quantity, properties: item.properties },
      { items: [item] }
    ];
  }

  function readCartError(response) {
    return response
      .json()
      .then(function (payload) {
        return payload && (payload.description || payload.message || payload.error);
      })
      .catch(function () {
        return response.text().catch(function () {
          return "";
        });
      })
      .then(function (message) {
        return message || "Cart add failed";
      });
  }

  function postCartAddPayload(payload) {
    return withInternalCartMutation(function () {
      return fetch(cartUrl("cart/add.js"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    });
  }

  function addVariantToCart(variantId, properties) {
    var requestSequence = nextCartSequence();
    var payloads = cartAddPayloads(variantId, properties);
    if (!payloads.length) return Promise.reject(new Error("Missing gift variant"));

    state.busy = true;
    render();

    return postCartAddPayload(payloads[0])
      .then(function (response) {
        if (response.ok) return response;
        return readCartError(response).then(function (firstError) {
          return postCartAddPayload(payloads[1]).then(function (fallbackResponse) {
            if (fallbackResponse.ok) return fallbackResponse;
            return readCartError(fallbackResponse).then(function (fallbackError) {
              throw new Error(fallbackError || firstError);
            });
          });
        });
      })
      .then(function () {
        return refreshCart(requestSequence);
      })
      .finally(function () {
        state.busy = false;
        render();
      });
  }

  function addRecommendation(variantId) {
    return addVariantToCart(variantId);
  }

  function addRewardGift(rewardId) {
    var gamification = getGamification();
    var reward = activeRewards(gamification).find(function (item) {
      return item.id === rewardId;
    });
    if (!reward || !reward.variant_id) return Promise.resolve();
    if (rewardUnavailable(reward)) {
      state.giftErrorsByRewardId[reward.id] = "This gift is currently sold out.";
      render();
      return Promise.reject(new Error(state.giftErrorsByRewardId[reward.id]));
    }
    if (cartHasVariant(reward.variant_id) || state.giftAddedRewardIds[reward.id]) {
      state.giftAddedRewardIds[reward.id] = true;
      render();
      return Promise.resolve();
    }

    state.giftAddingRewardId = reward.id;
    state.giftClaimedRewardIds[reward.id] = true;
    delete state.giftErrorsByRewardId[reward.id];
    render();

    return addVariantToCart(reward.variant_id, {
      _lavoc_reward: reward.title,
      _lavoc_reward_type: reward.type,
      _lavoc_free_gift: "true"
    })
      .then(function () {
        state.giftAddedRewardIds[reward.id] = true;
      })
      .catch(function (error) {
        state.giftErrorsByRewardId[reward.id] =
          error && error.message ? error.message : "Unable to add gift. Please try again.";
        throw error;
      })
      .finally(function () {
        state.giftAddingRewardId = null;
        render();
      });
  }

  function claimedMissingGift() {
    var gamification = getGamification();
    var cart = state.cart || { total_price: 0 };
    return activeRewards(gamification).find(function (reward) {
      return (
        reward.type === "free_gift" &&
        reward.variant_id &&
        cart.total_price >= Number(reward.threshold_cents || 0) &&
        state.giftClaimedRewardIds[reward.id] &&
        !rewardIncludedBySubscription(reward, gamification, cart) &&
        !cartHasVariant(reward.variant_id)
      );
    });
  }

  function goToCheckout(href) {
    window.location.href = href || cartUrl("checkout");
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
      addRecommendation(add.getAttribute("data-lavoc-add"));
      return;
    }

    var gift = target.closest("[data-lavoc-gift]");
    if (gift) {
      event.preventDefault();
      addRewardGift(gift.getAttribute("data-lavoc-gift")).catch(function () {});
      return;
    }

    var checkout = target.closest(".lavoc-cart-checkout");
    if (checkout) {
      var missingGift = claimedMissingGift();
      if (!missingGift) return;
      event.preventDefault();
      addRewardGift(missingGift.id)
        .then(function () {
          goToCheckout(checkoutHref());
        })
        .catch(function () {});
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

  var originalFetch = window.fetch;
  window.fetch = function () {
    var input = arguments[0];
    var url = typeof input === "string" ? input : input && input.url;
    var isMutation = isCartMutationUrl(url);
    return originalFetch.apply(this, arguments).then(function (response) {
      if (isMutation && response.ok && !internalCartMutationDepth && state.ready && state.config.enabled !== false) {
        scheduleOpenAfterCartMutation();
      }
      return response;
    });
  };

  var OriginalXHR = window.XMLHttpRequest;
  if (OriginalXHR) {
    window.XMLHttpRequest = function () {
      var xhr = new OriginalXHR();
      var cartMutation = false;
      var originalOpen = xhr.open;
      xhr.open = function (method, url) {
        cartMutation = isCartMutationUrl(url);
        return originalOpen.apply(xhr, arguments);
      };
      xhr.addEventListener("load", function () {
        if (cartMutation && xhr.status >= 200 && xhr.status < 300 && state.ready && state.config.enabled !== false) {
          scheduleOpenAfterCartMutation();
        }
      });
      return xhr;
    };
  }

  function nativeDrawerLooksOpen(node) {
    if (!(node instanceof Element) || node === mount || mount.contains(node)) return false;
    var text = ((node.id || "") + " " + (node.className || "")).toLowerCase();
    if (text.indexOf("cart") === -1 && node.tagName.toLowerCase().indexOf("cart") === -1) return false;
    if (node.getAttribute("aria-hidden") === "false") return true;
    if (node.hasAttribute("open")) return true;
    return /\b(active|open|is-open|drawer--is-open|animate)\b/.test(text);
  }

  function watchNativeDrawer() {
    if (!window.MutationObserver) return;
    var observer = new MutationObserver(function (mutations) {
      if (!state.ready || state.config.enabled === false || state.open) return;
      for (var i = 0; i < mutations.length; i += 1) {
        var target = mutations[i].target;
        if (nativeDrawerLooksOpen(target)) {
          scheduleOpenAfterCartMutation();
          return;
        }
        for (var j = 0; j < mutations[i].addedNodes.length; j += 1) {
          var node = mutations[i].addedNodes[j];
          if (nativeDrawerLooksOpen(node)) {
            scheduleOpenAfterCartMutation();
            return;
          }
        }
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "open", "aria-hidden", "style"],
      childList: true,
      subtree: true
    });
  }

  window.LavocCartDrawer = {
    open: openDrawer,
    close: closeDrawer,
    refresh: refreshCart
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
      watchNativeDrawer();
    })
    .catch(function (error) {
      console.error("[LavocDerma Cart Drawer]", error);
    });
})();
