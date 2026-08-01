// ============================================
// TWIST PRO ABIDJAN — dashboard.js
// ============================================

let allOrders = [];

function formatFCFA(amount) {
  return amount.toLocaleString("fr-FR").replace(/,/g, " ") + " FCFA";
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

const STATUS_LABELS = {
  en_attente: "En attente",
  confirmee: "Confirmée",
  expediee: "Expédiée",
  livree: "Livrée",
  annulee: "Annulée"
};

// ----------------------------------------------
// Auth
// ----------------------------------------------
async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    showDashboard();
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("dashboard").style.display = "none";
}

function showDashboard() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("dashboard").style.display = "block";
  loadOrders();
  loadCategories();
  loadProducts();
}

async function handleLogin(e) {
  e.preventDefault();
  const errorBox = document.getElementById("loginError");
  errorBox.style.display = "none";

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    errorBox.textContent = "Email ou mot de passe incorrect.";
    errorBox.style.display = "block";
    return;
  }

  showDashboard();
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  showLogin();
}

// ----------------------------------------------
// Commandes
// ----------------------------------------------
async function loadOrders() {
  const { data, error } = await supabaseClient
    .from("orders")
    .select("*, order_items(*)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  allOrders = data;
  renderStats();
  renderOrders();
}

function renderStats() {
  const total = allOrders.length;
  const revenue = allOrders
    .filter(o => o.status !== "annulee")
    .reduce((sum, o) => sum + o.total, 0);
  const enAttente = allOrders.filter(o => o.status === "en_attente").length;
  const livrees = allOrders.filter(o => o.status === "livree").length;

  document.getElementById("statsRow").innerHTML = `
    <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Commandes</div></div>
    <div class="stat-card"><div class="stat-value">${formatFCFA(revenue)}</div><div class="stat-label">Chiffre d'affaires</div></div>
    <div class="stat-card"><div class="stat-value">${enAttente}</div><div class="stat-label">En attente</div></div>
    <div class="stat-card"><div class="stat-value">${livrees}</div><div class="stat-label">Livrées</div></div>
  `;
}

function renderOrders() {
  const filter = document.getElementById("statusFilter").value;
  const orders = filter === "tous" ? allOrders : allOrders.filter(o => o.status === filter);

  const tbody = document.getElementById("ordersBody");
  const emptyMsg = document.getElementById("ordersEmpty");

  if (orders.length === 0) {
    tbody.innerHTML = "";
    emptyMsg.style.display = "block";
    return;
  }

  emptyMsg.style.display = "none";

  tbody.innerHTML = orders.map(order => `
    <tr>
      <td>${formatDate(order.created_at)}</td>
      <td>${order.customer_name}</td>
      <td>${order.phone}</td>
      <td>${order.commune}</td>
      <td class="order-items-list">
        ${order.order_items.map(item => `${item.product_name} x${item.quantity}`).join("<br>")}
      </td>
      <td>${formatFCFA(order.total)}</td>
      <td>
        <select class="status-select" onchange="updateStatus('${order.id}', this.value)">
          ${Object.entries(STATUS_LABELS).map(([value, label]) =>
            `<option value="${value}" ${order.status === value ? "selected" : ""}>${label}</option>`
          ).join("")}
        </select>
      </td>
    </tr>
  `).join("");
}

async function updateStatus(orderId, newStatus) {
  const { error } = await supabaseClient
    .from("orders")
    .update({ status: newStatus })
    .eq("id", orderId);

  if (error) {
    console.error(error);
    alert("Impossible de mettre à jour le statut.");
    return;
  }

  const order = allOrders.find(o => o.id === orderId);
  if (order) order.status = newStatus;
  renderStats();
}

// ----------------------------------------------
// Produits
// ----------------------------------------------
let allProducts = [];
let allCategories = [];

async function loadCategories() {
  const { data, error } = await supabaseClient.from("categories").select("*").order("name");
  if (error) {
    console.error(error);
    return;
  }
  allCategories = data;

  const select = document.getElementById("productCategory");
  select.innerHTML = allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join("");

  renderCategoriesList();
}

function renderCategoriesList() {
  const list = document.getElementById("categoriesList");
  if (allCategories.length === 0) {
    list.innerHTML = `<p style="opacity:0.6;font-size:0.9rem;">Aucune catégorie pour le moment.</p>`;
    return;
  }

  list.innerHTML = allCategories.map(c => `
    <div class="category-chip">
      ${c.name}
      <button onclick="deleteCategory('${c.id}')" aria-label="Supprimer">✕</button>
    </div>
  `).join("");
}

async function addCategory(e) {
  e.preventDefault();
  const errorBox = document.getElementById("categoryFormError");
  errorBox.style.display = "none";

  const nameInput = document.getElementById("newCategoryName");
  const name = nameInput.value.trim();
  const slug = name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // retire les accents
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const { error } = await supabaseClient.from("categories").insert({ name, slug });

  if (error) {
    errorBox.textContent = "Impossible d'ajouter cette catégorie (elle existe peut-être déjà).";
    errorBox.style.display = "block";
    return;
  }

  nameInput.value = "";
  await loadCategories();
}

async function deleteCategory(categoryId) {
  if (!confirm("Supprimer cette catégorie ? Les produits qui l'utilisent resteront, mais sans catégorie.")) return;

  const { error } = await supabaseClient.from("categories").delete().eq("id", categoryId);
  if (error) {
    console.error(error);
    alert("Impossible de supprimer cette catégorie.");
    return;
  }

  await loadCategories();
  await loadProducts();
}

async function loadProducts() {
  const { data, error } = await supabaseClient
    .from("products")
    .select("*, categories(name)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  allProducts = data;
  renderProductsTable();
}

function renderProductsTable() {
  const tbody = document.getElementById("productsBody");
  const emptyMsg = document.getElementById("productsEmpty");

  if (allProducts.length === 0) {
    tbody.innerHTML = "";
    emptyMsg.style.display = "block";
    return;
  }

  emptyMsg.style.display = "none";

  tbody.innerHTML = allProducts.map(p => `
    <tr>
      <td><img class="product-thumb" src="${(p.images && p.images[0]) || 'https://placehold.co/100x100?text=?'}" alt=""></td>
      <td>${p.name}</td>
      <td>${p.categories ? p.categories.name : "—"}</td>
      <td>${formatFCFA(p.price)}</td>
      <td>${p.compare_price ? formatFCFA(p.compare_price) : "—"}</td>
      <td>${p.stock}</td>
      <td>
        <div class="row-actions">
          <button onclick="openProductForm('${p.id}')">Modifier</button>
          <button class="delete-btn" onclick="deleteProduct('${p.id}')">Supprimer</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function openProductForm(productId = null) {
  const overlay = document.getElementById("productModalOverlay");
  const form = document.getElementById("productForm");
  const title = document.getElementById("productModalTitle");
  const errorBox = document.getElementById("productFormError");
  errorBox.style.display = "none";
  form.reset();

  if (productId) {
    const product = allProducts.find(p => p.id === productId);
    title.textContent = "Modifier le produit";
    document.getElementById("productId").value = product.id;
    document.getElementById("productName").value = product.name;
    document.getElementById("productCategory").value = product.category_id || "";
    document.getElementById("productPrice").value = product.price;
    document.getElementById("productComparePrice").value = product.compare_price || "";
    document.getElementById("productStock").value = product.stock;
    const existingImage = (product.images && product.images[0]) || "";
    document.getElementById("productImageExisting").value = existingImage;
    const preview = document.getElementById("productImagePreview");
    if (existingImage) {
      preview.src = existingImage;
      preview.style.display = "block";
    } else {
      preview.style.display = "none";
    }
  } else {
    title.textContent = "Ajouter un produit";
    document.getElementById("productId").value = "";
    document.getElementById("productImageExisting").value = "";
    document.getElementById("productImagePreview").style.display = "none";
  }

  overlay.classList.add("active");
}

function closeProductForm() {
  document.getElementById("productModalOverlay").classList.remove("active");
}

async function uploadProductImage(file) {
  const fileExt = file.name.split(".").pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

  const { error } = await supabaseClient.storage
    .from("product-images")
    .upload(fileName, file);

  if (error) throw error;

  const { data } = supabaseClient.storage
    .from("product-images")
    .getPublicUrl(fileName);

  return data.publicUrl;
}

async function submitProductForm(e) {
  e.preventDefault();

  const errorBox = document.getElementById("productFormError");
  const saveBtn = document.getElementById("saveProductBtn");
  errorBox.style.display = "none";

  const id = document.getElementById("productId").value;
  const name = document.getElementById("productName").value.trim();
  const fileInput = document.getElementById("productImageFile");
  const existingImage = document.getElementById("productImageExisting").value;

  saveBtn.disabled = true;
  saveBtn.textContent = "Enregistrement...";

  try {
    let imageUrl = existingImage;

    if (fileInput.files && fileInput.files[0]) {
      saveBtn.textContent = "Envoi de la photo...";
      imageUrl = await uploadProductImage(fileInput.files[0]);
    }

    const payload = {
      name,
      slug: name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now(),
      category_id: document.getElementById("productCategory").value,
      price: parseInt(document.getElementById("productPrice").value, 10),
      compare_price: document.getElementById("productComparePrice").value
        ? parseInt(document.getElementById("productComparePrice").value, 10)
        : null,
      stock: parseInt(document.getElementById("productStock").value, 10),
      images: imageUrl ? [imageUrl] : []
    };

    saveBtn.textContent = "Enregistrement...";

    let error;
    if (id) {
      delete payload.slug;
      ({ error } = await supabaseClient.from("products").update(payload).eq("id", id));
    } else {
      ({ error } = await supabaseClient.from("products").insert(payload));
    }

    if (error) throw error;

    closeProductForm();
    await loadProducts();

  } catch (err) {
    console.error(err);
    errorBox.textContent = "Erreur lors de l'enregistrement. Vérifie les champs et réessaie.";
    errorBox.style.display = "block";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Enregistrer";
  }
}

async function deleteProduct(productId) {
  if (!confirm("Supprimer ce produit définitivement ?")) return;

  const { error } = await supabaseClient.from("products").delete().eq("id", productId);
  if (error) {
    console.error(error);
    alert("Impossible de supprimer ce produit.");
    return;
  }

  await loadProducts();
}

// ----------------------------------------------
// Init
// ----------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  checkSession();
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  document.getElementById("statusFilter").addEventListener("change", renderOrders);

  document.getElementById("addProductBtn").addEventListener("click", () => openProductForm());
  document.getElementById("cancelProductBtn").addEventListener("click", closeProductForm);
  document.getElementById("productModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "productModalOverlay") closeProductForm();
  });
  document.getElementById("productForm").addEventListener("submit", submitProductForm);
  document.getElementById("categoryForm").addEventListener("submit", addCategory);

  document.getElementById("productImageFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    const preview = document.getElementById("productImagePreview");
    if (file) {
      preview.src = URL.createObjectURL(file);
      preview.style.display = "block";
    }
  });
});
