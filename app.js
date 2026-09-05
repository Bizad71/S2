

/* =========================================================
   BizadShop - Local Database App
   IndexedDB + bizadshop-data.json
   Scanner: Binary Eye
   ========================================================= */

const APP_DB_NAME = "BizadshopAppDB";
const APP_DB_VERSION = 2;

const DATA_STORE = "data";
const HANDLE_STORE = "handles";

const DATA_KEY = "main-data";
const FOLDER_KEY = "main-folder";

const DATA_FILE_NAME = "bizadshop-data.json";

let db = null;
let appData = null;
let folderHandle = null;

let currentPage = "dashboard";
let cart = [];

/* =========================================================
   Default Data
   ========================================================= */

function createEmptyData() {
    return {
        version: 2,
        products: [],
        inventory: {},
        sales: [],
        sale_items: [],
        settings: {}
    };
}

/* =========================================================
   Utility
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}

function money(value) {
    const number = Number(value) || 0;

    return new Intl.NumberFormat("fa-IR").format(number) + " تومان";
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function uid() {
    return (
        Date.now().toString(36) +
        Math.random().toString(36).substring(2, 10)
    );
}

function todayKey() {
    const d = new Date();

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${y}-${m}-${day}`;
}

function showToast(message) {
    let toast = $("toast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";

        toast.style.position = "fixed";
        toast.style.left = "50%";
        toast.style.bottom = "90px";
        toast.style.transform = "translateX(-50%)";
        toast.style.background = "#222";
        toast.style.color = "#fff";
        toast.style.padding = "12px 18px";
        toast.style.borderRadius = "12px";
        toast.style.zIndex = "99999";
        toast.style.fontSize = "14px";
        toast.style.maxWidth = "90%";
        toast.style.textAlign = "center";
        toast.style.boxSizing = "border-box";

        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.display = "block";

    clearTimeout(toast._timer);

    toast._timer = setTimeout(() => {
        toast.style.display = "none";
    }, 2500);
}

/* =========================================================
   IndexedDB
   ========================================================= */

function openDatabase() {
    return new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
            reject(new Error("IndexedDB در این مرورگر پشتیبانی نمی‌شود."));
            return;
        }

        const request = indexedDB.open(
            APP_DB_NAME,
            APP_DB_VERSION
        );

        request.onupgradeneeded = function (event) {
            const database = event.target.result;

            if (!database.objectStoreNames.contains(DATA_STORE)) {
                database.createObjectStore(DATA_STORE);
            }

            if (!database.objectStoreNames.contains(HANDLE_STORE)) {
                database.createObjectStore(HANDLE_STORE);
            }
        };

        request.onsuccess = function () {
            db = request.result;
            resolve(db);
        };

        request.onerror = function () {
            reject(request.error);
        };
    });
}

function idbGet(storeName, key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            storeName,
            "readonly"
        );

        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function idbSet(storeName, key, value) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            storeName,
            "readwrite"
        );

        const store = transaction.objectStore(storeName);
        const request = store.put(value, key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function idbDelete(storeName, key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            storeName,
            "readwrite"
        );

        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/* =========================================================
   Local Database
   ========================================================= */

async function loadLocalDatabase() {
    let data = await idbGet(DATA_STORE, DATA_KEY);

    if (!data) {
        data = createEmptyData();

        await idbSet(
            DATA_STORE,
            DATA_KEY,
            data
        );
    }

    if (!Array.isArray(data.products)) {
        data.products = [];
    }

    if (!data.inventory || typeof data.inventory !== "object") {
        data.inventory = {};
    }

    if (!Array.isArray(data.sales)) {
        data.sales = [];
    }

    if (!Array.isArray(data.sale_items)) {
        data.sale_items = [];
    }

    if (!data.settings || typeof data.settings !== "object") {
        data.settings = {};
    }

    appData = data;

    return appData;
}

async function saveLocalDatabase() {
    if (!appData) {
        return;
    }

    await idbSet(
        DATA_STORE,
        DATA_KEY,
        appData
    );

    await writeFolderFileIfConnected();
}

/* =========================================================
   Folder / File System
   ========================================================= */

async function getSavedFolderHandle() {
    try {
        return await idbGet(
            HANDLE_STORE,
            FOLDER_KEY
        );
    } catch (error) {
        console.error(error);
        return null;
    }
}

async function saveFolderHandle(handle) {
    folderHandle = handle;

    try {
        await idbSet(
            HANDLE_STORE,
            FOLDER_KEY,
            handle
        );
    } catch (error) {
        console.error(error);
    }
}

async function removeFolderHandle() {
    folderHandle = null;

    try {
        await idbDelete(
            HANDLE_STORE,
            FOLDER_KEY
        );
    } catch (error) {
        console.error(error);
    }
}

async function verifyFolderPermission(handle, requestPermission) {
    if (!handle) {
        return false;
    }

    try {
        const options = {
            mode: "readwrite"
        };

        if (
            typeof handle.queryPermission === "function"
        ) {
            const permission =
                await handle.queryPermission(options);

            if (permission === "granted") {
                return true;
            }
        }

        if (
            requestPermission &&
            typeof handle.requestPermission === "function"
        ) {
            const permission =
                await handle.requestPermission(options);

            return permission === "granted";
        }

        return false;
    } catch (error) {
        console.error(error);
        return false;
    }
}

async function readFolderFile(handle) {
    const fileHandle =
        await handle.getFileHandle(
            DATA_FILE_NAME,
            {
                create: false
            }
        );

    const file =
        await fileHandle.getFile();

    const text =
        await file.text();

    if (!text.trim()) {
        return null;
    }

    return JSON.parse(text);
}

async function writeFolderFile(handle) {
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
            appData,
            null,
            2
        )
    );

    await writable.close();
}

async function writeFolderFileIfConnected() {
    if (!folderHandle || !appData) {
        updateConnectionStatus(false);
        return false;
    }

    try {
        const allowed =
            await verifyFolderPermission(
                folderHandle,
                false
            );

        if (!allowed) {
            updateConnectionStatus(false);
            return false;
        }

        await writeFolderFile(folderHandle);

        updateConnectionStatus(true);

        return true;
    } catch (error) {
        console.error(
            "Folder write error:",
            error
        );

        updateConnectionStatus(false);

        return false;
    }
}

/* =========================================================
   Folder Connection
   ========================================================= */

async function connectFolder(handle) {
    if (!handle) {
        return false;
    }

    try {
        const permission =
            await verifyFolderPermission(
                handle,
                true
            );

        if (!permission) {
            showToast(
                "اجازه دسترسی به پوشه داده نشد."
            );

            updateConnectionStatus(false);

            return false;
        }

        folderHandle = handle;

        await saveFolderHandle(handle);

        let fileData = null;

        try {
            fileData =
                await readFolderFile(handle);
        } catch (error) {
            console.log(
                "Data file does not exist yet."
            );
        }

        /*
         اگر فایل وجود داشته باشد:
         داده فایل به عنوان نسخه اصلی خوانده می‌شود.
         اگر فایل وجود نداشته باشد:
         اطلاعات IndexedDB داخل فایل ساخته می‌شود.
        */

        if (fileData && typeof fileData === "object") {
            appData = normalizeData(fileData);

            await idbSet(
                DATA_STORE,
                DATA_KEY,
                appData
            );
        } else {
            await writeFolderFile(handle);
        }

        updateConnectionStatus(true);

        renderAll();

        showToast(
            "پوشه با موفقیت متصل شد."
        );

        return true;
    } catch (error) {
        console.error(
            "Connect folder error:",
            error
        );

        updateConnectionStatus(false);

        showToast(
            "اتصال پوشه انجام نشد."
        );

        return false;
    }
}

function normalizeData(data) {
    const result =
        data && typeof data === "object"
            ? data
            : createEmptyData();

    if (!Array.isArray(result.products)) {
        result.products = [];
    }

    if (
        !result.inventory ||
        typeof result.inventory !== "object"
    ) {
        result.inventory = {};
    }

    if (!Array.isArray(result.sales)) {
        result.sales = [];
    }

    if (!Array.isArray(result.sale_items)) {
        result.sale_items = [];
    }

    if (
        !result.settings ||
        typeof result.settings !== "object"
    ) {
        result.settings = {};
    }

    result.version = 2;

    return result;
}

async function chooseFolder() {
    if (
        !("showDirectoryPicker" in window)
    ) {
        showToast(
            "مرورگر شما انتخاب پوشه را پشتیبانی نمی‌کند."
        );

        return;
    }

    try {
        const handle =
            await window.showDirectoryPicker({
                mode: "readwrite"
            });

        await connectFolder(handle);
    } catch (error) {
        if (
            error &&
            error.name === "AbortError"
        ) {
            return;
        }

        console.error(error);

        showToast(
            "انتخاب پوشه انجام نشد."
        );
    }
}

async function tryAutoConnect() {
    const saved =
        await getSavedFolderHandle();

    if (!saved) {
        updateConnectionStatus(false);
        return false;
    }

    folderHandle = saved;

    const allowed =
        await verifyFolderPermission(
            saved,
            false
        );

    if (!allowed) {
        updateConnectionStatus(false);
        return false;
    }

    try {
        const fileData =
            await readFolderFile(saved);

        if (fileData) {
            appData =
                normalizeData(fileData);

            await idbSet(
                DATA_STORE,
                DATA_KEY,
                appData
            );
        }

        updateConnectionStatus(true);

        return true;
    } catch (error) {
        console.error(error);

        updateConnectionStatus(false);

        return false;
    }
}

async function reconnectFolder() {
    const saved =
        await getSavedFolderHandle();

    if (!saved) {
        await chooseFolder();
        return;
    }

    try {
        const allowed =
            await verifyFolderPermission(
                saved,
                true
            );

        if (!allowed) {
            showToast(
                "اجازه دسترسی به پوشه داده نشد."
            );

            return;
        }

        folderHandle = saved;

        let fileData = null;

        try {
            fileData =
                await readFolderFile(saved);
        } catch (error) {
            fileData = null;
        }

        if (fileData) {
            appData =
                normalizeData(fileData);

            await idbSet(
                DATA_STORE,
                DATA_KEY,
                appData
            );
        } else {
            await writeFolderFile(saved);
        }

        updateConnectionStatus(true);

        renderAll();

        showToast(
            "پوشه دوباره متصل شد."
        );
    } catch (error) {
        console.error(error);

        updateConnectionStatus(false);

        showToast(
            "اتصال دوباره انجام نشد."
        );
    }
}

/* =========================================================
   Connection UI
   ========================================================= */

function updateConnectionStatus(connected) {
    const elements = [
        $("connectionStatus"),
        $("folderStatus"),
        $("statusText")
    ];

    elements.forEach(element => {
        if (!element) {
            return;
        }

        if (connected) {
            element.textContent =
                "پوشه متصل است";
            element.classList.add("connected");
            element.classList.remove("disconnected");
        } else {
            element.textContent =
                "پوشه متصل نیست";
            element.classList.add("disconnected");
            element.classList.remove("connected");
        }
    });
}

/* =========================================================
   Products
   ========================================================= */

function getProduct(id) {
    return appData.products.find(
        product =>
            String(product.id) === String(id)
    );
}

function findProductByBarcode(barcode) {
    const code =
        String(barcode || "").trim();

    if (!code) {
        return null;
    }

    return appData.products.find(
        product =>
            String(product.barcode || "") === code
    ) || null;
}

function getStock(productId) {
    return Number(
        appData.inventory[productId] || 0
    );
}

function addProduct(productData) {
    const barcode =
        String(productData.barcode || "").trim();

    const name =
        String(productData.name || "").trim();

    if (!name) {
        showToast(
            "نام کالا را وارد کنید."
        );

        return null;
    }

    if (!barcode) {
        showToast(
            "بارکد را وارد کنید."
        );

        return null;
    }

    const existing =
        findProductByBarcode(barcode);

    if (existing) {
        showToast(
            "این بارکد قبلاً ثبت شده است."
        );

        return null;
    }

    const product = {
        id: uid(),
        barcode: barcode,
        name: name,
        price1: Number(
            productData.price1 || 0
        ),
        price2:
            productData.price2 === "" ||
            productData.price2 == null
                ? null
                : Number(productData.price2),
        created_at:
            new Date().toISOString(),
        updated_at:
            new Date().toISOString()
    };

    appData.products.push(product);

    appData.inventory[product.id] =
        Number(productData.stock || 0);

    return product;
}

async function saveProductForm() {
    const form = $("productForm");

    if (!form) {
        return;
    }

    const formData =
        new FormData(form);

    const product =
        addProduct({
            barcode:
                formData.get("barcode"),
            name:
                formData.get("name"),
            price1:
                formData.get("price1"),
            price2:
                formData.get("price2"),
            stock:
                formData.get("stock")
        });

    if (!product) {
        return;
    }

    await saveLocalDatabase();

    closeModal("productModal");

    form.reset();

    renderAll();

    showToast(
        "کالا با موفقیت اضافه شد."
    );
}

async function deleteProduct(productId) {
    const product =
        getProduct(productId);

    if (!product) {
        return;
    }

    const ok =
        confirm(
            `کالای «${product.name}» حذف شود؟`
        );

    if (!ok) {
        return;
    }

    appData.products =
        appData.products.filter(
            item =>
                String(item.id) !==
                String(productId)
        );

    delete appData.inventory[productId];

    await saveLocalDatabase();

    renderAll();

    showToast(
        "کالا حذف شد."
    );
}

/* =========================================================
   Inventory
   ========================================================= */

async function changeStock(productId, amount) {
    const product =
        getProduct(productId);

    if (!product) {
        return;
    }

    const current =
        getStock(productId);

    const next =
        Math.max(
            0,
            current + Number(amount)
        );

    appData.inventory[productId] =
        next;

    product.updated_at =
        new Date().toISOString();

    await saveLocalDatabase();

    renderAll();
}

/* =========================================================
   Sales / Cart
   ========================================================= */

function addToCart(product, priceType = 1) {
    if (!product) {
        return;
    }

    const stock =
        getStock(product.id);

    if (stock <= 0) {
        showToast(
            "موجودی این کالا تمام شده است."
        );

        return;
    }

    const price =
        priceType === 2 &&
        product.price2 != null
            ? Number(product.price2)
            : Number(product.price1 || 0);

    const existing =
        cart.find(
            item =>
                item.productId ===
                product.id
        );

    if (existing) {
        if (
            existing.quantity >= stock
        ) {
            showToast(
                "بیشتر از موجودی نمی‌توانید بفروشید."
            );

            return;
        }

        existing.quantity++;
    } else {
        cart.push({
            productId: product.id,
            name: product.name,
            price: price,
            quantity: 1,
            priceType: priceType
        });
    }

    renderCart();
}

function removeFromCart(productId) {
    cart =
        cart.filter(
            item =>
                String(item.productId) !==
                String(productId)
        );

    renderCart();
}

function clearCart() {
    cart = [];
    renderCart();
}

async function completeSale() {
    if (!cart.length) {
        showToast(
            "سبد فروش خالی است."
        );

        return;
    }

    const saleId = uid();

    let total = 0;

    const saleItems = [];

    for (const item of cart) {
        const product =
            getProduct(item.productId);

        if (!product) {
            continue;
        }

        const stock =
            getStock(product.id);

        if (item.quantity > stock) {
            showToast(
                `موجودی «${product.name}» کافی نیست.`
            );

            return;
        }

        const itemTotal =
            item.quantity *
            item.price;

        total += itemTotal;

        appData.inventory[product.id] =
            stock - item.quantity;

        saleItems.push({
            id: uid(),
            sale_id: saleId,
            product_id: product.id,
            quantity: item.quantity,
            price: item.price,
            total: itemTotal
        });
    }

    appData.sales.push({
        id: saleId,
        date: new Date().toISOString(),
        total: total
    });

    appData.sale_items.push(
        ...saleItems
    );

    await saveLocalDatabase();

    cart = [];

    renderAll();

    showToast(
        "فروش با موفقیت ثبت شد."
    );
}

/* =========================================================
   Scanner - Binary Eye
   ========================================================= */

function openBinaryEye(callbackType) {
    try {
        localStorage.setItem(
            "bizadshop_scanner_callback",
            callbackType
        );

        /*
          Binary Eye deep link.
          نتیجه اسکن در صورت پشتیبانی مرورگر/اپ
          از طریق URL به سایت برمی‌گردد.
        */

        const returnUrl =
            window.location.href.split("#")[0];

        const binaryEyeUrl =
            "binaryeye://scan?return=" +
            encodeURIComponent(
                returnUrl
            );

        window.location.href =
            binaryEyeUrl;
    } catch (error) {
        console.error(error);

        showToast(
            "باز کردن اسکنر انجام نشد."
        );
    }
}

function handleScannerResult(value) {
    if (!value) {
        return;
    }

    const code =
        String(value).trim();

    const callback =
        localStorage.getItem(
            "bizadshop_scanner_callback"
        );

    localStorage.removeItem(
        "bizadshop_scanner_callback"
    );

    if (callback === "sale") {
        const input =
            $("saleBarcode");

        if (input) {
            input.value = code;
        }

        searchSaleProduct(code);
        return;
    }

    if (
        callback === "product" ||
        callback === "receive"
    ) {
        const input =
            $("productBarcode");

        if (input) {
            input.value = code;
        }

        const receiveInput =
            $("receiveBarcode");

        if (receiveInput) {
            receiveInput.value = code;
        }

        findBarcodeForProduct(code);
    }
}

function checkScannerReturn() {
    try {
        const params =
            new URLSearchParams(
                window.location.search
            );

        const possibleValues = [
            params.get("barcode"),
            params.get("result"),
            params.get("text"),
            params.get("data"),
            params.get("code")
        ];

        for (
            const value of possibleValues
        ) {
            if (value) {
                handleScannerResult(value);
                break;
            }
        }
    } catch (error) {
        console.error(error);
    }
}

/* =========================================================
   Search
   ========================================================= */

function searchSaleProduct(code) {
    const product =
        findProductByBarcode(code);

    if (!product) {
        showToast(
            "کالایی با این بارکد پیدا نشد."
        );

        return;
    }

    if (
        product.price2 != null &&
        Number(product.price2) > 0
    ) {
        const useSecond =
            confirm(
                `قیمت ۱: ${money(product.price1)}\n` +
                `قیمت ۲: ${money(product.price2)}\n\n` +
                `برای قیمت ۲ OK بزنید.`
            );

        addToCart(
            product,
            useSecond ? 2 : 1
        );
    } else {
        addToCart(
            product,
            1
        );
    }

    const input =
        $("saleBarcode");

    if (input) {
        input.value = "";
    }
}

function findBarcodeForProduct(code) {
    const product =
        findProductByBarcode(code);

    if (product) {
        showToast(
            `این بارکد قبلاً برای «${product.name}» ثبت شده است.`
        );
    } else {
        showToast(
            "بارکد آماده ثبت کالا است."
        );
    }
}

/* =========================================================
   Rendering
   ========================================================= */

function renderDashboard() {
    const productCount =
        appData.products.length;

    let stockCount = 0;

    Object.values(
        appData.inventory
    ).forEach(value => {
        stockCount += Number(value) || 0;
    });

    const today =
        todayKey();

    const todaySales =
        appData.sales.filter(
            sale =>
                String(sale.date || "")
                    .slice(0, 10) === today
        );

    let todayTotal = 0;

    todaySales.forEach(
        sale => {
            todayTotal +=
                Number(sale.total) || 0;
        }
    );

    setText(
        "dashboardProductCount",
        productCount
    );

    setText(
        "dashboardStockCount",
        stockCount
    );

    setText(
        "dashboardSalesCount",
        todaySales.length
    );

    setText(
        "dashboardSalesTotal",
        money(todayTotal)
    );
}

function renderProducts() {
    const container =
        $("productsList");

    if (!container) {
        return;
    }

    const searchInput =
        $("productSearch");

    const search =
        String(
            searchInput
                ? searchInput.value
                : ""
        )
            .trim()
            .toLowerCase();

    const products =
        appData.products.filter(
            product => {
                if (!search) {
                    return true;
                }

                return (
                    String(product.name || "")
                        .toLowerCase()
                        .includes(search) ||
                    String(product.barcode || "")
                        .toLowerCase()
                        .includes(search)
                );
            }
        );

    if (!products.length) {
        container.innerHTML =
            `<div class="empty-state">
                کالایی ثبت نشده است.
            </div>`;

        return;
    }

    container.innerHTML =
        products
            .map(product => {
                const stock =
                    getStock(product.id);

                return `
                    <div class="product-card">
                        <div class="product-info">
                            <strong>
                                ${escapeHTML(product.name)}
                            </strong>

                            <small>
                                بارکد:
                                ${escapeHTML(product.barcode)}
                            </small>

                            <small>
                                موجودی:
                                ${stock}
                            </small>

                            <small>
                                قیمت:
                                ${money(product.price1)}
                            </small>

                            ${
                                product.price2 != null
                                    ? `
                                        <small>
                                            قیمت ۲:
                                            ${money(product.price2)}
                                        </small>
                                      `
                                    : ""
                            }
                        </div>

                        <div class="product-actions">
                            <button
                                type="button"
                                class="small-button"
                                data-stock-product="${product.id}"
                            >
                                تغییر موجودی
                            </button>

                            <button
                                type="button"
                                class="small-button"
                                data-delete-product="${product.id}"
                            >
                                حذف
                            </button>
                        </div>
                    </div>
                `;
            })
            .join("");
}

function renderInventory() {
    const container =
        $("inventoryList");

    if (!container) {
        return;
    }

    const searchInput =
        $("inventorySearch");

    const search =
        String(
            searchInput
                ? searchInput.value
                : ""
        )
            .trim()
            .toLowerCase();

    const products =
        appData.products.filter(
            product => {
                if (!search) {
                    return true;
                }

                return (
                    String(product.name || "")
                        .toLowerCase()
                        .includes(search) ||
                    String(product.barcode || "")
                        .toLowerCase()
                        .includes(search)
                );
            }
        );

    if (!products.length) {
        container.innerHTML =
            `<div class="empty-state">
                موجودی خالی است.
            </div>`;

        return;
    }

    container.innerHTML =
        products
            .map(product => {
                const stock =
                    getStock(product.id);

                return `
                    <div class="inventory-card">
                        <div>
                            <strong>
                                ${escapeHTML(product.name)}
                            </strong>

                            <div>
                                موجودی:
                                <b>${stock}</b>
                            </div>
                        </div>

                        <div class="inventory-actions">
                            <button
                                type="button"
                                class="small-button"
                                data-stock-minus="${product.id}"
                            >
                                −
                            </button>

                            <button
                                type="button"
                                class="small-button"
                                data-stock-plus="${product.id}"
                            >
                                +
                            </button>
                        </div>
                    </div>
                `;
            })
            .join("");
}

function renderCart() {
    const container =
        $("cartItems");

    const totalElement =
        $("cartTotal");

    if (!container) {
        return;
    }

    if (!cart.length) {
        container.innerHTML =
            `<div class="empty-state">
                سبد فروش خالی است.
            </div>`;

        if (totalElement) {
            totalElement.textContent =
                money(0);
        }

        return;
    }

    let total = 0;

    container.innerHTML =
        cart
            .map(item => {
                const itemTotal =
                    item.quantity *
                    item.price;

                total += itemTotal;

                return `
                    <div class="cart-item">
                        <div>
                            <strong>
                                ${escapeHTML(item.name)}
                            </strong>

                            <div>
                                ${item.quantity}
                                ×
                                ${money(item.price)}
                            </div>
                        </div>

                        <div>
                            <strong>
                                ${money(itemTotal)}
                            </strong>

                            <button
                                type="button"
                                class="small-button"
                                data-remove-cart="${item.productId}"
                            >
                                حذف
                            </button>
                        </div>
                    </div>
                `;
            })
            .join("");

    if (totalElement) {
        totalElement.textContent =
            money(total);
    }
}

function renderAll() {
    if (!appData) {
        return;
    }

    renderDashboard();
    renderProducts();
    renderInventory();
    renderCart();
}

/* =========================================================
   Page Navigation
   ========================================================= */

function showPage(pageName) {
    currentPage =
        pageName;

    const pages = [
        "dashboard",
        "products",
        "sale",
        "inventory"
    ];

    pages.forEach(page => {
        const element =
            $("page-" + page);

        if (!element) {
            return;
        }

        if (page === pageName) {
            element.style.display =
                "block";
            element.classList.add("active");
        } else {
            element.style.display =
                "none";
            element.classList.remove("active");
        }
    });

    document
        .querySelectorAll(
            "[data-page]"
        )
        .forEach(button => {
            const target =
                button.dataset.page;

            if (
                target === pageName
            ) {
                button.classList.add(
                    "active"
                );
            } else {
                button.classList.remove(
                    "active"
                );
            }
        });
}

/* =========================================================
   Modals
   ========================================================= */

function openModal(id) {
    const modal = $(id);

    if (!modal) {
        return;
    }

    modal.style.display =
        "flex";

    modal.classList.add("open");
}

function closeModal(id) {
    const modal = $(id);

    if (!modal) {
        return;
    }

    modal.style.display =
        "none";

    modal.classList.remove("open");
}

/* =========================================================
   Helpers
   ========================================================= */

function setText(id, value) {
    const element = $(id);

    if (element) {
        element.textContent =
            String(value);
    }
}

/* =========================================================
   Event Handlers
   ========================================================= */

function setupEventListeners() {

    /* Navigation */

    document.addEventListener(
        "click",
        async function (event) {

            const pageButton =
                event.target.closest(
                    "[data-page]"
                );

            if (pageButton) {
                const page =
                    pageButton.dataset.page;

                if (page) {
                    showPage(page);
                }

                return;
            }

            /* Folder */

            const folderButton =
                event.target.closest(
                    "#connectFolderBtn, #chooseFolderBtn, #folderBtn, #settingsBtn"
                );

            if (folderButton) {
                await chooseFolder();
                return;
            }

            const reconnectButton =
                event.target.closest(
                    "#reconnectFolderBtn"
                );

            if (reconnectButton) {
                await reconnectFolder();
                return;
            }

            /* Add Product */

            const addButton =
                event.target.closest(
                    "#addProductBtn"
                );

            if (addButton) {
                openModal(
                    "productModal"
                );

                return;
            }

            /* Close */

            const closeButton =
                event.target.closest(
                    "[data-close-modal]"
                );

            if (closeButton) {
                closeModal(
                    closeButton.dataset
                        .closeModal
                );

                return;
            }

            /* Product Scanner */

            const productScanner =
                event.target.closest(
                    "#productScanBarcodeBtn, #scanProductBarcodeBtn"
                );

            if (productScanner) {
                openBinaryEye(
                    "product"
                );

                return;
            }

            /* Sale Scanner */

            const saleScanner =
                event.target.closest(
                    "#saleScanBarcodeBtn, #scanSaleBarcodeBtn"
                );

            if (saleScanner) {
                openBinaryEye(
                    "sale"
                );

                return;
            }

            /* Search Sale */

            const saleSearchButton =
                event.target.closest(
                    "#saleSearchBtn"
                );

            if (saleSearchButton) {
                const input =
                    $("saleBarcode");

                if (input) {
                    searchSaleProduct(
                        input.value
                    );
                }

                return;
            }

            /* Complete Sale */

            const completeSaleButton =
                event.target.closest(
                    "#completeSaleBtn"
                );

            if (completeSaleButton) {
                await completeSale();
                return;
            }

            /* Clear Cart */

            const clearCartButton =
                event.target.closest(
                    "#clearCartBtn"
                );

            if (clearCartButton) {
                clearCart();
                return;
            }

            /* Stock Plus */

            const plusButton =
                event.target.closest(
                    "[data-stock-plus]"
                );

            if (plusButton) {
                await changeStock(
                    plusButton.dataset
                        .stockPlus,
                    1
                );

                return;
            }

            /* Stock Minus */

            const minusButton =
                event.target.closest(
                    "[data-stock-minus]"
                );

            if (minusButton) {
                await changeStock(
                    minusButton.dataset
                        .stockMinus,
                    -1
                );

                return;
            }

            /* Product Stock */

            const stockButton =
                event.target.closest(
                    "[data-stock-product]"
                );

            if (stockButton) {
                const id =
                    stockButton.dataset
                        .stockProduct;

                openStockModal(id);

                return;
            }

            /* Delete Product */

            const deleteButton =
                event.target.closest(
                    "[data-delete-product]"
                );

            if (deleteButton) {
                await deleteProduct(
                    deleteButton.dataset
                        .deleteProduct
                );

                return;
            }

            /* Remove Cart */

            const removeCartButton =
                event.target.closest(
                    "[data-remove-cart]"
                );

            if (removeCartButton) {
                removeFromCart(
                    removeCartButton.dataset
                        .removeCart
                );

                return;
            }
        }
    );

    /* Product Form */

    const productForm =
        $("productForm");

    if (productForm) {
        productForm.addEventListener(
            "submit",
            async function (event) {
                event.preventDefault();

                await saveProductForm();
            }
        );
    }

    /* Stock Form */

    const stockForm =
        $("stockForm");

    if (stockForm) {
        stockForm.addEventListener(
            "submit",
            async function (event) {
                event.preventDefault();

                await saveStockForm();
            }
        );
    }

    /* Product Search */

    const productSearch =
        $("productSearch");

    if (productSearch) {
        productSearch.addEventListener(
            "input",
            renderProducts
        );
    }

    /* Inventory Search */

    const inventorySearch =
        $("inventorySearch");

    if (inventorySearch) {
        inventorySearch.addEventListener(
            "input",
            renderInventory
        );
    }

    /* Sale Barcode Enter */

    const saleBarcode =
        $("saleBarcode");

    if (saleBarcode) {
        saleBarcode.addEventListener(
            "keydown",
            function (event) {
                if (
                    event.key ===
                    "Enter"
                ) {
                    event.preventDefault();

                    searchSaleProduct(
                        saleBarcode.value
                    );
                }
            }
        );
    }
}

/* =========================================================
   Stock Modal
   ========================================================= */

let selectedStockProductId = null;

function openStockModal(productId) {
    const product =
        getProduct(productId);

    if (!product) {
        return;
    }

    selectedStockProductId =
        productId;

    setText(
        "stockProductName",
        product.name
    );

    setText(
        "stockCurrentValue",
        getStock(productId)
    );

    const amount =
        $("stockAmount");

    if (amount) {
        amount.value = "";
    }

    openModal(
        "stockModal"
    );
}

async function saveStockForm() {
    if (!selectedStockProductId) {
        return;
    }

    const amountInput =
        $("stockAmount");

    const typeInput =
        $("stockType");

    const amount =
        Number(
            amountInput
                ? amountInput.value
                : 0
        );

    if (!amount || amount <= 0) {
        showToast(
            "مقدار را وارد کنید."
        );

        return;
    }

    let change =
        amount;

    if (
        typeInput &&
        (
            typeInput.value ===
            "remove" ||
            typeInput.value ===
            "out"
        )
    ) {
        change =
            -amount;
    }

    await changeStock(
        selectedStockProductId,
        change
    );

    selectedStockProductId =
        null;

    closeModal(
        "stockModal"
    );
}

/* =========================================================
