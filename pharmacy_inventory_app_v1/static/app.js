const money = (n) => `₹${Number(n || 0).toFixed(2)}`;
let medicines = [];
let cart = [];

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Something went wrong" }));
    throw new Error(err.detail || "Something went wrong");
  }
  return res.json();
}

function showToast(message) {
  alert(message);
}

async function loadMedicines(q = "") {
  medicines = await api(`/api/medicines?q=${encodeURIComponent(q)}`);
  renderMedicineList();
  renderBillingList();
  renderStockSelect();
  const totalMedicines = document.getElementById("totalMedicines");
  if (totalMedicines) totalMedicines.textContent = medicines.length;
}

async function loadSummary() {
  const summary = await api("/api/reports/summary");
  document.getElementById("todaySales").textContent = money(summary.today.sales);
  document.getElementById("todayBills").textContent = summary.today.bills;
  document.getElementById("totalMedicines").textContent = summary.medicine_count;
}

async function loadAlerts() {
  const data = await api("/api/alerts?days=60");
  const el = document.getElementById("alertsList");
  const expiry = data.expiry_alerts.map(a => `
    <div class="item">
      <div class="item-top">
        <div>
          <div class="name">${a.name} ${a.strength || ""}</div>
          <div class="meta">Batch: ${a.batch_no} • Qty: ${a.quantity_available} • Exp: ${a.expiry_date}</div>
        </div>
        <span class="badge ${a.days_left <= 0 ? "expired" : "low"}">${a.days_left <= 0 ? "Expired" : `${a.days_left} days`}</span>
      </div>
    </div>
  `).join("");
  const low = data.low_stock.map(a => `
    <div class="item">
      <div class="item-top">
        <div>
          <div class="name">${a.name} ${a.strength || ""}</div>
          <div class="meta">Available: ${a.total_stock} • Reorder level: ${a.reorder_level}</div>
        </div>
        <span class="badge low">Low stock</span>
      </div>
    </div>
  `).join("");
  el.innerHTML = `<h3>Expiring soon</h3>${expiry || "<p class='meta'>No expiry alerts.</p>"}<h3>Low stock</h3>${low || "<p class='meta'>No low stock alerts.</p>"}`;
}

function renderMedicineList() {
  const el = document.getElementById("medicineList");
  if (!el) return;
  el.innerHTML = medicines.map(m => {
    const low = Number(m.total_stock) <= Number(m.reorder_level);
    return `
      <div class="item">
        <div class="item-top">
          <div>
            <div class="name">${m.name} ${m.strength || ""}</div>
            <div class="meta">${m.category || ""} • ${m.manufacturer || ""} • Price: ${money(m.unit_price)}</div>
            <div class="meta">Nearest expiry: ${m.nearest_expiry || "NA"}</div>
          </div>
          <span class="badge ${low ? "low" : ""}">Stock: ${m.total_stock}</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderStockSelect() {
  const el = document.getElementById("stockMedicineSelect");
  if (!el) return;
  el.innerHTML = medicines.map(m => `<option value="${m.medicine_id}">${m.name} ${m.strength || ""}</option>`).join("");
}

function renderBillingList() {
  const el = document.getElementById("billingMedicineList");
  if (!el) return;
  el.innerHTML = medicines.map(m => {
    const disabled = Number(m.total_stock) <= 0;
    return `
      <div class="item">
        <div class="item-top">
          <div>
            <div class="name">${m.name} ${m.strength || ""}</div>
            <div class="meta">${m.category || ""} • ${money(m.unit_price)} • Exp: ${m.nearest_expiry || "NA"}</div>
          </div>
          <span class="badge ${Number(m.total_stock) <= Number(m.reorder_level) ? "low" : ""}">Stock: ${m.total_stock}</span>
        </div>
        <div class="actions">
          <input id="qty-${m.medicine_id}" type="number" min="1" max="${m.total_stock}" value="1" ${disabled ? "disabled" : ""}/>
          <button class="primary" onclick="addToCart(${m.medicine_id})" ${disabled ? "disabled" : ""}>Add</button>
          <span class="meta">${disabled ? "Unavailable" : "FEFO"}</span>
        </div>
      </div>
    `;
  }).join("");
}

function addToCart(medicineId) {
  const med = medicines.find(m => m.medicine_id === medicineId);
  const qty = Number(document.getElementById(`qty-${medicineId}`).value || 1);
  if (!med || qty <= 0) return;
  if (qty > Number(med.total_stock)) return showToast(`Only ${med.total_stock} units available.`);
  const existing = cart.find(i => i.medicine_id === medicineId);
  if (existing) existing.quantity += qty;
  else cart.push({ medicine_id: medicineId, name: `${med.name} ${med.strength || ""}`, quantity: qty, unit_price: med.unit_price });
  renderCart();
}

function renderCart() {
  const el = document.getElementById("cartList");
  const total = cart.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  document.getElementById("cartTotal").textContent = money(total);
  if (!cart.length) {
    el.className = "list compact empty";
    el.innerHTML = "No items added";
    return;
  }
  el.className = "list compact";
  el.innerHTML = cart.map((i, idx) => `
    <div class="item">
      <div class="item-top">
        <div>
          <div class="name">${i.name}</div>
          <div class="meta">Qty: ${i.quantity} • Unit: ${money(i.unit_price)}</div>
        </div>
        <div>
          <strong>${money(i.quantity * i.unit_price)}</strong><br />
          <button class="ghost" onclick="removeCartItem(${idx})">Remove</button>
        </div>
      </div>
    </div>
  `).join("");
}

function removeCartItem(idx) {
  cart.splice(idx, 1);
  renderCart();
}

async function confirmBill() {
  if (!cart.length) return showToast("Please add at least one medicine.");
  const payload = {
    customer_name: "Walk-in Customer",
    created_by: 2,
    items: cart.map(i => ({ medicine_id: i.medicine_id, quantity: i.quantity }))
  };
  try {
    const bill = await api("/api/bills", { method: "POST", body: JSON.stringify(payload) });
    cart = [];
    renderCart();
    await loadMedicines(document.getElementById("deskSearch").value || "");
    await loadSummary();
    const success = document.getElementById("billSuccess");
    success.classList.remove("hidden");
    success.innerHTML = `<h2>Bill Generated Successfully</h2><p>Bill No: <strong>${bill.bill_no}</strong></p><p>Total Amount: <strong>${money(bill.total_amount)}</strong></p><p class="meta">Inventory deducted from nearest-expiry batches first.</p>`;
  } catch (e) {
    showToast(e.message);
  }
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "alerts") loadAlerts();
    });
  });
}

function setupForms() {
  document.getElementById("medicineForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.unit_price = Number(payload.unit_price);
    payload.reorder_level = Number(payload.reorder_level || 10);
    await api("/api/medicines", { method: "POST", body: JSON.stringify(payload) });
    e.target.reset();
    await loadMedicines();
    showToast("Medicine saved.");
  });

  document.getElementById("stockForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.medicine_id = Number(payload.medicine_id);
    payload.quantity_available = Number(payload.quantity_available);
    payload.purchase_price = Number(payload.purchase_price || 0);
    payload.created_by = 1;
    await api("/api/batches", { method: "POST", body: JSON.stringify(payload) });
    e.target.reset();
    await loadMedicines();
    showToast("Stock saved.");
  });
}

function setupSearchAndRole() {
  document.getElementById("roleSelect").addEventListener("change", (e) => {
    const role = e.target.value;
    document.getElementById("adminView").classList.toggle("hidden", role !== "admin");
    document.getElementById("deskView").classList.toggle("hidden", role !== "desk");
  });
  document.getElementById("adminSearch").addEventListener("input", (e) => loadMedicines(e.target.value));
  document.getElementById("deskSearch").addEventListener("input", (e) => loadMedicines(e.target.value));
  document.getElementById("confirmBill").addEventListener("click", confirmBill);
  document.getElementById("clearCart").addEventListener("click", () => { cart = []; renderCart(); });
}

window.addToCart = addToCart;
window.removeCartItem = removeCartItem;

(async function init() {
  setupTabs();
  setupForms();
  setupSearchAndRole();
  await loadMedicines();
  await loadSummary();
})();
