const DB_NAME="BizadShopLocal";
const DB_VERSION=1;
const HANDLE_STORE="handles";
const HANDLE_KEY="database-folder";

let databaseDirectory=null;
let connected=false;
let scannerTarget="sale";
let products=[];
let inventory=[];
let invoices=[];
let saleCart=[];
let productsByBarcode=new Map();
let productsById=new Map();
let inventoryByProductId=new Map();
let shopInfo={};
let shopSettings={};
let toastTimer=null;
let saveTimer=null;

const $=id=>document.getElementById(id);

function money(value){
return new Intl.NumberFormat("fa-IR").format(Number(value)||0)+" تومان";
}

function fa(value){
return new Intl.NumberFormat("fa-IR").format(Number(value)||0);
}

function normalizeDigits(value=""){
return String(value).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function barcode(value=""){
return normalizeDigits(value).trim();
}

function escapeHTML(value=""){
return String(value).replace(/&/g,"&").replace(/</g,"<").replace(/>/g,">").replace(/"/g,""").replace(/'/g,"'");
}

function toast(message){
clearTimeout(toastTimer);
$("toast").textContent=message;
$("toast").classList.add("show");
toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2200);
}

function setConnection(state){
connected=state;
$("connectionLight").classList.toggle("connected",state);
$("folderButton").classList.toggle("connected",state);
$("folderButton").textContent=state?"دیتابیس متصل است":"اتصال به دیتابیس";
$("lockScreen").classList.toggle("hidden",state);
}

function openIDB(){
return new Promise((resolve,reject)=>{
const request=indexedDB.open(DB_NAME,DB_VERSION);
request.onupgradeneeded=()=>{
if(!request.result.objectStoreNames.contains(HANDLE_STORE)){
request.result.createObjectStore(HANDLE_STORE);
}
};
request.onsuccess=()=>resolve(request.result);
request.onerror=()=>reject(request.error);
});
}

async function saveHandle(handle){
const db=await openIDB();
return new Promise((resolve,reject)=>{
const tx=db.transaction(HANDLE_STORE,"readwrite");
tx.objectStore(HANDLE_STORE).put(handle,HANDLE_KEY);
tx.oncomplete=()=>{db.close();resolve()};
tx.onerror=()=>{db.close();reject(tx.error)};
});
}

async function getHandle(){
const db=await openIDB();
return new Promise((resolve,reject)=>{
const tx=db.transaction(HANDLE_STORE,"readonly");
const req=tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
req.onsuccess=()=>{db.close();resolve(req.result||null)};
req.onerror=()=>{db.close();reject(req.error)};
});
}

async function permission(handle,request=false){
try{
const mode={mode:"readwrite"};
const result=request?await handle.requestPermission(mode):await handle.queryPermission(mode);
return result==="granted";
}catch{
return false;
}
}

async function dir(parent,name){
return parent.getDirectoryHandle(name,{create:true});
}

async function file(parent,name){
return parent.getFileHandle(name,{create:true});
}

async function readJSON(parent,name,fallback){
try{
const f=await parent.getFileHandle(name,{create:false});
const text=await(await f.getFile()).text();
return text.trim()?JSON.parse(text):fallback;
}catch{
return fallback;
}
}

async function writeJSON(parent,name,data){
const f=await file(parent,name);
const w=await f.createWritable();
await w.write(JSON.stringify(data,null,2));
await w.close();
}

async function ensureJSON(parent,name,data){
try{
await parent.getFileHandle(name,{create:false});
}catch{
await writeJSON(parent,name,data);
}
}

async function createStructure(){
const system=await dir(databaseDirectory,"system");
const shop=await dir(databaseDirectory,"shop");
const users=await dir(databaseDirectory,"users");
const productsDir=await dir(databaseDirectory,"products");
const inventoryDir=await dir(databaseDirectory,"inventory");
const sales=await dir(databaseDirectory,"sales");
await dir(databaseDirectory,"backups");

await ensureJSON(system,"database.json",{
id:crypto.randomUUID(),
created_at:new Date().toISOString(),
last_update:new Date().toISOString()
});

await ensureJSON(system,"version.json",{version:"1.0.0"});
await ensureJSON(shop,"info.json",{name:"فروشگاه من",phone:"",address:"",created_at:new Date().toISOString()});
await ensureJSON(shop,"settings.json",{currency:"تومان",invoice_prefix:"INV",next_invoice_number:1});
await ensureJSON(users,"users.json",[]);
await ensureJSON(productsDir,"products.json",[]);
await ensureJSON(inventoryDir,"inventory.json",[]);
await ensureJSON(sales,"invoices.json",[]);
await ensureJSON(sales,"items.json",[]);
}

async function loadCache(){
const shop=await dir(databaseDirectory,"shop");
const productsDir=await dir(databaseDirectory,"products");
const inventoryDir=await dir(databaseDirectory,"inventory");
const sales=await dir(databaseDirectory,"sales");

const [info,settings,p,invs,inv]=await Promise.all([
readJSON(shop,"info.json",{}),
readJSON(shop,"settings.json",{}),
readJSON(productsDir,"products.json",[]),
readJSON(inventoryDir,"inventory.json",[]),
readJSON(sales,"invoices.json",[])
]);

shopInfo=info||{};
shopSettings=settings||{};
products=Array.isArray(p)?p:[];
inventory=Array.isArray(invs)?invs:[];
invoices=Array.isArray(inv)?inv:[];

productsByBarcode=new Map();
productsById=new Map();
inventoryByProductId=new Map();

for(const p of products){
productsByBarcode.set(barcode(p.barcode),p);
productsById.set(p.id,p);
}

for(const i of inventory){
inventoryByProductId.set(i.product_id,Number(i.stock)||0);
}

$("shopName").textContent=shopInfo.name||"فروشگاه من";
$("settingsShopName").value=shopInfo.name||"فروشگاه من";
$("settingsCurrency").value=shopSettings.currency||"تومان";

refreshHome();
renderInventory();
}

async function connectDatabase(){
if(!window.showDirectoryPicker){
toast("مرورگر شما از اتصال پوشه پشتیبانی نمی‌کند.");
return;
}

try{
const handle=await window.showDirectoryPicker({mode:"readwrite"});
if(!await permission(handle,true)){
toast("دسترسی به پوشه داده نشد.");
return;
}

databaseDirectory=handle;
await createStructure();
await saveHandle(handle);
await loadCache();
setConnection(true);
showPage("homePage");
toast("دیتابیس متصل شد.");
}catch(error){
if(error?.name!=="AbortError")toast("اتصال انجام نشد.");
}
}

async function restoreConnection(){
try{
const handle=await getHandle();
if(!handle)return;
if(!await permission(handle,false))return;

databaseDirectory=handle;
await createStructure();
await loadCache();
setConnection(true);
}catch{}
}

function showPage(id){
if(!connected){
toast("ابتدا دیتابیس را متصل کنید.");
return;
}

document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===id));
document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===id));
$("menuOverlay").classList.remove("open");
}

function openMenu(){
if(!connected){
toast("ابتدا دیتابیس را متصل کنید.");
return;
}
$("menuOverlay").classList.add("open");
}

function openProductModal(){
if(!connected)return;
$("productOverlay").classList.add("open");
setTimeout(()=>$("productBarcode").focus(),50);
}

function closeProductModal(){
$("productOverlay").classList.remove("open");
}

function resetProductForm(){
$("productBarcode").value="";
$("productName").value="";
$("productPurchasePrice").value="";
$("productSalePrice").value="";
$("productQuantity").value="0";
$("productCategory").value="نوشیدنی";
$("productUnit").value="عدد";
}

async function saveProductsAndInventory(){
const productsDir=await dir(databaseDirectory,"products");
const inventoryDir=await dir(databaseDirectory,"inventory");

await Promise.all([
writeJSON(productsDir,"products.json",products),
writeJSON(inventoryDir,"inventory.json",inventory)
]);
}

async function registerProduct(){
const code=barcode($("productBarcode").value);
const name=$("productName").value.trim();
const purchase=Number(normalizeDigits($("productPurchasePrice").value))||0;
const sale=Number(normalizeDigits($("productSalePrice").value))||0;
const quantity=Math.max(0,Number(normalizeDigits($("productQuantity").value))||0);
const category=$("productCategory").value;
const unit=$("productUnit").value;

if(!code)return toast("بارکد را وارد کنید.");
if(!name)return toast("نام کالا را وارد کنید.");
if(productsByBarcode.has(code))return toast("این بارکد قبلاً ثبت شده است.");

const product={
id:crypto.randomUUID(),
barcode:code,
name,
category,
purchase_price:purchase,
sale_price:sale,
unit,
created_at:new Date().toISOString()
};

products.push(product);
inventory.push({product_id:product.id,stock:quantity});
productsByBarcode.set(code,product);
productsById.set(product.id,product);
inventoryByProductId.set(product.id,quantity);

await saveProductsAndInventory();

resetProductForm();
closeProductModal();
refreshHome();
renderInventory();
toast("کالا ثبت شد.");
}

function findProduct(code){
return productsByBarcode.get(barcode(code))||null;
}

function searchSaleProduct(){
const code=barcode($("barcodeInput").value);
if(!code){
$("saleProductCard").classList.add("hidden");
return;
}

const product=findProduct(code);

if(!product){
$("saleProductCard").classList.add("hidden");
toast("کالا پیدا نشد.");
return;
}

const stock=inventoryByProductId.get(product.id)||0;

$("saleProductName").textContent=product.name;
$("saleProductBarcode").textContent="بارکد: "+product.barcode;
$("saleProductStock").textContent="موجودی: "+fa(stock)+" "+(product.unit||"عدد");
$("saleProductPrice").textContent=money(product.sale_price);
$("saleProductQuantity").value="1";
$("saleProductCard").classList.remove("hidden");
}

function addToCart(){
const product=findProduct($("barcodeInput").value);
if(!product)return toast("ابتدا کالا را جستجو کنید.");

const stock=inventoryByProductId.get(product.id)||0;
const qty=Math.max(1,Number(normalizeDigits($("saleQuantity").value))||1);
const existing=saleCart.find(x=>x.productId===product.id);
const oldQty=existing?existing.quantity:0;

if(oldQty+qty>stock)return toast("موجودی کافی نیست.");

if(existing){
existing.quantity+=qty;
}else{
saleCart.push({
productId:product.id,
barcode:product.barcode,
name:product.name,
price:Number(product.sale_price)||0,
unit:product.unit||"عدد",
quantity:qty
});
}

$("barcodeInput").value="";
$("saleProductCard").classList.add("hidden");
renderCart();
}

function renderCart(){
const list=$("selectedList");

if(!saleCart.length){
list.innerHTML='<div class="cart-empty">هنوز کالایی به فاکتور اضافه نشده است.</div>';
$("saleTotal").textContent=money(0);
return;
}

let html="";
let total=0;

for(let i=0;i<saleCart.length;i++){
const item=saleCart[i];
const line=item.price*item.quantity;
total+=line;

html+=`<div class="cart-item">

<div class="cart-top">
<div class="cart-name">${escapeHTML(item.name)}</div>
<button class="remove-item" data-remove="${i}" type="button">حذف</button>
</div>
<div class="cart-details">
<span>${fa(item.quantity)} ${escapeHTML(item.unit)}</span>
<span>${money(item.price)} × ${fa(item.quantity)}</span>
</div>
<div class="cart-details">
<span>مبلغ</span>
<strong>${money(line)}</strong>
</div>
</div>`;
}list.innerHTML=html;
$("saleTotal").textContent=money(total);
}

async function checkout(){
if(!saleCart.length)return toast("فاکتور خالی است.");

for(const item of saleCart){
const stock=inventoryByProductId.get(item.productId)||0;
if(item.quantity>stock)return toast("موجودی "+item.name+" کافی نیست.");
}

const now=new Date().toISOString();
const next=Number(shopSettings.next_invoice_number)||1;
const prefix=shopSettings.invoice_prefix||"INV";
const invoiceNumber=prefix+"-"+String(next).padStart(6,"0");

let total=0;
let itemCount=0;

for(const item of saleCart){
total+=item.price*item.quantity;
itemCount+=item.quantity;
}

const invoice={
id:crypto.randomUUID(),
invoice_number:invoiceNumber,
created_at:now,
total,
item_count:itemCount,
status:"completed"
};

const items=saleCart.map(item=>({
id:crypto.randomUUID(),
invoice_id:invoice.id,
product_id:item.productId,
barcode:item.barcode,
product_name:item.name,
unit_price:item.price,
quantity:item.quantity,
total:item.price*item.quantity
}));

for(const item of saleCart){
const row=inventory.find(x=>x.product_id===item.productId);
if(row){
row.stock=Math.max(0,(Number(row.stock)||0)-item.quantity);
inventoryByProductId.set(item.productId,row.stock);
}
}

const sales=await dir(databaseDirectory,"sales");
const inventoryDir=await dir(databaseDirectory,"inventory");
const shop=await dir(databaseDirectory,"shop");

const existingItems=await readJSON(sales,"items.json",[]);
const allItems=Array.isArray(existingItems)?existingItems.concat(items):items;

invoices.push(invoice);
shopSettings.next_invoice_number=next+1;

await Promise.all([
writeJSON(inventoryDir,"inventory.json",inventory),
writeJSON(sales,"invoices.json",invoices),
writeJSON(sales,"items.json",allItems),
writeJSON(shop,"settings.json",shopSettings)
]);

saleCart=[];
renderCart();
refreshHome();
renderInventory();
$("barcodeInput").value="";
$("saleProductCard").classList.add("hidden");

toast("فاکتور "+invoiceNumber+" ثبت شد.");
}

async function changeStock(productId,delta){
const row=inventory.find(x=>x.product_id===productId);
if(!row)return;

row.stock=Math.max(0,(Number(row.stock)||0)+delta);
inventoryByProductId.set(productId,row.stock);

const inventoryDir=await dir(databaseDirectory,"inventory");
await writeJSON(inventoryDir,"inventory.json",inventory);

renderInventory();
refreshHome();
}

async function deleteProduct(productId){
const product=productsById.get(productId);
if(!product)return;
if(!confirm("کالا حذف شود؟"))return;

products=products.filter(x=>x.id!==productId);
inventory=inventory.filter(x=>x.product_id!==productId);
productsById.delete(productId);
productsByBarcode.delete(barcode(product.barcode));
inventoryByProductId.delete(productId);
saleCart=saleCart.filter(x=>x.productId!==productId);

await saveProductsAndInventory();

renderInventory();
refreshHome();
renderCart();
toast("کالا حذف شد.");
}

function renderInventory(){
const list=$("inventoryList");

if(!products.length){
list.innerHTML='<div class="empty-state">کالایی ثبت نشده است.</div>';
return;
}

let html="";

for(const product of products){
const stock=inventoryByProductId.get(product.id)||0;

html+=`<div class="inventory-item">

<div class="inventory-head">
<div>
<div class="inventory-name">${escapeHTML(product.name)}</div>
<div class="inventory-barcode">بارکد: ${escapeHTML(product.barcode)}</div>
</div>
<div class="inventory-stock">${fa(stock)}</div>
</div>
<div class="inventory-barcode">${escapeHTML(product.category||"سایر")} · ${escapeHTML(product.unit||"عدد")}</div>
<div class="inventory-actions">
<button class="stock-btn" data-plus="${product.id}" type="button">+</button>
<button class="stock-btn" data-minus="${product.id}" type="button">−</button>
<button class="delete-btn" data-delete="${product.id}" type="button">حذف کالا</button>
</div>
</div>`;
}list.innerHTML=html;
}

function refreshHome(){
let stockTotal=0;
let low=0;

for(const product of products){
const stock=inventoryByProductId.get(product.id)||0;
stockTotal+=stock;
if(stock<=5)low++;
}

const now=new Date();
let salesTotal=0;
let count=0;

for(const invoice of invoices){
const d=new Date(invoice.created_at);
if(d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate()){
salesTotal+=Number(invoice.total)||0;
count++;
}
}

$("todaySales").textContent=money(salesTotal);
$("todaySalesSub").textContent=count?fa(count)+" فاکتور امروز":"بدون فروش";
$("totalStock").textContent=fa(stockTotal);
$("lowStock").textContent=fa(low);
}

async function saveSettings(){
shopInfo.name=$("settingsShopName").value.trim()||"فروشگاه من";
shopSettings.currency=$("settingsCurrency").value;
$("shopName").textContent=shopInfo.name;

const shop=await dir(databaseDirectory,"shop");

await Promise.all([
writeJSON(shop,"info.json",shopInfo),
writeJSON(shop,"settings.json",shopSettings)
]);

toast("تنظیمات ذخیره شد.");
}

function launchScanner(target){
if(!connected)return;

scannerTarget=target;

const url=new URL(window.location.href);
url.search="";
url.hash="";
url.searchParams.set("barcode","{RESULT}");

const ret=encodeURIComponent(url.toString());
window.location.href="binaryeye://scan?ret="+ret;
}

function scannerReturn(){
const params=new URLSearchParams(window.location.search);
const result=params.get("barcode");

if(!result)return;

const code=barcode(result);

history.replaceState({},document.title,window.location.pathname);

if(scannerTarget==="product"){
$("productOverlay").classList.add("open");
$("productBarcode").value=code;
$("productName").focus();
}else{
showPage("salePage");
$("barcodeInput").value=code;
searchSaleProduct();
}
}

document.addEventListener("click",event=>{
const page=event.target.closest("[data-page]");
if(page){
showPage(page.dataset.page);
return;
}

const plus=event.target.closest("[data-plus]");
if(plus){
changeStock(plus.dataset.plus,1);
return;
}

const minus=event.target.closest("[data-minus]");
if(minus){
changeStock(minus.dataset.minus,-1);
return;
}

const del=event.target.closest("[data-delete]");
if(del){
deleteProduct(del.dataset.delete);
return;
}

const remove=event.target.closest("[data-remove]");
if(remove){
saleCart.splice(Number(remove.dataset.remove),1);
renderCart();
}
});

$("folderButton").addEventListener("click",connectDatabase);
$("menuButton").addEventListener("click",openMenu);

$("menuOverlay").addEventListener("click",e=>{
if(e.target===$("menuOverlay"))$("menuOverlay").classList.remove("open");
});

$("addProductCard").addEventListener("click",openProductModal);
$("productClose").addEventListener("click",closeProductModal);

$("productOverlay").addEventListener("click",e=>{
if(e.target===$("productOverlay"))closeProductModal();
});

$("productSubmit").addEventListener("click",registerProduct);
$("productScanButton").addEventListener("click",()=>launchScanner("product"));
$("scanButton").addEventListener("click",()=>launchScanner("sale"));
$("saleAddButton").addEventListener("click",addToCart);
$("checkoutButton").addEventListener("click",checkout);
$("saveSettingsButton").addEventListener("click",saveSettings);

$("barcodeInput").addEventListener("keydown",e=>{
if(e.key==="Enter"){
e.preventDefault();
searchSaleProduct();
}
});

window.addEventListener("pageshow",scannerReturn);

window.addEventListener("DOMContentLoaded",async()=>{
setConnection(false);
scannerReturn();
await restoreConnection();
});
