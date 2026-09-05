const DB_NAME="BizadShopLocal";
const DB_VERSION=1;
const HANDLE_STORE="handles";
const HANDLE_KEY="database-folder";

let databaseDirectory=null;
let connected=false;
let scannerTarget="sale";
let saleCart=[];
let products=[];
let inventory=[];
let productsByBarcode=new Map();
let productsById=new Map();
let inventoryByProductId=new Map();
let shopInfo={};
let shopSettings={};
let invoiceCache=[];
let writeQueue=Promise.resolve();
let toastTimer=null;

const $=id=>document.getElementById(id);

function money(value){
return new Intl.NumberFormat("fa-IR").format(Number(value)||0)+" تومان";
}

function numberFa(value){
return new Intl.NumberFormat("fa-IR").format(Number(value)||0);
}

function normalizeDigits(value=""){
return String(value)
.replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d))
.replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function normalizeBarcode(value=""){
return normalizeDigits(value).trim();
}

function escapeHTML(value=""){
return String(value)
.replace(/&/g,"&")
.replace(/</g,"<")
.replace(/>/g,">")
.replace(/"/g,""")
.replace(/'/g,"'");
}

function toast(message){
clearTimeout(toastTimer);
$("toast").textContent=message;
$("toast").classList.add("show");
toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2300);
}

function setConnectionStatus(state){
connected=state;
$("connectionLight").classList.toggle("connected",state);
$("folderButton").classList.toggle("connected",state);
$("folderButton").textContent=state?"دیتابیس متصل است":"اتصال به دیتابیس";
$("lockScreen").classList.toggle("hidden",state);
document.body.classList.toggle("site-locked",!state);
}

function openHandleDB(){
return new Promise((resolve,reject)=>{
const request=indexedDB.open(DB_NAME,DB_VERSION);
request.onupgradeneeded=()=>{
const db=request.result;
if(!db.objectStoreNames.contains(HANDLE_STORE))db.createObjectStore(HANDLE_STORE);
};
request.onsuccess=()=>resolve(request.result);
request.onerror=()=>reject(request.error);
});
}

async function saveDirectoryHandle(handle){
const db=await openHandleDB();
return new Promise((resolve,reject)=>{
const tx=db.transaction(HANDLE_STORE,"readwrite");
tx.objectStore(HANDLE_STORE).put(handle,HANDLE_KEY);
tx.oncomplete=()=>{db.close();resolve()};
tx.onerror=()=>{db.close();reject(tx.error)};
});
}

async function getSavedDirectoryHandle(){
const db=await openHandleDB();
return new Promise((resolve,reject)=>{
const tx=db.transaction(HANDLE_STORE,"readonly");
const request=tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
request.onsuccess=()=>{db.close();resolve(request.result||null)};
request.onerror=()=>{db.close();reject(request.error)};
});
}

async function hasDirectoryPermission(handle){
if(!handle)return false;
try{
return await handle.queryPermission({mode:"readwrite"})==="granted";
}catch{
return false;
}
}

async function requestDirectoryPermission(handle){
try{
return await handle.requestPermission({mode:"readwrite"})==="granted";
}catch{
return false;
}
}

async function getDirectory(dir,name,create=false){
return await dir.getDirectoryHandle(name,{create});
}

async function getFile(dir,name,create=false){
return await dir.getFileHandle(name,{create});
}

async function readJSON(dir,name,fallback=[]){
try{
const file=await getFile(dir,name,false);
const data=await file.getFile();
const text=await data.text();
if(!text.trim())return fallback;
return JSON.parse(text);
}catch{
return fallback;
}
}

async function writeJSON(dir,name,data){
const file=await getFile(dir,name,true);
const writable=await file.createWritable();
await writable.write(JSON.stringify(data,null,2));
await writable.close();
}

async function queuedWrite(dir,name,data){
writeQueue=writeQueue.then(()=>writeJSON(dir,name,data)).catch(()=>{});
return writeQueue;
}

async function ensureJSONFile(dir,name,initial){
try{
await getFile(dir,name,false);
}catch{
await writeJSON(dir,name,initial);
}
}

async function createDatabaseStructure(){
const system=await getDirectory(databaseDirectory,"system",true);
const shop=await getDirectory(databaseDirectory,"shop",true);
const users=await getDirectory(databaseDirectory,"users",true);
const productsDir=await getDirectory(databaseDirectory,"products",true);
const inventoryDir=await getDirectory(databaseDirectory,"inventory",true);
const sales=await getDirectory(databaseDirectory,"sales",true);
await getDirectory(databaseDirectory,"backups",true);

await ensureJSONFile(system,"database.json",{
id:crypto.randomUUID(),
created_at:new Date().toISOString(),
last_update:new Date().toISOString()
});

await ensureJSONFile(system,"version.json",{
version:"1.0.0"
});

await ensureJSONFile(shop,"info.json",{
name:"فروشگاه من",
phone:"",
address:"",
created_at:new Date().toISOString()
});

await ensureJSONFile(shop,"settings.json",{
currency:"تومان",
invoice_prefix:"INV",
next_invoice_number:1
});

await ensureJSONFile(users,"users.json",[]);
await ensureJSONFile(productsDir,"products.json",[]);
await ensureJSONFile(inventoryDir,"inventory.json",[]);
await ensureJSONFile(sales,"invoices.json",[]);
await ensureJSONFile(sales,"items.json",[]);
}

async function loadDatabaseCache(){
const shopDir=await getDirectory(databaseDirectory,"shop");
const productsDir=await getDirectory(databaseDirectory,"products");
const inventoryDir=await getDirectory(databaseDirectory,"inventory");
const salesDir=await getDirectory(databaseDirectory,"sales");

const results=await Promise.all([
readJSON(shopDir,"info.json",{}),
readJSON(shopDir,"settings.json",{}),
readJSON(productsDir,"products.json",[]),
readJSON(inventoryDir,"inventory.json",[]),
readJSON(salesDir,"invoices.json",[])
]);

shopInfo=results[0]||{};
shopSettings=results[1]||{};
products=Array.isArray(results[2])?results[2]:[];
inventory=Array.isArray(results[3])?results[3]:[];
invoiceCache=Array.isArray(results[4])?results[4]:[];

productsByBarcode.clear();
productsById.clear();
inventoryByProductId.clear();

for(const product of products){
productsById.set(product.id,product);
productsByBarcode.set(normalizeBarcode(product.barcode),product);
}

for(const item of inventory){
inventoryByProductId.set(item.product_id,Number(item.stock)||0);
}

$("shopName").textContent=shopInfo.name||"فروشگاه من";
$("settingsShopName").value=shopInfo.name||"فروشگاه من";
$("settingsCurrency").value=shopSettings.currency||"تومان";
}

async function connectDatabase(){
if(!window.showDirectoryPicker){
toast("این مرورگر از اتصال مستقیم پوشه پشتیبانی نمی‌کند.");
return;
}

try{
const handle=await window.showDirectoryPicker({mode:"readwrite"});
const permission=await requestDirectoryPermission(handle);

if(!permission){
toast("دسترسی به پوشه داده نشد.");
return;
}

databaseDirectory=handle;
await createDatabaseStructure();
await saveDirectoryHandle(handle);
await loadDatabaseCache();

setConnectionStatus(true);
showPage("homePage");
refreshHome();
renderInventory();
}catch(error){
if(error&&error.name==="AbortError")return;
toast("اتصال به دیتابیس انجام نشد.");
}
}

async function restoreDatabaseConnection(){
try{
const handle=await getSavedDirectoryHandle();
if(!handle)return;

const permission=await hasDirectoryPermission(handle);
if(!permission)return;

databaseDirectory=handle;
await createDatabaseStructure();
await loadDatabaseCache();

setConnectionStatus(true);
refreshHome();
renderInventory();
}catch{}
}

function requireConnection(){
if(!connected){
toast("ابتدا دیتابیس را متصل کنید.");
return false;
}
return true;
}

function showPage(pageId){
if(!requireConnection())return;

document.querySelectorAll(".page").forEach(page=>{
page.classList.toggle("active",page.id===pageId);
});

document.querySelectorAll(".nav-btn").forEach(btn=>{
btn.classList.toggle("active",btn.dataset.page===pageId);
});

$("menuOverlay").classList.remove("open");

if(pageId==="homePage")refreshHome();
if(pageId==="inventoryPage")renderInventory();
}

function openMenu(){
if(!connected){
toast("ابتدا دیتابیس را متصل کنید.");
return;
}
$("menuOverlay").classList.add("open");
}

function openProductModal(){
if(!requireConnection())return;
$("productOverlay").classList.add("open");
$("productBarcode").focus();
}

function closeProductModal(){
$("productOverlay").classList.remove("open");
}

function clearProductForm(){
$("productBarcode").value="";
$("productName").value="";
$("productPurchasePrice").value="";
$("productSalePrice").value="";
$("productQuantity").value="0";
$("productCategory").value="نوشیدنی";
$("productUnit").value="عدد";
}

async function registerProduct(){
if(!requireConnection())return;

const barcode=normalizeBarcode($("productBarcode").value);
const name=$("productName").value.trim();
const category=$("productCategory").value;
const purchasePrice=Number(normalizeDigits($("productPurchasePrice").value))||0;
const salePrice=Number(normalizeDigits($("productSalePrice").value))||0;
const unit=$("productUnit").value;
const quantity=Math.max(0,Number(normalizeDigits($("productQuantity").value))||0);

if(!barcode){
toast("بارکد را وارد کنید.");
return;
}

if(!name){
toast("نام کالا را وارد کنید.");
return;
}

if(productsByBarcode.has(barcode)){
toast("این بارکد قبلاً ثبت شده است.");
return;
}

const product={
id:crypto.randomUUID(),
barcode,
name,
category,
purchase_price:purchasePrice,
sale_price:salePrice,
unit,
created_at:new Date().toISOString()
};

const stockItem={
product_id:product.id,
stock:quantity
};

products.push(product);
inventory.push(stockItem);
productsById.set(product.id,product);
productsByBarcode.set(barcode,product);
inventoryByProductId.set(product.id,quantity);

const productsDir=await getDirectory(databaseDirectory,"products");
const inventoryDir=await getDirectory(databaseDirectory,"inventory");

await Promise.all([
queuedWrite(productsDir,"products.json",products),
queuedWrite(inventoryDir,"inventory.json",inventory)
]);

clearProductForm();
closeProductModal();
refreshHome();
renderInventory();
toast("کالا با موفقیت ثبت شد.");
}

function findProductByBarcode(barcode){
return productsByBarcode.get(normalizeBarcode(barcode))||null;
}

function showSaleProduct(product){
if(!product){
$("saleProductCard").classList.add("hidden");
return;
}

const stock=inventoryByProductId.get(product.id)||0;

$("saleProductCard").classList.remove("hidden");
$("saleProductName").textContent=product.name;
$("saleProductBarcode").textContent="بارکد: "+product.barcode;
$("saleProductStock").textContent="موجودی: "+numberFa(stock)+" "+(product.unit||"عدد");
$("saleProductPrice").textContent=money(product.sale_price);
$("saleQuantity").value="1";
}

function searchSaleProduct(){
if(!requireConnection())return;

const barcode=normalizeBarcode($("barcodeInput").value);

if(!barcode){
$("saleProductCard").classList.add("hidden");
return;
}

const product=findProductByBarcode(barcode);

if(!product){
$("saleProductCard").classList.add("hidden");
toast("کالایی با این بارکد پیدا نشد.");
return;
}

showSaleProduct(product);
}

function addToCart(){
if(!requireConnection())return;

const barcode=normalizeBarcode($("barcodeInput").value);
const product=findProductByBarcode(barcode);

if(!product){
toast("ابتدا کالا را پیدا کنید.");
return;
}

const stock=inventoryByProductId.get(product.id)||0;
const quantity=Math.max(1,Number(normalizeDigits($("saleQuantity").value))||1);
const existing=saleCart.find(item=>item.productId===product.id);
const current=existing?existing.quantity:0;

if(current+quantity>stock){
toast("تعداد انتخابی بیشتر از موجودی است.");
return;
}

if(existing){
existing.quantity+=quantity;
}else{
saleCart.push({
productId:product.id,
barcode:product.barcode,
name:product.name,
price:Number(product.sale_price)||0,
unit:product.unit||"عدد",
quantity
});
}

$("barcodeInput").value="";
$("saleProductCard").classList.add("hidden");
$("saleQuantity").value="1";
renderCart();
}

function renderCart(){
const list=$("selectedList");

if(!saleCart.length){
list.innerHTML='<div class="cart-empty">هنوز کالایی به فاکتور اضافه نشده است.</div>';
$("saleTotal").textContent=money(0);
return;
}

let total=0;
let html="";

for(let i=0;i<saleCart.length;i++){
const item=saleCart[i];
const lineTotal=item.price*item.quantity;
total+=lineTotal;

html+=`

<div class="cart-item">
<div class="cart-top">
<div class="cart-name">${escapeHTML(item.name)}</div>
<button class="remove-item" data-cart-index="${i}" type="button">حذف</button>
</div>
<div class="cart-details">
<span>${numberFa(item.quantity)} ${escapeHTML(item.unit)}</span>
<span>${money(item.price)} × ${numberFa(item.quantity)}</span>
</div>
<div class="cart-details">
<span>مبلغ کالا</span>
<strong>${money(lineTotal)}</strong>
</div>
</div>`;
}list.innerHTML=html;
$("saleTotal").textContent=money(total);
}

function removeCartItem(index){
saleCart.splice(index,1);
renderCart();
}

async function checkout(){
if(!requireConnection())return;

if(!saleCart.length){
toast("فاکتور خالی است.");
return;
}

for(const item of saleCart){
const current=inventoryByProductId.get(item.productId)||0;
if(item.quantity>current){
toast("موجودی "+item.name+" کافی نیست.");
return;
}
}

const now=new Date().toISOString();
const prefix=shopSettings.invoice_prefix||"INV";
const nextNumber=Number(shopSettings.next_invoice_number)||1;
const invoiceNumber=prefix+"-"+String(nextNumber).padStart(6,"0");

let total=0;

for(const item of saleCart){
total+=item.price*item.quantity;
}

const invoice={
id:crypto.randomUUID(),
invoice_number:invoiceNumber,
created_at:now,
total,
item_count:saleCart.reduce((sum,item)=>sum+item.quantity,0),
status:"completed"
};

const newItems=saleCart.map(item=>({
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
const stock=inventory.find(x=>x.product_id===item.productId);
if(stock){
stock.stock=Math.max(0,(Number(stock.stock)||0)-item.quantity);
inventoryByProductId.set(item.productId,stock.stock);
}
}

invoiceCache.push(invoice);
shopSettings.next_invoice_number=nextNumber+1;

const salesDir=await getDirectory(databaseDirectory,"sales");
const inventoryDir=await getDirectory(databaseDirectory,"inventory");
const shopDir=await getDirectory(databaseDirectory,"shop");

const existingItems=await readJSON(salesDir,"items.json",[]);
const allItems=Array.isArray(existingItems)?existingItems.concat(newItems):newItems;

await Promise.all([
queuedWrite(inventoryDir,"inventory.json",inventory),
queuedWrite(salesDir,"invoices.json",invoiceCache),
queuedWrite(salesDir,"items.json",allItems),
queuedWrite(shopDir,"settings.json",shopSettings)
]);

const systemDir=await getDirectory(databaseDirectory,"system");
const databaseInfo=await readJSON(systemDir,"database.json",{});
databaseInfo.last_update=now;
await queuedWrite(systemDir,"database.json",databaseInfo);

saleCart=[];
renderCart();
refreshHome();
renderInventory();
$("barcodeInput").value="";
$("saleProductCard").classList.add("hidden");

toast("فاکتور "+invoiceNumber+" ثبت شد.");
}

async function changeStock(productId,delta){
if(!requireConnection())return;

const item=inventory.find(x=>x.product_id===productId);

if(!item)return;

const next=Math.max(0,(Number(item.stock)||0)+delta);
item.stock=next;
inventoryByProductId.set(productId,next);

const inventoryDir=await getDirectory(databaseDirectory,"inventory");
await queuedWrite(inventoryDir,"inventory.json",inventory);

refreshHome();
renderInventory();
}

async function deleteProduct(productId){
if(!requireConnection())return;

const product=productsById.get(productId);
if(!product)return;

if(!confirm("کالا حذف شود؟"))return;

products=products.filter(item=>item.id!==productId);
inventory=inventory.filter(item=>item.product_id!==productId);

productsById.delete(productId);
productsByBarcode.delete(normalizeBarcode(product.barcode));
inventoryByProductId.delete(productId);

saleCart=saleCart.filter(item=>item.productId!==productId);

const productsDir=await getDirectory(databaseDirectory,"products");
const inventoryDir=await getDirectory(databaseDirectory,"inventory");

await Promise.all([
queuedWrite(productsDir,"products.json",products),
queuedWrite(inventoryDir,"inventory.json",inventory)
]);

renderInventory();
renderCart();
refreshHome();
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

html+=`

<div class="inventory-item">
<div class="inventory-head">
<div>
<div class="inventory-name">${escapeHTML(product.name)}</div>
<div class="inventory-barcode">بارکد: ${escapeHTML(product.barcode)}</div>
</div>
<div class="inventory-stock">${numberFa(stock)}</div>
</div>
<div class="inventory-barcode">${escapeHTML(product.category||"سایر")} · ${escapeHTML(product.unit||"عدد")}</div>
<div class="inventory-actions">
<button class="stock-btn" data-stock-plus="${product.id}" type="button">+</button>
<button class="stock-btn" data-stock-minus="${product.id}" type="button">−</button>
<button class="delete-btn" data-delete-product="${product.id}" type="button">حذف کالا</button>
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

const today=new Date();
const y=today.getFullYear();
const m=today.getMonth();
const d=today.getDate();

let salesTotal=0;
let invoiceCount=0;

for(const invoice of invoiceCache){
const date=new Date(invoice.created_at);
if(date.getFullYear()===y&&date.getMonth()===m&&date.getDate()===d){
salesTotal+=Number(invoice.total)||0;
invoiceCount++;
}
}

$("todaySales").textContent=money(salesTotal);
$("todaySalesSub").textContent=invoiceCount?numberFa(invoiceCount)+" فاکتور امروز":"بدون فروش";
$("totalStock").textContent=numberFa(stockTotal);
$("lowStock").textContent=numberFa(low);
}

async function saveSettings(){
if(!requireConnection())return;

const name=$("settingsShopName").value.trim()||"فروشگاه من";
const currency=$("settingsCurrency").value;

shopInfo.name=name;
shopSettings.currency=currency;

$("shopName").textContent=name;

const shopDir=await getDirectory(databaseDirectory,"shop");

await Promise.all([
queuedWrite(shopDir,"info.json",shopInfo),
queuedWrite(shopDir,"settings.json",shopSettings)
]);

toast("تنظیمات ذخیره شد.");
}

function launchBinaryEye(target){
if(!requireConnection())return;

scannerTarget=target;

const returnUrl=new URL(window.location.href);
returnUrl.search="";
returnUrl.hash="";
returnUrl.searchParams.set("barcode","{RESULT}");

const ret=encodeURIComponent(returnUrl.toString());
const deepLink="binaryeye://scan?ret="+ret;

window.location.href=deepLink;
}

function handleScannerReturn(){
const params=new URLSearchParams(window.location.search);
const barcode=params.get("barcode");

if(!barcode)return;

const clean=normalizeBarcode(barcode);

if(!clean)return;

const target=scannerTarget;

if(target==="product"){
$("productOverlay").classList.add("open");
$("productBarcode").value=clean;
$("productName").focus();
}else{
showPage("salePage");
$("barcodeInput").value=clean;
searchSaleProduct();
}

history.replaceState({},document.title,window.location.pathname+window.location.hash);
}

document.addEventListener("click",event=>{
const nav=event.target.closest("[data-page]");
if(nav){
showPage(nav.dataset.page);
return;
}

const plus=event.target.closest("[data-stock-plus]");
if(plus){
changeStock(plus.dataset.stockPlus,1);
return;
}

const minus=event.target.closest("[data-stock-minus]");
if(minus){
changeStock(minus.dataset.stockMinus,-1);
return;
}

const del=event.target.closest("[data-delete-product]");
if(del){
deleteProduct(del.dataset.deleteProduct);
return;
}

const remove=event.target.closest("[data-cart-index]");
if(remove){
removeCartItem(Number(remove.dataset.cartIndex));
}
});

$("folderButton").addEventListener("click",connectDatabase);

$("menuButton").addEventListener("click",openMenu);

$("menuOverlay").addEventListener("click",event=>{
if(event.target===$("menuOverlay"))$("menuOverlay").classList.remove("open");
});

$("addProductCard").addEventListener("click",openProductModal);

$("productClose").addEventListener("click",closeProductModal);

$("productOverlay").addEventListener("click",event=>{
if(event.target===$("productOverlay"))closeProductModal();
});

$("productSubmit").addEventListener("click",registerProduct);

$("productScanButton").addEventListener("click",()=>launchBinaryEye("product"));

$("scanButton").addEventListener("click",()=>launchBinaryEye("sale"));

$("barcodeInput").addEventListener("input",()=>{
const value=normalizeBarcode($("barcodeInput").value);
if(value!==$("barcodeInput").value)$("barcodeInput").value=value;
});

$("barcodeInput").addEventListener("keydown",event=>{
if(event.key==="Enter"){
event.preventDefault();
searchSaleProduct();
}
});

$("saleAddButton").addEventListener("click",addToCart);

$("checkoutButton").addEventListener("click",checkout);

$("homeSaleButton").addEventListener("click",()=>showPage("salePage"));

$("saveSettingsButton").addEventListener("click",saveSettings);

window.addEventListener("pageshow",handleScannerReturn);

window.addEventListener("DOMContentLoaded",async()=>{
setConnectionStatus(false);
handleScannerReturn();
await restoreDatabaseConnection();
});
