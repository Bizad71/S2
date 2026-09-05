const DATA_FILE_NAME = "bizadshop-data.json";

const APP_DB_NAME = "BizadshopAppDB";
const APP_DB_VERSION = 2;

const DATA_STORE = "data";
const HANDLES_STORE = "handles";

const MAIN_DATA_KEY = "main-data";
const MAIN_FOLDER_KEY = "main-folder";


let folderHandle = null;
let folderConnected = false;
let folderPermissionGranted = false;

let database = createEmptyDatabase();

let cart = [];

let initialized = false;


/* ============================================================
   BASIC UTILITIES
   ============================================================ */

function generateId() {
    return (
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 9)
    );
}


function nowISO() {
    return new Date().toISOString();
}


function formatMoney(value) {

    const number = Number(value) || 0;

    return new Intl.NumberFormat("fa-IR").format(number) + " تومان";
}


function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


let toastTimer = null;


function showToast(message) {

    const toast = document.getElementById("toast");

    if (!toast) return;

    toast.textContent = message;

    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}


function setConnectionStatus(message) {

    const element =
        document.getElementById("connectionStatus");

    if (!element) return;

    element.textContent = message;
}


/* ============================================================
   DATABASE
   ============================================================ */

function createEmptyDatabase() {

    return {
        version: 2,

        products: [],

        inventory: {},

        sales: [],

        sale_items: [],

        settings: {}
    };
}


function normalizeDatabase(data) {

    const base = createEmptyDatabase();

    if (!data || typeof data !== "object") {
        return base;
    }

    return {

        version: 2,

        products:
            Array.isArray(data.products)
                ? data.products
                : [],

        inventory:
            data.inventory &&
            typeof data.inventory === "object"
                ? data.inventory
                : {},

        sales:
            Array.isArray(data.sales)
                ? data.sales
                : [],

        sale_items:
            Array.isArray(data.sale_items)
                ? data.sale_items
                : [],

        settings:
            data.settings &&
            typeof data.settings === "object"
                ? data.settings
                : {}
    };
}


/* ============================================================
   INDEXED DB
   ============================================================ */

function openAppDB() {

    return new Promise((resolve, reject) => {

        const request =
            indexedDB.open(
                APP_DB_NAME,
                APP_DB_VERSION
            );


        request.onupgradeneeded = event => {

            const db = event.target.result;


            if (!db.objectStoreNames.contains(DATA_STORE)) {

                db.createObjectStore(DATA_STORE);
            }


            if (!db.objectStoreNames.contains(HANDLES_STORE)) {

                db.createObjectStore(HANDLES_STORE);
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


async function saveLocalDatabase() {

    const db = await openAppDB();


    return new Promise((resolve, reject) => {

        const transaction =
            db.transaction(
                DATA_STORE,
                "readwrite"
            );


        const store =
            transaction.objectStore(DATA_STORE);


        store.put(
            database,
            MAIN_DATA_KEY
        );


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


async function loadLocalDatabase() {

    const db = await openAppDB();


    return new Promise((resolve, reject) => {

        const transaction =
            db.transaction(
                DATA_STORE,
                "readonly"
            );


        const store =
            transaction.objectStore(DATA_STORE);


        const request =
            store.get(MAIN_DATA_KEY);


        request.onsuccess = () => {

            database =
                normalizeDatabase(request.result);

            db.close();

            resolve(database);
        };


        request.onerror = () => {

            db.close();

            reject(request.error);
        };

    });
}


/* ============================================================
   FOLDER HANDLE
   ============================================================ */

async function saveFolderHandle(handle) {

    const db = await openAppDB();


    return new Promise((resolve, reject) => {

        const transaction =
            db.transaction(
                HANDLES_STORE,
                "readwrite"
            );


        transaction
            .objectStore(HANDLES_STORE)
            .put(handle, MAIN_FOLDER_KEY);


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


async function getFolderHandle() {

    const db = await openAppDB();


    return new Promise((resolve, reject) => {

        const transaction =
            db.transaction(
                HANDLES_STORE,
                "readonly"
            );


        const request =
            transaction
                .objectStore(HANDLES_STORE)
                .get(MAIN_FOLDER_KEY);


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


async function deleteFolderHandle() {

    const db = await openAppDB();


    return new Promise((resolve, reject) => {

        const transaction =
            db.transaction(
                HANDLES_STORE,
                "readwrite"
            );


        transaction
            .objectStore(HANDLES_STORE)
            .delete(MAIN_FOLDER_KEY);


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


/* ============================================================
   FOLDER PERMISSION
   ============================================================ */

async function getFolderPermission(handle) {

    if (!handle) return false;

    try {

        const permission =
            await handle.queryPermission({
                mode: "readwrite"
            });

        return permission === "granted";

    } catch (error) {

        return false;
    }
}


async function requestFolderPermission(handle) {

    if (!handle) return false;

    try {

        const permission =
            await handle.requestPermission({
                mode: "readwrite"
            });

        return permission === "granted";

    } catch (error) {

        return false;
    }
}


/* ============================================================
   FOLDER FILE
   ============================================================ */

async function readFolderData(handle) {

    if (!handle) {
        throw new Error("Folder handle not found.");
    }


    const fileHandle =
        await handle.getFileHandle(
            DATA_FILE_NAME
        );


    const file =
        await fileHandle.getFile();


    const text =
        await file.text();


    if (!text.trim()) {

        return createEmptyDatabase();
    }


    const parsed =
        JSON.parse(text);


    return normalizeDatabase(parsed);
}


async function writeDataToFolder(handle, data) {

    if (!handle) {
        throw new Error("Folder handle not found.");
    }


    const fileHandle =
        await handle.getFileHandle(
            DATA_FILE_NAME,
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


/* ============================================================
   DATA CHECK
   ============================================================ */

function hasRealData(data) {

    if (!data) return false;

    return (
        (Array.isArray(data.products) &&
            data.products.length > 0) ||

        (data.inventory &&
            Object.keys(data.inventory).length > 0) ||

        (Array.isArray(data.sales) &&
            data.sales.length > 0) ||

        (Array.isArray(data.sale_items) &&
            data.sale_items.length > 0)
    );
}


/* ============================================================
   CONNECT FOLDER
   ============================================================ */

async function connectSelectedFolder(handle) {

    if (!handle) return false;


    folderHandle = handle;


    await saveFolderHandle(handle);


    const permission =
        await getFolderPermission(handle);


    if (!permission) {

        folderPermissionGranted = false;
        folderConnected = false;

        setConnectionStatus(
            "پوشه متصل نیست؛ اطلاعات محلی فعال است."
        );

        return false;
    }


    folderPermissionGranted = true;


    try {

        const folderData =
            await readFolderData(handle);


        if (hasRealData(folderData)) {

            database =
                normalizeDatabase(folderData);


            await saveLocalDatabase();

        } else {

            await writeDataToFolder(
                handle,
                database
            );
        }


        folderConnected = true;


        setConnectionStatus(
            "پوشه متصل است؛ اطلاعات ذخیره می‌شود."
        );


        await refreshAll();

        return true;

    } catch (error) {

        folderConnected = false;

        setConnectionStatus(
            "پوشه در دسترس نیست؛ اطلاعات محلی فعال است."
        );

        return false;
    }
}


async function chooseFolder() {

    if (!window.showDirectoryPicker) {

        showToast(
            "مرورگر شما از انتخاب پوشه پشتیبانی نمی‌کند."
        );

        return;
    }


    try {

        const handle =
            await window.showDirectoryPicker({
                mode: "readwrite"
            });


        await connectSelectedFolder(handle);

    } catch (error) {

        if (error?.name === "AbortError") {
            return;
        }

        showToast(
            "اتصال پوشه انجام نشد."
        );
    }
}


async function tryAutoConnect() {

    try {

        const handle =
            await getFolderHandle();


        if (!handle) {

            setConnectionStatus(
                "ذخیره‌سازی محلی فعال است."
            );

            return false;
        }


        folderHandle = handle;


        const permission =
            await getFolderPermission(handle);


        if (!permission) {

            folderConnected = false;
            folderPermissionGranted = false;

            setConnectionStatus(
                "اطلاعات محلی فعال است؛ پوشه نیاز به اتصال دارد."
            );

            return false;
        }


        folderPermissionGranted = true;


        const folderData =
            await readFolderData(handle);


        if (hasRealData(folderData)) {

            database =
                normalizeDatabase(folderData);

            await saveLocalDatabase();

        } else {

            await writeDataToFolder(
                handle,
                database
            );
        }


        folderConnected = true;


        setConnectionStatus(
            "پوشه متصل است؛ اطلاعات ذخیره می‌شود."
        );


        await refreshAll();

        return true;

    } catch (error) {

        folderConnected = false;
        folderPermissionGranted = false;

        setConnectionStatus(
            "پوشه موقتاً در دسترس نیست؛ اطلاعات محلی فعال است."
        );

        return false;
    }
}


async function reconnectExistingFolder() {

    if (!folderHandle) {

        folderHandle =
            await getFolderHandle();
    }


    if (!folderHandle) {

        return chooseFolder();
    }


    const granted =
        await requestFolderPermission(
            folderHandle
        );


    if (!granted) {

        folderConnected = false;
        folderPermissionGranted = false;

        setConnectionStatus(
            "اطلاعات محلی فعال است."
        );

        showToast(
            "دسترسی پوشه داده نشد."
        );

        return false;
    }


    return connectSelectedFolder(
        folderHandle
    );
}


/* ============================================================
   SAVE DATABASE
   ============================================================ */

async function saveDatabase() {

    /*
       اول همیشه IndexedDB ذخیره می‌شود.
       بنابراین قطع شدن پوشه باعث از بین رفتن اطلاعات نمی‌شود.
    */

    await saveLocalDatabase();


    /*
       سپس در صورت وجود پوشه و دسترسی،
       فایل JSON نیز به‌روزرسانی می‌شود.
    */

    if (
        folderHandle &&
        folderPermissionGranted
    ) {

        try {

            await writeDataToFolder(
                folderHandle,
                database
            );


            folderConnected = true;


            setConnectionStatus(
                "اطلاعات محلی و فایل پوشه ذخیره شد."
            );

        } catch (error) {

            folderConnected = false;

            setConnectionStatus(
                "اطلاعات محلی ذخیره شد؛ پوشه فعلاً در دسترس نیست."
            );
        }

    } else {

        setConnectionStatus(
            "اطلاعات در حافظه محلی ذخیره شد."
        );
    }
}


/* ============================================================
   PRODUCTS
   ============================================================ */

function getProducts() {

    return database.products;
}


function getProduct(id) {

    return database.products.find(
        product => product.id === id
    );
}


function getProductByBarcode(barcode) {

    const code =
        String(barcode ?? "").trim();


    return database.products.find(
        product =>
            String(product.barcode ?? "").trim() === code
    );
}


function getQuantity(productId) {

    return Number(
        database.inventory[productId] ?? 0
    );
}


function setQuantity(productId, quantity) {

    database.inventory[productId] =
        Math.max(0, Number(quantity) || 0);
}


async function saveProduct(product) {

    const index =
        database.products.findIndex(
            item => item.id === product.id
        );


    if (index >= 0) {

        database.products[index] =
            product;

    } else {

        database.products.push(product);
    }


    if (
        database.inventory[product.id] === undefined
    ) {

        database.inventory[product.id] =
            Number(product.initialQuantity) || 0;
    }


    await saveDatabase();
}


/* ============================================================
   PRODUCT FORM
   ============================================================ */

async function handleProductFormSubmit(event) {

    event.preventDefault();


    const id =
        document.getElementById("productId").value.trim();


    const barcode =
        document.getElementById("productBarcode").value.trim();


    const name =
        document.getElementById("productName").value.trim();


    const category =
        document.getElementById("productCategory").value.trim();


    const purchasePrice =
        Number(
            document.getElementById("purchasePrice").value
        ) || 0;


    const salePrice =
        Number(
            document.getElementById("salePrice").value
        ) || 0;


    const unit =
        document.getElementById("productUnit").value;


    const initialQuantity =
        Number(
            document.getElementById("initialQuantity").value
        ) || 0;


    if (!barcode) {

        showToast("بارکد را وارد کنید.");

        return;
    }


    if (!name) {

        showToast("نام کالا را وارد کنید.");

        return;
    }


    const existingByBarcode =
        getProductByBarcode(barcode);


    if (
        existingByBarcode &&
        existingByBarcode.id !== id
    ) {

        showToast(
            "این بارکد قبلاً برای یک کالا ثبت شده است."
        );

        return;
    }


    const existing =
        id
            ? getProduct(id)
            : null;


    const productId =
        id || generateId();


    const product = {

        id: productId,

        barcode,

        name,

        category,

        purchasePrice,

        salePrice,

        unit,

        createdAt:
            existing?.createdAt || nowISO(),

        updatedAt:
            nowISO()
    };


    if (existing) {

        database.products =
            database.products.map(item =>
                item.id === productId
                    ? product
                    : item
            );

    } else {

        database.products.push(product);

        database.inventory[productId] =
            initialQuantity;
    }


    await saveDatabase();


    closeModal("productModal");


    event.target.reset();


    document.getElementById(
        "productId"
    ).value = "";


    document.getElementById(
        "initialQuantity"
    ).value = "0";


    await refreshAll();


    showToast(
        existing
            ? "کالا ویرایش شد."
            : "کالا با موفقیت اضافه شد."
    );
}


/* ============================================================
   PRODUCT LIST
   ============================================================ */

function renderProducts(search = "") {

    const container =
        document.getElementById("productsList");


    if (!container) return;


    const query =
        String(search ?? "")
            .trim()
            .toLowerCase();


    let products =
        getProducts();


    if (query) {

        products =
            products.filter(product => {

                const name =
                    String(product.name ?? "")
                        .toLowerCase();


                const barcode =
                    String(product.barcode ?? "")
                        .toLowerCase();


                return (
                    name.includes(query) ||
                    barcode.includes(query)
                );
            });
    }


    if (!products.length) {

        container.innerHTML = `
            <div class="empty">
                ${
                    query
                        ? "کالایی پیدا نشد."
                        : "هنوز کالایی ثبت نشده است."
                }
            </div>
        `;

        return;
    }


    container.innerHTML =
        products.map(product => {

            const quantity =
                getQuantity(product.id);


            return `
                <div class="product-card">

                    <div class="product-info">

                        <strong>
                            ${escapeHTML(product.name)}
                        </strong>

                        <small>
                            بارکد:
                            ${escapeHTML(product.barcode)}
                            ${
                                product.category
                                    ? " • " +
                                      escapeHTML(product.category)
                                    : ""
                            }
                        </small>

                        <div class="product-price">
                            ${formatMoney(product.salePrice)}
                        </div>

                    </div>


                    <div class="product-stock">
                        موجودی:
                        ${quantity}
                        ${escapeHTML(product.unit || "عدد")}
                    </div>


                    <div class="product-actions">

                        <button
                            class="small-button primary"
                            type="button"
                            data-edit-product="${product.id}"
                        >
                            ویرایش
                        </button>

                        <button
                            class="small-button"
                            type="button"
                            data-stock-product="${product.id}"
                        >
                            موجودی
                        </button>

                        <button
                            class="small-button danger"
                            type="button"
                            data-delete-product="${product.id}"
                        >
                            حذف
                        </button>

                    </div>

                </div>
            `;

        }).join("");
}


/* ============================================================
   EDIT PRODUCT
   ============================================================ */

function editProduct(id) {

    const product =
        getProduct(id);


    if (!product) return;


    document.getElementById(
        "productModalTitle"
    ).textContent =
        "ویرایش کالا";


    document.getElementById(
        "productId"
    ).value =
        product.id;


    document.getElementById(
        "productBarcode"
    ).value =
        product.barcode || "";


    document.getElementById(
        "productName"
    ).value =
        product.name || "";


    document.getElementById(
        "productCategory"
    ).value =
        product.category || "";


    document.getElementById(
        "purchasePrice"
    ).value =
        product.purchasePrice || 0;


    document.getElementById(
        "salePrice"
    ).value =
        product.salePrice || 0;


    document.getElementById(
        "productUnit"
    ).value =
        product.unit || "عدد";


    document.getElementById(
        "initialQuantity"
    ).value =
        getQuantity(product.id);


    openModal("productModal");
}


/* ============================================================
   DELETE PRODUCT
   ============================================================ */

async function deleteProduct(id) {

    const product =
        getProduct(id);


    if (!product) return;


    const confirmed =
        confirm(
            `کالای «${product.name}» حذف شود؟`
        );


    if (!confirmed) return;


    database.products =
        database.products.filter(
            item => item.id !== id
        );


    delete database.inventory[id];


    database.sale_items =
        database.sale_items.filter(
            item => item.product_id !== id
        );


    await saveDatabase();


    await refreshAll();


    showToast(
        "کالا حذف شد."
    );
}


/* ============================================================
   INVENTORY MODAL
   ============================================================ */

function openStockModal(id) {

    const product =
        getProduct(id);


    if (!product) return;


    document.getElementById(
        "stockProductId"
    ).value =
        id;


    document.getElementById(
        "stockProductName"
    ).textContent =
        `${product.name} — موجودی فعلی: ${getQuantity(id)}`;


    document.getElementById(
        "stockAction"
    ).value =
        "increase";


    document.getElementById(
        "stockAmount"
    ).value =
        "";


    openModal("stockModal");
}


async function handleStockSubmit(event) {

    event.preventDefault();


    const productId =
        document.getElementById(
            "stockProductId"
        ).value;


    const action =
        document.getElementById(
            "stockAction"
        ).value;


    const amount =
        Number(
            document.getElementById(
                "stockAmount"
            ).value
        );


    if (!productId) return;


    if (
        !Number.isFinite(amount) ||
        amount < 0
    ) {

        showToast(
            "مقدار وارد شده صحیح نیست."
        );

        return;
    }


    const current =
        getQuantity(productId);


    let next =
        current;


    if (action === "increase") {

        next =
            current + amount;

    } else if (action === "decrease") {

        next =
            Math.max(
                0,
                current - amount
            );

    } else if (action === "set") {

        next =
            amount;
    }


    setQuantity(
        productId,
        next
    );


    await saveDatabase();


    closeModal("stockModal");


    await refreshAll();


    showToast(
        "موجودی ذخیره شد."
    );
}


/* ============================================================
   INVENTORY LIST
   ============================================================ */

function renderInventory(search = "") {

    const container =
        document.getElementById(
            "inventoryList"
        );


    if (!container) return;


    const query =
        String(search ?? "")
            .trim()
            .toLowerCase();


    let products =
        getProducts();


    if (query) {

        products =
            products.filter(product => {

                const name =
                    String(product.name ?? "")
                        .toLowerCase();


                const barcode =
                    String(product.barcode ?? "")
                        .toLowerCase();


                return (
                    name.includes(query) ||
                    barcode.includes(query)
                );
            });
    }


    if (!products.length) {

        container.innerHTML = `
            <div class="empty">
                ${
                    query
                        ? "کالایی پیدا نشد."
                        : "موجودی خالی است."
                }
            </div>
        `;

        return;
    }


    container.innerHTML =
        products.map(product => {

            const quantity =
                getQuantity(product.id);


            const low =
                quantity <= 5;


            return `
                <div class="product-card">

                    <div class="product-info">

                        <strong>
                            ${escapeHTML(product.name)}
                        </strong>

                        <small>
                            ${escapeHTML(product.barcode)}
                        </small>

                    </div>


                    <div
                        class="product-stock"
                        style="
                            color:
                            ${low
                                ? "var(--danger)"
                                : "var(--text-light)"};
                            font-weight:
                            ${low ? "800" : "normal"};
                        "
                    >
                        ${quantity}
                        ${escapeHTML(product.unit || "عدد")}
                    </div>


                    <button
                        class="small-button"
                        type="button"
                        data-stock-product="${product.id}"
                    >
                       
