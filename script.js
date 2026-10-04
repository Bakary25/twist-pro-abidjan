// ============================================
// TWIST PRO ABIDJAN — script.js
// ============================================
// Le catalogue est chargé depuis Supabase (table `products`).
// Ton ami gère les produits depuis le dashboard — plus besoin
// de toucher au code pour ajouter/retirer un article ou changer un prix.

const state = {
  products: [],
  loading: true,
  activeCategory: "tous",
  searchTerm: "",
  cart: JSON.parse(localStorage.getItem("tpa_cart") || "[]")
};

// ----------------------------------------------
// Sécurité : échapper le texte avant de l'insérer dans le HTML
// (empêche quelqu'un d'injecter du code via un champ texte)
// ----------------------------------------------
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ----------------------------------------------
// Utilitaires
// ----------------------------------------------
function formatFCFA(amount) {
  return amount.toLocaleString("fr-FR").replace(/,/g, " ") + " FCFA";
}

function saveCart() {
  localStorage.setItem("tpa_cart", JSON.stringify(state.cart));
  updateCartCount();
  renderCart();
}

function updateCartCount() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById("cartCount").textContent = count;
}

function cartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function qtyInCart(productId) {
  const item = state.cart.find(i => i.id === productId);
  return item ? item.quantity : 0;
}

// ----------------------------------------------
// Chargement des catégories (pastilles de filtre)
// ----------------------------------------------
async function loadCategoryPills() {
  const { data, error } = await supabaseClient.from("categories").select("*").order("name");
  if (error || !data) {
    console.error(error);
    return;
  }

  const container = document.getElementById("categoryPills");
  const extraPills = data.map(c =>
    `<button class="category-pill" data-cat="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</button>`
  ).join("");

  container.insertAdjacentHTML("beforeend", extraPills);
  initCategoryFilter();
}

// ----------------------------------------------
// Chargement des produits depuis Supabase
// ----------------------------------------------
async function loadProducts() {
  const grid = document.getElementById("productsGrid");
  grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;opacity:0.6;padding:40px 0;">Chargement du catalogue...</p>`;

  const { data, error } = await supabaseClient
    .from("products")
    .select("*, categories(slug)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;opacity:0.6;padding:40px 0;">Impossible de charger le catalogue pour l'instant.</p>`;
    return;
  }

  const FALLBACK_IMAGE = "https://placehold.co/500x500?text=Twist+Pro";

  state.products = data.map(p => {
    const rawImage = (p.images && p.images.length > 0) ? p.images[0] : "";
    // Défense en profondeur : n'injecte jamais une URL d'image qui ne soit pas https://
    // (empêche un schéma javascript:/data: stocké en base de s'exécuter côté client).
    const image = typeof rawImage === "string" && rawImage.startsWith("https://")
      ? rawImage
      : FALLBACK_IMAGE;

    return {
      id: p.id,
      name: p.name,
      price: p.price,
      comparePrice: p.compare_price,
      stock: p.stock,
      category: p.categories ? p.categories.slug : null,
      image
    };
  });

  state.loading = false;
  reconcileCart();
  renderProducts();
}

// ----------------------------------------------
// Purge du panier : retire les articles désactivés/épuisés entre-temps,
// plafonne les quantités au stock actuel (le serveur revalide de toute
// façon à la commande, mais on évite de laisser le client bloqué avec
// un panier qu'il ne peut plus valider sans savoir pourquoi)
// ----------------------------------------------
function reconcileCart() {
  let changed = false;
  const nextCart = [];

  state.cart.forEach(item => {
    const product = state.products.find(p => p.id === item.id);
    if (!product || product.stock <= 0) {
      changed = true;
      return;
    }
    if (item.quantity > product.stock) {
      changed = true;
      nextCart.push({ ...item, quantity: product.stock });
    } else {
      nextCart.push(item);
    }
  });

  const notice = document.getElementById("cartNotice");
  if (changed) {
    state.cart = nextCart;
    saveCart();
    if (notice) {
      notice.textContent = "Ton panier a été mis à jour : un ou plusieurs articles n'étaient plus disponibles dans la quantité demandée.";
      notice.style.display = "block";
    }
  } else if (notice) {
    notice.style.display = "none";
  }
}

// ----------------------------------------------
// Stepper quantité (sur les cartes produits)
// ----------------------------------------------
function stepQty(productId, delta) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  const existing = state.cart.find(item => item.id === productId);
  const currentQty = existing ? existing.quantity : 0;
  const nextQty = currentQty + delta;

  if (nextQty <= 0) {
    state.cart = state.cart.filter(i => i.id !== productId);
  } else if (existing) {
    existing.quantity = Math.min(nextQty, product.stock);
  } else {
    state.cart.push({ id: product.id, name: product.name, price: product.price, quantity: 1 });
  }

  saveCart();
  renderProducts();
}

// ----------------------------------------------
// Catalogue produits
// ----------------------------------------------
function getFilteredProducts() {
  return state.products.filter(p => {
    const matchesCategory = state.activeCategory === "tous" || p.category === state.activeCategory;
    const matchesSearch = p.name.toLowerCase().includes(state.searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });
}

function renderProducts() {
  const grid = document.getElementById("productsGrid");
  const filtered = getFilteredProducts();

  if (filtered.length === 0) {
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;opacity:0.6;padding:40px 0;">Aucun produit trouvé.</p>`;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const qty = qtyInCart(p.id);
    const isOut = p.stock === 0;

    const stockBadge = isOut
      ? `<span class="stock-badge out">Épuisé</span>`
      : p.stock <= 5
        ? `<span class="stock-badge low">Plus que ${p.stock}</span>`
        : "";

    const promoBadge = p.comparePrice ? `<span class="promo-badge">Promo</span>` : "";

    const priceRow = p.comparePrice
      ? `<span class="product-price-old">${formatFCFA(p.comparePrice)}</span><span class="product-price">${formatFCFA(p.price)}</span>`
      : `<span class="product-price">${formatFCFA(p.price)}</span>`;

    const action = isOut
      ? `<button class="out-of-stock-btn" disabled>Épuisé</button>`
      : `<div class="qty-stepper">
           <button data-action="step-qty" data-id="${escapeHtml(p.id)}" data-delta="-1" aria-label="Retirer">−</button>
           <span class="qty-value">${qty}</span>
           <button data-action="step-qty" data-id="${escapeHtml(p.id)}" data-delta="1" aria-label="Ajouter">+</button>
         </div>`;

    return `
      <div class="product-card">
        <div class="product-image">
          <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy">
          ${promoBadge}
          ${stockBadge}
        </div>
        <div class="product-info">
          <div class="product-name">${escapeHtml(p.name)}</div>
          <div class="price-row">${priceRow}</div>
          ${action}
        </div>
      </div>
    `;
  }).join("");
}

// Délégation d'événements (pas d'attributs onclick inline → compatible CSP script-src sans 'unsafe-inline')
function handleProductGridClick(e) {
  const btn = e.target.closest('[data-action="step-qty"]');
  if (!btn) return;
  stepQty(btn.dataset.id, parseInt(btn.dataset.delta, 10));
}

function initCategoryFilter() {
  const pills = document.querySelectorAll(".category-pill");
  pills.forEach(pill => {
    pill.addEventListener("click", () => {
      pills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      state.activeCategory = pill.dataset.cat;
      state.searchTerm = "";
      renderProducts();
    });
  });
}

// ----------------------------------------------
// Menu / recherche
// ----------------------------------------------
function initNavDrawer() {
  const toggle = document.getElementById("menuToggle");
  const drawer = document.getElementById("navDrawer");
  toggle.addEventListener("click", () => drawer.classList.toggle("active"));
}

function initSearch() {
  const btn = document.getElementById("searchBtn");
  btn.addEventListener("click", () => {
    const term = prompt("Rechercher un produit :", state.searchTerm);
    if (term !== null) {
      state.searchTerm = term.trim();
      renderProducts();
    }
  });
}

// ----------------------------------------------
// Panneau panier
// ----------------------------------------------
function openCart() {
  document.getElementById("cartOverlay").classList.add("active");
  document.getElementById("cartPanel").classList.add("active");
  showCartView();
}

function closeCart() {
  document.getElementById("cartOverlay").classList.remove("active");
  document.getElementById("cartPanel").classList.remove("active");
}

function showCartView() {
  document.getElementById("cartView").style.display = "flex";
  document.getElementById("checkoutView").style.display = "none";
  document.getElementById("cartPanelTitle").textContent = "Ton panier";
}

function showCheckoutView() {
  if (state.cart.length === 0) return;
  document.getElementById("cartView").style.display = "none";
  document.getElementById("checkoutView").style.display = "flex";
  document.getElementById("cartPanelTitle").textContent = "Livraison";
}

function changeQty(productId, delta) {
  stepQty(productId, delta);
  renderCart();
}

function renderCart() {
  const container = document.getElementById("cartItems");
  const emptyMsg = document.getElementById("cartEmpty");

  if (state.cart.length === 0) {
    container.innerHTML = "";
    emptyMsg.style.display = "block";
  } else {
    emptyMsg.style.display = "none";
    container.innerHTML = state.cart.map(item => `
      <div class="cart-item">
        <div>
          <div class="cart-item-name">${escapeHtml(item.name)}</div>
          <div class="cart-item-price">${formatFCFA(item.price)}</div>
        </div>
        <div class="cart-item-qty">
          <button class="qty-btn" data-action="change-qty" data-id="${escapeHtml(item.id)}" data-delta="-1">−</button>
          <span>${item.quantity}</span>
          <button class="qty-btn" data-action="change-qty" data-id="${escapeHtml(item.id)}" data-delta="1">+</button>
        </div>
      </div>
    `).join("");
  }

  document.getElementById("cartTotal").textContent = formatFCFA(cartTotal());
}

function handleCartItemsClick(e) {
  const btn = e.target.closest('[data-action="change-qty"]');
  if (!btn) return;
  changeQty(btn.dataset.id, parseInt(btn.dataset.delta, 10));
}

// ----------------------------------------------
// Commande : enregistrement Supabase + WhatsApp
// ----------------------------------------------
function buildWhatsAppMessage(order) {
  const lines = state.cart.map(item =>
    `• ${item.name} x${item.quantity} — ${formatFCFA(item.price * item.quantity)}`
  );

  const message = [
    `Nouvelle commande Twist Pro Abidjan 🛍️`,
    ``,
    `Client : ${order.customer_name}`,
    `Téléphone : ${order.phone}`,
    `Commune : ${order.commune}`,
    `Adresse : ${order.address_details}`,
    ``,
    `Articles :`,
    ...lines,
    ``,
    `Total : ${formatFCFA(order.total)}`,
    `Paiement : Cash ou Mobile Money à la livraison`
  ].join("\n");

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

async function submitOrder(e) {
  e.preventDefault();

  const errorBox = document.getElementById("checkoutError");
  const submitBtn = document.getElementById("submitOrder");
  errorBox.style.display = "none";

  const customerInfo = {
    customer_name: document.getElementById("custName").value.trim(),
    phone: document.getElementById("custPhone").value.trim(),
    commune: document.getElementById("custCommune").value,
    address_details: document.getElementById("custAddress").value.trim()
  };

  const items = state.cart.map(item => ({
    product_id: item.id,
    quantity: item.quantity
  }));

  // Anti-spam : jeton Cloudflare Turnstile, vérifié côté serveur dans create_order()
  const turnstileToken = window.turnstile ? turnstile.getResponse() : "";
  if (!turnstileToken) {
    errorBox.textContent = "Merci de valider le contrôle anti-robot avant d'envoyer la commande.";
    errorBox.style.display = "block";
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Envoi en cours...";

  try {
    const { error: orderError } = await supabaseClient.rpc("create_order", {
      p_customer_name: customerInfo.customer_name,
      p_phone: customerInfo.phone,
      p_commune: customerInfo.commune,
      p_address_details: customerInfo.address_details,
      p_items: items,
      p_turnstile_token: turnstileToken
    });

    if (orderError) throw orderError;

    const waLink = buildWhatsAppMessage({ ...customerInfo, total: cartTotal() });
    state.cart = [];
    saveCart();
    await loadProducts();
    window.location.href = waLink;

  } catch (err) {
    console.error(err);
    // err.code === "P0001" : message métier levé volontairement par create_order()
    // (déjà rédigé en français pour le client). Les autres erreurs (réseau, panne
    // Supabase...) sont techniques : on affiche un message générique à la place.
    errorBox.textContent = err.code === "P0001" && err.message
      ? "Erreur : " + err.message
      : "Une erreur est survenue, réessaie dans un instant.";
    errorBox.style.display = "block";
    submitBtn.disabled = false;
    submitBtn.textContent = "Valider ma commande";
    // Un jeton Turnstile est à usage unique : on réinitialise le widget pour permettre un nouvel essai
    if (window.turnstile) turnstile.reset();
  }
}

// ----------------------------------------------
// Init
// ----------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  loadProducts();
  loadCategoryPills();
  initNavDrawer();
  initSearch();
  updateCartCount();
  renderCart();

  document.getElementById("cartBtn").addEventListener("click", openCart);
  document.getElementById("cartClose").addEventListener("click", closeCart);
  document.getElementById("cartOverlay").addEventListener("click", closeCart);
  document.getElementById("goToCheckout").addEventListener("click", showCheckoutView);
  document.getElementById("checkoutBack").addEventListener("click", showCartView);
  document.getElementById("checkoutView").addEventListener("submit", submitOrder);

  document.getElementById("productsGrid").addEventListener("click", handleProductGridClick);
  document.getElementById("cartItems").addEventListener("click", handleCartItemsClick);
});
