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
    `<button class="category-pill" data-cat="${c.slug}">${c.name}</button>`
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

  state.products = data.map(p => ({
    id: p.id,
    name: p.name,
    price: p.price,
    comparePrice: p.compare_price,
    stock: p.stock,
    category: p.categories ? p.categories.slug : null,
    image: (p.images && p.images.length > 0) ? p.images[0] : "https://placehold.co/500x500?text=Twist+Pro"
  }));

  state.loading = false;
  renderProducts();
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
           <button onclick="stepQty('${p.id}', -1)" aria-label="Retirer">−</button>
           <span class="qty-value">${qty}</span>
           <button onclick="stepQty('${p.id}', 1)" aria-label="Ajouter">+</button>
         </div>`;

    return `
      <div class="product-card">
        <div class="product-image">
          <img src="${p.image}" alt="${p.name}" loading="lazy">
          ${promoBadge}
          ${stockBadge}
        </div>
        <div class="product-info">
          <div class="product-name">${p.name}</div>
          <div class="price-row">${priceRow}</div>
          ${action}
        </div>
      </div>
    `;
  }).join("");
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
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">${formatFCFA(item.price)}</div>
        </div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="changeQty('${item.id}', -1)">−</button>
          <span>${item.quantity}</span>
          <button class="qty-btn" onclick="changeQty('${item.id}', 1)">+</button>
        </div>
      </div>
    `).join("");
  }

  document.getElementById("cartTotal").textContent = formatFCFA(cartTotal());
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

  const order = {
    customer_name: document.getElementById("custName").value.trim(),
    phone: document.getElementById("custPhone").value.trim(),
    commune: document.getElementById("custCommune").value,
    address_details: document.getElementById("custAddress").value.trim(),
    payment_method: "cash_ou_mobile_livraison",
    status: "en_attente",
    total: cartTotal()
  };

  submitBtn.disabled = true;
  submitBtn.textContent = "Envoi en cours...";

  try {
    const { data: orderRow, error: orderError } = await supabaseClient
      .from("orders")
      .insert(order)
      .select()
      .single();

    if (orderError) throw orderError;

    const items = state.cart.map(item => ({
      order_id: orderRow.id,
      product_id: item.id,
      product_name: item.name,
      unit_price: item.price,
      quantity: item.quantity
    }));

    const { error: itemsError } = await supabaseClient.from("order_items").insert(items);
    if (itemsError) throw itemsError;

    const waLink = buildWhatsAppMessage(order);
    state.cart = [];
    saveCart();
    window.location.href = waLink;

  } catch (err) {
    console.error(err);
    errorBox.textContent = "Erreur : " + (err.message || JSON.stringify(err));
    errorBox.style.display = "block";
    submitBtn.disabled = false;
    submitBtn.textContent = "Valider ma commande";
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
});
