const USER = "Zhangfan";
const PASS = "zhangfan0421";
const KEY = "shaochi_v14_data";
const LOGIN = "shaochi_v14_login";
const DEFAULT_SYNC_URL = "https://script.google.com/macros/s/AKfycbw5xe6EfThaRG5R1WuM9tJN1wt3rnWczF0MOerC3RqmPtSdpg2BqsxAFU8MHZMG3-xw/exec";
const SYNC_URL = "shaochi_cloud_api_url";
const SYNC_AUTO = "shaochi_cloud_auto_sync";
const SYNC_LAST = "shaochi_cloud_last_sync";
const STATUSES = ["待檢查", "等待料件", "維修中", "待取車", "已完成", "已交車"];

let db = { orders: [], customers: [], catalog: [] };
let draft = { plate: "", km: 0, customer: null };
let selectedParts = [];
let currentPartCat = "";
let editingOrderId = null;
let editingCustomerId = null;
let orderStatusFilter = "全部";
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
  items: "項目維護",
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
        <input class="part-name" data-index="${index}" value="${esc(item.name)}" placeholder="小項目名稱">
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
  const remainAmount = Math.max(0, Number(order.amount || 0) - Number(order.paid || 0));
  const itemText = esc(order.items || "尚未填寫維修內容").replace(/\n/g, "<br>");
  return `
    <div class="order-card" data-order="${esc(order.id)}">
      <h3>${esc(order.plate)}｜${esc(order.name || "未填客戶")}</h3>
      <span class="order-status-badge">狀態：${esc(order.workStatus)}</span>
      <p>${esc(order.date)}｜${Number(order.km || 0).toLocaleString("zh-TW")} km｜${esc(order.model || "未填車種")}</p>
      <div class="order-items">${itemText}</div>
      <div class="order-money">總額 ${money(order.amount)}｜已付 ${money(order.paid)}｜欠 ${money(remainAmount)} <span class="paid-chip ${remainAmount ? "unpaid" : ""}">${remainAmount ? "未結清" : "已付款"}</span></div>
      <div class="order-status-box">
        <label>工單狀態</label>
        <select class="orderStatusSelect" data-id="${esc(order.id)}">
          ${STATUSES.map(status => `<option value="${esc(status)}" ${status === order.workStatus ? "selected" : ""}>${esc(status)}</option>`).join("")}
        </select>
      </div>
      <div class="order-actions">
        <button type="button" class="markPaid green" data-id="${esc(order.id)}">一鍵已付款</button>
        <button type="button" class="editOrder" data-id="${esc(order.id)}">修改工單</button>
        <button type="button" class="printOrder" data-id="${esc(order.id)}">列印預覽</button>
        <button type="button" class="orderHistory" data-plate="${esc(order.plate)}">歷史維修</button>
        ${order.type === "估價單" ? `<button type="button" class="convertQuote" data-id="${esc(order.id)}">轉工單</button>` : ""}
        <button type="button" class="deleteOrder danger" data-id="${esc(order.id)}">刪除</button>
      </div>
    </div>
  `;
}

function renderOrders() {
  const orders = db.orders.filter(order => order.type !== "估價單");
  const filteredOrders = orderStatusFilter === "全部" ? orders : orders.filter(order => order.workStatus === orderStatusFilter);
  $("#orderList").innerHTML = `
    <div class="order-filter">
      <label>工單狀態篩選</label>
      <select id="orderStatusFilter">
        <option ${orderStatusFilter === "全部" ? "selected" : ""}>全部</option>
        ${STATUSES.map(status => `<option value="${esc(status)}" ${status === orderStatusFilter ? "selected" : ""}>${esc(status)}</option>`).join("")}
      </select>
    </div>
    ${filteredOrders.map(orderCard).join("") || `<p class="muted">目前沒有工單</p>`}
  `;
  const quotes = db.orders.filter(order => order.type === "估價單");
  $("#quoteList").innerHTML = quotes.map(orderCard).join("") || `<p class="muted">目前沒有估價單</p>`;
}

function renderCustomers() {
  $("#customerList").innerHTML = db.customers.map(customer => `
    <div class="customer-card">
      <h3>${esc(customer.plate)}｜${esc(customer.name || "未填姓名")}</h3>
      <p>電話：${esc(customer.phone || "無")}</p>
      <p>車種：${esc(customer.model || "無")}｜年份：${esc(customer.year || "無")}｜顏色：${esc(customer.color || "無")}</p>
      <div class="customer-actions">
        <button type="button" class="editCustomer" data-id="${esc(customer.id)}">修改資料</button>
        <button type="button" class="customerHistory" data-plate="${esc(customer.plate)}">歷史維修</button>
        <button type="button" class="deleteCustomer danger" data-id="${esc(customer.id)}">刪除</button>
      </div>
    </div>
  `).join("") || `<p class="muted">目前沒有客戶資料</p>`;
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
    `紹馳技研 ${docType}`,
    `日期：${order.date || ""}`,
    `車牌：${order.plate || ""}`,
    `客戶：${order.name || ""}`,
    `電話：${order.phone || ""}`,
    `公里數：${Number(order.km || 0).toLocaleString("zh-TW")} KM`,
    `車種：${order.model || ""}`,
    "",
    "維修 / 估價項目",
    order.items || "",
    "",
    `總額：${money(order.amount)}`,
    `已付：${money(order.paid)}`,
    `欠款：${money(Math.max(0, Number(order.amount || 0) - Number(order.paid || 0)))}`
  ].join("\n");
}

function renderPrintPreview(order, docType = $("#printDocType")?.value || "維修工單") {
  const remain = Math.max(0, Number(order.amount || 0) - Number(order.paid || 0));
  const lines = String(order.items || "").split("\n").filter(Boolean);
  $("#printPreviewSheet").innerHTML = `
    <article class="print-sheet" data-order-id="${esc(order.id)}">
      <header class="print-sheet-head">
        <div>
          <small>SHAO CHI TECH</small>
          <h1>紹馳技研</h1>
          <p>LINE：zhangfan0421</p>
        </div>
        <div class="print-title">
          <h2>${esc(docType)}</h2>
          <p>${esc(order.date || "")}</p>
          <p>${esc(docType)}</p>
        </div>
      </header>
      <section class="print-info-grid">
        <div><span>車牌</span><b>${esc(order.plate || "")}</b></div>
        <div><span>客戶姓名</span><b>${esc(order.name || "")}</b></div>
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
      <footer>感謝您的支持｜紹馳技研｜LINE：zhangfan0421</footer>
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
    <div class="item-maintenance">
      <aside class="major-panel">
        <div class="item-panel-head">
          <h3>大項目</h3>
          <span>${cats.length} 類</span>
        </div>
        <div class="major-list">
          ${cats.map(cat => {
            const count = db.catalog.filter(item => item.cat === cat).length;
            return `<button type="button" class="major-btn selectCat ${cat === currentPartCat ? "active" : ""}" data-cat="${esc(cat)}"><b>${esc(cat)}</b><span>${count} 項</span></button>`;
          }).join("") || `<p class="muted">尚無大項目</p>`}
        </div>
        <div class="major-add">
          <input id="newCatName" placeholder="新增大項目，例如 油品 / 傳動 / 煞車">
          <button id="addCatBtn" type="button">新增大項目</button>
        </div>
      </aside>
      <section class="minor-panel">
        <div class="item-panel-head">
          <h3>${currentPartCat ? esc(currentPartCat) : "小項目"}</h3>
          <span>${activeItems.length} 項</span>
        </div>
        <select id="itemCatSelect" class="hidden-select" aria-label="目前大項目">
          ${cats.map(cat => `<option value="${esc(cat)}" ${cat === currentPartCat ? "selected" : ""}>${esc(cat)}</option>`).join("")}
        </select>
        <div class="minor-add">
          <input id="newItemName" placeholder="新增小項目，例如 機油 / 煞車皮">
          <input id="newItemPrice" type="number" min="0" placeholder="售價">
          <button id="addItemBtn" type="button">新增小項目</button>
        </div>
        <div class="minor-list">
          ${activeItems.map(item => {
            const index = db.catalog.indexOf(item);
            return `<div class="minor-item compact" data-index="${index}">
              <div class="minor-display">
                <b>${esc(item.name)}</b>
                <span>${money(Number(item.price || 0))}</span>
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
          }).join("") || `<div class="minor-empty">這個大項目還沒有小項目</div>`}
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
  if (event.target.closest("#closeCustomerEdit")) closeCustomerEdit();
  if (event.target.closest("#saveCustomerEdit")) saveCustomerEdit();
  if (event.target.id === "customerEditModal") closeCustomerEdit();
  if (event.target.closest("#closePrintPreview")) $("#printPreviewModal")?.classList.add("hide");
  if (event.target.closest("#systemPrint")) window.print();
  if (event.target.closest("#copyPrintText")) {
    const sheet = $(".print-sheet");
    const order = db.orders.find(item => item.id === sheet?.dataset.orderId);
    if (order) navigator.clipboard?.writeText(orderPrintText(order, $("#printDocType").value));
  }
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
  const printButton = event.target.closest(".printOrder");
  if (printButton) printOrder(printButton.dataset.id);
  const orderHistoryButton = event.target.closest(".orderHistory");
  if (orderHistoryButton) {
    $("#historyPlate").value = orderHistoryButton.dataset.plate || "";
    renderHistory(orderHistoryButton.dataset.plate || "");
    openPage("history");
  }
  const editCustomerButton = event.target.closest(".editCustomer");
  if (editCustomerButton) editCustomer(editCustomerButton.dataset.id);
  const customerHistoryButton = event.target.closest(".customerHistory");
  if (customerHistoryButton) {
    $("#historyPlate").value = customerHistoryButton.dataset.plate || "";
    renderHistory(customerHistoryButton.dataset.plate || "");
    openPage("history");
  }
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
    if (!getPartCats().includes(name)) db.catalog.push({ cat: name, name: "新項目", price: 0 });
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
  const toggleMinorEdit = event.target.closest(".toggleMinorEdit");
  if (toggleMinorEdit) {
    const row = toggleMinorEdit.closest(".minor-item");
    const editing = row.classList.toggle("editing");
    toggleMinorEdit.textContent = editing ? "完成" : "修改";
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
  if (event.target.id === "orderStatusFilter") {
    orderStatusFilter = event.target.value || "全部";
    renderOrders();
  }
  if (event.target.matches(".orderStatusSelect")) {
    const order = db.orders.find(item => item.id === event.target.dataset.id);
    if (order) {
      order.workStatus = event.target.value;
      order.updatedAt = new Date().toISOString();
      save();
    }
  }
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
});

load();
if (localStorage.getItem(LOGIN) === "1") {
  $("#login").classList.add("hide");
  $("#app").classList.remove("hide");
}
render();
if (isAutoSyncOn() && getCloudUrl()) cloudDownload({ silent: true });
