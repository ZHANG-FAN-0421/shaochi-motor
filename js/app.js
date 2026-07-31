const USER = "Zhangfan";
const PASS = "zhangfan0421";
const KEY = "shaochi_v14_data";
const LOGIN = "shaochi_v14_login";
const LOGIN_USER = "shaochi_v14_login_user";
const DEFAULT_SYNC_URL = "https://script.google.com/macros/s/AKfycbw5xe6EfThaRG5R1WuM9tJN1wt3rnWczF0MOerC3RqmPtSdpg2BqsxAFU8MHZMG3-xw/exec";
const SYNC_URL = "shaochi_cloud_api_url";
const SYNC_AUTO = "shaochi_cloud_auto_sync";
const SYNC_LAST = "shaochi_cloud_last_sync";
const STATUSES = ["待檢查", "等待料件", "維修中", "待取車", "已完成", "已交車"];
const PERMISSIONS = [
  ["receive", "維修主畫面"],
  ["appointments", "預約一覽"],
  ["orders", "維修單一覽表"],
  ["quotes", "估價一覽表"],
  ["items", "維修項目維護"],
  ["customers", "客戶車輛"],
  ["moneyDay", "單日維修金額"],
  ["moneyMonth", "單月維修金額"],
  ["settings", "系統設定"]
];
const DEFAULT_ROLES = [
  { id: "admin", name: "管理員", pages: PERMISSIONS.map(item => item[0]) },
  { id: "manager", name: "店長", pages: ["receive", "appointments", "orders", "quotes", "items", "customers", "moneyDay", "moneyMonth"] },
  { id: "technician", name: "維修師傅", pages: ["receive", "appointments", "orders", "quotes", "customers"] },
  { id: "counter", name: "櫃台", pages: ["receive", "appointments", "orders", "quotes", "customers", "moneyDay", "moneyMonth"] }
];

let db = { orders: [], customers: [], catalog: [], appointments: [], employees: [], roles: [], settings: {} };
let draft = { plate: "", km: 0, customer: null };
let selectedParts = [];
let currentPartCat = "";
let editingOrderId = null;
let editingCustomerId = null;
let editingEmployeeId = null;
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
const todayText = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const dateInputValue = value => {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  return todayText();
};
const normalizePlate = value => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const formatPlate = value => {
  const raw = normalizePlate(value);
  const letters = raw.slice(0, 3).replace(/[^A-Z]/g, "");
  const digits = raw.slice(3).replace(/[^0-9]/g, "").slice(0, 4);
  if (letters.length < 3) return letters + digits;
  return digits ? `${letters}-${digits}` : letters;
};
const orderPrefix = type => String(type || "").includes("估價") ? "QT" : "RO";
const orderDateKey = value => dateInputValue(value).replace(/-/g, "");
const orderNoPattern = /^(RO|QT)-\d{8}-\d{3,}$/;

function orderNoSequence(orderNo) {
  const match = String(orderNo || "").match(/-(\d+)$/);
  return match ? Number(match[1] || 0) : 0;
}

function assignDisplayOrderNumbers() {
  const counters = {};
  (db.orders || [])
    .slice()
    .sort((a, b) => `${orderDateKey(a.date)}-${a.createdAt || ""}-${a.id || ""}`.localeCompare(`${orderDateKey(b.date)}-${b.createdAt || ""}-${b.id || ""}`))
    .forEach(order => {
      const prefix = orderPrefix(order.type);
      counters[prefix] = (counters[prefix] || 0) + 1;
      order._displayOrderNo = `${prefix}-${String(counters[prefix]).padStart(3, "0")}`;
    });
}

function shortOrderNo(orderOrNo) {
  if (orderOrNo && typeof orderOrNo === "object") {
    return orderOrNo._displayOrderNo || `${orderPrefix(orderOrNo.type)}-${String(orderNoSequence(orderOrNo.orderNo) || 1).padStart(3, "0")}`;
  }
  const text = String(orderOrNo || "").trim();
  const parts = text.split("-");
  if ((parts[0] === "RO" || parts[0] === "QT") && parts.length >= 3) {
    return `${parts[0]}-${parts[parts.length - 1]}`;
  }
  return text || "未編號";
}

function nextOrderNo(type = "工單", date = todayText(), excludeId = "") {
  const prefix = orderPrefix(type);
  const dateKey = orderDateKey(date);
  const max = (db.orders || []).reduce((highest, order) => {
    if (excludeId && order.id === excludeId) return highest;
    const no = String(order.orderNo || "");
    if (!no.startsWith(`${prefix}-`)) return highest;
    return Math.max(highest, orderNoSequence(no));
  }, 0);
  return `${prefix}-${dateKey}-${String(max + 1).padStart(3, "0")}`;
}

function ensureOrderNo(order) {
  if (orderNoPattern.test(String(order.orderNo || ""))) return order.orderNo;
  return nextOrderNo(order.type, order.date, order.id);
}

function compareOrderDesc(a, b) {
  const aSeq = orderNoSequence(a._displayOrderNo || a.orderNo);
  const bSeq = orderNoSequence(b._displayOrderNo || b.orderNo);
  const dateSort = orderDateKey(b.date).localeCompare(orderDateKey(a.date));
  if (dateSort) return dateSort;
  const noSort = bSeq - aSeq;
  if (noSort) return noSort;
  return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
}

function repairOrderNumbers() {
  const counters = {};
  let changed = false;
  (db.orders || [])
    .slice()
    .sort((a, b) => `${orderDateKey(a.date)}-${a.createdAt || ""}`.localeCompare(`${orderDateKey(b.date)}-${b.createdAt || ""}`))
    .forEach(order => {
      const prefix = orderPrefix(order.type);
      const dateKey = orderDateKey(order.date);
      counters[prefix] = (counters[prefix] || 0) + 1;
      const nextNo = `${prefix}-${dateKey}-${String(counters[prefix]).padStart(3, "0")}`;
      if (order.orderNo !== nextNo) {
        order.orderNo = nextNo;
        changed = true;
      }
    });
  if (changed) localStorage.setItem(KEY, JSON.stringify(db));
}

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
  receive: "維修主畫面",
  appointments: "預約一覽",
  orders: "維修單一覽表",
  quotes: "估價一覽表",
  items: "維修項目維護",
  customers: "客戶車輛",
  moneyDay: "單日維修金額",
  moneyMonth: "單月維修金額",
  settings: "系統設定"
};

function load() {
  try {
    db = JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    db = {};
  }
  if (!Array.isArray(db.orders)) db.orders = [];
  if (!Array.isArray(db.customers)) db.customers = [];
  if (!Array.isArray(db.appointments)) db.appointments = [];
  if (!Array.isArray(db.catalog)) db.catalog = defaultCatalog.slice();
  if (!Array.isArray(db.categories)) db.categories = [];
  if (!db.settings || typeof db.settings !== "object") db.settings = {};
  if (!db.settings.systemName || ["紹馳車業", "紹馳技研"].includes(db.settings.systemName)) db.settings.systemName = "奇典動能";
  if (!Array.isArray(db.roles) || !db.roles.length) db.roles = DEFAULT_ROLES.map(role => ({ ...role, pages: role.pages.slice() }));
  if (!Array.isArray(db.employees) || !db.employees.length) {
    db.employees = [{ id: uid(), name: "管理員", username: USER, password: PASS, roleId: "admin", active: true }];
  }
  db.roles = db.roles.map(role => ({ ...role, pages: Array.isArray(role.pages) ? role.pages : [] }));
  db.employees = db.employees.map(employee => ({
    id: String(employee.id || uid()),
    name: employee.name || employee.username || "未命名員工",
    username: employee.username || "",
    password: employee.password || "",
    roleId: employee.roleId || "technician",
    active: employee.active !== false
  }));
  db.categories = [...new Set([...db.categories, ...db.catalog.map(item => item.cat)].filter(Boolean))];
  db.orders = db.orders.map(normalizeOrder);
  repairOrderNumbers();
  db.customers = db.customers.map(normalizeCustomer);
  db.appointments = db.appointments.map(normalizeAppointment);
  ensureAccessData();
  localStorage.setItem(KEY, JSON.stringify(db));
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
  const normalized = {
    id: String(order.id || uid()),
    orderNo: order.orderNo || order.no || order.number || "",
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
    mechanicName: order.mechanicName || order.mechanic || "",
    workStatus,
    date: order.date || todayText(),
    createdAt: order.createdAt || new Date().toISOString(),
    updatedAt: order.updatedAt || new Date().toISOString()
  };
  normalized.orderNo = ensureOrderNo(normalized);
  return normalized;
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

function normalizeAppointment(appointment) {
  const customer = appointment?.customer && typeof appointment.customer === "object" ? appointment.customer : {};
  return {
    id: String(appointment?.id || uid()),
    plate: formatPlate(appointment?.plate || customer.plate || ""),
    name: appointment?.name || customer.name || "",
    phone: appointment?.phone || customer.phone || "",
    model: appointment?.model || customer.model || "",
    date: dateInputValue(appointment?.date || todayText()),
    time: String(appointment?.time || "").slice(0, 5),
    note: appointment?.note || appointment?.message || "",
    source: appointment?.source || "店內建立",
    status: appointment?.status || "待確認",
    createdAt: appointment?.createdAt || new Date().toISOString()
  };
}

function currentEmployee() {
  const username = localStorage.getItem(LOGIN_USER) || USER;
  return db.employees.find(employee => employee.username === username && employee.active) || db.employees.find(employee => employee.roleId === "admin") || null;
}

function activeMechanics() {
  const employees = db.employees.filter(employee => employee.active !== false);
  return employees.length ? employees : [{ name: currentEmployee()?.name || "未指定師傅" }];
}

function renderMechanicSelect(selectedName = "") {
  const select = $("#mechanicSelect");
  if (!select) return;
  const current = selectedName || select.value || currentEmployee()?.name || "";
  const mechanics = activeMechanics();
  select.innerHTML = mechanics
    .map(employee => `<option value="${esc(employee.name)}">${esc(employee.name)}</option>`)
    .join("");
  if (current && !mechanics.some(employee => employee.name === current)) {
    select.insertAdjacentHTML("afterbegin", `<option value="${esc(current)}">${esc(current)}</option>`);
  }
  select.value = current || select.options[0]?.value || "";
}

function roleFor(employee = currentEmployee()) {
  return db.roles.find(role => role.id === employee?.roleId) || DEFAULT_ROLES[0];
}

function canAccess(page) {
  const role = roleFor();
  return role.pages.includes(page);
}

function applyPermissionNav() {
  $$(".side button[data-page]").forEach(button => {
    button.hidden = !canAccess(button.dataset.page);
  });
}

function loginEmployee(username, password) {
  return db.employees.find(employee => employee.active && employee.username === username && employee.password === password) || null;
}

function systemName() {
  const name = db.settings?.systemName || "奇典動能";
  return ["紹馳車業", "紹馳技研"].includes(name) ? "奇典動能" : name;
}

function systemInitial() {
  return systemName().trim().slice(0, 1) || "奇";
}

function applySystemSettings() {
  const name = systemName();
  document.title = `${name}維修管理`;
  if ($("#loginTitle")) $("#loginTitle").textContent = name;
  if ($("#brandName")) $("#brandName").textContent = name;
  if ($("#loginLogo")) $("#loginLogo").textContent = systemInitial();
  if ($("#brandLogo")) $("#brandLogo").textContent = systemInitial();
  if ($("#loginSubtitle")) $("#loginSubtitle").textContent = "機車維修管理系統";
  if ($("#brandSubtitle")) $("#brandSubtitle").textContent = "Repair System";
}

function ensureAccessData() {
  const allowedPages = PERMISSIONS.map(item => item[0]);
  if (!Array.isArray(db.roles) || !db.roles.length) db.roles = DEFAULT_ROLES.map(role => ({ ...role, pages: role.pages.slice() }));
  DEFAULT_ROLES.forEach(defaultRole => {
    const existingRole = db.roles.find(role => role.id === defaultRole.id);
    if (!existingRole) {
      db.roles.push({ ...defaultRole, pages: defaultRole.pages.slice() });
    } else if (defaultRole.pages.includes("appointments") && !existingRole.pages.includes("appointments")) {
      existingRole.pages.push("appointments");
    }
  });
  if (!Array.isArray(db.employees) || !db.employees.length) {
    db.employees = [{ id: uid(), name: "管理員", username: USER, password: PASS, roleId: "admin", active: true }];
  }
  db.roles = db.roles.map(role => {
    const migratedPages = Array.isArray(role.pages)
      ? role.pages.flatMap(page => page === "money" ? ["moneyDay", "moneyMonth"] : page)
      : [];
    return { ...role, pages: [...new Set(migratedPages)].filter(page => allowedPages.includes(page)) };
  });
  const defaultRoleOrder = DEFAULT_ROLES.map(role => role.id);
  db.roles.sort((a, b) => {
    const aIndex = defaultRoleOrder.indexOf(a.id);
    const bIndex = defaultRoleOrder.indexOf(b.id);
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  });
  db.employees = db.employees.map(employee => ({
    id: String(employee.id || uid()),
    name: employee.name || employee.username || "未命名員工",
    username: employee.username || "",
    password: employee.password || "",
    roleId: employee.roleId || "technician",
    active: employee.active !== false
  }));
}

function findCustomerByPlate(plate) {
  const key = normalizePlate(plate);
  return db.customers.find(customer => normalizePlate(customer.plate) === key) || null;
}

function getPartCats() {
  return [...new Set([...(db.categories || []), ...db.catalog.map(item => item.cat)].filter(Boolean))];
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
    .join("") || `<p class="muted">查無歷史維修紀錄</p>`;
}

function renderSelectedParts() {
  $("#selectedParts").innerHTML = selectedParts.length ? `
    <div class="ymmis-part-table">
      <div class="ymmis-part-head">
        <span>維修項目</span><span>單價</span><span>數量</span><span>小計</span><span>刪除</span>
      </div>
      ${selectedParts.map((item, index) => `
        <div class="part-row ymmis-part-row">
          <input class="part-name" data-index="${index}" value="${esc(item.name)}" placeholder="小項目名稱">
          <input class="part-price" data-index="${index}" type="number" min="0" value="${Number(item.price || 0)}">
          <input class="part-qty" data-index="${index}" type="number" min="1" value="${Number(item.qty || 1)}">
          <div class="part-row-subtotal">${money(Number(item.price || 0) * Number(item.qty || 1))}</div>
          <button type="button" class="part-remove" data-index="${index}">刪</button>
        </div>
      `).join("")}
    </div>
  ` : `<div class="ymmis-empty">尚未加入維修項目</div>`;
  updateTotals();
}

function resetReceive() {
  editingOrderId = null;
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
  $("#createOrderBtn").textContent = "建檔輸入";
  $("#createQuoteBtn").classList.remove("hide");
  renderMechanicSelect(currentEmployee()?.name || "");
  if ($("#repairDate")) $("#repairDate").value = todayText();
  renderSelectedParts();
}

function parseOrderItems(text) {
  const parts = [];
  const notes = [];
  String(text || "").split("\n").forEach(line => {
    const value = line.trim();
    if (!value) return;
    const match = value.match(/^(.*?)\s+x(\d+)\s+\$(\d+)$/);
    if (match) {
      const qty = Math.max(1, Number(match[2] || 1));
      const total = Number(match[3] || 0);
      parts.push({ name: match[1].trim(), qty, price: qty ? Math.round(total / qty) : total });
    } else {
      notes.push(value);
    }
  });
  return { parts, note: notes.join("\n") };
}

function loadOrderToReceive(order) {
  editingOrderId = order.id;
  const customer = {
    id: findCustomerByPlate(order.plate)?.id || uid(),
    plate: order.plate,
    name: order.name || "",
    phone: order.phone || "",
    model: order.model || "",
    year: order.year || "",
    color: order.color || "",
    km: Number(order.km || 0),
    updatedAt: order.updatedAt || new Date().toISOString()
  };
  draft = { plate: order.plate, km: Number(order.km || 0), customer };
  const parsed = parseOrderItems(order.items);
  selectedParts = parsed.parts;
  $("#step1").classList.add("hide");
  $("#step2").classList.remove("hide");
  $("#showPlate").textContent = order.plate;
  $("#editKm").value = Number(order.km || 0);
  $("#custName").value = customer.name;
  $("#custPhone").value = customer.phone;
  $("#custModel").value = customer.model;
  $("#custYear").value = customer.year;
  $("#custColor").value = customer.color;
  $("#customerInputBox").classList.add("hide");
  showLockedCustomer(customer);
  $("#workArea").classList.remove("locked");
  $("#note").value = parsed.note;
  $("#laborCost").value = Number(order.laborCost || Math.max(0, Number(order.amount || 0) - partsTotal()));
  $("#paidAmount").value = Number(order.paid || 0);
  renderMechanicSelect(order.mechanicName || currentEmployee()?.name || "");
  if ($("#repairDate")) $("#repairDate").value = dateInputValue(order.date);
  $("#createOrderBtn").textContent = "儲存修改";
  $("#createQuoteBtn").classList.add("hide");
  updateHistoryCount(order.plate);
  renderSelectedParts();
  openPage("receive");
}

function customerHeaderLine(customer) {
  const items = [
    customer?.name,
    customer?.model,
    customer?.year,
    customer?.color,
    customer?.phone
  ].map(value => String(value || "").trim() || "…");
  return items.map(value => `<span class="customer-dot">${esc(value)}</span>`).join("");
}

function showLockedCustomer(customer) {
  $("#lockedCustomerBox").classList.remove("hide");
  $("#lockedCustomerLine").innerHTML = customerHeaderLine(customer);
}

function includesQuery(values, query) {
  const keyword = String(query || "").trim().toLowerCase();
  if (!keyword) return true;
  return values.some(value => String(value || "").toLowerCase().includes(keyword));
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
  const existing = findCustomerByPlate(customer.plate);
  if (existing) Object.assign(existing, customer, { id: existing.id });
  else db.customers.unshift(customer);
  draft.customer = existing || customer;
  $("#customerInputBox").classList.add("hide");
  showLockedCustomer(draft.customer);
  $("#workArea").classList.remove("locked");
  save();
}

function draftCustomerFromInputs() {
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
  const existing = findCustomerByPlate(customer.plate);
  if (existing) Object.assign(existing, customer, { id: existing.id });
  else db.customers.unshift(customer);
  draft.customer = existing || customer;
  return draft.customer;
}

function createOrder(type = "工單") {
  draftCustomerFromInputs();
  const parts = partsTotal();
  const labor = Number($("#laborCost").value || 0);
  const paid = Number($("#paidAmount").value || 0);
  const note = $("#note").value.trim();
  const itemsText = selectedParts
    .filter(item => String(item.name || "").trim())
    .map(item => `${item.name.trim()} x${Number(item.qty || 1)} $${Number(item.price || 0) * Number(item.qty || 1)}`)
    .join("\n");
  const existingOrder = db.orders.find(item => item.id === editingOrderId);
  const order = normalizeOrder({
    id: editingOrderId || uid(),
    type: existingOrder?.type || type,
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
    internalCost: 0,
    mechanicName: $("#mechanicSelect")?.value || currentEmployee()?.name || "",
    date: $("#repairDate")?.value || todayText(),
    workStatus: "待檢查"
  });
  if (existingOrder) {
    Object.assign(existingOrder, order, {
      id: existingOrder.id,
      createdAt: existingOrder.createdAt,
      updatedAt: new Date().toISOString()
    });
  } else {
    db.orders.unshift(order);
  }
  const customer = findCustomerByPlate(order.plate);
  if (customer) {
    customer.km = order.km;
    customer.updatedAt = new Date().toISOString();
  }
  editingOrderId = null;
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

function orderCard(order, index = 0, displayNo = "") {
  const mechanic = order.mechanicName || "未指定師傅";
  const shortNo = displayNo || shortOrderNo(order);
  return `
    <div class="order-card order-card-line" data-order="${esc(order.id)}">
      <div class="order-line-info">
        <b class="order-row-index">${index + 1}</b>
        <button type="button" class="order-no editOrder" data-id="${esc(order.id)}" title="修改工單">✎ ${esc(shortNo)}</button>
        <b>${esc(mechanic)}</b>
        <b>${esc(order.date || "未填日期")}</b>
        <b>${esc(order.plate || "未填車號")}</b>
      </div>
      <div class="order-actions order-line-actions">
        <button type="button" class="printOrder" data-id="${esc(order.id)}">列印工單</button>
        ${order.type === "估價單" ? `<button type="button" class="convertQuote" data-id="${esc(order.id)}">轉工單</button>` : ""}
        <button type="button" class="deleteOrder danger" data-id="${esc(order.id)}">刪除</button>
      </div>
    </div>
  `;
}

function renderOrders() {
  const orderQuery = $("#orderSearch")?.value || "";
  const orderDate = $("#orderDateFilter")?.value || "";
  const quoteQuery = $("#quoteSearch")?.value || "";
  repairOrderNumbers();
  assignDisplayOrderNumbers();
  const plateMatches = (order, query) => {
    const keyword = formatPlate(query);
    if (!keyword) return true;
    return normalizePlate(order.plate).includes(normalizePlate(keyword));
  };
  const dateMatches = (order, date) => !date || dateInputValue(order.date) === date;
  const quoteFields = order => [order.orderNo, shortOrderNo(order), order.plate, order.name, order.phone, order.model, order.year, order.color, order.mechanicName, order.date, order.items];
  const orders = db.orders
    .filter(order => order.type !== "估價單")
    .filter(order => plateMatches(order, orderQuery))
    .filter(order => dateMatches(order, orderDate))
    .sort(compareOrderDesc);
  $("#orderList").innerHTML = orders.map((order, index) => orderCard(order, index)).join("") || `<p class="muted">目前沒有工單</p>`;
  const quotes = db.orders
    .filter(order => order.type === "估價單")
    .filter(order => includesQuery(quoteFields(order), quoteQuery))
    .sort(compareOrderDesc);
  $("#quoteList").innerHTML = quotes.map((order, index) => orderCard(order, index)).join("") || `<p class="muted">目前沒有估價單</p>`;
}

function renderCustomers() {
  const query = $("#customerSearch")?.value || "";
  const customers = db.customers.filter(customer => includesQuery([
    customer.plate,
    customer.name,
    customer.phone,
    customer.model,
    customer.year,
    customer.color
  ], query));
  $("#customerList").innerHTML = customers.map(customer => `
    <div class="customer-card">
      <h3>${esc(customer.plate)}｜${esc(customer.name || "未填姓名")}</h3>
      <p>電話：${esc(customer.phone || "無")}</p>
      <p>車種：${esc(customer.model || "無")}｜年份：${esc(customer.year || "無")}｜顏色：${esc(customer.color || "無")}</p>
      <div class="customer-actions">
        <button type="button" class="editCustomer" data-id="${esc(customer.id)}">修改資料</button>
        <button type="button" class="deleteCustomer danger" data-id="${esc(customer.id)}">刪除</button>
      </div>
    </div>
  `).join("") || `<p class="muted">目前沒有客戶資料</p>`;
}

function appointmentCard(appointment) {
  const statusClass = appointment.status === "已接車" ? "done" : appointment.status === "已取消" ? "cancelled" : "pending";
  return `
    <div class="appointment-card">
      <div class="appointment-main">
        <h3>${esc(appointment.date)} ${esc(appointment.time || "")}｜${esc(appointment.plate || "未填車牌")}</h3>
        <p>${esc(appointment.name || "未填姓名")}｜${esc(appointment.phone || "無電話")}｜${esc(appointment.model || "未填車型")}</p>
        <p>${esc(appointment.note || "無備註")}</p>
        <span class="appointment-status ${statusClass}">${esc(appointment.status)}</span>
      </div>
      <div class="appointment-actions">
        <button type="button" class="receiveAppointment" data-id="${esc(appointment.id)}">接車建單</button>
        <button type="button" class="confirmAppointment secondary" data-id="${esc(appointment.id)}">確認</button>
        <button type="button" class="cancelAppointment secondary" data-id="${esc(appointment.id)}">取消</button>
        <button type="button" class="deleteAppointment danger" data-id="${esc(appointment.id)}">刪除</button>
      </div>
    </div>
  `;
}

function renderAppointments() {
  const panel = $("#appointmentList");
  if (!panel) return;
  const query = $("#appointmentSearch")?.value || "";
  const appointments = db.appointments
    .slice()
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .filter(appointment => includesQuery([
      appointment.plate,
      appointment.name,
      appointment.phone,
      appointment.model,
      appointment.date,
      appointment.time,
      appointment.note,
      appointment.status
    ], query));
  panel.innerHTML = appointments.map(appointmentCard).join("") || `<p class="muted">目前沒有預約</p>`;
  if ($("#appointmentDate") && !$("#appointmentDate").value) $("#appointmentDate").value = todayText();
}

function createCustomerFromAppointment(appointment) {
  const plate = formatPlate(appointment.plate);
  const customer = normalizeCustomer({
    id: uid(),
    plate,
    name: appointment.name,
    phone: appointment.phone,
    model: appointment.model,
    year: "",
    color: ""
  });
  const existing = plate ? findCustomerByPlate(plate) : null;
  if (existing) Object.assign(existing, {
    name: customer.name || existing.name,
    phone: customer.phone || existing.phone,
    model: customer.model || existing.model
  });
  else db.customers.unshift(customer);
  return existing || customer;
}

function receiveAppointment(id) {
  const appointment = db.appointments.find(item => item.id === id);
  if (!appointment) return;
  appointment.status = "已接車";
  const customer = createCustomerFromAppointment(appointment);
  draft = { plate: formatPlate(appointment.plate), km: 0, customer };
  selectedParts = [];
  editingOrderId = null;
  $("#step1").classList.add("hide");
  $("#step2").classList.remove("hide");
  $("#customerInputBox").classList.add("hide");
  $("#workArea").classList.remove("locked");
  $("#showPlate").textContent = draft.plate || "未填車牌";
  $("#editKm").value = 0;
  $("#note").value = appointment.note || "";
  showLockedCustomer(customer);
  updateHistoryCount(draft.plate);
  renderMechanicSelect(currentEmployee()?.name || "");
  if ($("#repairDate")) $("#repairDate").value = todayText();
  renderSelectedParts();
  save();
  openPage("receive");
}

function ensureCustomerEditModal() {
  if ($("#customerEditModal")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div id="customerEditModal" class="customer-edit-modal hide">
      <div class="customer-edit-panel">
        <div class="customer-edit-head">
          <div>
            <h2>修改客戶資料</h2>
            <p id="customerEditPlate" class="muted"></p>
          </div>
          <button type="button" id="closeCustomerEdit" class="customer-edit-close">返回</button>
        </div>
        <div class="customer-edit-form">
          <label for="editCustomerName">姓名</label>
          <input id="editCustomerName" placeholder="姓名">
          <label for="editCustomerPhone">電話</label>
          <input id="editCustomerPhone" placeholder="電話">
          <label for="editCustomerModel">車種</label>
          <input id="editCustomerModel" placeholder="車種">
          <div class="customer-edit-grid">
            <div>
              <label for="editCustomerYear">年份</label>
              <input id="editCustomerYear" placeholder="年份">
            </div>
            <div>
              <label for="editCustomerColor">顏色</label>
              <input id="editCustomerColor" placeholder="顏色">
            </div>
          </div>
          <button type="button" id="saveCustomerEdit" class="customer-edit-save">儲存客戶資料</button>
        </div>
      </div>
    </div>
  `);
}

function editCustomer(id) {
  const customer = db.customers.find(item => item.id === id);
  if (!customer) return;
  ensureCustomerEditModal();
  editingCustomerId = id;
  $("#customerEditPlate").textContent = customer.plate || "";
  $("#editCustomerName").value = customer.name || "";
  $("#editCustomerPhone").value = customer.phone || "";
  $("#editCustomerModel").value = customer.model || "";
  $("#editCustomerYear").value = customer.year || "";
  $("#editCustomerColor").value = customer.color || "";
  $("#customerEditModal").classList.remove("hide");
  $("#editCustomerName").focus();
}

function closeCustomerEdit() {
  editingCustomerId = null;
  $("#customerEditModal")?.classList.add("hide");
}

function saveCustomerEdit() {
  const customer = db.customers.find(item => item.id === editingCustomerId);
  if (!customer) return;
  Object.assign(customer, {
    name: $("#editCustomerName").value.trim(),
    phone: $("#editCustomerPhone").value.trim(),
    model: $("#editCustomerModel").value.trim(),
    year: $("#editCustomerYear").value.trim(),
    color: $("#editCustomerColor").value.trim(),
    updatedAt: new Date().toISOString()
  });
  closeCustomerEdit();
  save();
}

function ensurePrintPreviewModal() {
  if ($("#printPreviewModal")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div id="printPreviewModal" class="print-preview-modal hide">
      <div class="print-toolbar">
        <label>單據類型</label>
        <select id="printDocType">
          <option>維修工單</option>
          <option>估價單</option>
          <option>車禍估價單</option>
          <option>保險估價單</option>
          <option>零件報價單</option>
        </select>
        <button type="button" id="closePrintPreview">返回</button>
        <button type="button" id="copyPrintText" class="green">複製文字</button>
        <button type="button" id="systemPrint">嘗試系統列印</button>
      </div>
      <div id="printPreviewSheet"></div>
    </div>
  `);
}

function orderPrintText(order, docType) {
  return [
    `${systemName()} ${docType}`,
    `單號：${order.orderNo || ""}`,
    `日期：${order.date || ""}`,
    `車牌：${order.plate || ""}`,
    `客戶：${order.name || "未填客戶"}`,
    `電話：${order.phone || ""}`,
    `公里數：${Number(order.km || 0).toLocaleString("zh-TW")} KM`,
    `車種：${order.model || ""}`,
    "",
    "維修 / 估價項目",
    order.items || "無",
    "",
    `總額：${money(order.amount)}`,
    `已付：${money(order.paid)}`,
    `欠款：${money(Math.max(0, Number(order.amount || 0) - Number(order.paid || 0)))}`
  ].join("\n");
}

function renderPrintPreview(order, docType = $("#printDocType")?.value || "維修工單") {
  const remain = Math.max(0, Number(order.amount || 0) - Number(order.paid || 0));
  const lines = String(order.items || "無").split("\n").filter(Boolean);
  $("#printPreviewSheet").innerHTML = `
    <article class="print-sheet" data-order-id="${esc(order.id)}">
      <header class="print-sheet-head">
        <div>
          <small>QI DIAN POWER</small>
          <h1>${esc(systemName())}</h1>
          <p>LINE：zhangfan0421</p>
        </div>
        <div class="print-title">
          <h2>${esc(docType)}</h2>
          <p>單號：${esc(order.orderNo || "")}</p>
          <p>${esc(order.date || "")}</p>
        </div>
      </header>
      <section class="print-info-grid">
        <div><span>車牌</span><b>${esc(order.plate || "")}</b></div>
        <div><span>客戶姓名</span><b>${esc(order.name || "未填客戶")}</b></div>
        <div><span>電話</span><b>${esc(order.phone || "無")}</b></div>
        <div><span>公里數</span><b>${Number(order.km || 0).toLocaleString("zh-TW")} KM</b></div>
        <div><span>車種</span><b>${esc(order.model || "無")}</b></div>
        <div><span>年份 / 顏色</span><b>${esc(order.year || "無")} ${esc(order.color || "")}</b></div>
      </section>
      <h3>維修 / 估價項目</h3>
      <ul class="print-items">
        ${lines.map(line => `<li>${esc(line)}</li>`).join("") || "<li>尚未填寫</li>"}
      </ul>
      <h3>金額</h3>
      <div class="print-money"><span>總額</span><b>${money(order.amount)}</b></div>
      <div class="print-money"><span>已付</span><b>${money(order.paid)}</b></div>
      <div class="print-money total"><span>欠款</span><b>${money(remain)}</b></div>
      <div class="print-note">
        <b>備註</b><br>
        本估價僅供維修 / 保險參考，實際金額依現場拆檢與零件狀況為準。
      </div>
      <div class="print-sign">
        <div><span></span><b>客戶確認 / 簽名</b></div>
        <div><span></span><b>日期</b></div>
      </div>
      <footer>感謝您的支持｜${esc(systemName())}</footer>
    </article>
  `;
}

function deleteCustomer(id) {
  const customer = db.customers.find(item => item.id === id);
  if (!customer) return;
  if (!confirm(`確定刪除 ${customer.plate}｜${customer.name || "未填姓名"}？`)) return;
  db.customers = db.customers.filter(item => item.id !== id);
  save();
}

function printOrder(id) {
  const order = db.orders.find(item => item.id === id);
  if (!order) return;
  ensurePrintPreviewModal();
  $("#printDocType").value = order.type === "估價單" ? "估價單" : "維修工單";
  renderPrintPreview(order);
  $("#printPreviewModal").classList.remove("hide");
}

function renderItemManager() {
  const list = $("#itemManagerList");
  if (!list) return;
  const cats = getPartCats();
  if (!currentPartCat || !cats.includes(currentPartCat)) currentPartCat = cats[0] || "";
  const activeItems = db.catalog.filter(item => item.cat === currentPartCat);
  list.innerHTML = `
    <div class="item-maintenance ymmis-item-maintenance">
      <aside class="major-panel ymmis-category-panel">
        <div class="item-panel-head ymmis-maint-head">
          <h3>維修類別</h3>
        </div>
        <div class="major-add ymmis-cat-add-row">
          <input id="newCatName" placeholder="新增維修類別">
          <button id="addCatBtn" type="button">新增類別</button>
        </div>
        <div class="major-list ymmis-cat-grid">
          ${cats.map(cat => {
            const count = db.catalog.filter(item => item.cat === cat).length;
            return `<button type="button" class="major-btn selectCat ${cat === currentPartCat ? "active" : ""}" data-cat="${esc(cat)}"><b>${esc(cat)}</b><span>${count} 項</span></button>`;
          }).join("") || `<p class="muted">尚無維修類別</p>`}
        </div>
        ${currentPartCat ? `<button type="button" class="major-delete deleteCat" data-cat="${esc(currentPartCat)}">刪除此類別</button>` : ""}
      </aside>
      <section class="minor-panel ymmis-maint-item-panel">
        <div class="item-panel-head ymmis-maint-head">
          <h3>維修項目</h3>
          <span>${activeItems.length} 項</span>
        </div>
        <div class="ymmis-item-tools">
          <b>★新增</b>
          <span class="ymmis-active-cat">${currentPartCat ? esc(currentPartCat) : "維修類別"}</span>
          <span>維修項目</span>
        </div>
        <select id="itemCatSelect" class="hidden-select" aria-label="目前大項目">
          ${cats.map(cat => `<option value="${esc(cat)}" ${cat === currentPartCat ? "selected" : ""}>${esc(cat)}</option>`).join("")}
        </select>
        <div class="minor-add ymmis-item-add-row">
          <input id="newItemName" placeholder="新增維修項目">
          <input id="newItemPrice" type="number" min="0" placeholder="售價">
          <button id="addItemBtn" type="button">新增項目</button>
        </div>
        <div class="minor-list ymmis-item-grid">
          ${activeItems.map(item => {
            const index = db.catalog.indexOf(item);
            return `<div class="minor-item compact" data-index="${index}">
              <div class="minor-display">
                <b>${esc(item.name)} ${money(Number(item.price || 0))} - [0]</b>
              </div>
              <div class="minor-edit-fields">
                <input class="catalog-name" data-index="${index}" value="${esc(item.name)}">
                <input class="catalog-price" data-index="${index}" type="number" min="0" value="${Number(item.price || 0)}">
              </div>
              <div class="minor-actions">
                <button type="button" class="secondary toggleMinorEdit" data-index="${index}">修改</button>
                <button type="button" class="catalog-del deleteItem" data-index="${index}">刪除</button>
              </div>
            </div>`;
          }).join("") || `<div class="minor-empty">這個類別還沒有維修項目</div>`}
        </div>
      </section>
    </div>
  `;
}

function renderMoney() {
  const orders = db.orders.filter(order => order.type !== "估價單");
  const amount = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const paid = orders.reduce((sum, order) => sum + Number(order.paid || 0), 0);
  const cost = orders.reduce((sum, order) => sum + Number(order.internalCost || 0), 0);
  const todayKey = new Date().toISOString().slice(0, 10);
  const monthKey = todayKey.slice(0, 7);
  const todayOrders = orders.filter(order => order.date === todayKey);
  const monthOrders = orders.filter(order => String(order.date || "").startsWith(monthKey));
  const todayAmount = todayOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const todayPaid = todayOrders.reduce((sum, order) => sum + Number(order.paid || 0), 0);
  const monthAmount = monthOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const monthPaid = monthOrders.reduce((sum, order) => sum + Number(order.paid || 0), 0);
  const monthCost = monthOrders.reduce((sum, order) => sum + Number(order.internalCost || 0), 0);
  const dayPanel = $("#dayRevenueDashboard");
  const monthPanel = $("#monthRevenueDashboard");
  if (dayPanel) {
    dayPanel.innerHTML = `
      <div class="single-revenue-panel">
        <section class="revenue-card daily">
          <div class="ymmis-money-title"><span>單日維修金額</span><b>${esc(todayKey)}</b></div>
          <div class="ymmis-money-big">${money(todayAmount)}</div>
          <div class="ymmis-money-grid">
            <div><span>已收</span><b>${money(todayPaid)}</b></div>
            <div><span>未收</span><b>${money(todayAmount - todayPaid)}</b></div>
            <div><span>工單</span><b>${todayOrders.length} 筆</b></div>
          </div>
        </section>
        <div class="ymmis-money-detail">
          <h3>單日工單明細 <span>${esc(todayKey)}</span></h3>
          ${todayOrders.length ? todayOrders.map(order => `<p>${esc(order.plate)}｜${esc(order.name || "未填客戶")}｜${money(order.amount)}</p>`).join("") : `<p class="muted">這一天沒有正式工單</p>`}
        </div>
      </div>
    `;
  }
  if (monthPanel) {
    monthPanel.innerHTML = `
      <div class="single-revenue-panel">
        <section class="revenue-card monthly">
          <div class="ymmis-money-title"><span>單月維修金額</span><b>${esc(monthKey)}</b></div>
          <div class="ymmis-money-big">${money(monthAmount)}</div>
          <div class="ymmis-money-grid">
            <div><span>已收</span><b>${money(monthPaid)}</b></div>
            <div><span>未收</span><b>${money(monthAmount - monthPaid)}</b></div>
            <div><span>工單</span><b>${monthOrders.length} 筆</b></div>
          </div>
          <div class="ymmis-money-profit">本月成本 ${money(monthCost)}｜本月毛利 ${money(monthAmount - monthCost)}</div>
        </section>
        <div class="ymmis-money-cards">
          <div><span>全部維修金額</span><b>${money(amount)}</b><p>已收 ${money(paid)}｜未收 ${money(amount - paid)}｜${orders.length} 筆</p></div>
          <div><span>本月平均單價</span><b>${money(monthOrders.length ? Math.round(monthAmount / monthOrders.length) : 0)}</b><p>依本月正式工單自動計算</p></div>
        </div>
        <div class="ymmis-money-detail">
          <h3>單月工單明細 <span>${esc(monthKey)}</span></h3>
          ${monthOrders.length ? monthOrders.map(order => `<p>${esc(order.date)}｜${esc(order.plate)}｜${esc(order.name || "未填客戶")}｜${money(order.amount)}</p>`).join("") : `<p class="muted">這個月份沒有正式工單</p>`}
        </div>
      </div>
    `;
  }
  if ($("#revenue")) $("#revenue").textContent = money(amount);
  if ($("#stats")) $("#stats").textContent = `工單 ${orders.length} 筆 / 已收 ${money(paid)} / 未收 ${money(amount - paid)} / 成本 ${money(cost)} / 毛利 ${money(amount - cost)}`;
}

function renderSettings() {
  const panel = $("#settingsPanel");
  if (!panel) return;
  const activeUser = currentEmployee();
  panel.innerHTML = `
    <div class="settings-grid">
      <section class="settings-box">
        <h3>系統名稱</h3>
        <div class="settings-name-row">
          <input id="systemNameInput" value="${esc(systemName())}" placeholder="例如 奇典動能">
          <button type="button" id="saveSystemNameBtn">儲存名稱</button>
        </div>
        <p class="muted">會同步更新登入頁、側邊欄名稱與瀏覽器標題。</p>
      </section>
      <section class="settings-box">
        <h3>多機連線</h3>
        <p class="muted">輸入 Google Apps Script API URL 後，可讓多台電腦或手機共用同一份維修資料。</p>
        <label for="cloudApiUrlV108">雲端同步 API URL</label>
        <input id="cloudApiUrlV108" placeholder="貼上 Google Apps Script Web App URL">
        <label class="settings-check">
          <input id="cloudAutoSync" type="checkbox">
          開啟自動上傳與自動下載
        </label>
        <div class="actions">
          <button id="cloudPingNow" type="button">測試連線</button>
          <button id="cloudUploadNow" type="button">上傳到雲端</button>
          <button id="cloudDownloadNow" type="button" class="secondary">從雲端下載</button>
        </div>
        <div id="cloudStatusV108" class="notice"></div>
        <p id="cloudLastSync" class="muted"></p>
      </section>
      <section class="settings-box ymmis-backup-box">
        <h3>資料備份 / 匯入</h3>
        <p class="muted">匯出目前所有資料，或貼上備份 JSON 匯入。</p>
        <button id="export" type="button">匯出資料</button>
        <textarea id="importBox" placeholder="貼上備份 JSON"></textarea>
        <button id="import" type="button" class="secondary">匯入資料</button>
      </section>
      <section class="settings-box employee-account-box">
        <h3>新增員工帳號</h3>
        <div class="employee-form">
          <label>
            <span>員工姓名</span>
            <input id="newEmployeeName" placeholder="例如 王小明">
          </label>
          <label>
            <span>登入帳號</span>
            <input id="newEmployeeUser" placeholder="例如 staff01" autocomplete="off">
          </label>
          <label>
            <span>登入密碼</span>
            <input id="newEmployeePass" type="password" placeholder="輸入密碼" autocomplete="new-password">
          </label>
          <label>
            <span>角色權限</span>
            <select id="newEmployeeRole">
              ${db.roles.map(role => `<option value="${esc(role.id)}">${esc(role.name)}</option>`).join("")}
            </select>
          </label>
          <button type="button" id="addEmployeeBtn">新增員工</button>
        </div>
      </section>
      <section class="settings-box">
        <h3>目前登入</h3>
        <p class="muted">${esc(activeUser?.name || "未知")}｜${esc(roleFor(activeUser).name)}</p>
        <p class="settings-warning">提醒：這是前端帳號管理，適合店內控管操作入口；若要真正防止外部竄改，需要後端資料庫與伺服器驗證。</p>
      </section>
    </div>
      <section class="settings-box">
        <h3>員工管理</h3>
        <div class="employee-list">
          ${db.employees.map(employee => `
          <div class="employee-row ${editingEmployeeId === employee.id ? "editing" : ""}">
            ${editingEmployeeId === employee.id ? `
              <div class="employee-edit-form">
                <label><span>員工姓名</span><input class="editEmployeeName" data-id="${esc(employee.id)}" value="${esc(employee.name)}"></label>
                <label><span>登入帳號</span><input class="editEmployeeUser" data-id="${esc(employee.id)}" value="${esc(employee.username)}" autocomplete="off"></label>
                <label><span>登入密碼</span><input class="editEmployeePass" data-id="${esc(employee.id)}" type="password" value="${esc(employee.password)}" autocomplete="new-password"></label>
                <label><span>角色權限</span><select class="editEmployeeRole" data-id="${esc(employee.id)}">${db.roles.map(role => `<option value="${esc(role.id)}" ${role.id === employee.roleId ? "selected" : ""}>${esc(role.name)}</option>`).join("")}</select></label>
                <label><span>狀態</span><select class="editEmployeeActive" data-id="${esc(employee.id)}"><option value="1" ${employee.active ? "selected" : ""}>啟用</option><option value="0" ${!employee.active ? "selected" : ""}>停用</option></select></label>
              </div>
              <div class="employee-actions">
                <button type="button" class="saveEmployeeEdit" data-id="${esc(employee.id)}">儲存</button>
                <button type="button" class="cancelEmployeeEdit secondary" data-id="${esc(employee.id)}">取消</button>
              </div>
            ` : `
              <div>
                <b>${esc(employee.name)}</b>
                <span>${esc(employee.username)}｜${esc(roleFor(employee).name)}｜${employee.active ? "啟用" : "停用"}</span>
              </div>
              <div class="employee-actions">
                <button type="button" class="editEmployee" data-id="${esc(employee.id)}">修改</button>
                <button type="button" class="toggleEmployee" data-id="${esc(employee.id)}">${employee.active ? "停用" : "啟用"}</button>
                <button type="button" class="deleteEmployee danger" data-id="${esc(employee.id)}" ${employee.username === USER ? "disabled" : ""}>刪除</button>
              </div>
            `}
          </div>
        `).join("")}
        </div>
      </section>
    <section class="settings-box">
      <h3>角色權限</h3>
      <div class="role-list">
        ${db.roles.map(role => `
          <div class="role-card">
            <div class="role-head"><b>${esc(role.name)}</b><span>${role.pages.length} 項權限</span></div>
            <div class="permission-grid">
              ${PERMISSIONS.map(([page, label]) => `
                <label>
                  <input class="rolePermission" type="checkbox" data-role="${esc(role.id)}" data-page="${esc(page)}" ${role.pages.includes(page) ? "checked" : ""} ${role.id === "admin" && page === "settings" ? "disabled" : ""}>
                  ${esc(label)}
                </label>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
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
  if (!$("#searchList")) return;
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

function historyRowsForPlate(plate) {
  const key = normalizePlate(plate);
  return db.orders.filter(order => normalizePlate(order.plate) === key);
}

function updateHistoryCount(plate = draft.plate) {
  const countText = $("#historyCountText");
  if (countText) countText.textContent = "歷史 " + historyRowsForPlate(plate).length + " 筆";
}

function renderHistory(plate = draft.plate) {
  const rows = historyRowsForPlate(plate);
  const html = rows.length ? `
    <div class="ymmis-history-table-wrap">
      <table class="ymmis-history-table">
        <thead>
          <tr>
            <th>日期</th><th>車牌</th><th>客戶</th><th>里程</th><th>維修內容</th><th>總金額</th><th>已收</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(order => `
            <tr>
              <td>${esc(order.date || "")}</td>
              <td>${esc(order.plate || "")}</td>
              <td>${esc(order.name || "未填客戶")}</td>
              <td>${Number(order.km || 0).toLocaleString("zh-TW")}</td>
              <td>${esc(order.items || "無").replace(/\n/g, "<br>")}</td>
              <td>${money(order.amount)}</td>
              <td>${money(order.paid)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : `<p class="muted">????????</p>`;
  if ($("#plateHistoryList")) $("#plateHistoryList").innerHTML = html;
}

function render() {
  applySystemSettings();
  renderMechanicSelect();
  renderPartsPicker();
  renderSelectedParts();
  renderOrders();
  renderAppointments();
  renderCustomers();
  renderItemManager();
  renderMoney();
  renderSettings();
  renderSearch();
  renderCloudSettings();
  applyPermissionNav();
}

function openPage(page) {
  if (!canAccess(page)) {
    alert("此帳號沒有權限使用這個功能");
    return;
  }
  $$(".page").forEach(panel => panel.classList.toggle("active", panel.id === page));
  $$(".side button[data-page]").forEach(button => button.classList.toggle("active", button.dataset.page === page));
  $("#title").textContent = pageTitles[page] || "奇典動能";
  $("#side").classList.remove("open");
  $("#overlay").classList.remove("show");
  if (page === "moneyDay" || page === "moneyMonth") renderMoney();
  if (page === "settings") renderSettings();
}

function openEditOrder(id) {
  const order = db.orders.find(item => item.id === id);
  if (!order) return;
  loadOrderToReceive(order);
}

function saveEditOrder() {
  const order = db.orders.find(item => item.id === editingOrderId);
  if (!order) return;
  order.items = $("#editNote").value.trim();
  order.amount = Number($("#editLaborCost").value || 0);
  order.paid = Number($("#editPaidAmount").value || 0);
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
      appointments: Array.isArray(incoming.appointments) ? incoming.appointments.map(normalizeAppointment) : [],
      catalog: Array.isArray(incoming.catalog) ? incoming.catalog : defaultCatalog.slice(),
      categories: Array.isArray(incoming.categories) ? incoming.categories : [],
      employees: Array.isArray(incoming.employees) ? incoming.employees : [],
      roles: Array.isArray(incoming.roles) ? incoming.roles : [],
      settings: incoming.settings && typeof incoming.settings === "object" ? incoming.settings : {}
    };
    db.categories = [...new Set([...db.categories, ...db.catalog.map(item => item.cat)].filter(Boolean))];
    ensureAccessData();
    repairOrderNumbers();
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
  const normalized = {
    orders: Array.isArray(source?.orders) ? source.orders.map(normalizeOrder) : [],
    customers: Array.isArray(source?.customers) ? source.customers.map(normalizeCustomer) : [],
    appointments: Array.isArray(source?.appointments) ? source.appointments.map(normalizeAppointment) : [],
    catalog: Array.isArray(source?.catalog) ? source.catalog : defaultCatalog.slice(),
    categories: [...new Set([...(Array.isArray(source?.categories) ? source.categories : []), ...(Array.isArray(source?.catalog) ? source.catalog.map(item => item.cat) : [])].filter(Boolean))],
    employees: Array.isArray(source?.employees) ? source.employees : [],
    roles: Array.isArray(source?.roles) ? source.roles : [],
    settings: source?.settings && typeof source.settings === "object" ? source.settings : {}
  };
  const previous = db;
  db = normalized;
  ensureAccessData();
  repairOrderNumbers();
  const ready = db;
  db = previous;
  return ready;
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

function formatSearchPlateField(input) {
  const value = String(input.value || "").trim();
  const raw = normalizePlate(value);
  if (/^[A-Z]{1,3}\d/.test(raw) || /^[A-Z]{3}-?\d{1,4}$/i.test(value)) input.value = formatPlate(value);
}

document.addEventListener("submit", event => {
  if (event.target.id === "loginForm") {
    event.preventDefault();
    const employee = loginEmployee($("#user").value.trim(), $("#pass").value);
    if (employee) {
      localStorage.setItem(LOGIN, "1");
      localStorage.setItem(LOGIN_USER, employee.username);
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
    if ($("#repairDate")) $("#repairDate").value = todayText();
    renderMechanicSelect(currentEmployee()?.name || "");
    updateHistoryCount(draft.plate);
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
      $("#customerInputBox").classList.add("hide");
      showLockedCustomer(draft.customer);
      $("#workArea").classList.remove("locked");
    } else {
      $("#foundMsg").textContent = "";
      $("#customerInputBox").classList.remove("hide");
      $("#lockedCustomerBox").classList.add("hide");
      $("#workArea").classList.add("locked");
      $("#oldCustomerBox").classList.add("hide");
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
    localStorage.removeItem(LOGIN_USER);
    location.reload();
  }
  if (event.target.closest("#plateHistoryBtn")) {
    const plate = draft.plate || $("#showPlate")?.textContent || "";
    if ($("#plateHistoryTitle")) $("#plateHistoryTitle").textContent = (plate || "車牌") + " 歷史維修紀錄";
    renderHistory(plate);
    $("#plateHistoryModal")?.classList.remove("hide");
  }
  if (event.target.closest("#closePlateHistory") || event.target.id === "plateHistoryModal") {
    $("#plateHistoryModal")?.classList.add("hide");
  }
  if (event.target.closest("#back")) resetReceive();
  if (event.target.closest("#confirmCustomerBtn")) confirmCustomer();
  if (event.target.closest("#createOrderBtn")) createOrder("工單");
  if (event.target.closest("#createQuoteBtn")) createOrder("估價單");
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
  if (event.target.closest("#closeCustomerEdit")) closeCustomerEdit();
  if (event.target.closest("#saveCustomerEdit")) saveCustomerEdit();
  if (event.target.id === "customerEditModal") closeCustomerEdit();
  if (event.target.closest("#closePrintPreview")) $("#printPreviewModal")?.classList.add("hide");
  if (event.target.closest("#systemPrint")) window.print();
  if (event.target.closest("#clearOrderDate")) {
    const dateFilter = $("#orderDateFilter");
    if (dateFilter) dateFilter.value = "";
    renderOrders();
  }
  if (event.target.closest("#copyPrintText")) {
    const sheet = $(".print-sheet");
    const order = db.orders.find(item => item.id === sheet?.dataset.orderId);
    if (order) navigator.clipboard?.writeText(orderPrintText(order, $("#printDocType").value));
  }
  const convert = event.target.closest(".convertQuote");
  if (convert) {
    const order = db.orders.find(item => item.id === convert.dataset.id);
    if (order) {
      order.type = "工單";
      order.orderNo = nextOrderNo("工單", order.date, order.id);
      order.workStatus = "待檢查";
      save();
      openPage("orders");
    }
  }
  const printButton = event.target.closest(".printOrder");
  if (printButton) printOrder(printButton.dataset.id);
  const addAppointment = event.target.closest("#addAppointmentBtn");
  if (addAppointment) {
    const appointment = normalizeAppointment({
      id: uid(),
      plate: $("#appointmentPlate").value,
      name: $("#appointmentName").value.trim(),
      phone: $("#appointmentPhone").value.trim(),
      model: $("#appointmentModel").value.trim(),
      date: $("#appointmentDate").value || todayText(),
      time: $("#appointmentTime").value,
      note: $("#appointmentNote").value.trim(),
      source: "店內建立",
      status: "待確認",
      createdAt: new Date().toISOString()
    });
    if (!appointment.plate && !appointment.name && !appointment.phone) return alert("請至少填車牌、姓名或電話其中一項");
    db.appointments.unshift(appointment);
    ["#appointmentPlate", "#appointmentName", "#appointmentPhone", "#appointmentModel", "#appointmentTime", "#appointmentNote"].forEach(selector => {
      const field = $(selector);
      if (field) field.value = "";
    });
    if ($("#appointmentDate")) $("#appointmentDate").value = todayText();
    save();
  }
  const receiveAppointmentButton = event.target.closest(".receiveAppointment");
  if (receiveAppointmentButton) receiveAppointment(receiveAppointmentButton.dataset.id);
  const confirmAppointment = event.target.closest(".confirmAppointment");
  if (confirmAppointment) {
    const appointment = db.appointments.find(item => item.id === confirmAppointment.dataset.id);
    if (appointment) {
      appointment.status = "已確認";
      save();
    }
  }
  const cancelAppointment = event.target.closest(".cancelAppointment");
  if (cancelAppointment) {
    const appointment = db.appointments.find(item => item.id === cancelAppointment.dataset.id);
    if (appointment) {
      appointment.status = "已取消";
      save();
    }
  }
  const deleteAppointment = event.target.closest(".deleteAppointment");
  if (deleteAppointment && confirm("確定刪除這筆預約？")) {
    db.appointments = db.appointments.filter(item => item.id !== deleteAppointment.dataset.id);
    save();
  }
  const editCustomerButton = event.target.closest(".editCustomer");
  if (editCustomerButton) editCustomer(editCustomerButton.dataset.id);
  const deleteCustomerButton = event.target.closest(".deleteCustomer");
  if (deleteCustomerButton) deleteCustomer(deleteCustomerButton.dataset.id);
  const del = event.target.closest(".deleteOrder");
  if (del && confirm("確定刪除這筆單據？")) {
    db.orders = db.orders.filter(item => item.id !== del.dataset.id);
    save();
  }
  if (event.target.closest("#addCatBtn")) {
    const name = $("#newCatName").value.trim();
    if (!name) return alert("請輸入大項目名稱");
    if (!db.categories) db.categories = [];
    if (!getPartCats().includes(name)) db.categories.push(name);
    currentPartCat = name;
    $("#newCatName").value = "";
    save();
  }
  if (event.target.closest("#addItemBtn")) {
    const name = $("#newItemName").value.trim();
    const cat = currentPartCat || $("#itemCatSelect")?.value || "";
    if (!cat) return alert("請先新增大項目");
    if (!name) return alert("請輸入小項目名稱");
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
  const deleteCat = event.target.closest(".deleteCat");
  if (deleteCat) {
    const cat = deleteCat.dataset.cat;
    const count = db.catalog.filter(item => item.cat === cat).length;
    if (!confirm(`確定刪除「${cat}」大項目？底下 ${count} 個小項目也會一起刪除。`)) return;
    db.catalog = db.catalog.filter(item => item.cat !== cat);
    db.categories = (db.categories || []).filter(item => item !== cat);
    currentPartCat = getPartCats()[0] || "";
    save();
  }
  const toggleMinorEdit = event.target.closest(".toggleMinorEdit");
  if (toggleMinorEdit) {
    const row = toggleMinorEdit.closest(".minor-item");
    const editing = row.classList.toggle("editing");
    row.classList.add("selected");
    toggleMinorEdit.textContent = editing ? "完成" : "修改";
  }
  const minorItem = event.target.closest(".minor-item");
  if (minorItem && !event.target.closest("button,input")) {
    const wasSelected = minorItem.classList.contains("selected");
    $$(".minor-item.selected").forEach(row => {
      if (row !== minorItem && !row.classList.contains("editing")) row.classList.remove("selected");
    });
    minorItem.classList.toggle("selected", !wasSelected);
  }
  const selectCat = event.target.closest(".selectCat");
  if (selectCat) {
    currentPartCat = selectCat.dataset.cat;
    renderPartsPicker();
    renderItemManager();
  }
  if (event.target.closest("#export")) exportData();
  if (event.target.closest("#import")) importData();
  if (event.target.closest("#cloudPingNow")) cloudPing();
  if (event.target.closest("#cloudUploadNow")) cloudUpload();
  if (event.target.closest("#cloudDownloadNow")) cloudDownload();
  if (event.target.closest("#saveSystemNameBtn")) {
    const name = $("#systemNameInput").value.trim();
    if (!name) return alert("請輸入系統名稱");
    if (!db.settings || typeof db.settings !== "object") db.settings = {};
    db.settings.systemName = name;
    save();
  }
  if (event.target.closest("#addEmployeeBtn")) {
    const name = $("#newEmployeeName").value.trim();
    const username = $("#newEmployeeUser").value.trim();
    const password = $("#newEmployeePass").value;
    const roleId = $("#newEmployeeRole").value;
    if (!name || !username || !password) return alert("請填寫員工姓名、帳號與密碼");
    if (db.employees.some(employee => employee.username === username)) return alert("此登入帳號已存在");
    db.employees.push({ id: uid(), name, username, password, roleId, active: true });
    save();
  }
  const editEmployee = event.target.closest(".editEmployee");
  if (editEmployee) {
    editingEmployeeId = editEmployee.dataset.id;
    renderSettings();
  }
  const cancelEmployeeEdit = event.target.closest(".cancelEmployeeEdit");
  if (cancelEmployeeEdit) {
    editingEmployeeId = null;
    renderSettings();
  }
  const saveEmployeeEdit = event.target.closest(".saveEmployeeEdit");
  if (saveEmployeeEdit) {
    const id = saveEmployeeEdit.dataset.id;
    const employee = db.employees.find(item => item.id === id);
    if (!employee) return;
    const name = document.querySelector(`.editEmployeeName[data-id="${CSS.escape(id)}"]`)?.value.trim() || "";
    const username = document.querySelector(`.editEmployeeUser[data-id="${CSS.escape(id)}"]`)?.value.trim() || "";
    const password = document.querySelector(`.editEmployeePass[data-id="${CSS.escape(id)}"]`)?.value || "";
    const roleId = document.querySelector(`.editEmployeeRole[data-id="${CSS.escape(id)}"]`)?.value || "technician";
    const active = document.querySelector(`.editEmployeeActive[data-id="${CSS.escape(id)}"]`)?.value === "1";
    if (!name || !username || !password) return alert("請填寫員工姓名、帳號與密碼");
    if (db.employees.some(item => item.id !== id && item.username === username)) return alert("此登入帳號已存在");
    if (employee.username === localStorage.getItem(LOGIN_USER) && !active) return alert("不能停用目前登入中的帳號");
    const isCurrentLogin = employee.username === localStorage.getItem(LOGIN_USER);
    employee.name = name;
    employee.username = username;
    employee.password = password;
    employee.roleId = roleId;
    employee.active = active;
    if (isCurrentLogin) localStorage.setItem(LOGIN_USER, username);
    editingEmployeeId = null;
    save();
  }
  const toggleEmployee = event.target.closest(".toggleEmployee");
  if (toggleEmployee) {
    const employee = db.employees.find(item => item.id === toggleEmployee.dataset.id);
    if (employee) {
      if (employee.username === localStorage.getItem(LOGIN_USER) && employee.active) return alert("不能停用目前登入中的帳號");
      employee.active = !employee.active;
      save();
    }
  }
  const deleteEmployee = event.target.closest(".deleteEmployee");
  if (deleteEmployee) {
    const employee = db.employees.find(item => item.id === deleteEmployee.dataset.id);
    if (!employee) return;
    if (employee.username === localStorage.getItem(LOGIN_USER)) return alert("不能刪除目前登入中的帳號");
    if (!confirm(`確定刪除員工「${employee.name}」？`)) return;
    db.employees = db.employees.filter(item => item.id !== employee.id);
    save();
  }
});

document.addEventListener("input", event => {
  if (event.target.id === "plate") {
    formatPlateField(event.target);
    return;
  }
  if (event.target.matches("#orderSearch,#quoteSearch,#customerSearch,#appointmentSearch,#appointmentPlate")) formatSearchPlateField(event.target);
  const index = Number(event.target.dataset.index);
  if (event.target.matches(".part-name") && selectedParts[index]) selectedParts[index].name = event.target.value;
  if (event.target.matches(".part-price") && selectedParts[index]) selectedParts[index].price = Number(event.target.value || 0);
  if (event.target.matches(".part-qty") && selectedParts[index]) selectedParts[index].qty = Math.max(1, Number(event.target.value || 1));
  if (event.target.matches(".part-name,.part-price,.part-qty")) renderSelectedParts();
  if (event.target.matches("#laborCost,#paidAmount")) updateTotals();
  if (event.target.matches("#search")) renderSearch();
  if (event.target.matches("#orderSearch,#quoteSearch")) renderOrders();
  if (event.target.matches("#appointmentSearch")) renderAppointments();
  if (event.target.matches("#customerSearch")) renderCustomers();
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
  if (event.target.id === "orderDateFilter") renderOrders();
  if (event.target.id === "itemCatSelect") currentPartCat = event.target.value;
  if (event.target.id === "printDocType") {
    const sheet = $(".print-sheet");
    const order = db.orders.find(item => item.id === sheet?.dataset.orderId);
    if (order) renderPrintPreview(order, event.target.value);
  }
  if (event.target.id === "cloudAutoSync") {
    localStorage.setItem(SYNC_AUTO, event.target.checked ? "1" : "0");
    renderCloudSettings();
    if (event.target.checked) cloudDownload({ silent: false });
  }
  if (event.target.matches(".rolePermission")) {
    const role = db.roles.find(item => item.id === event.target.dataset.role);
    if (!role) return;
    const page = event.target.dataset.page;
    role.pages = event.target.checked
      ? [...new Set([...role.pages, page])]
      : role.pages.filter(item => item !== page);
    if (role.id === "admin" && !role.pages.includes("settings")) role.pages.push("settings");
    save();
  }
});

load();
if (localStorage.getItem(LOGIN) === "1") {
  $("#login").classList.add("hide");
  $("#app").classList.remove("hide");
}
render();
if (isAutoSyncOn() && getCloudUrl()) cloudDownload({ silent: true });
