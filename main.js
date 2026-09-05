

const DB_NAME = "BizadShopLocal";
const DB_VERSION = 1;

const HANDLE_STORE = "handles";
const HANDLE_KEY = "database-folder";

let databaseDirectory = null;
let connected = false;

let currentSaleProduct = null;
let selectedProducts = [];

/* =========================================
ELEMENTS
========================================= */

const body =
document.body;

const connectionLight =
document.getElementById("connectionLight");

const lockScreen =
document.getElementById("lockScreen");

const connectButton =
document.getElementById("connectButton");

const folderButton =
document.getElementById("folderButton");

const menuButton =
document.getElementById("menuButton");

const mainMenu =
document.getElementById("mainMenu");

const scanButton =
document.getElementById("scanButton");

const barcodeInput =
document.getElementById("barcodeInput");

const addButton =
document.getElementById("addButton");

const saleProductCard =
document.getElementById("saleProductCard");

const saleProductName =
document.getElementById("saleProductName");

const saleProductBarcode =
document.getElementById("saleProductBarcode");

const saleProductPrice =
document.getElementById("saleProductPrice");

const saleProductStock =
document.getElementById("saleProductStock");

const saleQuantity =
document.getElementById("saleQuantity");

const selectedList =
document.getElementById("selectedList");

const inventoryList =
document.getElementById("inventoryList");

const newProductBarcode =
document.getElementById("newProductBarcode");

const newProductName =
document.getElementById("newProductName");

const newProductPrice =
document.getElementById("newProductPrice");

const newProductStock =
document.getElementById("newProductStock");

const saveProductButton =
document.getElementById("saveProductButton");

const toast =
document.getElementById("toast");

const navItems =
document.querySelectorAll(".nav-item");

const menuItems =
document.querySelectorAll(".menu-item");

const pages =
document.querySelectorAll(".page");

/* =========================================
TOAST
========================================= */

let toastTimer = null;

function showToast(message, type = "") {

clearTimeout(toastTimer);

toast.textContent = message;

toast.className = "toast";

if (type) {
    toast.classList.add(type);
}

toast.classList.add("show");

toastTimer = setTimeout(() => {

    toast.classList.remove("show");

}, 2800);

}

/* =========================================
CONNECTION STATUS
========================================= */

function setConnectionStatus(status) {

connected = status;

if (status) {

    connectionLight.classList.add("connected");

    body.classList.remove("site-locked");

    lockScreen.classList.add("hidden");

} else {

    connectionLight.classList.remove("connected");

    body.classList.add("site-locked");

    lockScreen.classList.remove("hidden");

}

}

/* =========================================
INDEXEDDB
========================================= */

function openHandleDB() {

return new Promise((resolve, reject) => {

    const request =
        indexedDB.open(
            DB_NAME,
            DB_VERSION
        );

    request.onupgradeneeded = () => {

        const db =
            request.result;

        if (
            !db.objectStoreNames.contains(
                HANDLE_STORE
            )
        ) {

            db.createObjectStore(
                HANDLE_STORE
            );

        }

    };

    request.onsuccess = () => {

        resolve(
            request.result
        );

    };

    request.onerror = () => {

        reject(
            request.error
        );

    };

});

}

async function saveDirectoryHandle(handle) {

const db =
    await openHandleDB();

return new Promise(
    (resolve, reject) => {

        const transaction =
            db.transaction(
                HANDLE_STORE,
                "readwrite"
            );

        transaction
            .objectStore(
                HANDLE_STORE
            )
            .put(
                handle,
                HANDLE_KEY
            );

        transaction.oncomplete = () => {

            db.close();

            resolve();

        };

        transaction.onerror = () => {

            db.close();

            reject(
                transaction.error
            );

        };

    }
);

}

async function getSavedDirectoryHandle() {

const db =
    await openHandleDB();

return new Promise(
    (resolve, reject) => {

        const transaction =
            db.transaction(
                HANDLE_STORE,
                "readonly"
            );

        const request =
            transaction
                .objectStore(
                    HANDLE_STORE
                )
                .get(
                    HANDLE_KEY
                );

        request.onsuccess = () => {

            db.close();

            resolve(
                request.result || null
            );

        };

        request.onerror = () => {

            db.close();

            reject(
                request.error
            );

        };

    }
);

}

/* =========================================
PERMISSION
مهم:
در Startup فقط queryPermission می‌کنیم.
requestPermission فقط بعد از کلیک کاربر.
========================================= */

async function hasDirectoryPermission(handle) {

if (!handle) {
    return false;
}

try {

    const permission =
        await handle.queryPermission({
            mode: "readwrite"
        });

    return permission === "granted";

} catch (error) {

    console.error(error);

    return false;

}

}

async function requestDirectoryPermission(handle) {

if (!handle) {
    return false;
}

try {

    const permission =
        await handle.requestPermission({
            mode: "readwrite"
        });

    return permission === "granted";

} catch (error) {

    console.error(error);

    return false;

}

}

/* =========================================
FILE HELPERS
========================================= */

async function writeJSONFile(
directory,
fileName,
data
) {

const fileHandle =
    await directory.getFileHandle(
        fileName,
        {
            create: true
        }
    );

const writable =
    await fileHandle.createWritable();

await writable.write(
    JSON.stringify(
        data,
        null,
        2
    )
);

await writable.close();

}

/*

* این تابع فقط در صورتی فایل را می‌سازد
* که قبلاً وجود نداشته باشد.
* 
* فایل موجود هرگز overwrite نمی‌شود.
  */

async function ensureJSONFile(
directory,
fileName,
initialData
) {

try {

    await directory.getFileHandle(
        fileName,
        {
            create: false
        }
    );

    return false;

} catch (error) {

    if (
        error.name !==
        "NotFoundError"
    ) {

        throw error;

    }

    await writeJSONFile(
        directory,
        fileName,
        initialData
    );

    return true;

}

}

async function readJSONFile(
directory,
fileName,
fallback = []
) {

try {

    const fileHandle =
        await directory.getFileHandle(
            fileName
        );

    const file =
        await fileHandle.getFile();

    const text =
        await file.text();

    if (!text.trim()) {
        return fallback;
    }

    return JSON.parse(text);

} catch (error) {

    if (
        error.name ===
        "NotFoundError"
    ) {

        return fallback;

    }

    console.error(error);

    return fallback;

}

}

async function updateJSONFile(
directory,
fileName,
data
) {

await writeJSONFile(
    directory,
    fileName,
    data
);

}

/* =========================================
FOLDER
========================================= */

async function getFolder(
directory,
folderName
) {

return await directory.getDirectoryHandle(
    folderName,
    {
        create: true
    }
);

}

/* =========================================
DATABASE STRUCTURE
========================================= */

async function createDatabaseStructure(
directory
) {

const system =
    await getFolder(
        directory,
        "system"
    );

const shop =
    await getFolder(
        directory,
        "shop"
    );

const users =
    await getFolder(
        directory,
        "users"
    );

const products =
    await getFolder(
        directory,
        "products"
    );

const inventory =
    await getFolder(
        directory,
        "inventory"
    );

const sales =
    await getFolder(
        directory,
        "sales"
    );

await getFolder(
    directory,
    "backups"
);


/* SYSTEM */

await ensureJSONFile(
    system,
    "database.json",
    {
        database_name: "BizadShop",
        database_id: crypto.randomUUID(),
        created_at:
            new Date().toISOString(),
        last_update:
            new Date().toISOString()
    }
);


await ensureJSONFile(
    system,
    "version.json",
    {
        version: 1
    }
);


/* SHOP */

await ensureJSONFile(
    shop,
    "info.json",
    {
        name: "فروشگاه من",
        phone: "",
        address: "",
        created_at:
            new Date().toISOString()
    }
);


await ensureJSONFile(
    shop,
    "settings.json",
    {
        currency: "تومان",
        invoice_prefix: "INV",
        next_invoice_number: 1
    }
);


/* USERS */

await ensureJSONFile(
    users,
    "users.json",
    []
);


/* PRODUCTS */

await ensureJSONFile(
    products,
    "products.json",
    []
);


/* INVENTORY */

await ensureJSONFile(
    inventory,
    "inventory.json",
    []
);


/* SALES */

await ensureJSONFile(
    sales,
    "invoices.json",
    []
);

await ensureJSONFile(
    sales,
    "items.json",
    []
);

}

/* =========================================
CONNECT DATABASE
========================================= */

async function connectDatabase() {

if (
    !(
        "showDirectoryPicker"
        in window
    )
) {

    showToast(
        "مرورگر شما انتخاب مستقیم پوشه را پشتیبانی نمی‌کند.",
        "error"
    );

    return;

}


try {

    const directory =
        await window.showDirectoryPicker({
            mode: "readwrite"
        });


    const permission =
        await requestDirectoryPermission(
            directory
        );


    if (!permission) {

        showToast(
            "اجازه دسترسی به دیتابیس داده نشد.",
            "error"
        );

        return;

    }


    databaseDirectory =
        directory;


    /*
     * ساختار فقط تکمیل می‌شود.
     * فایل‌های موجود دست‌نخورده می‌مانند.
     */

    await createDatabaseStructure(
        databaseDirectory
    );


    await saveDirectoryHandle(
        databaseDirectory
    );


    setConnectionStatus(true);


    folderButton.textContent =
        "دیتابیس متصل است";


    closeMainMenu();


    await refreshAllData();


    showToast(
        "دیتابیس با موفقیت متصل شد.",
        "success"
    );


} catch (error) {

    console.error(error);

    if (
        error &&
        error.name === "AbortError"
    ) {

        return;

    }

    showToast(
        "اتصال به دیتابیس انجام نشد.",
        "error"
    );

}

}

/* =========================================
RESTORE CONNECTION
========================================= */

async function restoreDatabaseConnection() {

try {

    const savedHandle =
        await getSavedDirectoryHandle();


    if (!savedHandle) {

        setConnectionStatus(false);

        return;

    }


    /*
     * اینجا فقط queryPermission اجرا می‌شود.
     *
     * اگر مرورگر قبلاً مجوز را حفظ کرده باشد:
     * اتصال خودکار انجام می‌شود.
     *
     * اگر مجوز prompt باشد:
     * سایت قفل می‌ماند تا کاربر خودش کلیک کند.
     */

    const permission =
        await hasDirectoryPermission(
            savedHandle
        );


    if (!permission) {

        setConnectionStatus(false);

        folderButton.textContent =
            "اتصال به دیتابیس";

        return;

    }


    databaseDirectory =
        savedHandle;


    setConnectionStatus(true);


    folderButton.textContent =
        "دیتابیس متصل است";


    await refreshAllData();


} catch (error) {

    console.error(error);

    setConnectionStatus(false);

}

}

/* =========================================
NAVIGATION
========================================= */

function showPage(pageId) {

if (!connected) {

    showToast(
        "ابتدا به دیتابیس متصل شوید.",
        "error"
    );

    return;

}


pages.forEach(page => {

    page.classList.remove(
        "active"
    );

});


navItems.forEach(item => {

    item.classList.remove(
        "active"
    );

});


menuItems.forEach(item => {

    item.classList.remove(
        "active"
    );

});


const page =
    document.getElementById(
        pageId
    );


const bottomButton =
    document.querySelector(
        `.nav-item[data-page="${pageId}"]`
    );


const menuButtonItem =
    document.querySelector(
        `.menu-item[data-page="${pageId}"]`
    );


if (page) {

    page.classList.add(
        "active"
    );

}


if (bottomButton) {

    bottomButton.classList.add(
        "active"
    );

}


if (menuButtonItem) {

    menuButtonItem.classList.add(
        "active"
    );

}


closeMainMenu();


if (pageId === "inventoryPage") {

    loadInventory();

}

}

/* =========================================
MAIN MENU
========================================= */

function openMainMenu() {

mainMenu.classList.add(
    "open"
);

}

function closeMainMenu() {

mainMenu.classList.remove(
    "open"
);

}

menuButton.addEventListener(
"click",
event => {

    event.stopPropagation();

    if (
        mainMenu.classList.contains(
            "open"
        )
    ) {

        closeMainMenu();

    } else {

        openMainMenu();

    }

}

);

document.addEventListener(
"click",
event => {

    if (
        !mainMenu.contains(event.target) &&
        !menuButton.contains(event.target)
    ) {

        closeMainMenu();

    }

}

);

menuItems.forEach(item => {

item.addEventListener(
    "click",
    () => {

        showPage(
            item.dataset.page
        );

    }
);

});

/* =========================================
BINARY EYE
========================================= */

function openBinaryEye() {

if (!connected) {

    showToast(
        "ابتدا به دیتابیس متصل شوید.",
        "error"
    );

    return;

}


const returnURL =
    new URL(
        window.location.href
    );


returnURL.search = "";


returnURL.searchParams.set(
    "barcode",
    "{RESULT}"
);


const encodedReturnURL =
    encodeURIComponent(
        returnURL.toString()
    );


const binaryEyeURL =
    `binaryeye://scan?ret=${encodedReturnURL}`;


window.location.href =
    binaryEyeURL;

}

/* =========================================
RECEIVE BINARY EYE RESULT
========================================= */

function receiveBarcodeFromBinaryEye() {

const url =
    new URL(
        window.location.href
    );


const barcode =
    url.searchParams.get(
        "barcode"
    );


if (
    !barcode ||
    barcode === "{RESULT}"
) {

    return;

}


barcodeInput.value =
    barcode;


url.searchParams.delete(
    "barcode"
);


window.history.replaceState(
    {},
    document.title,
    url.pathname +
    url.search +
    url.hash
);


showToast(
    "بارکد با موفقیت دریافت شد.",
    "success"
);


setTimeout(
    () => {

        searchProductForSale(
            barcode
        );

    },
    100
);

}

/* =========================================
BARCODE
========================================= */

function normalizeBarcode(value) {

return String(value || "")
    .trim()
    .replace(/\s+/g, "");

}

async function getProducts() {

if (!databaseDirectory) {
    return [];
}


const productsDirectory =
    await databaseDirectory
        .getDirectoryHandle(
            "products"
        );


return await readJSONFile(
    productsDirectory,
    "products.json",
    []
);

}

async function getInventory() {

if (!databaseDirectory) {
    return [];
}


const inventoryDirectory =
    await databaseDirectory
        .getDirectoryHandle(
            "inventory"
        );


return await readJSONFile(
    inventoryDirectory,
    "inventory.json",
    []
);

}

async function saveProducts(products) {

const productsDirectory =
    await databaseDirectory
        .getDirectoryHandle(
            "products"
        );


await updateJSONFile(
    productsDirectory,
    "products.json",
    products
);

}

async function saveInventory(inventory) {

const inventoryDirectory =
    await databaseDirectory
        .getDirectoryHandle(
            "inventory"
        );


await updateJSONFile(
    inventoryDirectory,
    "inventory.json",
    inventory
);

}

async function barcodeExists(barcode) {

const normalized =
    normalizeBarcode(
        barcode
    );


const products =
    await getProducts();


return products.some(
    product =>
        normalizeBarcode(
            product.barcode
        ) === normalized
);

}

/* =========================================
SEARCH PRODUCT
========================================= */

async function searchProductForSale(
barcode
) {

if (!connected) {
    return;
}


const normalized =
    normalizeBarcode(
        barcode
    );


if (!normalized) {

    saleProductCard.classList.add(
        "empty"
    );

    currentSaleProduct = null;

    return;

}


const products =
    await getProducts();


const product =
    products.find(
        item =>
            normalizeBarcode(
                item.barcode
            ) === normalized
    );


if (!product) {

    saleProductCard.classList.add(
        "empty"
    );

    currentSaleProduct = null;


    showToast(
        "این بارکد در کالاها ثبت نشده است.",
        "error"
    );


    return;

}


const inventory =
    await getInventory();


const stockItem =
    inventory.find(
        item =>
            String(item.product_id) ===
            String(product.id)
    );


const stock =
    stockItem
        ? Number(stockItem.stock || 0)
        : 0;


currentSaleProduct = {
    ...product,
    stock
};


saleProductName.textContent =
    product.name;


saleProductBarcode.textContent =
    product.barcode;


saleProductPrice.textContent =
    formatMoney(
        product.price1
    );


saleProductStock.textContent =
    `${toPersianNumber(stock)} عدد`;


saleQuantity.value = 1;


saleProductCard.classList.remove(
    "empty"
);

}

/* =========================================
SALE ADD
========================================= */

async function addProductToSale() {

if (!connected) {
    return;
}


if (!currentSaleProduct) {

    showToast(
        "ابتدا یک کالا را با بارکد پیدا کنید.",
        "error"
    );

    return;

}


const quantity =
    Number(
        saleQuantity.value
    );


if (
    !Number.isInteger(quantity) ||
    quantity <= 0
) {

    showToast(
        "تعداد واردشده صحیح نیست.",
        "error"
    );

    return;

}


if (
    quantity >
    currentSaleProduct.stock
) {

    showToast(
        "موجودی این کالا کافی نیست.",
        "error"
    );

    return;

}


const existing =
    selectedProducts.find(
        item =>
            String(item.product_id) ===
            String(
                currentSaleProduct.id
            )
    );


if (existing) {

    const newQuantity =
        existing.quantity +
        quantity;


    if (
        newQuantity >
        currentSaleProduct.stock
    ) {

        showToast(
            "تعداد انتخاب‌شده بیشتر از موجودی است.",
            "error"
        );

        return;

    }


    existing.quantity =
        newQuantity;

} else {

    selectedProducts.push({

        product_id:
            currentSaleProduct.id,

        barcode:
            currentSaleProduct.barcode,

        name:
            currentSaleProduct.name,

        unit_price:
            Number(
                currentSaleProduct.price1
            ),

        quantity:
            quantity

    });

}


renderSelectedProducts();

showToast(
    "کالا به فروش اضافه شد.",
    "success"
);

}

/* =========================================
SELECTED PRODUCTS
========================================= */

function renderSelectedProducts() {

if (
    !selectedProducts.length
) {

    selectedList.innerHTML = `
        <div class="empty-message">
            هنوز کالایی برای فروش انتخاب نشده است.
        </div>
    `;

    return;

}


selectedList.innerHTML =
    selectedProducts.map(
        item => `

            <div class="selected-item">

                <div class="selected-name">
                    ${escapeHTML(item.name)}
                </div>

                <div class="selected-price">
                    ${formatMoney(item.unit_price)}
                </div>

                <div class="selected-quantity">
                    × ${toPersianNumber(item.quantity)}
                </div>

            </div>

        `
    ).join("");

}

/* =========================================
ADD NEW PRODUCT
========================================= */

async function addNewProduct() {

if (!connected) {
    return;
}


const barcode =
    normalizeBarcode(
        newProductBarcode.value
    );


const name =
    String(
        newProductName.value || ""
    ).trim();


const price =
    Number(
        newProductPrice.value
    );


const stock =
    Number(
        newProductStock.value
    );


if (!barcode) {

    showToast(
        "بارکد کالا را وارد کنید.",
        "error"
    );

    newProductBarcode.focus();

    return;

}


if (!name) {

    showToast(
        "نام کالا را وارد کنید.",
        "error"
    );

    newProductName.focus();

    return;

}


if (
    !Number.isFinite(price) ||
    price < 0
) {

    showToast(
        "قیمت کالا صحیح نیست.",
        "error"
    );

    return;

}


if (
    !Number.isInteger(stock) ||
    stock < 0
) {

    showToast(
        "موجودی کالا صحیح نیست.",
        "error"
    );

    return;

}


if (
    await barcodeExists(
        barcode
    )
) {

    showToast(
        "این بارکد قبلاً ثبت شده است.",
        "error"
    );

    return;

}


const products =
    await getProducts();


const inventory =
    await getInventory();


const productId =
    crypto.randomUUID();


const now =
    new Date().toISOString();


products.push({

    id:
        productId,

    barcode:
        barcode,

    name:
        name,

    price1:
        price,

    price2:
        null,

    created_at:
        now,

    updated_at:
        now

});


inventory.push({

    product_id:
        productId,

    stock:
        stock,

    updated_at:
        now

});


await saveProducts(
    products
);


await saveInventory(
    inventory
);


newProductBarcode.value = "";
newProductName.value = "";
newProductPrice.value = "";
newProductStock.value = "0";


await loadInventory();

await updateDashboard();


showToast(
    "کالا با موفقیت ثبت شد.",
    "success"
);

}

/* =========================================
INVENTORY
========================================= */

async function loadInventory() {

if (!connected) {
    return;
}


const products =
    await getProducts();


const inventory =
    await getInventory();


if (!products.length) {

    inventoryList.innerHTML = `
        <div class="empty-message">
            هنوز کالایی در انبار ثبت نشده است.
        </div>
    `;

    return;

}


inventoryList.innerHTML =
    products.map(
        product => {

            const stockItem =
                inventory.find(
                    item =>
                        String(
                            item.product_id
                        ) ===
                        String(
                            product.id
                        )
                );


            const stock =
                stockItem
                    ? Number(
                        stockItem.stock || 0
                    )
                    : 0;


            let stockClass =
                "stock-good";

            let progressClass =
                "";

            if (stock === 0) {

                stockClass =
                    "stock-empty";

                progressClass =
                    "empty";

            } else if (stock <= 5) {

                stockClass =
                    "stock-low";

                progressClass =
                    "low";

            }


            const progress =
                Math.min(
                    100,
                    Math.max(
                        3,
                        stock * 5
                    )
                );


            return `

                <div
                    class="inventory-card"
                    data-product-id="${product.id}"
                >

                    <div class="inventory-top">

                        <div class="inventory-name">
                            ${escapeHTML(product.name)}
                        </div>

                        <div
                            class="inventory-stock ${stockClass}"
                        >
                            ${toPersianNumber(stock)}
                            عدد
                        </div>

                    </div>


                    <div class="inventory-bar">

                        <div
                            class="inventory-progress ${progressClass}"
                            style="width:${progress}%"
                        ></div>

                    </div>


                    <div class="inventory-actions">

                        <button
                            class="inventory-action plus"
                            type="button"
                            data-action="plus"
                            data-id="${product.id}"
                        >
                            + افزایش
                        </button>

                        <button
                            class="inventory-action minus"
                            type="button"
                            data-action="minus"
                            data-id="${product.id}"
                        >
                            − کاهش
                        </button>

                        <button
                            class="inventory-action delete"
                            type="button"
                            data-action="delete"
                            data-id="${product.id}"
                        >
                            حذف
                        </button>

                    </div>

                </div>

            `;

        }
    ).join("");

}

/* =========================================
INVENTORY CHANGE
========================================= */

async function changeInventory(
productId,
amount
) {

const inventory =
    await getInventory();


const item =
    inventory.find(
        row =>
            String(row.product_id) ===
            String(productId)
    );


if (!item) {

    showToast(
        "رکورد موجودی کالا پیدا نشد.",
        "error"
    );

    return;

}


const currentStock =
    Number(
        item.stock || 0
    );


const newStock =
    currentStock +
    amount;


if (newStock < 0) {

    showToast(
        "موجودی نمی‌تواند کمتر از صفر باشد.",
        "error"
    );

    return;

}


item.stock =
    newStock;


item.updated_at =
    new Date().toISOString();


await saveInventory(
    inventory
);


await loadInventory();

await updateDashboard();


showToast(
    amount > 0
        ? "موجودی افزایش یافت."
        : "موجودی کاهش یافت.",
    "success"
);

}

/* =========================================
DELETE PRODUCT
========================================= */

async function deleteProduct(
productId
) {

const products =
    await getProducts();


const product =
    products.find(
        item =>
            String(item.id) ===
            String(productId)
    );


if (!product) {

    showToast(
        "کالا پیدا نشد.",
        "error"
    );

    return;

}


const confirmed =
    window.confirm(
        `کالای «${product.name}» حذف شود؟`
    );


if (!confirmed) {
    return;
}


const newProducts =
    products.filter(
        item =>
            String(item.id) !==
            String(productId)
    );


const inventory =
    await getInventory();


const newInventory =
    inventory.filter(
        item =>
            String(item.product_id) !==
            String(productId)
    );


await saveProducts(
    newProducts
);


await saveInventory(
    newInventory
);


selectedProducts =
    selectedProducts.filter(
        item =>
            String(item.product_id) !==
            String(productId)
    );


renderSelectedProducts();

await loadInventory();

await updateDashboard();


showToast(
    "کالا حذف شد.",
    "success"
);

}

/* =========================================
INVENTORY EVENTS
========================================= */

inventoryList.addEventListener(
"click",
async event => {

    const button =
        event.target.closest(
            ".inventory-action"
        );


    if (!button) {
        return;
    }


    const productId =
        button.dataset.id;


    const action =
        button.dataset.action;


    if (action === "plus") {

        await changeInventory(
            productId,
            1
        );

    }


    if (action === "minus") {

        await changeInventory(
            productId,
            -1
        );

    }


    if (action === "delete") {

        await deleteProduct(
            productId
        );

    }

}

);

/* =========================================
DASHBOARD
========================================= */

async function updateDashboard() {

if (!connected) {
    return;
}


const inventory =
    await getInventory();


const totalStock =
    inventory.reduce(
        (
            total,
            item
        ) =>
            total +
            Number(
                item.stock || 0
            ),
        0
    );


const lowStock =
    inventory.filter(
        item =>
            Number(
                item.stock || 0
            ) <= 5
    ).length;


const totalStockElement =
    document.getElementById(
        "totalStock"
    );


const lowStockElement =
    document.getElementById(
        "lowStockCount"
    );


if (totalStockElement) {

    totalStockElement.textContent =
        toPersianNumber(
            totalStock
        );

}


if (lowStockElement) {

    lowStockElement.textContent =
        toPersianNumber(
            lowStock
        );

}

}

/* =========================================
REFRESH DATA
========================================= */

async function refreshAllData() {

if (!connected) {
    return;
}


await loadInventory();

await updateDashboard();

renderSelectedProducts();

}

/* =========================================
UTILITIES
========================================= */

function formatMoney(value) {

const number =
    Number(value || 0);


return (
    new Intl.NumberFormat(
        "fa-IR"
    ).format(number) +
    " تومان"
);

}

function toPersianNumber(value) {

return String(
    value
).replace(
    /\d/g,
    digit =>
        "۰۱۲۳۴۵۶۷۸۹"[digit]
);

}

function escapeHTML(value) {

return String(
    value ?? ""
)
    .replace(
        /&/g,
        "&amp;"
    )
    .replace(
        /</g,
        "&lt;"
    )
    .replace(
        />/g,
        "&gt;"
    )
    .replace(
        /"/g,
        "&quot;"
    )
    .replace(
        /'/g,
        "&#039;"
    );

}

/* =========================================
EVENTS
========================================= */

connectButton.addEventListener(
"click",
connectDatabase
);

folderButton.addEventListener(
"click",
connectDatabase
);

scanButton.addEventListener(
"click",
openBinaryEye
);

addButton.addEventListener(
"click",
addProductToSale
);

saveProductButton.addEventListener(
"click",
addNewProduct
);

barcodeInput.addEventListener(
"change",
() => {

    searchProductForSale(
        barcodeInput.value
    );

}

);

barcodeInput.addEventListener(
"keydown",
event => {

    if (
        event.key ===
        "Enter"
    ) {

        event.preventDefault();

        searchProductForSale(
            barcodeInput.value
        );

    }

}

);

navItems.forEach(item => {

item.addEventListener(
    "click",
    () => {

        showPage(
            item.dataset.page
        );

    }
);

});

/* =========================================
STARTUP
========================================= */

(async function init() {

setConnectionStatus(false);

receiveBarcodeFromBinaryEye();

await restoreDatabaseConnection();

})();
