const USER = "Zhangfan";
const PASS = "zhangfan0421";
const KEY = "shaochi_v14_data";
const LOGIN = "shaochi_v14_login";
const DEFAULT_SYNC_URL = "https://script.google.com/macros/s/AKfycbw5xe6EfThaRG5R1WuM9tJN1wt3rnWczF0MOerC3RqmPtSdpg2BqsxAFU8MHZMG3-xw/exec";
const SYNC_URL = "shaochi_cloud_api_url";
const SYNC_AUTO = "shaochi_cloud_auto_sync";
const SYNC_LAST = "shaochi_cloud_last_sync";
const STATUSES = ["待檢查", "等待料件", "維修中", "待取車", "已完成"];

let db = { orders: [], customers: [], catalog: [] };
let draft = { plate: "", km: 0, customer: null };
let selectedParts = [];
let currentPartCat = "";
let editingOrderId = null;
let syncTimer = null;
let applyingCloudData = false;

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
}[char]));
const money = value => "$" + Number(value || 0).toLocaleString("zh-TW");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const todayText = () => new Date().toLocaleDateString("zh-TW");
const normalizePlate = value => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const formatPlate = value => {
  const raw = normalizePlate(value);
  const letters = raw.slice(0, 3).replace(/[^A-Z]/g, "");
  const digits = raw.slice(3).replace(/[^0-9]/g, "").slice(0, 4);
  if (letters.length < 3) return letters + digits;
  return digits ? `${letters}-${digits}` : letters;
};

const defaultCatalog = [
  { cat: "油品", name: "機油", price: 350 },
  { cat: "油品", name: "齒輪油", price: 120 },
  { cat: "煞車", name: "煞車皮", price: 500 },
  { cat: "煞車", name: "煞車油更換", price: 300 },
  { cat: "傳動", name: "傳動清潔", price: 600 },
  { cat: "傳動", name: "傳動皮帶", price: 1200 },
  { cat: "輪胎", name: "前輪胎", price: 1500 },
  { cat: "輪胎", name: "後輪胎", price: 1800 },
  { cat: "電系", name: "火星塞", price: 250 },
  { cat: "電系", name: "電瓶", price: 1200 }
];

const pageTitles = {
  receive: "接車開單",
  orders: "維修工單",
  quotes: "估價單",
  items: "品項管理",
  history: "維修紀錄",
  customers: "客戶車輛",
  money: "營收統計",
  syncTest: "多機連線"
};

function load() {
  try {
    db = JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    db = {};
  }
  if (!Array.isArray(db.orders)) db.orders = [];
  if (!Array.isArray(db.customers)) db.customers = [];
  if (!Array.isArray(db.catalog) || !db.catalog.length) db.catalog = defaultCatalog.slice();
  db.orders = db.orders.map(normalizeOrder);
  db.customers = db.customers.map(normalizeCustomer);
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(db));
  render();
  queueCloudUpload();
}

function normalizeOrder(order) {
  const amount = Number(order.amount ?? order.total ?? 0);
  const paid = Number(order.paid ?? 0);
  const rawType = String(order.type || order.status || "工單");
  const type = rawType.includes("報價") || rawType.includes("估價") ? "估價單" : "工單";
  const workStatus = STATUSES.includes(order.workStatus) ? order.workStatus : (paid >= amount && amount > 0 ? "已完成" : "待檢查");
  return {
    id: String(order.id || uid()),
    type,
    plate: formatPlate(order.plate || ""),
    km: Number(order.km || 0),
    name: order.name || order.customer || "",
    phone: order.phone || "",
    model: order.model || "",
    year: order.year || "",
    color: order.color || "",
    items: order.items || order.note || "",
    amount,
    paid,
    laborCost: Number(order.laborCost || 0),
    internalCost: Number(order.internalCost || order.costTotal || 0),
    workStatus,
    date: order.date || todayText(),
    createdAt: order.createdAt || new Date().toISOString(),
    updatedAt: order.updatedAt || new Date().toISOString()
  };
}

function normalizeCustomer(customer) {
  return {
    id: String(customer.id || uid()),
    plate: formatPlate(customer.plate || ""),
    name: customer.name || customer.customer || "",
    phone: customer.phone || "",
    model: customer.model || "",
    year: customer.year || "",
    color: customer.color || "",
    km: Number(customer.km || 0),
    updatedAt: customer.updatedAt || new Date().toISOString()
  };
}

function findCustomerByPlate(plate) {
  const key = normalizePlate(plate);
  return db.customers.find(customer => normalizePlate(customer.plate) === key) || null;
}

function getPartCats() {
  return [...new Set(db.catalog.map(item => item.cat).filter(Boolean))];
}

function partsTotal() {
  return selectedParts.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0);
}

function updateTotals() {
  const parts = partsTotal();
  const labor = Number($("#laborCost")?.value || 0);
  const paid = Number($("#paidAmount")?.value || 0);
  const total = parts + labor;
  $("#partsTotal").textContent = money(parts);
  $("#calcPartsTotal").textContent = money(parts);
  $("#calcGrandTotal").textContent = money(total);
  $("#calcRemainTotal").textContent = money(Math.max(0, total - paid));
}

function renderPartsPicker() {
  const tabs = $("#partsTabs");
  const grid = $("#partsGrid");
  if (!tabs || !grid) return;
  const cats = getPartCats();
  if (!currentPartCat || !cats.includes(currentPartCat)) currentPartCat = cats[0] || "";

  tabs.innerHTML = cats.map(cat => `<button type="button" class="parts-tab ${cat === currentPartCat ? "active" : ""}" data-cat="${esc(cat)}">${esc(cat)}</button>`).join("");
  grid.innerHTML = db.catalog
    .filter(item => item.cat === currentPartCat)
    .map(item => `<button type="button" class="part-btn" data-part="${esc(item.name)}" data-price="${Number(item.price || 0)}"><b>${esc(item.name)}</b><span>${money(item.price)}</span></button>`)
    .join("") || `<p class="muted">這個分類尚無品項</p>`;
}

function renderSelectedParts() {
  $("#selectedParts").innerHTML = selectedParts.map((item, index) => `
    <div class="part-row">
      <div class="part-row-top">
        <input class="part-name" data-index="${index}" value="${esc(item.name)}" placeholder="品項名稱">
        <div class="part-row-subtotal">${money(Number(item.price || 0) * Number(item.qty || 1))}</div>
      </div>
      <div class="part-controls">
        <div><label>單價</label><input class="part-price" data-index="${index}" type="number" min="0" value="${Number(item.price || 0)}"></div>
        <div><label>數量</label><input class="part-qty" data-index="${index}" type="number" min="1" value="${Number(item.qty || 1)}"></div>
        <button type="button" class="part-remove" data-index="${index}">刪</button>
      </div>
    </div>
  `).join("");
  updateTotals();
}

function resetReceive() {
  draft = { plate: "", km: 0, customer: null };
  selectedParts = [];
  $("#step1").reset();
  $("#step2").reset();
  $("#step1").classList.remove("hide");
  $("#step2").classList.add("hide");
  $("#workArea").classList.add("locked");
  $("#customerInputBox").classList.remove("hide");
  $("#lockedCustomerBox").classList.add("hide");
  $("#foundMsg").textContent = "";
  $("#oldCustomerBox").classList.add("hide");
  renderSelectedParts();
}

function confirmCustomer() {
  const customer = {
    id: draft.customer?.id || uid(),
    plate: draft.plate,
    name: $("#custName").value.trim(),
    phone: $("#custPhone").value.trim(),
    model: $("#custModel").value.trim(),
    year: $("#custYear").value.trim(),
    color: $("#custColor").value.trim(),
    km: Number($("#editKm").value || draft.km || 0),
    updatedAt: new Date().toISOString()
  };
  if (!customer.name) {
    alert("請輸入客戶姓名");
    return;
  }
  const existing = findCustomerByPlate(customer.plate);
  if (existing) Object.assign(existing, customer, { id: existing.id });
  else db.customers.unshift(customer);
  draft.customer = existing || customer;
  $("#customerInputBox").classList.add("hide");
  $("#lockedCustomerBox").classList.remove("hide");
  $("#lockedCustomerLine").innerHTML = `${esc(customer.name)} <span>${esc(customer.phone || "無電話")} / ${esc(customer.model || "未填車型")}</span>`;
  $("#workArea").classList.remove("locked");
  save();
}

function createOrder() {
  if (!draft.customer) {
    alert("請先確認客戶資料");
    return;
  }
  const parts = partsTotal();
  const labor = Number($("#laborCost").value || 0);
  const paid = Number($("#paidAmount").value || 0);
  const note = $("#note").value.trim();
  const itemsText = selectedParts
    .filter(item => String(item.name || "").trim())
    .map(item => `${item.name.trim()} x${Number(item.qty || 1)} $${Number(item.price || 0) * Number(item.qty || 1)}`)
    .join("\n");
  const order = normalizeOrder({
    id: uid(),
    type: $("#orderType").value,
    plate: draft.plate,
    km: Number($("#editKm").value || draft.km || 0),
    name: draft.customer.name,
    phone: draft.customer.phone,
    model: draft.customer.model,
    year: draft.customer.year,
    color: draft.customer.color,
    items: [itemsText, note].filter(Boolean).join("\n"),
    amount: parts + labor,
    paid,
    laborCost: labor,
    internalCost: Number($("#internalCost").value || 0),
    workStatus: $("#workStatus").value
  });
  db.orders.unshift(order);
  const customer = findCustomerByPlate(order.plate);
  if (customer) {
    customer.km = order.km;
    customer.updatedAt = new Date().toISOString();
  }
  save();
  resetReceive();
  openPage(order.type === "估價單" ? "quotes" : "orders");
}

function badgeClass(order) {
  if (order.type === "估價單") return "quote";
  if (Number(order.paid) >= Number(order.amount) && Number(order.amount) > 0) return "paid";
  return "unpaid";
}

function paymentText(order) {
  if (order.type === "估價單") return "估價";
  const remain = Math.max(0, Number(order.amount) - Number(order.paid));
  if (!remain) return "已結清";
  if (Number(order.paid) > 0) return `部分收款，未收 ${money(remain)}`;
  return `未收 ${money(remain)}`;
}

function orderCard(order) {
  return `
    <div class="item" data-order="${esc(order.id)}">
      <h3>${esc(order.plate)} / ${esc(order.name || "未填客戶")}</h3>
      <span class="badge ${badgeClass(order)}">${esc(order.type)} · ${esc(order.workStatus)}</span>
      <p class="muted">${esc(order.date)} · ${Number(order.km || 0).toLocaleString("zh-TW")} KM · ${esc(order.phone || "無電話")}</p>
      <div>${esc(order.items || "尚未填寫維修內容").replace(/\n/g, "<br>")}</div>
      <p><b>${money(order.amount)}</b> / 已收 ${money(order.paid)} / ${paymentText(order)}</p>
      <div class="actions">
        <button type="button" class="editOrder" data-id="${esc(order.id)}">編輯</button>
        ${order.type === "估價單" ? `<button type="button" class="convertQuote" data-id="${esc(order.id)}">轉工單</button>` : ""}
        <button type="button" class="markPaid green" data-id="${esc(order.id)}">結清</button>
        <button type="button" class="deleteOrder danger" data-id="${esc(order.id)}">刪除</button>
      </div>
    </div>
  `;
}

function renderOrders() {
  const orders = db.orders.filter(order => order.type !== "估價單");
  $("#orderList").innerHTML = orders.map(orderCard).join("") || `<p class="muted">目前沒有工單</p>`;
  const quotes = db.orders.filter(order => order.type === "估價單");
  $("#quoteList").innerHTML = quotes.map(orderCard).join("") || `<p class="muted">目前沒有估價單</p>`;
}

function renderCustomers() {
  $("#customerList").innerHTML = db.customers.map(customer => `
    <div class="item">
      <h3>${esc(customer.plate)} / ${esc(customer.name || "未填姓名")}</h3>
      <p class="muted">${esc(customer.phone || "無電話")} · ${esc(customer.model || "未填車型")} · ${Number(customer.km || 0).toLocaleString("zh-TW")} KM</p>
      <p>${esc([customer.year, customer.color].filter(Boolean).join(" / ") || "無其他資料")}</p>
    </div>
  `).join("") || `<p class="muted">目前沒有客戶資料</p>`;
}

function renderItemManager() {
  const select = $("#itemCatSelect");
  const list = $("#itemManagerList");
  if (!select || !list) return;
  const cats = getPartCats();
  if (!currentPartCat || !cats.includes(currentPartCat)) currentPartCat = cats[0] || "";
  select.innerHTML = cats.map(cat => `<option value="${esc(cat)}" ${cat === currentPartCat ? "selected" : ""}>${esc(cat)}</option>`).join("");
  list.innerHTML = cats.map(cat => `
    <div class="catalog-cat">
      <div class="catalog-cat-head"><h3>${esc(cat)}</h3><button type="button" class="secondary selectCat" data-cat="${esc(cat)}">使用</button></div>
      <div class="catalog-items">
        ${db.catalog.filter(item => item.cat === cat).map(item => {
          const index = db.catalog.indexOf(item);
          return `<div class="catalog-item"><div class="catalog-item-row"><input class="catalog-name" data-index="${index}" value="${esc(item.name)}"><input class="catalog-price" data-index="${index}" type="number" min="0" value="${Number(item.price || 0)}"><button type="button" class="catalog-del deleteItem" data-index="${index}">刪除</button></div></div>`;
        }).join("") || `<p class="muted">沒有品項</p>`}
      </div>
    </div>
  `).join("");
}

function renderMoney() {
  const orders = db.orders.filter(order => order.type !== "估價單");
  const amount = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const paid = orders.reduce((sum, order) => sum + Number(order.paid || 0), 0);
  const cost = orders.reduce((sum, order) => sum + Number(order.internalCost || 0), 0);
  $("#revenue").textContent = money(amount);
  $("#stats").textContent = `工單 ${orders.length} 筆 / 已收 ${money(paid)} / 未收 ${money(amount - paid)} / 成本 ${money(cost)} / 毛利 ${money(amount - cost)}`;
}

function renderCloudSettings() {
  const urlInput = $("#cloudApiUrlV108");
  const autoInput = $("#cloudAutoSync");
  const last = $("#cloudLastSync");
  if (!urlInput || !autoInput || !last) return;
  if (document.activeElement !== urlInput) urlInput.value = getCloudUrl();
  autoInput.checked = localStorage.getItem(SYNC_AUTO) === "1";
  const lastSync = localStorage.getItem(SYNC_LAST);
  last.textContent = lastSync ? `最後同步：${new Date(lastSync).toLocaleString("zh-TW")}` : "尚未同步";
}

function renderSearch() {
  const value = normalizePlate($("#search")?.value || "");
  const text = String($("#search")?.value || "").trim().toLowerCase();
  const rows = db.customers.filter(customer => {
    const haystack = [customer.plate, customer.name, customer.phone, customer.model].join(" ").toLowerCase();
    return !text || haystack.includes(text) || normalizePlate(customer.plate).includes(value);
  });
  $("#searchList").innerHTML = rows.slice(0, 8).map(customer => `
    <div class="item">
      <h3>${esc(customer.plate)} / ${esc(customer.name)}</h3>
      <p class="muted">${esc(customer.phone || "無電話")} · ${esc(customer.model || "未填車型")}</p>
    </div>
  `).join("");
}

function renderHistory(plate = $("#historyPlate")?.value || draft.plate) {
  const key = normalizePlate(plate);
  const rows = db.orders.filter(order => normalizePlate(order.plate) === key);
  const html = rows.map(orderCard).join("") || `<p class="muted">查無維修紀錄</p>`;
  if ($("#historyList")) $("#historyList").innerHTML = html;
  if ($("#plateHistoryList")) $("#plateHistoryList").innerHTML = html;
}

function render() {
  renderPartsPicker();
  renderSelectedParts();
  renderOrders();
  renderCustomers();
  renderItemManager();
  renderMoney();
  renderSearch();
  renderCloudSettings();
}

function openPage(page) {
  $$(".page").forEach(panel => panel.classList.toggle("active", panel.id === page));
  $$(".side button[data-page]").forEach(button => button.classList.toggle("active", button.dataset.page === page));
  $("#title").textContent = pageTitles[page] || "紹馳車業";
  $("#side").classList.remove("open");
  $("#overlay").classList.remove("show");
  if (page === "money") renderMoney();
}

function openEditOrder(id) {
  const order = db.orders.find(item => item.id === id);
  if (!order) return;
  editingOrderId = id;
  $("#editOrderInfo").textContent = `${order.plate} / ${order.name} / ${order.date}`;
  $("#editNote").value = order.items || "";
  $("#editLaborCost").value = Number(order.amount || 0);
  $("#editPaidAmount").value = Number(order.paid || 0);
  $("#editWorkStatus").innerHTML = STATUSES.map(status => `<option ${status === order.workStatus ? "selected" : ""}>${status}</option>`).join("");
  $("#editOrderModal").classList.remove("hide");
}

function saveEditOrder() {
  const order = db.orders.find(item => item.id === editingOrderId);
  if (!order) return;
  order.items = $("#editNote").value.trim();
  order.amount = Number($("#editLaborCost").value || 0);
  order.paid = Number($("#editPaidAmount").value || 0);
  order.workStatus = $("#editWorkStatus").value;
  order.updatedAt = new Date().toISOString();
  $("#editOrderModal").classList.add("hide");
  editingOrderId = null;
  save();
}

function exportData() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "shaochi-moto-backup.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importData() {
  try {
    const incoming = JSON.parse($("#importBox").value || "{}");
    db = {
      orders: Array.isArray(incoming.orders) ? incoming.orders.map(normalizeOrder) : [],
      customers: Array.isArray(incoming.customers) ? incoming.customers.map(normalizeCustomer) : [],
      catalog: Array.isArray(incoming.catalog) && incoming.catalog.length ? incoming.catalog : defaultCatalog.slice()
    };
    save();
    alert("匯入完成");
  } catch {
    alert("JSON 格式不正確");
  }
}

function setCloudStatus(message, type = "") {
  const status = $("#cloudStatusV108");
  if (!status) return;
  status.textContent = message;
  status.style.color = type === "ok" ? "#86efac" : type === "error" ? "#fca5a5" : "#fbbf24";
}

function getCloudUrl() {
  return (localStorage.getItem(SYNC_URL) || DEFAULT_SYNC_URL).trim();
}

function isAutoSyncOn() {
  return localStorage.getItem(SYNC_AUTO) === "1";
}

function cloudPayload() {
  return {
    app: "shaochi-motor",
    version: "v14.1-fixed",
    updatedAt: new Date().toISOString(),
    data: db
  };
}

function normalizeCloudResponse(payload) {
  const source = payload?.data || payload;
  return {
    orders: Array.isArray(source?.orders) ? source.orders.map(normalizeOrder) : [],
    customers: Array.isArray(source?.customers) ? source.customers.map(normalizeCustomer) : [],
    catalog: Array.isArray(source?.catalog) && source.catalog.length ? source.catalog : defaultCatalog.slice()
  };
}

async function cloudUpload(options = {}) {
  const url = getCloudUrl();
  if (!url) {
    if (!options.silent) setCloudStatus("請先輸入雲端同步 API URL", "error");
    return false;
  }
  try {
    if (!options.silent) setCloudStatus("正在上傳到雲端...");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "saveAll", data: cloudPayload().data })
    });
    const payload = await response.json();
    if (!response.ok || payload?.ok === false) throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
    localStorage.setItem(SYNC_LAST, new Date().toISOString());
    renderCloudSettings();
    if (!options.silent) setCloudStatus("已上傳到雲端", "ok");
    return true;
  } catch (error) {
    setCloudStatus(`上傳失敗：${error.message}`, "error");
    return false;
  }
}

async function cloudDownload(options = {}) {
  const url = getCloudUrl();
  if (!url) {
    if (!options.silent) setCloudStatus("請先輸入雲端同步 API URL", "error");
    return false;
  }
  try {
    if (!options.silent) setCloudStatus("正在從雲端下載...");
    const joiner = url.includes("?") ? "&" : "?";
    const response = await fetch(`${url}${joiner}action=getAll&t=${Date.now()}`);
    const payload = await response.json();
    if (!response.ok || payload?.ok === false) throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
    applyingCloudData = true;
    db = normalizeCloudResponse(payload);
    localStorage.setItem(KEY, JSON.stringify(db));
    localStorage.setItem(SYNC_LAST, new Date().toISOString());
    applyingCloudData = false;
    render();
    if (!options.silent) setCloudStatus("已從雲端下載", "ok");
    return true;
  } catch (error) {
    applyingCloudData = false;
    setCloudStatus(`下載失敗：${error.message}`, "error");
    return false;
  }
}

async function cloudPing() {
  const url = getCloudUrl();
  try {
    setCloudStatus("正在測試連線...");
    const joiner = url.includes("?") ? "&" : "?";
    const response = await fetch(`${url}${joiner}action=ping&t=${Date.now()}`);
    const payload = await response.json();
    if (!response.ok || payload?.ok === false) throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
    setCloudStatus(payload.message || "雲端連線正常", "ok");
    return true;
  } catch (error) {
    setCloudStatus(`連線失敗：${error.message}`, "error");
    return false;
  }
}

function queueCloudUpload() {
  if (applyingCloudData || !isAutoSyncOn() || !getCloudUrl()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => cloudUpload({ silent: true }), 1200);
}

function formatPlateField(input) {
  const next = formatPlate(input.value);
  input.value = next;
}

document.addEventListener("submit", event => {
  if (event.target.id === "loginForm") {
    event.preventDefault();
    if ($("#user").value === USER && $("#pass").value === PASS) {
      localStorage.setItem(LOGIN, "1");
      $("#login").classList.add("hide");
      $("#app").classList.remove("hide");
      render();
    } else {
      $("#loginMsg").textContent = "帳號或密碼錯誤";
    }
  }

  if (event.target.id === "step1") {
    event.preventDefault();
    draft.plate = formatPlate($("#plate").value);
    draft.km = Number($("#km").value || 0);
    draft.customer = findCustomerByPlate(draft.plate);
    $("#showPlate").textContent = draft.plate;
    $("#editKm").value = draft.km;
    $("#step1").classList.add("hide");
    $("#step2").classList.remove("hide");
    if (draft.customer) {
      $("#foundMsg").textContent = "找到舊客戶資料";
      $("#custName").value = draft.customer.name;
      $("#custPhone").value = draft.customer.phone;
      $("#custModel").value = draft.customer.model;
      $("#custYear").value = draft.customer.year;
      $("#custColor").value = draft.customer.color;
      $("#oldCustomerBox").classList.remove("hide");
      $("#oldCustomerBox").textContent = `${draft.customer.name} / ${draft.customer.phone || "無電話"} / ${draft.customer.model || "未填車型"}`;
    }
  }
});

document.addEventListener("click", event => {
  const nav = event.target.closest(".side button[data-page]");
  if (nav) return openPage(nav.dataset.page);

  if (event.target.closest("#menu")) {
    $("#side").classList.add("open");
    $("#overlay").classList.add("show");
  }
  if (event.target.closest("#overlay")) {
    $("#side").classList.remove("open");
    $("#overlay").classList.remove("show");
  }
  if (event.target.closest("#logout")) {
    localStorage.removeItem(LOGIN);
    location.reload();
  }
  if (event.target.closest("#back")) resetReceive();
  if (event.target.closest("#confirmCustomerBtn")) confirmCustomer();
  if (event.target.closest("#createOrderBtn")) createOrder();
  if (event.target.closest("#addCustomItem")) {
    selectedParts.push({ name: "", price: 0, qty: 1 });
    renderSelectedParts();
  }
  const tab = event.target.closest("[data-cat]");
  if (tab) {
    currentPartCat = tab.dataset.cat;
    renderPartsPicker();
  }
  const part = event.target.closest("[data-part]");
  if (part) {
    const name = part.dataset.part;
    const existing = selectedParts.find(item => item.name === name);
    if (existing) existing.qty += 1;
    else selectedParts.push({ name, price: Number(part.dataset.price || 0), qty: 1 });
    renderSelectedParts();
  }
  const removePart = event.target.closest(".part-remove");
  if (removePart) {
    selectedParts.splice(Number(removePart.dataset.index), 1);
    renderSelectedParts();
  }
  const edit = event.target.closest(".editOrder");
  if (edit) openEditOrder(edit.dataset.id);
  if (event.target.closest("#closeEditOrder")) $("#editOrderModal").classList.add("hide");
  if (event.target.closest("#saveEditOrder")) saveEditOrder();
  const paid = event.target.closest(".markPaid");
  if (paid) {
    const order = db.orders.find(item => item.id === paid.dataset.id);
    if (order) {
      order.paid = order.amount;
      order.workStatus = "已完成";
      save();
    }
  }
  const convert = event.target.closest(".convertQuote");
  if (convert) {
    const order = db.orders.find(item => item.id === convert.dataset.id);
    if (order) {
      order.type = "工單";
      order.workStatus = "待檢查";
      save();
      openPage("orders");
    }
  }
  const del = event.target.closest(".deleteOrder");
  if (del && confirm("確定刪除這筆單據？")) {
    db.orders = db.orders.filter(item => item.id !== del.dataset.id);
    save();
  }
  if (event.target.closest("#addCatBtn")) {
    const name = $("#newCatName").value.trim();
    if (!name) return alert("請輸入分類名稱");
    if (!getPartCats().includes(name)) db.catalog.push({ cat: name, name: "新項目", price: 0 });
    currentPartCat = name;
    $("#newCatName").value = "";
    save();
  }
  if (event.target.closest("#addItemBtn")) {
    const name = $("#newItemName").value.trim();
    const cat = $("#itemCatSelect").value;
    if (!name) return alert("請輸入品項名稱");
    db.catalog.push({ cat, name, price: Number($("#newItemPrice").value || 0) });
    $("#newItemName").value = "";
    $("#newItemPrice").value = "";
    save();
  }
  const deleteItem = event.target.closest(".deleteItem");
  if (deleteItem) {
    db.catalog.splice(Number(deleteItem.dataset.index), 1);
    save();
  }
  const selectCat = event.target.closest(".selectCat");
  if (selectCat) {
    currentPartCat = selectCat.dataset.cat;
    renderPartsPicker();
    renderItemManager();
  }
  if (event.target.closest("#historyBtn")) renderHistory($("#historyPlate").value);
  if (event.target.closest("#plateHistoryBtn")) {
    $("#plateHistoryTitle").textContent = `${draft.plate || $("#showPlate").textContent} 維修紀錄`;
    renderHistory(draft.plate || $("#showPlate").textContent);
    $("#plateHistoryModal").classList.remove("hide");
  }
  if (event.target.closest("#closePlateHistory") || event.target.id === "plateHistoryModal") {
    $("#plateHistoryModal").classList.add("hide");
  }
  if (event.target.closest("#export")) exportData();
  if (event.target.closest("#import")) importData();
  if (event.target.closest("#cloudPingNow")) cloudPing();
  if (event.target.closest("#cloudUploadNow")) cloudUpload();
  if (event.target.closest("#cloudDownloadNow")) cloudDownload();
});

document.addEventListener("input", event => {
  if (event.target.id === "plate") {
    formatPlateField(event.target);
    return;
  }
  const index = Number(event.target.dataset.index);
  if (event.target.matches(".part-name") && selectedParts[index]) selectedParts[index].name = event.target.value;
  if (event.target.matches(".part-price") && selectedParts[index]) selectedParts[index].price = Number(event.target.value || 0);
  if (event.target.matches(".part-qty") && selectedParts[index]) selectedParts[index].qty = Math.max(1, Number(event.target.value || 1));
  if (event.target.matches(".part-name,.part-price,.part-qty")) renderSelectedParts();
  if (event.target.matches("#laborCost,#paidAmount")) updateTotals();
  if (event.target.matches("#search")) renderSearch();
  if (event.target.id === "cloudApiUrlV108") {
    localStorage.setItem(SYNC_URL, event.target.value.trim());
    renderCloudSettings();
    return;
  }
  if (event.target.matches(".catalog-name") && db.catalog[index]) db.catalog[index].name = event.target.value;
  if (event.target.matches(".catalog-price") && db.catalog[index]) db.catalog[index].price = Number(event.target.value || 0);
  if (event.target.matches(".catalog-name,.catalog-price")) {
    localStorage.setItem(KEY, JSON.stringify(db));
    renderPartsPicker();
  }
});

document.addEventListener("change", event => {
  if (event.target.id === "itemCatSelect") currentPartCat = event.target.value;
  if (event.target.id === "cloudAutoSync") {
    localStorage.setItem(SYNC_AUTO, event.target.checked ? "1" : "0");
    renderCloudSettings();
    if (event.target.checked) cloudDownload({ silent: false });
  }
});

load();
if (localStorage.getItem(LOGIN) === "1") {
  $("#login").classList.add("hide");
  $("#app").classList.remove("hide");
}
render();
if (isAutoSyncOn() && getCloudUrl()) cloudDownload({ silent: true });
