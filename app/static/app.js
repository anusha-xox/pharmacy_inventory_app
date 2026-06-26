let user = null,
  medicines = [],
  alertsCache = {},
  cart = [],
  selected = null,
  lastBill = null,
  editingMedId = null;

let allBills = [];

const $ = id => document.getElementById(id);

const money = n => "₹" + Number(n || 0).toFixed(2);

const api = (url, opt = {}) =>
  fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opt
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || "Request failed");
    return data;
  });

function toast(msg) {
  const el = $("toast");
  if (!el) {
    alert(msg);
    return;
  }

  el.textContent = msg;
  el.style.display = "block";

  setTimeout(() => {
    el.style.display = "none";
  }, 3200);
}

function fd(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function login() {
  try {
    user = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("loginUser").value,
        password: $("loginPass").value,
        role: $("loginRole").value
      })
    });

    $("loginScreen").classList.remove("active");
    $("appScreen").classList.add("active");

    document.body.className = user.role === "desk" ? "desk" : "";

    $("who").textContent = `${user.name} • ${user.role}`;

    if ($("adminNav")) {
      $("adminNav").classList.toggle("hidden", user.role !== "admin");
    }

    if ($("deskNav")) {
      $("deskNav").classList.toggle("hidden", user.role !== "desk");
    }

    document.querySelectorAll(".admin-page").forEach(x => {
      x.style.display =
        user.role === "admin" || x.id === "billHistoryPage" ? "" : "none";
    });

    document.querySelectorAll(".desk-page").forEach(x => {
      x.style.display = user.role === "desk" ? "" : "none";
    });

    await refreshAll();

    go(user.role === "admin" ? "adminDashboard" : "newBillPage");
  } catch (e) {
    toast(e.message);
  }
}

function logout() {
  location.reload();
}

function go(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));

  const page = $(id);

  if (!page) {
    toast("Screen not found: " + id);
    return;
  }

  page.classList.add("active");

  // Update active state for navigation buttons
  document.querySelectorAll(".bottom button").forEach(btn => {
    btn.classList.remove("active");
  });

  // Map page IDs to navigation button actions
  const navMap = {
    adminDashboard: 'adminDashboard',
    medicinesPage: 'medicinesPage',
    stockPage: 'stockPage',
    stockInventoryPage: 'stockPage',
    reportsPage: 'reportsPage',
    billHistoryPage: 'billHistoryPage',
    usersPage: 'usersPage',
    newBillPage: 'newBillPage',
    cartPage: 'cartPage'
  };

  const targetNav = navMap[id];
  if (targetNav) {
    document.querySelectorAll(".bottom button").forEach(btn => {
      const onclick = btn.getAttribute("onclick");
      if (onclick && onclick.includes(targetNav)) {
        btn.classList.add("active");
      }
    });
  }

  if ($("appTitle")) {
    $("appTitle").textContent = page.querySelector("h2")?.textContent || "Pharmacy";
  }

  if (id === "reportsPage") {
    setTimeout(loadReports, 100);
  }

  if (id === "billHistoryPage") {
    const el = $("billHistory") || $("billsList");

    if (el) {
      el.innerHTML = '<p class="muted">Loading bills...</p>';
    }

    setTimeout(loadBills, 100);
  }

  if (id === "stockInventoryPage") {
    setTimeout(renderStockInventory, 100);
  }

  if (id === "expiryAlertsPage") {
    setTimeout(loadExpiryAlerts, 100);
  }
}

async function refreshAll() {
  await Promise.all([
    loadMedicines(),
    loadAlerts(),
    loadReports(),
    loadMovements(),
    loadUsers(),
    loadBills()
  ]).catch(err => {
    console.warn("Refresh warning:", err);
  });

  loadBillingMedicines();
}

/* ---------------- MEDICINES ---------------- */

async function loadMedicines() {
  medicines = await api(
    "/api/medicines?include_inactive=1&q=" +
      encodeURIComponent($("adminSearch")?.value || "")
  );

  if ($("mTotal")) {
    $("mTotal").textContent = medicines.filter(m => m.is_active).length;
  }

  renderMedicines();

  if ($("stockMedicine")) {
    $("stockMedicine").innerHTML = medicines
      .filter(m => m.is_active)
      .map(
        m =>
          `<option value="${m.medicine_id}">${m.name} ${
            m.strength || ""
          }</option>`
      )
      .join("");
  }
}

function renderMedicines() {
  const el = $("medicineList");
  if (!el) return;

  el.innerHTML =
    medicines
      .map(
        m => `
      <div class="item">
        <div>
          <b>${m.name} ${m.strength || ""}</b>
          <p>
            ${m.category || ""} • ${m.manufacturer || ""}<br/>
            Stock: <b>${m.total_stock}</b> •
            Exp: ${m.nearest_expiry || "-"}
          </p>
          <span class="pill ${m.is_active ? "" : "red"}">
            ${m.is_active ? "Active" : "Inactive"}
          </span>
        </div>

        <div class="actions">
          <button onclick="toggleBatches(${m.medicine_id})" style="background: #10b981; color: white;">View Stock</button>
          <button onclick="editMed(${m.medicine_id})">Edit</button>
          <button onclick="toggleMed(${m.medicine_id})">
            ${m.is_active ? "Disable" : "Enable"}
          </button>
        </div>
      </div>
      <div id="batches-${m.medicine_id}" class="batches-container" style="display: none;"></div>
    `
      )
      .join("") || '<p class="muted">No medicines found.</p>';
}

async function toggleBatches(medicineId) {
  const container = $(`batches-${medicineId}`);
  if (!container) return;

  if (container.style.display === "none") {
    // Load and show batches
    container.innerHTML = '<p class="muted">Loading batches...</p>';
    container.style.display = "block";
    
    try {
      const batches = await api(`/api/medicines/${medicineId}/batches?active_only=0`);
      
      if (batches.length === 0) {
        container.innerHTML = '<p class="muted" style="padding: 1rem;">No batches found for this medicine.</p>';
      } else {
        container.innerHTML = `
          <div style="background: #f8f9fa; padding: 1rem; border-radius: 8px; margin: 0.5rem 0;">
            <h4 style="margin: 0 0 0.75rem 0; color: #495057; font-size: 0.9rem;">Batch Details (Sub-Stock)</h4>
            ${batches.map(b => {
              const isExpired = new Date(b.expiry_date) < new Date();
              const isExpiringSoon = !isExpired && new Date(b.expiry_date) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
              const stockStatus = b.quantity_available === 0 ? 'red' : isExpired ? 'red' : isExpiringSoon ? 'orange' : '';
              
              return `
                <div class="batch-item" style="background: white; padding: 0.75rem; margin-bottom: 0.5rem; border-radius: 6px; border-left: 3px solid ${stockStatus ? (stockStatus === 'red' ? '#dc3545' : '#fd7e14') : '#28a745'};">
                  <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                      <div style="font-weight: 600; color: #212529; margin-bottom: 0.25rem;">
                        Batch: ${b.batch_no}
                      </div>
                      <div style="font-size: 0.85rem; color: #6c757d; line-height: 1.5;">
                        <div>Quantity: <b style="color: ${b.quantity_available === 0 ? '#dc3545' : '#212529'}">${b.quantity_available}</b></div>
                        <div>Expiry: <b style="color: ${isExpired ? '#dc3545' : isExpiringSoon ? '#fd7e14' : '#212529'}">${b.expiry_date}</b> ${isExpired ? '(Expired)' : isExpiringSoon ? '(Expiring Soon)' : ''}</div>
                        <div>Price: <b>${money(b.unit_price)}</b></div>
                        <div>Supplier: ${b.supplier || '-'}</div>
                        <div>Added: ${b.date_of_adding}</div>
                      </div>
                    </div>
                    <div style="margin-left: 0.5rem;">
                      <button onclick="editBatch(${b.batch_id}, ${medicineId})" style="padding: 0.4rem 0.8rem; font-size: 0.85rem; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">Edit</button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }
    } catch (e) {
      container.innerHTML = `<p class="muted" style="padding: 1rem; color: #dc3545;">Error loading batches: ${e.message}</p>`;
    }
  } else {
    // Hide batches
    container.style.display = "none";
  }
}

let editingBatchId = null;
let editingBatchMedicineId = null;

async function editBatch(batchId, medicineId) {
  try {
    // Fetch batch details
    const batches = await api(`/api/medicines/${medicineId}/batches?active_only=0`);
    const batch = batches.find(b => b.batch_id === batchId);
    
    if (!batch) {
      toast("Batch not found");
      return;
    }
    
    editingBatchId = batchId;
    editingBatchMedicineId = medicineId;
    
    // Populate form
    $("stockMedicine").value = medicineId;
    $("stockForm").date_of_adding.value = batch.date_of_adding;
    $("stockForm").expiry_date.value = batch.expiry_date;
    $("stockForm").quantity_available.value = batch.quantity_available;
    $("stockForm").unit_price.value = batch.unit_price;
    $("stockForm").supplier.value = batch.supplier || "";
    
    // Change form title
    const formTitle = document.querySelector("#stockPage h2");
    if (formTitle) {
      formTitle.textContent = "Edit Batch Stock";
    }
    
    go("stockPage");
  } catch (e) {
    toast("Error loading batch: " + e.message);
  }
}

function showMedicineForm() {
  editingMedId = null;

  if ($("medFormTitle")) {
    $("medFormTitle").textContent = "Add Medicine";
  }

  if ($("medicineForm")) {
    $("medicineForm").reset();
    $("medicineForm").is_active.value = "1";
  }

  if ($("deleteMedicineBtn")) {
    $("deleteMedicineBtn").style.display = "none";
  }

  go("medicineFormPage");
}

function editMed(id) {
  const m = medicines.find(x => Number(x.medicine_id) === Number(id));

  if (!m) {
    toast("Medicine not found");
    return;
  }

  editingMedId = id;

  $("medFormTitle").textContent = "Edit Medicine";

  Object.entries(m).forEach(([k, v]) => {
    if ($("medicineForm")[k]) {
      $("medicineForm")[k].value = v ?? "";
    }
  });

  if ($("deleteMedicineBtn")) {
    $("deleteMedicineBtn").style.display = "block";
  }

  go("medicineFormPage");
}


async function toggleMed(id) {
  await api(`/api/medicines/${id}/toggle`, {
    method: "PATCH"
  });

  toast("Medicine status updated");
  loadMedicines();
}

async function deleteMedicine() {
  if (!editingMedId) {
    toast("No medicine selected");
    return;
  }

  const med = medicines.find(x => Number(x.medicine_id) === Number(editingMedId));
  const name = med ? `${med.name} ${med.strength || ""}` : "this medicine";

  const confirmed = confirm(
    `Delete ${name}?\n\nIf this medicine has bill history, it will be deactivated instead of permanently deleted.`
  );

  if (!confirmed) return;

  try {
    const result = await api(`/api/medicines/${editingMedId}`, {
      method: "DELETE"
    });

    toast(result.message || "Medicine deleted");

    editingMedId = null;

    await refreshAll();

    go("medicinesPage");
  } catch (e) {
    toast(e.message);
  }
}

if ($("medicineForm")) {
  $("medicineForm").onsubmit = async e => {
    e.preventDefault();

    let data = fd(e.target);

    data.reorder_level = +data.reorder_level;
    data.is_active = +data.is_active;

    await api(editingMedId ? `/api/medicines/${editingMedId}` : "/api/medicines", {
      method: editingMedId ? "PUT" : "POST",
      body: JSON.stringify(data)
    });

    toast("Medicine saved");

    await loadMedicines();

    go("medicinesPage");
  };
}

/* ---------------- STOCK ---------------- */

if ($("stockForm")) {
  $("stockForm").onsubmit = async e => {
    e.preventDefault();

    let data = fd(e.target);

    data.medicine_id = +data.medicine_id;
    data.quantity_available = +data.quantity_available;
    data.unit_price = +data.unit_price;
    data.purchase_price = +data.purchase_price || 0;
    data.created_by = user.user_id;

    if (editingBatchId) {
      // Update existing batch
      await api(`/api/batches/${editingBatchId}`, {
        method: "PUT",
        body: JSON.stringify(data)
      });
      toast("Batch updated");
      
      // Reset editing state
      editingBatchId = null;
      editingBatchMedicineId = null;
      
      // Reset form title
      const formTitle = document.querySelector("#stockPage h2");
      if (formTitle) {
        formTitle.textContent = "Add Stock";
      }
    } else {
      // Create new batch
      await api("/api/batches", {
        method: "POST",
        body: JSON.stringify(data)
      });
      toast("Stock saved");
    }

    e.target.reset();

    await refreshAll();

    go("medicinesPage");
  };
}

// Reset batch editing state when navigating to stock page for new entry
function showStockForm() {
  editingBatchId = null;
  editingBatchMedicineId = null;
  
  if ($("stockForm")) {
    $("stockForm").reset();
  }
  
  const formTitle = document.querySelector("#stockPage h2");
  if (formTitle) {
    formTitle.textContent = "Add Stock";
  }
  
  go("stockPage");
}

async function loadMovements() {
  try {
    const rows = await api("/api/stock-movements");

    if ($("recentStock")) {
      $("recentStock").innerHTML =
        rows
          .slice(0, 5)
          .map(
            m => `
          <div class="item">
            <div>
              <b>${m.name} ${m.strength || ""}</b>
              <p>${m.movement_type} • Batch ${m.batch_no || "-"} • ${m.created_at}</p>
            </div>
            <span class="pill ${m.quantity_change < 0 ? "orange" : ""}">
              ${m.quantity_change}
            </span>
          </div>
        `
          )
          .join("") || '<p class="muted">No stock movement yet.</p>';
    }

    if ($("movementList")) {
      $("movementList").innerHTML =
        rows
          .map(
            m => `
          <div class="item">
            <div>
              <b>${m.name} ${m.strength || ""}</b>
              <p>
                ${m.movement_type} • Batch ${m.batch_no || "-"} • 
                By ${m.created_by_name || "-"}<br/>
                ${m.created_at}
              </p>
            </div>
            <b class="${m.quantity_change < 0 ? "danger" : "price"}">
              ${m.quantity_change}
            </b>
          </div>
        `
          )
          .join("") || '<p class="muted">No stock movement yet.</p>';
    }
  } catch (e) {
    console.warn("Could not load stock movements:", e.message);
  }
}

/* ---------------- ALERTS ---------------- */

async function loadAlerts() {
  try {
    alertsCache = await api("/api/alerts");

    if ($("mLow")) {
      $("mLow").textContent = alertsCache.low_stock?.length || 0;
    }

    if ($("mExp")) {
      $("mExp").textContent = alertsCache.expiring_soon?.length || 0;
    }

    renderAlerts("expiring_soon");
  } catch (e) {
    console.warn("Could not load alerts:", e.message);
  }
}

function renderAlerts(type, btn) {
  if (btn) {
    document.querySelectorAll(".seg button").forEach(b => {
      b.classList.remove("active");
    });

    btn.classList.add("active");
  }

  const el = $("alertsList");
  if (!el) return;

  const rows = alertsCache[type] || [];

  el.innerHTML =
    rows
      .map(x =>
        type === "low_stock"
          ? `
        <div class="item">
          <div>
            <b>${x.name} ${x.strength || ""}</b>
            <p>Total stock: ${x.total_stock} • Reorder level: ${x.reorder_level}</p>
          </div>
          <span class="pill red">Low</span>
        </div>
      `
          : `
        <div class="item">
          <div>
            <b>${x.name} ${x.strength || ""}</b>
            <p>
              Batch: ${x.batch_no} • Qty: ${x.quantity_available}<br/>
              Expiry: ${x.expiry_date}
            </p>
          </div>
          <span class="pill ${type === "expired" ? "red" : "orange"}">
            ${type === "expired" ? "Expired" : "Expiring"}
          </span>
        </div>
      `
      )
      .join("") || '<p class="muted">No alerts.</p>';
}

/* ---------------- STOCK INVENTORY ---------------- */

async function renderStockInventory() {
  const searchTerm = ($("stockSearch")?.value || "").toLowerCase();
  
  const filteredMedicines = medicines.filter(m => 
    m.is_active && 
    (m.name.toLowerCase().includes(searchTerm) || 
     (m.strength || "").toLowerCase().includes(searchTerm) ||
     (m.manufacturer || "").toLowerCase().includes(searchTerm))
  );

  const el = $("stockInventoryList");
  if (!el) return;

  el.innerHTML = filteredMedicines
    .map(m => {
      const isLowStock = m.total_stock <= m.reorder_level;
      return `
        <div class="stock-item">
          <div class="stock-info">
            <b>${m.name} ${m.strength || ""}</b>
            <p>${m.manufacturer || ""}</p>
          </div>
          <div class="stock-qty">
            <b>${m.total_stock}</b>
          </div>
          <div class="stock-status">
            <span class="pill ${isLowStock ? 'orange' : ''}">${isLowStock ? 'Yes' : 'No'}</span>
          </div>
        </div>
      `;
    })
    .join("") || '<p class="muted">No medicines found.</p>';
}

/* ---------------- EXPIRY ALERTS ---------------- */

let expiryAlertsCache = {};

async function loadExpiryAlerts() {
  try {
    expiryAlertsCache = await api("/api/alerts");
    renderExpiryAlerts("expiring_soon");
  } catch (e) {
    console.warn("Could not load expiry alerts:", e.message);
  }
}

function renderExpiryAlerts(type, btn) {
  if (btn) {
    document.querySelectorAll("#expiryAlertsPage .seg button").forEach(b => {
      b.classList.remove("active");
    });
    btn.classList.add("active");
  }

  const el = $("expiryAlertsList");
  if (!el) return;

  let rows = [];
  
  if (type === "all") {
    rows = [
      ...(expiryAlertsCache.expiring_soon || []),
      ...(expiryAlertsCache.expired || [])
    ];
  } else {
    rows = expiryAlertsCache[type] || [];
  }

  el.innerHTML = rows
    .map(x => {
      const expiryDate = new Date(x.expiry_date);
      const today = new Date();
      const daysLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      
      let daysText = "";
      let pillClass = "";
      
      if (daysLeft < 0) {
        daysText = "Expired";
        pillClass = "red";
      } else if (daysLeft === 0) {
        daysText = "Expires Today";
        pillClass = "red";
      } else if (daysLeft <= 5) {
        daysText = `${daysLeft} Days Left`;
        pillClass = "red";
      } else if (daysLeft <= 30) {
        daysText = `${daysLeft} Days Left`;
        pillClass = "orange";
      } else {
        daysText = `${daysLeft} Days Left`;
        pillClass = "";
      }

      return `
        <div class="expiry-item">
          <div class="expiry-info">
            <b>${x.name} ${x.strength || ""}</b>
            <p>Batch: ${x.batch_no}</p>
            <p class="muted">Exp: ${x.expiry_date}</p>
          </div>
          <div class="expiry-days">
            <span class="pill ${pillClass}">${daysText}</span>
          </div>
        </div>
      `;
    })
    .join("") || '<p class="muted">No expiry alerts.</p>';
}

/* ---------------- REPORTS ---------------- */

async function loadReports() {
  try {
    // Initialize date range picker
    initReportDates();

    const r = await api("/api/reports");

    if ($("mSales")) {
      $("mSales").textContent = money(r.summary.total_sales);
    }

    if ($("rSales")) {
      $("rSales").textContent = money(r.summary.total_sales);
    }

    if ($("rBills")) {
      $("rBills").textContent = r.summary.total_bills;
    }

    if ($("rAvg")) {
      $("rAvg").textContent = money(r.summary.avg_bill);
    }

    if ($("rItems")) {
      $("rItems").textContent = r.top_medicines.reduce((a, b) => a + b.qty, 0);
    }

    const charts = r.charts || {};

    // Load the date range chart
    drawChart("salesChartRange", charts.daily || r.daily || [], {
      kind: "line",
      empty: "No sales in selected date range."
    });
  } catch (e) {
    console.warn("Could not load reports:", e.message);
  }
}

function drawChart(canvasId, data, opt = {}) {
  const c = $(canvasId);
  if (!c) return;

  const cssW = Math.max(c.clientWidth || c.parentElement?.clientWidth || 360, 280);
  const cssH = 210;

  c.width = cssW * 2;
  c.height = cssH * 2;
  c.style.height = cssH + "px";

  const ctx = c.getContext("2d");

  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#64748b";

  if (!data || !data.length || data.every(d => Number(d.sales || 0) === 0)) {
    ctx.fillText(
      opt.empty || "No sales data yet. Generate bills to see this graph.",
      22,
      55
    );
    return;
  }

  const vals = data.map(d => Number(d.sales || 0));
  const max = Math.max(...vals, 1);

  const left = 52;
  const right = 16;
  const top = 22;
  const bottom = 42;

  const chartW = cssW - left - right;
  const chartH = cssH - top - bottom;

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;

  for (let i = 0; i < 4; i++) {
    let y = top + i * (chartH / 3);

    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(cssW - right, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#64748b";
  ctx.font = "11px sans-serif";
  ctx.fillText(money(max), 6, top + 4);
  ctx.fillText("₹0", 18, top + chartH + 4);

  const step = chartW / Math.max(data.length - 1, 1);

  if (opt.kind === "bar") {
    const barW = Math.max(
      4,
      Math.min(18, (chartW / Math.max(data.length, 1)) * 0.62)
    );

    data.forEach((d, i) => {
      let x = left + i * step - barW / 2;
      let h = (Number(d.sales || 0) / max) * chartH;
      let y = top + chartH - h;

      ctx.fillStyle = "#0f8b75";
      ctx.fillRect(x, y, barW, h || 1);
    });
  } else {
    ctx.strokeStyle = "#0f62fe";
    ctx.lineWidth = 3;
    ctx.beginPath();

    data.forEach((d, i) => {
      let x = left + i * step;
      let y = top + chartH - (Number(d.sales || 0) / max) * chartH;

      if (i) {
        ctx.lineTo(x, y);
      } else {
        ctx.moveTo(x, y);
      }
    });

    ctx.stroke();

    data.forEach((d, i) => {
      let x = left + i * step;
      let y = top + chartH - (Number(d.sales || 0) / max) * chartH;

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#0f62fe";
      ctx.fill();
    });
  }

  ctx.fillStyle = "#475569";
  ctx.font = "10px sans-serif";

  const skip = opt.skipLabels || (data.length <= 8 ? 1 : Math.ceil(data.length / 6));

  data.forEach((d, i) => {
    let x = left + i * step;

    if (i % skip === 0 || i === data.length - 1) {
      ctx.fillText(
        String(d.label || d.day || ""),
        Math.max(2, Math.min(x - 14, cssW - 48)),
        cssH - 14
      );
    }
  });
}

/* ---------------- NEW REPORTS TAB FUNCTIONS ---------------- */

function switchReportTab(tab, btn) {
  // Update tab buttons
  document.querySelectorAll('.report-tabs button').forEach(b => {
    b.classList.remove('active');
  });
  btn.classList.add('active');

  // Update tab content
  document.querySelectorAll('.report-tab-content').forEach(content => {
    content.classList.remove('active');
  });

  const tabMap = {
    'sales': 'salesTab',
    'stock': 'stockTab',
    'lowstock': 'lowstockTab'
  };

  const targetTab = $(tabMap[tab]);
  if (targetTab) {
    targetTab.classList.add('active');
  }

  // Load data for the selected tab
  if (tab === 'stock') {
    loadStockMovementReport();
  } else if (tab === 'lowstock') {
    loadLowStockReport();
  }
}

function initReportDates() {
  const today = new Date();
  const twentyOneDaysAgo = new Date(today);
  twentyOneDaysAgo.setDate(today.getDate() - 21);

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  if ($('reportStartDate')) {
    $('reportStartDate').value = formatDate(twentyOneDaysAgo);
  }
  if ($('reportEndDate')) {
    $('reportEndDate').value = formatDate(today);
  }
}

function updateReportDateRange() {
  const startDate = $('reportStartDate')?.value;
  const endDate = $('reportEndDate')?.value;

  if (startDate && endDate) {
    loadReportsWithDateRange(startDate, endDate);
  }
}

async function loadReportsWithDateRange(startDate, endDate) {
  try {
    const r = await api(`/api/reports?start_date=${startDate}&end_date=${endDate}`);

    if ($('rSales')) {
      $('rSales').textContent = money(r.summary.total_sales);
    }

    if ($('rBills')) {
      $('rBills').textContent = r.summary.total_bills;
    }

    if ($('rAvg')) {
      $('rAvg').textContent = money(r.summary.avg_bill);
    }

    if ($('rItems')) {
      $('rItems').textContent = r.top_medicines.reduce((a, b) => a + b.qty, 0);
    }

    const charts = r.charts || {};
    drawChart('salesChartRange', charts.daily || r.daily || [], {
      kind: 'line',
      empty: 'No sales in selected date range.'
    });
  } catch (e) {
    console.warn('Could not load reports with date range:', e.message);
  }
}

async function loadStockMovementReport() {
  try {
    const startDate = $('reportStartDate')?.value;
    const endDate = $('reportEndDate')?.value;
    
    let url = '/api/stock-movements';
    if (startDate && endDate) {
      url += `?start_date=${startDate}&end_date=${endDate}`;
    }

    const rows = await api(url);

    if ($('stockMovementReport')) {
      $('stockMovementReport').innerHTML =
        rows
          .map(
            m => `
          <div class="item">
            <div>
              <b>${m.name} ${m.strength || ''}</b>
              <p>
                ${m.movement_type} • Batch ${m.batch_no || '-'} •
                By ${m.created_by_name || '-'}<br/>
                ${m.created_at}
              </p>
            </div>
            <b class="${m.quantity_change < 0 ? 'danger' : 'price'}">
              ${m.quantity_change > 0 ? '+' : ''}${m.quantity_change}
            </b>
          </div>
        `
          )
          .join('') || '<div class="empty-state"><b>No Stock Movements</b><p>No stock movements found in the selected date range.</p></div>';
    }
  } catch (e) {
    console.warn('Could not load stock movements:', e.message);
    if ($('stockMovementReport')) {
      $('stockMovementReport').innerHTML = '<div class="empty-state error-state"><b>Error</b><p>Could not load stock movements.</p></div>';
    }
  }
}

async function loadLowStockReport() {
  try {
    const alerts = await api('/api/alerts');
    const lowStockItems = alerts.low_stock || [];

    if ($('lowStockReport')) {
      $('lowStockReport').innerHTML =
        lowStockItems
          .map(
            item => `
          <div class="item">
            <div>
              <b>${item.name} ${item.strength || ''}</b>
              <p>
                Current Stock: ${item.total_stock || 0} •
                Reorder Level: ${item.reorder_level || 0}<br/>
                Category: ${item.category || 'N/A'}
              </p>
            </div>
            <span class="pill orange">Low Stock</span>
          </div>
        `
          )
          .join('') || '<div class="empty-state"><b>No Low Stock Items</b><p>All medicines are adequately stocked.</p></div>';
    }
  } catch (e) {
    console.warn('Could not load low stock report:', e.message);
    if ($('lowStockReport')) {
      $('lowStockReport').innerHTML = '<div class="empty-state error-state"><b>Error</b><p>Could not load low stock items.</p></div>';
    }
  }
}

/* ---------------- USERS ---------------- */

async function loadUsers() {
  try {
    const rows = await api("/api/users");

    if (!$("userList")) return;

    $("userList").innerHTML =
      rows
        .map(
          u => `
        <div class="item">
          <div>
            <b>${u.name}</b>
            <p>${u.username} • ${u.role}</p>
            <span class="pill ${u.is_active ? "" : "red"}">
              ${u.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          <div class="actions">
            <button onclick="toggleUser(${u.user_id})">Toggle</button>
            <button onclick="deleteUser(${u.user_id}, '${u.name}')" style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;">Delete</button>
          </div>
        </div>
      `
        )
        .join("") || '<p class="muted">No users found.</p>';
  } catch (e) {
    console.warn("Could not load users:", e.message);
  }
}

if ($("userForm")) {
  $("userForm").onsubmit = async e => {
    e.preventDefault();

    await api("/api/users", {
      method: "POST",
      body: JSON.stringify(fd(e.target))
    });

    toast("User added");

    e.target.reset();

    loadUsers();
  };
}

async function toggleUser(id) {
  await api(`/api/users/${id}/toggle`, {
    method: "PATCH"
  });

  loadUsers();
}

async function deleteUser(id, name) {
  const confirmed = confirm(
    `Delete user "${name}"?\n\nThis action cannot be undone.`
  );

  if (!confirmed) return;

  try {
    await api(`/api/users/${id}`, {
      method: "DELETE"
    });

    toast("User deleted successfully");
    loadUsers();
  } catch (e) {
    toast("Error: " + e.message);
  }
}

/* ---------------- BACKUP DOWNLOAD ---------------- */

async function downloadBackup() {
  try {
    toast("Preparing backup... This may take a moment.");
    
    const response = await fetch('/api/download-backup');
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Download failed' }));
      throw new Error(error.detail || 'Failed to download backup');
    }
    
    // Get the blob from response
    const blob = await response.blob();
    
    // Extract filename from Content-Disposition header or use default
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'pharmacy_backup.zip';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }
    
    // Create download link and trigger download
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    toast("Backup downloaded successfully!");
  } catch (e) {
    toast("Error: " + e.message);
    console.error("Backup download error:", e);
  }
}

/* ---------------- BILLING ---------------- */

async function loadBillingMedicines() {
  try {
    const q = $("deskSearch")?.value || "";

    const rows = await api("/api/medicines?q=" + encodeURIComponent(q));

    if (!$("billingList")) return;

    $("billingList").innerHTML =
      rows
        .filter(x => x.total_stock > 0)
        .map(
          m => `
        <div class="item" onclick="selectMed(${m.medicine_id})">
          <div>
            <b>${m.name} ${m.strength || ""}</b>
            <p>${m.category || ""}</p>
          </div>
          <span class="pill">Stock: ${m.total_stock}</span>
        </div>
      `
        )
        .join("") || '<p class="muted">No available stock.</p>';
  } catch (e) {
    console.warn("Could not load billing medicines:", e.message);
  }
}

async function selectMed(id) {
  selected =
    medicines.find(m => m.medicine_id === id) ||
    (await api("/api/medicines?q=")).find(m => m.medicine_id === id);

  if (!selected) {
    toast("Medicine not found");
    return;
  }

  if ($("selectedMed")) {
    $("selectedMed").innerHTML = `
      <div class="card">
        <b>${selected.name} ${selected.strength || ""}</b>
        <p>
          ${selected.category || ""}<br/>
          Stock: ${selected.total_stock}
        </p>
      </div>
    `;
  }

  const batches = await api(`/api/medicines/${id}/batches`);
  
  // Store batches for price calculation
  selected.batches = batches;

  if ($("billBatch")) {
    $("billBatch").innerHTML =
      '<option value="">Auto FEFO - earliest expiry first</option>' +
      batches
        .map(
          b => `
        <option value="${b.batch_id}" data-price="${b.unit_price}">
          ${b.batch_no} • Exp ${b.expiry_date} • Available ${b.quantity_available}
        </option>
      `
        )
        .join("");
    
    // Add event listener to update price when batch changes
    $("billBatch").onchange = updateBillPrice;
  }

  if ($("billQty")) {
    $("billQty").value = 1;
    // Add event listener to update price when quantity changes
    $("billQty").oninput = updateBillPrice;
  }

  // Initial price update
  updateBillPrice();

  go("addBillPage");
}

function updateBillPrice() {
  if (!selected || !selected.batches) return;
  
  const batchSelect = $("billBatch");
  const qtyInput = $("billQty");
  
  if (!batchSelect || !qtyInput) return;
  
  const quantity = +qtyInput.value || 1;
  let totalPrice = 0;
  let priceText = "";
  
  if (batchSelect.value) {
    // Specific batch selected
    const selectedOption = batchSelect.selectedOptions[0];
    const unitPrice = +selectedOption.getAttribute("data-price") || 0;
    totalPrice = unitPrice * quantity;
    priceText = `Unit Price: ${money(unitPrice)} • Total: ${money(totalPrice)}`;
  } else {
    // Auto FEFO - calculate from earliest expiry batches
    let remainingQty = quantity;
    const batches = [...selected.batches].sort((a, b) =>
      new Date(a.expiry_date) - new Date(b.expiry_date)
    );
    
    for (const batch of batches) {
      if (remainingQty <= 0) break;
      const qtyFromBatch = Math.min(remainingQty, batch.quantity_available);
      totalPrice += qtyFromBatch * batch.unit_price;
      remainingQty -= qtyFromBatch;
    }
    
    const avgPrice = quantity > 0 ? totalPrice / quantity : 0;
    priceText = `Avg Price: ${money(avgPrice)} • Total: ${money(totalPrice)}`;
  }
  
  // Update or create price display
  let priceDisplay = $("billPriceDisplay");
  if (!priceDisplay) {
    priceDisplay = document.createElement("div");
    priceDisplay.id = "billPriceDisplay";
    priceDisplay.className = "card";
    priceDisplay.style.marginTop = "10px";
    priceDisplay.style.padding = "10px";
    priceDisplay.style.backgroundColor = "#f0f9ff";
    priceDisplay.style.borderLeft = "3px solid #3b82f6";
    
    const qtyDiv = document.querySelector(".qty");
    if (qtyDiv && qtyDiv.parentNode) {
      qtyDiv.parentNode.insertBefore(priceDisplay, qtyDiv.nextSibling);
    }
  }
  
  priceDisplay.innerHTML = `<p style="margin: 0; color: #1e40af; font-weight: 500;">${priceText}</p>`;
}

function stepQty(n) {
  if (!$("billQty")) return;

  $("billQty").value = Math.max(1, +$("billQty").value + n);
  updateBillPrice();
}

function addToCart() {
  if (!selected) {
    toast("Please select a medicine first");
    return;
  }

  const qty = +$("billQty").value;
  const batch_id = $("billBatch").value ? +$("billBatch").value : null;
  
  // Calculate unit price based on selected batch or FEFO
  let unit_price = 0;
  if (batch_id) {
    // Specific batch selected - get its price
    const batch = selected.batches.find(b => b.batch_id === batch_id);
    unit_price = batch ? batch.unit_price : 0;
  } else {
    // Auto FEFO - calculate average price from earliest expiry batches
    let remainingQty = qty;
    let totalPrice = 0;
    const batches = [...selected.batches].sort((a, b) =>
      new Date(a.expiry_date) - new Date(b.expiry_date)
    );
    
    for (const batch of batches) {
      if (remainingQty <= 0) break;
      const qtyFromBatch = Math.min(remainingQty, batch.quantity_available);
      totalPrice += qtyFromBatch * batch.unit_price;
      remainingQty -= qtyFromBatch;
    }
    
    unit_price = qty > 0 ? totalPrice / qty : 0;
  }

  cart.push({
    ...selected,
    quantity: qty,
    batch_id,
    batch_label: $("billBatch").selectedOptions[0].text,
    unit_price: unit_price
  });

  toast("Added to cart");

  renderCart();

  go("cartPage");
}

function renderCart() {
  if (!$("cartList") || !$("cartTotal")) return;

  let subtotal = cart.reduce((a, i) => a + i.quantity * i.unit_price, 0);
  let discount = +$("discount")?.value || 0;
  let total = Math.max(0, subtotal - discount);

  $("cartList").innerHTML =
    cart
      .map(
        (i, idx) => `
      <div class="item">
        <div>
          <b>${i.name} ${i.strength || ""}</b>
          <p>Qty ${i.quantity} • ${i.batch_label || "Auto FEFO"}</p>
        </div>
        <div>
          <b>${money(i.quantity * i.unit_price)}</b>
          <div>
            <button onclick="cart.splice(${idx},1);renderCart()">Delete</button>
          </div>
        </div>
      </div>
    `
      )
      .join("") || '<p class="muted">No items added</p>';

  $("cartTotal").textContent = money(total);
}

function clearCart() {
  cart = [];
  renderCart();
}

async function confirmBill() {
  try {
    if (!cart.length) {
      toast("Please add at least one item to cart");
      return;
    }

    const body = {
      customer_name: $("custName")?.value || "Walk-in Customer",
      customer_email: $("custEmail")?.value || "",
      customer_phone: $("custPhone")?.value || "",
      created_by: user.user_id,
      discount: +$("discount")?.value || 0,
      payment_method: $("payment")?.value || "Cash",
      items: cart.map(i => ({
        medicine_id: i.medicine_id,
        quantity: i.quantity,
        batch_id: i.batch_id
      }))
    };

    lastBill = await api("/api/bills", {
      method: "POST",
      body: JSON.stringify(body)
    });

    cart = [];

    renderCart();

    await refreshAll();

    renderSuccess(lastBill);

    go("billSuccessPage");
  } catch (e) {
    toast(e.message);
  }
}

function renderSuccess(b) {
  if (!$("successBill")) return;

  $("successBill").innerHTML = `
    <h3>${b.bill_no}</h3>
    <p>Total Amount: <b>${money(b.total_amount)}</b></p>
    <p>Date: ${b.created_at}</p>
    <p>Payment: ${b.payment_method}</p>
    <p>Customer: ${b.customer_name || "-"}</p>
    ${b.customer_phone ? `<p>Phone: ${b.customer_phone}</p>` : ''}
  `;

  // Render breakdown
  if ($("billBreakdown") && b.items) {
    $("billBreakdown").innerHTML = `
      <div class="bill-breakdown">
        <h3>Bill Breakdown</h3>
        <table class="breakdown-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Batch</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${b.items.map(item => `
              <tr>
                <td>
                  <strong>${item.name} ${item.strength || ''}</strong>
                </td>
                <td><small>${item.batch_no}</small></td>
                <td>${item.quantity}</td>
                <td>${money(item.unit_price)}</td>
                <td><strong>${money(item.line_total)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="text-align: right;">Subtotal:</td>
              <td><strong>${money(b.subtotal)}</strong></td>
            </tr>
            ${b.discount > 0 ? `
            <tr>
              <td colspan="4" style="text-align: right;">Discount:</td>
              <td><strong>- ${money(b.discount)}</strong></td>
            </tr>
            ` : ''}
            <tr class="total-row">
              <td colspan="4" style="text-align: right;"><strong>Total Amount:</strong></td>
              <td><strong>${money(b.total_amount)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }
}

function toggleBreakdown() {
  const breakdown = $("billBreakdown");
  if (!breakdown) return;
  
  const btn = event.target;
  if (breakdown.style.display === "none") {
    breakdown.style.display = "block";
    btn.textContent = "Hide Breakdown";
  } else {
    breakdown.style.display = "none";
    btn.textContent = "View Breakdown";
  }
}

function printBillBreakdown() {
  if (!lastBill) {
    toast("No bill to print");
    return;
  }

  // Create a print-friendly version
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast("Please allow popups to print");
    return;
  }

  const itemsHtml = lastBill.items.map(item => `
    <tr>
      <td>
        <strong>${item.name} ${item.strength || ''}</strong><br>
        <small style="color: #6b7280;">Batch: ${item.batch_no}</small>
      </td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: right;">${money(item.unit_price)}</td>
      <td style="text-align: right;"><strong>${money(item.line_total)}</strong></td>
    </tr>
  `).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Bill ${lastBill.bill_no}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
          padding: 40px;
          max-width: 800px;
          margin: 0 auto;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 3px solid #3b82f6;
        }
        .header h1 {
          color: #1f2937;
          font-size: 28px;
          margin-bottom: 5px;
        }
        .header p {
          color: #6b7280;
          font-size: 14px;
        }
        .bill-info {
          background: #f0f9ff;
          border-left: 4px solid #3b82f6;
          padding: 20px;
          margin-bottom: 30px;
          border-radius: 4px;
        }
        .bill-info table {
          width: 100%;
        }
        .bill-info td {
          padding: 8px 0;
        }
        .bill-info .label {
          color: #6b7280;
          font-size: 13px;
        }
        .bill-info .value {
          color: #1f2937;
          font-weight: 600;
          font-size: 15px;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        .items-table thead {
          background: #f9fafb;
        }
        .items-table th {
          padding: 12px;
          text-align: left;
          color: #374151;
          font-weight: 600;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 2px solid #e5e7eb;
        }
        .items-table td {
          padding: 12px;
          border-bottom: 1px solid #e5e7eb;
        }
        .items-table tbody tr:last-child td {
          border-bottom: 2px solid #e5e7eb;
        }
        .totals {
          margin-top: 20px;
          text-align: right;
        }
        .totals table {
          margin-left: auto;
          min-width: 300px;
        }
        .totals td {
          padding: 8px 12px;
        }
        .totals .label {
          color: #6b7280;
        }
        .totals .value {
          font-weight: 500;
          color: #1f2937;
        }
        .totals .total-row {
          border-top: 2px solid #e5e7eb;
          padding-top: 12px;
        }
        .totals .total-row .label {
          font-size: 18px;
          font-weight: 600;
          color: #1f2937;
        }
        .totals .total-row .value {
          font-size: 20px;
          font-weight: 700;
          color: #3b82f6;
        }
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          color: #6b7280;
          font-size: 13px;
        }
        @media print {
          body { padding: 20px; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Hospital Pharmacy</h1>
        <p>Pharmacy Invoice</p>
      </div>

      <div class="bill-info">
        <table>
          <tr>
            <td>
              <div class="label">Bill Number</div>
              <div class="value">${lastBill.bill_no}</div>
            </td>
            <td style="text-align: right;">
              <div class="label">Date</div>
              <div class="value">${lastBill.created_at}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div class="label">Customer</div>
              <div class="value">${lastBill.customer_name || 'Walk-in Customer'}</div>
            </td>
            <td style="text-align: right;">
              <div class="label">Payment Method</div>
              <div class="value">${lastBill.payment_method}</div>
            </td>
          </tr>
          ${lastBill.customer_phone ? `
          <tr>
            <td colspan="2">
              <div class="label">Phone</div>
              <div class="value">${lastBill.customer_phone}</div>
            </td>
          </tr>
          ` : ''}
        </table>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th>Item</th>
            <th style="text-align: center;">Qty</th>
            <th style="text-align: right;">Price</th>
            <th style="text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="totals">
        <table>
          <tr>
            <td class="label">Subtotal:</td>
            <td class="value">${money(lastBill.subtotal)}</td>
          </tr>
          ${lastBill.discount > 0 ? `
          <tr>
            <td class="label">Discount:</td>
            <td class="value" style="color: #dc2626;">- ${money(lastBill.discount)}</td>
          </tr>
          ` : ''}
          <tr class="total-row">
            <td class="label">Total Amount:</td>
            <td class="value">${money(lastBill.total_amount)}</td>
          </tr>
        </table>
      </div>

      <div class="footer">
        <p>Thank you for your purchase!</p>
        <p>For any queries, please contact us at the hospital pharmacy.</p>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `);

  printWindow.document.close();
}

async function shareLastBill() {
  if (!lastBill) {
    toast("No bill selected");
    return;
  }

  const billId = lastBill.bill_id || lastBill.id;

  if (!billId) {
    toast("Bill ID not found");
    return;
  }

  let to =
    $("custEmail")?.value ||
    lastBill.customer_email ||
    prompt("Customer email");

  if (!to) return;

  let smtp_username =
    prompt("Gmail address / SMTP username (leave blank to use env)") || null;

  let smtp_password = smtp_username
    ? prompt("Gmail App Password") || null
    : null;

  try {
    const r = await api(`/api/bills/${billId}/email`, {
      method: "POST",
      body: JSON.stringify({
        to_email: to,
        smtp_username,
        smtp_password
      })
    });

    toast(r.message);
  } catch (e) {
    toast(e.message);
  }
}

/* ---------------- BILL HISTORY ---------------- */

async function loadBills() {
  const container = $("billHistory") || $("billsList");

  if (!container) {
    console.error("Bill history container not found. Expected #billHistory or #billsList");
    return;
  }

  container.innerHTML = `
    <div class="empty-state">
      <div class="spinner"></div>
      <p>Loading bills...</p>
    </div>
  `;

  try {
    const searchQuery = $("billSearch")?.value || "";
    const response = await fetch(`/api/bills?q=${encodeURIComponent(searchQuery)}`);

    if (!response.ok) {
      throw new Error("Failed to fetch bills");
    }

    allBills = await response.json();

    if (!Array.isArray(allBills) || allBills.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No bills generated yet</h3>
          <p>Once a sale is confirmed, bills will appear here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = allBills
      .map(bill => {
        const billId = bill.id || bill.bill_id;

        return `
          <div class="bill-card" onclick="openBillDetails(${billId})">
            <div class="bill-card-header">
              <div>
                <h3>${bill.bill_no || "Bill"}</h3>
                <p>${bill.customer_name || "Walk-in Customer"}</p>
              </div>
              <div class="bill-amount">
                ${money(bill.total_amount)}
              </div>
            </div>

            <div class="bill-card-meta">
              <span>${formatDateTime(bill.created_at)}</span>
              <span>${bill.payment_method || "Cash"}</span>
            </div>

            <div class="bill-card-footer">
              <span>Created by: ${
                bill.created_by_name ||
                bill.created_by_username ||
                "Unknown"
              }</span>
              <span>${bill.items ? bill.items.length : 0} items</span>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (error) {
    console.error("Bill history error:", error);

    container.innerHTML = `
      <div class="empty-state error-state">
        <h3>Could not load bills</h3>
        <p>${error.message}</p>
      </div>
    `;
  }
}

async function openBillDetails(id) {
  return openBill(id);
}

async function openBill(id) {
  try {
    lastBill = await api(`/api/bills/${id}`);

    renderSuccess(lastBill);

    go("billSuccessPage");
  } catch (e) {
    toast(e.message);
  }
}

/* ---------------- OPTIONAL PRINT / EMAIL FORM HOOKS ---------------- */

function printCurrentBill() {
  window.print();
}

function showEmailBillForm() {
  shareLastBill();
}

/* ---------------- INIT ---------------- */

renderCart();