const categories = [
  "Meat", "Poultry", "Seafood", "Vegetables", "Fruits", "Dairy & Eggs",
  "Dry Goods", "Grains & Pasta", "Bakery", "Frozen Foods", "Beverages",
  "Condiments", "Spices & Herbs", "Oils & Vinegars", "Canned & Packaged",
  "Sauces & Seasonings", "Desserts", "Kitchen Supplies", "Cleaning Supplies",
  "Packaging & Disposables", "Food Service Supplies", "Equipment & Smallwares", "Other"
];
const isAdmin = document.body.dataset.admin === "true";
const state = { items: [], inventoryCatalog: [], page: 1, pageSize: 10, reportRows: [] };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function money(value) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function quantity(value) {
  return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 3 }).format(Number(value || 0));
}

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function toast(message, error = false) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.toggle("error", error);
  element.classList.add("visible");
  window.setTimeout(() => element.classList.remove("visible"), 3200);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.method && options.method !== "GET" ? { "X-CSRF-Token": document.body.dataset.csrf } : {}),
      ...options.headers
    }
  });
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (response.status === 204) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}

function showEmpty(row, columns, message) {
  row.innerHTML = `<tr><td class="empty-cell" colspan="${columns}">${escapeHtml(message)}</td></tr>`;
}

function itemStatus(item) {
  const available = Number(item.availableQuantity ?? item.quantity);
  if (available <= 0) return ["Out of stock", "status-out"];
  if (available <= Number(item.minimumStock)) return ["Low stock", "status-low"];
  return ["In stock", "status-good"];
}

function stockBadge(type) {
  const labels = { stock_in: "Stock in", usage: "Usage", waste: "Waste", damaged: "Damaged", expired: "Expired" };
  return `<span class="movement movement-${escapeHtml(type)}">${escapeHtml(labels[type] || type)}</span>`;
}

function transactionSource(entry) {
  if (entry.supplierName && entry.supplierName !== "EXPIRY FEATURE TEST - NOT REAL STOCK") {
    return entry.supplierName;
  }
  return entry.type === "stock_in" ? "Supplier not recorded" : "—";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleDateString("en-PH", { day: "2-digit", month: "short", year: "numeric" });
}

function fillCategories() {
  $("#categoryFilter").innerHTML = `<option value="">All categories</option>${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}`;
  $('select[name="category"]').innerHTML = categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
}

function renderDashboardCharts(result) {
  const { items, low, out } = result.totals;
  const inStock = Math.max(0, items - low - out);
  const segments = [
    { label: "In stock", value: inStock, color: "var(--chart-stock)", className: "legend-stock" },
    { label: "Running low", value: low, color: "var(--chart-low)", className: "legend-low" },
    { label: "Out of stock", value: out, color: "var(--chart-out)", className: "legend-out" }
  ];
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let angle = 0;
  const stops = segments.map((segment) => {
    const end = angle + (total ? segment.value / total * 360 : 0);
    const stop = `${segment.color} ${angle}deg ${end}deg`;
    angle = end;
    return stop;
  });
  const donut = $("#stockDonut");
  donut.style.background = total
    ? `conic-gradient(from -90deg, ${stops.join(", ")})`
    : "conic-gradient(from -90deg, #284438 0deg 360deg)";
  donut.setAttribute("aria-label", `Stock distribution: ${inStock} in stock, ${low} running low, ${out} out of stock.`);
  $("#stockDonutTotal").textContent = quantity(items);
  $("#stockLegend").innerHTML = segments.map((segment) => `
    <div class="legend-row ${segment.className}">
      <span class="legend-label"><i aria-hidden="true"></i>${segment.label}</span>
      <strong>${quantity(segment.value)}</strong>
    </div>`).join("");

  const restockItems = result.restockItems || [];
  const chart = $("#movementChart");
  chart.setAttribute("aria-label", `Current items needing restock, ordered with out-of-stock items first: ${restockItems.length} shown.`);
  chart.innerHTML = restockItems.length ? restockItems.map((item) => {
    const available = Number(item.availableQuantity) || 0;
    const minimum = Number(item.minimumStock) || 0;
    const depletion = item.status === "Out of stock"
      ? 100
      : Math.max(4, (1 - available / minimum) * 100);
    const stockClass = item.status === "Out of stock" ? "movement-out" : "movement-low";
    return `<div class="movement-column ${stockClass}" title="${escapeHtml(item.name)} · ${escapeHtml(item.status)} · ${escapeHtml(quantity(available))} ${escapeHtml(item.unit)} available · minimum ${escapeHtml(quantity(minimum))}">
      <span class="movement-value">${escapeHtml(quantity(available))}</span>
      <div class="movement-track"><i style="--bar-height:${depletion}%"></i></div>
      <span class="movement-date">${escapeHtml(item.name)}</span>
    </div>`;
  }).join("") : `<div class="chart-empty">No items are currently low or out of stock.</div>`;
}

function renderLowStock(items, target = "#lowStockBody") {
  const body = $(target);
  const lowItems = items.slice(0, 5);
  if (!lowItems.length) return showEmpty(body, 3, "All ingredients are above their minimum stock levels.");
  body.innerHTML = lowItems.map((item) => {
    const [label, status] = itemStatus(item);
    return `<tr>
      <td><span class="inventory-item-name"><span class="inventory-thumb" data-category="${escapeHtml(item.category)}" aria-hidden="true"></span><span><strong>${escapeHtml(item.name)}</strong><small class="table-sub">${escapeHtml(item.code)}</small></span></span></td>
      <td><strong>${quantity(item.availableQuantity ?? item.quantity)}</strong> ${escapeHtml(item.unit)}</td>
      <td><span class="status ${status}">${label}</span></td>
    </tr>`;
  }).join("");
}

function renderCategoryCards(items = state.inventoryCatalog) {
  const selected = $("#categoryFilter").value;
  const counts = new Map(categories.map((category) => [category, 0]));
  for (const item of items) counts.set(item.category, (counts.get(item.category) || 0) + 1);
  const cards = categories.map((category) => ({
    name: category,
    label: category,
    count: counts.get(category) || 0
  }));
  $("#categoryCards").innerHTML = cards.map((category) => `
    <button class="category-card ${selected === category.name ? "selected" : ""}" type="button" data-select-category="${escapeHtml(category.name)}" aria-pressed="${selected === category.name}">
      <span class="category-cover" data-category="${escapeHtml(category.name)}"><span class="category-count">${quantity(category.count)} items</span></span>
      <span class="category-name">${escapeHtml(category.label)}</span>
    </button>`).join("");
}

async function loadDashboard() {
  const [result, lowStock, outOfStock, inventoryCatalog] = await Promise.all([
    api("/api/dashboard"),
    api("/api/items?status=low&sort=quantity"),
    api("/api/items?status=out&sort=quantity"),
    api("/api/items?sort=name")
  ]);
  state.inventoryCatalog = inventoryCatalog;
  renderCategoryCards();
  $("#metricItems").textContent = quantity(result.totals.items);
  $("#metricUnits").textContent = quantity(result.totals.units);
  $("#metricLow").textContent = quantity(result.totals.low);
  $("#metricOut").textContent = quantity(result.totals.out);
  $("#metricExpiring").textContent = quantity(result.totals.expiring);
  $("#metricExpired").textContent = quantity(result.totals.expired);
  $("#metricValue").textContent = money(result.totals.valuation);
  $("#inventoryMetricItems").textContent = quantity(result.totals.items);
  $("#inventoryMetricUnits").textContent = quantity(result.totals.units);
  $("#inventoryMetricLow").textContent = quantity(result.totals.low);
  $("#inventoryMetricOut").textContent = quantity(result.totals.out);
  renderDashboardCharts(result);
  const alerts = $("#alertsBody");
  if (!result.alerts.length) {
    showEmpty(alerts, 4, "No expiring or expired batches. Looking good!");
  } else {
    alerts.innerHTML = result.alerts.map((entry) => `<tr>
      <td><strong>${escapeHtml(entry.item)}</strong><small class="table-sub">${escapeHtml(entry.code)}</small></td>
      <td>${quantity(entry.quantity)} ${escapeHtml(entry.unit)}</td>
      <td>${formatDate(entry.expirationDate)}</td>
      <td><span class="status ${entry.expired ? "status-out" : "status-low"}">${entry.expired ? "Expired" : "Expiring"}</span></td>
    </tr>`).join("");
  }
  const recent = $("#recentTransactions");
  if (!result.recent.length) {
    showEmpty(recent, 4, "No inventory movement recorded yet.");
  } else {
    recent.innerHTML = result.recent.map((entry) => `<tr>
      <td>${formatDate(entry.transactionDate)}</td>
      <td>${stockBadge(entry.type)}</td>
      <td><strong>${escapeHtml(entry.item)}</strong><small class="table-sub">${escapeHtml(entry.code)}</small></td>
      <td class="${entry.type === "stock_in" ? "text-green" : "text-red"}">${entry.type === "stock_in" ? "+" : "−"}${quantity(entry.quantity)} ${escapeHtml(entry.unit)}</td>
    </tr>`).join("");
  }
  const stockAlerts = [...outOfStock, ...lowStock];
  renderLowStock(stockAlerts);
  renderLowStock(stockAlerts, "#inventoryAlertsBody");
}

function renderItems() {
  const filtered = state.items;
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * state.pageSize;
  const visible = filtered.slice(start, start + state.pageSize);
  const body = $("#itemsBody");
  $("#itemCount").textContent = `${filtered.length} ${filtered.length === 1 ? "item" : "items"}`;
  $("#paginationLabel").textContent = filtered.length ? `Showing ${start + 1}–${Math.min(start + state.pageSize, filtered.length)} of ${filtered.length}` : "No inventory items";
  $("#prevPage").disabled = state.page <= 1;
  $("#nextPage").disabled = state.page >= totalPages;
  if (!visible.length) return showEmpty(body, 8, "No items match these filters.");
  body.innerHTML = visible.map((item) => {
    const [label, status] = itemStatus(item);
    return `<tr>
      <td>${escapeHtml(item.code)}</td>
      <td><span class="inventory-item-name"><span class="inventory-thumb" data-category="${escapeHtml(item.category)}" aria-hidden="true"></span><strong>${escapeHtml(item.name)}</strong></span></td>
      <td><span class="category-badge" data-category="${escapeHtml(item.category)}">${escapeHtml(item.category)}</span></td>
      <td>${escapeHtml(item.unit)}</td>
      <td class="${status === "status-out" ? "text-red" : ""}"><strong>${quantity(item.availableQuantity ?? item.quantity)}</strong></td>
      <td>${quantity(item.minimumStock)}</td>
      <td><span class="status ${status}">${label}</span></td>
      <td class="action-cell">${isAdmin ? `<button class="row-action" data-action="edit" data-id="${item.id}" aria-label="Edit ${escapeHtml(item.name)}">Edit</button>` : ""}
        ${isAdmin ? `<button class="row-action danger-action" data-action="archive" data-id="${item.id}" aria-label="Delete ${escapeHtml(item.name)}" title="Delete item (archive)">Delete</button>` : ""}</td>
    </tr>`;
  }).join("");
}

async function loadItems() {
  const params = new URLSearchParams();
  if ($("#itemSearch").value.trim()) params.set("search", $("#itemSearch").value.trim());
  if ($("#categoryFilter").value) params.set("category", $("#categoryFilter").value);
  if ($("#statusFilter").value) params.set("status", $("#statusFilter").value);
  const [sort, direction] = $("#sortFilter").value.split("-");
  params.set("sort", sort);
  if (direction === "desc") params.set("direction", direction);
  state.items = await api(`/api/items?${params}`);
  state.page = 1;
  renderItems();
}

function renderTransactions(entries) {
  const body = $("#transactionsBody");
  if (!entries.length) return showEmpty(body, 7, "No transactions found for this date range.");
  body.innerHTML = entries.map((entry) => `<tr>
    <td>${formatDate(entry.transactionDate)}</td>
    <td>${formatDate(entry.deliveryDate)}</td>
    <td><strong>${escapeHtml(entry.item)}</strong><small class="table-sub">${escapeHtml(entry.code)}</small></td>
    <td>${stockBadge(entry.type)}</td>
    <td>${quantity(entry.quantity)} ${escapeHtml(entry.unit)}</td>
    <td>${quantity(entry.balanceAfter)} ${escapeHtml(entry.unit)}</td>
    <td>${escapeHtml(transactionSource(entry))}</td>
  </tr>`).join("");
}

async function loadTransactions() {
  const result = await api("/api/reports?type=all");
  renderTransactions(result.rows);
}

function renderReport(result) {
  const head = $("#reportHead");
  const body = $("#reportBody");
  const reportNames = {
    stock: "Current Stock",
    low_stock: "Low-stock Items",
    out_of_stock: "Out-of-stock Items",
    valuation: "Inventory Valuation",
    stock_in: "Stock-in History",
    usage: "Usage",
    waste: "Waste",
    damaged: "Damaged Goods",
    expired: "Expired Stock",
    expiring: "Expiring Stock",
    all: "All Movements"
  };
  $("#reportCaption").textContent = [
    `JAPZGRILL — ${reportNames[result.type] || "Inventory Report"}`,
    `Generated ${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`
  ].filter(Boolean).join(" · ");
  const itemReport = ["stock", "low_stock", "out_of_stock", "valuation"].includes(result.type);
  if (itemReport) {
    head.innerHTML = "<tr><th>ITEM</th><th>CODE</th><th>CATEGORY</th><th>AVAILABLE</th><th>ON HAND</th><th>MIN. LEVEL</th><th>UNIT COST</th><th>VALUATION</th><th>STATUS</th></tr>";
    body.innerHTML = result.rows.length ? result.rows.map((item) => {
      const [label, status] = itemStatus(item);
      return `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.category)}</td><td>${quantity(item.availableQuantity)} ${escapeHtml(item.unit)}</td><td>${quantity(item.quantity)} ${escapeHtml(item.unit)}</td><td>${quantity(item.minimumStock)} ${escapeHtml(item.unit)}</td><td>${money(item.unitCost)}</td><td>${money(Number(item.quantity) * Number(item.unitCost))}</td><td><span class="status ${status}">${label}</span></td></tr>`;
    }).join("") : "";
  } else if (["expired", "expiring"].includes(result.type)) {
    head.innerHTML = "<tr><th>EXPIRATION</th><th>ITEM</th><th>CODE</th><th>CATEGORY</th><th>QUANTITY</th><th>UNIT</th><th>SUPPLIER</th></tr>";
    body.innerHTML = result.rows.length ? result.rows.map((entry) => `<tr><td>${formatDate(entry.expirationDate)}</td><td><strong>${escapeHtml(entry.item)}</strong></td><td>${escapeHtml(entry.code)}</td><td>${escapeHtml(entry.category)}</td><td>${quantity(entry.quantity)}</td><td>${escapeHtml(entry.unit)}</td><td>${escapeHtml(entry.supplierName || "—")}</td></tr>`).join("") : "";
  } else {
    head.innerHTML = "<tr><th>RECORDED AT</th><th>DELIVERY DATE</th><th>ITEM</th><th>CODE</th><th>CATEGORY</th><th>TYPE</th><th>QUANTITY</th><th>UNIT</th><th>BALANCE</th><th>UNIT COST</th><th>SUPPLIER / DATA</th></tr>";
    body.innerHTML = result.rows.length ? result.rows.map((entry) => `<tr><td>${formatDate(entry.transactionDate)}</td><td>${formatDate(entry.deliveryDate)}</td><td>${escapeHtml(entry.item)}</td><td>${escapeHtml(entry.code)}</td><td>${escapeHtml(entry.category)}</td><td>${stockBadge(entry.type)}</td><td>${quantity(entry.quantity)}</td><td>${escapeHtml(entry.unit)}</td><td>${quantity(entry.balanceAfter)}</td><td>${money(entry.unitCost)}</td><td>${escapeHtml(transactionSource(entry))}</td></tr>`).join("") : "";
  }
  if (!result.rows.length) {
    showEmpty(body, itemReport ? 9 : ["expired", "expiring"].includes(result.type) ? 7 : 11, "No records match the selected filters.");
  }
  $("#reportCount").textContent = `${result.rows.length} ${result.rows.length === 1 ? "record" : "records"}`;
  state.reportRows = result.rows;
}

async function runReport() {
  renderReport(await api("/api/reports?type=stock"));
}

function openModal(id) {
  $(id).hidden = false;
  document.body.classList.add("modal-open");
  const firstInput = $("input:not([type=hidden]), select", $(id));
  firstInput?.focus();
}

function closeModals() {
  $$(".modal-backdrop").forEach((modal) => { modal.hidden = true; });
  document.body.classList.remove("modal-open");
}

function openItemForm(item = null) {
  const form = $("#itemForm");
  form.reset();
  form.elements.id.value = item?.id || "";
  $("#itemModalTitle").textContent = item ? "Edit inventory item" : "Add inventory item";
  $("#itemError").textContent = "";
  for (const field of ["name", "code", "category", "unit", "minimumStock", "unitCost", "description"]) {
    if (item) form.elements[field].value = item[field] ?? "";
  }
  openModal("#itemModal");
}

function openTransactionForm(item, type = "usage") {
  const form = $("#transactionForm");
  form.reset();
  $("#movementType").value = type;
  form.elements.itemId.value = item.id;
  form.elements.deliveryDate.value = localDate();
  form.elements.unitCost.value = item.unitCost;
  $("#transactionItemName").textContent = `${item.name} · ${quantity(item.availableQuantity ?? item.quantity)} ${item.unit} available · ${quantity(item.quantity)} on hand`;
  $("#transactionError").textContent = "";
  toggleStockInFields();
  $("#transactionModalTitle").textContent = type === "stock_in" ? "Add stock" : "Record stock movement";
  $("#transactionSubmitButton").textContent = type === "stock_in" ? "Add Stock" : "Confirm movement";
  openModal("#transactionModal");
}

function toggleStockInFields() {
  const isStockIn = $("#movementType").value === "stock_in";
  $$(".stock-in-field").forEach((field) => {
    field.hidden = !isStockIn;
    const input = $("input", field);
    if (input) {
      input.disabled = !isStockIn;
      input.required = isStockIn;
    }
  });
}

function exportCsv() {
  if (!state.reportRows.length) return toast("There are no current-stock records to export.", true);
  const headers = $$(`#reportHead th`).map((th) => th.textContent.trim());
  const type = "stock";
  const isStock = ["stock", "low_stock", "out_of_stock", "valuation"].includes(type);
  const isExpiry = ["expired", "expiring"].includes(type);
  const rows = state.reportRows.map((entry) => isStock
    ? [entry.name, entry.code, entry.category, `${entry.availableQuantity} ${entry.unit}`, `${entry.quantity} ${entry.unit}`, `${entry.minimumStock} ${entry.unit}`, entry.unitCost, Number(entry.quantity) * Number(entry.unitCost), itemStatus(entry)[0]]
    : isExpiry
      ? [entry.expirationDate, entry.item, entry.code, entry.category, entry.quantity, entry.unit, entry.supplierName || ""]
    : [entry.transactionDate, entry.deliveryDate || "", entry.item, entry.code, entry.category, entry.type, entry.quantity, entry.unit, entry.balanceAfter, entry.unitCost, transactionSource(entry)]);
  const csvEscape = (value) => {
    const text = String(value ?? "");
    const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
  };
  const content = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" }));
  link.href = url;
  link.download = `japzgrill-${type}-report-${localDate()}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function switchPage(page) {
  $$(".page-view").forEach((view) => view.classList.toggle("active", view.id === `page-${page}`));
  $$(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.page === page));
  const breadcrumb = $("#breadcrumbCurrent");
  if (breadcrumb) breadcrumb.textContent = ({ dashboard: "Overview", inventory: "Inventory", transactions: "Transactions", reports: "Reports" })[page] || "Overview";
  $("#sidebar").classList.remove("mobile-open");
  if (page === "inventory") loadItems().catch((error) => toast(error.message, true));
  if (page === "transactions") loadTransactions().catch((error) => toast(error.message, true));
  if (page === "reports") runReport().catch((error) => toast(error.message, true));
}

document.addEventListener("click", async (event) => {
  const categoryCard = event.target.closest("[data-select-category]");
  if (categoryCard) {
    $("#categoryFilter").value = categoryCard.dataset.selectCategory;
    renderCategoryCards();
    loadItems().catch((error) => toast(error.message, true));
    return;
  }
  if (event.target.closest("[data-clear-category]")) {
    $("#categoryFilter").value = "";
    $("#statusFilter").value = "";
    $("#itemSearch").value = "";
    renderCategoryCards();
    loadItems().catch((error) => toast(error.message, true));
    return;
  }
  const filterStatus = event.target.closest("[data-filter-status]");
  if (filterStatus) {
    $("#statusFilter").value = filterStatus.dataset.filterStatus;
    $("#categoryFilter").value = "";
    renderCategoryCards();
    loadItems().catch((error) => toast(error.message, true));
    return;
  }
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) return switchPage(pageButton.dataset.page);
  if (event.target.closest("[data-open-item]")) return openItemForm();
  if (event.target.closest("[data-close-modal]")) return closeModals();
  const action = event.target.closest("[data-action]");
  if (!action) return;
  const item = state.items.find((candidate) => candidate.id === Number(action.dataset.id));
  if (!item) return;
  if (action.dataset.action === "add-stock") return openTransactionForm(item, "stock_in");
  if (action.dataset.action === "transaction") return openTransactionForm(item);
  if (action.dataset.action === "edit") return openItemForm(item);
  if (action.dataset.action === "archive" && window.confirm(`Archive ${item.name}? The transaction history will be retained.`)) {
    try {
      await api(`/api/items/${item.id}`, { method: "DELETE" });
      toast("Item archived.");
      await Promise.all([loadItems(), loadDashboard()]);
    } catch (error) {
      toast(error.message, true);
    }
  }
});

$("#itemForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const id = data.id;
  delete data.id;
  try {
    await api(id ? `/api/items/${id}` : "/api/items", { method: id ? "PATCH" : "POST", body: JSON.stringify(data) });
    closeModals();
    toast(id ? "Item details updated." : "Inventory item created.");
    await loadItems();
    await loadDashboard();
  } catch (error) {
    $("#itemError").textContent = error.message;
  }
});

$("#transactionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const itemId = data.itemId;
  const isStockIn = data.type === "stock_in";
  delete data.itemId;
  try {
    await api(`/api/items/${itemId}/transactions`, { method: "POST", body: JSON.stringify(data) });
    closeModals();
    toast(isStockIn ? "Stock added successfully." : "Inventory movement recorded.");
    await Promise.all([loadDashboard(), loadItems()]);
    if ($("#page-transactions").classList.contains("active")) await loadTransactions();
  } catch (error) {
    $("#transactionError").textContent = error.message;
  }
});

$("#movementType").addEventListener("change", toggleStockInFields);
$("#itemSearch").addEventListener("input", () => {
  window.clearTimeout(state.searchTimer);
  state.searchTimer = window.setTimeout(() => loadItems().catch((error) => toast(error.message, true)), 200);
});
$("#globalItemSearch").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  $("#itemSearch").value = event.currentTarget.value;
  switchPage("inventory");
});
$("#categoryFilter").addEventListener("change", () => {
  renderCategoryCards();
  loadItems().catch((error) => toast(error.message, true));
});
$("#statusFilter").addEventListener("change", () => loadItems().catch((error) => toast(error.message, true)));
$("#sortFilter").addEventListener("change", () => loadItems().catch((error) => toast(error.message, true)));
$("#prevPage").addEventListener("click", () => { state.page--; renderItems(); });
$("#nextPage").addEventListener("click", () => { state.page++; renderItems(); });
$("#exportReport").addEventListener("click", exportCsv);
$("#printReport").addEventListener("click", () => window.print());
$("#menuToggle").addEventListener("click", () => $("#sidebar").classList.toggle("mobile-open"));
$$(".modal-backdrop").forEach((modal) => modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModals();
}));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModals();
});

fillCategories();
const dateText = new Intl.DateTimeFormat("en-PH", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date());
$("#dashboardDate").textContent = `JAPZ GRILL · ${dateText.toUpperCase()}`;
loadDashboard().catch((error) => toast(error.message, true));
loadItems().catch((error) => toast(error.message, true));
