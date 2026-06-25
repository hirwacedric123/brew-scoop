/**
 * Brew & Scoop Stock Management — Frontend
 */

const state = {
  products: [],
  categories: [],
  cupInventory: null,
  dashboard: null,
  selectedProductId: null,
  deleteProductId: null,
  salesPreset: "today",
  salesFrom: null,
  salesTo: null,
  salesReport: null,
  selectedSalesDate: null,
  historySellerId: "",
  salesSellerId: "",
  sellers: [],
  cart: [],
  paymentMethod: null,
  posMode: false,
  users: [],
  deleteUserId: null,
  deleteCategoryId: null,
  currentUser: window.CURRENT_USER || null,
  sellerShift: null,
};

const VIEW_TITLES = {
  dashboard: "Dashboard",
  products: "Products",
  sell: "Point of Sale",
  restock: "Restock",
  history: "History",
  sales: "Sales Reports",
  admin: "Administration",
  reconcile: "My Shift",
};

function isSeller() {
  return state.currentUser?.role === "seller";
}

function canAccessView(viewId) {
  if (!isSeller()) return true;
  return viewId === "sell" || viewId === "reconcile";
}

const ROLE_LABELS = {
  admin: "Administrator",
  stock_manager: "Stock Manager",
  seller: "Seller",
};

function hasOpenShift() {
  return !!state.sellerShift?.has_open_shift;
}

const fmt = new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat("en-RW");

const PAYMENT_LABELS = { momo: "MoMo", cash: "Cash", visa: "Visa" };

const DEFAULT_CATEGORY_NAMES = ["Shared Cups", "Individuals"];

function isDefaultCategory(name) {
  return DEFAULT_CATEGORY_NAMES.some((n) => n.toLowerCase() === (name || "").toLowerCase());
}

function categoryStockTypeLabel(usesCupStock) {
  return usesCupStock
    ? '<span class="badge badge-category">Shared cups</span>'
    : '<span class="badge badge-stock ok">Individual</span>';
}

function paymentMethodLabel(method) {
  return PAYMENT_LABELS[method] || method || "—";
}

function sellerLabel(transaction) {
  return esc(transaction.seller_name || "—");
}

function clearPaymentMethod() {
  state.paymentMethod = null;
  document.querySelectorAll(".payment-chip").forEach((chip) => chip.classList.remove("active"));
}

function initPaymentMethods() {
  document.querySelectorAll(".payment-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".payment-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.paymentMethod = chip.dataset.method;
    });
  });
}

const UI_ICONS = {
  revenue: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  sales: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-6"/></svg>`,
  stock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  box: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-6"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
};

function emptyState(icon, title, message, compact = false) {
  if (compact) {
    return `<div class="empty-state empty-state-compact">
      <div class="empty-state-icon">${icon}</div>
      <div>
        <strong>${esc(title)}</strong>
        <p>${esc(message)}</p>
      </div>
    </div>`;
  }
  return `<div class="empty-state">
    <div class="empty-state-icon">${icon}</div>
    <strong>${esc(title)}</strong>
    <p>${esc(message)}</p>
  </div>`;
}

function statCard(cls, icon, label, value, sub, extraStyle = "", featured = false) {
  const featuredCls = featured ? " stat-card-featured" : "";
  return `<div class="stat-card ${cls}${featuredCls}"${extraStyle ? ` style="${extraStyle}"` : ""}>
    <div class="stat-icon">${icon}</div>
    <div class="stat-content">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      <div class="stat-sub">${sub}</div>
    </div>
  </div>`;
}

function productInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function productCell(name, sub) {
  return `<div class="product-cell">
    <div class="product-avatar">${esc(productInitials(name))}</div>
    <div class="product-cell-text">
      <strong>${esc(name)}</strong>
      <span>${sub}</span>
    </div>
  </div>`;
}

function categoryAccent(name) {
  const palette = ["#c4a574", "#6b8f71", "#5d4037", "#d4a03c", "#8b6f5c", "#7a9e7e", "#a67c52"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

// ── API ────────────────────────────────────────────────────────────────────

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    credentials: "same-origin",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Session expired");
  }
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

// ── Toast ──────────────────────────────────────────────────────────────────

function toast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Navigation ─────────────────────────────────────────────────────────────

function initNavigation() {
  document.querySelectorAll(".nav-item[data-view], .bottom-nav-item[data-view], [data-view].btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  document.getElementById("btn-menu-toggle")?.addEventListener("click", openMobileNav);
  document.getElementById("btn-more-nav")?.addEventListener("click", openMobileNav);
  document.getElementById("sidebar-overlay")?.addEventListener("click", closeMobileNav);

  document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
    btn.addEventListener("click", closeMobileNav);
  });

  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchAdminTab(btn.dataset.adminTab));
  });
}

function openMobileNav() {
  document.getElementById("sidebar")?.classList.add("open");
  document.getElementById("sidebar-overlay")?.removeAttribute("hidden");
}

function closeMobileNav() {
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("sidebar-overlay")?.setAttribute("hidden", "");
}

function switchView(viewId) {
  if (!canAccessView(viewId)) return;

  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
  document.querySelectorAll(".bottom-nav-item[data-view]").forEach((n) => n.classList.remove("active"));

  document.getElementById(`view-${viewId}`)?.classList.add("active");
  document.querySelector(`.nav-item[data-view="${viewId}"]`)?.classList.add("active");
  document.querySelector(`.bottom-nav-item[data-view="${viewId}"]`)?.classList.add("active");

  const mobileTitle = document.getElementById("mobile-view-title");
  if (mobileTitle) mobileTitle.textContent = VIEW_TITLES[viewId] || "Brew & Scoop";

  closeMobileNav();

  if (viewId === "dashboard") loadDashboard();
  if (viewId === "products") loadProducts();
  if (viewId === "sell") loadSellView();
  if (viewId === "restock") loadRestockView();
  if (viewId === "history") {
    loadSellers();
    loadHistory();
  }
  if (viewId === "sales") {
    loadSellers();
    loadSalesReports();
  }
  if (viewId === "admin") loadAdminView();
  if (viewId === "reconcile") loadReconcileView();
}

function switchAdminTab(tabId) {
  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.adminTab === tabId);
  });
  document.getElementById("admin-panel-team").hidden = tabId !== "team";
  document.getElementById("admin-panel-categories").hidden = tabId !== "categories";

  if (tabId === "team") loadUsers();
  if (tabId === "categories") loadCategoriesAdmin();
}

function loadAdminView() {
  if (!state.currentUser || state.currentUser.role !== "admin") return;
  const activeTab = document.querySelector(".admin-tab.active")?.dataset.adminTab || "team";
  switchAdminTab(activeTab);
}

// ── Skeleton loaders ───────────────────────────────────────────────────────

function showTableSkeleton(tbodyId, colCount, rowCount = 5) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = Array(rowCount)
    .fill(0)
    .map(
      () => `
    <tr class="skeleton-row">
      ${Array(colCount).fill('<td><div class="skeleton skeleton-text"></div></td>').join("")}
    </tr>`
    )
    .join("");
}

function showDashboardSkeleton() {
  document.getElementById("dashboard-stats").innerHTML = `
    <div class="stat-card stat-card-featured skeleton-stat">
      <div class="skeleton skeleton-text sm"></div>
      <div class="skeleton skeleton-text lg"></div>
      <div class="skeleton skeleton-text sm"></div>
    </div>
    ${Array(4)
      .fill(0)
      .map(
        () => `
    <div class="stat-card skeleton-stat">
      <div class="skeleton skeleton-text sm"></div>
      <div class="skeleton skeleton-text lg"></div>
    </div>`
      )
      .join("")}`;
}

// ── Categories ─────────────────────────────────────────────────────────────

async function loadCategories() {
  try {
    state.categories = await api("/api/categories");
    populateCategorySelects();
  } catch (e) {
    toast(e.message, "error");
  }
}

function populateCategorySelects() {
  const categories = state.categories;
  const names = categories.map((c) => c.name);

  const filter = document.getElementById("product-category-filter");
  if (filter) {
    const current = filter.value;
    filter.innerHTML =
      '<option value="">All Categories</option>' +
      names.map((n) => `<option value="${escAttr(n)}">${esc(n)}</option>`).join("");
    if (names.includes(current)) filter.value = current;
  }

  const productCategory = document.getElementById("product-category");
  if (productCategory) {
    const current = productCategory.value;
    productCategory.innerHTML =
      '<option value="">Choose a category...</option>' +
      names.map((n) => `<option value="${escAttr(n)}">${esc(n)}</option>`).join("");
    if (names.includes(current)) productCategory.value = current;
  }

  const datalist = document.getElementById("product-name-suggestions");
  if (datalist) {
    const productNames = [...new Set(state.products.map((p) => p.name))];
    datalist.innerHTML = productNames
      .map((n) => `<option value="${escAttr(n)}"></option>`)
      .join("");
  }

  const productName = document.getElementById("product-name");
  if (productName) {
    productName.disabled = categories.length === 0;
    productName.placeholder = categories.length
      ? "Type a name or pick a suggestion"
      : "Add a category in Admin first";
  }
}

function syncCategoryFromProductName() {
  const name = document.getElementById("product-name")?.value.trim();
  const productCategory = document.getElementById("product-category");
  if (!name || !productCategory) return;

  const match = state.categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (match) productCategory.value = match.name;
}

// ── Dashboard ──────────────────────────────────────────────────────────────

async function loadDashboard() {
  showDashboardSkeleton();
  try {
    state.dashboard = await api("/api/dashboard");
    renderDashboard(state.dashboard);
  } catch (e) {
    toast(e.message, "error");
  }
}

function renderDashboard(d) {
  const todayLabel = d.today_date
    ? formatDateLabel(d.today_date)
    : "Today";

  document.getElementById("dashboard-stats").innerHTML = `
    ${statCard("revenue", UI_ICONS.revenue, "Sold Today", fmt.format(d.revenue_today), `${fmtNum.format(d.units_sold_today)} units · ${todayLabel}`, "", true)}
    ${statCard("sales", UI_ICONS.sales, "This Week", fmt.format(d.revenue_week), `${fmtNum.format(d.units_sold_week)} units`)}
    ${statCard("month", UI_ICONS.chart, "This Month", fmt.format(d.revenue_month), `${fmtNum.format(d.units_sold_month)} units`)}
    ${statCard("stock", UI_ICONS.stock, "Inventory", fmt.format(d.inventory_value), `${d.total_products} products`)}
    ${statCard("alert", UI_ICONS.alert, "Alerts", d.low_stock_count, `${d.out_of_stock_count} out of stock`)}
  `;

  const labelEl = document.getElementById("low-stock-label");
  if (labelEl) {
    labelEl.textContent = d.low_stock_count ? `${d.low_stock_count} need attention` : "All clear";
    labelEl.className = d.low_stock_count ? "status-pill status-pill-warn" : "status-pill status-pill-ok";
  }

  const lowList = document.getElementById("low-stock-list");
  const lowItems = [...d.low_stock_items];
  if (d.cup_inventory && ["low", "out"].includes(d.cup_inventory.stock_status)) {
    lowItems.unshift({
      id: "cups",
      name: "Serving Cups",
      category: "Shared inventory",
      quantity: d.cup_inventory.quantity,
      reorder_level: d.cup_inventory.reorder_level,
      stock_status: d.cup_inventory.stock_status,
      uses_cup_stock: true,
      is_cup_pool: true,
    });
  }

  if (!lowItems.length) {
    lowList.innerHTML = emptyState(UI_ICONS.check, "All stocked up", "Every product is above reorder level.", true);
  } else {
    lowList.innerHTML = lowItems
      .map(
        (p) => `
      <div class="alert-row">
        <div class="alert-row-info">
          <div class="product-avatar product-avatar-sm">${esc(productInitials(p.name))}</div>
          <div>
            <strong>${esc(p.name)}</strong>
            <span>${esc(p.category)}${p.is_cup_pool ? "" : ` · reorder at ${p.reorder_level}`}</span>
          </div>
        </div>
        <span class="badge badge-stock ${p.stock_status}">${p.is_cup_pool || p.uses_cup_stock ? `${p.quantity} cups` : `${p.quantity} left`}</span>
      </div>`
      )
      .join("");
  }

  const topList = document.getElementById("top-products-list");
  if (!d.top_products.filter((p) => p.units_sold > 0).length) {
    topList.innerHTML = emptyState(UI_ICONS.chart, "No sales yet", "Top sellers appear after your first sale.", true);
  } else {
    topList.innerHTML = d.top_products
      .map((p, i) => {
        const rankClass = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
        return `
        <div class="rank-item">
          <div class="rank-num ${rankClass}">${i + 1}</div>
          <div class="rank-info">
            <strong>${esc(p.name)}</strong>
            <span>${fmtNum.format(p.units_sold)} sold</span>
          </div>
          <div class="rank-revenue">${fmt.format(p.revenue)}</div>
        </div>`;
      })
      .join("");
  }

  const maxVal = Math.max(...d.categories.map((c) => c.value), 1);
  document.getElementById("category-breakdown").innerHTML = d.categories.length
    ? `<div class="category-bars">${d.categories
        .map(
          (c) => `
      <div class="category-bar-item">
        <div class="category-bar-header">
          <span class="category-bar-name">${esc(c.name)}</span>
          <span class="category-bar-meta">${fmt.format(c.value)} · ${c.total_qty} units</span>
        </div>
        <div class="category-bar-track">
          <div class="category-bar-fill" style="width:${(c.value / maxVal) * 100}%;--bar-color:${categoryAccent(c.name)}"></div>
        </div>
      </div>`
        )
        .join("")}</div>`
    : emptyState(UI_ICONS.box, "No products yet", "Add products to see category breakdown.", true);

  const recent = document.getElementById("recent-activity");
  if (!d.recent_transactions.length) {
    recent.innerHTML = emptyState(UI_ICONS.clock, "No activity yet", "Transactions will appear here.", true);
  } else {
    recent.innerHTML = `<div class="activity-feed">${d.recent_transactions
      .map(
        (t) => `
      <div class="activity-item">
        <div class="activity-dot ${t.type}"></div>
        <div class="activity-body">
          <strong>${esc(t.product_name)}</strong>
          <span>${formatDate(t.created_at)} · ${typeBadge(t.type)}</span>
        </div>
        <div class="activity-amount">
          ${t.type === "sale" ? fmt.format(t.total_amount) : `${t.quantity > 0 ? "+" : ""}${t.quantity} units`}
        </div>
      </div>`
      )
      .join("")}</div>`;
  }
}

// ── Products ───────────────────────────────────────────────────────────────

async function loadProducts() {
  const search = document.getElementById("product-search").value;
  const category = document.getElementById("product-category-filter").value;
  const lowStock = document.getElementById("low-stock-filter").checked;

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category) params.set("category", category);
  if (lowStock) params.set("low_stock", "1");

  showTableSkeleton("products-table-body", 6);

  try {
    state.products = await api(`/api/products?${params}`);
    renderProductsTable(state.products);
  } catch (e) {
    toast(e.message, "error");
  }
}

function renderProductsTable(products) {
  const tbody = document.getElementById("products-table-body");
  const countEl = document.getElementById("products-count");
  if (countEl) {
    countEl.innerHTML = products.length
      ? `<strong>${fmtNum.format(products.length)}</strong> product${products.length !== 1 ? "s" : ""}`
      : "No products";
  }

  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="6">${emptyState(UI_ICONS.box, "No products found", "Try adjusting your filters or add your first item.")}</td></tr>`;
    return;
  }

  tbody.innerHTML = products
    .map(
      (p) => `
    <tr>
      <td>
        ${productCell(p.name, p.uses_cup_stock ? "Uses cup stock" : esc(p.category))}
      </td>
      <td><span class="badge badge-category">${esc(p.category)}</span></td>
      <td>${fmt.format(p.price)}</td>
      <td><strong>${p.uses_cup_stock ? `${fmtNum.format(p.quantity)} cups` : fmtNum.format(p.quantity)}</strong></td>
      <td><span class="badge badge-stock ${p.stock_status}">${stockLabel(p)}</span></td>
      <td>
        <div class="action-group">
          <button class="btn-icon" title="Edit" onclick="openEditProduct(${p.id})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon" title="Sell" onclick="quickSell(${p.id})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          </button>
          <button class="btn-icon danger" title="Delete" onclick="openDeleteProduct(${p.id}, '${escAttr(p.name)}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`
    )
    .join("");
}

function categoryUsesCups(categoryName) {
  const category = state.categories.find(
    (c) => c.name.toLowerCase() === (categoryName || "").toLowerCase()
  );
  return category?.uses_cup_stock || false;
}

function stockLabel(p) {
  if (p.uses_cup_stock) {
    if (p.stock_status === "out") return "No cups";
    if (p.stock_status === "low") return "Low cups";
    return `${fmtNum.format(p.quantity)} cups`;
  }
  if (p.stock_status === "out") return "Out of stock";
  if (p.stock_status === "low") return "Low stock";
  return "In stock";
}

function availableStockLabel(p) {
  return p.uses_cup_stock ? `${p.quantity} cups` : `${p.quantity} left`;
}

function updateProductStockFields() {
  const categoryName = document.getElementById("product-category")?.value;
  const usesCups = categoryUsesCups(categoryName);
  const stockFields = document.getElementById("product-stock-fields");
  const cupHint = document.getElementById("product-cup-hint");

  if (stockFields) stockFields.hidden = usesCups;
  if (cupHint) cupHint.hidden = !usesCups;
}

function openAddProduct() {
  loadCategories()
    .then(() => api("/api/products"))
    .then((products) => {
      state.products = products;
      if (!state.categories.length) {
        toast("Add a category in Admin before creating products", "error");
        return;
      }

      document.getElementById("product-modal-title").textContent = "Add Product";
      document.getElementById("product-form").reset();
      document.getElementById("product-id").value = "";
      document.getElementById("product-quantity-label").textContent = "Initial Quantity";
      document.getElementById("product-reorder").value = "10";
      populateCategorySelects();
      showModal("product-modal");
    })
    .catch((e) => toast(e.message, "error"));
}

async function openEditProduct(id) {
  try {
    const p = await api(`/api/products/${id}`);
    document.getElementById("product-modal-title").textContent = "Edit Product";
    document.getElementById("product-id").value = p.id;
    populateCategorySelects();
    document.getElementById("product-name").value = p.name;
    document.getElementById("product-category").value = p.category;
    document.getElementById("product-price").value = p.price;
    document.getElementById("product-quantity").value = p.quantity;
    document.getElementById("product-quantity-label").textContent = "Stock Quantity";
    document.getElementById("product-reorder").value = p.reorder_level;
    document.getElementById("product-description").value = p.description;
    updateProductStockFields();
    showModal("product-modal");
  } catch (e) {
    toast(e.message, "error");
  }
}

function openDeleteProduct(id, name) {
  state.deleteProductId = id;
  document.getElementById("delete-product-name").textContent = name;
  showModal("delete-modal");
}

async function saveProduct(e) {
  e.preventDefault();
  const id = document.getElementById("product-id").value;
  const name = document.getElementById("product-name").value.trim();
  const category = document.getElementById("product-category").value;

  if (!name) {
    toast("Enter a product name", "error");
    return;
  }
  if (!category) {
    toast("Choose a category", "error");
    return;
  }

  const payload = {
    name,
    category,
    price: parseFloat(document.getElementById("product-price").value),
    reorder_level: parseInt(document.getElementById("product-reorder").value, 10),
    description: document.getElementById("product-description").value,
    quantity: parseInt(document.getElementById("product-quantity").value, 10) || 0,
  };

  try {
    if (id) {
      await api(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      toast("Product updated");
    } else {
      await api("/api/products", { method: "POST", body: JSON.stringify(payload) });
      toast("Product added");
    }
    hideModal("product-modal");
    loadProducts();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function confirmDelete() {
  try {
    await api(`/api/products/${state.deleteProductId}`, { method: "DELETE" });
    toast("Product deleted");
    hideModal("delete-modal");
    loadProducts();
  } catch (e) {
    toast(e.message, "error");
  }
}

// ── Sell / Cart ────────────────────────────────────────────────────────────

async function loadSellView() {
  try {
    if (isSeller()) {
      await refreshSellerShift();
    }
    const [products, cups] = await Promise.all([
      api("/api/products"),
      api("/api/cups"),
    ]);
    state.products = products;
    state.cupInventory = cups;
    populateProductSelects();
    renderQuickPick();
    syncCartWithStock();
    updateSellPreview();
    renderCart();
    updateSellShiftUi();
  } catch (e) {
    toast(e.message, "error");
  }
}

function updateSellShiftUi() {
  if (!isSeller()) return;

  const banner = document.getElementById("sell-shift-banner");
  const layout = document.getElementById("sell-layout");
  const checkoutBtn = document.getElementById("btn-complete-sale");
  const open = hasOpenShift();

  if (banner) banner.hidden = open;
  if (layout) layout.classList.toggle("sell-locked", !open);
  if (checkoutBtn) checkoutBtn.disabled = !open;
}

function togglePosMode() {
  state.posMode = !state.posMode;
  const sellView = document.getElementById("view-sell");
  const btn = document.getElementById("btn-pos-mode");
  const posBar = document.getElementById("pos-bar");
  const subtitle = document.getElementById("sell-subtitle");

  sellView?.classList.toggle("pos-mode", state.posMode);
  btn?.classList.toggle("active", state.posMode);
  if (posBar) posBar.hidden = !state.posMode;
  if (subtitle) {
    subtitle.textContent = state.posMode
      ? "Counter mode — larger tiles and keyboard shortcuts"
      : "Add items to the cart, then complete checkout in one step";
  }
}

function populateProductSelects() {
  const inStock = state.products.filter((p) => p.quantity > 0);
  const stockProducts = state.products.filter((p) => !p.uses_cup_stock);

  const sellSelect = document.getElementById("sell-product");
  sellSelect.innerHTML =
    '<option value="">Choose a product...</option>' +
    inStock
      .map((p) => {
        const stockText = p.uses_cup_stock ? `${p.quantity} cups` : `${p.quantity} in stock`;
        return `<option value="${p.id}">${esc(p.name)} — ${stockText}</option>`;
      })
      .join("");

  ["restock-product", "adjust-product"].forEach((id) => {
    const sel = document.getElementById(id);
    sel.innerHTML =
      '<option value="">Choose a product...</option>' +
      stockProducts
        .map((p) => `<option value="${p.id}">${esc(p.name)} (${p.quantity} units)</option>`)
        .join("");
  });
}

function initPosShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("view-sell")?.classList.contains("active")) return;

    if (e.key === "Escape" && state.cart.length) {
      e.preventDefault();
      clearCart();
      return;
    }

    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      if (document.activeElement?.tagName === "TEXTAREA") return;
      e.preventDefault();
      if (state.cart.length) completeCheckout();
    }
  });
}

function getCartCupDemand(excludeProductId = null) {
  return state.cart.reduce((total, item) => {
    if (excludeProductId && item.product_id === excludeProductId) return total;
    const product = state.products.find((p) => p.id === item.product_id);
    return total + (product?.uses_cup_stock ? item.quantity : 0);
  }, 0);
}

function getAvailableUnits(product, excludeProductId = null) {
  if (!product) return 0;
  if (product.uses_cup_stock) {
    const cupsInCart = getCartCupDemand(excludeProductId);
    return Math.max(product.quantity - cupsInCart, 0);
  }
  const inCart = state.cart.find((c) => c.product_id === product.id);
  return Math.max(product.quantity - (inCart?.quantity || 0), 0);
}

function syncCartWithStock() {
  state.cart = state.cart.filter((item) => {
    const product = state.products.find((p) => p.id === item.product_id);
    if (!product || product.quantity <= 0) return false;
    const available = getAvailableUnits(product, item.product_id) + item.quantity;
    if (available <= 0) return false;
    if (item.quantity > available) item.quantity = available;
    item.maxStock = available;
    item.price = product.price;
    item.name = product.name;
    item.category = product.category;
    item.uses_cup_stock = product.uses_cup_stock;
    return true;
  });
}

function cartQtyInCart(productId) {
  const item = state.cart.find((c) => c.product_id === productId);
  return item ? item.quantity : 0;
}

function renderQuickPick() {
  const grid = document.getElementById("quick-pick-grid");
  if (!state.products.length) {
    grid.innerHTML = emptyState(UI_ICONS.box, "No products", "Add products to start selling.");
    return;
  }

  grid.innerHTML = state.products
    .map((p) => {
      const inCart = cartQtyInCart(p.id);
      const available = getAvailableUnits(p);
      const disabled = p.quantity <= 0 || available <= 0;
      const accent = categoryAccent(p.category);
      return `
    <button type="button" class="quick-pick-item ${disabled ? "out-of-stock" : ""} ${inCart ? "in-cart" : ""}"
      style="--qp-accent: ${accent}"
      ${disabled ? "disabled" : `onclick="addToCart(${p.id}, 1)"`}>
      <strong>${esc(p.name)}</strong>
      <span>${esc(p.category)} · ${availableStockLabel({ ...p, quantity: available })}</span>
      <div class="qp-price">${fmt.format(p.price)}</div>
      ${inCart ? `<div class="qp-cart-badge">${inCart} in cart</div>` : ""}
    </button>`;
    })
    .join("");
}

function updateSellPreview() {
  const id = parseInt(document.getElementById("sell-product").value, 10);
  const preview = document.getElementById("sell-preview");
  const product = state.products.find((p) => p.id === id);

  if (!product) {
    preview.hidden = true;
    return;
  }

  preview.hidden = false;
  document.getElementById("preview-price").textContent = fmt.format(product.price);
  const available = getAvailableUnits(product);
  document.getElementById("preview-stock").textContent =
    available > 0
      ? `${available} ${product.uses_cup_stock ? "cups" : "units"} available`
      : "All in cart";
  document.getElementById("preview-category").textContent = product.category;

  const qtyInput = document.getElementById("sell-quantity");
  qtyInput.max = Math.max(available, 1);
  if (parseInt(qtyInput.value, 10) > available) {
    qtyInput.value = Math.max(available, 1);
  }
}

function adjustQty(delta) {
  const input = document.getElementById("sell-quantity");
  const max = parseInt(input.max, 10) || 9999;
  let val = (parseInt(input.value, 10) || 1) + delta;
  val = Math.max(1, Math.min(val, max));
  input.value = val;
}

function addToCart(productId, qty = null) {
  const product = state.products.find((p) => p.id === productId);
  if (!product || product.quantity <= 0) {
    toast(product?.uses_cup_stock ? "No cups left in stock" : "Product out of stock", "error");
    return;
  }

  const addQty = qty ?? (parseInt(document.getElementById("sell-quantity").value, 10) || 1);
  const existing = state.cart.find((c) => c.product_id === productId);
  const currentInCart = existing ? existing.quantity : 0;
  const available = getAvailableUnits(product);

  if (addQty > available) {
    toast(
      available > 0
        ? `Only ${available} more ${product.uses_cup_stock ? "cup(s)" : "unit(s)"} available for ${product.name}`
        : product.uses_cup_stock
          ? "No cups left for this sale"
          : `${product.name} is fully in the cart`,
      "error"
    );
    return;
  }

  if (existing) {
    existing.quantity += addQty;
    existing.uses_cup_stock = product.uses_cup_stock;
  } else {
    state.cart.push({
      product_id: productId,
      name: product.name,
      category: product.category,
      price: product.price,
      quantity: addQty,
      maxStock: available + addQty,
      uses_cup_stock: product.uses_cup_stock,
    });
  }

  renderCart();
  renderQuickPick();
  updateSellPreview();
  toast(`Added ${product.name}`);
}

function updateCartItemQty(productId, quantity) {
  if (quantity < 1) {
    removeFromCart(productId);
    return;
  }

  const item = state.cart.find((c) => c.product_id === productId);
  const product = state.products.find((p) => p.id === productId);
  if (!item || !product) return;

  quantity = Math.min(quantity, product.quantity);
  item.quantity = quantity;
  renderCart();
  renderQuickPick();
  updateSellPreview();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter((c) => c.product_id !== productId);
  renderCart();
  renderQuickPick();
  updateSellPreview();
}

function clearCart() {
  state.cart = [];
  clearPaymentMethod();
  document.getElementById("sell-notes").value = "";
  document.getElementById("add-to-cart-form").reset();
  document.getElementById("sell-quantity").value = "1";
  document.getElementById("sell-preview").hidden = true;
  renderCart();
  renderQuickPick();
}

function getCartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function renderCart() {
  const empty = document.getElementById("cart-empty");
  const list = document.getElementById("cart-items");
  const footer = document.getElementById("cart-footer");
  const countEl = document.getElementById("cart-item-count");
  const totalUnits = state.cart.reduce((sum, item) => sum + item.quantity, 0);

  if (!state.cart.length) {
    empty.hidden = false;
    list.hidden = true;
    footer.hidden = true;
    countEl.textContent = "0 items";
    return;
  }

  empty.hidden = true;
  list.hidden = false;
  footer.hidden = false;
  countEl.textContent = `${totalUnits} item${totalUnits !== 1 ? "s" : ""}`;
  document.getElementById("cart-total").textContent = fmt.format(getCartTotal());

  list.innerHTML = state.cart
    .map(
      (item) => `
    <div class="cart-item">
      <div class="cart-item-info">
        <strong>${esc(item.name)}</strong>
        <span>${esc(item.category)} · ${fmt.format(item.price)} each</span>
      </div>
      <div class="cart-item-actions">
        <div class="qty-input qty-input-sm">
          <button type="button" class="qty-btn" onclick="updateCartItemQty(${item.product_id}, ${item.quantity - 1})">−</button>
          <input type="number" value="${item.quantity}" min="1" max="${item.maxStock}"
            onchange="updateCartItemQty(${item.product_id}, parseInt(this.value, 10) || 1)">
          <button type="button" class="qty-btn" onclick="updateCartItemQty(${item.product_id}, ${item.quantity + 1})">+</button>
        </div>
        <div class="cart-line-total">${fmt.format(item.price * item.quantity)}</div>
        <button type="button" class="btn-icon danger" title="Remove" onclick="removeFromCart(${item.product_id})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>`
    )
    .join("");
}

function submitAddToCart(e) {
  e.preventDefault();
  const productId = parseInt(document.getElementById("sell-product").value, 10);
  if (!productId) {
    toast("Please select a product", "error");
    return;
  }
  addToCart(productId);
  document.getElementById("sell-product").value = "";
  document.getElementById("sell-quantity").value = "1";
  document.getElementById("sell-preview").hidden = true;
}

async function completeCheckout() {
  if (isSeller() && !hasOpenShift()) {
    toast("Start your shift before selling.", "error");
    switchView("reconcile");
    return;
  }

  if (!state.cart.length) {
    toast("Cart is empty", "error");
    return;
  }

  if (!state.paymentMethod) {
    toast("Select a payment method: MoMo, Cash, or Visa", "error");
    return;
  }

  const btn = document.getElementById("btn-complete-sale");
  btn.disabled = true;

  try {
    const result = await api("/api/sales/checkout", {
      method: "POST",
      body: JSON.stringify({
        items: state.cart.map((c) => ({
          product_id: c.product_id,
          quantity: c.quantity,
        })),
        notes: document.getElementById("sell-notes").value,
        payment_method: state.paymentMethod,
      }),
    });

    const itemsHtml = result.items
      .map(
        (item) => `
      <div class="checkout-line">
        <span>${esc(item.product.name)} × ${item.quantity_sold}</span>
        <strong>${fmt.format(item.total_amount)}</strong>
      </div>`
      )
      .join("");

    document.getElementById("sale-success-details").innerHTML = `
      <p class="checkout-ref"><span>Reference</span><strong>${esc(result.checkout_ref)}</strong></p>
      <p class="checkout-payment"><span>Payment</span><strong>${esc(result.payment_label || paymentMethodLabel(result.payment_method))}</strong></p>
      <div class="checkout-lines">${itemsHtml}</div>
      <p class="checkout-grand-total"><span>Total</span><strong>${fmt.format(result.total_amount)}</strong></p>
      <p><span>Items</span><strong>${result.total_units} units · ${result.line_count} products</strong></p>
    `;
    showModal("sale-success-modal");

    clearCart();
    await loadSellView();
    if (!isSeller()) loadDashboard();
  } catch (err) {
    toast(err.message, "error");
    await loadSellView();
  } finally {
    btn.disabled = false;
  }
}

function quickSell(id) {
  switchView("sell");
  setTimeout(() => addToCart(id, 1), 100);
}

// ── Seller shift management ─────────────────────────────────────────────────

const SHIFT_HERO_ICONS = {
  idle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  open: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
  closed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
};

let shiftTimerInterval = null;

async function refreshSellerShift() {
  if (!isSeller()) return null;
  state.sellerShift = await api("/api/seller/shift");
  return state.sellerShift;
}

function reconcileStatusLabel(status) {
  if (status === "balanced") return { text: "Balanced", cls: "balanced", icon: UI_ICONS.check };
  if (status === "over") return { text: "Over", cls: "over", icon: UI_ICONS.alert };
  return { text: "Short", cls: "short", icon: UI_ICONS.alert };
}

function formatShiftRange(shift) {
  const opened = formatDate(shift.opened_at);
  if (!shift.closed_at) return `Started ${opened}`;
  return `${opened} → ${formatDate(shift.closed_at)}`;
}

function formatShiftDuration(openedAt, long = false) {
  const start = new Date(openedAt.includes("T") ? openedAt : openedAt.replace(" ", "T"));
  if (Number.isNaN(start.getTime())) return "—";
  const mins = Math.floor((Date.now() - start.getTime()) / 60000);
  if (mins < 1) return long ? "Just started" : "0m";
  if (mins < 60) return long ? `${mins} min` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (long) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

function updateShiftDateBadge() {
  const el = document.getElementById("shift-date-badge");
  if (!el) return;
  const now = new Date();
  el.innerHTML = `${UI_ICONS.calendar}<span>${now.toLocaleDateString("en-RW", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })}</span>`;
}

function updateShiftHeroIcon(kind) {
  const iconEl = document.getElementById("shift-hero-icon");
  if (iconEl) iconEl.innerHTML = SHIFT_HERO_ICONS[kind] || SHIFT_HERO_ICONS.idle;
}

function stopShiftTimer() {
  if (shiftTimerInterval) {
    clearInterval(shiftTimerInterval);
    shiftTimerInterval = null;
  }
}

function startShiftTimer(openedAt) {
  stopShiftTimer();
  const aside = document.getElementById("shift-hero-aside");
  const timerEl = document.getElementById("shift-hero-timer");
  if (!aside || !timerEl) return;

  const tick = () => {
    timerEl.textContent = formatShiftDuration(openedAt);
    const metaDuration = document.getElementById("shift-meta-duration");
    if (metaDuration) metaDuration.textContent = formatShiftDuration(openedAt, true);
  };

  aside.hidden = false;
  tick();
  shiftTimerInterval = setInterval(tick, 30000);
}

function updateShiftHero(state, title, desc, badge, iconKind = "idle") {
  const hero = document.getElementById("shift-hero");
  const badgeEl = document.getElementById("shift-hero-badge");
  const titleEl = document.getElementById("shift-hero-title");
  const descEl = document.getElementById("shift-hero-desc");
  if (hero) hero.dataset.state = state;
  if (badgeEl) badgeEl.textContent = badge;
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
  updateShiftHeroIcon(iconKind);
  if (state !== "open") {
    stopShiftTimer();
    const aside = document.getElementById("shift-hero-aside");
    if (aside) aside.hidden = true;
  }
}

function setShiftPanelsMode(mode) {
  const panels = document.getElementById("shift-panels");
  if (!panels) return;
  panels.classList.remove("is-idle", "is-active", "is-closed");
  if (mode) panels.classList.add(mode);
}

function paymentBarWidth(amount, total) {
  if (!total || total <= 0) return 0;
  return Math.max(4, Math.round((amount / total) * 100));
}

function renderPaymentRow(label, amount, total, cls) {
  const width = paymentBarWidth(amount, total);
  return `
    <div class="shift-payment-row">
      <span class="shift-payment-dot ${cls}"></span>
      <span class="shift-payment-label">${label}</span>
      <strong>${fmt.format(amount)}</strong>
      <div class="shift-payment-bar-wrap">
        <div class="shift-payment-bar ${cls}" style="width: ${width}%"></div>
      </div>
    </div>
  `;
}

function updateShiftSteps(activeStep) {
  const steps = document.querySelectorAll(".shift-step");
  const order = ["start", "sell", "close"];
  const activeIdx = order.indexOf(activeStep);

  steps.forEach((step) => {
    const stepName = step.dataset.step;
    const idx = order.indexOf(stepName);
    step.classList.remove("is-active", "is-done");
    if (idx < activeIdx) step.classList.add("is-done");
    else if (idx === activeIdx) step.classList.add("is-active");
  });
}

function renderShiftSummary(shift, message) {
  const resultEl = document.getElementById("reconcile-result");
  if (!resultEl || !shift) return;

  const status = reconcileStatusLabel(shift.status_label || "balanced");
  const varianceAbs = fmt.format(Math.abs(shift.variance || 0));
  const expected = shift.expected_total ?? shift.expected_cash ?? shift.total_sales;
  const counted = shift.counted_total ?? shift.counted_cash;
  const varianceLine =
    shift.status_label === "balanced"
      ? "Your total matches what was recorded in the system for this shift."
      : shift.status_label === "over"
        ? `You entered ${varianceAbs} more than recorded.`
        : `You are short by ${varianceAbs} compared to what was recorded.`;

  const payTotal = (shift.cash_sales || 0) + (shift.momo_sales || 0) + (shift.visa_sales || 0);
  const varianceChip =
    shift.status_label === "balanced"
      ? "Totals match"
      : shift.status_label === "over"
        ? `+${varianceAbs}`
        : `−${varianceAbs}`;

  resultEl.innerHTML = `
    <div class="reconcile-summary">
      <div class="shift-result-layout">
        <div class="shift-result-hero ${status.cls}">
          <div class="shift-result-icon ${status.cls}">${status.icon}</div>
          <span class="shift-result-status ${status.cls}">${status.text}</span>
          <p class="shift-result-message">${esc(message || varianceLine)}</p>
          <p class="shift-range-label">${esc(formatShiftRange(shift))}</p>
          <span class="shift-variance-chip ${status.cls}">${esc(varianceChip)}</span>
        </div>
        <div class="shift-result-body">
          <div class="reconcile-grid">
            ${statCard("revenue", UI_ICONS.revenue, "Recorded here", fmt.format(shift.total_sales), "What the system logged")}
            ${statCard("sales", UI_ICONS.sales, "You entered", fmt.format(counted), "Your total (all payments)")}
            ${statCard("month", UI_ICONS.chart, "Difference", fmt.format(Math.abs(shift.variance || 0)), shift.status_label === "balanced" ? "No difference" : varianceLine)}
          </div>
          <div class="reconcile-payments">
            <h4>Recorded breakdown</h4>
            ${renderPaymentRow("Cash", shift.cash_sales, payTotal, "cash")}
            ${renderPaymentRow("MoMo", shift.momo_sales, payTotal, "momo")}
            ${renderPaymentRow("Visa", shift.visa_sales, payTotal, "visa")}
          </div>
        </div>
      </div>
      <p class="reconcile-closed-note">Shift closed — start a new one when you are ready to sell again.</p>
    </div>
  `;

  const heroState = `closed-${shift.status_label || "balanced"}`;
  updateShiftHero(
    heroState,
    status.text === "Balanced" ? "Shift closed — all good!" : `Shift closed — ${status.text.toLowerCase()}`,
    message || varianceLine,
    "Closed",
    "closed"
  );
  setShiftPanelsMode("is-closed");
  updateShiftSteps("close");
  document.querySelectorAll(".shift-step").forEach((s) => s.classList.add("is-done"));
}

function renderShiftView() {
  const startCard = document.getElementById("shift-start-card");
  const openCard = document.getElementById("shift-open-card");
  const closeCard = document.getElementById("shift-close-card");
  const resultCard = document.getElementById("shift-result-card");
  const openedLabel = document.getElementById("shift-opened-label");
  const activeMeta = document.getElementById("shift-active-meta");
  const cashInput = document.getElementById("reconcile-cash-amount");

  const data = state.sellerShift;
  const open = data?.has_open_shift;
  const closedShift = !open && (data?.shift?.status === "closed" ? data.shift : data?.last_closed);

  if (startCard) startCard.hidden = open || !!closedShift;
  if (openCard) openCard.hidden = !open;
  if (closeCard) closeCard.hidden = !open;
  if (resultCard) resultCard.hidden = !closedShift;

  if (open && data.shift) {
    const duration = formatShiftDuration(data.shift.opened_at, true);
    if (openedLabel) {
      openedLabel.textContent = `Started ${formatDate(data.shift.opened_at)}`;
    }
    if (activeMeta) {
      activeMeta.innerHTML = `
        <div class="shift-meta-item is-live shift-meta-item-wide">
          <span>Elapsed</span>
          <strong id="shift-meta-duration">${esc(duration)}</strong>
        </div>
      `;
    }
    if (cashInput) cashInput.value = "";
    updateShiftHero(
      "open",
      "Your shift is live",
      "Sell during your shift. When you finish, enter the total you collected (cash + MoMo + Visa) to check against the system.",
      "In progress",
      "open"
    );
    startShiftTimer(data.shift.opened_at);
    setShiftPanelsMode("is-active");
    updateShiftSteps("sell");
  } else if (closedShift && resultCard) {
    renderShiftSummary(closedShift);
  } else {
    updateShiftHero(
      "idle",
      "Ready to start your shift",
      "Tap start when you are at the counter. Sales stay hidden until you close and enter your total.",
      "Not started",
      "idle"
    );
    setShiftPanelsMode("is-idle");
    updateShiftSteps("start");
  }
}

async function loadReconcileView() {
  if (!isSeller()) return;

  updateShiftDateBadge();

  try {
    await refreshSellerShift();
    renderShiftView();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function submitStartShift(e) {
  e.preventDefault();
  if (!isSeller()) return;

  const btn = document.getElementById("btn-start-shift");
  btn.disabled = true;
  try {
    const data = await api("/api/seller/shift/start", {
      method: "POST",
      body: JSON.stringify({}),
    });
    state.sellerShift = data;
    toast(data.message || "Shift started");
    renderShiftView();
    updateSellShiftUi();
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function submitCloseShift(e) {
  e.preventDefault();
  if (!isSeller()) return;

  const input = document.getElementById("reconcile-cash-amount");
  const btn = document.getElementById("btn-reconcile");
  const countedCash = parseFloat(input?.value);

  if (Number.isNaN(countedCash) || countedCash < 0) {
    toast("Enter a valid total amount", "error");
    return;
  }

  btn.disabled = true;
  try {
    const data = await api("/api/seller/shift/close", {
      method: "POST",
      body: JSON.stringify({ counted_cash: countedCash }),
    });
    state.sellerShift = {
      has_open_shift: false,
      shift: data.shift,
      last_closed: data.shift,
    };
    renderShiftView();
    updateSellShiftUi();
    toast(data.message, data.shift.status_label === "balanced" ? "success" : "error");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

function showStartShiftForm() {
  state.sellerShift = { has_open_shift: false };
  const resultCard = document.getElementById("shift-result-card");
  if (resultCard) resultCard.hidden = true;
  renderShiftView();
  document.getElementById("btn-start-shift")?.focus();
}

function initShiftPresets() {
  document.querySelectorAll("#cash-presets .shift-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById("reconcile-cash-amount");
      if (input) input.value = btn.dataset.cash;
      document.querySelectorAll("#cash-presets .shift-preset").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });
}

// ── Restock ────────────────────────────────────────────────────────────────

async function loadRestockView() {
  try {
    const [products, cups] = await Promise.all([
      api("/api/products"),
      api("/api/cups"),
    ]);
    state.products = products;
    state.cupInventory = cups;
    populateProductSelects();
    renderCupRestock();
    renderRestockLowStock();
    updateRestockPreview();
    updateAdjustPreview();
  } catch (e) {
    toast(e.message, "error");
  }
}

function renderCupRestock() {
  const cups = state.cupInventory;
  if (!cups) return;

  const badge = document.getElementById("cup-stock-badge");
  if (badge) {
    badge.textContent = stockLabel({ ...cups, uses_cup_stock: true });
    badge.className = `badge badge-stock ${cups.stock_status}`;
  }

  document.getElementById("cup-preview-current").textContent = fmtNum.format(cups.quantity);
  updateCupRestockPreview();
}

function updateCupRestockPreview() {
  const cups = state.cupInventory;
  if (!cups) return;
  const qty = parseInt(document.getElementById("cup-restock-quantity")?.value, 10) || 0;
  document.getElementById("cup-preview-after").textContent = fmtNum.format(cups.quantity + qty);
}

async function submitCupRestock(e) {
  e.preventDefault();
  const quantity = parseInt(document.getElementById("cup-restock-quantity").value, 10);
  const notes = document.getElementById("cup-restock-notes").value;

  try {
    state.cupInventory = await api("/api/cups/restock", {
      method: "POST",
      body: JSON.stringify({ quantity, notes }),
    });
    toast(`Added ${quantity} cups`);
    document.getElementById("cup-restock-notes").value = "";
    renderCupRestock();
    renderRestockLowStock();
    await loadProducts();
  } catch (err) {
    toast(err.message, "error");
  }
}

function renderRestockLowStock() {
  const el = document.getElementById("restock-low-stock");
  if (!el) return;

  const low = state.products
    .filter((p) => !p.uses_cup_stock && (p.stock_status === "low" || p.stock_status === "out"))
    .sort((a, b) => a.quantity - b.quantity);

  const cupItems = [];
  if (state.cupInventory && ["low", "out"].includes(state.cupInventory.stock_status)) {
    cupItems.push({
      id: "cups",
      name: "Serving Cups",
      category: "Shared inventory",
      quantity: state.cupInventory.quantity,
      reorder_level: state.cupInventory.reorder_level,
      stock_status: state.cupInventory.stock_status,
      is_cup_pool: true,
    });
  }

  const allLow = [...cupItems, ...low];

  if (!allLow.length) {
    el.innerHTML = emptyState(UI_ICONS.check, "All stocked up", "No products need restocking right now.", true);
    return;
  }

  el.innerHTML = allLow
    .map(
      (p) => `
    <button type="button" class="restock-pick-item" onclick="${p.is_cup_pool ? "document.getElementById('cup-restock-quantity')?.focus()" : `selectRestockProduct(${p.id})`}">
      <div class="restock-pick-info">
        <div class="product-avatar product-avatar-sm">${esc(productInitials(p.name))}</div>
        <div>
          <strong>${esc(p.name)}</strong>
          <span>${esc(p.category)}${p.is_cup_pool ? "" : ` · reorder ${p.reorder_level}`}</span>
        </div>
      </div>
      <span class="badge badge-stock ${p.stock_status}">${p.is_cup_pool ? `${p.quantity} cups` : `${p.quantity} left`}</span>
    </button>`
    )
    .join("");
}

function selectRestockProduct(id) {
  document.getElementById("restock-product").value = String(id);
  updateRestockPreview();
  document.getElementById("restock-quantity")?.focus();
}

function updateRestockPreview() {
  const preview = document.getElementById("restock-preview");
  const id = parseInt(document.getElementById("restock-product")?.value, 10);
  const product = state.products.find((p) => p.id === id);

  if (!preview || !product) {
    if (preview) preview.hidden = true;
    return;
  }

  const qty = parseInt(document.getElementById("restock-quantity")?.value, 10) || 0;
  preview.hidden = false;
  document.getElementById("restock-preview-avatar").textContent = productInitials(product.name);
  document.getElementById("restock-preview-name").textContent = product.name;
  document.getElementById("restock-preview-meta").textContent = `${product.category} · ${fmt.format(product.price)} each`;
  document.getElementById("restock-preview-current").textContent = fmtNum.format(product.quantity);
  document.getElementById("restock-preview-after").textContent = fmtNum.format(product.quantity + qty);
}

function updateAdjustPreview() {
  const preview = document.getElementById("adjust-preview");
  const id = parseInt(document.getElementById("adjust-product")?.value, 10);
  const product = state.products.find((p) => p.id === id);

  if (!preview || !product) {
    if (preview) preview.hidden = true;
    return;
  }

  const newQty = parseInt(document.getElementById("adjust-quantity")?.value, 10);
  const hasNewQty = !Number.isNaN(newQty);
  preview.hidden = false;
  document.getElementById("adjust-preview-avatar").textContent = productInitials(product.name);
  document.getElementById("adjust-preview-name").textContent = product.name;
  document.getElementById("adjust-preview-meta").textContent = `${product.category} · ${fmt.format(product.price)} each`;
  document.getElementById("adjust-preview-current").textContent = fmtNum.format(product.quantity);
  document.getElementById("adjust-preview-new").textContent = hasNewQty ? fmtNum.format(newQty) : "—";

  const deltaEl = document.getElementById("adjust-delta");
  if (!deltaEl) return;

  if (!hasNewQty) {
    deltaEl.hidden = true;
    return;
  }

  const diff = newQty - product.quantity;
  deltaEl.hidden = false;
  if (diff > 0) {
    deltaEl.className = "adjust-delta positive";
    deltaEl.textContent = `+${diff} units`;
  } else if (diff < 0) {
    deltaEl.className = "adjust-delta negative";
    deltaEl.textContent = `${diff} units`;
  } else {
    deltaEl.className = "adjust-delta neutral";
    deltaEl.textContent = "No change";
  }
}

function adjustRestockQty(delta) {
  const input = document.getElementById("restock-quantity");
  if (!input) return;
  const next = Math.max(1, (parseInt(input.value, 10) || 1) + delta);
  input.value = String(next);
  updateRestockPreview();
}

async function submitRestock(e) {
  e.preventDefault();
  try {
    const result = await api("/api/restock", {
      method: "POST",
      body: JSON.stringify({
        product_id: parseInt(document.getElementById("restock-product").value, 10),
        quantity: parseInt(document.getElementById("restock-quantity").value, 10),
        notes: document.getElementById("restock-notes").value,
      }),
    });
    toast(`Restocked ${result.name} — now ${result.quantity} units`);
    document.getElementById("restock-form").reset();
    document.getElementById("restock-quantity").value = "10";
    document.getElementById("restock-preview").hidden = true;
    switchView("products");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function submitAdjust(e) {
  e.preventDefault();
  try {
    const result = await api("/api/adjust", {
      method: "POST",
      body: JSON.stringify({
        product_id: parseInt(document.getElementById("adjust-product").value, 10),
        new_quantity: parseInt(document.getElementById("adjust-quantity").value, 10),
        notes: document.getElementById("adjust-notes").value,
      }),
    });
    toast(`Stock updated — ${result.name} now has ${result.quantity} units`);
    document.getElementById("adjust-form").reset();
    loadRestockView();
  } catch (err) {
    toast(err.message, "error");
  }
}

document.getElementById("adjust-product")?.addEventListener("change", () => {
  const id = parseInt(document.getElementById("adjust-product").value, 10);
  const p = state.products.find((x) => x.id === id);
  if (p) document.getElementById("adjust-quantity").value = p.quantity;
  updateAdjustPreview();
});

document.getElementById("adjust-quantity")?.addEventListener("input", updateAdjustPreview);
document.getElementById("restock-product")?.addEventListener("change", updateRestockPreview);
document.getElementById("restock-quantity")?.addEventListener("input", updateRestockPreview);
document.getElementById("restock-qty-minus")?.addEventListener("click", () => adjustRestockQty(-1));
document.getElementById("restock-qty-plus")?.addEventListener("click", () => adjustRestockQty(1));

document.querySelectorAll(".qty-preset").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById("restock-quantity");
    if (!input) return;
    const add = parseInt(btn.dataset.qty, 10) || 0;
    input.value = String((parseInt(input.value, 10) || 0) + add);
    updateRestockPreview();
  });
});

// ── History ────────────────────────────────────────────────────────────────

async function loadSellers() {
  try {
    state.sellers = await api("/api/sellers");
    populateSellerFilter("history-seller-filter", state.historySellerId);
    populateSellerFilter("sales-seller-filter", state.salesSellerId);
  } catch {
    // Seller filters are optional if the request fails.
  }
}

function populateSellerFilter(selectId, selected = "") {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = selected || sel.value;
  sel.innerHTML =
    `<option value="">All Sellers</option>` +
    state.sellers
      .map(
        (s) =>
          `<option value="${s.id}"${String(s.id) === String(current) ? " selected" : ""}>${esc(s.display_name)}</option>`
      )
      .join("");
}

async function loadHistory() {
  const type = document.getElementById("history-type-filter").value;
  const sellerId = document.getElementById("history-seller-filter")?.value || "";
  state.historySellerId = sellerId;

  const params = new URLSearchParams({ limit: "100" });
  if (type) params.set("type", type);
  if (sellerId) params.set("user_id", sellerId);

  try {
    const transactions = await api(`/api/transactions?${params}`);
    renderHistory(transactions);
  } catch (e) {
    toast(e.message, "error");
  }
}

function renderHistory(transactions) {
  const tbody = document.getElementById("history-table-body");
  if (!transactions.length) {
    tbody.innerHTML = `<tr><td colspan="8">${emptyState(UI_ICONS.clock, "No transactions", "Sales, restocks, and adjustments will appear here.")}</td></tr>`;
    return;
  }

  tbody.innerHTML = transactions
    .map(
      (t) => `
    <tr>
      <td>${formatDate(t.created_at)}</td>
      <td>
        ${productCell(t.product_name, esc(t.category))}
      </td>
      <td>${typeBadge(t.type)}</td>
      <td>${formatTransactionQty(t)}</td>
      <td>${t.type === "sale" ? fmt.format(t.total_amount) : "—"}</td>
      <td>${t.type === "sale" ? paymentMethodLabel(t.payment_method) : "—"}</td>
      <td>${t.type === "sale" ? sellerLabel(t) : "—"}</td>
      <td style="color:var(--text-muted);font-size:0.82rem">${esc(t.notes || "—")}</td>
    </tr>`
    )
    .join("");
}

// ── Sales Reports ──────────────────────────────────────────────────────────

function initSalesReports() {
  document.querySelectorAll(".period-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".period-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.salesPreset = btn.dataset.preset;
      document.getElementById("custom-range-bar").hidden = state.salesPreset !== "custom";
      if (state.salesPreset !== "custom") {
        state.selectedSalesDate = null;
        loadSalesReports();
      }
    });
  });

  document.getElementById("btn-apply-range").addEventListener("click", () => {
    const from = document.getElementById("sales-from").value;
    const to = document.getElementById("sales-to").value;
    if (!from || !to) {
      toast("Please select both start and end dates", "error");
      return;
    }
    if (from > to) {
      toast("Start date must be before end date", "error");
      return;
    }
    state.selectedSalesDate = null;
    loadSalesReports(from, to);
  });
}

async function loadSalesReports(from, to) {
  try {
    const sellerId = document.getElementById("sales-seller-filter")?.value || "";
    state.salesSellerId = sellerId;

    let url = "/api/sales/report?";
    if (state.salesPreset === "custom" && from && to) {
      url += `from=${from}&to=${to}`;
    } else if (state.salesPreset !== "custom") {
      url += `preset=${state.salesPreset}`;
    } else {
      return;
    }
    if (sellerId) url += `&user_id=${encodeURIComponent(sellerId)}`;

    state.salesReport = await api(url);
    state.salesFrom = state.salesReport.from;
    state.salesTo = state.salesReport.to;
    renderSalesReport(state.salesReport);
  } catch (e) {
    toast(e.message, "error");
  }
}

function renderSalesReport(report) {
  const { summary, daily_breakdown, payment_breakdown, sales, from, to } = report;

  document.getElementById("sales-summary-stats").innerHTML = `
    ${statCard("revenue", UI_ICONS.revenue, "Total Revenue", fmt.format(summary.revenue), formatRangeLabel(from, to))}
    ${statCard("sales", UI_ICONS.sales, "Units Sold", fmtNum.format(summary.units), "items in this period")}
    ${statCard("stock", UI_ICONS.chart, "Transactions", fmtNum.format(summary.transactions), "sales recorded")}
    ${statCard("alert", UI_ICONS.calendar, "Active Days", daily_breakdown.length, "days with sales")}
  `;

  const payments = payment_breakdown || [];
  const breakdownEl = document.getElementById("sales-payment-breakdown");
  if (breakdownEl) {
    breakdownEl.innerHTML = `
      <h3 class="payment-breakdown-title">Revenue by Payment</h3>
      <div class="payment-breakdown-grid">
        ${payments
          .map(
            (p) => `
          <div class="payment-breakdown-card payment-${p.method}">
            <span class="payment-breakdown-label">${esc(p.label)}</span>
            <strong class="payment-breakdown-value">${fmt.format(p.revenue)}</strong>
            <span class="payment-breakdown-sub">${fmtNum.format(p.checkouts)} checkout${p.checkouts !== 1 ? "s" : ""}</span>
          </div>`
          )
          .join("")}
      </div>
    `;
  }

  document.getElementById("sales-range-label").textContent = formatRangeLabel(from, to);

  const datesList = document.getElementById("sales-dates-list");
  if (!daily_breakdown.length) {
    datesList.innerHTML = emptyState(UI_ICONS.chart, "No sales", "No sales recorded in this period.");
    renderSalesDetail([], null);
    return;
  }

  const maxRevenue = Math.max(...daily_breakdown.map((d) => d.revenue), 1);
  datesList.innerHTML = daily_breakdown
    .map(
      (day) => `
    <button type="button" class="sales-date-item ${state.selectedSalesDate === day.date ? "active" : ""}"
      onclick="selectSalesDate('${day.date}')">
      <div class="sales-date-info">
        <strong>${formatDateLabel(day.date)}</strong>
        <span>${fmtNum.format(day.transactions)} sale${day.transactions !== 1 ? "s" : ""} · ${fmtNum.format(day.units)} units</span>
      </div>
      <div class="sales-date-revenue">${fmt.format(day.revenue)}</div>
      <div class="sales-date-bar" style="width:${(day.revenue / maxRevenue) * 100}%"></div>
    </button>`
    )
    .join("");

  const detailSales = state.selectedSalesDate
    ? sales.filter((s) => s.sale_date === state.selectedSalesDate)
    : sales;
  const detailDate = state.selectedSalesDate || (from === to ? from : null);
  renderSalesDetail(detailSales, detailDate, from, to);
}

function renderSalesDetail(sales, date, from, to) {
  const title = document.getElementById("sales-detail-title");
  const subtitle = document.getElementById("sales-detail-subtitle");
  const tbody = document.getElementById("sales-detail-body");

  if (date) {
    title.textContent = `Sales on ${formatDateLabel(date)}`;
    subtitle.textContent = `${sales.length} transaction${sales.length !== 1 ? "s" : ""}`;
  } else if (from && to) {
    title.textContent = "All Sales in Period";
    subtitle.textContent = formatRangeLabel(from, to);
  } else {
    title.textContent = "Sales Detail";
    subtitle.textContent = "";
  }

  if (!sales.length) {
    tbody.innerHTML = `<tr><td colspan="6">${emptyState(UI_ICONS.sales, "No sales", "Select a date or adjust your date range.")}</td></tr>`;
    return;
  }

  tbody.innerHTML = sales
    .map(
      (s) => `
    <tr>
      <td>${formatTime(s.created_at)}</td>
      <td>
        ${productCell(s.product_name, esc(s.category))}
      </td>
      <td>${s.quantity}</td>
      <td><strong>${fmt.format(s.total_amount)}</strong></td>
      <td>${paymentMethodLabel(s.payment_method)}</td>
      <td>${sellerLabel(s)}</td>
    </tr>`
    )
    .join("");
}

function selectSalesDate(date) {
  state.selectedSalesDate = state.selectedSalesDate === date ? null : date;
  if (state.salesReport) {
    renderSalesReport(state.salesReport);
  }
}

// ── Admin: User Management ─────────────────────────────────────────────────

async function loadUsers() {
  if (!state.currentUser || state.currentUser.role !== "admin") return;

  showTableSkeleton("users-table-body", 5, 4);

  try {
    state.users = await api("/api/admin/users");
    renderUsersTable(state.users);
  } catch (e) {
    toast(e.message, "error");
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById("users-table-body");
  if (!tbody) return;

  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No users yet</td></tr>`;
    return;
  }

  tbody.innerHTML = users
    .map((u) => {
      const isSelf = state.currentUser && u.id === state.currentUser.id;
      const roleLabel = ROLE_LABELS[u.role] || u.role;
      const statusClass = u.is_active ? "ok" : "out";
      const statusLabel = u.is_active ? "Active" : "Inactive";

      return `
    <tr>
      <td><strong>${esc(u.display_name)}</strong></td>
      <td>${esc(u.username)}</td>
      <td><span class="badge badge-category">${roleLabel}</span></td>
      <td><span class="badge badge-stock ${statusClass}">${statusLabel}</span></td>
      <td>
        <div class="action-group">
          <button class="btn-icon" title="Edit" onclick="openEditUser(${u.id})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          ${
            isSelf
              ? ""
              : `<button class="btn-icon danger" title="Delete" onclick="openDeleteUser(${u.id}, '${escAttr(u.display_name)}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>`
          }
        </div>
      </td>
    </tr>`;
    })
    .join("");
}

function openAddUser() {
  document.getElementById("user-modal-title").textContent = "Add Stock Manager";
  document.getElementById("user-form").reset();
  document.getElementById("user-id").value = "";
  document.getElementById("user-username").disabled = false;
  document.getElementById("user-password").required = true;
  document.getElementById("user-password-group").hidden = false;
  document.getElementById("user-active-group").hidden = true;
  document.getElementById("user-role").value = "seller";
  showModal("user-modal");
}

function openEditUser(id) {
  const user = state.users.find((u) => u.id === id);
  if (!user) return;

  document.getElementById("user-modal-title").textContent = "Edit User";
  document.getElementById("user-id").value = user.id;
  document.getElementById("user-display-name-input").value = user.display_name;
  document.getElementById("user-username").value = user.username;
  document.getElementById("user-username").disabled = true;
  document.getElementById("user-password").value = "";
  document.getElementById("user-password").required = false;
  document.getElementById("user-password-group").hidden = false;
  document.getElementById("user-active-group").hidden = false;
  document.getElementById("user-role").value = user.role;
  document.getElementById("user-active").checked = user.is_active;
  showModal("user-modal");
}

function openDeleteUser(id, name) {
  state.deleteUserId = id;
  document.getElementById("delete-user-name").textContent = name;
  showModal("delete-user-modal");
}

async function saveUser(e) {
  e.preventDefault();
  const id = document.getElementById("user-id").value;
  const payload = {
    display_name: document.getElementById("user-display-name-input").value,
    role: document.getElementById("user-role").value,
  };

  const password = document.getElementById("user-password").value;
  if (password) payload.password = password;

  try {
    if (id) {
      payload.is_active = document.getElementById("user-active").checked;
      await api(`/api/admin/users/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      toast("User updated");
    } else {
      payload.username = document.getElementById("user-username").value;
      if (!password) {
        toast("Password is required for new users", "error");
        return;
      }
      await api("/api/admin/users", { method: "POST", body: JSON.stringify(payload) });
      toast("Stock manager created");
    }
    hideModal("user-modal");
    loadUsers();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function confirmDeleteUser() {
  try {
    await api(`/api/admin/users/${state.deleteUserId}`, { method: "DELETE" });
    toast("User deleted");
    hideModal("delete-user-modal");
    loadUsers();
  } catch (e) {
    toast(e.message, "error");
  }
}

// ── Admin: Category Management ─────────────────────────────────────────────

async function loadCategoriesAdmin() {
  if (!state.currentUser || state.currentUser.role !== "admin") return;

  showTableSkeleton("categories-table-body", 3, 5);

  try {
    state.categories = await api("/api/categories");
    renderCategoriesTable(state.categories);
    populateCategorySelects();
  } catch (e) {
    toast(e.message, "error");
  }
}

function renderCategoriesTable(categories) {
  const tbody = document.getElementById("categories-table-body");
  if (!tbody) return;

  if (!categories.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No categories yet</td></tr>`;
    return;
  }

  tbody.innerHTML = categories
    .map(
      (c) => `
    <tr>
      <td>
        <strong>${esc(c.name)}</strong>
        ${c.is_default ? '<span class="text-muted" style="font-size:0.75rem;margin-left:0.35rem">Default</span>' : ""}
      </td>
      <td>${fmtNum.format(c.product_count)}</td>
      <td>${categoryStockTypeLabel(c.uses_cup_stock)}</td>
      <td>
        <div class="action-group">
          <button class="btn-icon" title="Edit" onclick="openEditCategory(${c.id})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          ${
            c.is_default
              ? ""
              : `<button class="btn-icon danger" title="Delete" onclick="openDeleteCategory(${c.id}, '${escAttr(c.name)}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>`
          }
        </div>
      </td>
    </tr>`
    )
    .join("");
}

function openAddCategory() {
  document.getElementById("category-modal-title").textContent = "Add Category";
  document.getElementById("category-form").reset();
  document.getElementById("category-id").value = "";
  document.getElementById("category-uses-cups").checked = false;
  document.getElementById("category-uses-cups").disabled = false;
  document.getElementById("category-stock-hint").textContent =
    "Leave unchecked for individual per-product stock.";
  showModal("category-modal");
}

function openEditCategory(id) {
  const category = state.categories.find((c) => c.id === id);
  if (!category) return;

  const isDefault = category.is_default || isDefaultCategory(category.name);
  document.getElementById("category-modal-title").textContent = "Edit Category";
  document.getElementById("category-id").value = category.id;
  document.getElementById("category-name").value = category.name;
  document.getElementById("category-uses-cups").checked = !!category.uses_cup_stock;
  document.getElementById("category-uses-cups").disabled = isDefault;
  document.getElementById("category-stock-hint").textContent = isDefault
    ? "Stock type is fixed for default categories."
    : "Leave unchecked for individual per-product stock.";
  showModal("category-modal");
}

function openDeleteCategory(id, name) {
  state.deleteCategoryId = id;
  document.getElementById("delete-category-name").textContent = name;
  showModal("delete-category-modal");
}

async function saveCategory(e) {
  e.preventDefault();
  const id = document.getElementById("category-id").value;
  const payload = {
    name: document.getElementById("category-name").value.trim(),
    uses_cup_stock: document.getElementById("category-uses-cups").checked,
  };

  try {
    if (id) {
      await api(`/api/admin/categories/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      toast("Category updated");
    } else {
      await api("/api/admin/categories", { method: "POST", body: JSON.stringify(payload) });
      toast("Category added");
    }
    hideModal("category-modal");
    await loadCategoriesAdmin();
    await loadCategories();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function confirmDeleteCategory() {
  try {
    await api(`/api/admin/categories/${state.deleteCategoryId}`, { method: "DELETE" });
    toast("Category deleted");
    hideModal("delete-category-modal");
    await loadCategoriesAdmin();
    await loadCategories();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {
    // redirect regardless
  }
  window.location.href = "/login";
}

function formatDateLabel(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-RW", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRangeLabel(from, to) {
  if (from === to) return formatDateLabel(from);
  return `${formatDateLabel(from)} – ${formatDateLabel(to)}`;
}

function formatTime(iso) {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-RW", { hour: "2-digit", minute: "2-digit" });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function typeBadge(type) {
  const labels = { sale: "Sale", restock: "Restock", adjustment: "Adjustment" };
  return `<span class="badge badge-${type}">${labels[type] || type}</span>`;
}

function formatTransactionQty(t) {
  if (t.type === "sale") return `−${t.quantity}`;
  if (t.type === "adjustment") return `${t.quantity > 0 ? "+" : ""}${t.quantity}`;
  return `+${t.quantity}`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-RW", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function escAttr(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

function showModal(id) {
  document.getElementById(id).hidden = false;
}

function hideModal(id) {
  document.getElementById(id).hidden = true;
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  const dateEl = document.getElementById("current-date");
  if (dateEl) {
    dateEl.innerHTML = `${UI_ICONS.calendar}<span>${new Date().toLocaleDateString("en-RW", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })}</span>`;
  }

  initNavigation();
  initSalesReports();
  initPosShortcuts();
  initShiftPresets();

  if (isSeller()) {
    loadCategories().then(() => {
      refreshSellerShift().then(() => {
        loadSellView();
      });
    });
  } else {
    loadCategories().then(() => loadDashboard());
  }

  document.getElementById("btn-quick-add-product")?.addEventListener("click", () => {
    switchView("products");
    setTimeout(openAddProduct, 150);
  });

  document.getElementById("btn-add-product").addEventListener("click", openAddProduct);
  document.getElementById("product-form").addEventListener("submit", saveProduct);
  document.getElementById("confirm-delete").addEventListener("click", confirmDelete);

  const debouncedLoadProducts = debounce(loadProducts, 300);
  document.getElementById("product-search").addEventListener("input", () => {
    showTableSkeleton("products-table-body", 6);
    debouncedLoadProducts();
  });
  document.getElementById("product-category-filter").addEventListener("change", loadProducts);
  document.getElementById("low-stock-filter").addEventListener("change", loadProducts);
  document.getElementById("product-name")?.addEventListener("input", () => {
    syncCategoryFromProductName();
    updateProductStockFields();
  });
  document.getElementById("product-name")?.addEventListener("change", () => {
    syncCategoryFromProductName();
    updateProductStockFields();
  });
  document.getElementById("product-category")?.addEventListener("change", updateProductStockFields);

  document.getElementById("cup-restock-form")?.addEventListener("submit", submitCupRestock);
  document.getElementById("cup-restock-quantity")?.addEventListener("input", updateCupRestockPreview);
  document.getElementById("cup-qty-minus")?.addEventListener("click", () => {
    const input = document.getElementById("cup-restock-quantity");
    input.value = Math.max(1, (parseInt(input.value, 10) || 1) - 1);
    updateCupRestockPreview();
  });
  document.getElementById("cup-qty-plus")?.addEventListener("click", () => {
    const input = document.getElementById("cup-restock-quantity");
    input.value = (parseInt(input.value, 10) || 1) + 1;
    updateCupRestockPreview();
  });
  document.querySelectorAll(".cup-qty-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("cup-restock-quantity").value = btn.dataset.qty;
      updateCupRestockPreview();
    });
  });

  document.getElementById("btn-pos-mode")?.addEventListener("click", togglePosMode);

  document.getElementById("sell-product").addEventListener("change", updateSellPreview);
  document.getElementById("qty-minus").addEventListener("click", () => adjustQty(-1));
  document.getElementById("qty-plus").addEventListener("click", () => adjustQty(1));
  document.getElementById("add-to-cart-form").addEventListener("submit", submitAddToCart);
  initPaymentMethods();
  document.getElementById("btn-complete-sale").addEventListener("click", completeCheckout);
  document.getElementById("btn-clear-cart").addEventListener("click", clearCart);
  document.getElementById("shift-start-form")?.addEventListener("submit", submitStartShift);
  document.getElementById("shift-close-form")?.addEventListener("submit", submitCloseShift);
  document.getElementById("btn-new-shift")?.addEventListener("click", showStartShiftForm);

  document.getElementById("restock-form").addEventListener("submit", submitRestock);
  document.getElementById("adjust-form").addEventListener("submit", submitAdjust);

  document.getElementById("history-type-filter").addEventListener("change", loadHistory);
  document.getElementById("history-seller-filter")?.addEventListener("change", loadHistory);
  document.getElementById("sales-seller-filter")?.addEventListener("change", () => {
    const from = document.getElementById("sales-from")?.value;
    const to = document.getElementById("sales-to")?.value;
    loadSalesReports(from, to);
  });

  document.querySelectorAll("#history-filter-chips .filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#history-filter-chips .filter-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      document.getElementById("history-type-filter").value = chip.dataset.type;
      loadHistory();
    });
  });

  document.getElementById("btn-logout")?.addEventListener("click", logout);
  document.getElementById("btn-add-user")?.addEventListener("click", openAddUser);
  document.getElementById("user-form")?.addEventListener("submit", saveUser);
  document.getElementById("confirm-delete-user")?.addEventListener("click", confirmDeleteUser);
  document.getElementById("btn-add-category")?.addEventListener("click", openAddCategory);
  document.getElementById("category-form")?.addEventListener("submit", saveCategory);
  document.getElementById("confirm-delete-category")?.addEventListener("click", confirmDeleteCategory);

  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".modal-overlay").hidden = true;
    });
  });

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.hidden = true;
    });
  });
});

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Expose for inline handlers
window.selectRestockProduct = selectRestockProduct;
window.openEditProduct = openEditProduct;
window.openDeleteProduct = openDeleteProduct;
window.quickSell = quickSell;
window.addToCart = addToCart;
window.updateCartItemQty = updateCartItemQty;
window.removeFromCart = removeFromCart;
window.selectSalesDate = selectSalesDate;
window.openEditUser = openEditUser;
window.openDeleteUser = openDeleteUser;
window.openEditCategory = openEditCategory;
window.openDeleteCategory = openDeleteCategory;
