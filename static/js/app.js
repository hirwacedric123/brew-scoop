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
  salesReportMode: "date",
  salesFrom: null,
  salesTo: null,
  salesReport: null,
  shiftsReport: null,
  selectedSalesDate: null,
  selectedShiftId: null,
  historySellerId: "",
  historyShiftPreset: "today",
  selectedHistoryShiftId: null,
  salesSellerId: "",
  sellers: [],
  cart: [],
  paymentMethod: null,
  posMode: false,
  sellCategory: "",
  sellSearch: "",
  keepSellCategory: false,
  users: [],
  deleteUserId: null,
  deleteCategoryId: null,
  voidCheckoutRef: null,
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

/* ── UI State Persistence ────────────────────────────────────────────────── */

const UI_STORAGE_KEY = "brew_scoop_ui_v1";

function saveUIState() {
  try {
    const activeView =
      document.querySelector(".view.active")?.id?.replace("view-", "") || "";
    localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({
        cart: state.cart,
        paymentMethod: state.paymentMethod,
        posMode: state.posMode,
        activeView,
        sellCategory: state.sellCategory,
        salesPreset: state.salesPreset,
        salesReportMode: state.salesReportMode,
        salesFrom: state.salesFrom,
        salesTo: state.salesTo,
        historyShiftPreset: state.historyShiftPreset,
        historySellerId: state.historySellerId,
        salesSellerId: state.salesSellerId,
      })
    );
  } catch (_) {
    // Ignore storage errors (private mode, quota exceeded, etc.)
  }
}

function restoreUIState() {
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);

    if (Array.isArray(saved.cart) && saved.cart.length)
      state.cart = saved.cart;
    if (saved.paymentMethod) state.paymentMethod = saved.paymentMethod;
    if (typeof saved.posMode === "boolean") state.posMode = saved.posMode;
    if (saved.sellCategory) {
      state.sellCategory = saved.sellCategory;
      state.keepSellCategory = true;
    }
    if (saved.salesPreset) state.salesPreset = saved.salesPreset;
    if (saved.salesReportMode) state.salesReportMode = saved.salesReportMode;
    if (saved.salesFrom) state.salesFrom = saved.salesFrom;
    if (saved.salesTo) state.salesTo = saved.salesTo;
    if (saved.historyShiftPreset)
      state.historyShiftPreset = saved.historyShiftPreset;
    if (saved.historySellerId) state.historySellerId = saved.historySellerId;
    if (saved.salesSellerId) state.salesSellerId = saved.salesSellerId;

    return saved.activeView || null;
  } catch (_) {
    return null;
  }
}

function applyRestoredPosMode() {
  if (!state.posMode) return;
  document.getElementById("view-sell")?.classList.add("pos-mode");
  document.getElementById("btn-pos-mode")?.classList.add("active");
  const posBar = document.getElementById("pos-bar");
  if (posBar) posBar.hidden = false;
  const subtitle = document.getElementById("sell-subtitle");
  if (subtitle)
    subtitle.textContent =
      "Counter mode — larger tiles and keyboard shortcuts";
}

function applyRestoredPaymentMethod() {
  if (!state.paymentMethod) return;
  document.querySelectorAll(".payment-chip").forEach((chip) => {
    chip.classList.toggle(
      "active",
      chip.dataset.method === state.paymentMethod
    );
  });
}

function isSeller() {
  return state.currentUser?.role === "seller";
}

function canViewShiftReports() {
  const role = state.currentUser?.role;
  return role === "admin" || role === "stock_manager";
}

function canAccessView(viewId) {
  if (!isSeller()) return true;
  if (viewId === "sell" || viewId === "reconcile") return true;
  if (viewId === "history" || viewId === "sales") return !hasOpenShift();
  return false;
}

function sellerReportsUnlocked() {
  return isSeller() && !hasOpenShift();
}

function updateSellerNavUi() {
  if (!isSeller()) return;
  const unlocked = sellerReportsUnlocked();
  document.querySelectorAll(".seller-reports-nav").forEach((el) => {
    el.hidden = !unlocked;
  });
}

function configureSellerReportsUi() {
  if (!isSeller()) return;

  const historyChips = document.getElementById("history-filter-chips");
  const historySeller = document.getElementById("history-seller-filter");
  const historyType = document.getElementById("history-type-filter");
  const historySubtitle = document.querySelector("#view-history .topbar-heading p");
  const salesSeller = document.getElementById("sales-seller-filter");
  const salesSubtitle = document.getElementById("sales-report-subtitle");

  if (historyChips) historyChips.hidden = true;
  if (historySeller) historySeller.hidden = true;
  if (historyType) historyType.value = "sale";
  if (historySubtitle) {
    historySubtitle.textContent = "Your shifts and sales transactions";
  }
  const historyShiftsPanel = document.getElementById("history-shifts-panel");
  const historyTxHead = document.getElementById("history-transactions-head");
  if (historyShiftsPanel) historyShiftsPanel.hidden = false;
  if (historyTxHead) historyTxHead.hidden = false;
  if (salesSeller) salesSeller.hidden = true;
  if (salesSubtitle) salesSubtitle.textContent = "Track your revenue by day, week, or month";

  document.body.classList.add("seller-reports-mode");
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
      saveUIState();
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

const CATEGORY_ICONS = [
  { match: /hot|coffee|tea|espresso|latte|cappuccino/i, icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>` },
  { match: /ice.?cream|gelato|scoop|frozen/i, icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 3c2 3 4 5.5 4 8.5a4 4 0 0 1-8 0C8 8.5 10 6 12 3z"/><path d="M8 21h8"/><path d="M9 17h6"/></svg>` },
  { match: /cold|smoothie|juice|iced/i, icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M8 2h8l-1 9H9L8 2z"/><path d="M12 11v6"/><path d="M8 21h8"/><path d="M10 17h4"/></svg>` },
  { match: /snack|pastry|cake|cookie|bread/i, icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 14a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2z"/><path d="M8 10V8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>` },
  { match: /soft.?drink|soda|fizzy|cola/i, icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M9 2h6l1 7H8L9 2z"/><path d="M8 9h8v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9z"/><path d="M10 5h4"/></svg>` },
  { match: /add.?on|extra|topping|syrup/i, icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>` },
  { match: /cup|shared/i, icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M6 3h12v5a6 6 0 0 1-12 0V3z"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>` },
];

function categoryIcon(name) {
  const match = CATEGORY_ICONS.find((entry) => entry.match.test(name));
  return match ? match.icon : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
}

function cartQtyInCategory(categoryName) {
  const key = categoryName.toLowerCase();
  return state.cart.reduce((total, item) => {
    if (item.category.toLowerCase() === key) return total + item.quantity;
    return total;
  }, 0);
}

function getCategoryPriceRange(categoryName) {
  const products = state.products.filter((p) => p.category.toLowerCase() === categoryName.toLowerCase());
  if (!products.length) return null;
  const prices = products.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? fmt.format(min) : `${fmt.format(min)} – ${fmt.format(max)}`;
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
  if (res.status === 403 && data.must_change_password) {
    window.location.href = "/change-password";
    throw new Error("Password change required");
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
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest(
      ".nav-item[data-view], .bottom-nav-item[data-view], [data-view].btn, .shift-result-link[data-view]"
    );
    if (!trigger?.dataset.view) return;
    switchView(trigger.dataset.view);
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
  if (!canAccessView(viewId)) {
    if (isSeller() && (viewId === "history" || viewId === "sales")) {
      toast("Close your shift to view history and sales reports.", "error");
    }
    return;
  }

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
  if (viewId === "sell") {
    if (!state.keepSellCategory) state.sellCategory = "";
    state.keepSellCategory = false;
    loadSellView();
  }
  if (viewId === "restock") loadRestockView();
  if (viewId === "history") {
    if (isSeller()) loadCategories();
    else loadSellers();
    loadHistory();
  }
  if (viewId === "sales") {
    if (!isSeller()) loadSellers();
    loadSalesViewData();
  }
  if (viewId === "admin") loadAdminView();
  if (viewId === "reconcile") loadReconcileView();

  saveUIState();
}

function switchAdminTab(tabId) {
  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.adminTab === tabId);
  });
  document.getElementById("admin-panel-team").hidden = tabId !== "team";
  document.getElementById("admin-panel-categories").hidden = tabId !== "categories";
  document.getElementById("admin-panel-attendance").hidden = tabId !== "attendance";

  if (tabId === "team") loadUsers();
  if (tabId === "categories") loadCategoriesAdmin();
  if (tabId === "attendance") loadAttendance();
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

  const historyCategory = document.getElementById("history-category-filter");
  if (historyCategory) {
    const current = historyCategory.value;
    historyCategory.innerHTML =
      '<option value="">All Categories</option>' +
      names.map((n) => `<option value="${escAttr(n)}">${esc(n)}</option>`).join("");
    if (names.includes(current)) historyCategory.value = current;
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

function renderCategoryBars(categories, valueKey, emptyTitle, emptyMessage) {
  if (!categories.length) {
    return emptyState(UI_ICONS.chart, emptyTitle, emptyMessage, true);
  }
  const maxVal = Math.max(...categories.map((c) => c[valueKey]), 1);
  return `<div class="category-bars">${categories
    .map(
      (c) => `
      <div class="category-bar-item">
        <div class="category-bar-header">
          <span class="category-bar-name">${esc(c.name)}</span>
          <span class="category-bar-meta">${fmt.format(c[valueKey])} · ${c.units ?? c.total_qty ?? 0} units</span>
        </div>
        <div class="category-bar-track">
          <div class="category-bar-fill" style="width:${(c[valueKey] / maxVal) * 100}%;--bar-color:${categoryAccent(c.name)}"></div>
        </div>
      </div>`
    )
    .join("")}</div>`;
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

  const salesCategoryToday = document.getElementById("sales-category-today");
  if (salesCategoryToday) {
    salesCategoryToday.innerHTML = renderCategoryBars(
      d.sales_by_category_today || [],
      "revenue",
      "No sales today",
      "Category sales appear after your first sale today."
    );
  }

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
    if (!state.categories.length) {
      state.categories = await api("/api/categories");
    }
    populateProductSelects();
    renderSellBrowse();
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
  updateSellerNavUi();
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
  saveUIState();
}

function getSellCategories() {
  const categoryOrder = new Map(
    state.categories.map((c, i) => [c.name.toLowerCase(), { ...c, sort_order: c.sort_order ?? i }])
  );
  const namesInProducts = [...new Set(state.products.map((p) => p.category))];
  const ordered = state.categories
    .map((c) => c.name)
    .filter((name) => namesInProducts.some((n) => n.toLowerCase() === name.toLowerCase()));

  namesInProducts.forEach((name) => {
    if (!ordered.some((n) => n.toLowerCase() === name.toLowerCase())) {
      ordered.push(name);
    }
  });

  return ordered.map((name) => {
    const meta = categoryOrder.get(name.toLowerCase());
    return {
      name,
      sort_order: meta?.sort_order ?? 999,
      uses_cup_stock: meta?.uses_cup_stock ?? false,
      product_count: state.products.filter(
        (p) => p.category.toLowerCase() === name.toLowerCase()
      ).length,
    };
  });
}

function getSellProducts() {
  const products = [...state.products];
  if (state.sellCategory) {
    const selected = state.sellCategory.toLowerCase();
    return products.filter((p) => p.category.toLowerCase() === selected);
  }
  return products;
}

function selectSellCategory(categoryName) {
  state.sellCategory = categoryName || "";
  renderSellBrowse();
  populateProductSelects();
  updateSellPreview();
  saveUIState();
}

function backToSellCategories() {
  state.sellCategory = "";
  state.sellSearch = "";
  const searchInput = document.getElementById("sell-search");
  if (searchInput) searchInput.value = "";
  renderSellBrowse();
  populateProductSelects();
  updateSellPreview();
  saveUIState();
}

function renderSellBrowse() {
  const inCategory = Boolean(state.sellCategory);
  const categoryGrid = document.getElementById("sell-category-grid");
  const productGrid = document.getElementById("quick-pick-grid");
  const backBtn = document.getElementById("sell-back-btn");
  const title = document.getElementById("sell-pick-title");
  const hint = document.getElementById("sell-category-hint");
  const pickCard = document.querySelector(".sell-pick-card");
  const searchWrap = document.getElementById("sell-search-wrap");

  if (backBtn) backBtn.hidden = !inCategory;
  if (categoryGrid) categoryGrid.hidden = inCategory;
  if (productGrid) productGrid.hidden = !inCategory;
  if (pickCard) pickCard.classList.toggle("sell-pick-in-category", inCategory);
  if (searchWrap) searchWrap.hidden = !inCategory;

  if (title) {
    title.textContent = inCategory ? state.sellCategory : "Quick Pick";
  }

  if (hint) {
    if (inCategory) {
      const count = getSellProducts().length;
      hint.textContent = `${count} product${count !== 1 ? "s" : ""} · tap to add to cart`;
    } else {
      hint.textContent = "Choose a category to browse products";
    }
  }

  if (inCategory) {
    renderQuickPick();
  } else {
    renderSellCategories();
  }
}

function renderSellCategories() {
  const grid = document.getElementById("sell-category-grid");
  if (!grid) return;

  const categories = getSellCategories();

  if (!state.products.length) {
    grid.innerHTML = emptyState(UI_ICONS.box, "No products", "Add products to start selling.");
    return;
  }

  if (!categories.length) {
    grid.innerHTML = emptyState(UI_ICONS.box, "No categories", "Add products with categories to get started.");
    return;
  }

  grid.innerHTML = categories
    .map((category) => {
      const accent = categoryAccent(category.name);
      const inCart = cartQtyInCategory(category.name);
      const priceRange = getCategoryPriceRange(category.name);
      const inStock = state.products.filter(
        (p) => p.category.toLowerCase() === category.name.toLowerCase() && p.quantity > 0
      ).length;

      return `
    <button type="button" class="sell-category-card"
      style="--cat-accent: ${accent}"
      onclick="selectSellCategory('${escAttr(category.name)}')"
      role="listitem">
      <div class="sell-category-card-icon">${categoryIcon(category.name)}</div>
      <div class="sell-category-card-body">
        <strong>${esc(category.name)}</strong>
        <span class="sell-category-card-meta">
          ${category.product_count} item${category.product_count !== 1 ? "s" : ""}
          ${inStock < category.product_count ? ` · ${inStock} in stock` : ""}
        </span>
        ${priceRange ? `<span class="sell-category-card-price">${priceRange}</span>` : ""}
      </div>
      ${inCart ? `<span class="sell-category-cart-badge">${inCart} in cart</span>` : ""}
      <span class="sell-category-card-arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </span>
    </button>`;
    })
    .join("");
}

function populateProductSelects() {
  const sellProducts = getSellProducts().filter((p) => p.quantity > 0);
  const stockProducts = state.products.filter((p) => !p.uses_cup_stock);

  const sellSelect = document.getElementById("sell-product");
  sellSelect.innerHTML =
    '<option value="">Choose a product...</option>' +
    sellProducts
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
  let products = getSellProducts();

  if (!state.products.length) {
    grid.innerHTML = emptyState(UI_ICONS.box, "No products", "Add products to start selling.");
    return;
  }

  if (!products.length) {
    grid.innerHTML = emptyState(
      UI_ICONS.box,
      "No products in this category",
      "Try another category or add products here."
    );
    return;
  }

  const query = (state.sellSearch || "").trim().toLowerCase();
  if (query) {
    products = products.filter((p) => p.name.toLowerCase().includes(query));
  }

  if (!products.length) {
    grid.innerHTML = `
      <div class="sell-no-results">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <strong>No results for "${esc(state.sellSearch)}"</strong>
        <p>Try a different name or clear the search.</p>
      </div>`;
    return;
  }

  grid.innerHTML = products
    .map((p) => {
      const inCart = cartQtyInCart(p.id);
      const available = getAvailableUnits(p);
      const disabled = p.quantity <= 0 || available <= 0;
      const accent = categoryAccent(p.category);
      const stockClass =
        available <= 0 ? "stock-out" : available <= (p.reorder_level || 5) ? "stock-low" : "stock-ok";
      return `
    <button type="button" class="quick-pick-item ${disabled ? "out-of-stock" : ""} ${inCart ? "in-cart" : ""}"
      style="--qp-accent: ${accent}"
      ${disabled ? "disabled" : `onclick="addToCart(${p.id}, 1)"`}>
      <div class="qp-item-body">
        <div class="qp-item-top">
          <div class="qp-avatar">${esc(productInitials(p.name))}</div>
          ${inCart ? `<span class="qp-cart-badge">${inCart}</span>` : ""}
        </div>
        <strong>${esc(p.name)}</strong>
        <span class="qp-stock ${stockClass}">${availableStockLabel({ ...p, quantity: available })}</span>
      </div>
      <div class="qp-item-footer">
        <div class="qp-price">${fmt.format(p.price)}</div>
      </div>
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
  renderSellBrowse();
  updateSellPreview();
  toast(`Added ${product.name}`);
  saveUIState();
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
  renderSellBrowse();
  updateSellPreview();
  saveUIState();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter((c) => c.product_id !== productId);
  renderCart();
  renderSellBrowse();
  updateSellPreview();
  saveUIState();
}

function clearCart() {
  state.cart = [];
  clearPaymentMethod();
  document.getElementById("sell-notes").value = "";
  document.getElementById("add-to-cart-form").reset();
  document.getElementById("sell-quantity").value = "1";
  document.getElementById("sell-preview").hidden = true;
  renderCart();
  renderSellBrowse();
  saveUIState();
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

    const paymentLabel = result.payment_label || paymentMethodLabel(result.payment_method);
    toast(
      `Payment received — ${fmt.format(result.total_amount)} · ${paymentLabel} · ${result.checkout_ref}`,
      "success"
    );

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
  const product = state.products.find((p) => p.id === id);
  if (product) {
    state.sellCategory = product.category;
    state.keepSellCategory = true;
  }
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
let shiftUiPhase = "sell"; // "sell" | "close" while shift is open

const CASH_DENOMS = [5000, 2000, 1000, 500, 100];

function readCashNotesFromForm() {
  const notes = {};
  for (const denom of CASH_DENOMS) {
    const input = document.getElementById(`cash-note-${denom}`);
    notes[String(denom)] = parseInt(input?.value, 10) || 0;
  }
  return notes;
}

function updateCashNotesTotal() {
  const notes = readCashNotesFromForm();
  let total = 0;
  for (const denom of CASH_DENOMS) {
    const count = notes[String(denom)];
    total += denom * count;
    const subEl = document.getElementById(`cash-note-sub-${denom}`);
    if (subEl) subEl.textContent = fmt.format(denom * count);
  }
  const totalEl = document.getElementById("cash-notes-total");
  if (totalEl) totalEl.textContent = fmt.format(total);
}

function clearCashNoteInputs() {
  for (const denom of CASH_DENOMS) {
    const input = document.getElementById(`cash-note-${denom}`);
    if (input) input.value = "";
  }
  updateCashNotesTotal();
}

function renderCashNotesBreakdown(cashNotes) {
  if (!cashNotes) return "";
  return CASH_DENOMS.map((denom) => {
    const count = cashNotes[String(denom)] || 0;
    if (!count) return "";
    return `<div class="cash-note-line"><span>${fmtNum.format(denom)} × ${count}</span><strong>${fmt.format(denom * count)}</strong></div>`;
  })
    .filter(Boolean)
    .join("");
}

function updateShiftCloseSystemPayments() {
  const panel = document.getElementById("shift-system-payments");
  const live = state.sellerShift?.shift?.live_sales;
  if (!panel) return;
  if (!live || shiftUiPhase !== "close") {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const momoEl = document.getElementById("shift-close-momo");
  const visaEl = document.getElementById("shift-close-visa");
  const cashEl = document.getElementById("shift-close-cash-expected");
  if (momoEl) momoEl.textContent = fmt.format(live.momo_sales || 0);
  if (visaEl) visaEl.textContent = fmt.format(live.visa_sales || 0);
  if (cashEl) cashEl.textContent = fmt.format(live.cash_sales || 0);
}

function setShiftUiPhase(phase) {
  shiftUiPhase = phase === "close" ? "close" : "sell";
  const data = state.sellerShift;
  if (data?.has_open_shift && data.shift) {
    const startedAt = formatDate(data.shift.opened_at);
    const descEl = document.getElementById("shift-hero-desc");
    if (descEl) {
      descEl.textContent =
        shiftUiPhase === "close"
          ? `Started ${startedAt}. Count your cash notes to finish.`
          : `Started ${startedAt}. Head to Sell to record orders — close when you're done.`;
    }
  }
  renderShiftOpenPhase();
}

function renderShiftOpenPhase() {
  const sellHint = document.getElementById("shift-sell-hint");
  const closeCard = document.getElementById("shift-close-card");
  const heroActions = document.getElementById("shift-hero-actions");
  const panels = document.getElementById("shift-panels");
  const subtitle = document.getElementById("reconcile-subtitle");
  const closing = shiftUiPhase === "close";

  if (sellHint) sellHint.hidden = closing;
  if (closeCard) closeCard.hidden = !closing;
  if (heroActions) heroActions.hidden = closing;
  if (panels) {
    panels.classList.remove("is-idle", "is-active", "is-closed", "is-selling", "is-closing");
    panels.classList.add(closing ? "is-closing" : "is-selling");
  }
  if (subtitle) {
    subtitle.textContent = closing
      ? "Count the cash notes in your till and compare to recorded cash sales."
      : "Sell during your shift, then count your cash notes to close.";
  }
  updateShiftCloseSystemPayments();
  updateShiftSteps(closing ? "close" : "sell");
}

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
  panels.classList.remove("is-idle", "is-active", "is-closed", "is-selling", "is-closing");
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

function groupShiftSalesByCheckout(sales) {
  if (!sales?.length) return [];
  const groups = new Map();
  for (const sale of sales) {
    const key = sale.checkout_ref || `line-${sale.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        created_at: sale.created_at,
        payment_method: sale.payment_method,
        items: [],
        total: 0,
      });
    }
    const group = groups.get(key);
    group.items.push(sale);
    group.total += sale.total_amount;
  }
  return [...groups.values()];
}

function renderShiftSalesHistory(sales) {
  if (!sales?.length) {
    return `
      <div class="shift-sales-history">
        <h4>Sales this shift</h4>
        ${emptyState(UI_ICONS.sales, "No sales", "No sales were recorded during this shift.", true)}
      </div>
    `;
  }

  const groups = groupShiftSalesByCheckout(sales);
  const saleCount = sales.length;

  return `
    <div class="shift-sales-history">
      <div class="shift-sales-head">
        <h4>Sales this shift</h4>
        <span class="shift-sales-meta">${saleCount} line${saleCount === 1 ? "" : "s"} · ${groups.length} checkout${groups.length === 1 ? "" : "s"}</span>
      </div>
      <div class="shift-sales-list">
        ${groups
          .map(
            (group) => `
          <article class="shift-sale-card">
            <div class="shift-sale-card-head">
              <span class="shift-sale-time">${esc(formatTime(group.created_at))}</span>
              <span class="shift-sale-pay">${esc(paymentMethodLabel(group.payment_method))}</span>
              <strong class="shift-sale-total">${fmt.format(group.total)}</strong>
            </div>
            <ul class="shift-sale-items">
              ${group.items
                .map(
                  (item) => `
                <li>
                  <span class="shift-sale-item-name">${esc(item.product_name)}</span>
                  <span class="shift-sale-item-qty">× ${item.quantity}</span>
                  <span class="shift-sale-item-amount">${fmt.format(item.total_amount)}</span>
                </li>`
                )
                .join("")}
            </ul>
          </article>`
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderShiftSummary(shift, message) {
  const resultEl = document.getElementById("reconcile-result");
  if (!resultEl || !shift) return;

  const status = reconcileStatusLabel(shift.status_label || "balanced");
  const varianceAbs = fmt.format(Math.abs(shift.variance || 0));
  const expectedCash = shift.expected_cash ?? shift.cash_sales ?? 0;
  const counted = shift.counted_total ?? shift.counted_cash;
  const varianceLine =
    shift.status_label === "balanced"
      ? "Your cash count matches the cash sales recorded for this shift."
      : shift.status_label === "over"
        ? `You counted ${varianceAbs} more cash than recorded.`
        : `You are short by ${varianceAbs} in cash compared to what was recorded.`;

  const payTotal = (shift.cash_sales || 0) + (shift.momo_sales || 0) + (shift.visa_sales || 0);
  const varianceChip =
    shift.status_label === "balanced"
      ? "Cash balanced"
      : shift.status_label === "over"
        ? `+${varianceAbs}`
        : `−${varianceAbs}`;

  const notesHtml = renderCashNotesBreakdown(shift.cash_notes);
  const notesSection = notesHtml
    ? `<div class="cash-notes-breakdown"><h4>Cash note breakdown</h4>${notesHtml}</div>`
    : "";

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
            ${statCard("revenue", UI_ICONS.revenue, "Total sales", fmt.format(shift.total_sales), "All payment types")}
            ${statCard("sales", UI_ICONS.sales, "Cash counted", fmt.format(counted), "Notes in your till")}
            ${statCard("month", UI_ICONS.chart, "Cash expected", fmt.format(expectedCash), "Cash sales recorded")}
          </div>
          ${notesSection}
          <div class="reconcile-payments">
            <h4>Recorded breakdown</h4>
            ${renderPaymentRow("Cash", shift.cash_sales, payTotal, "cash")}
            ${renderPaymentRow("MoMo", shift.momo_sales, payTotal, "momo")}
            ${renderPaymentRow("Visa", shift.visa_sales, payTotal, "visa")}
          </div>
          ${renderShiftSalesHistory(shift.sales)}
        </div>
      </div>
      <p class="reconcile-closed-note">Shift closed — start a new one when you are ready to sell again.</p>
      <div class="shift-result-actions">
        <button type="button" class="btn btn-ghost shift-result-link" data-view="history">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          View history
        </button>
        <button type="button" class="btn btn-ghost shift-result-link" data-view="sales">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-6"/></svg>
          Sales report
        </button>
      </div>
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
  const closeCard = document.getElementById("shift-close-card");
  const resultCard = document.getElementById("shift-result-card");
  const sellHint = document.getElementById("shift-sell-hint");
  const heroActions = document.getElementById("shift-hero-actions");

  const data = state.sellerShift;
  const open = data?.has_open_shift;
  const closedShift = !open && (data?.shift?.status === "closed" ? data.shift : data?.last_closed);

  if (startCard) startCard.hidden = open || !!closedShift;
  if (resultCard) resultCard.hidden = !closedShift;
  if (sellHint) sellHint.hidden = true;
  if (closeCard) closeCard.hidden = true;
  if (heroActions) heroActions.hidden = true;

  if (open && data.shift) {
    const startedAt = formatDate(data.shift.opened_at);
    updateShiftHero(
      "open",
      "Your shift is live",
      shiftUiPhase === "close"
        ? `Started ${startedAt}. Count your cash notes to finish.`
        : `Started ${startedAt}. Head to Sell to record orders — close when you're done.`,
      "In progress",
      "open"
    );
    startShiftTimer(data.shift.opened_at);
    renderShiftOpenPhase();
  } else if (closedShift && resultCard) {
    shiftUiPhase = "sell";
    renderShiftSummary(closedShift);
  } else {
    shiftUiPhase = "sell";
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
  updateSellerNavUi();
}

async function loadReconcileView() {
  if (!isSeller()) return;

  updateShiftDateBadge();
  shiftUiPhase = "sell";

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
    shiftUiPhase = "sell";
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

  const btn = document.getElementById("btn-reconcile");
  const cashNotes = readCashNotesFromForm();
  const countedCash = CASH_DENOMS.reduce(
    (sum, denom) => sum + denom * (cashNotes[String(denom)] || 0),
    0
  );

  btn.disabled = true;
  try {
    const data = await api("/api/seller/shift/close", {
      method: "POST",
      body: JSON.stringify({ cash_notes: cashNotes }),
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
  shiftUiPhase = "sell";
  const resultCard = document.getElementById("shift-result-card");
  if (resultCard) resultCard.hidden = true;
  renderShiftView();
  document.getElementById("btn-start-shift")?.focus();
}

function initCashNoteInputs() {
  document.querySelectorAll(".cash-note-input").forEach((input) => {
    input.addEventListener("input", updateCashNotesTotal);
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
  if (isSeller()) return;
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
  const category = document.getElementById("history-category-filter")?.value || "";
  state.historySellerId = sellerId;

  const params = new URLSearchParams({ limit: "100" });
  if (type) params.set("type", type);
  if (sellerId) params.set("user_id", sellerId);
  if (category) params.set("category", category);

  try {
    const requests = [api(`/api/transactions?${params}`)];
    if (isSeller()) requests.push(loadHistoryShifts());
    const [transactions] = await Promise.all(requests);
    renderHistory(transactions);
  } catch (e) {
    toast(e.message, "error");
  }
}

async function loadHistoryShifts() {
  const url = `/api/shifts/report?preset=${state.historyShiftPreset || "today"}`;
  const report = await api(url);
  state.historyShiftsReport = report;
  renderHistoryShifts(report);
  return report;
}

function renderHistoryShifts(report) {
  const { shifts } = report;
  const listEl = document.getElementById("history-shifts-list");
  if (!listEl) return;

  if (!shifts.length) {
    listEl.innerHTML = emptyState(UI_ICONS.chart, "No shifts", "Closed shifts in this period will appear here.");
    renderHistoryShiftDetailPlaceholder();
    return;
  }

  const maxSales = Math.max(...shifts.map((s) => s.total_sales), 1);
  const selectedVisible = shifts.some((s) => s.id === state.selectedHistoryShiftId);
  if (!selectedVisible) state.selectedHistoryShiftId = shifts[0]?.id || null;

  listEl.innerHTML = shifts
    .map((shift) => buildShiftListItemHtml(shift, state.selectedHistoryShiftId, maxSales, "selectHistoryShift"))
    .join("");

  if (state.selectedHistoryShiftId) {
    loadHistoryShiftDetail(state.selectedHistoryShiftId);
  } else {
    renderHistoryShiftDetailPlaceholder();
  }
}

function buildShiftListItemHtml(shift, selectedId, maxSales, selectFn) {
  const statusBadge =
    shift.status === "open"
      ? '<span class="shift-status-badge open">Open</span>'
      : shiftStatusBadge(shift.status_label);
  const timeLine =
    shift.status === "open"
      ? `Started ${formatTime(shift.opened_at)} · ${formatShiftDuration(shift.opened_at, true)}`
      : `${formatTime(shift.opened_at)} → ${formatTime(shift.closed_at)}`;
  const sellerLine = isSeller() ? "" : `${esc(shift.seller_name)} `;
  return `
    <button type="button" class="sales-date-item shift-list-item ${selectedId === shift.id ? "active" : ""}"
      onclick="${selectFn}(${shift.id})">
      <div class="sales-date-info">
        <strong>${sellerLine}${statusBadge}</strong>
        <span>${timeLine}</span>
        <span>${fmtNum.format(shift.sale_count)} sale${shift.sale_count !== 1 ? "s" : ""} · ${fmtNum.format(shift.units_sold)} units</span>
      </div>
      <div class="sales-date-revenue">${fmt.format(shift.total_sales)}</div>
      <div class="sales-date-bar" style="width:${(shift.total_sales / maxSales) * 100}%"></div>
    </button>`;
}

function renderHistoryShiftDetailPlaceholder() {
  const title = document.getElementById("history-shift-detail-title");
  const subtitle = document.getElementById("history-shift-detail-subtitle");
  const body = document.getElementById("history-shift-detail-body");
  if (title) title.textContent = "Shift Detail";
  if (subtitle) subtitle.textContent = "";
  if (body) {
    body.innerHTML = '<p class="text-muted shift-detail-placeholder">Select a shift to view details</p>';
  }
}

async function selectHistoryShift(shiftId) {
  state.selectedHistoryShiftId = shiftId;
  if (state.historyShiftsReport) renderHistoryShifts(state.historyShiftsReport);
  await loadHistoryShiftDetail(shiftId);
}

async function loadHistoryShiftDetail(shiftId) {
  try {
    const shift = await api(`/api/shifts/${shiftId}`);
    renderShiftDetail(shift, {
      title: "history-shift-detail-title",
      subtitle: "history-shift-detail-subtitle",
      body: "history-shift-detail-body",
      ownShift: isSeller(),
    });
  } catch (e) {
    toast(e.message, "error");
  }
}

function initHistoryShiftFilters() {
  document.querySelectorAll("[data-history-shift-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-history-shift-preset]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.historyShiftPreset = btn.dataset.historyShiftPreset;
      state.selectedHistoryShiftId = null;
      loadHistoryShifts().catch((e) => toast(e.message, "error"));
    });
  });
}

function groupHistorySales(transactions) {
  const sales = transactions.filter((t) => t.type === "sale");
  const other = transactions.filter((t) => t.type !== "sale");
  const groups = new Map();

  for (const sale of sales) {
    const key = sale.checkout_ref || `line-${sale.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        checkout_ref: key,
        created_at: sale.created_at,
        payment_method: sale.payment_method,
        seller_name: sale.seller_name,
        user_id: sale.user_id,
        items: [],
        total: 0,
        units: 0,
        is_voided: !!sale.is_voided,
        notes: sale.notes,
      });
    }
    const group = groups.get(key);
    group.items.push(sale);
    group.total += sale.total_amount;
    group.units += sale.quantity;
    group.is_voided = group.is_voided || !!sale.is_voided;
  }

  const groupedSales = [...groups.values()].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
  return { groupedSales, other };
}

function historySaleProductCell(group) {
  if (group.items.length === 1) {
    const item = group.items[0];
    return productCell(item.product_name, esc(item.category));
  }
  const names = group.items.map((i) => esc(i.product_name)).join(", ");
  return `<div class="history-sale-group"><strong>${group.items.length} items</strong><span class="text-muted">${names}</span></div>`;
}

function historyVoidAction(group) {
  if (group.is_voided) {
    return '<span class="badge badge-muted">Voided</span>';
  }
  if (!group.checkout_ref || group.checkout_ref.startsWith("line-")) {
    return "—";
  }
  return `<button type="button" class="btn btn-ghost btn-sm btn-danger-text" onclick="openVoidSaleModal(${JSON.stringify(group.checkout_ref)})">Void</button>`;
}

function renderHistory(transactions) {
  const tbody = document.getElementById("history-table-body");
  const hideSellerCol = isSeller();
  const colCount = hideSellerCol ? 8 : 9;

  if (!transactions.length) {
    tbody.innerHTML = `<tr><td colspan="${colCount}">${emptyState(UI_ICONS.clock, "No transactions", hideSellerCol ? "Your sales will appear here." : "Sales, restocks, and adjustments will appear here.")}</td></tr>`;
    return;
  }

  const { groupedSales, other } = groupHistorySales(transactions);
  const saleRows = groupedSales
    .map(
      (group) => `
    <tr class="${group.is_voided ? "history-row-voided" : ""}">
      <td>${formatDate(group.created_at)}</td>
      <td>${historySaleProductCell(group)}</td>
      <td>${typeBadge("sale")}${group.is_voided ? ' <span class="badge badge-muted">Voided</span>' : ""}</td>
      <td>${fmtNum.format(group.units)}</td>
      <td>${fmt.format(group.total)}</td>
      <td>${paymentMethodLabel(group.payment_method)}</td>
      ${hideSellerCol ? "" : `<td>${sellerLabel(group)}</td>`}
      <td style="color:var(--text-muted);font-size:0.82rem">${esc(group.checkout_ref || group.notes || "—")}</td>
      <td>${historyVoidAction(group)}</td>
    </tr>`
    )
    .join("");

  const otherRows = other
    .map(
      (t) => `
    <tr>
      <td>${formatDate(t.created_at)}</td>
      <td>${productCell(t.product_name, esc(t.category))}</td>
      <td>${typeBadge(t.type)}</td>
      <td>${formatTransactionQty(t)}</td>
      <td>${t.type === "sale" ? fmt.format(t.total_amount) : "—"}</td>
      <td>${t.type === "sale" ? paymentMethodLabel(t.payment_method) : "—"}</td>
      ${hideSellerCol ? "" : `<td>${t.type === "sale" ? sellerLabel(t) : "—"}</td>`}
      <td style="color:var(--text-muted);font-size:0.82rem">${esc(t.notes || "—")}</td>
      <td>—</td>
    </tr>`
    )
    .join("");

  tbody.innerHTML = saleRows + otherRows;
}

function openVoidSaleModal(checkoutRef) {
  state.voidCheckoutRef = checkoutRef;
  const label = document.getElementById("void-sale-ref-label");
  if (label) label.textContent = `Reference: ${checkoutRef}`;
  const pwd = document.getElementById("void-admin-password");
  if (pwd) pwd.value = "";
  showModal("void-sale-modal");
  pwd?.focus();
}

async function submitVoidSale(e) {
  e.preventDefault();
  const checkoutRef = state.voidCheckoutRef;
  const password = document.getElementById("void-admin-password")?.value || "";
  if (!checkoutRef) return;

  try {
    const data = await api("/api/sales/void", {
      method: "POST",
      body: JSON.stringify({ checkout_ref: checkoutRef, admin_password: password }),
    });
    hideModal("void-sale-modal");
    state.voidCheckoutRef = null;
    toast(data.message || "Sale voided", "success");
    await loadHistory();
    if (!isSeller()) loadDashboard();
  } catch (err) {
    toast(err.message, "error");
  }
}

// ── Sales Reports ──────────────────────────────────────────────────────────

function setSalesReportMode(mode) {
  state.salesReportMode = mode;
  const datePanel = document.getElementById("sales-date-report");
  const shiftPanel = document.getElementById("sales-shift-report");
  const subtitle = document.getElementById("sales-report-subtitle");

  document.querySelectorAll(".sales-mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.salesMode === mode);
  });

  if (datePanel) datePanel.hidden = mode !== "date";
  if (shiftPanel) shiftPanel.hidden = mode !== "shift";

  if (subtitle) {
    subtitle.textContent =
      mode === "shift"
        ? "Review seller shifts — start and end times, sales totals, and reconciliation"
        : "Track revenue by day, week, month, or custom range";
  }
}

function loadSalesViewData(from, to) {
  if (canViewShiftReports() && state.salesReportMode === "shift") {
    loadShiftsReport(from, to);
  } else {
    loadSalesReports(from, to);
  }
}

function initSalesReports() {
  document.querySelectorAll(".sales-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.salesMode === state.salesReportMode) return;
      setSalesReportMode(btn.dataset.salesMode);
      state.selectedShiftId = null;
      loadSalesViewData();
    });
  });

  document.querySelectorAll(".period-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".period-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.salesPreset = btn.dataset.preset;
      document.getElementById("custom-range-bar").hidden = state.salesPreset !== "custom";
      if (state.salesPreset !== "custom") {
        state.selectedSalesDate = null;
        state.selectedShiftId = null;
        loadSalesViewData();
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
    state.selectedShiftId = null;
    loadSalesViewData(from, to);
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
  const { summary, daily_breakdown, payment_breakdown, category_breakdown, sales, from, to } = report;

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

  const categoryEl = document.getElementById("sales-category-breakdown");
  if (categoryEl) {
    const categories = category_breakdown || [];
    if (!categories.length) {
      categoryEl.innerHTML = "";
    } else {
      const maxRevenue = Math.max(...categories.map((c) => c.revenue), 1);
      categoryEl.innerHTML = `
        <h3 class="payment-breakdown-title">Revenue by Category</h3>
        <div class="category-breakdown-grid">
          ${categories
            .map(
              (c) => `
            <div class="category-breakdown-card" style="--cat-accent: ${categoryAccent(c.name)}">
              <span class="category-breakdown-label">${esc(c.name)}</span>
              <strong class="category-breakdown-value">${fmt.format(c.revenue)}</strong>
              <span class="category-breakdown-sub">${fmtNum.format(c.units)} units · ${fmtNum.format(c.transactions)} sale${c.transactions !== 1 ? "s" : ""}</span>
              <div class="category-breakdown-bar" style="width:${(c.revenue / maxRevenue) * 100}%"></div>
            </div>`
            )
            .join("")}
        </div>
      `;
    }
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
    const cols = isSeller() ? 5 : 6;
    tbody.innerHTML = `<tr><td colspan="${cols}">${emptyState(UI_ICONS.sales, "No sales", "Select a date or adjust your date range.")}</td></tr>`;
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
      ${isSeller() ? "" : `<td>${sellerLabel(s)}</td>`}
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

async function loadShiftsReport(from, to) {
  try {
    const sellerId = document.getElementById("sales-seller-filter")?.value || "";
    state.salesSellerId = sellerId;

    let url = "/api/shifts/report?";
    if (state.salesPreset === "custom" && from && to) {
      url += `from=${from}&to=${to}`;
    } else if (state.salesPreset !== "custom") {
      url += `preset=${state.salesPreset}`;
    } else {
      return;
    }
    if (sellerId) url += `&user_id=${encodeURIComponent(sellerId)}`;

    state.shiftsReport = await api(url);
    state.salesFrom = state.shiftsReport.from;
    state.salesTo = state.shiftsReport.to;
    renderShiftsReport(state.shiftsReport);

    if (state.selectedShiftId) {
      const stillVisible = state.shiftsReport.shifts.some((s) => s.id === state.selectedShiftId);
      if (stillVisible) {
        await loadShiftDetail(state.selectedShiftId);
      } else {
        state.selectedShiftId = null;
        renderShiftDetailPlaceholder();
      }
    }
  } catch (e) {
    toast(e.message, "error");
  }
}

function renderShiftsReport(report) {
  const { summary, payment_breakdown, shifts, from, to } = report;

  document.getElementById("shifts-summary-stats").innerHTML = `
    ${statCard("revenue", UI_ICONS.revenue, "Total Sales", fmt.format(summary.total_sales), formatRangeLabel(from, to))}
    ${statCard("sales", UI_ICONS.sales, "Shifts", fmtNum.format(summary.shift_count), `${summary.closed_shifts} closed · ${summary.open_shifts} open`)}
    ${statCard("stock", UI_ICONS.chart, "Units Sold", fmtNum.format(summary.units_sold), `${fmtNum.format(summary.sale_count)} line items`)}
    ${statCard("alert", UI_ICONS.calendar, "Net Variance", fmt.format(Math.abs(summary.total_variance)), summary.total_variance === 0 ? "All shifts balanced" : summary.total_variance > 0 ? "Over overall" : "Short overall")}
  `;

  const payments = payment_breakdown || [];
  const breakdownEl = document.getElementById("shifts-payment-breakdown");
  if (breakdownEl) {
    breakdownEl.innerHTML = `
      <h3 class="payment-breakdown-title">Sales by Payment</h3>
      <div class="payment-breakdown-grid">
        ${payments
          .map(
            (p) => `
          <div class="payment-breakdown-card payment-${p.method}">
            <span class="payment-breakdown-label">${esc(p.label)}</span>
            <strong class="payment-breakdown-value">${fmt.format(p.revenue)}</strong>
            <span class="payment-breakdown-sub">across all shifts</span>
          </div>`
          )
          .join("")}
      </div>
    `;
  }

  document.getElementById("shifts-range-label").textContent = formatRangeLabel(from, to);

  const listEl = document.getElementById("shifts-list");
  if (!shifts.length) {
    listEl.innerHTML = emptyState(UI_ICONS.chart, "No shifts", "No seller shifts in this period.");
    renderShiftDetailPlaceholder();
    return;
  }

  const maxSales = Math.max(...shifts.map((s) => s.total_sales), 1);
  listEl.innerHTML = shifts
    .map((shift) => buildShiftListItemHtml(shift, state.selectedShiftId, maxSales, "selectShift"))
    .join("");

  if (!state.selectedShiftId && shifts.length) {
    selectShift(shifts[0].id);
  }
}

function shiftStatusBadge(statusLabel) {
  if (statusLabel === "balanced") {
    return '<span class="shift-status-badge balanced">Balanced</span>';
  }
  if (statusLabel === "over") {
    return '<span class="shift-status-badge over">Over</span>';
  }
  return '<span class="shift-status-badge short">Short</span>';
}

function renderShiftDetailPlaceholder() {
  document.getElementById("shift-detail-title").textContent = "Shift Detail";
  document.getElementById("shift-detail-subtitle").textContent = "";
  document.getElementById("shift-detail-body").innerHTML =
    '<p class="text-muted shift-detail-placeholder">Select a shift to view details</p>';
}

async function loadShiftDetail(shiftId) {
  try {
    const shift = await api(`/api/shifts/${shiftId}`);
    renderShiftDetail(shift);
  } catch (e) {
    toast(e.message, "error");
  }
}

function renderShiftDetail(shift, targets = {}) {
  const title = document.getElementById(targets.title || "shift-detail-title");
  const subtitle = document.getElementById(targets.subtitle || "shift-detail-subtitle");
  const body = document.getElementById(targets.body || "shift-detail-body");
  if (!title || !body) return;

  title.textContent = targets.ownShift ? "Your Shift" : `${shift.seller_name}'s Shift`;
  if (subtitle) subtitle.textContent = formatShiftRange(shift);

  const payTotal = (shift.cash_sales || 0) + (shift.momo_sales || 0) + (shift.visa_sales || 0);
  const isOpen = shift.status === "open";
  const status = shift.status_label ? reconcileStatusLabel(shift.status_label) : null;

  let reconcileSection = "";
  if (!isOpen && status) {
    const varianceChip =
      shift.status_label === "balanced"
        ? "Balanced"
        : shift.status_label === "over"
          ? `+${fmt.format(Math.abs(shift.variance || 0))}`
          : `−${fmt.format(Math.abs(shift.variance || 0))}`;
    reconcileSection = `
      <div class="shift-detail-reconcile ${status.cls}">
        <div class="shift-detail-reconcile-head">
          <span class="shift-result-status ${status.cls}">${status.text}</span>
          <span class="shift-variance-chip ${status.cls}">${esc(varianceChip)}</span>
        </div>
        <div class="reconcile-grid shift-detail-stats">
          ${statCard("revenue", UI_ICONS.revenue, "Recorded", fmt.format(shift.total_sales), "System total")}
          ${statCard("sales", UI_ICONS.sales, "Cash counted", fmt.format(shift.counted_cash), "Notes in till")}
          ${statCard("month", UI_ICONS.chart, "Cash variance", fmt.format(Math.abs(shift.variance || 0)), shift.status_label === "balanced" ? "Balanced" : status.text.toLowerCase())}
        </div>
        ${renderCashNotesBreakdown(shift.cash_notes) ? `<div class="cash-notes-breakdown shift-detail-notes"><h4>Cash notes</h4>${renderCashNotesBreakdown(shift.cash_notes)}</div>` : ""}
      </div>
    `;
  } else if (isOpen) {
    reconcileSection = `
      <div class="shift-detail-reconcile open">
        <p class="shift-detail-open-note">This shift is still open — totals update live as sales are recorded.</p>
        <div class="reconcile-grid shift-detail-stats">
          ${statCard("revenue", UI_ICONS.revenue, "Sales so far", fmt.format(shift.total_sales), "Live total")}
          ${statCard("sales", UI_ICONS.sales, "Line items", fmtNum.format(shift.sale_count), "sales recorded")}
          ${statCard("stock", UI_ICONS.chart, "Units", fmtNum.format(shift.units_sold), "sold this shift")}
        </div>
      </div>
    `;
  }

  body.innerHTML = `
    ${reconcileSection}
    <div class="reconcile-payments shift-detail-payments">
      <h4>Payment breakdown</h4>
      ${renderPaymentRow("Cash", shift.cash_sales, payTotal, "cash")}
      ${renderPaymentRow("MoMo", shift.momo_sales, payTotal, "momo")}
      ${renderPaymentRow("Visa", shift.visa_sales, payTotal, "visa")}
    </div>
    ${renderShiftSalesHistory(shift.sales)}
  `;
}

async function selectShift(shiftId) {
  state.selectedShiftId = state.selectedShiftId === shiftId ? state.selectedShiftId : shiftId;
  if (state.shiftsReport) {
    renderShiftsReport(state.shiftsReport);
  }
  await loadShiftDetail(shiftId);
}

// ── Admin: User Management ─────────────────────────────────────────────────

let heartbeatTimer = null;
const HEARTBEAT_MS = 5 * 60 * 1000;

async function sendHeartbeat() {
  if (document.hidden || !state.currentUser) return;
  try {
    await api("/api/auth/heartbeat", { method: "POST" });
  } catch (_) {
    // Ignore transient heartbeat failures
  }
}

function initHeartbeat() {
  if (!state.currentUser) return;
  sendHeartbeat();
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sendHeartbeat();
  });
}

function populateAttendanceUserFilter(users) {
  const select = document.getElementById("attendance-user-filter");
  if (!select) return;
  const current = select.value;
  select.innerHTML =
    '<option value="">All users</option>' +
    users
      .map(
        (u) =>
          `<option value="${u.id}">${esc(u.display_name)} (${esc(ROLE_LABELS[u.role] || u.role)})</option>`
      )
      .join("");
  if ([...select.options].some((o) => o.value === current)) select.value = current;
}

async function loadAttendance() {
  if (!state.currentUser || state.currentUser.role !== "admin") return;

  const fromEl = document.getElementById("attendance-from");
  const toEl = document.getElementById("attendance-to");
  const today = new Date().toISOString().slice(0, 10);
  if (fromEl && !fromEl.value) fromEl.value = today;
  if (toEl && !toEl.value) toEl.value = today;

  showTableSkeleton("attendance-table-body", 7, 6);

  try {
    if (!state.users.length) {
      state.users = await api("/api/admin/users");
    }
    populateAttendanceUserFilter(state.users);

    const params = new URLSearchParams();
    if (fromEl?.value) params.set("from", fromEl.value);
    if (toEl?.value) params.set("to", toEl.value);
    const userId = document.getElementById("attendance-user-filter")?.value;
    if (userId) params.set("user_id", userId);

    const data = await api(`/api/admin/attendance?${params}`);
    renderAttendanceTable(data.sessions || []);
  } catch (e) {
    toast(e.message, "error");
  }
}

function renderAttendanceTable(sessions) {
  const tbody = document.getElementById("attendance-table-body");
  if (!tbody) return;

  if (!sessions.length) {
    tbody.innerHTML = `<tr><td colspan="7">${emptyState(UI_ICONS.clock, "No sessions", "No login sessions in this period.", true)}</td></tr>`;
    return;
  }

  tbody.innerHTML = sessions
    .map((s) => {
      const status = s.is_active
        ? '<span class="badge badge-stock ok">Active</span>'
        : s.idle_before_logout
          ? '<span class="badge badge-stock low">Idle gap</span>'
          : `<span class="badge badge-muted">${esc(s.logout_reason || "Ended")}</span>`;
      return `
    <tr>
      <td><strong>${esc(s.display_name)}</strong><br><span class="text-muted">${esc(s.username)}</span></td>
      <td><span class="badge badge-category">${esc(ROLE_LABELS[s.role] || s.role)}</span></td>
      <td>${formatDate(s.logged_in_at)}</td>
      <td>${s.logged_out_at ? formatDate(s.logged_out_at) : "—"}</td>
      <td>${formatDate(s.last_heartbeat_at)}</td>
      <td>${esc(s.duration_label)}</td>
      <td>${status}</td>
    </tr>`;
    })
    .join("");
}

async function loadUsers() {
  if (!state.currentUser || state.currentUser.role !== "admin") return;

  showTableSkeleton("users-table-body", 5, 5);

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
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No users yet</td></tr>`;
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
      <td>${u.email ? esc(u.email) : '<span class="text-muted">—</span>'}</td>
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
  document.getElementById("user-email-input").value = user.email || "";
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
    email: document.getElementById("user-email-input").value,
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
  // Restore persisted state before any rendering so cart/posMode/etc are ready
  const savedActiveView = restoreUIState();

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
  initHistoryShiftFilters();
  initPosShortcuts();
  initCashNoteInputs();
  initHeartbeat();

  document.getElementById("btn-attendance-refresh")?.addEventListener("click", () => {
    loadAttendance().catch((e) => toast(e.message, "error"));
  });
  document.getElementById("attendance-user-filter")?.addEventListener("change", () => {
    loadAttendance().catch((e) => toast(e.message, "error"));
  });

  // Apply persisted posMode before any view renders
  applyRestoredPosMode();

  if (isSeller()) {
    configureSellerReportsUi();
    loadCategories().then(() => {
      refreshSellerShift().then(() => {
        loadSellView().then(() => {
          updateSellerNavUi();
          applyRestoredPaymentMethod();
          // Navigate away from default sell view if user was on a different page
          if (savedActiveView && savedActiveView !== "sell" && canAccessView(savedActiveView)) {
            switchView(savedActiveView);
          }
        });
      });
    });
  } else {
    loadCategories()
      .then(() => loadDashboard())
      .then(() => {
        applyRestoredPaymentMethod();
        // Navigate away from default dashboard if user was on a different page
        if (savedActiveView && savedActiveView !== "dashboard" && canAccessView(savedActiveView)) {
          switchView(savedActiveView);
        }
      });
  }

  window.addEventListener("beforeunload", saveUIState);

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

  document.getElementById("sell-search")?.addEventListener("input", (e) => {
    state.sellSearch = e.target.value;
    renderQuickPick();
  });

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
  document.getElementById("btn-show-close")?.addEventListener("click", async () => {
    try {
      await refreshSellerShift();
    } catch (err) {
      toast(err.message, "error");
    }
    setShiftUiPhase("close");
    document.getElementById("cash-note-5000")?.focus();
  });
  document.getElementById("btn-back-to-sell")?.addEventListener("click", () => setShiftUiPhase("sell"));

  document.getElementById("void-sale-form")?.addEventListener("submit", submitVoidSale);

  document.getElementById("restock-form").addEventListener("submit", submitRestock);
  document.getElementById("adjust-form").addEventListener("submit", submitAdjust);

  document.getElementById("history-type-filter").addEventListener("change", loadHistory);
  document.getElementById("history-seller-filter")?.addEventListener("change", loadHistory);
  document.getElementById("history-category-filter")?.addEventListener("change", loadHistory);
  document.getElementById("sales-seller-filter")?.addEventListener("change", () => {
    const from = document.getElementById("sales-from")?.value;
    const to = document.getElementById("sales-to")?.value;
    state.selectedShiftId = null;
    loadSalesViewData(from, to);
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
window.selectShift = selectShift;
window.selectHistoryShift = selectHistoryShift;
window.openVoidSaleModal = openVoidSaleModal;
window.selectSellCategory = selectSellCategory;
window.openEditUser = openEditUser;
window.openDeleteUser = openDeleteUser;
window.openEditCategory = openEditCategory;
window.openDeleteCategory = openDeleteCategory;
