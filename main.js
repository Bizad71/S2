
const DB_NAME = "BizadShopLocal";
const DB_VERSION = 1;
const HANDLE_STORE = "handles";
const HANDLE_KEY = "database-folder";

let databaseDirectory = null;
let connected = false;

let saleCart = [];
let currentSaleProduct = null;

/* =========================================
ELEMENTS
========================================= */

const body = document.body;

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

const menuOverlay =
document.getElementById("menuOverlay");

const scanButton =
document.getElementById("scanButton");

const barcodeInput =
document.getElementById("barcodeInput");

const saleProductArea =
document.getElementById("saleProductArea");

const selectedList =
document.getElementById("selectedList");

const checkoutButton =
document.getElementById("checkoutButton");

const newProductCard =
document.getElementById("newProductCard");

const newBarcode =
document.getElementById("newBarcode");

const newBarcodeScan =
document.getElementById("newBarcodeScan");

const newName =
document.getElementById("newName");

const newCategory =
document.getElementById("newCategory");

const purchasePrice =
document.getElementById("purchasePrice");

const salePrice =
document.getElementById("salePrice");

const newUnit =
document.getElementById("newUnit");

const newQuantity =
document.getElementById("newQuantity");

const saveProductButton =
document.getElementById("saveProductButton");

const cancelProductButton =
document.getElementById("cancelProductButton");

const inventoryList =
document.getElementById("inventoryList");

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
FORMAT
========================================= */

function money(value) {

return new Intl.NumberFormat("fa-IR").format(
    Number(value || 0)
);

}

function normalizeBarcode(value) {

return String(value || "")
    .trim()
    .replace(/\s+/g, "");

}

function escapeHTML(value) {

return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}

/* =========================================
CONNECTION
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
INDEXED DB
========================================= */

function openHandleDB() {

return new Promise((resolve, reject) => {

    const request =
        indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {

        const db = request.result;

        if (!db.objectStoreNames.contains(HANDLE_STORE)) {

            db.createObjectStore(HANDLE_STORE);
        }
    };

    request.onsuccess = () => {
        resolve(request.result);
    };

    request.onerror = () => {
        reject(request.error);
    };

});

}

async function saveDirectoryHandle(handle) {

const db =
    await openHandleDB();

return new Promise((resolve, reject) => {

    const transaction =
        db.transaction(
            HANDLE_STORE,
            "readwrite"
        );

    transaction
        .objectStore(HANDLE_STORE)
        .put(handle, HANDLE_KEY);

    transaction.oncomplete = () => {

        db.close();

        resolve();
    };

    transaction.onerror = () => {

        db.close();

        reject(transaction.error);
    };

});

}

async function getSavedDirectoryHandle() {

const db =
    await openHandleDB();

return new Promise((resolve, reject) => {

    const transaction =
        db.transaction(
            HANDLE_STORE,
            "readonly"
        );

    const request =
        transaction
            .objectStore(HANDLE_STORE)
            .get(HANDLE_KEY);

    request.onsuccess = () => {

        db.close();

        resolve(request.result || null);
    };

    request.onerror = () => {

        db.close();

        reject(request.error);
    };

});

}

/* =========================================
PERMISSION
========================================= */

/*

* این تابع فقط وضعیت فعلی مجوز را بررسی می‌کند.
* 
* در Refresh نباید requestPermission اجرا شود،
* چون مرورگر ممکن است بدون کلیک کاربر اجازه ندهد.
  */

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

/*

* این تابع فقط بعد از کلیک کاربر اجرا می‌شود.
  */

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

async function getFolder(
directory,
folderName
) {

return directory.getDirectoryHandle(
    folderName,
    {
        create: true
    }
);

}

async function readJSONFile(
directory,
fileName,
fallback
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

    if (error.name === "NotFoundError") {

        return fallback;
    }

    console.error(error);

    return fallback;
}

}

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

* مهم:
* اگر فایل از قبل وجود داشته باشد،
* به هیچ عنوان دوباره ساخته یا خالی نمی‌شود.
  */

async function ensureJSONFile(
directory,
fileName,
initialData
) {

try {

    await directory.getFileHandle(
        fileName
    );

    return;

} catch (error) {

    if (error.name !== "NotFoundError") {
        throw error;
    }
}

await writeJSONFile(
    directory,
    fileName,
    initialData
);

}

/* =========================================
DATABASE STRUCTURE
========================================= */

async function createDatabaseStructure(directory) {

const system =
    await getFolder(directory, "system");

const shop =
    await getFolder(directory, "shop");

const users =
    await getFolder(directory, "users");

const products =
    await getFolder(directory, "products");

const inventory =
    await getFolder(directory, "inventory");

const sales =
    await getFolder(directory, "sales");

await getFolder(directory, "backups");

await ensureJSONFile(
    system,
    "database.json",
    {
        database_name: "BizadShop",
        database_id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        last_update: new Date().toISOString()
    }
);

await ensureJSONFile(
    system,
    "version.json",
    {
        version: 1
    }
);

await ensureJSONFile(
    shop,
    "info.json",
    {
        name: "فروشگاه من",
        phone: "",
        address: "",
        created_at: new Date().toISOString()
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

await ensureJSONFile(
    users,
    "users.json",
    []
);

await ensureJSONFile(
    products,
    "products.json",
    []
);

await ensureJSONFile(
    inventory,
    "inventory.json",
    []
);

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
CONNECT
========================================= */

async function connectDatabase() {

if (
    !("showDirectoryPicker" in window)
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
            "اجازه دسترسی به پوشه داده نشد.",
            "error"
        );

        return;
    }

    databaseDirectory =
        directory;

    /*
     * این تابع دیگر فایل‌های قبلی
     * را overwrite نمی‌کند.
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
RESTORE AFTER REFRESH
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
     * فقط queryPermission.
     *
     * اگر قبلاً مجوز داده شده باشد،
     * بدون انتخاب دوباره پوشه متصل می‌شود.
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

    await createDatabaseStructure(
        databaseDirectory
    );

    await refreshAllData();

} catch (error) {

    console.error(error);

    setConnectionStatus(false);
}

}

/* =========================================
READ PRODUCTS
========================================= */

async function getProducts() {

if (!databaseDirectory) {
    return [];
}

const productsDirectory =
    await databaseDirectory.getDirectoryHandle(
        "products"
    );

return readJSONFile(
    productsDirectory,
    "products.json",
    []
);

}

async function saveProducts(products) {

const productsDirectory =
    await databaseDirectory.getDirectoryHandle(
        "products"
    );

await writeJSONFile(
    productsDirectory,
    "products.json",
    products
);

}

/* =========================================
INVENTORY DATA
========================================= */

async function getInventory() {

if (!databaseDirectory) {
    return [];
}

const inventoryDirectory =
    await databaseDirectory.getDirectoryHandle(
        "inventory"
    );

return readJSONFile(
    inventoryDirectory,
    "inventory.json",
    []
);

}

async function saveInventory(inventory) {

const inventoryDirectory =
    await databaseDirectory.getDirectoryHandle(
        "inventory"
    );

await writeJSONFile(
    inventoryDirectory,
    "inventory.json",
    inventory
);

}

/* =========================================
BARCODE
========================================= */

async function findProductByBarcode(barcode) {

const normalized =
    normalizeBarcode(barcode);

if (!normalized) {
    return null;
}

const products =
    await getProducts();

return products.find(
    product =>
        normalizeBarcode(product.barcode) ===
        normalized
) || null;

}

async function barcodeExists(barcode) {

return !!(
    await findProductByBarcode(
        barcode
    )
);

}

/* =========================================
BINARY EYE
========================================= */

function openBinaryEye(targetInput) {

if (!connected) {
    return;
}

if (!targetInput) {
    return;
}

/*
 * مشخص می‌کنیم نتیجه اسکن باید
 * وارد کدام input شود.
 */

const target =
    targetInput.id === "newBarcode"
        ? "new"
        : "sale";

sessionStorage.setItem(
    "binaryEyeTarget",
    target
);

/*
 * آدرس برگشت.
 *
 * Binary Eye مقدار {RESULT}
 * را با نتیجه اسکن جایگزین می‌کند.
 */

const returnURL =
    new URL(
        window.location.href
    );

returnURL.search = "";

returnURL.hash = "";

returnURL.searchParams.set(
    "barcode",
    "{RESULT}"
);

const encodedReturnURL =
    encodeURIComponent(
        returnURL.toString()
    );

const binaryEyeURL =
    "binaryeye://scan?ret=" +
    encodedReturnURL;

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

const target =
    sessionStorage.getItem(
        "binaryEyeTarget"
    ) || "sale";

if (target === "new") {

    newBarcode.value =
        barcode;

} else {

    barcodeInput.value =
        barcode;

    /*
     * بعد از برگشت اسکن،
     * کالا همان لحظه جستجو می‌شود.
     */

    loadSaleProduct(barcode);
}

sessionStorage.removeItem(
    "binaryEyeTarget"
);

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

}

/* =========================================
NEW PRODUCT
========================================= */

function clearProductForm() {

newBarcode.value = "";
newName.value = "";
newCategory.value = "نوشیدنی";
purchasePrice.value = "";
salePrice.value = "";
newUnit.value = "عدد";
newQuantity.value = "0";

}

async function saveNewProduct() {

if (!connected) {
    return;
}

const barcode =
    normalizeBarcode(
        newBarcode.value
    );

const name =
    newName.value.trim();

const category =
    newCategory.value;

const buyPrice =
    Number(
        purchasePrice.value || 0
    );

const sellPrice =
    Number(
        salePrice.value || 0
    );

const unit =
    newUnit.value;

const quantity =
    Number(
        newQuantity.value || 0
    );

if (!barcode) {

    showToast(
        "بارکد کالا را وارد کنید.",
        "error"
    );

    newBarcode.focus();

    return;
}

if (!name) {

    showToast(
        "نام کالا را وارد کنید.",
        "error"
    );

    newName.focus();

    return;
}

if (sellPrice <= 0) {

    showToast(
        "قیمت فروش را وارد کنید.",
        "error"
    );

    salePrice.focus();

    return;
}

if (buyPrice < 0 || quantity < 0) {

    showToast(
        "مقادیر واردشده صحیح نیستند.",
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

const productId =
    crypto.randomUUID();

const now =
    new Date().toISOString();

const products =
    await getProducts();

products.push({
    id: productId,
    barcode: barcode,
    name: name,
    category: category,
    purchase_price: buyPrice,
    sale_price: sellPrice,
    unit: unit,
    created_at: now,
    updated_at: now
});

await saveProducts(
    products
);

const inventory =
    await getInventory();

inventory.push({
    product_id: productId,
    barcode: barcode,
    stock: quantity,
    updated_at: now
});

await saveInventory(
    inventory
);

clearProductForm();

await refreshAllData();

showPage("homePage");

showToast(
    "کالا با موفقیت ثبت شد.",
    "success"
);

}

/* =========================================
SALE PRODUCT
========================================= */

async function loadSaleProduct(barcode) {

if (!connected) {
    return;
}

const normalized =
    normalizeBarcode(barcode);

if (!normalized) {

    saleProductArea.innerHTML = "";

    currentSaleProduct = null;

    return;
}

const product =
    await findProductByBarcode(
        normalized
    );

if (!product) {

    currentSaleProduct = null;

    saleProductArea.innerHTML = `
        <div class="empty-box">
            کالایی با این بارکد پیدا نشد.
        </div>
    `;

    return;
}

const inventory =
    await getInventory();

const inventoryItem =
    inventory.find(
        item =>
            item.product_id ===
            product.id
    );

const stock =
    Number(
        inventoryItem?.stock || 0
    );

currentSaleProduct = {
    ...product,
    stock: stock
};

saleProductArea.innerHTML = `

    <div class="product-card">

        <div class="product-name">
            ${escapeHTML(product.name)}
        </div>

        <div class="product-info">

            <div class="info-row">

                <span class="info-label">
                    بارکد
                </span>

                <span class="info-value">
                    ${escapeHTML(product.barcode)}
                </span>

            </div>

            <div class="info-row">

                <span class="info-label">
                    موجودی
                </span>

                <span class="info-value">
                    ${money(stock)} ${escapeHTML(product.unit)}
                </span>

            </div>

            <div class="info-row">

                <span class="info-label">
                    قیمت فروش
                </span>

                <span class="price-value">
                    ${money(product.sale_price)} تومان
                </span>

            </div>

        </div>

        <div class="product-action">

            <button
                id="addSaleProductButton"
                class="add-button"
                type="button"
            >
                اضافه کردن
            </button>

            <input
                id="saleQuantity"
                class="quantity"
                type="number"
                min="1"
                max="${stock}"
                value="1"
            >

        </div>

    </div>
`;

const addButton =
    document.getElementById(
        "addSaleProductButton"
    );

if (addButton) {

    addButton.addEventListener(
        "click",
        addCurrentProductToCart
    );
}

}

/* =========================================
ADD TO CART
========================================= */

async function addCurrentProductToCart() {

if (!currentSaleProduct) {
    return;
}

const quantity =
    Number(
        document.getElementById(
            "saleQuantity"
        )?.value || 1
    );

if (quantity <= 0) {
    return;
}

if (
    quantity >
    Number(currentSaleProduct.stock)
) {

    showToast(
        "موجودی این کالا کافی نیست.",
        "error"
    );

    return;
}

const existing =
    saleCart.find(
        item =>
            item.product_id ===
            currentSaleProduct.id
    );

if (existing) {

    if (
        existing.quantity +
        quantity >
        currentSaleProduct.stock
    ) {

        showToast(
            "تعداد انتخاب‌شده بیشتر از موجودی است.",
            "error"
        );

        return;
    }

    existing.quantity += quantity;

} else {

    saleCart.push({
        product_id:
            currentSaleProduct.id,

        barcode:
            currentSaleProduct.barcode,

        name:
            currentSaleProduct.name,

        unit_price:
            Number(
                currentSaleProduct.sale_price
            ),

        quantity:
            quantity
    });
}

renderSaleCart();

showToast(
    "کالا به فروش اضافه شد.",
    "success"
);

}

/* =========================================
CART
========================================= */

function renderSaleCart() {

if (!saleCart.length) {

    selectedList.innerHTML = `
        <div class="empty-box">
            هنوز کالایی برای فروش انتخاب نشده است.
        </div>
    `;

    return;
}

selectedList.innerHTML =
    saleCart.map(
        (item, index) => `

            <div class="selected-item">

                <div class="selected-name">
                    ${escapeHTML(item.name)}
                </div>

                <div class="selected-price">
                    ${money(item.unit_price)} تومان
                </div>

                <div class="selected-quantity">
                    × ${money(item.quantity)}
                </div>

            </div>
        `
    ).join("");

}

/* =========================================
CHECKOUT
========================================= */

async function checkoutSale() {

if (!connected) {
    return;
}

if (!saleCart.length) {

    showToast(
        "ابتدا کالا به فروش اضافه کنید.",
        "error"
    );

    return;
}

const inventory =
    await getInventory();

/*
 * اول موجودی همه کالاها بررسی می‌شود،
 * بعد هیچ تغییری انجام می‌دهیم.
 */

for (const item of saleCart) {

    const inventoryItem =
        inventory.find(
            row =>
                row.product_id ===
                item.product_id
        );

    if (!inventoryItem) {

        showToast(
            "موجودی یکی از کالاها پیدا نشد.",
            "error"
        );

        return;
    }

    if (
        Number(inventoryItem.stock) <
        Number(item.quantity)
    ) {

        showToast(
            `موجودی ${item.name} کافی نیست.`,
            "error"
        );

        return;
    }
}

const now =
    new Date().toISOString();

const total =
    saleCart.reduce(
        (sum, item) =>
            sum +
            (
                Number(item.unit_price) *
                Number(item.quantity)
            ),
        0
    );

const salesDirectory =
    await databaseDirectory.getDirectoryHandle(
        "sales"
    );

const invoices =
    await readJSONFile(
        salesDirectory,
        "invoices.json",
        []
    );

const items =
    await readJSONFile(
        salesDirectory,
        "items.json",
        []
    );

const invoiceNumber =
    invoices.length + 1;

const invoiceId =
    crypto.randomUUID();

invoices.push({
    id: invoiceId,
    invoice_number: invoiceNumber,
    created_at: now,
    total: total,
    item_count: saleCart.length
});

for (const item of saleCart) {

    items.push({
        id: crypto.randomUUID(),
        invoice_id: invoiceId,
        product_id: item.product_id,
        barcode: item.barcode,

        /*
         * نام و قیمت در زمان فروش ذخیره می‌شوند
         * تا فاکتور قدیمی بعداً تغییر نکند.
         */

        product_name: item.name,
        unit_price: item.unit_price,
        quantity: item.quantity,

        total:
            Number(item.unit_price) *
            Number(item.quantity)
    });

    const inventoryItem =
        inventory.find(
            row =>
                row.product_id ===
                item.product_id
        );

    inventoryItem.stock =
        Number(inventoryItem.stock) -
        Number(item.quantity);

    inventoryItem.updated_at =
        now;
}

await writeJSONFile(
    salesDirectory,
    "invoices.json",
    invoices
);

await writeJSONFile(
    salesDirectory,
    "items.json",
    items
);

await saveInventory(
    inventory
);

saleCart = [];

currentSaleProduct = null;

barcodeInput.value = "";

saleProductArea.innerHTML = "";

renderSaleCart();

await refreshAllData();

showToast(
    "فاکتور با موفقیت ثبت شد.",
    "success"
);

}

/* =========================================
INVENTORY
========================================= */

async function renderInventory() {

if (!connected) {
    return;
}

const products =
    await getProducts();

const inventory =
    await getInventory();

if (!products.length) {

    inventoryList.innerHTML = `
        <div class="empty-box">
            هنوز کالایی ثبت نشده است.
        </div>
    `;

    return;
}

inventoryList.innerHTML =
    products.map(product => {

        const item =
            inventory.find(
                row =>
                    row.product_id ===
                    product.id
            );

        const stock =
            Number(
                item?.stock || 0
            );

        let stockClass =
            "stock-good";

        if (stock === 0) {
            stockClass = "stock-empty";
        } else if (stock <= 5) {
            stockClass = "stock-low";
        }

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
                        ${money(stock)}
                        ${escapeHTML(product.unit)}
                    </div>

                </div>

                <div class="info-row" style="margin-top:10px;">

                    <span class="info-label">
                        بارکد
                    </span>

                    <span class="info-value">
                        ${escapeHTML(product.barcode)}
                    </span>

                </div>

                <div class="inventory-actions">

                    <button
                        class="plus-stock"
                        data-action="plus"
                        data-id="${product.id}"
                    >
                        + زیاد کردن
                    </button>

                    <button
                        class="minus-stock"
                        data-action="minus"
                        data-id="${product.id}"
                    >
                        − کم کردن
                    </button>

                    <button
                        class="delete-stock"
                        data-action="delete"
                        data-id="${product.id}"
                    >
                        حذف کالا
                    </button>

                </div>

            </div>
        `;

    }).join("");

inventoryList
    .querySelectorAll("button[data-action]")
    .forEach(button => {

        button.addEventListener(
            "click",
            handleInventoryAction
        );
    });

}

/* =========================================
INVENTORY ACTION
========================================= */

async function handleInventoryAction(event) {

const button =
    event.currentTarget;

const action =
    button.dataset.action;

const productId =
    button.dataset.id;

if (action === "delete") {

    const confirmed =
        confirm(
            "این کالا و موجودی آن حذف شود؟"
        );

    if (!confirmed) {
        return;
    }

    await deleteProduct(
        productId
    );

    return;
}

const inventory =
    await getInventory();

const item =
    inventory.find(
        row =>
            row.product_id ===
            productId
    );

if (!item) {
    return;
}

if (action === "plus") {

    item.stock =
        Number(item.stock) + 1;
}

if (action === "minus") {

    if (Number(item.stock) <= 0) {

        showToast(
            "موجودی کالا صفر است.",
            "error"
        );

        return;
    }

    item.stock =
        Number(item.stock) - 1;
}

item.updated_at =
    new Date().toISOString();

await saveInventory(
    inventory
);

await refreshAllData();

}

/* =========================================
DELETE PRODUCT
========================================= */

async function deleteProduct(productId) {

const products =
    await getProducts();

const product =
    products.find(
        item =>
            item.id === productId
    );

if (!product) {
    return;
}

const newProducts =
    products.filter(
        item =>
            item.id !== productId
    );

const inventory =
    await getInventory();

const newInventory =
    inventory.filter(
        item =>
            item.product_id !== productId
    );

await saveProducts(
    newProducts
);

await saveInventory(
    newInventory
);

await refreshAllData();

showToast(
    "کالا حذف شد.",
    "success"
);

}

/* =========================================
HOME STATS
========================================= */

async function updateDashboard() {

const products =
    await getProducts();

const inventory =
    await getInventory();

const salesDirectory =
    await databaseDirectory.getDirectoryHandle(
        "sales"
    );

const invoices =
    await readJSONFile(
        salesDirectory,
        "invoices.json",
        []
    );

const totalStock =
    inventory.reduce(
        (sum, item) =>
            sum +
            Number(item.stock || 0),
        0
    );

const lowStock =
    inventory.filter(
        item =>
            Number(item.stock || 0) <= 5
    ).length;

const today =
    new Date()
        .toISOString()
        .slice(0, 10);

const todayInvoices =
    invoices.filter(
        invoice =>
            String(invoice.created_at)
                .slice(0, 10) ===
            today
    );

const todaySales =
    todayInvoices.reduce(
        (sum, invoice) =>
            sum +
            Number(invoice.total || 0),
        0
    );

document.getElementById(
    "todaySales"
).textContent =
    money(todaySales);

document.getElementById(
    "totalStock"
).textContent =
    money(totalStock);

document.getElementById(
    "lowStockCount"
).textContent =
    money(lowStock);

}

/* =========================================
SETTINGS
========================================= */

async function loadShopSettings() {

const shopDirectory =
    await databaseDirectory.getDirectoryHandle(
        "shop"
    );

const info =
    await readJSONFile(
        shopDirectory,
        "info.json",
        {
            name: "فروشگاه من"
        }
    );

document.getElementById(
    "shopNameInput"
).value =
    info.name || "فروشگاه من";

}

async function saveShopSettings() {

const name =
    document.getElementById(
        "shopNameInput"
    ).value.trim();

if (!name) {

    showToast(
        "نام فروشگاه را وارد کنید.",
        "error"
    );

    return;
}

const shopDirectory =
    await databaseDirectory.getDirectoryHandle(
        "shop"
    );

const info =
    await readJSONFile(
        shopDirectory,
        "info.json",
        {}
    );

info.name = name;

await writeJSONFile(
    shopDirectory,
    "info.json",
    info
);

document.querySelector(
    ".shop-name"
).textContent =
    name;

showToast(
    "تنظیمات ذخیره شد.",
    "success"
);

}

/* =========================================
NAVIGATION
========================================= */

function showPage(pageId) {

if (!connected) {
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

const page =
    document.getElementById(
        pageId
    );

const navButton =
    document.querySelector(
        `.nav-item[data-page="${pageId}"]`
    );

if (page) {

    page.classList.add(
        "active"
    );
}

if (navButton) {

    navButton.classList.add(
        "active"
    );
}

menuOverlay.classList.remove(
    "show"
);

if (pageId === "inventoryPage") {
    renderInventory();
}

if (pageId === "settingsPage") {
    loadShopSettings();
}

}

/* =========================================
REFRESH ALL
========================================= */

async function refreshAllData() {

if (!connected || !databaseDirectory) {
    return;
}

await updateDashboard();

await renderInventory();

renderSaleCart();

await loadShopSettings();

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

menuButton.addEventListener(
"click",
() => {

    if (!connected) {
        return;
    }

    menuOverlay.classList.toggle(
        "show"
    );
}

);

menuOverlay.addEventListener(
"click",
event => {

    if (
        event.target ===
        menuOverlay
    ) {

        menuOverlay.classList.remove(
            "show"
        );
    }
}

);

menuItems.forEach(item => {

item.addEventListener(
    "click",
    () => {

        showPage(
            item.dataset.menuPage
        );
    }
);

});

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

newProductCard.addEventListener(
"click",
() => {

    clearProductForm();

    showPage(
        "newProductPage"
    );
}

);

cancelProductButton.addEventListener(
"click",
() => {

    clearProductForm();

    showPage(
        "homePage"
    );
}

);

saveProductButton.addEventListener(
"click",
saveNewProduct
);

newBarcodeScan.addEventListener(
"click",
() => {

    openBinaryEye(
        newBarcode
    );
}

);

scanButton.addEventListener(
"click",
() => {

    openBinaryEye(
        barcodeInput
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

        loadSaleProduct(
            barcodeInput.value
        );
    }
}

);

barcodeInput.addEventListener(
"change",
() => {

    loadSaleProduct(
        barcodeInput.value
    );
}

);

checkoutButton.addEventListener(
"click",
checkoutSale
);

document.getElementById(
"saveSettingsButton"
).addEventListener(
"click",
saveShopSettings
);

/* =========================================
STARTUP
========================================= */

(async function init() {

setConnectionStatus(false);

receiveBarcodeFromBinaryEye();

/*
 * اتصال قبلی را بدون باز کردن دوباره
 * انتخاب پوشه امتحان می‌کنیم.
 */

await restoreDatabaseConnection();

})();
