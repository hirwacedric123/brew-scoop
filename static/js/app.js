/**
 * Brew & Scoop Stock Management — Frontend
 */

const state = {
  products: [],
  dashboard: null,
  selectedProductId: null,
  deleteProductId: null,
  salesPreset: "today",
  salesFrom: null,
  salesTo: null,
  salesReport: null,
  selectedSalesDate: null,
};

const fmt = new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat("en-RW");

// ── API ────────────────────────────────────────────────────────────────────

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
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
  document.querySelectorAll(".nav-item[data-view], [data-view].btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
}

function switchView(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));

  document.getElementById(`view-${viewId}`)?.classList.add("active");
  document.querySelector(`.nav-item[data-view="${viewId}"]`)?.classList.add("active");

  if (viewId === "dashboard") loadDashboard();
  if (viewId === "products") loadProducts();
  if (viewId === "sell") loadSellView();
  if (viewId === "restock") loadRestockView();
  if (viewId === "history") loadHistory();
  if (viewId === "sales") loadSalesReports();
}

// ── Dashboard ──────────────────────────────────────────────────────────────

async function loadDashboard() {
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
    <div class="stat-card revenue">
      <div class="stat-label">Sold Today</div>
      <div class="stat-value">${fmt.format(d.revenue_today)}</div>
      <div class="stat-sub">${fmtNum.format(d.units_sold_today)} units · ${todayLabel}</div>
    </div>
    <div class="stat-card sales">
      <div class="stat-label">This Week</div>
      <div class="stat-value">${fmt.format(d.revenue_week)}</div>
      <div class="stat-sub">${fmtNum.format(d.units_sold_week)} units sold</div>
    </div>
    <div class="stat-card" style="--accent: var(--amber)">
      <div class="stat-label">This Month</div>
      <div class="stat-value">${fmt.format(d.revenue_month)}</div>
      <div class="stat-sub">${fmtNum.format(d.units_sold_month)} units sold</div>
    </div>
    <div class="stat-card stock">
      <div class="stat-label">Inventory Value</div>
      <div class="stat-value">${fmt.format(d.inventory_value)}</div>
      <div class="stat-sub">${fmtNum.format(d.total_stock_units)} units · ${d.total_products} products</div>
    </div>
    <div class="stat-card alert">
      <div class="stat-label">Stock Alerts</div>
      <div class="stat-value">${d.low_stock_count}</div>
      <div class="stat-sub">${d.out_of_stock_count} out of stock</div>
    </div>
  `;

  document.getElementById("low-stock-label").textContent =
    d.low_stock_count ? `${d.low_stock_count} items need attention` : "All good";

  const lowList = document.getElementById("low-stock-list");
  if (!d.low_stock_items.length) {
    lowList.innerHTML = '<div class="empty-state">All products are well stocked ☕</div>';
  } else {
    lowList.innerHTML = d.low_stock_items
      .map(
        (p) => `
      <div class="list-item">
        <div class="list-item-info">
          <strong>${esc(p.name)}</strong>
          <span>${esc(p.category)} · Reorder at ${p.reorder_level}</span>
        </div>
        <span class="badge badge-stock ${p.stock_status}">${p.quantity} left</span>
      </div>`
      )
      .join("");
  }

  const topList = document.getElementById("top-products-list");
  if (!d.top_products.filter((p) => p.units_sold > 0).length) {
    topList.innerHTML = '<div class="empty-state">No sales recorded yet</div>';
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
    ? d.categories
        .map(
          (c) => `
      <div class="category-bar-item">
        <div class="category-bar-header">
          <span>${esc(c.name)}</span>
          <span>${fmt.format(c.value)} · ${c.total_qty} units</span>
        </div>
        <div class="category-bar-track">
          <div class="category-bar-fill" style="width:${(c.value / maxVal) * 100}%"></div>
        </div>
      </div>`
        )
        .join("")
    : '<div class="empty-state">No products yet</div>';

  const recent = document.getElementById("recent-activity");
  if (!d.recent_transactions.length) {
    recent.innerHTML = '<div class="empty-state">No activity yet</div>';
  } else {
    recent.innerHTML = d.recent_transactions
      .map(
        (t) => `
      <div class="list-item">
        <div class="list-item-info">
          <strong>${esc(t.product_name)}</strong>
          <span>${formatDate(t.created_at)}</span>
        </div>
        <div style="text-align:right">
          ${typeBadge(t.type)}
          <div style="font-size:0.82rem;margin-top:0.2rem;color:var(--coffee);font-weight:600">
            ${t.type === "sale" ? fmt.format(t.total_amount) : `${t.quantity > 0 ? "+" : ""}${t.quantity} units`}
          </div>
        </div>
      </div>`
      )
      .join("");
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

  try {
    state.products = await api(`/api/products?${params}`);
    renderProductsTable(state.products);
  } catch (e) {
    toast(e.message, "error");
  }
}

function renderProductsTable(products) {
  const tbody = document.getElementById("products-table-body");
  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No products found. Add your first item!</td></tr>`;
    return;
  }

  tbody.innerHTML = products
    .map(
      (p) => `
    <tr>
      <td>
        <div class="product-cell">
          <strong>${esc(p.name)}</strong>
          <span>${p.sku ? esc(p.sku) : "No SKU"}</span>
        </div>
      </td>
      <td><span class="badge badge-category">${esc(p.category)}</span></td>
      <td>${fmt.format(p.price)}</td>
      <td><strong>${fmtNum.format(p.quantity)}</strong></td>
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

function stockLabel(p) {
  if (p.stock_status === "out") return "Out of stock";
  if (p.stock_status === "low") return "Low stock";
  return "In stock";
}

function openAddProduct() {
  document.getElementById("product-modal-title").textContent = "Add Product";
  document.getElementById("product-form").reset();
  document.getElementById("product-id").value = "";
  document.getElementById("quantity-group").style.display = "";
  document.getElementById("product-reorder").value = "10";
  showModal("product-modal");
}

async function openEditProduct(id) {
  try {
    const p = await api(`/api/products/${id}`);
    document.getElementById("product-modal-title").textContent = "Edit Product";
    document.getElementById("product-id").value = p.id;
    document.getElementById("product-name").value = p.name;
    document.getElementById("product-category").value = p.category;
    document.getElementById("product-sku").value = p.sku;
    document.getElementById("product-price").value = p.price;
    document.getElementById("product-reorder").value = p.reorder_level;
    document.getElementById("product-description").value = p.description;
    document.getElementById("quantity-group").style.display = "none";
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
  const payload = {
    name: document.getElementById("product-name").value,
    category: document.getElementById("product-category").value,
    sku: document.getElementById("product-sku").value,
    price: parseFloat(document.getElementById("product-price").value),
    reorder_level: parseInt(document.getElementById("product-reorder").value, 10),
    description: document.getElementById("product-description").value,
  };

  if (!id) {
    payload.quantity = parseInt(document.getElementById("product-quantity").value, 10) || 0;
  }

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

// ── Sell ───────────────────────────────────────────────────────────────────

async function loadSellView() {
  try {
    state.products = await api("/api/products");
    populateProductSelects();
    renderQuickPick();
    updateSellPreview();
  } catch (e) {
    toast(e.message, "error");
  }
}

function populateProductSelects() {
  const inStock = state.products.filter((p) => p.quantity > 0);
  const all = state.products;

  const sellSelect = document.getElementById("sell-product");
  sellSelect.innerHTML =
    '<option value="">Choose a product...</option>' +
    inStock.map((p) => `<option value="${p.id}">${esc(p.name)} — ${p.quantity} in stock</option>`).join("");

  ["restock-product", "adjust-product"].forEach((id) => {
    const sel = document.getElementById(id);
    sel.innerHTML =
      '<option value="">Choose a product...</option>' +
      all.map((p) => `<option value="${p.id}">${esc(p.name)} (${p.quantity} units)</option>`).join("");
  });
}

function renderQuickPick() {
  const grid = document.getElementById("quick-pick-grid");
  if (!state.products.length) {
    grid.innerHTML = '<div class="empty-state">Add products first</div>';
    return;
  }

  grid.innerHTML = state.products
    .map(
      (p) => `
    <button type="button" class="quick-pick-item ${p.quantity <= 0 ? "out-of-stock" : ""}"
      ${p.quantity <= 0 ? "disabled" : `onclick="selectQuickPick(${p.id})"`}>
      <strong>${esc(p.name)}</strong>
      <span>${esc(p.category)} · ${p.quantity} left</span>
      <div class="qp-price">${fmt.format(p.price)}</div>
    </button>`
    )
    .join("");
}

function selectQuickPick(id) {
  document.getElementById("sell-product").value = id;
  updateSellPreview();
}

function updateSellPreview() {
  const id = parseInt(document.getElementById("sell-product").value, 10);
  const preview = document.getElementById("sell-preview");
  const product = state.products.find((p) => p.id === id);

  if (!product) {
    preview.hidden = true;
    document.getElementById("sell-total").textContent = fmt.format(0);
    return;
  }

  preview.hidden = false;
  document.getElementById("preview-price").textContent = fmt.format(product.price);
  document.getElementById("preview-stock").textContent = `${product.quantity} units`;
  document.getElementById("preview-category").textContent = product.category;

  const qtyInput = document.getElementById("sell-quantity");
  qtyInput.max = product.quantity;
  if (parseInt(qtyInput.value, 10) > product.quantity) {
    qtyInput.value = product.quantity;
  }

  updateSellTotal();
}

function updateSellTotal() {
  const id = parseInt(document.getElementById("sell-product").value, 10);
  const product = state.products.find((p) => p.id === id);
  const qty = parseInt(document.getElementById("sell-quantity").value, 10) || 0;
  const total = product ? product.price * qty : 0;
  document.getElementById("sell-total").textContent = fmt.format(total);
}

function adjustQty(delta) {
  const input = document.getElementById("sell-quantity");
  const max = parseInt(input.max, 10) || 9999;
  let val = (parseInt(input.value, 10) || 1) + delta;
  val = Math.max(1, Math.min(val, max));
  input.value = val;
  updateSellTotal();
}

async function completeSale(e) {
  e.preventDefault();
  const productId = parseInt(document.getElementById("sell-product").value, 10);
  const quantity = parseInt(document.getElementById("sell-quantity").value, 10);
  const notes = document.getElementById("sell-notes").value;

  if (!productId) {
    toast("Please select a product", "error");
    return;
  }

  const btn = document.getElementById("btn-complete-sale");
  btn.disabled = true;

  try {
    const result = await api("/api/sales", {
      method: "POST",
      body: JSON.stringify({ product_id: productId, quantity, notes }),
    });

    document.getElementById("sale-success-details").innerHTML = `
      <p><span>Product</span><strong>${esc(result.product.name)}</strong></p>
      <p><span>Quantity</span><strong>${result.quantity_sold}</strong></p>
      <p><span>Total</span><strong>${fmt.format(result.total_amount)}</strong></p>
      <p><span>Remaining Stock</span><strong>${result.remaining_stock} units</strong></p>
    `;
    showModal("sale-success-modal");

    document.getElementById("sell-form").reset();
    document.getElementById("sell-quantity").value = "1";
    document.getElementById("sell-preview").hidden = true;
    document.getElementById("sell-total").textContent = fmt.format(0);

    await loadSellView();
    loadDashboard();
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

function quickSell(id) {
  switchView("sell");
  setTimeout(() => {
    document.getElementById("sell-product").value = id;
    updateSellPreview();
  }, 100);
}

// ── Restock ────────────────────────────────────────────────────────────────

async function loadRestockView() {
  try {
    state.products = await api("/api/products");
    populateProductSelects();
  } catch (e) {
    toast(e.message, "error");
  }
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
    loadRestockView();
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
});

// ── History ────────────────────────────────────────────────────────────────

async function loadHistory() {
  const type = document.getElementById("history-type-filter").value;
  const params = type ? `?type=${type}&limit=100` : "?limit=100";

  try {
    const transactions = await api(`/api/transactions${params}`);
    renderHistory(transactions);
  } catch (e) {
    toast(e.message, "error");
  }
}

function renderHistory(transactions) {
  const tbody = document.getElementById("history-table-body");
  if (!transactions.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No transactions yet</td></tr>`;
    return;
  }

  tbody.innerHTML = transactions
    .map(
      (t) => `
    <tr>
      <td>${formatDate(t.created_at)}</td>
      <td>
        <div class="product-cell">
          <strong>${esc(t.product_name)}</strong>
          <span>${esc(t.category)}</span>
        </div>
      </td>
      <td>${typeBadge(t.type)}</td>
      <td>${t.type === "sale" ? "−" : "+"}${t.quantity}</td>
      <td>${t.type === "sale" ? fmt.format(t.total_amount) : "—"}</td>
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
    let url = "/api/sales/report?";
    if (state.salesPreset === "custom" && from && to) {
      url += `from=${from}&to=${to}`;
    } else if (state.salesPreset !== "custom") {
      url += `preset=${state.salesPreset}`;
    } else {
      return;
    }

    state.salesReport = await api(url);
    state.salesFrom = state.salesReport.from;
    state.salesTo = state.salesReport.to;
    renderSalesReport(state.salesReport);
  } catch (e) {
    toast(e.message, "error");
  }
}

function renderSalesReport(report) {
  const { summary, daily_breakdown, sales, from, to } = report;

  document.getElementById("sales-summary-stats").innerHTML = `
    <div class="stat-card revenue">
      <div class="stat-label">Total Revenue</div>
      <div class="stat-value">${fmt.format(summary.revenue)}</div>
      <div class="stat-sub">${formatRangeLabel(from, to)}</div>
    </div>
    <div class="stat-card sales">
      <div class="stat-label">Units Sold</div>
      <div class="stat-value">${fmtNum.format(summary.units)}</div>
      <div class="stat-sub">items in this period</div>
    </div>
    <div class="stat-card stock">
      <div class="stat-label">Transactions</div>
      <div class="stat-value">${fmtNum.format(summary.transactions)}</div>
      <div class="stat-sub">sales recorded</div>
    </div>
    <div class="stat-card alert">
      <div class="stat-label">Active Days</div>
      <div class="stat-value">${daily_breakdown.length}</div>
      <div class="stat-sub">days with sales</div>
    </div>
  `;

  document.getElementById("sales-range-label").textContent = formatRangeLabel(from, to);

  const datesList = document.getElementById("sales-dates-list");
  if (!daily_breakdown.length) {
    datesList.innerHTML = '<div class="empty-state">No sales in this period</div>';
    renderSalesDetail([], null);
    return;
  }

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
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No sales to show</td></tr>`;
    return;
  }

  tbody.innerHTML = sales
    .map(
      (s) => `
    <tr>
      <td>${formatTime(s.created_at)}</td>
      <td>
        <div class="product-cell">
          <strong>${esc(s.product_name)}</strong>
          <span>${esc(s.category)}</span>
        </div>
      </td>
      <td>${s.quantity}</td>
      <td><strong>${fmt.format(s.total_amount)}</strong></td>
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
  document.getElementById("current-date").textContent = new Date().toLocaleDateString("en-RW", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  initNavigation();
  initSalesReports();

  document.getElementById("btn-add-product").addEventListener("click", openAddProduct);
  document.getElementById("product-form").addEventListener("submit", saveProduct);
  document.getElementById("confirm-delete").addEventListener("click", confirmDelete);

  document.getElementById("product-search").addEventListener("input", debounce(loadProducts, 300));
  document.getElementById("product-category-filter").addEventListener("change", loadProducts);
  document.getElementById("low-stock-filter").addEventListener("change", loadProducts);

  document.getElementById("sell-product").addEventListener("change", updateSellPreview);
  document.getElementById("sell-quantity").addEventListener("input", updateSellTotal);
  document.getElementById("qty-minus").addEventListener("click", () => adjustQty(-1));
  document.getElementById("qty-plus").addEventListener("click", () => adjustQty(1));
  document.getElementById("sell-form").addEventListener("submit", completeSale);

  document.getElementById("restock-form").addEventListener("submit", submitRestock);
  document.getElementById("adjust-form").addEventListener("submit", submitAdjust);

  document.getElementById("history-type-filter").addEventListener("change", loadHistory);

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

  loadDashboard();
});

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Expose for inline handlers
window.openEditProduct = openEditProduct;
window.openDeleteProduct = openDeleteProduct;
window.quickSell = quickSell;
window.selectQuickPick = selectQuickPick;
window.selectSalesDate = selectSalesDate;
