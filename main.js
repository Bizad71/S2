
const DB_NAME = "BizadShopLocal";
const DB_VERSION = 1;
const HANDLE_STORE = "handles";
const HANDLE_KEY = "database-folder";

let databaseDirectory = null;
let connected = false;

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

const scanButton =
document.getElementById("scanButton");

const barcodeInput =
document.getElementById("barcodeInput");

const toast =
document.getElementById("toast");

const navItems =
document.querySelectorAll(".nav-item");

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
فقط برای نگهداری مجوز پوشه
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

const db = await openHandleDB();

return new Promise((resolve, reject) => {

    const transaction =
        db.transaction(HANDLE_STORE, "readwrite");

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

const db = await openHandleDB();

return new Promise((resolve, reject) => {

    const transaction =
        db.transaction(HANDLE_STORE, "readonly");

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
DIRECTORY PERMISSION
========================================= */

async function verifyDirectoryPermission(handle) {

if (!handle) {
    return false;
}

try {

    let permission =
        await handle.queryPermission({
            mode: "readwrite"
        });

    if (permission === "granted") {
        return true;
    }

    permission =
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
CREATE FILE
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

/* =========================================
CREATE FOLDER
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
CREATE DATABASE STRUCTURE
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

const backups =
    await getFolder(directory, "backups");


/* SYSTEM */

await writeJSONFile(
    system,
    "database.json",
    {
        database_name: "BizadShop",
        database_id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        last_update: new Date().toISOString()
    }
);


await writeJSONFile(
    system,
    "version.json",
    {
        version: 1
    }
);


/* SHOP */

await writeJSONFile(
    shop,
    "info.json",
    {
        name: "فروشگاه من",
        phone: "",
        address: "",
        created_at: new Date().toISOString()
    }
);


await writeJSONFile(
    shop,
    "settings.json",
    {
        currency: "تومان",
        invoice_prefix: "INV",
        next_invoice_number: 1
    }
);


/* USERS */

await writeJSONFile(
    users,
    "users.json",
    []
);


/* PRODUCTS */

await writeJSONFile(
    products,
    "products.json",
    []
);


/* INVENTORY */

await writeJSONFile(
    inventory,
    "inventory.json",
    []
);


/* SALES */

await writeJSONFile(
    sales,
    "invoices.json",
    []
);


await writeJSONFile(
    sales,
    "items.json",
    []
);


/*
 * پوشه backups عمداً خالی می‌ماند.
 */

console.log(
    "BizadShop database structure created."
);

}

/* =========================================
CONNECT DATABASE
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
        await verifyDirectoryPermission(
            directory
        );


    if (!permission) {

        showToast(
            "اجازه دسترسی به پوشه داده نشد.",
            "error"
        );

        return;
    }


    databaseDirectory = directory;


    await createDatabaseStructure(
        databaseDirectory
    );


    await saveDirectoryHandle(
        databaseDirectory
    );


    setConnectionStatus(true);


    folderButton.textContent =
        "دیتابیس متصل است";


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
RESTORE PREVIOUS CONNECTION
========================================= */

async function restoreDatabaseConnection() {

try {

    const savedHandle =
        await getSavedDirectoryHandle();


    if (!savedHandle) {

        setConnectionStatus(false);

        return;
    }


    const permission =
        await verifyDirectoryPermission(
            savedHandle
        );


    if (!permission) {

        setConnectionStatus(false);

        return;
    }


    databaseDirectory =
        savedHandle;


    setConnectionStatus(true);


    folderButton.textContent =
        "دیتابیس متصل است";


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
    return;
}


pages.forEach(page => {

    page.classList.remove("active");

});


navItems.forEach(item => {

    item.classList.remove("active");

});


const page =
    document.getElementById(pageId);


const button =
    document.querySelector(
        `.nav-item[data-page="${pageId}"]`
    );


if (page) {
    page.classList.add("active");
}


if (button) {
    button.classList.add("active");
}

}

/* =========================================
BINARY EYE
========================================= */

function openBinaryEye() {

if (!connected) {
    return;
}


/*
 * نتیجه Binary Eye به این آدرس برمی‌گردد.
 *
 * {RESULT}
 * توسط Binary Eye با مقدار بارکد
 * جایگزین می‌شود.
 */

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


/*
 * URL تمیز می‌شود تا اسکن قبلی
 * دوباره پردازش نشود.
 */

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
BARCODE VALIDATION
========================================= */

function normalizeBarcode(value) {

return String(value || "")
    .trim()
    .replace(/\s+/g, "");

}

async function barcodeExists(barcode) {

if (!databaseDirectory) {
    return false;
}


try {

    const productsDirectory =
        await databaseDirectory.getDirectoryHandle(
            "products"
        );


    const fileHandle =
        await productsDirectory.getFileHandle(
            "products.json"
        );


    const file =
        await fileHandle.getFile();


    const text =
        await file.text();


    const products =
        JSON.parse(text || "[]");


    return products.some(
        product =>
            String(product.barcode) ===
            String(barcode)
    );


} catch (error) {

    console.error(error);

    return false;
}

}

/* =========================================
ADD PRODUCT - فعلاً نمونه
========================================= */

async function addSampleProduct() {

if (!connected) {
    return;
}


const barcode =
    normalizeBarcode(
        barcodeInput.value
    );


if (!barcode) {

    showToast(
        "ابتدا بارکد کالا را وارد کنید.",
        "error"
    );

    barcodeInput.focus();

    return;
}


const exists =
    await barcodeExists(
        barcode
    );


if (exists) {

    showToast(
        "این بارکد قبلاً برای یک کالا ثبت شده است.",
        "error"
    );

    return;
}


showToast(
    "بارکد آزاد است؛ ثبت کامل کالا در مرحله بعد اضافه می‌شود.",
    "success"
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

document
.getElementById("addButton")
.addEventListener(
"click",
addSampleProduct
);

navItems.forEach(item => {

item.addEventListener(
    "click",
    () => {

        const pageId =
            item.dataset.page;

        showPage(pageId);
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
