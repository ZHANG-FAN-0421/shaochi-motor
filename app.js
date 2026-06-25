

/* =========================================================
   v14 Preview helper: autosave + safe sync hooks
   - 保留原本資料格式
   - 每次 save() 之後嘗試觸發既有同步函式（若存在）
   ========================================================= */
(function(){
  window.SHAOCHI_VERSION = "v14.0-preview";
  window.SHAOCHI_BRAND = "紹馳車業";
  window.SHAOCHI_LAST_LOCAL_SAVE = null;

  function v14Toast(message, type){
    let el = document.getElementById('v14AutoSaveToast');
    if(!el){
      el = document.createElement('div');
      el.id = 'v14AutoSaveToast';
      el.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:999999;background:#020617;color:#f8fafc;border:1px solid #334155;border-radius:999px;padding:9px 13px;font-size:13px;font-weight:900;box-shadow:0 10px 30px rgba(0,0,0,.35);display:none;max-width:92vw;text-align:center;';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.borderColor = type === 'ok' ? '#22c55e' : type === 'warn' ? '#f59e0b' : '#334155';
    el.style.color = type === 'ok' ? '#86efac' : type === 'warn' ? '#fbbf24' : '#f8fafc';
    el.style.display = 'block';
    clearTimeout(el._timer);
    el._timer = setTimeout(()=>{ el.style.display='none'; }, 1600);
  }

  window.v14MarkSaved = function(){
    window.SHAOCHI_LAST_LOCAL_SAVE = new Date().toISOString();
    v14Toast('已自動儲存', 'ok');
  };

  window.v14TryAutoSync = function(){
    try{
      if(typeof window.orderSyncUploadV111 === 'function'){
        window.orderSyncUploadV111({silent:true});
        return;
      }
      if(typeof window.cloudUploadV108Now === 'function'){
        window.cloudUploadV108Now({silent:true});
        return;
      }
    }catch(err){
      console.warn('v14 auto sync skipped:', err);
    }
  };

  window.addEventListener('error', function(e){
    console.error('v14 runtime error:', e.message, e.filename, e.lineno);
  });
})();

const USER="Zhangfan", PASS="zhangfan0421", KEY="shaochi_v14_data", LOGIN="shaochi_v14_login";
let db={orders:[],customers:[]};
let draft={plate:"",km:0,customer:null,customerLocked:false,isNewCustomer:false};
let currentPartCat="保養";
let selectedPartsData=[];
let pendingDelete=null,pendingCustomerDelete=null;
let activeCatalogCat=null;

let PART_CATALOG=[
 {cat:"保養",name:"機油",price:350},{cat:"保養",name:"齒輪油",price:120},{cat:"保養",name:"空濾",price:250},{cat:"保養",name:"火星塞",price:200},
 {cat:"煞車",name:"煞車皮",price:600},{cat:"煞車",name:"煞車油",price:300},
 {cat:"傳動",name:"普利珠",price:500},{cat:"傳動",name:"皮帶",price:1200},
 {cat:"輪胎",name:"前輪",price:1500},{cat:"輪胎",name:"後輪",price:1800},
 {cat:"電系",name:"電瓶",price:1200},{cat:"電系",name:"燈泡",price:250}
];

const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const money=n=>"$"+Number(n||0).toLocaleString("zh-TW");
const today=()=>new Date().toLocaleDateString("zh-TW");
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
function load(){try{db=JSON.parse(localStorage.getItem(KEY)||'{"orders":[],"customers":[]}')}catch{db={orders:[],customers:[]}} if(!Array.isArray(db.orders))db.orders=[]; if(!Array.isArray(db.customers))db.customers=[]; if(Array.isArray(db.catalog))PART_CATALOG=db.catalog; if(!Array.isArray(db.catalog)){db.catalog=PART_CATALOG.slice();}else{PART_CATALOG=db.catalog;} db.orders.forEach(o=>{if(o&&typeof o.items==="string")o.items=o.items.replaceAll("\\n","\n")});}
function save(){db.catalog=PART_CATALOG;localStorage.setItem(KEY,JSON.stringify(db));render();}
function normalizePlate(v){return String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"")}
function formatPlate(v){const raw=normalizePlate(v);if(raw.length===7||raw.length===6)return raw.slice(0,3)+"-"+raw.slice(3);return raw}
function isValidPlate(v){const raw=normalizePlate(v);return raw.length===6||raw.length===7}
function findCustomerByPlate(plate){const p=normalizePlate(plate);return db.customers.find(c=>normalizePlate(c.plate)===p)||null}
function partMoney(n){return "$"+Number(n||0).toLocaleString("zh-TW")}
function calcStatus(o){if(o.type==="估價單")return"估價單";if(Number(o.amount)>0&&Number(o.paid)>=Number(o.amount))return"已付款";if(Number(o.paid)>0)return"欠款";return"未付款"}
function remain(o){return Math.max(0,Number(o.amount||0)-Number(o.paid||0))}
function badge(o){if(o.status==="已付款")return"paid";if(o.status==="估價單")return"quote";return"unpaid"}

function showApp(){$("#login").classList.add("hide");$("#app").classList.remove("hide");
function showPlateHistoryModal(){
  const plate = draft.plate || document.getElementById("showPlate")?.textContent || "";
  const key = normalizePlate(plate);
  const modal = document.getElementById("plateHistoryModal");
  const title = document.getElementById("plateHistoryTitle");
  const list = document.getElementById("plateHistoryList");
  if(!modal || !list) return;

  if(title) title.textContent = `${plate} 歷史維修`;

  const rows = db.orders.filter(o => normalizePlate(o.plate) === key);
  if(!rows.length){
    list.innerHTML = '<div class="history-empty">目前沒有這台車的歷史維修紀錄</div>';
  }else{
    list.innerHTML = rows.map(o => `
      <div class="history-row">
        <b>${esc(o.date)}｜${Number(o.km||0).toLocaleString("zh-TW")} KM</b>
        <div>${itemsHtml(o.items)}</div>
        <div class="muted" style="margin-top:6px">總額 ${money(o.amount)}｜已付 ${money(o.paid)}｜欠 ${money(remain(o))}</div>
      </div>
    `).join("");
  }

  modal.classList.remove("hide");
}
function closePlateHistoryModal(){
  document.getElementById("plateHistoryModal")?.classList.add("hide");
}
document.addEventListener("click", e => {
  if(e.target.closest("#plateHistoryBtn")){
    e.preventDefault();
    showPlateHistoryModal();
    return;
  }
  if(e.target.closest("#closePlateHistory")){
    e.preventDefault();
    closePlateHistoryModal();
    return;
  }
  if(e.target.id === "plateHistoryModal"){
    closePlateHistoryModal();
    return;
  }
}, true);


var editingOrderId = null;
var editItemsData = [];

var editCurrentPartCat = "保養";

function renderEditQuickParts(){
  const tabs = document.getElementById("editPartsTabs");
  const grid = document.getElementById("editPartsGrid");
  if(!tabs || !grid) return;

  const cats = catalogCats();

  tabs.innerHTML = cats.map(cat => `
    <button type="button" class="parts-tab ${cat===editCurrentPartCat?'active':''}" data-edit-cat="${esc(cat)}">${esc(cat)}</button>
  `).join("");

  grid.innerHTML = catalogVisibleItems(editCurrentPartCat)
    .map(p => `
      <button type="button" class="part-btn" data-edit-part-name="${esc(p.name)}" data-edit-part-price="${p.price}">
        <b>${esc(p.name)}</b><span>${money(p.price)}</span>
      </button>
    `).join("");
}


function parseOrderItemsToEdit(order){
  const lines = String(order.items || "").split("\n").filter(Boolean);
  const items = [];
  const notes = [];

  lines.forEach(line => {
    const m = line.match(/^(.*?)\s+x(\d+)\s+\$(\d+)$/);
    if(m){
      const name = m[1].trim();
      const qty = Number(m[2] || 1);
      const subtotal = Number(m[3] || 0);
      const price = qty ? Math.round(subtotal / qty) : subtotal;
      items.push({name, price, qty});
    }else{
      notes.push(line);
    }
  });

  if(!items.length && order.items){
    notes.push(order.items);
  }

  return {items, note: notes.join("\n")};
}

function editPartsSubtotal(){
  return editItemsData.reduce((s,p)=>s + Number(p.price||0) * Math.max(1, Number(p.qty||1)), 0);
}

function updateEditTotals(){
  const parts = editPartsSubtotal();
  const labor = Number(document.getElementById("editLaborCost")?.value || 0);
  const paid = Number(document.getElementById("editPaidAmount")?.value || 0);
  const grand = parts + labor;
  const remain = Math.max(0, grand - paid);

  const pt = document.getElementById("editPartsTotal");
  const gt = document.getElementById("editGrandTotal");
  const rt = document.getElementById("editRemainTotal");
  if(pt) pt.textContent = money(parts);
  if(gt) gt.textContent = money(grand);
  if(rt) rt.textContent = money(remain);
}

function renderEditItems(){
  renderEditQuickParts();
  const list = document.getElementById("editItemsList");
  if(!list) return;

  list.innerHTML = editItemsData.map((p,i)=>`
    <div class="edit-row">
      <div class="edit-row-top">
        <input class="edit-row-name" data-index="${i}" value="${esc(p.name)}" placeholder="品名">
        <div class="edit-row-subtotal" data-index="${i}">${money(Number(p.price||0)*Math.max(1,Number(p.qty||1)))}</div>
      </div>
      <div class="edit-controls">
        <div><label>單價</label><input class="edit-price" data-index="${i}" type="number" min="0" value="${Number(p.price||0)}"></div>
        <div><label>數量</label><input class="edit-qty" data-index="${i}" type="number" min="1" value="${Number(p.qty||1)}"></div>
        <button type="button" class="edit-remove" data-index="${i}">×</button>
      </div>
    </div>
  `).join("");

  updateEditTotals();
}

function updateEditRowSubtotal(i){
  const el = document.querySelector(`.edit-row-subtotal[data-index="${i}"]`);
  if(el && editItemsData[i]){
    el.textContent = money(Number(editItemsData[i].price||0)*Math.max(1,Number(editItemsData[i].qty||1)));
  }
  updateEditTotals();
}

function openEditOrder(id){
  const order = db.orders.find(o => o.id === id);
  if(!order) return;

  editingOrderId = id;
  editCurrentPartCat = "保養";
  const parsed = parseOrderItemsToEdit(order);
  editItemsData = parsed.items;

  document.getElementById("editOrderInfo").textContent = `${order.plate}｜${order.name||""}｜${order.date||""}`;
  document.getElementById("editNote").value = parsed.note || "";
  document.getElementById("editLaborCost").value = Number(order.laborCost || 0);
  document.getElementById("editPaidAmount").value = Number(order.paid || 0);

  renderEditItems();
  document.getElementById("editOrderModal").classList.remove("hide");
}

function closeEditOrder(){
  editingOrderId = null;
  editItemsData = [];
  document.getElementById("editOrderModal")?.classList.add("hide");
}

function syncEditRowsFromInputs(){
  document.querySelectorAll(".edit-row").forEach(row => {
    const nameInput = row.querySelector(".edit-row-name");
    if(!nameInput) return;
    const i = Number(nameInput.dataset.index);
    if(!editItemsData[i]) return;
    editItemsData[i].name = nameInput.value;
    editItemsData[i].price = Number(row.querySelector(".edit-price")?.value || 0);
    editItemsData[i].qty = Math.max(1, Number(row.querySelector(".edit-qty")?.value || 1));
  });
}

function saveEditOrderNow(){
  const order = db.orders.find(o => o.id === editingOrderId);
  if(!order) return;

  syncEditRowsFromInputs();

  const parts = editPartsSubtotal();
  const labor = Number(document.getElementById("editLaborCost")?.value || 0);
  const paid = Number(document.getElementById("editPaidAmount")?.value || 0);
  const note = document.getElementById("editNote")?.value || "";

  const partsText = editItemsData
    .filter(p => String(p.name||"").trim())
    .map(p => {
      const qty = Math.max(1, Number(p.qty || 1));
      const subtotal = Number(p.price || 0) * qty;
      return `${String(p.name||"").trim()} x${qty} $${subtotal}`;
    })
    .join("\n");

  order.items = [partsText, note].filter(Boolean).join("\n");
  order.laborCost = labor;
  order.amount = parts + labor;
  order.paid = paid;
  order.status = calcStatus(order);

  save();
  const targetPage = order.type === "估價單" ? "quotes" : "orders";
  closeEditOrder();
  openPage(targetPage);
}

document.addEventListener("click", e => {
  const editBtn = e.target.closest(".editOrder");
  if(editBtn){
    e.preventDefault();
    openEditOrder(editBtn.dataset.id);
    return;
  }

  if(e.target.closest("#closeEditOrder")){
    e.preventDefault();
    closeEditOrder();
    return;
  }

  const editTab = e.target.closest("[data-edit-cat]");
  if(editTab){
    e.preventDefault();
    editCurrentPartCat = editTab.dataset.editCat;
    renderEditQuickParts();
    return;
  }

  const editPartBtn = e.target.closest("[data-edit-part-name]");
  if(editPartBtn){
    e.preventDefault();
    const name = editPartBtn.dataset.editPartName;
    const price = Number(editPartBtn.dataset.editPartPrice || 0);
    const existing = editItemsData.find(p => String(p.name||"").trim() === String(name||"").trim());
    if(existing){
      existing.qty = Number(existing.qty || 1) + 1;
      if(!existing.price) existing.price = price;
    }else{
      editItemsData.push({name:name, price:price, qty:1});
    }
    renderEditItems();
    return;
  }

  if(e.target.closest("#editAddItem")){
    e.preventDefault();
    editItemsData.push({name:"",price:0,qty:1});
    renderEditItems();
    return;
  }

  const rm = e.target.closest(".edit-remove");
  if(rm){
    e.preventDefault();
    editItemsData.splice(Number(rm.dataset.index),1);
    renderEditItems();
    return;
  }

  if(e.target.closest("#saveEditOrder")){
    e.preventDefault();
    saveEditOrderNow();
    return;
  }
}, true);

document.addEventListener("input", e => {
  const name = e.target.closest(".edit-row-name");
  if(name){
    const i = Number(name.dataset.index);
    if(editItemsData[i]) editItemsData[i].name = name.value;
    return;
  }

  const price = e.target.closest(".edit-price");
  if(price){
    const i = Number(price.dataset.index);
    if(editItemsData[i]){
      editItemsData[i].price = Number(price.value || 0);
      updateEditRowSubtotal(i);
    }
    return;
  }

  const qty = e.target.closest(".edit-qty");
  if(qty){
    const i = Number(qty.dataset.index);
    if(editItemsData[i]){
      editItemsData[i].qty = Math.max(1, Number(qty.value || 1));
      updateEditRowSubtotal(i);
    }
    return;
  }

  if(e.target.matches("#editLaborCost,#editPaidAmount")){
    updateEditTotals();
  }
}, true);


var editingCustomerId = null;

function openCustomerEdit(id){
  const c = db.customers.find(x => x.id === id);
  if(!c) return;

  editingCustomerId = id;

  document.getElementById("customerEditPlate").textContent = c.plate || "";
  document.getElementById("editCustomerName").value = c.name || "";
  document.getElementById("editCustomerPhone").value = c.phone || "";
  document.getElementById("editCustomerModel").value = c.model || "";
  document.getElementById("editCustomerYear").value = c.year || "";
  document.getElementById("editCustomerColor").value = c.color || "";

  document.getElementById("customerEditModal").classList.remove("hide");
}

function closeCustomerEdit(){
  editingCustomerId = null;
  document.getElementById("customerEditModal")?.classList.add("hide");
}

function saveCustomerEditNow(){
  const c = db.customers.find(x => x.id === editingCustomerId);
  if(!c) return;

  c.name = document.getElementById("editCustomerName").value.trim();
  c.phone = document.getElementById("editCustomerPhone").value.trim();
  c.model = document.getElementById("editCustomerModel").value.trim();
  c.year = document.getElementById("editCustomerYear").value.trim();
  c.color = document.getElementById("editCustomerColor").value.trim();

  save();
  closeCustomerEdit();
  openPage("customers");
}

document.addEventListener("click", e => {
  const editBtn = e.target.closest(".editCustomer");
  if(editBtn){
    e.preventDefault();
    openCustomerEdit(editBtn.dataset.id);
    return;
  }

  if(e.target.closest("#closeCustomerEdit")){
    e.preventDefault();
    closeCustomerEdit();
    return;
  }

  if(e.target.closest("#saveCustomerEdit")){
    e.preventDefault();
    saveCustomerEditNow();
    return;
  }

  if(e.target.id === "customerEditModal"){
    closeCustomerEdit();
    return;
  }
}, true);


function catalogCats(){
  return [...new Set(PART_CATALOG.map(p=>p.cat))];
}

function renderItemManager(){
  const select = document.getElementById("itemCatSelect");
  const list = document.getElementById("itemManagerList");
  if(!select || !list) return;

  const cats = catalogCats();

  if(!activeCatalogCat || !cats.includes(activeCatalogCat)){
    activeCatalogCat = cats[0] || "";
  }

  select.innerHTML = cats.map(cat=>`<option value="${esc(cat)}" ${cat===activeCatalogCat?'selected':''}>${esc(cat)}</option>`).join("");

  if(!cats.length){
    list.innerHTML = '<p class="muted">目前沒有項目</p>';
    return;
  }

  const catButtons = cats.map(cat=>{
    const count = PART_CATALOG.filter(p=>p.cat===cat).length;
    return `<button type="button" class="catalog-cat-btn ${cat===activeCatalogCat?'active':''}" data-open-cat="${esc(cat)}">
      <span>${esc(cat)}</span><span>${count} 項</span>
    </button>`;
  }).join("");

  const items = PART_CATALOG.filter(p=>p.cat===activeCatalogCat);

  const body = `<div class="catalog-cat-body">
    <div class="catalog-cat-head">
      <h3>${esc(activeCatalogCat)}</h3>
    </div>
    <div class="sort-control-box">
      <label>選擇小項排序</label>
      <div class="sort-control-row">
        <select id="sortItemSelect">
          ${items.map(p=>{
            const idx = PART_CATALOG.indexOf(p);
            return `<option value="${idx}">${esc(p.name)}｜${Number(p.price||0).toLocaleString("zh-TW")}</option>`;
          }).join("")}
        </select>
        <button type="button" id="sortMoveUp" class="secondary">上移</button>
        <button type="button" id="sortMoveDown" class="secondary">下移</button>
      </div>
    </div>
    <div class="catalog-items">
      ${items.map(p=>{
        const idx = PART_CATALOG.indexOf(p);
        return `<div class="catalog-item">
          <div class="catalog-item-row">
            <input class="catalog-name" data-index="${idx}" value="${esc(p.name)}" placeholder="小項名稱">
            <input class="catalog-price" data-index="${idx}" type="number" min="0" value="${Number(p.price||0)}" placeholder="價格">
            <button type="button" class="catalog-del deleteItem" data-index="${idx}">刪除</button>
          </div>
        </div>`;
      }).join("") || '<p class="muted">此大項目前沒有小項</p>'}
    </div>
  </div>`;

  list.innerHTML = catButtons + body;
}

function saveCatalog(){
  db.catalog = PART_CATALOG;
  localStorage.setItem(KEY, JSON.stringify(db));
  renderPartsUI();
  if(typeof renderEditQuickParts === "function") renderEditQuickParts();
  renderItemManager();
}

document.addEventListener("click", e=>{
  const openCat = e.target.closest("[data-open-cat]");
  if(openCat){
    e.preventDefault();
    activeCatalogCat = openCat.dataset.openCat;
    const select = document.getElementById("itemCatSelect");
    if(select) select.value = activeCatalogCat;
    renderItemManager();
    return;
  }

  if(e.target.closest("#addCatBtn")){
    e.preventDefault();
    const name = document.getElementById("newCatName").value.trim();
    if(!name){alert("請輸入大項名稱");return;}
    if(catalogCats().includes(name)){alert("大項已存在");return;}
    PART_CATALOG.push({cat:name,name:"範例項目",price:0});
    activeCatalogCat=name;
    document.getElementById("newCatName").value="";
    saveCatalog();
    return;
  }

  if(e.target.closest("#addItemBtn")){
    e.preventDefault();
    const cat = document.getElementById("itemCatSelect").value;
    const name = document.getElementById("newItemName").value.trim();
    const price = Number(document.getElementById("newItemPrice").value||0);
    if(!cat){alert("請先新增或選擇大項");return;}
    if(!name){alert("請輸入小項名稱");return;}
    PART_CATALOG.push({cat,name,price});
    activeCatalogCat=cat;
    document.getElementById("newItemName").value="";
    document.getElementById("newItemPrice").value="";
    saveCatalog();
    return;
  }

  const delItem = e.target.closest(".deleteItem");
  if(delItem){
    e.preventDefault();
    const idx = Number(delItem.dataset.index);
    const oldCat = PART_CATALOG[idx]?.cat;
    PART_CATALOG.splice(idx,1);
    if(oldCat && !PART_CATALOG.some(p=>p.cat===oldCat)){
      activeCatalogCat = catalogCats()[0] || "";
    }
    saveCatalog();
    return;
  }
},true);

document.addEventListener("input", e=>{
  const name = e.target.closest(".catalog-name");
  if(name){
    const idx=Number(name.dataset.index);
    if(PART_CATALOG[idx]){
      PART_CATALOG[idx].name=name.value;
      db.catalog=PART_CATALOG;
      localStorage.setItem(KEY,JSON.stringify(db));
      renderPartsUI();
    }
    return;
  }

  const price = e.target.closest(".catalog-price");
  if(price){
    const idx=Number(price.dataset.index);
    if(PART_CATALOG[idx]){
      PART_CATALOG[idx].price=Number(price.value||0);
      db.catalog=PART_CATALOG;
      localStorage.setItem(KEY,JSON.stringify(db));
      renderPartsUI();
    }
    return;
  }
},true);


document.addEventListener("change", e=>{
  if(e.target && e.target.id==="itemCatSelect"){
    activeCatalogCat = e.target.value;
    renderItemManager();
  }
}, true);


function moveSelectedCatalogItem(direction){
  const select = document.getElementById("sortItemSelect");
  if(!select) return;

  const realIndex = Number(select.value);
  const item = PART_CATALOG[realIndex];
  if(!item) return;

  const same = PART_CATALOG
    .map((p,i)=>({p,i}))
    .filter(x=>x.p.cat===item.cat && !x.p.hidden);

  const pos = same.findIndex(x=>x.i===realIndex);
  const target = pos + direction;

  if(pos < 0 || target < 0 || target >= same.length) return;

  const targetIndex = same[target].i;

  const temp = PART_CATALOG[realIndex];
  PART_CATALOG[realIndex] = PART_CATALOG[targetIndex];
  PART_CATALOG[targetIndex] = temp;

  db.catalog = PART_CATALOG;
  localStorage.setItem(KEY, JSON.stringify(db));

  renderPartsUI();
  if(typeof renderEditQuickParts === "function") renderEditQuickParts();
  renderItemManager();

  const newSelect = document.getElementById("sortItemSelect");
  if(newSelect){
    newSelect.value = String(targetIndex);
  }
}

document.addEventListener("click", e=>{
  if(e.target.closest("#sortMoveUp")){
    e.preventDefault();
    e.stopPropagation();
    moveSelectedCatalogItem(-1);
    return;
  }
  if(e.target.closest("#sortMoveDown")){
    e.preventDefault();
    e.stopPropagation();
    moveSelectedCatalogItem(1);
    return;
  }
}, true);


/* v10 clean catalog module - overrides legacy item manager safely */
var catalogPendingDeleteId = null;

function catalogEnsure(){
  if(!Array.isArray(PART_CATALOG)) PART_CATALOG = [];
  PART_CATALOG.forEach((p,i)=>{
    if(!p.id) p.id = "ci_" + Date.now().toString(36) + "_" + i + "_" + Math.random().toString(36).slice(2,7);
    if(p.sort === undefined || p.sort === null) p.sort = i + 1;
    if(p.price === undefined || p.price === null) p.price = 0;
    if(p.hidden === undefined) p.hidden = false;
    p.cat = String(p.cat || "未分類");
    p.name = String(p.name || "");
  });
  db.catalog = PART_CATALOG;
}

function catalogSave(){
  catalogEnsure();
  localStorage.setItem(KEY, JSON.stringify(db));
}

function catalogCats(){
  catalogEnsure();
  return [...new Set(PART_CATALOG.filter(p=>!p.hidden).map(p=>p.cat))];
}

function catalogVisibleItems(cat){
  catalogEnsure();
  return PART_CATALOG
    .filter(p=>p.cat===cat && !p.hidden)
    .slice()
    .sort((a,b)=>{
      const sa = Number(a.sort || 0);
      const sb = Number(b.sort || 0);
      if(sa !== sb) return sa - sb;
      return String(a.name||"").localeCompare(String(b.name||""), "zh-Hant");
    });
}

function catalogReindex(cat){
  catalogVisibleItems(cat).forEach((p,i)=>p.sort = i + 1);
  catalogSave();
}

function catalogRefreshAll(){
  catalogEnsure();
  renderPartsUI();
  if(typeof renderEditQuickParts === "function") renderEditQuickParts();
  renderItemManager();
}

function renderItemManager(){
  catalogEnsure();

  const select = document.getElementById("v10ItemCatSelect");
  const list = document.getElementById("itemManagerList");
  if(!select || !list) return;

  const cats = catalogCats();

  if(!activeCatalogCat || !cats.includes(activeCatalogCat)){
    activeCatalogCat = cats[0] || "";
  }

  select.innerHTML = cats.map(cat=>`<option value="${esc(cat)}" ${cat===activeCatalogCat?'selected':''}>${esc(cat)}</option>`).join("");

  if(!cats.length){
    list.innerHTML = '<p class="muted">目前沒有項目</p>';
    return;
  }

  const catButtons = cats.map(cat=>{
    const count = catalogVisibleItems(cat).length;
    return `<button type="button" class="catalog-v10-cat ${cat===activeCatalogCat?'active':''}" data-v10-cat="${esc(cat)}">
      <span>${esc(cat)}</span><span>${count} 項</span>
    </button>`;
  }).join("");

  const items = catalogVisibleItems(activeCatalogCat);
  const selectedStillExists = catalogPendingDeleteId && items.some(p=>p.id===catalogPendingDeleteId);
  const deleteText = selectedStillExists ? "確定刪除" : "刪除";

  const control = items.length ? `<div class="catalog-v10-box">
    <label>選擇小項排序／刪除</label>
    <div class="catalog-v10-control">
      <select id="catalogSelectedItem">
        ${items.map(p=>`<option value="${esc(p.id)}" ${p.id===catalogPendingDeleteId?'selected':''}>${esc(p.name)}｜${Number(p.price||0).toLocaleString("zh-TW")}</option>`).join("")}
      </select>
      <button type="button" id="catalogMoveUp" class="secondary">上移</button>
      <button type="button" id="catalogMoveDown" class="secondary">下移</button>
      <button type="button" id="catalogDeleteItem" class="danger">${deleteText}</button>
    </div>
  </div>` : "";

  const body = `<div class="catalog-v10-box">
    <h3>${esc(activeCatalogCat)}</h3>
    <div class="catalog-v10-list">
      ${items.map(p=>`
        <div class="catalog-v10-row">
          <div class="catalog-v10-grid">
            <input class="catalogV10Name" data-id="${esc(p.id)}" value="${esc(p.name)}" placeholder="小項名稱">
            <input class="catalogV10Price" data-id="${esc(p.id)}" type="number" min="0" value="${Number(p.price||0)}" placeholder="價格">
          </div>
          <div class="catalog-v10-muted">排序：${Number(p.sort||0)}${p.id===catalogPendingDeleteId?'｜等待確認刪除':''}</div>
        </div>
      `).join("") || '<p class="muted">此大項目前沒有小項</p>'}
    </div>
  </div>`;

  list.innerHTML = `<div class="catalog-v10-cats">${catButtons}</div>${control}${body}`;
}

function catalogFindSelected(){
  const id = document.getElementById("catalogSelectedItem")?.value;
  return id ? PART_CATALOG.find(p=>p.id===id) : null;
}

function catalogMoveSelected(direction){
  const item = catalogFindSelected();
  if(!item) return;
  catalogPendingDeleteId = null;

  const rows = catalogVisibleItems(item.cat);
  const pos = rows.findIndex(p=>p.id===item.id);
  const target = pos + direction;
  if(pos < 0 || target < 0 || target >= rows.length) return;

  const a = rows[pos];
  const b = rows[target];
  const temp = a.sort;
  a.sort = b.sort;
  b.sort = temp;

  catalogReindex(item.cat);
  catalogRefreshAll();

  const newSelect = document.getElementById("catalogSelectedItem");
  if(newSelect) newSelect.value = item.id;
}

function catalogDeleteSelectedTwoStep(){
  const item = catalogFindSelected();
  if(!item) return;

  if(catalogPendingDeleteId !== item.id){
    catalogPendingDeleteId = item.id;
    renderItemManager();
    const sel = document.getElementById("catalogSelectedItem");
    if(sel) sel.value = item.id;
    return;
  }

  const oldCat = item.cat;
  PART_CATALOG = PART_CATALOG.filter(p=>p.id!==item.id);
  catalogPendingDeleteId = null;

  if(catalogVisibleItems(oldCat).length){
    activeCatalogCat = oldCat;
  }else{
    activeCatalogCat = catalogCats()[0] || "";
  }

  catalogReindex(oldCat);
  catalogRefreshAll();
}

function catalogAddCategory(){
  const input = document.getElementById("v10NewCatName");
  const name = input?.value.trim();
  if(!name){ alert("請輸入大項名稱"); return; }
  if(catalogCats().includes(name)){ alert("大項已存在"); return; }

  PART_CATALOG.push({id:uid(), cat:name, name:"範例項目", price:0, sort:1, hidden:false});
  activeCatalogCat = name;
  catalogPendingDeleteId = null;
  if(input) input.value = "";
  catalogRefreshAll();
}

function catalogAddItem(){
  const cat = document.getElementById("v10ItemCatSelect")?.value || activeCatalogCat;
  const nameInput = document.getElementById("v10NewItemName");
  const priceInput = document.getElementById("v10NewItemPrice");
  const name = nameInput?.value.trim();
  const price = Number(priceInput?.value || 0);

  if(!cat){ alert("請先新增或選擇大項"); return; }
  if(!name){ alert("請輸入小項名稱"); return; }

  PART_CATALOG.push({id:uid(), cat, name, price, sort:catalogVisibleItems(cat).length+1, hidden:false});
  activeCatalogCat = cat;
  catalogPendingDeleteId = null;
  if(nameInput) nameInput.value = "";
  if(priceInput) priceInput.value = "";
  catalogRefreshAll();
}

document.addEventListener("click", e=>{
  const catBtn = e.target.closest("[data-v10-cat]");
  if(catBtn){
    e.preventDefault();
    catalogPendingDeleteId = null;
    activeCatalogCat = catBtn.dataset.v10Cat;
    renderItemManager();
    return;
  }

  if(e.target.closest("#v10AddCatBtn")){
    e.preventDefault();
    catalogAddCategory();
    return;
  }

  if(e.target.closest("#v10AddItemBtn")){
    e.preventDefault();
    catalogAddItem();
    return;
  }

  if(e.target.closest("#catalogMoveUp")){
    e.preventDefault();
    catalogMoveSelected(-1);
    return;
  }

  if(e.target.closest("#catalogMoveDown")){
    e.preventDefault();
    catalogMoveSelected(1);
    return;
  }

  if(e.target.closest("#catalogDeleteItem")){
    e.preventDefault();
    catalogDeleteSelectedTwoStep();
    return;
  }
}, true);

document.addEventListener("change", e=>{
  if(e.target && e.target.id==="v10ItemCatSelect"){
    catalogPendingDeleteId = null;
    activeCatalogCat = e.target.value;
    renderItemManager();
  }
  if(e.target && e.target.id==="catalogSelectedItem"){
    catalogPendingDeleteId = null;
    const chosen = e.target.value;
    renderItemManager();
    const sel = document.getElementById("catalogSelectedItem");
    if(sel) sel.value = chosen;
  }
}, true);

document.addEventListener("input", e=>{
  const name = e.target.closest(".catalogV10Name");
  if(name){
    const item = PART_CATALOG.find(p=>p.id===name.dataset.id);
    if(item){
      item.name = name.value;
      catalogSave();
      renderPartsUI();
      if(typeof renderEditQuickParts === "function") renderEditQuickParts();
    }
    return;
  }

  const price = e.target.closest(".catalogV10Price");
  if(price){
    const item = PART_CATALOG.find(p=>p.id===price.dataset.id);
    if(item){
      item.price = Number(price.value || 0);
      catalogSave();
      renderPartsUI();
      if(typeof renderEditQuickParts === "function") renderEditQuickParts();
    }
    return;
  }
}, true);

load();catalogEnsure();renderPartsUI();render();renderItemManager();}
function showLogin(){$("#app").classList.add("hide");$("#login").classList.remove("hide");}
$("#loginForm").addEventListener("submit",e=>{e.preventDefault();if($("#user").value.trim()===USER&&$("#pass").value===PASS){localStorage.setItem(LOGIN,"1");showApp()}else $("#loginMsg").textContent="帳號或密碼錯誤"});
if(localStorage.getItem(LOGIN)==="1")showApp();
$("#logout").addEventListener("click",()=>{localStorage.removeItem(LOGIN);showLogin()});

$("#menu").addEventListener("click",()=>{$("#side").classList.add("open");$("#overlay").classList.add("show")});
$("#overlay").addEventListener("click",()=>{$("#side").classList.remove("open");$("#overlay").classList.remove("show")});
const titles={receive:"接車建單",orders:"工單管理",quotes:"估價單管理",items:"項目管理",history:"歷史維修",customers:"客戶車輛",money:"營收備份"};
function openPage(id){$$(".page").forEach(p=>p.classList.toggle("active",p.id===id));$$(".side button[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===id));$("#title").textContent=titles[id];$("#side").classList.remove("open");$("#overlay").classList.remove("show");window.scrollTo(0,0)}
$$(".side button[data-page]").forEach(b=>b.addEventListener("click",()=>openPage(b.dataset.page)));

function updateOldCustomerPreview(){const c=findCustomerByPlate($("#plate").value);const box=$("#oldCustomerBox");if(c){$("#foundMsg").textContent="已找到舊客戶，下一步會自動帶入資料";box.classList.remove("hide");box.innerHTML=`<b>${esc(c.plate)}｜${esc(c.name||"")}</b><br><span class="muted">${esc(c.phone||"")}｜${esc(c.model||"")}${c.year?`｜${esc(c.year)}`:""}${c.color?`｜${esc(c.color)}`:""}</span>`}else{$("#foundMsg").textContent="";box.classList.add("hide");box.innerHTML=""}}
function liveFormatPlateInput(){
 const el=$("#plate");
 let raw=normalizePlate(el.value).slice(0,7);
 let formatted=raw;
 if(raw.length===6 || raw.length===7){
   formatted=formatPlate(raw);
 }
 el.value=formatted;
 updateOldCustomerPreview();
}
$("#plate").addEventListener("input",liveFormatPlateInput);
$("#plate").addEventListener("blur",()=>{
 const el=$("#plate");
 el.value=formatPlate(el.value);
 updateOldCustomerPreview();
});

function lockCustomer(c){draft.customerLocked=true;$("#lockedCustomerLine").innerHTML=`${esc(c.name||"")}｜<span>${esc(c.phone||"")}</span>｜<span>${esc(c.model||"")}</span>${c.year?`｜<span>${esc(c.year)}</span>`:""}${c.color?`｜<span>${esc(c.color)}</span>`:""}`;$("#lockedCustomerBox").classList.remove("hide");$("#customerInputBox").classList.add("hide");$("#workArea").classList.remove("locked")}
function inputCustomer(c=null){draft.customerLocked=false;$("#lockedCustomerBox").classList.add("hide");$("#customerInputBox").classList.remove("hide");$("#workArea").classList.add("locked");$("#custName").value=c?.name||"";$("#custPhone").value=c?.phone||"";$("#custModel").value=c?.model||"";$("#custYear").value=c?.year||"";$("#custColor").value=c?.color||""}

$("#step1").addEventListener("submit",e=>{e.preventDefault();if(!isValidPlate($("#plate").value)){alert("車牌請輸入 6 碼或 7 碼");return;}draft.plate=formatPlate($("#plate").value);$("#plate").value=draft.plate;draft.km=Number($("#km").value||0);draft.customer=findCustomerByPlate(draft.plate);$("#showPlate").textContent=draft.plate;$("#editKm").value=draft.km;if(draft.customer){lockCustomer(draft.customer)}else{inputCustomer(null)}$("#step1").classList.add("hide");$("#step2").classList.remove("hide");updateMoneyPanel()});
$("#confirmCustomerBtn").addEventListener("click",()=>{const c={name:$("#custName").value.trim(),phone:$("#custPhone").value.trim(),model:$("#custModel").value.trim(),year:$("#custYear").value.trim(),color:$("#custColor").value.trim()};if(!c.name){alert("請輸入客戶姓名");return}lockCustomer(c)});
$("#back").addEventListener("click",()=>{$("#step2").classList.add("hide");$("#step1").classList.remove("hide")});

function renderPartsUI(){const tabs=$("#partsTabs"),grid=$("#partsGrid"),selected=$("#selectedParts");if(!tabs||!grid||!selected)return;const cats=catalogCats();tabs.innerHTML=cats.map(cat=>`<button type="button" class="parts-tab ${cat===currentPartCat?'active':''}" data-cat="${esc(cat)}">${esc(cat)}</button>`).join("");grid.innerHTML=catalogVisibleItems(currentPartCat).map(p=>`<button type="button" class="part-btn" data-name="${esc(p.name)}" data-price="${p.price}"><b>${esc(p.name)}</b><span>${partMoney(p.price)}</span></button>`).join("");selected.innerHTML=selectedPartsData.map((p,i)=>`<div class="part-row"><div class="part-row-top"><input class="part-name" data-index="${i}" value="${esc(p.name)}" placeholder="品名"><div class="part-row-subtotal" data-subtotal="${i}">${partMoney(Number(p.price||0)*Number(p.qty||1))}</div></div><div class="part-controls"><div><label>單價</label><input class="part-price" data-index="${i}" type="number" min="0" value="${Number(p.price||0)}"></div><div><label>數量</label><input class="part-qty" data-index="${i}" type="number" min="1" value="${Number(p.qty||1)}"></div><button type="button" class="part-remove" data-index="${i}">×</button></div></div>`).join("");updateMoneyPanel()}
function getPartsSubtotal(){return selectedPartsData.reduce((s,p)=>s+Number(p.price||0)*Math.max(1,Number(p.qty||1)),0)}
function updateMoneyPanel(){const parts=getPartsSubtotal(),labor=Number($("#laborCost")?.value||0),paid=Number($("#paidAmount")?.value||0),grand=parts+labor,remain=Math.max(0,grand-paid);["partsTotal","calcPartsTotal"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=partMoney(parts)});$("#calcGrandTotal").textContent=partMoney(grand);$("#calcRemainTotal").textContent=partMoney(remain)}

function updatePartSubtotalOnly(i){
  const el = document.querySelector(`.part-row-subtotal[data-subtotal="${i}"]`);
  if(el && selectedPartsData[i]){
    const subtotal = Number(selectedPartsData[i].price||0) * Math.max(1, Number(selectedPartsData[i].qty||1));
    el.textContent = partMoney(subtotal);
  }
  updateMoneyPanel();
}

function resetParts(){selectedPartsData=[];currentPartCat="保養";$("#laborCost").value=0;$("#paidAmount").value=0;renderPartsUI();updateMoneyPanel()}

document.addEventListener("click",e=>{const tab=e.target.closest(".parts-tab");if(tab){currentPartCat=tab.dataset.cat;renderPartsUI();return}const btn=e.target.closest(".part-btn");if(btn){const name=btn.dataset.name,price=Number(btn.dataset.price||0);const old=selectedPartsData.find(p=>p.name===name);if(old)old.qty=Number(old.qty||1)+1;else selectedPartsData.push({name,price,qty:1});renderPartsUI();return}const rm=e.target.closest(".part-remove");if(rm){selectedPartsData.splice(Number(rm.dataset.index),1);renderPartsUI();return}const add=e.target.closest("#addCustomItem");if(add){selectedPartsData.push({name:"",price:0,qty:1});renderPartsUI();return}const del=e.target.closest(".delOrder");if(del){const id=del.dataset.id;if(pendingDelete!==id){pendingDelete=id;render();return}db.orders=db.orders.filter(o=>o.id!==id);pendingDelete=null;save();return}const pay=e.target.closest(".pay");if(pay){const o=db.orders.find(x=>x.id===pay.dataset.id);if(o){o.paid=o.amount;o.status="已付款";save()}return}const hist=e.target.closest(".hist");if(hist){$("#historyPlate").value=hist.dataset.plate;showHistory(hist.dataset.plate);openPage("history");return}const delC=e.target.closest(".delCustomer");if(delC){const id=delC.dataset.id;if(pendingCustomerDelete!==id){pendingCustomerDelete=id;render();return}db.customers=db.customers.filter(c=>c.id!==id);pendingCustomerDelete=null;save();return}},true);
document.addEventListener("input",e=>{
 const n=e.target.closest(".part-name");
 if(n){
   const i=Number(n.dataset.index);
   if(selectedPartsData[i]) selectedPartsData[i].name=n.value;
   return;
 }

 const pr=e.target.closest(".part-price");
 if(pr){
   const i=Number(pr.dataset.index);
   if(selectedPartsData[i]){
     selectedPartsData[i].price=Number(pr.value||0);
     updatePartSubtotalOnly(i);
   }
   return;
 }

 const q=e.target.closest(".part-qty");
 if(q){
   const i=Number(q.dataset.index);
   if(selectedPartsData[i]){
     selectedPartsData[i].qty=Math.max(1,Number(q.value||1));
     updatePartSubtotalOnly(i);
   }
   return;
 }

 if(e.target.matches("#laborCost,#paidAmount")) updateMoneyPanel();
},true);

function createOrder(){if(!draft.plate){alert("請先輸入車牌");return} if(!isValidPlate(draft.plate)){alert("車牌請輸入 6 碼或 7 碼");return}if(!draft.customerLocked){const c={name:$("#custName").value.trim(),phone:$("#custPhone").value.trim(),model:$("#custModel").value.trim(),year:$("#custYear").value.trim(),color:$("#custColor").value.trim()};if(!c.name){alert("請輸入客戶姓名");return}lockCustomer(c)}const customer={name:$("#custName").value.trim()||draft.customer?.name||"",phone:$("#custPhone").value.trim()||draft.customer?.phone||"",model:$("#custModel").value.trim()||draft.customer?.model||"",year:$("#custYear").value.trim()||draft.customer?.year||"",color:$("#custColor").value.trim()||draft.customer?.color||""};const parts=getPartsSubtotal(),labor=Number($("#laborCost").value||0),paid=Number($("#paidAmount").value||0),amount=parts+labor;const partsText=selectedPartsData.filter(p=>String(p.name||"").trim()).map(p=>`${p.name} x${p.qty} $${Number(p.price||0)*Number(p.qty||1)}`).join("\n");const note=$("#note").value||"";const order={id:uid(),date:today(),plate:draft.plate,km:Number($("#editKm").value||draft.km||0),...customer,items:[partsText,note].filter(Boolean).join("\n"),amount,paid,laborCost:labor,type:$("#orderType").value,status:""};order.status=calcStatus(order);db.orders.unshift(order);const old=findCustomerByPlate(order.plate);if(old){old.km=order.km;Object.assign(old,customer)}else db.customers.unshift({id:uid(),plate:order.plate,km:order.km,...customer});save();$("#step1").reset();$("#step2").reset();$("#step2").classList.add("hide");$("#step1").classList.remove("hide");$("#lockedCustomerBox").classList.add("hide");$("#customerInputBox").classList.remove("hide");$("#workArea").classList.add("locked");draft={plate:"",km:0,customer:null,customerLocked:false,isNewCustomer:false};resetParts();const successMsg = order.type==="估價單" ? $("#quoteSuccessMsg") : $("#createSuccessMsg");
if(successMsg){
  successMsg.textContent = order.type==="估價單" ? "估價單已建立" : "工單已建立";
  successMsg.classList.remove("hide");
  setTimeout(()=>successMsg.classList.add("hide"),1500);
}openPage(order.type==="估價單" ? "quotes" : "orders")}
$("#createOrderBtn").addEventListener("click",createOrder);


function itemsHtml(text){
  return esc(String(text||"").replaceAll("\\n", "\n")).replaceAll("\n","<br>");
}


function searchViewCard(o){
  return `<div class="item">
    <h3>${esc(o.plate)}｜${esc(o.name)}</h3>
    <div class="muted">${esc(o.date)}｜${Number(o.km||0).toLocaleString("zh-TW")} km｜${esc(o.model||"")}</div>
    <div style="line-height:1.6">${itemsHtml ? itemsHtml(o.items) : esc(o.items||"").replaceAll("\n","<br>")}</div>
    <p><b>總額 ${money(o.amount)}</b>｜已付 ${money(o.paid)}｜欠 ${money(remain(o))} <span class="badge ${badge(o)}">${esc(o.status)}</span></p>
  </div>`;
}

function orderCard(o){const delText=pendingDelete===o.id?"確認刪除":"刪除";return `<div class="item"><h3>${esc(o.plate)}｜${esc(o.name)}</h3><div class="muted">${esc(o.date)}｜${Number(o.km||0).toLocaleString("zh-TW")} km｜${esc(o.model||"")}</div><div style="line-height:1.6">${itemsHtml(o.items)}</div><p><b>總額 ${money(o.amount)}</b>｜已付 ${money(o.paid)}｜欠 ${money(remain(o))} <span class="badge ${badge(o)}">${esc(o.status)}</span></p><div class="actions"><button class="green pay" data-id="${o.id}">一鍵已付款</button><button class="secondary editOrder" data-id="${o.id}">修改工單</button><button class="secondary hist" data-plate="${esc(o.plate)}">歷史維修</button><button class="danger delOrder" data-id="${o.id}">${delText}</button></div></div>`}

function convertQuoteToOrderByDate(id,dateValue){
  load();
  const o=db.orders.find(x=>x.id===id);
  if(!o){
    alert("找不到這張估價單");
    return;
  }
  const finalDate=String(dateValue||"").trim();
  if(!finalDate){
    alert("日期不可空白");
    return;
  }
  o.type="工單";
  o.date=finalDate;
  o.status=calcStatus(o);
  localStorage.setItem(KEY,JSON.stringify(db));
  render();
  openPage("orders");
}
document.addEventListener("click",e=>{
  const btn=e.target.closest(".quoteConfirmConvert");
  if(!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const input=document.getElementById(btn.dataset.input);
  convertQuoteToOrderByDate(btn.dataset.id,input?input.value:"");
},true);

function quoteCard(o){
 const delText=pendingDelete===o.id?"確認刪除":"刪除";
 const inputId=`quoteDate_${o.id}`;
 return `<div class="item">
   <h3>${esc(o.plate)}｜${esc(o.name)}</h3>
   <div class="muted">${esc(o.date)}｜${Number(o.km||0).toLocaleString("zh-TW")} km｜${esc(o.model||"")}</div>
   <div style="line-height:1.6">${itemsHtml(o.items)}</div>
   <p><b>估價 ${money(o.amount)}</b>｜已付 ${money(o.paid)}｜欠 ${money(remain(o))} <span class="badge quote">估價單</span></p>
   <div class="quote-convert-box">
     <label>轉正式工單日期</label>
     <div class="quote-convert-row">
       <input id="${inputId}" class="quote-convert-date" data-id="${o.id}" value="${today()}">
       <button type="button" class="green quoteConfirmConvert" data-id="${o.id}" data-input="${inputId}">確認轉工單</button>
     </div>
   </div>
   <div class="actions">
     <button class="secondary editOrder" data-id="${o.id}">修改估價單</button>
     <button class="secondary hist" data-plate="${esc(o.plate)}">歷史維修</button>
     <button class="danger delOrder" data-id="${o.id}">${delText}</button>
   </div>
 </div>`;
}

function customerCard(c){const delText=pendingCustomerDelete===c.id?"確認刪除":"刪除";return `<div class="item"><h3>${esc(c.plate)}｜${esc(c.name)}</h3><div class="muted">${esc(c.phone||"")}｜${esc(c.model||"")}${c.year?`｜${esc(c.year)}`:""}${c.color?`｜${esc(c.color)}`:""}</div><div class="actions"><button class="secondary editCustomer" data-id="${c.id}">修改資料</button><button class="secondary hist" data-plate="${esc(c.plate)}">歷史維修</button><button class="danger delCustomer" data-id="${c.id}">${delText}</button></div></div>`}
function render(){
 load();
 const formalOrders=db.orders.filter(o=>o.type!=="估價單");
 const quotes=db.orders.filter(o=>o.type==="估價單");
 $("#orderList").innerHTML=formalOrders.map(orderCard).join("")||'<p class="muted">目前沒有正式工單</p>';
 const quoteList=$("#quoteList");
 if(quoteList) quoteList.innerHTML=quotes.map(quoteCard).join("")||'<p class="muted">目前沒有估價單</p>';
 $("#customerList").innerHTML=db.customers.map(customerCard).join("")||'<p class="muted">目前沒有客戶資料</p>';
 const rev=formalOrders.reduce((s,o)=>s+Number(o.paid||0),0);
 $("#revenue").textContent=money(rev);
 $("#stats").textContent=`正式工單 ${formalOrders.length}｜估價單 ${quotes.length}｜未付/欠款 ${formalOrders.filter(o=>o.status==="未付款"||o.status==="欠款").length}｜已付款 ${formalOrders.filter(o=>o.status==="已付款").length}`;
 renderItemManager();
}
function showHistory(plate){const p=normalizePlate(plate||$("#historyPlate").value);const rows=db.orders.filter(o=>normalizePlate(o.plate)===p);$("#historyList").innerHTML=rows.map(o=>`<div class="item"><h3>${esc(o.date)}｜${Number(o.km||0).toLocaleString("zh-TW")} km</h3><div>${itemsHtml(o.items)}</div></div>`).join("")||'<p class="muted">查無歷史維修</p>'}
$("#historyBtn").addEventListener("click",()=>showHistory());
$("#search").addEventListener("input",e=>{
 let raw=e.target.value.trim();
 const compact=normalizePlate(raw);
 if(compact.length===6 || compact.length===7){
   raw=formatPlate(compact);
   e.target.value=raw;
 }
 const q=raw.toLowerCase();
 const qPlate=normalizePlate(raw);
 if(!q){
   $("#searchList").innerHTML="";
   return;
 }
 const rows=db.orders.filter(o=>{
   const text=JSON.stringify(o).toLowerCase();
   const plate=normalizePlate(o.plate);
   return text.includes(q) || (qPlate && plate.includes(qPlate));
 }).slice(0,8);
 $("#searchList").innerHTML=rows.map(searchViewCard).join("")||'<p class="muted">找不到資料</p>';
});

function makeBackupData(){
  load();
  return {
    version: "v9.16",
    exportedAt: new Date().toLocaleString("zh-TW"),
    data: db
  };
}

function validateImportData(raw){
  const parsed = JSON.parse(raw);
  const incoming = parsed && parsed.data ? parsed.data : parsed;

  if(!incoming || typeof incoming !== "object") throw new Error("備份格式錯誤");
  if(!Array.isArray(incoming.orders)) throw new Error("缺少工單資料");
  if(!Array.isArray(incoming.customers)) throw new Error("缺少客戶資料");
  if(incoming.catalog && !Array.isArray(incoming.catalog)) throw new Error("項目管理資料格式錯誤");

  return {
    orders: incoming.orders || [],
    customers: incoming.customers || [],
    catalog: incoming.catalog || PART_CATALOG.slice()
  };
}

function showBackupMessage(id,text){
  const el = document.getElementById(id);
  if(el) el.textContent = text;
}

$("#export").addEventListener("click",async()=>{
  const backup = makeBackupData();
  const t = JSON.stringify(backup, null, 2);
  try{
    await navigator.clipboard.writeText(t);
    showBackupMessage("backupMsg", "備份已複製，可貼到備忘錄或雲端保存。");
    alert("完整備份已複製");
  }catch{
    showBackupMessage("backupMsg", "無法自動複製，請手動複製彈窗內容。");
    prompt("複製完整備份", t);
  }
});
$("#import").addEventListener("click",()=>{
  try{
    const raw = $("#importBox").value.trim();
    if(!raw){
      alert("請先貼上備份資料");
      return;
    }

    const incoming = validateImportData(raw);

    if(!confirm("匯入會覆蓋目前所有資料，確定要匯入嗎？")){
      return;
    }

    db = incoming;
    if(Array.isArray(db.catalog)){
      PART_CATALOG = db.catalog;
    }

    localStorage.setItem(KEY, JSON.stringify(db));
    load();
    renderPartsUI();
    render();
    if(typeof renderItemManager === "function") renderItemManager();

    showBackupMessage("importMsg", "匯入完成。");
    alert("匯入完成");
  }catch(err){
    showBackupMessage("importMsg", "匯入失敗，原資料未覆蓋。");
    alert("匯入失敗：" + (err?.message || "格式錯誤"));
  }
});

function showPlateHistoryModal(){
  const plate = draft.plate || document.getElementById("showPlate")?.textContent || "";
  const key = normalizePlate(plate);
  const modal = document.getElementById("plateHistoryModal");
  const title = document.getElementById("plateHistoryTitle");
  const list = document.getElementById("plateHistoryList");
  if(!modal || !list) return;

  if(title) title.textContent = `${plate} 歷史維修`;

  const rows = db.orders.filter(o => normalizePlate(o.plate) === key);
  if(!rows.length){
    list.innerHTML = '<div class="history-empty">目前沒有這台車的歷史維修紀錄</div>';
  }else{
    list.innerHTML = rows.map(o => `
      <div class="history-row">
        <b>${esc(o.date)}｜${Number(o.km||0).toLocaleString("zh-TW")} KM</b>
        <div>${itemsHtml(o.items)}</div>
        <div class="muted" style="margin-top:6px">總額 ${money(o.amount)}｜已付 ${money(o.paid)}｜欠 ${money(remain(o))}</div>
      </div>
    `).join("");
  }

  modal.classList.remove("hide");
}
function closePlateHistoryModal(){
  document.getElementById("plateHistoryModal")?.classList.add("hide");
}
document.addEventListener("click", e => {
  if(e.target.closest("#plateHistoryBtn")){
    e.preventDefault();
    showPlateHistoryModal();
    return;
  }
  if(e.target.closest("#closePlateHistory")){
    e.preventDefault();
    closePlateHistoryModal();
    return;
  }
  if(e.target.id === "plateHistoryModal"){
    closePlateHistoryModal();
    return;
  }
}, true);


var editingOrderId = null;
var editItemsData = [];

function parseOrderItemsToEdit(order){
  const lines = String(order.items || "").split("\n").filter(Boolean);
  const items = [];
  const notes = [];

  lines.forEach(line => {
    const m = line.match(/^(.*?)\s+x(\d+)\s+\$(\d+)$/);
    if(m){
      const name = m[1].trim();
      const qty = Number(m[2] || 1);
      const subtotal = Number(m[3] || 0);
      const price = qty ? Math.round(subtotal / qty) : subtotal;
      items.push({name, price, qty});
    }else{
      notes.push(line);
    }
  });

  if(!items.length && order.items){
    notes.push(order.items);
  }

  return {items, note: notes.join("\n")};
}

function editPartsSubtotal(){
  return editItemsData.reduce((s,p)=>s + Number(p.price||0) * Math.max(1, Number(p.qty||1)), 0);
}

function updateEditTotals(){
  const parts = editPartsSubtotal();
  const labor = Number(document.getElementById("editLaborCost")?.value || 0);
  const paid = Number(document.getElementById("editPaidAmount")?.value || 0);
  const grand = parts + labor;
  const remain = Math.max(0, grand - paid);

  const pt = document.getElementById("editPartsTotal");
  const gt = document.getElementById("editGrandTotal");
  const rt = document.getElementById("editRemainTotal");
  if(pt) pt.textContent = money(parts);
  if(gt) gt.textContent = money(grand);
  if(rt) rt.textContent = money(remain);
}

function renderEditItems(){
  const list = document.getElementById("editItemsList");
  if(!list) return;

  list.innerHTML = editItemsData.map((p,i)=>`
    <div class="edit-row">
      <div class="edit-row-top">
        <input class="edit-row-name" data-index="${i}" value="${esc(p.name)}" placeholder="品名">
        <div class="edit-row-subtotal" data-index="${i}">${money(Number(p.price||0)*Math.max(1,Number(p.qty||1)))}</div>
      </div>
      <div class="edit-controls">
        <div><label>單價</label><input class="edit-price" data-index="${i}" type="number" min="0" value="${Number(p.price||0)}"></div>
        <div><label>數量</label><input class="edit-qty" data-index="${i}" type="number" min="1" value="${Number(p.qty||1)}"></div>
        <button type="button" class="edit-remove" data-index="${i}">×</button>
      </div>
    </div>
  `).join("");

  updateEditTotals();
}

function updateEditRowSubtotal(i){
  const el = document.querySelector(`.edit-row-subtotal[data-index="${i}"]`);
  if(el && editItemsData[i]){
    el.textContent = money(Number(editItemsData[i].price||0)*Math.max(1,Number(editItemsData[i].qty||1)));
  }
  updateEditTotals();
}

function openEditOrder(id){
  const order = db.orders.find(o => o.id === id);
  if(!order) return;

  editingOrderId = id;
  const parsed = parseOrderItemsToEdit(order);
  editItemsData = parsed.items;

  document.getElementById("editOrderInfo").textContent = `${order.plate}｜${order.name||""}｜${order.date||""}`;
  document.getElementById("editNote").value = parsed.note || "";
  document.getElementById("editLaborCost").value = Number(order.laborCost || 0);
  document.getElementById("editPaidAmount").value = Number(order.paid || 0);

  renderEditItems();
  document.getElementById("editOrderModal").classList.remove("hide");
}

function closeEditOrder(){
  editingOrderId = null;
  editItemsData = [];
  document.getElementById("editOrderModal")?.classList.add("hide");
}

function saveEditOrderNow(){
  const order = db.orders.find(o => o.id === editingOrderId);
  if(!order) return;

  const parts = editPartsSubtotal();
  const labor = Number(document.getElementById("editLaborCost")?.value || 0);
  const paid = Number(document.getElementById("editPaidAmount")?.value || 0);
  const note = document.getElementById("editNote")?.value || "";

  const partsText = editItemsData
    .filter(p => String(p.name||"").trim())
    .map(p => {
      const qty = Math.max(1, Number(p.qty || 1));
      const subtotal = Number(p.price || 0) * qty;
      return `${p.name} x${qty} $${subtotal}`;
    })
    .join("\n");

  order.items = [partsText, note].filter(Boolean).join("\n");
  order.laborCost = labor;
  order.amount = parts + labor;
  order.paid = paid;
  order.status = calcStatus(order);

  save();
  closeEditOrder();
  openPage("orders");
}

document.addEventListener("click", e => {
  const editBtn = e.target.closest(".editOrder");
  if(editBtn){
    e.preventDefault();
    openEditOrder(editBtn.dataset.id);
    return;
  }

  if(e.target.closest("#closeEditOrder")){
    e.preventDefault();
    closeEditOrder();
    return;
  }

  if(e.target.closest("#editAddItem")){
    e.preventDefault();
    editItemsData.push({name:"",price:0,qty:1});
    renderEditItems();
    return;
  }

  const rm = e.target.closest(".edit-remove");
  if(rm){
    e.preventDefault();
    editItemsData.splice(Number(rm.dataset.index),1);
    renderEditItems();
    return;
  }

  if(e.target.closest("#saveEditOrder")){
    e.preventDefault();
    saveEditOrderNow();
    return;
  }
}, true);

document.addEventListener("input", e => {
  const name = e.target.closest(".edit-row-name");
  if(name){
    const i = Number(name.dataset.index);
    if(editItemsData[i]) editItemsData[i].name = name.value;
    return;
  }

  const price = e.target.closest(".edit-price");
  if(price){
    const i = Number(price.dataset.index);
    if(editItemsData[i]){
      editItemsData[i].price = Number(price.value || 0);
      updateEditRowSubtotal(i);
    }
    return;
  }

  const qty = e.target.closest(".edit-qty");
  if(qty){
    const i = Number(qty.dataset.index);
    if(editItemsData[i]){
      editItemsData[i].qty = Math.max(1, Number(qty.value || 1));
      updateEditRowSubtotal(i);
    }
    return;
  }

  if(e.target.matches("#editLaborCost,#editPaidAmount")){
    updateEditTotals();
  }
}, true);


var editingCustomerId = null;

function openCustomerEdit(id){
  const c = db.customers.find(x => x.id === id);
  if(!c) return;

  editingCustomerId = id;

  document.getElementById("customerEditPlate").textContent = c.plate || "";
  document.getElementById("editCustomerName").value = c.name || "";
  document.getElementById("editCustomerPhone").value = c.phone || "";
  document.getElementById("editCustomerModel").value = c.model || "";
  document.getElementById("editCustomerYear").value = c.year || "";
  document.getElementById("editCustomerColor").value = c.color || "";

  document.getElementById("customerEditModal").classList.remove("hide");
}

function closeCustomerEdit(){
  editingCustomerId = null;
  document.getElementById("customerEditModal")?.classList.add("hide");
}

function saveCustomerEditNow(){
  const c = db.customers.find(x => x.id === editingCustomerId);
  if(!c) return;

  c.name = document.getElementById("editCustomerName").value.trim();
  c.phone = document.getElementById("editCustomerPhone").value.trim();
  c.model = document.getElementById("editCustomerModel").value.trim();
  c.year = document.getElementById("editCustomerYear").value.trim();
  c.color = document.getElementById("editCustomerColor").value.trim();

  save();
  closeCustomerEdit();
  openPage("customers");
}

document.addEventListener("click", e => {
  const editBtn = e.target.closest(".editCustomer");
  if(editBtn){
    e.preventDefault();
    openCustomerEdit(editBtn.dataset.id);
    return;
  }

  if(e.target.closest("#closeCustomerEdit")){
    e.preventDefault();
    closeCustomerEdit();
    return;
  }

  if(e.target.closest("#saveCustomerEdit")){
    e.preventDefault();
    saveCustomerEditNow();
    return;
  }

  if(e.target.id === "customerEditModal"){
    closeCustomerEdit();
    return;
  }
}, true);


function catalogCats(){
  return [...new Set(PART_CATALOG.map(p=>p.cat))];
}

function renderItemManager(){
  const select = document.getElementById("itemCatSelect");
  const list = document.getElementById("itemManagerList");
  if(!select || !list) return;

  const cats = catalogCats();

  select.innerHTML = cats.map(cat=>`<option value="${esc(cat)}">${esc(cat)}</option>`).join("");

  list.innerHTML = cats.map(cat=>{
    const items = PART_CATALOG.filter(p=>p.cat===cat);
    return `<div class="catalog-cat">
      <div class="catalog-cat-head">
        <h3>${esc(cat)}</h3>
        <button type="button" class="catalog-del deleteCat" data-cat="${esc(cat)}">刪除大項</button>
      </div>
      <div class="catalog-items">
        ${items.map((p,i)=>{
          const idx = PART_CATALOG.indexOf(p);
          return `<div class="catalog-item">
            <div class="catalog-item-row">
              <input class="catalog-name" data-index="${idx}" value="${esc(p.name)}" placeholder="小項名稱">
              <input class="catalog-price" data-index="${idx}" type="number" min="0" value="${Number(p.price||0)}" placeholder="價格">
              <button type="button" class="catalog-del deleteItem" data-index="${idx}">刪除</button>
            </div>
          </div>`;
        }).join("") || '<p class="muted">此大項目前沒有小項</p>'}
      </div>
    </div>`;
  }).join("") || '<p class="muted">目前沒有項目</p>';
}

function saveCatalog(){
  db.catalog = PART_CATALOG;
  localStorage.setItem(KEY, JSON.stringify(db));
  renderPartsUI();
  if(typeof renderEditQuickParts === "function") renderEditQuickParts();
  renderItemManager();
}

document.addEventListener("click", e=>{
  if(e.target.closest("#addCatBtn")){
    e.preventDefault();
    const name = document.getElementById("newCatName").value.trim();
    if(!name){alert("請輸入大項名稱");return;}
    if(catalogCats().includes(name)){alert("大項已存在");return;}
    PART_CATALOG.push({cat:name,name:"範例項目",price:0});
    activeCatalogCat=name;
    document.getElementById("newCatName").value="";
    saveCatalog();
    return;
  }

  if(e.target.closest("#addItemBtn")){
    e.preventDefault();
    const cat = document.getElementById("itemCatSelect").value;
    const name = document.getElementById("newItemName").value.trim();
    const price = Number(document.getElementById("newItemPrice").value||0);
    if(!cat){alert("請先新增或選擇大項");return;}
    if(!name){alert("請輸入小項名稱");return;}
    PART_CATALOG.push({cat,name,price});
    activeCatalogCat=cat;
    document.getElementById("newItemName").value="";
    document.getElementById("newItemPrice").value="";
    saveCatalog();
    return;
  }

  const delItem = e.target.closest(".deleteItem");
  if(delItem){
    e.preventDefault();
    const idx = Number(delItem.dataset.index);
    PART_CATALOG.splice(idx,1);
    saveCatalog();
    return;
  }

  const delCat = e.target.closest(".deleteCat");
  if(delCat){
    e.preventDefault();
    const cat = delCat.dataset.cat;
    if(!confirm(`確定刪除「${cat}」整個大項與底下小項嗎？`)) return;
    PART_CATALOG = PART_CATALOG.filter(p=>p.cat!==cat);
    activeCatalogCat = catalogCats()[0] || "";
    saveCatalog();
    return;
  }
},true);

document.addEventListener("input", e=>{
  const name = e.target.closest(".catalog-name");
  if(name){
    const idx=Number(name.dataset.index);
    if(PART_CATALOG[idx]){
      PART_CATALOG[idx].name=name.value;
      db.catalog=PART_CATALOG;
      localStorage.setItem(KEY,JSON.stringify(db));
      renderPartsUI();
    }
    return;
  }

  const price = e.target.closest(".catalog-price");
  if(price){
    const idx=Number(price.dataset.index);
    if(PART_CATALOG[idx]){
      PART_CATALOG[idx].price=Number(price.value||0);
      db.catalog=PART_CATALOG;
      localStorage.setItem(KEY,JSON.stringify(db));
      renderPartsUI();
    }
    return;
  }
},true);


document.addEventListener("change", e=>{
  if(e.target && e.target.id==="itemCatSelect"){
    activeCatalogCat = e.target.value;
    renderItemManager();
  }
}, true);

load();renderPartsUI();render();renderItemManager();

/* v10.2 final catalog override: must stay after all legacy catalog code */
var catalogPendingDeleteId = null;

function catalogEnsure(){
  if(!Array.isArray(PART_CATALOG)) PART_CATALOG = [];
  PART_CATALOG.forEach((p,i)=>{
    if(!p.id) p.id = "ci_" + Date.now().toString(36) + "_" + i + "_" + Math.random().toString(36).slice(2,7);
    if(p.sort === undefined || p.sort === null) p.sort = i + 1;
    if(p.price === undefined || p.price === null) p.price = 0;
    if(p.hidden === undefined) p.hidden = false;
    p.cat = String(p.cat || "未分類");
    p.name = String(p.name || "");
  });
  db.catalog = PART_CATALOG;
}

function catalogSave(){
  catalogEnsure();
  localStorage.setItem(KEY, JSON.stringify(db));
}

function catalogCats(){
  catalogEnsure();
  return [...new Set(PART_CATALOG.filter(p=>!p.hidden).map(p=>p.cat))];
}

function catalogVisibleItems(cat){
  catalogEnsure();
  return PART_CATALOG
    .filter(p=>p.cat===cat && !p.hidden)
    .slice()
    .sort((a,b)=>{
      const sa = Number(a.sort || 0);
      const sb = Number(b.sort || 0);
      if(sa !== sb) return sa - sb;
      return String(a.name||"").localeCompare(String(b.name||""), "zh-Hant");
    });
}

function catalogReindex(cat){
  catalogVisibleItems(cat).forEach((p,i)=>p.sort = i + 1);
  catalogSave();
}

function catalogRefreshAll(){
  catalogEnsure();
  renderPartsUI();
  if(typeof renderEditQuickParts === "function") renderEditQuickParts();
  renderItemManager();
}

function renderItemManager(){
  catalogEnsure();

  const select = document.getElementById("v10ItemCatSelect");
  const list = document.getElementById("itemManagerList");
  if(!select || !list) return;

  const cats = catalogCats();

  if(!activeCatalogCat || !cats.includes(activeCatalogCat)){
    activeCatalogCat = cats[0] || "";
  }

  select.innerHTML = cats.map(cat=>`<option value="${esc(cat)}" ${cat===activeCatalogCat?'selected':''}>${esc(cat)}</option>`).join("");

  if(!cats.length){
    list.innerHTML = '<p class="muted">目前沒有項目</p>';
    return;
  }

  const catButtons = cats.map(cat=>{
    const count = catalogVisibleItems(cat).length;
    return `<button type="button" class="catalog-v10-cat ${cat===activeCatalogCat?'active':''}" data-v10-cat="${esc(cat)}">
      <span>${esc(cat)}</span><span>${count} 項</span>
    </button>`;
  }).join("");

  const items = catalogVisibleItems(activeCatalogCat);
  const selectedStillExists = catalogPendingDeleteId && items.some(p=>p.id===catalogPendingDeleteId);
  const deleteText = selectedStillExists ? "確定刪除" : "刪除";

  const control = items.length ? `<div class="catalog-v10-box">
    <label>選擇小項排序／刪除</label>
    <div class="catalog-v10-control">
      <select id="catalogSelectedItem">
        ${items.map(p=>`<option value="${esc(p.id)}" ${p.id===catalogPendingDeleteId?'selected':''}>${esc(p.name)}｜${Number(p.price||0).toLocaleString("zh-TW")}</option>`).join("")}
      </select>
      <button type="button" id="catalogMoveUp" class="secondary">上移</button>
      <button type="button" id="catalogMoveDown" class="secondary">下移</button>
      <button type="button" id="catalogDeleteItem" class="danger">${deleteText}</button>
    </div>
  </div>` : "";

  const body = `<div class="catalog-v10-box">
    <h3>${esc(activeCatalogCat)}</h3>
    <div class="catalog-v10-list">
      ${items.map(p=>`
        <div class="catalog-v10-row">
          <div class="catalog-v10-grid">
            <input class="catalogV10Name" data-id="${esc(p.id)}" value="${esc(p.name)}" placeholder="小項名稱">
            <input class="catalogV10Price" data-id="${esc(p.id)}" type="number" min="0" value="${Number(p.price||0)}" placeholder="價格">
          </div>
          <div class="catalog-v10-muted">排序：${Number(p.sort||0)}${p.id===catalogPendingDeleteId?'｜等待確認刪除':''}</div>
        </div>
      `).join("") || '<p class="muted">此大項目前沒有小項</p>'}
    </div>
  </div>`;

  list.innerHTML = `<div class="catalog-v10-cats">${catButtons}</div>${control}${body}`;
}

function catalogFindSelected(){
  const id = document.getElementById("catalogSelectedItem")?.value;
  return id ? PART_CATALOG.find(p=>p.id===id) : null;
}

function catalogMoveSelected(direction){
  const item = catalogFindSelected();
  if(!item) return;

  catalogPendingDeleteId = null;

  const rows = catalogVisibleItems(item.cat);
  const pos = rows.findIndex(p=>p.id===item.id);
  const target = pos + direction;
  if(pos < 0 || target < 0 || target >= rows.length) return;

  const a = rows[pos];
  const b = rows[target];
  const temp = a.sort;
  a.sort = b.sort;
  b.sort = temp;

  catalogReindex(item.cat);
  catalogRefreshAll();

  const newSelect = document.getElementById("catalogSelectedItem");
  if(newSelect) newSelect.value = item.id;
}

function catalogDeleteSelectedTwoStep(){
  const item = catalogFindSelected();
  if(!item) return;

  if(catalogPendingDeleteId !== item.id){
    catalogPendingDeleteId = item.id;
    renderItemManager();
    const sel = document.getElementById("catalogSelectedItem");
    if(sel) sel.value = item.id;
    return;
  }

  const oldCat = item.cat;
  PART_CATALOG = PART_CATALOG.filter(p=>p.id!==item.id);
  catalogPendingDeleteId = null;

  if(catalogVisibleItems(oldCat).length){
    activeCatalogCat = oldCat;
  }else{
    activeCatalogCat = catalogCats()[0] || "";
  }

  catalogReindex(oldCat);
  catalogRefreshAll();
}

function catalogAddCategory(){
  const input = document.getElementById("v10NewCatName");
  const name = input?.value.trim();
  if(!name){ alert("請輸入大項名稱"); return; }
  if(catalogCats().includes(name)){ alert("大項已存在"); return; }

  PART_CATALOG.push({id:uid(), cat:name, name:"範例項目", price:0, sort:1, hidden:false});
  activeCatalogCat = name;
  catalogPendingDeleteId = null;
  if(input) input.value = "";
  catalogRefreshAll();
}

function catalogAddItem(){
  const cat = document.getElementById("v10ItemCatSelect")?.value || activeCatalogCat;
  const nameInput = document.getElementById("v10NewItemName");
  const priceInput = document.getElementById("v10NewItemPrice");
  const name = nameInput?.value.trim();
  const price = Number(priceInput?.value || 0);

  if(!cat){ alert("請先新增或選擇大項"); return; }
  if(!name){ alert("請輸入小項名稱"); return; }

  PART_CATALOG.push({id:uid(), cat, name, price, sort:catalogVisibleItems(cat).length+1, hidden:false});
  activeCatalogCat = cat;
  catalogPendingDeleteId = null;
  if(nameInput) nameInput.value = "";
  if(priceInput) priceInput.value = "";
  catalogRefreshAll();
}

document.addEventListener("click", e=>{
  const catBtn = e.target.closest("[data-v10-cat]");
  if(catBtn){
    e.preventDefault();
    catalogPendingDeleteId = null;
    activeCatalogCat = catBtn.dataset.v10Cat;
    renderItemManager();
    return;
  }

  if(e.target.closest("#v10AddCatBtn")){
    e.preventDefault();
    catalogAddCategory();
    return;
  }

  if(e.target.closest("#v10AddItemBtn")){
    e.preventDefault();
    catalogAddItem();
    return;
  }

  if(e.target.closest("#catalogMoveUp")){
    e.preventDefault();
    catalogMoveSelected(-1);
    return;
  }

  if(e.target.closest("#catalogMoveDown")){
    e.preventDefault();
    catalogMoveSelected(1);
    return;
  }

  if(e.target.closest("#catalogDeleteItem")){
    e.preventDefault();
    catalogDeleteSelectedTwoStep();
    return;
  }
}, true);

document.addEventListener("change", e=>{
  if(e.target && e.target.id==="v10ItemCatSelect"){
    catalogPendingDeleteId = null;
    activeCatalogCat = e.target.value;
    renderItemManager();
  }

  if(e.target && e.target.id==="catalogSelectedItem"){
    catalogPendingDeleteId = null;
    const chosen = e.target.value;
    renderItemManager();
    const sel = document.getElementById("catalogSelectedItem");
    if(sel) sel.value = chosen;
  }
}, true);

document.addEventListener("input", e=>{
  const name = e.target.closest(".catalogV10Name");
  if(name){
    const item = PART_CATALOG.find(p=>p.id===name.dataset.id);
    if(item){
      item.name = name.value;
      catalogSave();
      renderPartsUI();
      if(typeof renderEditQuickParts === "function") renderEditQuickParts();
    }
    return;
  }

  const price = e.target.closest(".catalogV10Price");
  if(price){
    const item = PART_CATALOG.find(p=>p.id===price.dataset.id);
    if(item){
      item.price = Number(price.value || 0);
      catalogSave();
      renderPartsUI();
      if(typeof renderEditQuickParts === "function") renderEditQuickParts();
    }
    return;
  }
}, true);


(function(){
  const oldOpenPage = window.openPage;
  if(typeof oldOpenPage === "function" && !window.__openPageGuarded){
    window.__openPageGuarded = true;
    window.openPage = function(page){
      try{
        if(!document.getElementById(page)) page = "receive";
        return oldOpenPage(page);
      }catch(err){
        console.error(err);
      }
    };
  }
})();

/* v7.7 hard mount: three pages do not use old sections/render/openPage */
(function(){
  function getKey(){
    try{ if(typeof KEY !== "undefined") return KEY; }catch{}
    return "shaochi_v62_data";
  }

  const DATA_KEY = getKey();

  function q(s){return document.querySelector(s);}
  function qa(s){return Array.from(document.querySelectorAll(s));}
  function esc2(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}
  function money2(n){return "$"+Number(n||0).toLocaleString("zh-TW");}
  function normalizePlate2(v){return String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7);}
  function formatPlate2(v){
    const raw=normalizePlate2(v);
    if(raw.length===6 || raw.length===7) return raw.slice(0,3)+"-"+raw.slice(3);
    return raw;
  }

  function readDb(){
    try{
      const raw=localStorage.getItem(DATA_KEY);
      const data=raw?JSON.parse(raw):{orders:[],customers:[]};
      if(!Array.isArray(data.orders)) data.orders=[];
      if(!Array.isArray(data.customers)) data.customers=[];
      return data;
    }catch(err){
      return {orders:[],customers:[],error:String(err)};
    }
  }

  function writeDb(data){
    localStorage.setItem(DATA_KEY,JSON.stringify(data));
    try{ db=data; }catch{}
  }

  function itemsHtml2(items){
    if(Array.isArray(items)){
      return items.map(x=>`<div>${esc2(x.name||"")} x${Number(x.qty||1)} $${Number(x.price||0).toLocaleString("zh-TW")}</div>`).join("");
    }
    return String(items||"").split("\\n").filter(Boolean).map(x=>`<div>${esc2(x)}</div>`).join("") || '<div class="muted">無項目</div>';
  }

  function customerRows(){
    const data=readDb();
    const rows=[];
    const seen=new Set();

    data.customers.forEach(c=>{
      if(!c) return;
      const key=normalizePlate2(c.plate)||String(c.id||"");
      if(seen.has(key)) return;
      seen.add(key);
      rows.push({
        plate:formatPlate2(c.plate||""),
        name:c.name||"",
        phone:c.phone||"",
        model:c.model||"",
        year:c.year||"",
        color:c.color||"",
        km:Number(c.km||0),
        source:"客戶資料"
      });
    });

    data.orders.forEach(o=>{
      if(!o) return;
      const key=normalizePlate2(o.plate);
      if(!key || seen.has(key)) return;
      seen.add(key);
      rows.push({
        plate:formatPlate2(o.plate||""),
        name:o.name||"",
        phone:o.phone||"",
        model:o.model||"",
        year:o.year||"",
        color:o.color||"",
        km:Number(o.km||0),
        source:"工單紀錄"
      });
    });

    return {data,rows};
  }

  function hideOldPages(){
    qa(".page").forEach(p=>p.classList.remove("active"));
    const mount=q("#threePageMount");
    if(mount){
      mount.classList.remove("hide");
      mount.classList.add("show");
      mount.style.display="block";
    }
  }

  function showNormalPages(){
    const mount=q("#threePageMount");
    if(mount){
      mount.classList.remove("show");
      mount.classList.add("hide");
      mount.style.display="none";
    }
  }

  function setTitle(page){
    const titles={customers:"客戶車輛",history:"歷史維修",money:"營收備份"};
    const title=q("#title");
    if(title) title.textContent=titles[page] || page;
    qa(".side button[data-page]").forEach(b=>b.classList.toggle("active", b.dataset.page===page));
    q("#side")?.classList.remove("open");
    q("#overlay")?.classList.remove("show");
    window.scrollTo(0,0);
  }

  function mountCustomers(){
    hideOldPages();
    setTitle("customers");
    const box=q("#threePageContent");
    const {data,rows}=customerRows();

    box.innerHTML=`
      <div class="card">
        <h2>客戶車輛</h2>
        <div class="three-stat">目前讀到：工單 ${data.orders.length} 筆｜客戶 ${data.customers.length} 筆｜可顯示車輛 ${rows.length} 筆</div>
        <div id="mountedCustomerList"></div>
      </div>
    `;

    const list=q("#mountedCustomerList");
    if(!rows.length){
      list.innerHTML='<div class="three-card"><h3>沒有可顯示的客戶車輛</h3><div class="three-meta">本機資料沒有客戶資料，也沒有可從工單補出的車牌。</div></div>';
      return;
    }

    list.innerHTML=rows.map(c=>`
      <div class="three-card">
        <h3>${esc2(c.plate||"未填車牌")}｜${esc2(c.name||"未填姓名")}</h3>
        <div class="three-meta">
          電話：${esc2(c.phone||"未填")}<br>
          車種：${esc2(c.model||"未填")}｜年份：${esc2(c.year||"未填")}｜顏色：${esc2(c.color||"未填")}<br>
        </div>
        <div class="three-actions">
          <button type="button" class="secondary mountedHist" data-plate="${esc2(c.plate)}">歷史維修</button>
        </div>
      </div>
    `).join("");
  }

  function mountHistory(plate){
    hideOldPages();
    setTitle("history");
    const data=readDb();
    const currentPlate=plate || "";
    const key=normalizePlate2(currentPlate);

    const box=q("#threePageContent");
    box.innerHTML=`
      <div class="card">
        <h2>歷史維修</h2>
        <div class="three-stat">目前讀到：工單 ${data.orders.length} 筆</div>
        <div class="row">
          <input id="mountedHistoryPlate" placeholder="輸入車牌，例如 NMY6671" value="${esc2(formatPlate2(currentPlate))}">
          <button id="mountedHistoryBtn" type="button">查詢</button>
        </div>
        <div id="mountedHistoryList"></div>
      </div>
    `;

    renderMountedHistoryList(key);
  }

  function renderMountedHistoryList(key){
    const data=readDb();
    const list=q("#mountedHistoryList");
    if(!list) return;

    if(!key){
      list.innerHTML='<p class="muted">請輸入車牌查詢</p>';
      return;
    }

    const rows=data.orders.filter(o=>normalizePlate2(o.plate)===key);
    if(!rows.length){
      list.innerHTML='<p class="muted">查無歷史維修</p>';
      return;
    }

    list.innerHTML=rows.map(o=>`
      <div class="three-card">
        <h3>${esc2(o.date||"")}｜${Number(o.km||0).toLocaleString("zh-TW")} KM</h3>
        <div>${itemsHtml2(o.items)}</div>
        <div class="three-meta" style="margin-top:8px">
          總額 ${money2(o.amount)}｜已付 ${money2(o.paid)}｜欠 ${money2(Number(o.amount||0)-Number(o.paid||0))}
        </div>
      </div>
    `).join("");
  }

  function mountMoney(){
    hideOldPages();
    setTitle("money");
    const data=readDb();
    const formal=data.orders.filter(o=>o.type!=="估價單");
    const quotes=data.orders.filter(o=>o.type==="估價單");
    const rev=formal.reduce((s,o)=>s+Number(o.paid||0),0);

    const box=q("#threePageContent");
    box.innerHTML=`
      <div class="card">
        <h2>營收備份</h2>
        <p class="muted">估價單不列入營收。</p>
        <div class="three-stat">目前讀到：正式工單 ${formal.length} 筆｜估價單 ${quotes.length} 筆｜總工單 ${data.orders.length} 筆</div>
        <div class="three-money">${money2(rev)}</div>
        <div class="muted">未付/欠款 ${formal.filter(o=>o.status==="未付款"||o.status==="欠款").length}｜已付款 ${formal.filter(o=>o.status==="已付款").length}</div>
      </div>
      <div class="card">
        <h2>備份 / 匯入</h2>
        <button id="mountedExport" type="button">複製備份</button>
        <textarea id="mountedImportBox" placeholder="貼上備份 JSON"></textarea>
        <button id="mountedImport" class="secondary" type="button">匯入</button>
      </div>
    `;
  }

  function hardOpen(page){
    if(page==="customers"){mountCustomers();return true;}
    if(page==="history"){mountHistory();return true;}
    if(page==="money"){mountMoney();return true;}
    showNormalPages();
    return false;
  }

  // Replace nav buttons for only these three pages
  qa('.side button[data-page="customers"], .side button[data-page="history"], .side button[data-page="money"]').forEach(btn=>{
    const clone=btn.cloneNode(true);
    btn.parentNode.replaceChild(clone,btn);
    clone.addEventListener("click",e=>{
      e.preventDefault();
      hardOpen(clone.dataset.page);
    });
  });

  document.addEventListener("click",e=>{
    const h=e.target.closest(".mountedHist,.hist");
    if(h){
      e.preventDefault();
      mountHistory(h.dataset.plate||"");
      return;
    }

    if(e.target.closest("#mountedHistoryBtn")){
      e.preventDefault();
      const input=q("#mountedHistoryPlate");
      const raw=normalizePlate2(input?.value||"");
      if(input) input.value=formatPlate2(raw);
      renderMountedHistoryList(raw);
      return;
    }

    if(e.target.closest("#mountedExport")){
      e.preventDefault();
      const text=JSON.stringify(readDb(),null,2);
      navigator.clipboard?.writeText(text).then(()=>alert("已複製備份")).catch(()=>prompt("複製備份",text));
      return;
    }

    if(e.target.closest("#mountedImport")){
      e.preventDefault();
      try{
        const incoming=JSON.parse(q("#mountedImportBox")?.value||"");
        const data=incoming && incoming.data ? incoming.data : incoming;
        if(!data || typeof data!=="object") throw new Error("格式錯誤");
        if(!Array.isArray(data.orders)) data.orders=[];
        if(!Array.isArray(data.customers)) data.customers=[];
        if(confirm("匯入會覆蓋目前資料，確定匯入？")){
          writeDb(data);
          mountMoney();
          alert("匯入完成");
        }
      }catch(err){
        alert("匯入失敗："+(err.message||"格式錯誤"));
      }
    }
  },true);

  document.addEventListener("input",e=>{
    if(e.target && e.target.id==="mountedHistoryPlate"){
      const raw=normalizePlate2(e.target.value);
      if(raw.length===6 || raw.length===7) e.target.value=formatPlate2(raw);
    }
  },true);

  window.mountCustomers=mountCustomers;
  window.mountHistory=mountHistory;
  window.mountMoney=mountMoney;
})();

/* v7.8 fix: hide mounted three-page area when returning to normal pages */
(function(){
  function q(s){return document.querySelector(s);}
  function qa(s){return Array.from(document.querySelectorAll(s));}

  const normalTitles = {
    receive:"接車建單",
    orders:"工單管理",
    quotes:"估價單管理",
    items:"項目管理",
    history:"歷史維修",
    customers:"客戶車輛",
    money:"營收備份"
  };

  function hideThreeMount(){
    const mount = q("#threePageMount");
    const content = q("#threePageContent");
    if(mount){
      mount.classList.remove("show");
      mount.classList.add("hide");
      mount.style.display = "none";
    }
    if(content) content.innerHTML = "";
  }

  function openNormalPage(page){
    hideThreeMount();

    qa(".page").forEach(p=>{
      const on = p.id === page;
      p.classList.toggle("active", on);
      p.style.display = on ? "block" : "none";
    });

    qa(".side button[data-page]").forEach(b=>b.classList.toggle("active", b.dataset.page === page));

    const title = q("#title");
    if(title) title.textContent = normalTitles[page] || page;

    q("#side")?.classList.remove("open");
    q("#overlay")?.classList.remove("show");

    try{
      if(typeof render === "function") render();
    }catch(err){
      console.warn("normal render skipped", err);
    }

    // render() may reset visibility, so enforce page again.
    qa(".page").forEach(p=>{
      const on = p.id === page;
      p.classList.toggle("active", on);
      p.style.display = on ? "block" : "none";
    });

    window.scrollTo(0,0);
  }

  function openThreePage(page){
    hideThreeMount();
    if(page === "customers" && typeof window.mountCustomers === "function"){
      window.mountCustomers();
      return;
    }
    if(page === "history" && typeof window.mountHistory === "function"){
      window.mountHistory();
      return;
    }
    if(page === "money" && typeof window.mountMoney === "function"){
      window.mountMoney();
      return;
    }
  }

  // Replace ALL sidebar page buttons, not only the three mounted pages.
  qa(".side button[data-page]").forEach(btn=>{
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);

    clone.addEventListener("click", e=>{
      e.preventDefault();

      const page = clone.dataset.page;
      if(page === "customers" || page === "history" || page === "money"){
        openThreePage(page);
      }else{
        openNormalPage(page);
      }
    });
  });

  // If normal page is opened by other code, expose safe function.
  window.openNormalPageV78 = openNormalPage;
  window.hideThreeMountV78 = hideThreeMount;
})();

/* v7.9 fix: when opening the 3 mounted pages, force-hide all old page sections */
(function(){
  function q(s){return document.querySelector(s);}
  function qa(s){return Array.from(document.querySelectorAll(s));}

  function forceHideOldSections(){
    qa(".page").forEach(p=>{
      p.classList.remove("active");
      p.style.display = "none";
    });

    // Extra cleanup: old merge notice should never show in mounted pages.
    qa(".merge-notice").forEach(el=>el.remove());
  }

  function showMountOnly(){
    forceHideOldSections();

    const mount = q("#threePageMount");
    if(mount){
      mount.classList.remove("hide");
      mount.classList.add("show");
      mount.style.display = "block";
    }
  }

  function openMounted(page){
    showMountOnly();

    if(page === "customers" && typeof window.mountCustomers === "function"){
      window.mountCustomers();
      forceHideOldSections();
      q("#threePageMount")?.classList.add("show");
      q("#threePageMount").style.display = "block";
      return;
    }

    if(page === "history" && typeof window.mountHistory === "function"){
      window.mountHistory();
      forceHideOldSections();
      q("#threePageMount")?.classList.add("show");
      q("#threePageMount").style.display = "block";
      return;
    }

    if(page === "money" && typeof window.mountMoney === "function"){
      window.mountMoney();
      forceHideOldSections();
      q("#threePageMount")?.classList.add("show");
      q("#threePageMount").style.display = "block";
      return;
    }
  }

  function hideMount(){
    const mount = q("#threePageMount");
    const content = q("#threePageContent");
    if(mount){
      mount.classList.remove("show");
      mount.classList.add("hide");
      mount.style.display = "none";
    }
    if(content) content.innerHTML = "";
  }

  function openNormal(page){
    hideMount();

    qa(".page").forEach(p=>{
      const on = p.id === page;
      p.classList.toggle("active", on);
      p.style.display = on ? "block" : "none";
    });

    qa(".side button[data-page]").forEach(b=>b.classList.toggle("active", b.dataset.page === page));

    const titles = {
      receive:"接車建單",
      orders:"工單管理",
      quotes:"估價單管理",
      items:"項目管理",
      history:"歷史維修",
      customers:"客戶車輛",
      money:"營收備份"
    };
    const title = q("#title");
    if(title) title.textContent = titles[page] || page;

    q("#side")?.classList.remove("open");
    q("#overlay")?.classList.remove("show");

    try{
      if(typeof render === "function") render();
    }catch(err){
      console.warn("render skipped", err);
    }

    // render() may change page states, enforce one more time.
    qa(".page").forEach(p=>{
      const on = p.id === page;
      p.classList.toggle("active", on);
      p.style.display = on ? "block" : "none";
    });

    window.scrollTo(0,0);
  }

  // Replace sidebar handlers again, after v7.7/v7.8 scripts.
  qa(".side button[data-page]").forEach(btn=>{
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);

    clone.addEventListener("click", e=>{
      e.preventDefault();
      const page = clone.dataset.page;

      if(page === "customers" || page === "history" || page === "money"){
        openMounted(page);
      }else{
        openNormal(page);
      }
    });
  });

  window.openMountedPageV79 = openMounted;
  window.openNormalPageV79 = openNormal;
})();

/* v8.0 fix: quote/order save page state mismatch */
(function(){
  function q(s){return document.querySelector(s);}
  function qa(s){return Array.from(document.querySelectorAll(s));}

  const titles = {
    receive:"接車建單",
    orders:"工單管理",
    quotes:"估價單管理",
    items:"項目管理",
    history:"歷史維修",
    customers:"客戶車輛",
    money:"營收備份"
  };

  function hideThreeMount(){
    const mount = q("#threePageMount");
    const content = q("#threePageContent");
    if(mount){
      mount.classList.remove("show");
      mount.classList.add("hide");
      mount.style.display = "none";
    }
    if(content) content.innerHTML = "";
  }

  function forceOpenNormalPage(page){
    hideThreeMount();

    qa(".page").forEach(p=>{
      const on = p.id === page;
      p.classList.toggle("active", on);
      p.style.display = on ? "block" : "none";
    });

    qa(".side button[data-page]").forEach(b=>b.classList.toggle("active", b.dataset.page === page));

    const title = q("#title");
    if(title) title.textContent = titles[page] || page;

    q("#side")?.classList.remove("open");
    q("#overlay")?.classList.remove("show");

    try{
      if(typeof render === "function") render();
    }catch(err){
      console.warn("render skipped in v8.0 page fix", err);
    }

    // render() may change visible page again, enforce after render.
    qa(".page").forEach(p=>{
      const on = p.id === page;
      p.classList.toggle("active", on);
      p.style.display = on ? "block" : "none";
    });

    window.scrollTo(0,0);
  }

  window.forceOpenNormalPageV80 = forceOpenNormalPage;

  // Watch for successful quote/order creation. If title says quotes/orders but receive is still visible, fix it.
  function repairMismatch(){
    const title = q("#title")?.textContent || "";
    const receive = q("#receive");
    const quotes = q("#quotes");
    const orders = q("#orders");

    const receiveVisible = receive && (receive.classList.contains("active") || receive.style.display === "block");

    if(title.includes("估價單") && receiveVisible && quotes){
      forceOpenNormalPage("quotes");
      return;
    }

    if(title.includes("工單管理") && receiveVisible && orders){
      forceOpenNormalPage("orders");
      return;
    }
  }

  // Capture clicks on likely save buttons, then repair after original handlers finish.
  document.addEventListener("click", function(e){
    const txt = (e.target && e.target.textContent || "").trim();
    if(txt.includes("估價單") || txt.includes("正式工單") || txt.includes("建檔") || txt.includes("結單")){
      setTimeout(repairMismatch, 80);
      setTimeout(repairMismatch, 250);
    }
  }, true);

  document.addEventListener("submit", function(){
    setTimeout(repairMismatch, 80);
    setTimeout(repairMismatch, 250);
  }, true);

  // Also override normal page helper from v7.9 if it exists.
  setTimeout(()=>{
    window.openNormalPageV78 = forceOpenNormalPage;
    window.openNormalPageV79 = forceOpenNormalPage;
  },0);
})();

/* v8.1 fix: quote convert to formal order page mismatch */
(function(){
  function q(s){return document.querySelector(s);}
  function qa(s){return Array.from(document.querySelectorAll(s));}

  const titles = {
    receive:"接車建單",
    orders:"工單管理",
    quotes:"估價單管理",
    items:"項目管理",
    history:"歷史維修",
    customers:"客戶車輛",
    money:"營收備份"
  };

  function hideThreeMount(){
    const mount = q("#threePageMount");
    const content = q("#threePageContent");
    if(mount){
      mount.classList.remove("show");
      mount.classList.add("hide");
      mount.style.display = "none";
    }
    if(content) content.innerHTML = "";
  }

  function forceOpenPage(page){
    hideThreeMount();

    qa(".page").forEach(p=>{
      const on = p.id === page;
      p.classList.toggle("active", on);
      p.style.display = on ? "block" : "none";
    });

    qa(".side button[data-page]").forEach(b=>b.classList.toggle("active", b.dataset.page === page));

    const title = q("#title");
    if(title) title.textContent = titles[page] || page;

    q("#side")?.classList.remove("open");
    q("#overlay")?.classList.remove("show");

    try{
      if(typeof render === "function") render();
    }catch(err){
      console.warn("render skipped in v8.1", err);
    }

    // render may re-activate old page, enforce again.
    qa(".page").forEach(p=>{
      const on = p.id === page;
      p.classList.toggle("active", on);
      p.style.display = on ? "block" : "none";
    });

    window.scrollTo(0,0);
  }

  window.forceOpenPageV81 = forceOpenPage;

  function repairAfterQuoteConvert(){
    // If a quote convert button was used, final destination must be orders.
    forceOpenPage("orders");
  }

  function repairGeneralMismatch(){
    const title = q("#title")?.textContent || "";
    const receive = q("#receive");
    const quotes = q("#quotes");
    const orders = q("#orders");

    const receiveVisible = receive && (receive.classList.contains("active") || receive.style.display === "block");
    const quotesVisible = quotes && (quotes.classList.contains("active") || quotes.style.display === "block");

    if(title.includes("工單管理") && (receiveVisible || quotesVisible) && orders){
      forceOpenPage("orders");
      return;
    }

    if(title.includes("估價單") && receiveVisible && quotes){
      forceOpenPage("quotes");
      return;
    }
  }

  document.addEventListener("click", function(e){
    const btn = e.target.closest("button");
    if(!btn) return;

    const txt = (btn.textContent || "").trim();
    const cls = btn.className || "";

    // 估價單轉正式工單按鈕常見：確認轉工單 / 轉正式工單 / quoteConfirmConvert
    if(
      btn.classList.contains("quoteConfirmConvert") ||
      txt.includes("確認轉工單") ||
      txt.includes("轉正式") ||
      txt.includes("轉工單")
    ){
      setTimeout(repairAfterQuoteConvert, 80);
      setTimeout(repairAfterQuoteConvert, 250);
      setTimeout(repairAfterQuoteConvert, 600);
      return;
    }

    // General save/build protection from v8.0, keep it active too.
    if(txt.includes("估價單") || txt.includes("正式工單") || txt.includes("建檔") || txt.includes("結單")){
      setTimeout(repairGeneralMismatch, 80);
      setTimeout(repairGeneralMismatch, 250);
    }
  }, true);

  document.addEventListener("submit", function(){
    setTimeout(repairGeneralMismatch, 80);
    setTimeout(repairGeneralMismatch, 250);
  }, true);

  setTimeout(()=>{
    window.openNormalPageV78 = forceOpenPage;
    window.openNormalPageV79 = forceOpenPage;
    window.forceOpenNormalPageV80 = forceOpenPage;
  },0);
})();

/* v8.2 fix:
   1) create estimate/order build button page mismatch
   2) mounted customer page edit/delete buttons and handlers
*/
(function(){
  function q(s){return document.querySelector(s);}
  function qa(s){return Array.from(document.querySelectorAll(s));}

  function getKey(){
    try{ if(typeof KEY !== "undefined") return KEY; }catch{}
    return "shaochi_v62_data";
  }
  const DATA_KEY = getKey();

  function esc2(s){
    try{ if(typeof esc==="function") return esc(s); }catch{}
    return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
  }
  function money2(n){
    try{ if(typeof money==="function") return money(n); }catch{}
    return "$"+Number(n||0).toLocaleString("zh-TW");
  }
  function normalizePlate2(v){
    try{ if(typeof normalizePlate==="function") return normalizePlate(v||""); }catch{}
    return String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7);
  }
  function formatPlate2(v){
    try{ if(typeof formatPlate==="function") return formatPlate(v||""); }catch{}
    const raw=normalizePlate2(v);
    if(raw.length===6 || raw.length===7) return raw.slice(0,3)+"-"+raw.slice(3);
    return raw;
  }

  function readDb(){
    try{
      const raw=localStorage.getItem(DATA_KEY);
      const data=raw?JSON.parse(raw):{orders:[],customers:[]};
      if(!Array.isArray(data.orders)) data.orders=[];
      if(!Array.isArray(data.customers)) data.customers=[];
      return data;
    }catch(err){
      return {orders:[],customers:[]};
    }
  }

  function writeDb(data){
    localStorage.setItem(DATA_KEY,JSON.stringify(data));
    try{ db=data; }catch{}
  }

  function hideThreeMount(){
    const mount=q("#threePageMount");
    const content=q("#threePageContent");
    if(mount){
      mount.classList.remove("show");
      mount.classList.add("hide");
      mount.style.display="none";
    }
    if(content) content.innerHTML="";
  }

  function forceOpenPage(page){
    hideThreeMount();

    qa(".page").forEach(p=>{
      const on=p.id===page;
      p.classList.toggle("active",on);
      p.style.display=on?"block":"none";
    });

    qa(".side button[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));

    const titles={receive:"接車建單",orders:"工單管理",quotes:"估價單管理",items:"項目管理",history:"歷史維修",customers:"客戶車輛",money:"營收備份"};
    const title=q("#title");
    if(title) title.textContent=titles[page]||page;

    q("#side")?.classList.remove("open");
    q("#overlay")?.classList.remove("show");

    try{ if(typeof render==="function") render(); }catch(err){ console.warn("render skipped v8.2",err); }

    // render() 可能又把接車頁打開，所以再強制一次
    qa(".page").forEach(p=>{
      const on=p.id===page;
      p.classList.toggle("active",on);
      p.style.display=on?"block":"none";
    });

    window.scrollTo(0,0);
  }

  // 建立工單 / 估價單後，用新增筆數判斷是否真的成功，成功才跳頁，避免驗證失敗也跳頁。
  const createBtn=q("#createOrderBtn");
  if(createBtn && !createBtn.dataset.v82Bound){
    createBtn.dataset.v82Bound="1";
    createBtn.addEventListener("click",()=>{
      const before=readDb().orders.length;
      const target=(q("#orderType")?.value==="估價單") ? "quotes" : "orders";

      function checkAndOpen(){
        const after=readDb().orders.length;
        if(after>before){
          forceOpenPage(target);
        }
      }

      setTimeout(checkAndOpen,120);
      setTimeout(checkAndOpen,350);
      setTimeout(checkAndOpen,800);
    },true);
  }

  // 重新做 mounted 客戶車輛，加入 修改 / 刪除。
  let pendingDeleteCustomerId=null;
  let editingCustomerIdV82=null;

  function customerRows(){
    const data=readDb();
    const rows=[];
    const seen=new Set();

    data.customers.forEach(c=>{
      if(!c)return;
      const key=normalizePlate2(c.plate)||String(c.id||"");
      if(seen.has(key))return;
      seen.add(key);
      rows.push({
        id:c.id||key,
        editable:true,
        plate:formatPlate2(c.plate||""),
        name:c.name||"",
        phone:c.phone||"",
        model:c.model||"",
        year:c.year||"",
        color:c.color||"",
        km:Number(c.km||0),
        source:"客戶資料"
      });
    });

    data.orders.forEach(o=>{
      if(!o)return;
      const key=normalizePlate2(o.plate);
      if(!key||seen.has(key))return;
      seen.add(key);
      rows.push({
        id:o.id||key,
        editable:false,
        plate:formatPlate2(o.plate||""),
        name:o.name||"",
        phone:o.phone||"",
        model:o.model||"",
        year:o.year||"",
        color:o.color||"",
        km:Number(o.km||0),
        source:"工單紀錄"
      });
    });

    return {data,rows};
  }

  function showMountOnly(){
    qa(".page").forEach(p=>{
      p.classList.remove("active");
      p.style.display="none";
    });
    const mount=q("#threePageMount");
    if(mount){
      mount.classList.remove("hide");
      mount.classList.add("show");
      mount.style.display="block";
    }
    qa(".merge-notice").forEach(el=>el.remove());
  }

  window.mountCustomers=function(){
    showMountOnly();

    qa(".side button[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page==="customers"));
    const title=q("#title");
    if(title) title.textContent="客戶車輛";
    q("#side")?.classList.remove("open");
    q("#overlay")?.classList.remove("show");

    const box=q("#threePageContent");
    const {data,rows}=customerRows();

    if(!box)return;
    box.innerHTML=`
      <div class="card">
        <h2>客戶車輛</h2>
        <div class="three-stat">目前讀到：工單 ${data.orders.length} 筆｜客戶 ${data.customers.length} 筆｜可顯示車輛 ${rows.length} 筆</div>
        <div id="mountedCustomerList"></div>
      </div>
    `;

    const list=q("#mountedCustomerList");
    if(!rows.length){
      list.innerHTML='<div class="three-card"><h3>沒有可顯示的客戶車輛</h3><div class="three-meta">本機資料沒有客戶資料，也沒有可從工單補出的車牌。</div></div>';
      return;
    }

    list.innerHTML=rows.map(c=>{
      const delText=pendingDeleteCustomerId===c.id?"確認刪除":"刪除";
      return `
        <div class="three-card">
          <h3>${esc2(c.plate||"未填車牌")}｜${esc2(c.name||"未填姓名")}</h3>
          <div class="three-meta">
            電話：${esc2(c.phone||"未填")}<br>
            車種：${esc2(c.model||"未填")}｜年份：${esc2(c.year||"未填")}｜顏色：${esc2(c.color||"未填")}<br>
          </div>
          <div class="three-actions">
            ${c.editable?`<button type="button" class="secondary mountedEditCustomer" data-id="${esc2(c.id)}">修改資料</button>`:""}
            <button type="button" class="secondary mountedHist" data-plate="${esc2(c.plate)}">歷史維修</button>
            ${c.editable?`<button type="button" class="danger mountedDeleteCustomer" data-id="${esc2(c.id)}">${delText}</button>`:""}
          </div>
        </div>
      `;
    }).join("");

    window.scrollTo(0,0);
  };

  function openCustomerEditV82(id){
    const data=readDb();
    const c=data.customers.find(x=>String(x.id)===String(id));
    if(!c){
      alert("找不到客戶資料，可能這筆是從工單紀錄補出來的。");
      return;
    }

    editingCustomerIdV82=id;

    q("#customerEditPlate").textContent=c.plate||"";
    q("#editCustomerName").value=c.name||"";
    q("#editCustomerPhone").value=c.phone||"";
    q("#editCustomerModel").value=c.model||"";
    q("#editCustomerYear").value=c.year||"";
    q("#editCustomerColor").value=c.color||"";

    q("#customerEditModal")?.classList.remove("hide");
  }

  function closeCustomerEditV82(){
    editingCustomerIdV82=null;
    q("#customerEditModal")?.classList.add("hide");
  }

  function saveCustomerEditV82(){
    if(!editingCustomerIdV82)return;

    const data=readDb();
    const c=data.customers.find(x=>String(x.id)===String(editingCustomerIdV82));
    if(!c)return;

    c.name=q("#editCustomerName").value.trim();
    c.phone=q("#editCustomerPhone").value.trim();
    c.model=q("#editCustomerModel").value.trim();
    c.year=q("#editCustomerYear").value.trim();
    c.color=q("#editCustomerColor").value.trim();

    writeDb(data);
    closeCustomerEditV82();
    pendingDeleteCustomerId=null;
    window.mountCustomers();
  }

  function deleteCustomerV82(id){
    const data=readDb();

    if(pendingDeleteCustomerId!==id){
      pendingDeleteCustomerId=id;
      window.mountCustomers();
      return;
    }

    data.customers=data.customers.filter(c=>String(c.id)!==String(id));
    pendingDeleteCustomerId=null;
    writeDb(data);
    window.mountCustomers();
  }

  document.addEventListener("click",e=>{
    const edit=e.target.closest(".mountedEditCustomer");
    if(edit){
      e.preventDefault();
      openCustomerEditV82(edit.dataset.id);
      return;
    }

    const del=e.target.closest(".mountedDeleteCustomer");
    if(del){
      e.preventDefault();
      deleteCustomerV82(del.dataset.id);
      return;
    }

    if(e.target.closest("#saveCustomerEdit")){
      e.preventDefault();
      saveCustomerEditV82();
      return;
    }

    if(e.target.closest("#closeCustomerEdit") || e.target.id==="customerEditModal"){
      e.preventDefault();
      closeCustomerEditV82();
      return;
    }
  },true);

  // 確保側邊欄客戶車輛使用新版 mounted customers
  setTimeout(()=>{
    qa('.side button[data-page="customers"]').forEach(btn=>{
      const clone=btn.cloneNode(true);
      btn.parentNode.replaceChild(clone,btn);
      clone.addEventListener("click",e=>{
        e.preventDefault();
        pendingDeleteCustomerId=null;
        window.mountCustomers();
      });
    });
  },0);

  window.forceOpenPageV82=forceOpenPage;
})();

/* v8.3 fix: customer vehicle page only shows real customer records, not order fallback */
(function(){
  function q(s){return document.querySelector(s);}
  function qa(s){return Array.from(document.querySelectorAll(s));}
  function getKey(){try{if(typeof KEY!=="undefined")return KEY;}catch{} return "shaochi_v62_data";}
  const DATA_KEY=getKey();

  function esc2(s){
    try{if(typeof esc==="function")return esc(s);}catch{}
    return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
  }
  function normalizePlate2(v){
    try{if(typeof normalizePlate==="function")return normalizePlate(v||"");}catch{}
    return String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7);
  }
  function formatPlate2(v){
    try{if(typeof formatPlate==="function")return formatPlate(v||"");}catch{}
    const raw=normalizePlate2(v);
    if(raw.length===6||raw.length===7)return raw.slice(0,3)+"-"+raw.slice(3);
    return raw;
  }
  function readDb(){
    try{
      const raw=localStorage.getItem(DATA_KEY);
      const data=raw?JSON.parse(raw):{orders:[],customers:[]};
      if(!Array.isArray(data.orders))data.orders=[];
      if(!Array.isArray(data.customers))data.customers=[];
      return data;
    }catch{
      return {orders:[],customers:[]};
    }
  }
  function writeDb(data){
    localStorage.setItem(DATA_KEY,JSON.stringify(data));
    try{db=data;}catch{}
  }

  let pendingDeleteCustomerIdV83=null;
  let editingCustomerIdV83=null;

  function showMountOnly(){
    qa(".page").forEach(p=>{
      p.classList.remove("active");
      p.style.display="none";
    });
    const mount=q("#threePageMount");
    if(mount){
      mount.classList.remove("hide");
      mount.classList.add("show");
      mount.style.display="block";
    }
    qa(".merge-notice").forEach(el=>el.remove());
  }

  function customerRowsActualOnly(){
    const data=readDb();
    const rows=[];
    const seen=new Set();

    data.customers.forEach(c=>{
      if(!c)return;
      const key=normalizePlate2(c.plate)||String(c.id||"");
      if(seen.has(key))return;
      seen.add(key);
      rows.push({
        id:c.id||key,
        plate:formatPlate2(c.plate||""),
        name:c.name||"",
        phone:c.phone||"",
        model:c.model||"",
        year:c.year||"",
        color:c.color||"",
        km:Number(c.km||0)
      });
    });

    return {data,rows};
  }

  window.mountCustomers=function(){
    showMountOnly();

    qa(".side button[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page==="customers"));
    const title=q("#title");
    if(title)title.textContent="客戶車輛";
    q("#side")?.classList.remove("open");
    q("#overlay")?.classList.remove("show");

    const box=q("#threePageContent");
    const {data,rows}=customerRowsActualOnly();
    if(!box)return;

    box.innerHTML=`
      <div class="card">
        <h2>客戶車輛</h2>
        <div class="three-stat">目前讀到：工單 ${data.orders.length} 筆｜客戶 ${data.customers.length} 筆｜顯示客戶車輛 ${rows.length} 筆</div>
        <p class="muted">此頁只顯示真正建立的客戶資料；刪除客戶後不會再從工單紀錄補回來。</p>
        <div id="mountedCustomerList"></div>
      </div>
    `;

    const list=q("#mountedCustomerList");
    if(!rows.length){
      list.innerHTML='<div class="three-card"><h3>目前沒有客戶車輛資料</h3><div class="three-meta">如果要看舊工單，請到「歷史維修」用車牌查詢。</div></div>';
      return;
    }

    list.innerHTML=rows.map(c=>{
      const delText=pendingDeleteCustomerIdV83===c.id?"確認刪除":"刪除";
      return `
        <div class="three-card">
          <h3>${esc2(c.plate||"未填車牌")}｜${esc2(c.name||"未填姓名")}</h3>
          <div class="three-meta">
            電話：${esc2(c.phone||"未填")}<br>
            車種：${esc2(c.model||"未填")}｜年份：${esc2(c.year||"未填")}｜顏色：${esc2(c.color||"未填")}<br>
          </div>
          <div class="three-actions">
            <button type="button" class="secondary mountedEditCustomerV83" data-id="${esc2(c.id)}">修改資料</button>
            <button type="button" class="secondary mountedHist" data-plate="${esc2(c.plate)}">歷史維修</button>
            <button type="button" class="danger mountedDeleteCustomerV83" data-id="${esc2(c.id)}">${delText}</button>
          </div>
        </div>
      `;
    }).join("");

    window.scrollTo(0,0);
  };

  function openCustomerEdit(id){
    const data=readDb();
    const c=data.customers.find(x=>String(x.id)===String(id));
    if(!c){alert("找不到客戶資料");return;}

    editingCustomerIdV83=id;
    q("#customerEditPlate").textContent=c.plate||"";
    q("#editCustomerName").value=c.name||"";
    q("#editCustomerPhone").value=c.phone||"";
    q("#editCustomerModel").value=c.model||"";
    q("#editCustomerYear").value=c.year||"";
    q("#editCustomerColor").value=c.color||"";
    q("#customerEditModal")?.classList.remove("hide");
  }

  function closeCustomerEdit(){
    editingCustomerIdV83=null;
    q("#customerEditModal")?.classList.add("hide");
  }

  function saveCustomerEdit(){
    if(!editingCustomerIdV83)return;
    const data=readDb();
    const c=data.customers.find(x=>String(x.id)===String(editingCustomerIdV83));
    if(!c)return;

    c.name=q("#editCustomerName").value.trim();
    c.phone=q("#editCustomerPhone").value.trim();
    c.model=q("#editCustomerModel").value.trim();
    c.year=q("#editCustomerYear").value.trim();
    c.color=q("#editCustomerColor").value.trim();

    writeDb(data);
    closeCustomerEdit();
    pendingDeleteCustomerIdV83=null;
    window.mountCustomers();
  }

  function deleteCustomer(id){
    const data=readDb();

    if(pendingDeleteCustomerIdV83!==id){
      pendingDeleteCustomerIdV83=id;
      window.mountCustomers();
      return;
    }

    data.customers=data.customers.filter(c=>String(c.id)!==String(id));
    pendingDeleteCustomerIdV83=null;
    writeDb(data);
    window.mountCustomers();
  }

  document.addEventListener("click",e=>{
    const edit=e.target.closest(".mountedEditCustomerV83,.mountedEditCustomer");
    if(edit){
      e.preventDefault();
      openCustomerEdit(edit.dataset.id);
      return;
    }

    const del=e.target.closest(".mountedDeleteCustomerV83,.mountedDeleteCustomer");
    if(del){
      e.preventDefault();
      deleteCustomer(del.dataset.id);
      return;
    }

    if(e.target.closest("#saveCustomerEdit")){
      e.preventDefault();
      saveCustomerEdit();
      return;
    }

    if(e.target.closest("#closeCustomerEdit")||e.target.id==="customerEditModal"){
      e.preventDefault();
      closeCustomerEdit();
      return;
    }
  },true);

  setTimeout(()=>{
    qa('.side button[data-page="customers"]').forEach(btn=>{
      const clone=btn.cloneNode(true);
      btn.parentNode.replaceChild(clone,btn);
      clone.addEventListener("click",e=>{
        e.preventDefault();
        pendingDeleteCustomerIdV83=null;
        window.mountCustomers();
      });
    });
  },0);
})();

/* v8.4 fix: edit order save writes directly to localStorage and refreshes correct page */
(function(){
  function q(s){return document.querySelector(s);}
  function qa(s){return Array.from(document.querySelectorAll(s));}

  function getKey(){
    try{ if(typeof KEY !== "undefined") return KEY; }catch{}
    return "shaochi_v62_data";
  }
  const DATA_KEY = getKey();

  function readDb(){
    try{
      const raw = localStorage.getItem(DATA_KEY);
      const data = raw ? JSON.parse(raw) : {orders:[], customers:[]};
      if(!Array.isArray(data.orders)) data.orders = [];
      if(!Array.isArray(data.customers)) data.customers = [];
      return data;
    }catch{
      return {orders:[], customers:[]};
    }
  }

  function writeDb(data){
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    try{ db = data; }catch{}
  }

  function calcStatusV84(o){
    if(o.type === "估價單") return "估價單";
    if(Number(o.amount) > 0 && Number(o.paid) >= Number(o.amount)) return "已付款";
    if(Number(o.paid) > 0) return "欠款";
    return "未付款";
  }

  function hideThreeMount(){
    const mount = q("#threePageMount");
    const content = q("#threePageContent");
    if(mount){
      mount.classList.remove("show");
      mount.classList.add("hide");
      mount.style.display = "none";
    }
    if(content) content.innerHTML = "";
  }

  function forceOpenPage(page){
    hideThreeMount();

    qa(".page").forEach(p=>{
      const on = p.id === page;
      p.classList.toggle("active", on);
      p.style.display = on ? "block" : "none";
    });

    qa(".side button[data-page]").forEach(b=>b.classList.toggle("active", b.dataset.page === page));

    const titles = {
      receive:"接車建單",
      orders:"工單管理",
      quotes:"估價單管理",
      items:"項目管理",
      history:"歷史維修",
      customers:"客戶車輛",
      money:"營收備份"
    };
    const title = q("#title");
    if(title) title.textContent = titles[page] || page;

    q("#side")?.classList.remove("open");
    q("#overlay")?.classList.remove("show");

    try{
      if(typeof render === "function") render();
    }catch(err){
      console.warn("render skipped v8.4", err);
    }

    // render 可能改動顯示，再強制一次
    qa(".page").forEach(p=>{
      const on = p.id === page;
      p.classList.toggle("active", on);
      p.style.display = on ? "block" : "none";
    });

    window.scrollTo(0,0);
  }

  function getEditingOrderId(){
    try{
      if(window.editingOrderId) return window.editingOrderId;
    }catch{}
    try{
      if(typeof editingOrderId !== "undefined" && editingOrderId) return editingOrderId;
    }catch{}
    return null;
  }

  function rowsToItems(){
    const items = [];
    qa(".edit-row").forEach(row=>{
      const name = (row.querySelector(".edit-row-name")?.value || "").trim();
      const price = Number(row.querySelector(".edit-price")?.value || 0);
      const qty = Math.max(1, Number(row.querySelector(".edit-qty")?.value || 1));
      if(name){
        items.push({name, price, qty});
      }
    });
    return items;
  }

  function saveEditOrderV84(){
    const id = getEditingOrderId();
    if(!id){
      alert("找不到正在修改的工單");
      return;
    }

    const data = readDb();
    const order = data.orders.find(o=>String(o.id) === String(id));
    if(!order){
      alert("找不到原工單資料");
      return;
    }

    const items = rowsToItems();
    const partsText = items.map(p=>{
      const subtotal = Number(p.price || 0) * Math.max(1, Number(p.qty || 1));
      return `${String(p.name||"").trim()} x${Math.max(1,Number(p.qty||1))} $${subtotal}`;
    }).join("\n");

    const note = q("#editNote")?.value || "";
    const labor = Number(q("#editLaborCost")?.value || 0);
    const paid = Number(q("#editPaidAmount")?.value || 0);
    const partsTotal = items.reduce((s,p)=>s + Number(p.price||0) * Math.max(1, Number(p.qty||1)), 0);

    order.items = [partsText, note].filter(Boolean).join("\n");
    order.laborCost = labor;
    order.amount = partsTotal + labor;
    order.paid = paid;
    order.status = calcStatusV84(order);

    writeDb(data);

    try{
      if(typeof closeEditOrder === "function"){
        closeEditOrder();
      }else{
        q("#editOrderModal")?.classList.add("hide");
      }
    }catch{
      q("#editOrderModal")?.classList.add("hide");
    }

    try{ window.editingOrderId = null; }catch{}
    try{ editingOrderId = null; }catch{}

    forceOpenPage(order.type === "估價單" ? "quotes" : "orders");
  }

  // 用最後一段 capture 攔截儲存，避免舊 saveEditOrderNow 被多段 render/openPage 干擾。
  document.addEventListener("click", function(e){
    const btn = e.target.closest("#saveEditOrder");
    if(!btn) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    saveEditOrderV84();
  }, true);

  window.saveEditOrderV84 = saveEditOrderV84;
  window.forceOpenPageV84 = forceOpenPage;
})();

/* v8.5 fix: replace edit-order save button so old handler cannot clear editingOrderId first */
(function(){
  function q(s){return document.querySelector(s);}
  function qa(s){return Array.from(document.querySelectorAll(s));}

  function getKey(){
    try{ if(typeof KEY !== "undefined") return KEY; }catch{}
    return "shaochi_v62_data";
  }
  const DATA_KEY = getKey();

  function readDb(){
    try{
      const raw = localStorage.getItem(DATA_KEY);
      const data = raw ? JSON.parse(raw) : {orders:[], customers:[]};
      if(!Array.isArray(data.orders)) data.orders = [];
      if(!Array.isArray(data.customers)) data.customers = [];
      return data;
    }catch{
      return {orders:[], customers:[]};
    }
  }

  function writeDb(data){
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    try{ db = data; }catch{}
  }

  function calcStatusV85(o){
    if(o.type === "估價單") return "估價單";
    if(Number(o.amount) > 0 && Number(o.paid) >= Number(o.amount)) return "已付款";
    if(Number(o.paid) > 0) return "欠款";
    return "未付款";
  }

  function hideThreeMount(){
    const mount = q("#threePageMount");
    const content = q("#threePageContent");
    if(mount){
      mount.classList.remove("show");
      mount.classList.add("hide");
      mount.style.display = "none";
    }
    if(content) content.innerHTML = "";
  }

  function forceOpenPage(page){
    hideThreeMount();

    qa(".page").forEach(p=>{
      const on = p.id === page;
      p.classList.toggle("active", on);
      p.style.display = on ? "block" : "none";
    });

    qa(".side button[data-page]").forEach(b=>b.classList.toggle("active", b.dataset.page === page));

    const titles = {
      receive:"接車建單",
      orders:"工單管理",
      quotes:"估價單管理",
      items:"項目管理",
      history:"歷史維修",
      customers:"客戶車輛",
      money:"營收備份"
    };
    const title = q("#title");
    if(title) title.textContent = titles[page] || page;

    q("#side")?.classList.remove("open");
    q("#overlay")?.classList.remove("show");

    try{
      if(typeof render === "function") render();
    }catch(err){
      console.warn("render skipped v8.5", err);
    }

    qa(".page").forEach(p=>{
      const on = p.id === page;
      p.classList.toggle("active", on);
      p.style.display = on ? "block" : "none";
    });

    window.scrollTo(0,0);
  }

  function getEditingOrderId(){
    try{
      if(typeof editingOrderId !== "undefined" && editingOrderId) return editingOrderId;
    }catch{}
    try{
      if(window.editingOrderId) return window.editingOrderId;
    }catch{}
    return null;
  }

  function rowsToItems(){
    const items = [];
    qa(".edit-row").forEach(row=>{
      const name = (row.querySelector(".edit-row-name")?.value || "").trim();
      const price = Number(row.querySelector(".edit-price")?.value || 0);
      const qty = Math.max(1, Number(row.querySelector(".edit-qty")?.value || 1));
      if(name){
        items.push({name, price, qty});
      }
    });
    return items;
  }

  function saveEditOrderV85(){
    const id = getEditingOrderId();
    if(!id){
      alert("找不到正在修改的工單，請重新點一次修改工單");
      return;
    }

    const data = readDb();
    const order = data.orders.find(o=>String(o.id) === String(id));
    if(!order){
      alert("找不到原工單資料");
      return;
    }

    const items = rowsToItems();
    const partsText = items.map(p=>{
      const qty = Math.max(1, Number(p.qty || 1));
      const subtotal = Number(p.price || 0) * qty;
      return `${String(p.name||"").trim()} x${qty} $${subtotal}`;
    }).join("\n");

    const note = q("#editNote")?.value || "";
    const labor = Number(q("#editLaborCost")?.value || 0);
    const paid = Number(q("#editPaidAmount")?.value || 0);
    const partsTotal = items.reduce((s,p)=>s + Number(p.price||0) * Math.max(1, Number(p.qty||1)), 0);

    order.items = [partsText, note].filter(Boolean).join("\n");
    order.laborCost = labor;
    order.amount = partsTotal + labor;
    order.paid = paid;
    order.status = calcStatusV85(order);

    writeDb(data);

    q("#editOrderModal")?.classList.add("hide");

    try{ editingOrderId = null; }catch{}
    try{ window.editingOrderId = null; }catch{}
    try{ editItemsData = []; }catch{}

    forceOpenPage(order.type === "估價單" ? "quotes" : "orders");
  }

  // Make sure the button exists even if another patch restored the old ID.
  setTimeout(()=>{
    const oldBtn = q("#saveEditOrder");
    if(oldBtn){
      oldBtn.id = "saveEditOrderV85";
    }

    const btn = q("#saveEditOrderV85");
    if(btn && !btn.dataset.v85Bound){
      btn.dataset.v85Bound = "1";
      btn.addEventListener("click", e=>{
        e.preventDefault();
        e.stopPropagation();
        saveEditOrderV85();
      }, true);
    }
  },0);

  document.addEventListener("click", e=>{
    const btn = e.target.closest("#saveEditOrderV85");
    if(!btn) return;

    e.preventDefault();
    e.stopPropagation();
    saveEditOrderV85();
  }, true);

  window.saveEditOrderV85 = saveEditOrderV85;
})();

/* v8.7 remove all non-essential hints / debug text */
(function(){
  function q(s){return document.querySelector(s);}
  function qa(s){return Array.from(document.querySelectorAll(s));}

  function clearKnownHints(){
    // Remove version/test/development notes.
    qa(".version-stable-note,.merge-notice,.fix-note").forEach(el=>el.remove());

    // Hide / clear debug/stat text from mounted three-page module.
    [
      "#historyDebug",
      "#customerDebug",
      "#moneyDebug"
    ].forEach(sel=>{
      const el=q(sel);
      if(el){
        el.textContent="";
        el.style.display="none";
      }
    });

    // Hide the yellow mounted stats such as 「目前讀到...」
    qa(".three-stat").forEach(el=>{
      el.textContent="";
      el.style.display="none";
    });

    // Remove muted instructional paragraphs that are only explanatory, not result data.
    qa("p.muted").forEach(el=>{
      const t=(el.textContent||"").trim();
      if(
        t.includes("目前讀到") ||
        t.includes("此頁只顯示") ||
        t.includes("估價單不列入營收") ||
        t.includes("可修改、刪除") ||
        t.includes("這裡管理快速加入") ||
        t.includes("沿用") ||
        t.includes("測試") ||
        t.includes("不要直接當正式版") ||
        t.includes("不新增功能")
      ){
        el.remove();
      }
    });

    // Remove idle helper lines only before a search has been performed.
    ["#historyList"].forEach(sel=>{
      const el=q(sel);
      if(el && (el.textContent||"").trim()==="請輸入車牌查詢"){
        el.innerHTML="";
      }
    });

    // Remove receive-page helper / old-customer hint line if it is just instructional.
    const foundMsg=q("#foundMsg");
    if(foundMsg){
      const t=(foundMsg.textContent||"").trim();
      if(t.includes("已找到舊客戶") || t.includes("下一步會自動帶入")){
        foundMsg.textContent="";
      }
    }
  }

  // Wrap mounted page functions to clean after render.
  function wrapFunction(name){
    const old=window[name];
    if(typeof old==="function" && !old.__v87Wrapped){
      const wrapped=function(){
        const result=old.apply(this,arguments);
        setTimeout(clearKnownHints,0);
        return result;
      };
      wrapped.__v87Wrapped=true;
      window[name]=wrapped;
    }
  }

  [
    "mountCustomers",
    "mountHistory",
    "mountMoney",
    "renderCustomers",
    "renderMoney",
    "renderHistory",
    "renderCustomersStandalone",
    "renderMoneyStandalone",
    "renderHistoryStandalone"
  ].forEach(wrapFunction);

  document.addEventListener("click",()=>setTimeout(clearKnownHints,0),true);
  document.addEventListener("input",()=>setTimeout(clearKnownHints,0),true);
  document.addEventListener("submit",()=>setTimeout(clearKnownHints,0),true);

  setTimeout(clearKnownHints,0);
  setTimeout(clearKnownHints,200);
  setTimeout(clearKnownHints,800);
})();

/* v9.3 print preview: no forced print, opens in-app preview */
(function(){
  let pendingPreviewId = null;
  let currentPrintText = "";

  function q(s){return document.querySelector(s);}
  function qa(s){return Array.from(document.querySelectorAll(s));}

  function getKey(){
    try{ if(typeof KEY !== "undefined") return KEY; }catch{}
    return "shaochi_v62_data";
  }
  const DATA_KEY = getKey();

  function readDb(){
    try{
      const raw = localStorage.getItem(DATA_KEY);
      const data = raw ? JSON.parse(raw) : {orders:[],customers:[]};
      if(!Array.isArray(data.orders)) data.orders = [];
      if(!Array.isArray(data.customers)) data.customers = [];
      return data;
    }catch{
      return {orders:[],customers:[]};
    }
  }

  function escP(s){
    return String(s??"").replace(/[&<>"']/g,m=>({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      "\"":"&quot;",
      "'":"&#039;"
    }[m]));
  }

  function moneyP(n){
    return "$" + Number(n || 0).toLocaleString("zh-TW");
  }

  function remainP(o){
    return Math.max(0, Number(o.amount || 0) - Number(o.paid || 0));
  }

  function itemsLines(text){
    return String(text || "").replaceAll("\\n", "\n").split("\n").filter(x=>x.trim());
  }

  function itemsHtml(text){
    const lines = itemsLines(text);
    return lines.length ? lines.map(x=>`<li>${escP(x)}</li>`).join("") : "<li>無項目</li>";
  }

  function buildText(order){
    const title = order.type === "估價單" ? "估價單" : "維修工單";
    const lines = itemsLines(order.items).map(x=>"・"+x).join("\n");
    return `紹馳車業 ${title}
日期：${order.date || ""}
狀態：${order.status || ""}

車牌：${order.plate || ""}
姓名：${order.name || ""}
電話：${order.phone || ""}
公里數：${Number(order.km || 0).toLocaleString("zh-TW")} KM
車種：${order.model || ""}
年份/顏色：${order.year || ""} ${order.color || ""}

項目：
${lines || "無項目"}

總額：${moneyP(order.amount)}
已付：${moneyP(order.paid)}
欠款：${moneyP(remainP(order))}

感謝您的支持｜紹馳車業`;
  }

  function buildPreview(order){
    const isQuote = order.type === "估價單";
    const title = isQuote ? "估價單" : "維修工單";
    const status = order.status || (isQuote ? "估價單" : "");

    return `
      <div class="print-preview-sheet">
        <div class="print-preview-header">
          <div class="print-preview-brand">
            <small>SHAO CHI TECH</small>
            <h1>紹馳車業</h1>
          </div>
          <div class="print-preview-title">
            <h2>${title}</h2>
            <p>${escP(order.date || "")}</p>
            <p>${escP(status)}</p>
          </div>
        </div>

        <div class="print-preview-grid">
          <div class="print-preview-box"><div class="print-preview-label">車牌</div><div class="print-preview-value">${escP(order.plate || "")}</div></div>
          <div class="print-preview-box"><div class="print-preview-label">客戶姓名</div><div class="print-preview-value">${escP(order.name || "")}</div></div>
          <div class="print-preview-box"><div class="print-preview-label">電話</div><div class="print-preview-value">${escP(order.phone || "")}</div></div>
          <div class="print-preview-box"><div class="print-preview-label">公里數</div><div class="print-preview-value">${Number(order.km || 0).toLocaleString("zh-TW")} KM</div></div>
          <div class="print-preview-box"><div class="print-preview-label">車種</div><div class="print-preview-value">${escP(order.model || "")}</div></div>
          <div class="print-preview-box"><div class="print-preview-label">年份 / 顏色</div><div class="print-preview-value">${escP(order.year || "")} ${escP(order.color || "")}</div></div>
        </div>

        <h3>維修 / 估價項目</h3>
        <ul>${itemsHtml(order.items)}</ul>

        <h3 style="margin-top:18px">金額</h3>
        <div class="print-preview-money-row"><span>總額</span><b>${moneyP(order.amount)}</b></div>
        <div class="print-preview-money-row"><span>已付</span><b>${moneyP(order.paid)}</b></div>
        <div class="print-preview-money-row total"><span>欠款</span><b>${moneyP(remainP(order))}</b></div>

        <div class="print-preview-footer">感謝您的支持｜紹馳車業</div>
      </div>
    `;
  }

  function resetPreviewButtons(exceptId){
    qa(".printPreviewBtn").forEach(btn=>{
      if(btn.dataset.id !== exceptId) btn.textContent = "列印預覽";
    });
  }

  function findActions(id){
    let editBtn = null;
    try{
      editBtn = q(`.editOrder[data-id="${CSS.escape(id)}"]`);
    }catch{
      editBtn = qa(".editOrder").find(b => String(b.dataset.id) === String(id));
    }
    if(!editBtn) return null;
    return editBtn.closest(".actions,.order-actions-v103") || editBtn.parentElement;
  }

  function addPreviewButton(id){
    const actions = findActions(id);
    if(!actions) return;

    let exists = null;
    try{
      exists = actions.querySelector(`.printPreviewBtn[data-id="${CSS.escape(id)}"]`);
    }catch{
      exists = qa(".printPreviewBtn").find(b => String(b.dataset.id) === String(id) && actions.contains(b));
    }
    if(exists) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "secondary printPreviewBtn";
    btn.dataset.id = id;
    btn.textContent = "列印預覽";

    const hist = actions.querySelector(".hist");
    if(hist) actions.insertBefore(btn, hist);
    else actions.appendChild(btn);
  }

  function forcePreviewButtons(){
    const data = readDb();
    data.orders.forEach(o=>{
      if(o && o.id) addPreviewButton(String(o.id));
    });
  }

  function openPreview(id){
    const data = readDb();
    const order = data.orders.find(o => String(o.id) === String(id));
    if(!order){
      alert("找不到這張工單");
      return;
    }

    currentPrintText = buildText(order);
    q("#printPreviewContent").innerHTML = buildPreview(order);
    q("#printPreviewModal").classList.remove("hide");
    window.scrollTo(0,0);
  }

  function closePreview(){
    q("#printPreviewModal").classList.add("hide");
    q("#printPreviewContent").innerHTML = "";
  }

  document.addEventListener("click", function(e){
    const btn = e.target.closest(".printPreviewBtn");
    if(btn){
      e.preventDefault();
      e.stopImmediatePropagation();

      const id = btn.dataset.id;
      if(!id) return;

      if(pendingPreviewId !== id){
        pendingPreviewId = id;
        resetPreviewButtons(id);
        btn.textContent = "確定預覽";
        return;
      }

      pendingPreviewId = null;
      btn.textContent = "列印預覽";
      openPreview(id);
      return;
    }

    if(e.target.closest("#closePrintPreview")){
      e.preventDefault();
      closePreview();
      return;
    }

    if(e.target.closest("#copyPrintText")){
      e.preventDefault();
      navigator.clipboard?.writeText(currentPrintText)
        .then(()=>alert("已複製"))
        .catch(()=>prompt("請手動複製", currentPrintText));
      return;
    }

    if(e.target.closest("#trySystemPrint")){
      e.preventDefault();
      try{
        window.print();
      }catch{
        alert("此環境無法開啟系統列印");
      }
      return;
    }

    pendingPreviewId = null;
    resetPreviewButtons("");
    setTimeout(forcePreviewButtons,80);
    setTimeout(forcePreviewButtons,250);
  }, true);

  document.addEventListener("input",()=>setTimeout(forcePreviewButtons,80),true);
  document.addEventListener("submit",()=>setTimeout(forcePreviewButtons,120),true);

  const oldRender = window.render;
  if(typeof oldRender === "function" && !oldRender.__v93PreviewWrapped){
    const wrapped = function(){
      const result = oldRender.apply(this, arguments);
      setTimeout(forcePreviewButtons,0);
      setTimeout(forcePreviewButtons,120);
      return result;
    };
    wrapped.__v93PreviewWrapped = true;
    window.render = wrapped;
    try{ render = wrapped; }catch{}
  }

  setTimeout(forcePreviewButtons,0);
  setTimeout(forcePreviewButtons,300);
  setInterval(forcePreviewButtons,1200);

  window.openPrintPreviewV93 = openPreview;
  window.forcePreviewButtonsV93 = forcePreviewButtons;
})();

/* v9.4 document type selector for print preview */
(function(){
  const DOC_TYPES = ["維修工單","估價單","車禍估價單","保險估價單","零件報價單"];

  function q(s){return document.querySelector(s);}

  function ensureDocTypeSelector(){
    const modal = q("#printPreviewModal");
    const actions = q(".print-preview-actions");
    if(!modal || !actions || modal.classList.contains("hide")) return;

    if(!q("#printDocTypeSelect")){
      const wrap = document.createElement("div");
      wrap.className = "print-doc-type-wrap";
      wrap.innerHTML = `
        <label for="printDocTypeSelect">單據類型</label>
        <select id="printDocTypeSelect">
          ${DOC_TYPES.map(t=>`<option value="${t}">${t}</option>`).join("")}
        </select>
      `;
      actions.insertBefore(wrap, actions.firstChild);

      const currentTitle = q(".print-preview-title h2")?.textContent?.trim();
      const select = q("#printDocTypeSelect");
      if(currentTitle && DOC_TYPES.includes(currentTitle)){
        select.value = currentTitle;
      }else if(currentTitle === "估價單"){
        select.value = "估價單";
      }else{
        select.value = "維修工單";
      }

      select.addEventListener("change", ()=>{
        applyDocType(select.value);
      });
    }

    applyDocType(q("#printDocTypeSelect")?.value || q(".print-preview-title h2")?.textContent || "維修工單");
  }

  function applyDocType(type){
    if(!type) return;
    const title = q(".print-preview-title h2");
    const status = q(".print-preview-title p:last-child");

    if(title) title.textContent = type;
    if(status) status.textContent = type;
  }

  // After opening preview, insert selector.
  document.addEventListener("click", ()=>{
    setTimeout(ensureDocTypeSelector, 80);
    setTimeout(ensureDocTypeSelector, 250);
  }, true);

  // If modal already opened.
  setTimeout(ensureDocTypeSelector, 300);

  window.applyPrintDocTypeV94 = applyDocType;
  window.ensureDocTypeSelectorV94 = ensureDocTypeSelector;
})();

/* v9.5 add shop info, note and signature to print preview */
(function(){
  const SHOP_LINE = "zhangfan0421";
  const SHOP_NAME = "紹馳車業";
  const DEFAULT_NOTE = "本估價僅供維修／保險參考，實際金額依現場拆檢與零件狀況為準。";

  function q(s){return document.querySelector(s);}

  function enhancePreview(){
    const modal = q("#printPreviewModal");
    const sheet = q(".print-preview-sheet");
    if(!modal || modal.classList.contains("hide") || !sheet) return;

    const brand = q(".print-preview-brand");
    if(brand && !brand.querySelector(".print-preview-shop-info")){
      const info = document.createElement("div");
      info.className = "print-preview-shop-info";
      info.innerHTML = `LINE：${SHOP_LINE}`;
      brand.appendChild(info);
    }

    if(!sheet.querySelector(".print-preview-note")){
      const note = document.createElement("div");
      note.className = "print-preview-note";
      note.innerHTML = `<b>備註</b><br>${DEFAULT_NOTE}`;
      const footer = sheet.querySelector(".print-preview-footer");
      if(footer){
        sheet.insertBefore(note, footer);
      }else{
        sheet.appendChild(note);
      }
    }

    if(!sheet.querySelector(".print-preview-sign")){
      const sign = document.createElement("div");
      sign.className = "print-preview-sign";
      sign.innerHTML = `
        <div class="print-preview-sign-box">客戶確認／簽名</div>
        <div class="print-preview-sign-box">日期</div>
      `;
      const footer = sheet.querySelector(".print-preview-footer");
      if(footer){
        sheet.insertBefore(sign, footer);
      }else{
        sheet.appendChild(sign);
      }
    }

    const footer = sheet.querySelector(".print-preview-footer");
    if(footer){
      footer.textContent = `感謝您的支持｜${SHOP_NAME}｜LINE：${SHOP_LINE}`;
    }
  }

  document.addEventListener("click", ()=>{
    setTimeout(enhancePreview, 80);
    setTimeout(enhancePreview, 250);
  }, true);

  setTimeout(enhancePreview, 300);

  window.enhancePrintPreviewV95 = enhancePreview;
})();

/* v10.4 safe sync test merge
   Conflict fix:
   - Do not create a normal .page for sync.
   - Do not replace all sidebar handlers.
   - Only intercept data-page="syncTest".
   - Keep history/customers/money mounted pages untouched.
*/
(function(){
  const URL_KEY = "shaochi_sync_test_url";

  function q(s){return document.querySelector(s);}
  function qa(s){return Array.from(document.querySelectorAll(s));}

  function apiUrl(){
    const input = q("#syncTestApiUrlV104");
    const url = (input?.value || "").trim();
    if(url) localStorage.setItem(URL_KEY, url);
    return url;
  }

  function setStatus(msg){
    const el = q("#syncTestStatusV104");
    if(el) el.textContent = msg;
  }

  function setResult(obj){
    const el = q("#syncTestResultV104");
    if(!el) return;
    if(typeof obj === "string"){
      el.textContent = obj;
    }else{
      el.textContent = JSON.stringify(obj, null, 2);
    }
  }

  async function apiGet(action){
    const url = apiUrl();
    if(!url) throw new Error("沒有 API 網址");

    const res = await fetch(url + "?action=" + encodeURIComponent(action), {
      method: "GET",
      cache: "no-store"
    });

    const text = await res.text();
    try{
      return JSON.parse(text);
    }catch{
      throw new Error("回傳不是 JSON：\n" + text.slice(0, 500));
    }
  }

  async function apiPost(payload){
    const url = apiUrl();
    if(!url) throw new Error("沒有 API 網址");

    const res = await fetch(url, {
      method: "POST",
      headers: {"Content-Type":"text/plain;charset=utf-8"},
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    try{
      return JSON.parse(text);
    }catch{
      throw new Error("回傳不是 JSON：\n" + text.slice(0, 500));
    }
  }

  async function ping(){
    setStatus("連線測試中...");
    setResult("");
    const json = await apiGet("ping");
    setStatus(json.ok ? "連線成功" : "連線失敗");
    setResult(json);
  }

  async function testWrite(){
    setStatus("測試寫入中...");
    setResult("");
    const json = await apiPost({action:"testWrite"});
    setStatus(json.ok ? "測試寫入成功" : "測試寫入失敗");
    setResult(json);
  }

  async function testRead(){
    setStatus("下載雲端資料中...");
    setResult("");
    const json = await apiGet("getAll");
    setStatus(json.ok ? "下載雲端資料成功" : "下載雲端資料失敗");

    const data = json.data || {};
    setResult({
      ok: json.ok,
      orders: Array.isArray(data.orders) ? data.orders.length : 0,
      customers: Array.isArray(data.customers) ? data.customers.length : 0,
      catalog: Array.isArray(data.catalog) ? data.catalog.length : 0,
      data
    });
  }

  function hideMountedThreePages(){
    const three = q("#threePageMount");
    if(three){
      three.classList.remove("show");
      three.classList.add("hide");
      three.style.display = "none";
    }
    const threeContent = q("#threePageContent");
    if(threeContent) threeContent.innerHTML = "";
  }

  function openSyncTest(){
    // Hide old normal pages.
    qa(".page").forEach(p=>{
      p.classList.remove("active");
      p.style.display = "none";
    });

    // Hide the stable mounted three pages without touching their code.
    hideMountedThreePages();

    const panel = q("#syncTestPanelV104");
    if(panel){
      panel.classList.remove("hide");
      panel.classList.add("show");
      panel.style.display = "block";
    }

    qa(".side button[data-page]").forEach(btn=>{
      btn.classList.toggle("active", btn.dataset.page === "syncTest");
    });

    const title = q("#title");
    if(title) title.textContent = "雲端同步";

    q("#side")?.classList.remove("open");
    q("#overlay")?.classList.remove("show");

    const saved = localStorage.getItem(URL_KEY);
    if(saved && q("#syncTestApiUrlV104")) q("#syncTestApiUrlV104").value = saved;

    window.scrollTo(0,0);
  }

  function hideSyncTest(){
    const panel = q("#syncTestPanelV104");
    if(panel){
      panel.classList.remove("show");
      panel.classList.add("hide");
      panel.style.display = "none";
    }
  }

  // Capture only the syncTest nav. Other navs are left to original v9.5 handlers.
  document.addEventListener("click", async e=>{
    try{
      const syncNav = e.target.closest('.side button[data-page="syncTest"]');
      if(syncNav){
        e.preventDefault();
        e.stopImmediatePropagation();
        openSyncTest();
        return;
      }

      const anyNav = e.target.closest(".side button[data-page]");
      if(anyNav && anyNav.dataset.page !== "syncTest"){
        hideSyncTest();
      }

      if(e.target.closest("#syncTestPingV104")){ e.preventDefault(); await ping(); return; }
      if(e.target.closest("#syncTestWriteV104")){ e.preventDefault(); await testWrite(); return; }
      if(e.target.closest("#syncTestReadV104")){ e.preventDefault(); await testRead(); return; }
      if(e.target.closest("#syncTestClearV104")){ e.preventDefault(); setStatus(""); setResult(""); return; }
    }catch(err){
      setStatus("錯誤");
      setResult(err.message || String(err));
    }
  }, true);

  // Replace only syncTest button so old openPage("syncTest") does not run.
  setTimeout(()=>{
    qa('.side button[data-page="syncTest"]').forEach(btn=>{
      if(btn.dataset.v104Bound === "1") return;
      const clone = btn.cloneNode(true);
      clone.dataset.v104Bound = "1";
      btn.parentNode.replaceChild(clone, btn);
      clone.addEventListener("click", e=>{
        e.preventDefault();
        openSyncTest();
      });
    });
  },0);

  window.openSyncTestV104 = openSyncTest;
})();

/* v10.5 formal manual cloud sync override
   Keep v10.4 safe panel and only change sync button actions.
   No auto-sync. No three-page changes.
*/
(function(){
  const URL_KEY = "shaochi_sync_test_url";

  function q(s){return document.querySelector(s);}
  function qa(s){return Array.from(document.querySelectorAll(s));}

  function getDataKey(){
    try{ if(typeof KEY !== "undefined") return KEY; }catch{}
    return "shaochi_v62_data";
  }

  function apiUrl(){
    const input = q("#syncTestApiUrlV104");
    const url = (input?.value || "").trim();
    if(url) localStorage.setItem(URL_KEY, url);
    return url;
  }

  function setStatus(msg){
    const el = q("#syncTestStatusV104");
    if(el) el.textContent = msg;
  }

  function setResult(obj){
    const el = q("#syncTestResultV104");
    if(!el) return;
    if(typeof obj === "string") el.textContent = obj;
    else el.textContent = JSON.stringify(obj, null, 2);
  }

  function readLocalDb(){
    try{
      const raw = localStorage.getItem(getDataKey());
      const data = raw ? JSON.parse(raw) : {orders:[],customers:[],catalog:[]};
      if(!Array.isArray(data.orders)) data.orders = [];
      if(!Array.isArray(data.customers)) data.customers = [];
      if(!Array.isArray(data.catalog)){
        try{ data.catalog = Array.isArray(PART_CATALOG) ? PART_CATALOG : []; }
        catch{ data.catalog = []; }
      }
      return data;
    }catch{
      return {orders:[],customers:[],catalog:[]};
    }
  }

  function writeLocalDb(data){
    if(!data || typeof data !== "object") return;
    if(!Array.isArray(data.orders)) data.orders = [];
    if(!Array.isArray(data.customers)) data.customers = [];
    if(!Array.isArray(data.catalog)) data.catalog = [];

    localStorage.setItem(getDataKey(), JSON.stringify(data));

    try{ db = data; }catch{}
    try{ if(data.catalog.length) PART_CATALOG = data.catalog; }catch{}
  }

  function statsText(data){
    return `工單 ${data.orders?.length || 0} 筆｜客戶 ${data.customers?.length || 0} 筆｜項目 ${data.catalog?.length || 0} 筆`;
  }

  async function apiGet(action){
    const url = apiUrl();
    if(!url) throw new Error("沒有 API 網址");

    const res = await fetch(url + "?action=" + encodeURIComponent(action), {
      method: "GET",
      cache: "no-store"
    });

    const text = await res.text();
    try{
      return JSON.parse(text);
    }catch{
      throw new Error("回傳不是 JSON：\n" + text.slice(0, 500));
    }
  }

  async function apiPost(payload){
    const url = apiUrl();
    if(!url) throw new Error("沒有 API 網址");

    const res = await fetch(url, {
      method: "POST",
      headers: {"Content-Type":"text/plain;charset=utf-8"},
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    try{
      return JSON.parse(text);
    }catch{
      throw new Error("回傳不是 JSON：\n" + text.slice(0, 500));
    }
  }

  async function ping(){
    setStatus("連線測試中...");
    setResult("");
    const json = await apiGet("ping");
    setStatus(json.ok ? "連線成功" : "連線失敗");
    setResult(json);
  }

  async function uploadLocalToCloud(){
    const data = readLocalDb();

    if(!confirm(
      "確定要把【本機資料】上傳到 Google Sheets？\n\n" +
      statsText(data) +
      "\n\n注意：這會覆蓋雲端目前資料。"
    )) return;

    setStatus("上傳中...");
    setResult("");

    const json = await apiPost({
      action: "saveAll",
      data: {
        orders: data.orders || [],
        customers: data.customers || [],
        catalog: data.catalog || []
      }
    });

    if(!json.ok) throw new Error(json.message || "上傳失敗");

    setStatus("上傳完成");
    setResult({
      ok: true,
      message: "本機資料已上傳到 Google Sheets",
      local: {
        orders: data.orders.length,
        customers: data.customers.length,
        catalog: data.catalog.length
      }
    });
  }

  async function downloadCloudToLocal(){
    if(!confirm(
      "確定要把【雲端資料】下載到本機？\n\n" +
      "注意：這會覆蓋目前這台手機/電腦的本機資料。"
    )) return;

    setStatus("下載中...");
    setResult("");

    const json = await apiGet("getAll");
    if(!json.ok) throw new Error(json.message || "下載失敗");

    const data = json.data || {};
    writeLocalDb(data);

    setStatus("下載完成，已寫入本機");
    setResult({
      ok: true,
      message: "雲端資料已下載到本機",
      local: statsText(readLocalDb())
    });

    try{ if(typeof render === "function") render(); }catch{}
  }

  function updateLabels(){
    const panel = q("#syncTestPanelV104");
    if(!panel) return;

    const h2 = panel.querySelector("h2");
    if(h2) h2.textContent = "Google Sheets 雲端同步";

    const btnPing = q("#syncTestPingV104");
    const btnUpload = q("#syncTestWriteV104");
    const btnDownload = q("#syncTestReadV104");

    if(btnPing) btnPing.textContent = "測試連線";
    if(btnUpload) btnUpload.textContent = "上傳本機資料";
    if(btnDownload) btnDownload.textContent = "下載雲端資料";

    const resultTitle = Array.from(panel.querySelectorAll("h2")).find(x=>x.textContent.includes("同步結果"));
    if(resultTitle) resultTitle.textContent = "同步結果";
  }

  // Capture buttons before the old v10.4 test handler.
  document.addEventListener("click", async e=>{
    try{
      if(e.target.closest("#syncTestPingV104")){
        e.preventDefault();
        e.stopImmediatePropagation();
        await ping();
        return;
      }

      if(e.target.closest("#syncTestWriteV104")){
        e.preventDefault();
        e.stopImmediatePropagation();
        await uploadLocalToCloud();
        return;
      }

      if(e.target.closest("#syncTestReadV104")){
        e.preventDefault();
        e.stopImmediatePropagation();
        await downloadCloudToLocal();
        return;
      }

      const syncNav = e.target.closest('.side button[data-page="syncTest"]');
      if(syncNav){
        setTimeout(updateLabels, 80);
        setTimeout(updateLabels, 250);
        const title = q("#title");
        if(title) title.textContent = "雲端同步";
      }
    }catch(err){
      setStatus("錯誤");
      setResult(err.message || String(err));
    }
  }, true);

  setTimeout(updateLabels, 0);
})();

/* v10.6 formal manual cloud sync
   New button IDs avoid the old v10.4 test handlers.
*/
(function(){
  const URL_KEY = "shaochi_sync_test_url";

  function q(s){return document.querySelector(s);}

  function getDataKey(){
    try{ if(typeof KEY !== "undefined") return KEY; }catch{}
    return "shaochi_v62_data";
  }

  function apiUrl(){
    const input = q("#cloudApiUrlV106");
    const url = (input?.value || "").trim();
    if(url) localStorage.setItem(URL_KEY, url);
    return url;
  }

  function setStatus(msg){
    const el = q("#cloudStatusV106");
    if(el) el.textContent = msg;
  }

  function setResult(obj){
    const el = q("#cloudResultV106");
    if(!el) return;
    if(typeof obj === "string") el.textContent = obj;
    else el.textContent = JSON.stringify(obj, null, 2);
  }

  function readLocalDb(){
    try{
      const raw = localStorage.getItem(getDataKey());
      const data = raw ? JSON.parse(raw) : {orders:[],customers:[],catalog:[]};

      if(!Array.isArray(data.orders)) data.orders = [];
      if(!Array.isArray(data.customers)) data.customers = [];

      // 主系統舊資料可能沒有 catalog，這裡從 PART_CATALOG 補出來。
      if(!Array.isArray(data.catalog)){
        try{
          data.catalog = Array.isArray(PART_CATALOG) ? PART_CATALOG : [];
        }catch{
          data.catalog = [];
        }
      }

      return data;
    }catch{
      return {orders:[],customers:[],catalog:[]};
    }
  }

  function writeLocalDb(data){
    if(!data || typeof data !== "object") return;

    if(!Array.isArray(data.orders)) data.orders = [];
    if(!Array.isArray(data.customers)) data.customers = [];
    if(!Array.isArray(data.catalog)) data.catalog = [];

    localStorage.setItem(getDataKey(), JSON.stringify(data));

    try{ db = data; }catch{}
    try{ if(data.catalog.length) PART_CATALOG = data.catalog; }catch{}
  }

  function statsText(data){
    return `工單 ${data.orders?.length || 0} 筆｜客戶 ${data.customers?.length || 0} 筆｜項目 ${data.catalog?.length || 0} 筆`;
  }

  async function apiGet(action){
    const url = apiUrl();
    if(!url) throw new Error("沒有 API 網址");

    const res = await fetch(url + "?action=" + encodeURIComponent(action), {
      method: "GET",
      cache: "no-store"
    });

    const text = await res.text();
    try{
      return JSON.parse(text);
    }catch{
      throw new Error("回傳不是 JSON：\n" + text.slice(0, 500));
    }
  }

  async function apiPost(payload){
    const url = apiUrl();
    if(!url) throw new Error("沒有 API 網址");

    const res = await fetch(url, {
      method: "POST",
      headers: {"Content-Type":"text/plain;charset=utf-8"},
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    try{
      return JSON.parse(text);
    }catch{
      throw new Error("回傳不是 JSON：\n" + text.slice(0, 500));
    }
  }

  async function ping(){
    setStatus("連線測試中...");
    setResult("");

    const json = await apiGet("ping");

    setStatus(json.ok ? "連線成功" : "連線失敗");
    setResult(json);
  }

  async function uploadLocalToCloud(){
    const data = readLocalDb();

    if(!confirm(
      "確定要把【本機資料】上傳到 Google Sheets？\n\n" +
      statsText(data) +
      "\n\n注意：這會覆蓋雲端目前資料。"
    )) return;

    setStatus("上傳中...");
    setResult("");

    const json = await apiPost({
      action: "saveAll",
      data: {
        orders: data.orders || [],
        customers: data.customers || [],
        catalog: data.catalog || []
      }
    });

    if(!json.ok) throw new Error(json.message || "上傳失敗");

    setStatus("上傳完成");
    setResult({
      ok: true,
      message: "本機資料已上傳到 Google Sheets",
      uploaded: {
        orders: data.orders.length,
        customers: data.customers.length,
        catalog: data.catalog.length
      }
    });
  }

  async function downloadCloudToLocal(){
    if(!confirm(
      "確定要把【雲端資料】下載到本機？\n\n" +
      "注意：這會覆蓋目前這台手機/電腦的本機資料。"
    )) return;

    setStatus("下載中...");
    setResult("");

    const json = await apiGet("getAll");
    if(!json.ok) throw new Error(json.message || "下載失敗");

    const data = json.data || {};
    writeLocalDb(data);

    setStatus("下載完成，已寫入本機");
    setResult({
      ok: true,
      message: "雲端資料已下載到本機",
      downloaded: {
        orders: Array.isArray(data.orders) ? data.orders.length : 0,
        customers: Array.isArray(data.customers) ? data.customers.length : 0,
        catalog: Array.isArray(data.catalog) ? data.catalog.length : 0
      }
    });

    try{ if(typeof render === "function") render(); }catch{}
  }

  document.addEventListener("click", async e=>{
    try{
      if(e.target.closest("#cloudPingV106")){
        e.preventDefault();
        e.stopImmediatePropagation();
        await ping();
        return;
      }

      if(e.target.closest("#cloudUploadV106")){
        e.preventDefault();
        e.stopImmediatePropagation();
        await uploadLocalToCloud();
        return;
      }

      if(e.target.closest("#cloudDownloadV106")){
        e.preventDefault();
        e.stopImmediatePropagation();
        await downloadCloudToLocal();
        return;
      }

      if(e.target.closest("#cloudClearV106")){
        e.preventDefault();
        e.stopImmediatePropagation();
        setStatus("");
        setResult("");
        return;
      }

      const syncNav = e.target.closest('.side button[data-page="syncTest"]');
      if(syncNav){
        const title = q("#title");
        if(title) title.textContent = "雲端同步";

        const saved = localStorage.getItem(URL_KEY);
        if(saved && q("#cloudApiUrlV106")) q("#cloudApiUrlV106").value = saved;
      }
    }catch(err){
      setStatus("錯誤");
      setResult(err.message || String(err));
    }
  }, true);
})();

/* v10.7 two-step manual sync buttons
   Upload: 上傳本機資料 -> 確定上傳
   Download: 下載雲端資料 -> 確定下載
   Avoids mobile confirm / click issues.
*/
(function(){
  let pendingSyncAction = null;

  function q(s){return document.querySelector(s);}

  function setStatus(msg){
    const el = q("#cloudStatusV106");
    if(el) el.textContent = msg;
  }

  function setResult(obj){
    const el = q("#cloudResultV106");
    if(!el) return;
    if(typeof obj === "string") el.textContent = obj;
    else el.textContent = JSON.stringify(obj, null, 2);
  }

  function resetSyncButtons(except){
    const upload = q("#cloudUploadV106");
    const download = q("#cloudDownloadV106");

    if(upload && except !== "upload") upload.textContent = "上傳本機資料";
    if(download && except !== "download") download.textContent = "下載雲端資料";
  }

  function getDataKey(){
    try{ if(typeof KEY !== "undefined") return KEY; }catch{}
    return "shaochi_v62_data";
  }

  function apiUrl(){
    const input = q("#cloudApiUrlV106");
    const url = (input?.value || "").trim();
    if(url) localStorage.setItem("shaochi_sync_test_url", url);
    return url;
  }

  function readLocalDb(){
    try{
      const raw = localStorage.getItem(getDataKey());
      const data = raw ? JSON.parse(raw) : {orders:[],customers:[],catalog:[]};

      if(!Array.isArray(data.orders)) data.orders = [];
      if(!Array.isArray(data.customers)) data.customers = [];

      if(!Array.isArray(data.catalog)){
        try{
          data.catalog = Array.isArray(PART_CATALOG) ? PART_CATALOG : [];
        }catch{
          data.catalog = [];
        }
      }

      return data;
    }catch{
      return {orders:[],customers:[],catalog:[]};
    }
  }

  function writeLocalDb(data){
    if(!data || typeof data !== "object") return;

    if(!Array.isArray(data.orders)) data.orders = [];
    if(!Array.isArray(data.customers)) data.customers = [];
    if(!Array.isArray(data.catalog)) data.catalog = [];

    localStorage.setItem(getDataKey(), JSON.stringify(data));

    try{ db = data; }catch{}
    try{ if(data.catalog.length) PART_CATALOG = data.catalog; }catch{}
  }

  function statsText(data){
    return `工單 ${data.orders?.length || 0} 筆｜客戶 ${data.customers?.length || 0} 筆｜項目 ${data.catalog?.length || 0} 筆`;
  }

  async function apiGet(action){
    const url = apiUrl();
    if(!url) throw new Error("沒有 API 網址");

    const res = await fetch(url + "?action=" + encodeURIComponent(action), {
      method: "GET",
      cache: "no-store"
    });

    const text = await res.text();
    try{
      return JSON.parse(text);
    }catch{
      throw new Error("回傳不是 JSON：\n" + text.slice(0, 500));
    }
  }

  async function apiPost(payload){
    const url = apiUrl();
    if(!url) throw new Error("沒有 API 網址");

    const res = await fetch(url, {
      method: "POST",
      headers: {"Content-Type":"text/plain;charset=utf-8"},
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    try{
      return JSON.parse(text);
    }catch{
      throw new Error("回傳不是 JSON：\n" + text.slice(0, 500));
    }
  }

  async function uploadLocalToCloud(){
    const data = readLocalDb();

    setStatus("上傳中...");
    setResult("");

    const json = await apiPost({
      action: "saveAll",
      data: {
        orders: data.orders || [],
        customers: data.customers || [],
        catalog: data.catalog || []
      }
    });

    if(!json.ok) throw new Error(json.message || "上傳失敗");

    setStatus("上傳完成");
    setResult({
      ok: true,
      message: "本機資料已上傳到 Google Sheets",
      uploaded: {
        orders: data.orders.length,
        customers: data.customers.length,
        catalog: data.catalog.length
      }
    });
  }

  async function downloadCloudToLocal(){
    setStatus("下載中...");
    setResult("");

    const json = await apiGet("getAll");
    if(!json.ok) throw new Error(json.message || "下載失敗");

    const data = json.data || {};
    writeLocalDb(data);

    setStatus("下載完成，已寫入本機");
    setResult({
      ok: true,
      message: "雲端資料已下載到本機",
      downloaded: {
        orders: Array.isArray(data.orders) ? data.orders.length : 0,
        customers: Array.isArray(data.customers) ? data.customers.length : 0,
        catalog: Array.isArray(data.catalog) ? data.catalog.length : 0
      }
    });

    try{ if(typeof render === "function") render(); }catch{}
  }

  document.addEventListener("click", async e=>{
    try{
      const uploadBtn = e.target.closest("#cloudUploadV106");
      if(uploadBtn){
        e.preventDefault();
        e.stopImmediatePropagation();

        if(pendingSyncAction !== "upload"){
          pendingSyncAction = "upload";
          resetSyncButtons("upload");
          uploadBtn.textContent = "確定上傳";
          setStatus("再按一次「確定上傳」會把本機資料覆蓋到雲端。");
          setResult({
            local: statsText(readLocalDb()),
            warning: "第二次按下才會真正上傳。"
          });
          return;
        }

        pendingSyncAction = null;
        uploadBtn.textContent = "上傳本機資料";
        await uploadLocalToCloud();
        return;
      }

      const downloadBtn = e.target.closest("#cloudDownloadV106");
      if(downloadBtn){
        e.preventDefault();
        e.stopImmediatePropagation();

        if(pendingSyncAction !== "download"){
          pendingSyncAction = "download";
          resetSyncButtons("download");
          downloadBtn.textContent = "確定下載";
          setStatus("再按一次「確定下載」會把雲端資料覆蓋到本機。");
          setResult({
            warning: "第二次按下才會真正下載。"
          });
          return;
        }

        pendingSyncAction = null;
        downloadBtn.textContent = "下載雲端資料";
        await downloadCloudToLocal();
        return;
      }

      const clearBtn = e.target.closest("#cloudClearV106");
      if(clearBtn){
        pendingSyncAction = null;
        resetSyncButtons("");
        return;
      }

      // 點其他地方取消確認狀態
      if(!e.target.closest("#cloudUploadV106") && !e.target.closest("#cloudDownloadV106")){
        pendingSyncAction = null;
        resetSyncButtons("");
      }
    }catch(err){
      pendingSyncAction = null;
      resetSyncButtons("");
      setStatus("錯誤");
      setResult(err.message || String(err));
    }
  }, true);
})();

/* v10.8 isolated two-step sync
   Uses fresh IDs so older v10.6/v10.7 handlers cannot intercept.
*/
(function(){
  let pendingAction = null;
  const URL_KEY = "shaochi_sync_test_url";

  function q(s){return document.querySelector(s);}

  function status(msg){
    const el = q("#cloudStatusV108");
    if(el) el.textContent = msg;
  }

  function result(obj){
    const el = q("#cloudResultV108");
    if(!el) return;
    el.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  }

  function resetButtons(except){
    const upload = q("#cloudUploadV108");
    const download = q("#cloudDownloadV108");
    if(upload && except !== "upload") upload.textContent = "上傳本機資料";
    if(download && except !== "download") download.textContent = "下載雲端資料";
  }

  function getDataKey(){
    try{ if(typeof KEY !== "undefined") return KEY; }catch{}
    return "shaochi_v62_data";
  }

  function apiUrl(){
    const input = q("#cloudApiUrlV108");
    const url = (input?.value || "").trim();
    if(url) localStorage.setItem(URL_KEY, url);
    return url;
  }

  function readLocalDb(){
    try{
      const raw = localStorage.getItem(getDataKey());
      const data = raw ? JSON.parse(raw) : {orders:[],customers:[],catalog:[]};
      if(!Array.isArray(data.orders)) data.orders = [];
      if(!Array.isArray(data.customers)) data.customers = [];
      if(!Array.isArray(data.catalog)){
        try{ data.catalog = Array.isArray(PART_CATALOG) ? PART_CATALOG : []; }
        catch{ data.catalog = []; }
      }
      return data;
    }catch{
      return {orders:[],customers:[],catalog:[]};
    }
  }

  function writeLocalDb(data){
    if(!data || typeof data !== "object") return;
    if(!Array.isArray(data.orders)) data.orders = [];
    if(!Array.isArray(data.customers)) data.customers = [];
    if(!Array.isArray(data.catalog)) data.catalog = [];
    localStorage.setItem(getDataKey(), JSON.stringify(data));
    try{ db = data; }catch{}
    try{ if(data.catalog.length) PART_CATALOG = data.catalog; }catch{}
  }

  function statsText(data){
    return `工單 ${data.orders?.length || 0} 筆｜客戶 ${data.customers?.length || 0} 筆｜項目 ${data.catalog?.length || 0} 筆`;
  }

  async function apiGet(action){
    const url = apiUrl();
    if(!url) throw new Error("沒有 API 網址");
    const res = await fetch(url + "?action=" + encodeURIComponent(action), {
      method: "GET",
      cache: "no-store"
    });
    const text = await res.text();
    try{ return JSON.parse(text); }
    catch{ throw new Error("回傳不是 JSON：\n" + text.slice(0, 500)); }
  }

  async function apiPost(payload){
    const url = apiUrl();
    if(!url) throw new Error("沒有 API 網址");
    const res = await fetch(url, {
      method: "POST",
      headers: {"Content-Type":"text/plain;charset=utf-8"},
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    try{ return JSON.parse(text); }
    catch{ throw new Error("回傳不是 JSON：\n" + text.slice(0, 500)); }
  }

  async function ping(){
    pendingAction = null;
    resetButtons("");
    status("連線測試中...");
    result("");
    const json = await apiGet("ping");
    status(json.ok ? "連線成功" : "連線失敗");
    result(json);
  }

  async function doUpload(){
    const data = readLocalDb();
    status("上傳中...");
    result("");
    const json = await apiPost({
      action: "saveAll",
      data: {
        orders: data.orders || [],
        customers: data.customers || [],
        catalog: data.catalog || []
      }
    });
    if(!json.ok) throw new Error(json.message || "上傳失敗");
    status("上傳完成");
    result({
      ok: true,
      message: "本機資料已上傳到 Google Sheets",
      uploaded: {
        orders: data.orders.length,
        customers: data.customers.length,
        catalog: data.catalog.length
      }
    });
  }

  async function doDownload(){
    status("下載中...");
    result("");
    const json = await apiGet("getAll");
    if(!json.ok) throw new Error(json.message || "下載失敗");
    const data = json.data || {};
    writeLocalDb(data);
    status("下載完成，已寫入本機");
    result({
      ok: true,
      message: "雲端資料已下載到本機",
      downloaded: {
        orders: Array.isArray(data.orders) ? data.orders.length : 0,
        customers: Array.isArray(data.customers) ? data.customers.length : 0,
        catalog: Array.isArray(data.catalog) ? data.catalog.length : 0
      }
    });
    try{ if(typeof render === "function") render(); }catch{}
  }

  document.addEventListener("click", async e=>{
    try{
      const pingBtn = e.target.closest("#cloudPingV108");
      if(pingBtn){
        e.preventDefault();
        e.stopImmediatePropagation();
        await ping();
        return;
      }

      const uploadBtn = e.target.closest("#cloudUploadV108");
      if(uploadBtn){
        e.preventDefault();
        e.stopImmediatePropagation();

        if(pendingAction !== "upload"){
          pendingAction = "upload";
          resetButtons("upload");
          uploadBtn.textContent = "確定上傳";
          status("再按一次「確定上傳」會把本機資料覆蓋到雲端。");
          result({
            local: statsText(readLocalDb()),
            warning: "第二次按下才會真正上傳。"
          });
          return;
        }

        pendingAction = null;
        uploadBtn.textContent = "上傳本機資料";
        await doUpload();
        return;
      }

      const downloadBtn = e.target.closest("#cloudDownloadV108");
      if(downloadBtn){
        e.preventDefault();
        e.stopImmediatePropagation();

        if(pendingAction !== "download"){
          pendingAction = "download";
          resetButtons("download");
          downloadBtn.textContent = "確定下載";
          status("再按一次「確定下載」會把雲端資料覆蓋到本機。");
          result({ warning: "第二次按下才會真正下載。" });
          return;
        }

        pendingAction = null;
        downloadBtn.textContent = "下載雲端資料";
        await doDownload();
        return;
      }

      const clearBtn = e.target.closest("#cloudClearV108");
      if(clearBtn){
        e.preventDefault();
        e.stopImmediatePropagation();
        pendingAction = null;
        resetButtons("");
        status("");
        result("");
        return;
      }

      if(!e.target.closest("#cloudUploadV108") && !e.target.closest("#cloudDownloadV108")){
        pendingAction = null;
        resetButtons("");
      }

      const syncNav = e.target.closest('.side button[data-page="syncTest"]');
      if(syncNav){
        const saved = localStorage.getItem(URL_KEY);
        if(saved && q("#cloudApiUrlV108")) q("#cloudApiUrlV108").value = saved;
      }
    }catch(err){
      pendingAction = null;
      resetButtons("");
      status("錯誤");
      result(err.message || String(err));
    }
  }, true);
})();

/* v10.9 multi-device sync flow helper
   Does not touch old sync button logic.
   Only adds device name, flow instructions, and last-sync record.
*/
(function(){
  const DEVICE_KEY = "shaochi_sync_device_name";
  const LAST_KEY = "shaochi_sync_last_record";

  function q(s){return document.querySelector(s);}

  function nowText(){
    const d = new Date();
    const pad = n => String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function getDeviceName(){
    return localStorage.getItem(DEVICE_KEY) || "這台設備";
  }

  function setDeviceName(name){
    localStorage.setItem(DEVICE_KEY, name || "這台設備");
  }

  function updateLastRecord(text){
    localStorage.setItem(LAST_KEY, text);
    renderLastRecord();
  }

  function renderLastRecord(){
    const el = q("#syncLastRecordV109");
    if(!el) return;
    el.textContent = localStorage.getItem(LAST_KEY) || "尚未記錄同步動作";
  }

  function enhanceSyncPanel(){
    const panel = q("#syncTestPanelV104");
    if(!panel) return;

    const firstCard = panel.querySelector(".card");
    if(!firstCard) return;

    if(!q("#syncDeviceNameV109")){
      const flow = document.createElement("div");
      flow.className = "sync-flow-box";
      flow.innerHTML = `
        <b>多機同步流程</b><br>
        1. 主要手機建單後，按「上傳本機資料」。<br>
        2. 另一台手機打開同一版系統，按「下載雲端資料」。<br>
        3. 下載後檢查工單、歷史維修、客戶車輛、營收備份是否一致。<br>
        <span style="color:#fca5a5">注意：上傳會覆蓋雲端，下載會覆蓋本機。</span>
      `;

      const device = document.createElement("div");
      device.className = "sync-flow-box";
      device.innerHTML = `
        <label>這台設備名稱</label>
        <div class="sync-device-row">
          <input id="syncDeviceNameV109" value="${getDeviceName()}" placeholder="例如：主手機 / 平板 / 電腦">
          <button id="saveSyncDeviceV109" type="button" class="secondary">儲存名稱</button>
        </div>
      `;

      const last = document.createElement("div");
      last.className = "sync-flow-box";
      last.innerHTML = `<b>最後同步紀錄</b><div id="syncLastRecordV109"></div>`;

      firstCard.insertBefore(last, firstCard.children[1] || null);
      firstCard.insertBefore(device, firstCard.children[1] || null);
      firstCard.insertBefore(flow, firstCard.children[1] || null);
    }

    renderLastRecord();
  }

  document.addEventListener("click", e=>{
    const syncNav = e.target.closest('.side button[data-page="syncTest"]');
    if(syncNav){
      setTimeout(enhanceSyncPanel, 80);
      setTimeout(enhanceSyncPanel, 250);
      return;
    }

    if(e.target.closest("#saveSyncDeviceV109")){
      e.preventDefault();
      const val = q("#syncDeviceNameV109")?.value?.trim() || "這台設備";
      setDeviceName(val);
      updateLastRecord(`${nowText()}｜${val}｜已儲存設備名稱`);
      alert("已儲存設備名稱");
      return;
    }

    const upload = e.target.closest("#cloudUploadV108");
    if(upload && upload.textContent.includes("確定上傳")){
      const device = getDeviceName();
      setTimeout(()=>{
        const status = q("#cloudStatusV108")?.textContent || "";
        if(status.includes("上傳完成")){
          updateLastRecord(`${nowText()}｜${device}｜上傳本機資料到雲端`);
        }
      }, 1200);
      return;
    }

    const download = e.target.closest("#cloudDownloadV108");
    if(download && download.textContent.includes("確定下載")){
      const device = getDeviceName();
      setTimeout(()=>{
        const status = q("#cloudStatusV108")?.textContent || "";
        if(status.includes("下載完成")){
          updateLastRecord(`${nowText()}｜${device}｜下載雲端資料到本機`);
        }
      }, 1200);
      return;
    }
  }, true);

  setTimeout(enhanceSyncPanel, 500);

  window.enhanceSyncPanelV109 = enhanceSyncPanel;
})();

/* v10.10 add category rename feature
   Base: v10.9 stable.
   Only overrides item-manager rendering and adds rename handler.
*/
(function(){
  function q(s){return document.querySelector(s);}
  function escV1010(s){
    return String(s??"").replace(/[&<>"']/g,m=>({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      "\"":"&quot;",
      "'":"&#039;"
    }[m]));
  }

  function ensureCatalogV1010(){
    if(typeof catalogEnsure === "function"){
      catalogEnsure();
    }else{
      if(!Array.isArray(PART_CATALOG)) PART_CATALOG = [];
      PART_CATALOG.forEach((p,i)=>{
        if(!p.id) p.id = "ci_" + Date.now().toString(36) + "_" + i + "_" + Math.random().toString(36).slice(2,7);
        if(p.sort === undefined || p.sort === null) p.sort = i + 1;
        if(p.price === undefined || p.price === null) p.price = 0;
        if(p.hidden === undefined) p.hidden = false;
        p.cat = String(p.cat || "未分類");
        p.name = String(p.name || "");
      });
      try{ db.catalog = PART_CATALOG; }catch{}
    }
  }

  function catsV1010(){
    ensureCatalogV1010();
    return [...new Set(PART_CATALOG.filter(p=>!p.hidden).map(p=>p.cat))];
  }

  function visibleItemsV1010(cat){
    ensureCatalogV1010();
    return PART_CATALOG
      .filter(p=>p.cat===cat && !p.hidden)
      .slice()
      .sort((a,b)=>{
        const sa = Number(a.sort || 0);
        const sb = Number(b.sort || 0);
        if(sa !== sb) return sa - sb;
        return String(a.name||"").localeCompare(String(b.name||""), "zh-Hant");
      });
  }

  function saveCatalogV1010(){
    try{
      db.catalog = PART_CATALOG;
      localStorage.setItem(KEY, JSON.stringify(db));
    }catch{}
    try{ renderPartsUI(); }catch{}
    try{ if(typeof renderEditQuickParts === "function") renderEditQuickParts(); }catch{}
  }

  function renameCategoryV1010(oldCat, newCat){
    oldCat = String(oldCat || "").trim();
    newCat = String(newCat || "").trim();

    if(!oldCat){
      alert("找不到要修改的大項");
      return;
    }

    if(!newCat){
      alert("請輸入新的大項名稱");
      return;
    }

    if(oldCat === newCat){
      alert("名稱沒有變更");
      return;
    }

    const cats = catsV1010();
    if(cats.includes(newCat)){
      alert("這個大項名稱已經存在");
      return;
    }

    PART_CATALOG.forEach(item=>{
      if(item.cat === oldCat){
        item.cat = newCat;
      }
    });

    if(typeof activeCatalogCat !== "undefined"){
      activeCatalogCat = newCat;
    }

    if(typeof catalogPendingDeleteId !== "undefined"){
      catalogPendingDeleteId = null;
    }

    saveCatalogV1010();
    renderItemManager();
  }

  // Override renderItemManager so 大項 can be renamed.
  window.renderItemManager = function renderItemManager(){
    ensureCatalogV1010();

    const select = q("#v10ItemCatSelect");
    const list = q("#itemManagerList");
    if(!select || !list) return;

    const cats = catsV1010();

    if(typeof activeCatalogCat === "undefined") window.activeCatalogCat = null;
    if(!activeCatalogCat || !cats.includes(activeCatalogCat)){
      activeCatalogCat = cats[0] || "";
    }

    select.innerHTML = cats.map(cat=>`<option value="${escV1010(cat)}" ${cat===activeCatalogCat?'selected':''}>${escV1010(cat)}</option>`).join("");

    if(!cats.length){
      list.innerHTML = '<p class="muted">目前沒有項目</p>';
      return;
    }

    const catButtons = cats.map(cat=>{
      const count = visibleItemsV1010(cat).length;
      return `<button type="button" class="catalog-v10-cat ${cat===activeCatalogCat?'active':''}" data-v10-cat="${escV1010(cat)}">
        <span>${escV1010(cat)}</span><span>${count} 項</span>
      </button>`;
    }).join("");

    const items = visibleItemsV1010(activeCatalogCat);
    const pendingId = (typeof catalogPendingDeleteId !== "undefined") ? catalogPendingDeleteId : null;
    const selectedStillExists = pendingId && items.some(p=>p.id===pendingId);
    const deleteText = selectedStillExists ? "確定刪除" : "刪除";

    const renameBox = `<div class="catalog-rename-box">
      <label>修改大項名稱</label>
      <div class="catalog-rename-row">
        <input id="catalogRenameCatInputV1010" value="${escV1010(activeCatalogCat)}" data-old-cat="${escV1010(activeCatalogCat)}" placeholder="輸入新的大項名稱">
        <button type="button" id="catalogRenameCatBtnV1010" class="secondary">儲存大項名稱</button>
      </div>
    </div>`;

    const control = items.length ? `<div class="catalog-v10-box">
      <label>選擇小項排序／刪除</label>
      <div class="catalog-v10-control">
        <select id="catalogSelectedItem">
          ${items.map(p=>`<option value="${escV1010(p.id)}" ${p.id===pendingId?'selected':''}>${escV1010(p.name)}｜${Number(p.price||0).toLocaleString("zh-TW")}</option>`).join("")}
        </select>
        <button type="button" id="catalogMoveUp" class="secondary">上移</button>
        <button type="button" id="catalogMoveDown" class="secondary">下移</button>
        <button type="button" id="catalogDeleteItem" class="danger">${deleteText}</button>
      </div>
    </div>` : "";

    const body = `<div class="catalog-v10-box">
      <h3>${escV1010(activeCatalogCat)}</h3>
      <div class="catalog-v10-list">
        ${items.map(p=>`
          <div class="catalog-v10-row">
            <div class="catalog-v10-grid">
              <input class="catalogV10Name" data-id="${escV1010(p.id)}" value="${escV1010(p.name)}" placeholder="小項名稱">
              <input class="catalogV10Price" data-id="${escV1010(p.id)}" type="number" min="0" value="${Number(p.price||0)}" placeholder="價格">
            </div>
            <div class="catalog-v10-muted">排序：${Number(p.sort||0)}${p.id===pendingId?'｜等待確認刪除':''}</div>
          </div>
        `).join("") || '<p class="muted">此大項目前沒有小項</p>'}
      </div>
    </div>`;

    list.innerHTML = `<div class="catalog-v10-cats">${catButtons}</div>${renameBox}${control}${body}`;
  };

  document.addEventListener("click", e=>{
    const btn = e.target.closest("#catalogRenameCatBtnV1010");
    if(!btn) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const input = q("#catalogRenameCatInputV1010");
    const oldCat = input?.dataset.oldCat || activeCatalogCat;
    const newCat = input?.value || "";
    renameCategoryV1010(oldCat, newCat);
  }, true);

  document.addEventListener("keydown", e=>{
    if(e.target && e.target.id === "catalogRenameCatInputV1010" && e.key === "Enter"){
      e.preventDefault();
      const input = e.target;
      renameCategoryV1010(input.dataset.oldCat || activeCatalogCat, input.value || "");
    }
  }, true);

  setTimeout(()=>{
    try{ renderItemManager(); }catch{}
  }, 0);
})();

(function(){
  const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbw5xe6EfThaRG5R1WuM9tJN1wt3rnWczF0MOerC3RqmPtSdpg2BqsxAFU8MHZMG3-xw/exec";
  const LAST_KEY = "shaochi_order_sync_last_v111";
  let downloading = false, uploading = false, uploadTimer = null, plateTimer = null, toastTimer = null, lastPlateAt = 0;

  function q(s){return document.querySelector(s);}
  function key(){try{if(typeof KEY!=="undefined")return KEY;}catch{} return "shaochi_v62_data";}
  function raw(){return localStorage.getItem(key())||"";}

  function dbRead(){
    try{
      const d = raw()?JSON.parse(raw()):{orders:[],customers:[],catalog:[]};
      if(!Array.isArray(d.orders))d.orders=[];
      if(!Array.isArray(d.customers))d.customers=[];
      if(!Array.isArray(d.catalog)){
        try{d.catalog=Array.isArray(PART_CATALOG)?PART_CATALOG:[];}catch{d.catalog=[];}
      }
      return d;
    }catch{return {orders:[],customers:[],catalog:[]};}
  }

  function dbWrite(d){
    if(!d||typeof d!=="object")return;
    if(!Array.isArray(d.orders))d.orders=[];
    if(!Array.isArray(d.customers))d.customers=[];
    if(!Array.isArray(d.catalog))d.catalog=[];
    localStorage.setItem(key(),JSON.stringify(d));
    try{db=d;}catch{}
    try{if(d.catalog.length)PART_CATALOG=d.catalog;}catch{}
  }

  function stats(d){return `工單 ${d.orders?.length||0} 筆｜客戶 ${d.customers?.length||0} 筆｜項目 ${d.catalog?.length||0} 筆`;}
  function apiUrl(){
    const input=q("#cloudApiUrlV108")||q("#cloudApiUrlV106")||q("#syncTestApiUrlV104");
    const u=(input?.value||"").trim();
    return u || localStorage.getItem("shaochi_sync_test_url") || localStorage.getItem("shaochi_sync_api_url") || DEFAULT_API_URL;
  }

  function toast(msg,type){
    const el=q("#orderSyncToastV111"); if(!el)return;
    el.textContent=msg; el.className=""; el.classList.add("show"); if(type)el.classList.add(type);
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>{el.className="";},2600);
  }

  function rec(msg){
    const line = new Date().toLocaleString("zh-TW",{hour12:false})+"｜"+msg;
    localStorage.setItem(LAST_KEY,line);
    const el=q("#orderSyncLastV111"); if(el)el.textContent=line;
  }

  async function getAll(){
    const res=await fetch(apiUrl()+"?action=getAll",{method:"GET",cache:"no-store"});
    const text=await res.text();
    try{return JSON.parse(text);}catch{throw new Error("API 回傳不是 JSON："+text.slice(0,200));}
  }

  async function saveAll(d){
    const res=await fetch(apiUrl(),{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"saveAll",data:{orders:d.orders||[],customers:d.customers||[],catalog:d.catalog||[]}})});
    const text=await res.text();
    try{return JSON.parse(text);}catch{throw new Error("API 回傳不是 JSON："+text.slice(0,200));}
  }

  async function cloudDownload(reason){
    if(downloading||uploading)return false;
    downloading=true;
    try{
      toast("正在下載雲端最新資料...","warn");
      const j=await getAll();
      if(!j.ok)throw new Error(j.message||"下載失敗");
      dbWrite(j.data||{});
      try{if(typeof render==="function")render();}catch{}
      try{if(typeof updateOldCustomerPreview==="function")updateOldCustomerPreview();}catch{}
      rec("自動下載雲端資料｜"+(reason||"接車查詢")+"｜"+stats(dbRead()));
      toast("已下載雲端最新資料","ok");
      return true;
    }catch(e){
      toast("雲端下載失敗，改用本機資料","err");
      console.warn(e);
      return false;
    }finally{downloading=false;}
  }

  async function cloudUpload(reason){
    if(uploading||downloading)return false;
    uploading=true;
    const d=dbRead();
    try{
      toast("本機已儲存，正在上傳雲端...","warn");
      const j=await saveAll(d);
      if(!j.ok)throw new Error(j.message||"上傳失敗");
      rec("自動上傳本機資料｜"+(reason||"資料變更")+"｜"+stats(d));
      toast("已自動上傳到雲端","ok");
      return true;
    }catch(e){
      toast("本機已儲存，但雲端上傳失敗","err");
      console.warn(e);
      return false;
    }finally{uploading=false;}
  }

  function isManual(t){return t && !!t.closest("#cloudUploadV108,#cloudDownloadV108,#cloudPingV108,#cloudClearV108,#cloudUploadV106,#cloudDownloadV106,#cloudPingV106,#cloudClearV106,#syncTestPanelV104");}

  function scheduleUpload(before,reason){
    clearTimeout(uploadTimer);
    uploadTimer=setTimeout(()=>{if(raw()&&raw()!==before)cloudUpload(reason);},950);
  }

  function watchChange(e){
    if(isManual(e.target))return;
    if(e.target.closest("#loginForm,#logout,#menu,#overlay,.side"))return;
    const before=raw();
    const btn=e.target.closest("button");
    const text=(btn?.textContent||"").trim();
    const likely=e.type==="submit"||["建檔","正式工單","估價單","儲存","付款","確認刪除","確認轉工單","轉工單","匯入","新增","刪除"].some(x=>text.includes(x));
    if(likely)scheduleUpload(before,text||e.type);
  }

  function schedulePlate(force,reason){
    const now=Date.now();
    if(!force && now-lastPlateAt<12000)return;
    lastPlateAt=now;
    clearTimeout(plateTimer);
    plateTimer=setTimeout(()=>cloudDownload(reason),force?50:650);
  }

  document.addEventListener("input",e=>{
    const plate=q("#plate");
    if(e.target===plate){
      const v=(plate.value||"").replace(/[^A-Za-z0-9]/g,"");
      if(v.length>=3)schedulePlate(false,"輸入車牌");
    }
  },true);

  document.addEventListener("submit",e=>{
    if(e.target && e.target.id==="step1")schedulePlate(true,"下一步接車");
    watchChange(e);
  },true);

  document.addEventListener("click",e=>watchChange(e),true);

  function enhance(){
    const p=q("#syncTestPanelV104");
    if(!p||q("#orderSyncInfoV111"))return;
    const c=p.querySelector(".card"); if(!c)return;
    const box=document.createElement("div");
    box.id="orderSyncInfoV111"; box.className="sync-flow-box-v111";
    box.innerHTML=`<b>接單同步已啟用</b><br>・輸入車牌 / 下一步接車：自動下載雲端資料。<br>・建立、修改、付款、刪除後：本機成功後自動上傳雲端。<br>・網路失敗時，本機資料照常保留。<br><br><b>最後自動同步紀錄</b><div id="orderSyncLastV111">${localStorage.getItem(LAST_KEY)||"尚未自動同步"}</div>`;
    c.insertBefore(box,c.children[1]||null);
  }
  document.addEventListener("click",e=>{if(e.target.closest('.side button[data-page="syncTest"]')){setTimeout(enhance,120);setTimeout(enhance,320);}},true);
  setTimeout(enhance,600);

  window.orderSyncDownloadV111=cloudDownload;
  window.orderSyncUploadV111=cloudUpload;
})();

/* v11.2 備註獨立顯示
   把沒有 $ / x數量 的項目行視為備註，只修正顯示，不破壞舊資料。
*/
(function(){
  function q(s){return document.querySelector(s)}
  function qa(s){return Array.from(document.querySelectorAll(s))}
  function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
  function data(){
    try{
      if(typeof db!=="undefined" && Array.isArray(db.orders)) return db;
      return JSON.parse(localStorage.getItem(typeof KEY!=="undefined"?KEY:"shaochi_v62_data")||"{}")
    }catch{return {orders:[]}}
  }
  function lines(o){
    const raw=o?.items;
    if(Array.isArray(raw)) return raw.map(x=>String(x||"").trim()).filter(Boolean);
    return String(raw||"").replaceAll("\\n","\n").split("\n").map(x=>x.trim()).filter(Boolean)
  }
  function isItem(s){
    s=String(s||"").trim();
    return /\$\s*\d/.test(s) || /[xX×]\s*\d+/.test(s);
  }
  function split(o){
    const itemLines=[], noteLines=[];
    lines(o).forEach(l=>(isItem(l)?itemLines:noteLines).push(l));
    ["note","remark","memo","notes"].forEach(k=>{
      if(o && o[k]) String(o[k]).split("\n").map(x=>x.trim()).filter(Boolean).forEach(x=>noteLines.push(x))
    });
    return {itemLines,noteLines}
  }
  function findOrderByCard(card){
    const title=card.querySelector("h3")?.textContent||"";
    const orders=Array.isArray(data().orders)?data().orders:[];
    return orders.find(o=>{
      const p=String(o.plate||"").trim();
      const n=String(o.name||"").trim();
      return p && title.includes(p) && (!n || title.includes(n));
    })
  }
  function fixCards(){
    qa(".item").forEach(card=>{
      if(card.dataset.noteFixed112==="1") return;
      const o=findOrderByCard(card);
      if(!o) return;
      const sp=split(o);
      if(!sp.noteLines.length) return;

      const walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);
      const nodes=[];
      while(walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(node=>{
        let t=node.nodeValue||"";
        sp.noteLines.forEach(n=>{
          if(n) t=t.replace(n,"");
        });
        node.nodeValue=t;
      });

      const note=document.createElement("div");
      note.className="order-note-v112";
      note.innerHTML="<b>備註：</b><br>"+sp.noteLines.map(esc).join("<br>");
      const actions=card.querySelector(".actions,.order-actions-v103");
      if(actions) card.insertBefore(note,actions); else card.appendChild(note);
      card.dataset.noteFixed112="1";
    })
  }

  const oldRender=window.render;
  if(typeof oldRender==="function" && !oldRender.__note112){
    const wrapped=function(){
      const r=oldRender.apply(this,arguments);
      setTimeout(fixCards,0); setTimeout(fixCards,150);
      return r;
    };
    wrapped.__note112=true;
    window.render=wrapped;
    try{render=wrapped}catch{}
  }

  document.addEventListener("click",()=>{setTimeout(fixCards,80);setTimeout(fixCards,250)},true);
  document.addEventListener("submit",()=>setTimeout(fixCards,150),true);
  document.addEventListener("input",()=>setTimeout(fixCards,150),true);
  setTimeout(fixCards,300);
  setInterval(fixCards,1200);
})();

(function(){
  function q(s){return document.querySelector(s)}
  function qa(s){return Array.from(document.querySelectorAll(s))}
  function money(n){return "$"+Number(n||0).toLocaleString("zh-TW")}
  function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
  function key(){try{if(typeof KEY!=="undefined")return KEY}catch{} return "shaochi_v62_data"}
  function getDb(){try{if(typeof db!=="undefined"&&db)return db;return JSON.parse(localStorage.getItem(key())||"{}")}catch{return {orders:[],customers:[],catalog:[]}}}
  function saveDb(d){localStorage.setItem(key(),JSON.stringify(d));try{db=d}catch{}}
  function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
  function thisMonth(){return today().slice(0,7)}
  function dateKey(s){s=String(s||"").trim();const m=s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);if(m)return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;const d=new Date(s);if(!isNaN(d.getTime()))return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;return ""}
  function rows(){const data=getDb();return (Array.isArray(data.orders)?data.orders:[]).filter(o=>!String(o.type||o.status||"").includes("估價")).map(o=>{const d=dateKey(o.date||o.createdAt||o.updatedAt);const amount=Number(o.amount||o.total||0)||0;const paid=Number(o.paid||0)||0;return {order:o,date:d,month:d.slice(0,7),amount,paid,unpaid:Math.max(0,amount-paid)}}).filter(x=>x.date)}
  function sum(list){return list.reduce((a,x)=>{a.count++;a.amount+=x.amount;a.paid+=x.paid;a.unpaid+=x.unpaid;return a},{count:0,amount:0,paid:0,unpaid:0})}
  function monthDays(month){const map=new Map();rows().filter(x=>x.month===month).forEach(x=>{if(!map.has(x.date))map.set(x.date,[]);map.get(x.date).push(x)});return Array.from(map.entries()).sort((a,b)=>b[0].localeCompare(a[0])).map(([date,list])=>({date,total:sum(list)}))}
  function mountPage(){
    const title=q("#title"); if(title) title.textContent="營收備份";
    qa('.side button[data-page]').forEach(btn=>{
      btn.classList.toggle("active", btn.dataset.page === "money");
    });
    qa(".page").forEach(p=>{p.classList.remove("active");p.style.display="none"});
    const mount=q("#threePageMount"); if(mount){mount.classList.remove("hide");mount.classList.add("show");mount.style.display="block"}
    q("#side")?.classList.remove("open"); q("#overlay")?.classList.remove("show");
    const box=q("#threePageContent")||q("#money")||q("main"); if(!box)return;
    const dateVal=q("#rev123Date")?.value||today();
    const monthVal=q("#rev123Month")?.value||thisMonth();
    const all=rows(), mSum=sum(all.filter(x=>x.month===monthVal)), tSum=sum(all.filter(x=>x.date===today())), dSum=sum(all.filter(x=>x.date===dateVal)), days=monthDays(monthVal), detail=all.filter(x=>x.date===dateVal);
    box.innerHTML=`<div class="card"><h2>營收備份</h2><div class="rev123-shell">
      <section class="rev123-panel"><div class="rev123-top"><div><div class="rev123-kicker">本月營業額｜${esc(monthVal)}</div><div class="rev123-big">${money(mSum.amount)}</div></div><div class="rev123-auto">自動計算</div></div><div class="rev123-statgrid"><div class="rev123-stat"><span>已收</span><b>${money(mSum.paid)}</b></div><div class="rev123-stat"><span>未收</span><b>${money(mSum.unpaid)}</b></div><div class="rev123-stat"><span>工單</span><b>${mSum.count} 筆</b></div></div></section>
      <section class="rev123-filter"><div class="rev123-field"><label>選擇日期</label><input id="rev123Date" type="date" value="${esc(dateVal)}"></div><div class="rev123-field"><label>選擇月份</label><input id="rev123Month" type="month" value="${esc(monthVal)}"></div></section>
      <section class="rev123-summary"><div class="rev123-mini"><div class="label">今日｜${today()}</div><div class="amt">${money(tSum.amount)}</div><div class="sub">已收 ${money(tSum.paid)}｜未收 ${money(tSum.unpaid)}｜${tSum.count} 筆</div></div><div class="rev123-mini"><div class="label">指定日期｜${esc(dateVal)}</div><div class="amt">${money(dSum.amount)}</div><div class="sub">已收 ${money(dSum.paid)}｜未收 ${money(dSum.unpaid)}｜${dSum.count} 筆</div></div></section>
      <section class="rev123-list"><div class="rev123-title"><h3>指定月份每日營業額</h3><span class="rev123-auto">自動更新</span></div>${days.length?days.map(d=>`<div class="rev123-row rev123Day" data-date="${esc(d.date)}"><div><div class="name">${esc(d.date)}</div><div class="meta">已收 ${money(d.total.paid)}｜未收 ${money(d.total.unpaid)}｜${d.total.count} 筆</div></div><div class="money">${money(d.total.amount)}</div></div>`).join(""):'<p class="muted">這個月份沒有正式工單</p>'}</section>
      <section class="rev123-list"><div class="rev123-title"><h3>當日工單明細</h3><span class="rev123-auto">${esc(dateVal)}</span></div>${detail.length?detail.map(x=>{const o=x.order;return `<div class="rev123-row"><div><div class="name">${esc(o.plate||"")}｜${esc(o.name||"")}</div><div class="meta">${esc(o.model||"")}｜${esc(o.date||x.date)}</div></div><div class="money">${money(x.amount)}</div></div>`}).join(""):'<p class="muted">這一天沒有正式工單</p>'}</section>
      <details class="rev123-backup"><summary>備份 / 匯入</summary><div class="rev123-backupbox"><button id="rev123Copy" type="button">複製備份</button><textarea id="rev123ImportText" placeholder="貼上備份 JSON"></textarea><button id="rev123Import" type="button" class="secondary">匯入</button></div></details>
    </div></div>`;
    window.scrollTo(0,0);
  }
  document.addEventListener("click",e=>{
    const nav=e.target.closest('.side button[data-page="money"]'); if(nav){e.preventDefault();e.stopImmediatePropagation();mountPage();return}
    const day=e.target.closest(".rev123Day"); if(day){e.preventDefault();const input=q("#rev123Date"); if(input)input.value=day.dataset.date||today(); mountPage(); return}
    if(e.target.closest("#rev123Copy")){e.preventDefault();const text=JSON.stringify(getDb());navigator.clipboard?.writeText(text).then(()=>alert("已複製備份")).catch(()=>{const area=q("#rev123ImportText");if(area){area.value=text;area.select()}alert("已放入匯入框，請手動複製")});return}
    if(e.target.closest("#rev123Import")){e.preventDefault();try{const data=JSON.parse(q("#rev123ImportText")?.value||"");saveDb(data);alert("匯入完成");mountPage()}catch(err){alert("匯入失敗："+(err.message||err))}}
  },true);
  document.addEventListener("input",e=>{if(e.target&&(e.target.id==="rev123Date"||e.target.id==="rev123Month"))mountPage()},true);
  window.renderRevenueRedesignV123=mountPage;
})();

/* v12.5 工單狀態改成下拉式 */
(function(){
  const STATUSES = ["待施工","施工中","已完工","已交車"];
  let filterStatus = "全部";

  function q(s){return document.querySelector(s)}
  function qa(s,root){return Array.from((root||document).querySelectorAll(s))}
  function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
  function key(){try{if(typeof KEY!=="undefined")return KEY}catch{} return "shaochi_v62_data"}
  function getDb(){try{if(typeof db!=="undefined"&&db)return db;return JSON.parse(localStorage.getItem(key())||"{}")}catch{return {orders:[],customers:[],catalog:[]}}}
  function saveDb(d){localStorage.setItem(key(),JSON.stringify(d));try{db=d}catch{}}

  function isOrderPage(){
    const title=q("#title")?.textContent||"";
    const orders=q("#orders");
    return title.includes("工單管理") || (orders && (orders.classList.contains("active") || orders.style.display==="block"));
  }

  function oid(o){
    return String(o.id || o._id || o.no || `${o.plate||""}_${o.date||""}_${o.amount||o.total||""}`);
  }

  function norm(s){
    s=String(s||"").trim();
    return STATUSES.includes(s) ? s : "待施工";
  }

  function findOrder(card){
    const data=getDb();
    const orders=Array.isArray(data.orders)?data.orders:[];
    const text=card.textContent||"";
    const title=card.querySelector("h3")?.textContent||text;

    if(card.dataset.orderIdV125){
      const f=orders.find(o=>oid(o)===card.dataset.orderIdV125);
      if(f)return f;
    }
    if(card.dataset.orderIdV124){
      const f=orders.find(o=>oid(o)===card.dataset.orderIdV124);
      if(f)return f;
    }

    return orders.find(o=>{
      const id=oid(o);
      const plate=String(o.plate||"").trim();
      const name=String(o.name||"").trim();
      const amount=String(o.amount||o.total||"").trim();

      if(id && text.includes(id)) return true;
      if(plate && title.includes(plate) && (!name || title.includes(name))) return true;
      if(plate && text.includes(plate) && amount && text.includes(amount)) return true;
      return false;
    });
  }

  function setStatus(id,status){
    const data=getDb();
    if(!Array.isArray(data.orders)) data.orders=[];
    const o=data.orders.find(x=>oid(x)===String(id));
    if(!o){
      alert("找不到工單");
      return;
    }
    o.workStatus=norm(status);
    o.updatedAt=new Date().toISOString();
    saveDb(data);
    try{if(typeof render==="function")render()}catch{}
    setTimeout(enhance,80);
    setTimeout(enhance,250);
  }

  function addFilter(root){
    if(q("#orderStatusFilterV125")) return;

    // 移除舊版篩選，避免重複
    qa("#orderStatusFilterV124", root).forEach(el=>{
      const wrap=el.closest(".order-status-filter-v124");
      if(wrap) wrap.remove();
      else el.remove();
    });

    const first=root.querySelector(".card")||root;
    const box=document.createElement("div");
    box.className="order-status-filter-v125";
    box.innerHTML=`<label>工單狀態篩選</label>
      <select id="orderStatusFilterV125">
        <option value="全部">全部</option>
        ${STATUSES.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("")}
      </select>`;
    first.insertBefore(box,first.firstChild);
    q("#orderStatusFilterV125").value=filterStatus;
  }

  function enhance(){
    if(!isOrderPage()) return;

    const root=q("#orders")||q("#threePageContent")||q("main");
    if(!root) return;

    addFilter(root);

    qa(".item,.three-card",root).forEach(card=>{
      const o=findOrder(card);
      if(!o) return;

      const id=oid(o);
      const st=norm(o.workStatus||o.jobStatus||o.processStatus);
      card.dataset.orderIdV125=id;

      if(filterStatus!=="全部" && st!==filterStatus){
        card.style.display="none";
        return;
      }else{
        card.style.display="";
      }

      // 移除 v12.4 的四顆按鈕
      qa(".order-status-actions-v124",card).forEach(el=>el.remove());
      qa(".order-status-v124",card).forEach(el=>el.remove());

      let badge=card.querySelector(".order-status-v125");
      if(!badge){
        badge=document.createElement("div");
        badge.className="order-status-v125";
        const h3=card.querySelector("h3");
        if(h3) h3.insertAdjacentElement("afterend",badge);
        else card.insertBefore(badge,card.firstChild);
      }
      badge.dataset.status=st;
      badge.textContent="狀態："+st;

      let wrap=card.querySelector(".order-status-select-wrap-v125");
      if(!wrap){
        wrap=document.createElement("div");
        wrap.className="order-status-select-wrap-v125";
        const actions=card.querySelector(".actions,.three-actions,.order-actions-v103");
        if(actions) card.insertBefore(wrap,actions);
        else card.appendChild(wrap);
      }

      wrap.innerHTML=`<label>工單狀態</label>
        <select class="order-status-select-v125" data-id="${esc(id)}">
          ${STATUSES.map(s=>`<option value="${esc(s)}" ${s===st?'selected':''}>${esc(s)}</option>`).join("")}
        </select>`;
    });
  }

  document.addEventListener("change",e=>{
    const sel=e.target.closest(".order-status-select-v125");
    if(sel){
      e.preventDefault();
      setStatus(sel.dataset.id,sel.value);
      return;
    }

    if(e.target && e.target.id==="orderStatusFilterV125"){
      filterStatus=e.target.value||"全部";
      enhance();
    }
  },true);

  document.addEventListener("click",e=>{
    const nav=e.target.closest('.side button[data-page="orders"]');
    if(nav){
      setTimeout(enhance,120);
      setTimeout(enhance,350);
    }
  },true);

  const oldRender=window.render;
  if(typeof oldRender==="function" && !oldRender.__v125StatusSelect){
    const wrapped=function(){
      const r=oldRender.apply(this,arguments);
      setTimeout(enhance,0);
      setTimeout(enhance,160);
      return r;
    };
    wrapped.__v125StatusSelect=true;
    window.render=wrapped;
    try{render=wrapped}catch{}
  }

  setTimeout(enhance,500);
  window.enhanceOrderStatusSelectV125=enhance;
})();

/* v12.8 修正自訂頁面側邊導航 active 狀態 */
(function(){
  function qa(s,root){return Array.from((root||document).querySelectorAll(s))}

  function setNavActive(page){
    qa('.side button[data-page]').forEach(btn=>{
      if(btn.dataset.page === page){
        btn.classList.add("active");
      }else{
        btn.classList.remove("active");
      }
    });
  }

  document.addEventListener("click", e=>{
    const nav=e.target.closest('.side button[data-page]');
    if(!nav) return;

    // 讓所有自訂接管頁也能同步亮色
    const page=nav.dataset.page || "";
    setTimeout(()=>setNavActive(page),0);
    setTimeout(()=>setNavActive(page),120);
    setTimeout(()=>setNavActive(page),350);
  },true);

  // 營收備份是自訂 mountPage，額外保險處理
  document.addEventListener("click", e=>{
    if(e.target.closest('.side button[data-page="money"]')){
      setTimeout(()=>setNavActive("money"),0);
      setTimeout(()=>setNavActive("money"),150);
      setTimeout(()=>setNavActive("money"),400);
    }
  },true);

  // 暴露給其他自訂頁使用
  window.setSideNavActiveV128=setNavActive;
})();

/* v12.9 保險修正：營收備份頁開側欄時補 active */
(function(){
  function qa(s,root){return Array.from((root||document).querySelectorAll(s))}
  function fixMoneyActive(){
    const title=document.querySelector("#title")?.textContent||"";
    if(!title.includes("營收備份")) return;
    qa('.side button[data-page]').forEach(btn=>{
      btn.classList.toggle("active", btn.dataset.page === "money");
    });
  }
  document.addEventListener("click", e=>{
    if(e.target.closest("#menu") || e.target.closest('.side button[data-page="money"]')){
      setTimeout(fixMoneyActive,0);
      setTimeout(fixMoneyActive,100);
      setTimeout(fixMoneyActive,300);
    }
  }, true);
  setTimeout(fixMoneyActive,500);
  window.fixMoneyNavActiveV129=fixMoneyActive;
})();

(function(){
  const STATUSES=["待施工","施工中","已完工","已交車"];
  function q(s){return document.querySelector(s)}
  function qa(s,root){return Array.from((root||document).querySelectorAll(s))}
  function key(){try{if(typeof KEY!=="undefined")return KEY}catch{} return "shaochi_v62_data"}
  function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
  function norm(s){s=String(s||"").trim();return STATUSES.includes(s)?s:"待施工"}
  function readDb(){try{if(typeof db!=="undefined"&&db)return db;return JSON.parse(localStorage.getItem(key())||"{}")}catch{return {orders:[],customers:[],catalog:[]}}}
  function writeDb(data){localStorage.setItem(key(),JSON.stringify(data));try{db=data}catch{}}
  function findNote(){
    const direct=q("#note")||q("#remark")||q("#memo")||q("textarea[name='note']")||q("textarea[name='remark']");
    if(direct)return direct;
    return qa("textarea").find(t=>{
      const ph=t.getAttribute("placeholder")||"";
      const prev=t.previousElementSibling?.textContent||"";
      return ph.includes("備註")||prev.includes("備註");
    })||null;
  }
  function ensureReceiveStatus(){
    const note=findNote();
    if(!note||q("#receiveWorkStatusV130"))return;
    const wrap=document.createElement("div");
    wrap.className="receive-status-v130";
    wrap.innerHTML=`<label>工單狀態</label><select id="receiveWorkStatusV130">${STATUSES.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("")}</select>`;
    note.insertAdjacentElement("afterend",wrap);
  }
  function getStatus(){return norm(q("#receiveWorkStatusV130")?.value||"待施工")}
  function fp(o){return [String(o.plate||""),String(o.date||""),String(o.name||""),String(o.amount||o.total||""),String(o.km||"")].join("|")}
  function patchNewOrder(beforeRaw,status){
    const data=readDb();
    if(!Array.isArray(data.orders))return false;
    let before={orders:[]};
    try{before=beforeRaw?JSON.parse(beforeRaw):{orders:[]}}catch{}
    const oldSet=new Set((Array.isArray(before.orders)?before.orders:[]).map(fp));
    let target=null;
    for(let i=data.orders.length-1;i>=0;i--){
      if(!oldSet.has(fp(data.orders[i]))){target=data.orders[i];break}
    }
    if(!target&&data.orders.length)target=data.orders[data.orders.length-1];
    if(!target)return false;
    target.workStatus=norm(status);
    target.updatedAt=new Date().toISOString();
    writeDb(data);
    return true;
  }
  function maybePatchCreate(btnText,beforeRaw,status){
    if(!(btnText.includes("完成建立")||btnText.includes("建立工單")||btnText.includes("確認建立")))return;
    setTimeout(()=>{patchNewOrder(beforeRaw,status);try{if(typeof render==="function")render()}catch{}},350);
    setTimeout(()=>patchNewOrder(beforeRaw,status),900);
    setTimeout(()=>{try{if(typeof orderSyncUploadV111==="function")orderSyncUploadV111("建立工單狀態")}catch{}},1200);
  }
  document.addEventListener("click",e=>{
    const btn=e.target.closest("button");
    if(btn){
      maybePatchCreate((btn.textContent||"").trim(),localStorage.getItem(key())||"",getStatus());
    }
    setTimeout(ensureReceiveStatus,80);
    setTimeout(ensureReceiveStatus,250);
  },true);
  document.addEventListener("submit",e=>{
    const txt=e.target?.textContent||"";
    maybePatchCreate(txt,localStorage.getItem(key())||"",getStatus());
  },true);
  const oldRender=window.render;
  if(typeof oldRender==="function"&&!oldRender.__v130ReceiveStatus){
    const wrapped=function(){const r=oldRender.apply(this,arguments);setTimeout(ensureReceiveStatus,0);setTimeout(ensureReceiveStatus,180);return r};
    wrapped.__v130ReceiveStatus=true;window.render=wrapped;try{render=wrapped}catch{}
  }
  document.addEventListener("input",()=>setTimeout(ensureReceiveStatus,120),true);
  setTimeout(ensureReceiveStatus,500);
  setInterval(ensureReceiveStatus,1500);
  window.ensureReceiveStatusV130=ensureReceiveStatus;
})();

/* v14.0 Preview 內部成本 / 毛利基礎版 */
(function(){
  const STATUSES=["待施工","施工中","已完工","已交車"];
  function q(s){return document.querySelector(s)}
  function qa(s,root){return Array.from((root||document).querySelectorAll(s))}
  function money(n){return "$"+Number(n||0).toLocaleString("zh-TW")}
  function key(){try{if(typeof KEY!=="undefined")return KEY}catch{} return "shaochi_v62_data"}
  function num(v){const n=Number(String(v??"").replace(/[^\d.-]/g,""));return isNaN(n)?0:n}
  function readDb(){try{if(typeof db!=="undefined"&&db)return db;return JSON.parse(localStorage.getItem(key())||"{}")}catch{return {orders:[],customers:[],catalog:[]}}}
  function writeDb(d){localStorage.setItem(key(),JSON.stringify(d));try{db=d}catch{}}
  function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
  function thisMonth(){return today().slice(0,7)}
  function dateKey(s){s=String(s||"").trim();const m=s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);if(m)return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;const d=new Date(s);if(!isNaN(d.getTime()))return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;return ""}
  function orderAmount(o){return num(o?.amount??o?.total??0)}
  function orderCost(o){return num(o?.internalCost??o?.costTotal??0)}
  function fp(o){return [String(o.plate||""),String(o.date||""),String(o.name||""),String(o.amount||o.total||""),String(o.km||"")].join("|")}
  function findNote(){
    const direct=q("#note")||q("#remark")||q("#memo")||q("textarea[name='note']")||q("textarea[name='remark']");
    if(direct)return direct;
    return qa("textarea").find(t=>{
      const ph=t.getAttribute("placeholder")||"";
      const prev=t.previousElementSibling?.textContent||"";
      return ph.includes("備註")||prev.includes("備註");
    })||null;
  }
  function ensureCostField(){
    const note=findNote();
    if(!note||q("#internalCostV131"))return;
    const box=document.createElement("div");
    box.className="cost-internal-v131";
    box.innerHTML='<label>成本（內部用，不會顯示在工單 / 列印單）</label><input id="internalCostV131" type="number" min="0" inputmode="numeric" placeholder="沒填就當 0"><div class="cost-hint-v131">手動輸入品項可在這裡填總成本；工資可留 0。</div>';
    const status=q("#receiveWorkStatusV130");
    const statusWrap=status?status.closest(".receive-status-v130"):null;
    if(statusWrap)statusWrap.insertAdjacentElement("afterend",box);
    else note.insertAdjacentElement("afterend",box);
  }
  function getCost(){return num(q("#internalCostV131")?.value||0)}
  function patchCost(beforeRaw,cost){
    const data=readDb();
    if(!Array.isArray(data.orders))return false;
    let before={orders:[]};
    try{before=beforeRaw?JSON.parse(beforeRaw):{orders:[]}}catch{}
    const oldSet=new Set((Array.isArray(before.orders)?before.orders:[]).map(fp));
    let target=null;
    for(let i=data.orders.length-1;i>=0;i--){
      if(!oldSet.has(fp(data.orders[i]))){target=data.orders[i];break}
    }
    if(!target&&data.orders.length)target=data.orders[data.orders.length-1];
    if(!target)return false;
    target.internalCost=num(cost);
    target.profit=orderAmount(target)-target.internalCost;
    target.updatedAt=new Date().toISOString();
    writeDb(data);
    return true;
  }
  function maybeCreate(text,before,cost){
    if(!(text.includes("完成建立")||text.includes("建立工單")||text.includes("確認建立")))return;
    setTimeout(()=>{patchCost(before,cost);try{if(typeof render==="function")render()}catch{}},420);
    setTimeout(()=>patchCost(before,cost),950);
    setTimeout(()=>{try{if(typeof orderSyncUploadV111==="function")orderSyncUploadV111("建立工單成本")}catch{}},1200);
  }
  function rows(){
    const data=readDb();
    return (Array.isArray(data.orders)?data.orders:[])
      .filter(o=>!String(o.type||o.status||"").includes("估價"))
      .map(o=>{
        const date=dateKey(o.date||o.createdAt||o.updatedAt);
        const amount=orderAmount(o), cost=orderCost(o), paid=num(o.paid||0);
        return {o,date,month:date.slice(0,7),amount,cost,profit:amount-cost,paid,unpaid:Math.max(0,amount-paid)};
      }).filter(x=>x.date);
  }
  function sum(list){return list.reduce((a,x)=>{a.amount+=x.amount;a.cost+=x.cost;a.profit+=x.profit;a.paid+=x.paid;a.unpaid+=x.unpaid;a.count++;return a},{amount:0,cost:0,profit:0,paid:0,unpaid:0,count:0})}
  function enhanceRevenue(){
    const title=q("#title")?.textContent||"";
    if(!title.includes("營收備份"))return;
    const month=q("#rev123Month")?.value||thisMonth();
    const date=q("#rev123Date")?.value||today();
    const all=rows();
    const m=sum(all.filter(x=>x.month===month));
    const d=sum(all.filter(x=>x.date===date));
    const main=qa(".rev123-panel")[0];
    if(main){
      let el=main.querySelector(".rev-profit-v131");
      if(!el){el=document.createElement("div");el.className="rev-profit-v131";main.appendChild(el)}
      el.textContent=`本月成本 ${money(m.cost)}｜本月毛利 ${money(m.profit)}`;
    }
    const minis=qa(".rev123-mini");
    if(minis[1]){
      let el=minis[1].querySelector(".rev-profit-v131");
      if(!el){el=document.createElement("div");el.className="rev-profit-v131";minis[1].appendChild(el)}
      el.textContent=`成本 ${money(d.cost)}｜毛利 ${money(d.profit)}`;
    }
  }
  document.addEventListener("click",e=>{
    const btn=e.target.closest("button");
    if(btn)maybeCreate((btn.textContent||"").trim(),localStorage.getItem(key())||"",getCost());
    setTimeout(ensureCostField,80);
    setTimeout(enhanceRevenue,200);
  },true);
  document.addEventListener("submit",e=>maybeCreate(e.target?.textContent||"",localStorage.getItem(key())||"",getCost()),true);
  document.addEventListener("input",()=>setTimeout(enhanceRevenue,120),true);
  document.addEventListener("change",()=>setTimeout(enhanceRevenue,120),true);
  const oldRender=window.render;
  if(typeof oldRender==="function"&&!oldRender.__v131Cost){
    const wrapped=function(){const r=oldRender.apply(this,arguments);setTimeout(ensureCostField,0);setTimeout(enhanceRevenue,150);return r};
    wrapped.__v131Cost=true;window.render=wrapped;try{render=wrapped}catch{}
  }
  setTimeout(ensureCostField,600);
  setTimeout(enhanceRevenue,800);
  setInterval(()=>{ensureCostField();enhanceRevenue()},1600);
  window.internalCostV131={orderCost,rows,enhanceRevenue};
})();


/* v14 Preview: wrap original save() so every data change has visible autosave feedback. */
(function(){
  const install = () => {
    if(typeof window.save !== 'function' || window.save.__v14Wrapped) return false;
    const originalSave = window.save;
    window.save = function(){
      const result = originalSave.apply(this, arguments);
      try{ window.v14MarkSaved && window.v14MarkSaved(); }catch(e){}
      try{ clearTimeout(window.__v14SyncTimer); window.__v14SyncTimer=setTimeout(()=>window.v14TryAutoSync&&window.v14TryAutoSync(), 800); }catch(e){}
      return result;
    };
    window.save.__v14Wrapped = true;
    return true;
  };
  if(!install()) document.addEventListener('DOMContentLoaded', install);
})();
