const DB_NAME="BizadShopLocal";
const DB_VERSION=1;
const HANDLE_STORE="handles";
const HANDLE_KEY="database-folder";

let dbHandle=null;
let connected=false;
let shop={name:"فروشگاه من",phone:"",address:""};
let products=[];
let inventory=[];
let invoices=[];
let saleItems=[];
let productMap=new Map();
let barcodeMap=new Map();
let cart=[];
let currentPage="home";
let scannerTarget="sale";
let toastTimer=null;

const $=id=>document.getElementById(id);

function money(v){
  return new Intl.NumberFormat("fa-IR").format(Number(v)||0);
}

function esc(v){
  return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

function toast(text){
  clearTimeout(toastTimer);
  $("toast").textContent=text;
  $("toast").classList.add("show");
  toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2200);
}

function openIDB(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,DB_VERSION);
    r.onupgradeneeded=()=>{
      if(!r.result.objectStoreNames.contains(HANDLE_STORE))r.result.createObjectStore(HANDLE_STORE);
    };
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error);
  });
}

async function saveHandle(handle){
  const db=await openIDB();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(HANDLE_STORE,"readwrite");
    tx.objectStore(HANDLE_STORE).put(handle,HANDLE_KEY);
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
  });
}

async function getHandle(){
  const db=await openIDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(HANDLE_STORE,"readonly");
    const r=tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
    r.onsuccess=()=>resolve(r.result||null);
    r.onerror=()=>reject(r.error);
  });
}

async function verifyPermission(handle,request=false){
  if(!handle)return false;
  const opts={mode:"readwrite"};
  let p=await handle.queryPermission(opts);
  if(p==="granted")return true;
  if(request){
    p=await handle.requestPermission(opts);
    return p==="granted";
  }
  return false;
}

async function fileExists(dir,name){
  try{
    await dir.getFileHandle(name);
    return true;
  }catch{
    return false;
  }
}

async function ensureJSONFile(dir,name,data){
  if(await fileExists(dir,name))return;
  const h=await dir.getFileHandle(name,{create:true});
  const w=await h.createWritable();
  await w.write(JSON.stringify(data,null,2));
  await w.close();
}

async function writeJSON(path,data){
  let dir=dbHandle;
  for(const part of path.split("/").slice(0,-1))dir=await dir.getDirectoryHandle(part);
  const file=await dir.getFileHandle(path.split("/").pop(),{create:true});
  const w=await file.createWritable();
  await w.write(JSON.stringify(data,null,2));
  await w.close();
}

async function readJSON(path,fallback){
  try{
    let dir=dbHandle;
    for(const part of path.split("/").slice(0,-1))dir=await dir.getDirectoryHandle(part);
    const file=await dir.getFileHandle(path.split("/").pop());
    const f=await file.getFile();
    const text=await f.text();
    return text.trim()?JSON.parse(text):fallback;
  }catch{
    return fallback;
  }
}

async function ensureStructure(){
  const dirs=[
    "system","shop","users","products","inventory","sales","backups"
  ];
  for(const name of dirs)await dbHandle.getDirectoryHandle(name,{create:true});

  await ensureJSONFile(await dbHandle.getDirectoryHandle("system"),"database.json",{
    id:crypto.randomUUID(),
    name:"BizadShop",
    created_at:new Date().toISOString(),
    last_update:new Date().toISOString()
  });

  await ensureJSONFile(await dbHandle.getDirectoryHandle("system"),"version.json",{
    version:"1.0.0"
  });

  await ensureJSONFile(await dbHandle.getDirectoryHandle("shop"),"info.json",shop);
  await ensureJSONFile(await dbHandle.getDirectoryHandle("shop"),"settings.json",{
    currency:"تومان",
    invoice_prefix:"INV",
    next_invoice_number:1
  });

  await ensureJSONFile(await dbHandle.getDirectoryHandle("users"),"users.json",[]);
  await ensureJSONFile(await dbHandle.getDirectoryHandle("products"),"products.json",[]);
  await ensureJSONFile(await dbHandle.getDirectoryHandle("inventory"),"inventory.json",[]);
  await ensureJSONFile(await dbHandle.getDirectoryHandle("sales"),"invoices.json",[]);
  await ensureJSONFile(await dbHandle.getDirectoryHandle("sales"),"items.json",[]);
}

async function loadData(){
  shop=await readJSON("shop/info.json",shop);
  products=await readJSON("products/products.json",[]);
  inventory=await readJSON("inventory/inventory.json",[]);
  invoices=await readJSON("sales/invoices.json",[]);
  saleItems=await readJSON("sales/items.json",[]);

  if(!Array.isArray(products))products=[];
  if(!Array.isArray(inventory))inventory=[];
  if(!Array.isArray(invoices))invoices=[];
  if(!Array.isArray(saleItems))saleItems=[];

  productMap=new Map(products.map(p=>[p.id,p]));
  barcodeMap=new Map(products.map(p=>[String(p.barcode),p]));
}

async function connectDatabase(request=true){
  try{
    if(!("showDirectoryPicker" in window)){
      toast("این مرورگر از اتصال پوشه پشتیبانی نمی‌کند");
      return false;
    }

    if(!dbHandle)dbHandle=await getHandle();

    let permission=dbHandle?await verifyPermission(dbHandle,request):false;

    if(!permission){
      dbHandle=await window.showDirectoryPicker({mode:"readwrite"});
      permission=await verifyPermission(dbHandle,true);
      if(!permission)return false;
      await saveHandle(dbHandle);
    }

    await ensureStructure();
    await loadData();

    connected=true;
    updateConnection();
    $("shopName").textContent=shop.name||"فروشگاه من";
    $("loginView").classList.add("hidden");
    $("appView").classList.remove("hidden");
    showPage(currentPage);
    return true;
  }catch(e){
    console.error(e);
    connected=false;
    updateConnection();
    toast("اتصال به دیتابیس انجام نشد");
    return false;
  }
}

function updateConnection(){
  $("connectionLight").classList.toggle("ok",connected);
}

function inventoryStock(productId){
  const x=inventory.find(i=>i.product_id===productId);
  return x?Number(x.stock)||0:0;
}

async function saveInventory(){
  await writeJSON("inventory/inventory.json",inventory);
}

async function saveProducts(){
  await writeJSON("products/products.json",products);
}

function todayKey(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function todaySales(){
  const today=todayKey();
  return invoices.filter(i=>String(i.created_at||"").slice(0,10)===today)
    .reduce((s,i)=>s+(Number(i.total)||0),0);
}

function showPage(page){
  if(!connected)return;
  currentPage=page;
  $("menu").classList.remove("show");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===page));

  if(page==="home")showHome();
  else if(page==="sale")showSale();
  else if(page==="inventory")showInventory();
  else if(page==="settings")showSettings();
  else if(page==="contact")showContact();
}

function showHome(){
  const low=products.filter(p=>inventoryStock(p.id)<=5);
  $("main").innerHTML=`
    <div class="page-title">مدیریت فروشگاه</div>
    <div class="card">
      <div class="stat-title">فروش امروز</div>
      <div class="stat-value">${money(todaySales())}</div>
    </div>
    <button id="addProductCard" class="card add-card">
      <div class="add-plus">+</div>
      <div class="add-text">ثبت کالا جدید</div>
    </button>
    <div class="section-title low-title">کالاهای رو به اتمام</div>
    <div class="card">
      ${low.length?low.map(p=>`
        <div class="low-item">
          <div>
            <div class="item-name">${esc(p.name)}</div>
            <div class="item-sub">${esc(p.barcode)}</div>
          </div>
          <div class="badge">${money(inventoryStock(p.id))}</div>
        </div>
      `).join(""):`<div class="empty">کالای رو به اتمامی وجود ندارد</div>`}
    </div>
  `;
  $("addProductCard").onclick=openProductModal;
}

function openProductModal(){
  scannerTarget="product";
  $("modalTitle").textContent="ثبت کالا جدید";
  $("modalBody").innerHTML=`
    <div class="field">
      <label>بارکد</label>
      <div class="scan-row">
        <input id="productBarcode" inputmode="numeric">
        <button class="scan-btn" id="productScan">⌁</button>
      </div>
    </div>
    <div class="field">
      <label>نام کالا</label>
      <input id="productName">
    </div>
    <div class="field">
      <label>دسته بندی</label>
      <select id="productCategory">
        <option value="نوشیدنی">نوشیدنی</option>
        <option value="خواربار">خواربار</option>
        <option value="یخچالی">یخچالی</option>
        <option value="تنقلات">تنقلات</option>
        <option value="شوینده">شوینده</option>
        <option value="بهداشتی">بهداشتی</option>
        <option value="لوازم مصرفی">لوازم مصرفی</option>
        <option value="سایر">سایر</option>
      </select>
    </div>
    <div class="row">
      <div class="field">
        <label>قیمت خرید</label>
        <input id="purchasePrice" inputmode="decimal">
      </div>
      <div class="field">
        <label>قیمت فروش</label>
        <input id="salePrice" inputmode="decimal">
      </div>
    </div>
    <div class="row">
      <div class="field">
        <label>واحد</label>
        <input id="productUnit" value="عدد">
      </div>
      <div class="field">
        <label>تعداد</label>
        <input id="productStock" value="0" inputmode="numeric">
      </div>
    </div>
    <button class="primary" id="saveProduct">ثبت</button>
  `;
  $("modalOverlay").classList.add("show");
  $("productBarcode").focus();
  $("productScan").onclick=()=>launchScanner("product");
  $("saveProduct").onclick=registerProduct;
}

async function registerProduct(){
  const barcode=$("productBarcode").value.trim();
  const name=$("productName").value.trim();
  const category=$("productCategory").value;
  const purchase=Number($("purchasePrice").value)||0;
  const sale=Number($("salePrice").value)||0;
  const unit=$("productUnit").value.trim()||"عدد";
  const stock=Math.max(0,Number($("productStock").value)||0);

  if(!barcode)return toast("بارکد را وارد کنید");
  if(!name)return toast("نام کالا را وارد کنید");
  if(barcodeMap.has(barcode))return toast("این بارکد قبلاً ثبت شده است");

  const product={
    id:crypto.randomUUID(),
    barcode,
    name,
    category,
    purchase_price:purchase,
    sale_price:sale,
    unit,
    created_at:new Date().toISOString()
  };

  products.push(product);
  productMap.set(product.id,product);
  barcodeMap.set(barcode,product);
  inventory.push({product_id:product.id,stock});
  
  try{
    await saveProducts();
    await saveInventory();
    closeModal();
    showHome();
    toast("کالا با موفقیت ثبت شد");
  }catch(e){
    products=products.filter(p=>p.id!==product.id);
    inventory=inventory.filter(i=>i.product_id!==product.id);
    productMap.delete(product.id);
    barcodeMap.delete(barcode);
    toast("ذخیره کالا انجام نشد");
  }
}

function showSale(){
  $("main").innerHTML=`
    <div class="page-title">فروش</div>
    <div class="card">
      <div class="field">
        <label>بارکد کالا</label>
        <div class="scan-row">
          <input id="saleBarcode" inputmode="numeric" autocomplete="off">
          <button class="scan-btn" id="saleScan">⌁</button>
        </div>
      </div>
      <div id="saleProduct"></div>
    </div>
    <div class="section-title">سبد فروش</div>
    <div class="card" id="cartBox"></div>
  `;

  $("saleScan").onclick=()=>launchScanner("sale");
  $("saleBarcode").oninput=()=>lookupSale($("saleBarcode").value.trim());
  $("saleBarcode").onkeydown=e=>{
    if(e.key==="Enter")lookupSale($("saleBarcode").value.trim());
  };
  renderCart();
}

function lookupSale(code){
  if(!code){
    $("saleProduct").innerHTML="";
    return;
  }
  const p=barcodeMap.get(code);
  if(!p){
    $("saleProduct").innerHTML=`<div class="empty">کالا پیدا نشد</div>`;
    return;
  }

  const stock=inventoryStock(p.id);
  $("saleProduct").innerHTML=`
    <div class="product-card">
      <div class="product-head">
        <div>
          <div class="item-name">${esc(p.name)}</div>
          <div class="item-sub">${esc(p.barcode)}</div>
        </div>
        <div class="price">${money(p.sale_price)}</div>
      </div>
      <div class="stock">موجودی: ${money(stock)} ${esc(p.unit)}</div>
      <div class="qty-row">
        <button class="qty-btn" id="saleMinus">−</button>
        <input id="saleQty" value="1" inputmode="numeric">
        <button class="qty-btn" id="salePlus">+</button>
      </div>
      <div style="height:9px"></div>
      <button class="primary" id="addToCart">افزودن به سبد</button>
    </div>
  `;

  $("saleMinus").onclick=()=>{
    const q=Math.max(1,(Number($("saleQty").value)||1)-1);
    $("saleQty").value=q;
  };
  $("salePlus").onclick=()=>{
    const q=Math.min(stock,(Number($("saleQty").value)||1)+1);
    $("saleQty").value=q;
  };
  $("addToCart").onclick=()=>{
    const q=Math.max(1,Number($("saleQty").value)||1);
    addToCart(p,q);
  };
}

function addToCart(p,qty){
  const stock=inventoryStock(p.id);
  const existing=cart.find(x=>x.product_id===p.id);
  const newQty=(existing?.quantity||0)+qty;
  if(newQty>stock)return toast("تعداد بیشتر از موجودی است");

  if(existing)existing.quantity=newQty;
  else cart.push({
    product_id:p.id,
    barcode:p.barcode,
    name:p.name,
    unit_price:Number(p.sale_price)||0,
    unit:p.unit,
    quantity:qty
  });

  $("saleBarcode").value="";
  $("saleProduct").innerHTML="";
  renderCart();
}

function renderCart(){
  const box=$("cartBox");
  if(!box)return;

  if(!cart.length){
    box.innerHTML=`<div class="empty">سبد فروش خالی است</div>`;
    return;
  }

  let total=0;
  box.innerHTML=cart.map((x,i)=>{
    const line=x.quantity*x.unit_price;
    total+=line;
    return `
      <div class="cart-row">
        <div class="cart-top">
          <span>${esc(x.name)}</span>
          <button class="small-btn delete-btn" data-remove="${i}">×</button>
        </div>
        <div class="cart-bottom">
          <span>${money(x.quantity)} × ${money(x.unit_price)}</span>
          <strong>${money(line)}</strong>
        </div>
      </div>
    `;
  }).join("")+`
    <div class="total">
      <span>جمع کل</span>
      <span>${money(total)}</span>
    </div>
    <button class="primary" id="checkout">ثبت فروش</button>
  `;

  box.querySelectorAll("[data-remove]").forEach(b=>{
    b.onclick=()=>{
      cart.splice(Number(b.dataset.remove),1);
      renderCart();
    };
  });

  $("checkout").onclick=checkout;
}

async function checkout(){
  if(!cart.length)return toast("سبد فروش خالی است");

  for(const item of cart){
    if(item.quantity>inventoryStock(item.product_id)){
      return toast(`موجودی ${item.name} کافی نیست`);
    }
  }

  const total=cart.reduce((s,x)=>s+x.quantity*x.unit_price,0);
  const invoice={
    id:crypto.randomUUID(),
    invoice_number:String(invoices.length+1),
    created_at:new Date().toISOString(),
    total
  };

  const items=cart.map(x=>({
    id:crypto.randomUUID(),
    invoice_id:invoice.id,
    product_id:x.product_id,
    product_name:x.name,
    barcode:x.barcode,
    quantity:x.quantity,
    unit_price:x.unit_price,
    total:x.quantity*x.unit_price
  }));

  const oldInventory=inventory.map(x=>({...x}));

  for(const item of cart){
    const inv=inventory.find(x=>x.product_id===item.product_id);
    if(inv)inv.stock-=item.quantity;
    else inventory.push({product_id:item.product_id,stock:-item.quantity});
  }

  invoices.push(invoice);
  saleItems.push(...items);

  try{
    await saveInventory();
    await writeJSON("sales/invoices.json",invoices);
    await writeJSON("sales/items.json",saleItems);
    cart=[];
    renderCart();
    toast("فروش با موفقیت ثبت شد");
  }catch(e){
    inventory=oldInventory;
    invoices.pop();
    saleItems.splice(saleItems.length-items.length,items.length);
    toast("ثبت فروش انجام نشد");
  }
}

function showInventory(){
  $("main").innerHTML=`
    <div class="page-title">انبار</div>
    <div class="card">
      <div id="inventoryList"></div>
    </div>
  `;
  renderInventory();
}

function renderInventory(){
  const box=$("inventoryList");
  if(!box)return;

  if(!products.length){
    box.innerHTML=`<div class="empty">هنوز کالایی ثبت نشده است</div>`;
    return;
  }

  box.innerHTML=products.map(p=>`
    <div class="inventory-item">
      <div style="flex:1">
        <div class="item-name">${esc(p.name)}</div>
        <div class="item-sub">${esc(p.barcode)} · ${esc(p.unit)}</div>
      </div>
      <div class="inventory-actions">
        <button class="small-btn" data-minus="${p.id}">−</button>
        <span class="stock-num" id="stock-${p.id}">${money(inventoryStock(p.id))}</span>
        <button class="small-btn" data-plus="${p.id}">+</button>
        <button class="small-btn delete-btn" data-delete="${p.id}">×</button>
      </div>
    </div>
  `).join("");

  box.querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>changeStock(b.dataset.plus,1));
  box.querySelectorAll("[data-minus]").forEach(b=>b.onclick=()=>changeStock(b.dataset.minus,-1));
  box.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteProduct(b.dataset.delete));
}

async function changeStock(productId,delta){
  const inv=inventory.find(x=>x.product_id===productId);
  if(!inv)return;
  const next=Math.max(0,Number(inv.stock)+delta);
  if(next===inv.stock)return;
  inv.stock=next;

  try{
    await saveInventory();
    const el=$(`stock-${productId}`);
    if(el)el.textContent=money(next);
  }catch{
    inv.stock-=delta;
    toast("تغییر موجودی ذخیره نشد");
  }
}

async function deleteProduct(id){
  const p=productMap.get(id);
  if(!p)return;
  if(!confirm(`کالای «${p.name}» حذف شود؟`))return;

  const pi=products.findIndex(x=>x.id===id);
  const ii=inventory.findIndex(x=>x.product_id===id);
  const oldP=products[pi];
  const oldI=ii>=0?inventory[ii]:null;

  products.splice(pi,1);
  if(ii>=0)inventory.splice(ii,1);
  productMap.delete(id);
  barcodeMap.delete(String(p.barcode));

  try{
    await saveProducts();
    await saveInventory();
    renderInventory();
    toast("کالا حذف شد");
  }catch{
    products.splice(pi,0,oldP);
    if(ii>=0)inventory.splice(ii,0,oldI);
    productMap.set(id,oldP);
    barcodeMap.set(String(oldP.barcode),oldP);
    renderInventory();
    toast("حذف کالا انجام نشد");
  }
}

function showSettings(){
  $("main").innerHTML=`
    <div class="page-title">تنظیمات</div>
    <div class="card">
      <div class="connect-box">
        <strong>وضعیت دیتابیس</strong><br>
        ${connected?"دیتابیس متصل است":"دیتابیس متصل نیست"}
      </div>
      <button class="primary" id="reconnect">اتصال به دیتابیس</button>
    </div>
    <div class="card">
      <div class="section-title" style="margin-top:0">فروشگاه</div>
      <div class="item-name">${esc(shop.name||"فروشگاه من")}</div>
      <div class="item-sub">${esc(shop.phone||"")}</div>
    </div>
  `;
  $("reconnect").onclick=()=>connectDatabase(true);
}

function showContact(){
  $("main").innerHTML=`
    <div class="page-title">تماس با ما</div>
    <div class="card">
      <div class="item-name">BizadShop</div>
      <div class="item-sub" style="line-height:2;margin-top:10px">
        برای پشتیبانی و ارتباط با ما می‌توانید از راه‌های ارتباطی مجموعه استفاده کنید.
      </div>
    </div>
  `;
}

function closeModal(){
  $("modalOverlay").classList.remove("show");
  scannerTarget="sale";
}

async function launchScanner(target){
  scannerTarget=target;
  const targetInput=target==="product"?"productBarcode":"saleBarcode";
  const url=new URL(window.location.href);
  url.search="";
  url.hash="";
  url.searchParams.set("barcode","{RESULT}");
  url.searchParams.set("target",target);
  const ret=encodeURIComponent(url.toString());

  try{
    window.location.href=`binaryeye://scan?ret=${ret}`;
  }catch{
    toast("Binary Eye اجرا نشد");
  }
}

function handleScannerReturn(){
  const params=new URLSearchParams(location.search);
  const barcode=params.get("barcode");
  const target=params.get("target");

  if(!barcode)return;

  history.replaceState({},document.title,location.pathname);
  scannerTarget=target==="product"?"product":"sale";

  if(scannerTarget==="product"){
    if(!$("modalOverlay").classList.contains("show"))openProductModal();
    setTimeout(()=>{
      if($("productBarcode")){
        $("productBarcode").value=barcode;
        $("productBarcode").focus();
      }
    },50);
  }else{
    showPage("sale");
    setTimeout(()=>{
      if($("saleBarcode")){
        $("saleBarcode").value=barcode;
        lookupSale(barcode);
      }
    },50);
  }
}

$("menuBtn").onclick=e=>{
  e.stopPropagation();
  $("menu").classList.toggle("show");
};

document.addEventListener("click",e=>{
  if(!$("menu").contains(e.target)&&e.target!==$("menuBtn"))$("menu").classList.remove("show");
});

document.querySelectorAll("[data-page]").forEach(b=>{
  b.onclick=()=>showPage(b.dataset.page);
});

$("modalClose").onclick=closeModal;

$("modalOverlay").onclick=e=>{
  if(e.target===$("modalOverlay"))closeModal();
};

$("connectLoginBtn").onclick=()=>connectDatabase(true);

$("loginBtn").onclick=async()=>{
  const username=$("loginUsername").value.trim();
  const password=$("loginPassword").value;
  if(!username||!password)return toast("نام کاربری و رمز عبور را وارد کنید");
  toast("در این نسخه ورود محلی بعد از اتصال دیتابیس فعال می‌شود");
};

window.addEventListener("pageshow",()=>{
  handleScannerReturn();
  updateConnection();
});

(async()=>{
  try{
    dbHandle=await getHandle();
    if(dbHandle&&await verifyPermission(dbHandle,false)){
      await ensureStructure();
      await loadData();
      connected=true;
      updateConnection();
      $("loginView").classList.add("hidden");
      $("appView").classList.remove("hidden");
      $("shopName").textContent=shop.name||"فروشگاه من";
      showPage(currentPage);
      handleScannerReturn();
    }
  }catch(e){
    console.error(e);
    connected=false;
    updateConnection();
  }
})();
