/* =====================================================
   养马日记 · 配货记账本
   Shopping / Wishlist / Allocation System
===================================================== */


/* =====================================================
   STORAGE
===================================================== */

if (
    "serviceWorker" in navigator &&
    location.protocol.startsWith("http")
) {

    window.addEventListener(
        "load",
        () => {

            navigator.serviceWorker
                .register("sw.js")
                .catch(
                    () => {}
                );

        }
    );

}


const RECORD_KEY = "yangma_records_v5";
const WISH_KEY = "yangma_wishlist_v5";
const DATA_SYNC_KEY = "yangma_data_updated_at_v1";


function readJSON(key, fallback) {

    try {

        return JSON.parse(
            localStorage.getItem(key) ||
            JSON.stringify(fallback)
        );

    } catch (error) {

        return fallback;

    }

}


let records =
    readJSON(RECORD_KEY, []);

let wishes =
    readJSON(WISH_KEY, []);


let currentFilter = "全部";

let editingRecordId = null;
let editingWishId = null;

let recordImageData = "";
let wishImageData = "";

let analysisWithBag = true;

/*
    当前消费权重分析的店铺。

    全部：
    分析所有店铺

    具体店铺：
    只分析该店铺
*/
let analysisStore = "全部";


/* =====================================================
   CONSTANTS
===================================================== */

const categories = [
    "全部",
    "包袋",
    "丝巾",
    "家居",
    "鞋履",
    "小皮具",
    "首饰",
    "成衣"
];


const statusList = [
    "待入手",
    "已入手"
];


const currencySymbols = {

    USD: "$",
    CNY: "¥",
    EUR: "€",
    GBP: "£",
    HKD: "HK$",
    JPY: "¥",
    SGD: "S$"

};


/*
    =====================================================
    消费权重颜色
    =====================================================

    包袋：
    浅棕色

    丝巾 / 家居：
    深绿色

    鞋履 / 小皮具：
    深蓝色

    首饰：
    橙色

    成衣：
    深紫色
*/

const analysisColors = {

    "包袋": "#B89578",

    "丝巾 / 家居": "#355744",

    "鞋履 / 小皮具": "#304C69",

    "首饰": "#C47A3C",

    "成衣": "#514064"

};


const categoryGroups = {

    "包袋": [
        "包袋"
    ],

    "丝巾 / 家居": [
        "丝巾",
        "家居"
    ],

    "鞋履 / 小皮具": [
        "鞋履",
        "小皮具"
    ],

    "首饰": [
        "首饰"
    ],

    "成衣": [
        "成衣"
    ]

};


/* =====================================================
   BASIC HELPERS
===================================================== */

function uid() {

    return (
        Date.now().toString(36) +
        Math.random()
            .toString(36)
            .slice(2)
    );

}


function saveData() {

    localStorage.setItem(
        RECORD_KEY,
        JSON.stringify(records)
    );

    localStorage.setItem(
        WISH_KEY,
        JSON.stringify(wishes)
    );

    localStorage.setItem(
        DATA_SYNC_KEY,
        String(Date.now())
    );

}


function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


function money(value, currency = "USD") {

    return (
        currencySymbols[currency] ||
        currency
    )
    +
    Number(value || 0)
        .toLocaleString(
            "en-US",
            {
                maximumFractionDigits: 2
            }
        );

}


function dateText(value) {

    if (!value) return "—";

    const date =
        new Date(value);

    if (isNaN(date)) {
        return value;
    }

    return date.toLocaleDateString(
        "zh-CN",
        {
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    );

}


function showToast(message) {

    const toast =
        document.getElementById(
            "toast"
        );

    if (!toast) return;

    toast.textContent =
        message;

    toast.classList.add("show");

    setTimeout(
        () => {

            toast.classList.remove(
                "show"
            );

        },
        2200
    );

}


/* =====================================================
   ALLOCATION ENGINE
===================================================== */


/*
    配货规则：

    1. 包袋永远不能作为配货
    2. 其他品类可以归属某一个心愿
    3. 购物记录只有被指定 wishId 才会进入该心愿
    4. 不自动做币种换算
    5. 每次 render 时重新计算
*/


function isAllocationEligible(record) {

    return (
        record.category !== "包袋"
    );

}


function getWishAllocationTotal(
    wishId
) {

    return records.reduce(
        (total, record) => {

            if (
                record.wishId !== wishId
            ) {
                return total;
            }


            if (
                !isAllocationEligible(
                    record
                )
            ) {
                return total;
            }


            return (
                total +
                Number(
                    record.price || 0
                )
            );

        },
        0
    );

}


function getWishCompletedAmount(
    wish
) {

    const manual =
        Number(
            wish.baseAllocated || 0
        );


    const automatic =
        getWishAllocationTotal(
            wish.id
        );


    return manual + automatic;

}


function refreshDataFromStorage() {

    records =
        readJSON(RECORD_KEY, []);

    wishes =
        readJSON(WISH_KEY, []);

    renderAll();

}


function exportData() {

    const payload = {
        app: "yangma-diary",
        version: 1,
        exportedAt:
            new Date()
                .toISOString(),
        records,
        wishes
    };


    const blob =
        new Blob(
            [
                JSON.stringify(
                    payload,
                    null,
                    2
                )
            ],
            {
                type: "application/json"
            }
        );


    const link =
        document.createElement("a");


    const stamp =
        new Date()
            .toISOString()
            .slice(0, 10);


    link.href =
        URL.createObjectURL(blob);

    link.download =
        `yangma-diary-backup-${stamp}.json`;

    link.click();

    URL.revokeObjectURL(
        link.href
    );

    showToast(
        "数据备份已导出"
    );

}


function importBackupFile(file) {

    if (!file) return;


    const reader =
        new FileReader();


    reader.onload =
        () => {

            try {

                const payload =
                    JSON.parse(
                        reader.result
                    );


                if (
                    !Array.isArray(payload.records) ||
                    !Array.isArray(payload.wishes)
                ) {

                    throw new Error(
                        "Invalid backup"
                    );

                }


                const shouldImport =
                    confirm(
                        "导入后会替换当前这台手机里此页面的数据。\n\n确定导入这个备份吗？"
                    );


                if (!shouldImport) return;


                records =
                    payload.records;

                wishes =
                    payload.wishes;

                saveData();

                renderAll();

                showToast(
                    "数据已导入"
                );

            } catch (error) {

                showToast(
                    "备份文件无法读取"
                );

            }

        };


    reader.readAsText(file);

}


function getWishStatus(wish) {

    return wish.status === "已入手"
        ? "已入手"
        : "待入手";

}


/* =====================================================
   WISHLIST
===================================================== */

function renderWishGrid(
    grid,
    wishItems,
    emptyTitle,
    emptyText,
    placeholderText
) {

    if (!wishItems.length) {

        grid.innerHTML = `

            <div
                class="empty"
                style="grid-column:1/-1;"
            >

                <div class="empty-title">
                    ${emptyTitle}
                </div>

                <div class="empty-text">
                    ${emptyText}
                </div>

            </div>

        `;

        return;

    }


    grid.innerHTML =
        wishItems.map(
            wish => {

                const allocation =
                    Number(
                        wish.allocation || 0
                    );


                const completed =
                    getWishCompletedAmount(
                        wish
                    );


                const percentage =
                    allocation > 0
                        ? Math.min(
                            100,
                            completed /
                            allocation *
                            100
                        )
                        : 0;


                let priorityClass =
                    "watch";


                if (
                    wish.priority ===
                    "梦想款"
                ) {

                    priorityClass =
                        "dream";

                }


                if (
                    wish.priority ===
                    "优先"
                ) {

                    priorityClass =
                        "first";

                }


                const completeText =
                    percentage >= 100
                        ? "配货额度已达成"
                        : `已完成 ${percentage.toFixed(0)}%`;


                const statusText =
                    getWishStatus(
                        wish
                    );


                const allocationHTML =
                    wish.category === "包袋"
                        ? `

                            <div class="allocation">

                                <div class="allocation-top">

                                    <span>
                                        配货进度
                                    </span>

                                    <span>
                                        ${money(
                                            completed,
                                            wish.currency
                                        )}
                                        /
                                        ${money(
                                            allocation,
                                            wish.currency
                                        )}
                                    </span>

                                </div>


                                <div class="progress">

                                    <div
                                        class="progress-bar"
                                        style="
                                            width:${percentage}%
                                        "
                                    ></div>

                                </div>


                                <div
                                    class="allocation-complete"
                                >
                                    ${completeText}
                                </div>

                            </div>

                          `
                        : "";


                return `

                    <article class="wish-card">

                        <div class="wish-image">

                            ${
                                wish.image

                                ? `
                                    <img
                                        src="${wish.image}"
                                        alt="${escapeHTML(
                                            wish.name
                                        )}"
                                    >
                                  `

                                : `
                                    <div
                                        class="image-placeholder"
                                    >
                                        ${placeholderText}
                                    </div>
                                  `
                            }

                        </div>


                        <div class="wish-content">

                            <div class="wish-name-row">

                                <div class="wish-name">
                                    ${escapeHTML(
                                        wish.name
                                    )}
                                </div>

                                <div
                                    class="
                                        priority
                                        ${priorityClass}
                                    "
                                >
                                    ${escapeHTML(
                                        wish.priority
                                    )}
                                </div>

                            </div>


                            <div class="wish-category">
                                ${escapeHTML(
                                    wish.category
                                )}
                            </div>


                            <div class="wish-price">
                                ${money(
                                    wish.price,
                                    wish.currency
                                )}
                            </div>


                            ${allocationHTML}


                            <div class="wish-bottom">

                                <button
                                    class="status"
                                    data-cycle-status="${wish.id}"
                                >
                                    ${escapeHTML(
                                        statusText
                                    )}
                                </button>


                                <div class="wish-actions">

                                    <button
                                        class="icon-btn"
                                        data-edit-wish="${wish.id}"
                                    >
                                        ✎
                                    </button>

                                    <button
                                        class="icon-btn"
                                        data-delete-wish="${wish.id}"
                                    >
                                        ×
                                    </button>

                                </div>

                            </div>

                        </div>

                    </article>

                `;

            }
        ).join("");

}


function renderWishlist() {

    const grid =
        document.getElementById(
            "wishlistGrid"
        );


    if (!grid) return;


    const activeWishes =
        wishes.filter(
            wish =>
                getWishStatus(wish) !==
                "已入手"
        );


    renderWishGrid(
        grid,
        activeWishes,
        "暂无心愿",
        "点击「新增心愿」",
        "Wishlist"
    );

}


function renderHarvested() {

    const grid =
        document.getElementById(
            "harvestedGrid"
        );


    if (!grid) return;


    const harvestedWishes =
        wishes.filter(
            wish =>
                getWishStatus(wish) ===
                "已入手"
        );


    renderWishGrid(
        grid,
        harvestedWishes,
        "暂无收割",
        "把心愿状态切到「已入手」后会出现在这里",
        "Harvested"
    );

}


function renderWishlistAnalysis() {

    const activeWishes =
        wishes.filter(
            wish =>
                getWishStatus(wish) !==
                "已入手"
        );


    const totals =
        buildCategoryTotals(
            activeWishes,
            wish =>
                wish.price
        );


    const entries =
        Object.entries(totals)
            .filter(
                ([, value]) =>
                    value > 0
            );


    renderCategoryPie({
        pie:
            document.getElementById(
                "wishPie"
            ),
        totalElement:
            document.getElementById(
                "wishPieTotal"
            ),
        legend:
            document.getElementById(
                "wishLegend"
            ),
        entries,
        items:
            activeWishes,
        emptyTitle:
            "暂无心愿预算",
        emptyText:
            "新增心愿并填写预估价格后会显示占比"
    });

}


/* =====================================================
   WISH MODAL
===================================================== */

function openWishModal(id = null) {

    editingWishId =
        id;

    wishImageData =
        "";


    const form =
        document.getElementById(
            "wishForm"
        );

    if (!form) return;


    form.reset();


    const previewWrap =
        document.getElementById(
            "wishImagePreview"
        );


    if (previewWrap) {

        previewWrap.classList.remove(
            "show"
        );

    }


    if (id) {

        const wish =
            wishes.find(
                item =>
                    item.id === id
            );


        if (!wish) return;


        document.getElementById(
            "wishModalTitle"
        ).textContent =
            "编辑心愿";


        document.getElementById(
            "wishName"
        ).value =
            wish.name || "";


        document.getElementById(
            "wishCategory"
        ).value =
            wish.category ||
            "包袋";


        document.getElementById(
            "wishPrice"
        ).value =
            wish.price || "";


        document.getElementById(
            "wishCurrency"
        ).value =
            wish.currency ||
            "USD";


        document.getElementById(
            "wishPriority"
        ).value =
            wish.priority ||
            "观望";


        document.getElementById(
            "wishStatus"
        ).value =
            getWishStatus(wish);


        document.getElementById(
            "wishAllocation"
        ).value =
            wish.allocation ||
            "";


        document.getElementById(
            "wishAllocated"
        ).value =
            wish.baseAllocated ||
            0;


        wishImageData =
            wish.image || "";


        if (wish.image) {

            const preview =
                document.getElementById(
                    "wishPreviewImg"
                );


            if (preview) {

                preview.src =
                    wish.image;

            }


            if (previewWrap) {

                previewWrap.classList.add(
                    "show"
                );

            }

        }

    } else {

        document.getElementById(
            "wishModalTitle"
        ).textContent =
            "新增心愿";

    }


    const modal =
        document.getElementById(
            "wishModal"
        );


    if (modal) {

        modal.classList.add(
            "show"
        );

    }

}


function closeWishModal() {

    const modal =
        document.getElementById(
            "wishModal"
        );

    if (!modal) return;


    modal.classList.remove(
        "show"
    );


    editingWishId =
        null;

}


/* =====================================================
   SAVE WISH
===================================================== */

function saveWish(event) {

    event.preventDefault();


    const data = {

        name:
            document
                .getElementById(
                    "wishName"
                )
                .value
                .trim(),

        category:
            document
                .getElementById(
                    "wishCategory"
                )
                .value,

        price:
            Number(
                document
                    .getElementById(
                        "wishPrice"
                    )
                    .value
            ),

        currency:
            document
                .getElementById(
                    "wishCurrency"
                )
                .value,

        priority:
            document
                .getElementById(
                    "wishPriority"
                )
                .value,

        status:
            document
                .getElementById(
                    "wishStatus"
                )
                .value === "已入手"
                    ? "已入手"
                    : "待入手",

        allocation:
            Number(
                document
                    .getElementById(
                        "wishAllocation"
                    )
                    .value
            ) || 0,

        baseAllocated:
            Number(
                document
                    .getElementById(
                        "wishAllocated"
                    )
                    .value
            ) || 0,

        image:
            wishImageData

    };


    if (!data.name) {

        showToast(
            "请输入款式名称"
        );

        return;

    }


    if (editingWishId) {

        const index =
            wishes.findIndex(
                wish =>
                    wish.id ===
                    editingWishId
            );


        if (index !== -1) {

            wishes[index] = {

                ...wishes[index],

                ...data

            };

        }


        showToast(
            "心愿已更新"
        );

    } else {

        wishes.unshift({

            id: uid(),

            ...data,

            createdAt:
                new Date()
                    .toISOString()

        });


        showToast(
            "心愿已保存"
        );

    }


    saveData();

    renderAll();

    closeWishModal();

}


/* =====================================================
   WISH STATUS
===================================================== */

function cycleStatus(id) {

    const wish =
        wishes.find(
            item =>
                item.id === id
        );


    if (!wish) return;


    const current =
        statusList.indexOf(
            wish.status
        );


    wish.status =
        statusList[
            (
                current + 1
            )
            %
            statusList.length
        ];


    saveData();

    renderAll();

    showToast(
        `状态：${wish.status}`
    );

}


/* =====================================================
   DELETE WISH
===================================================== */

function deleteWish(id) {

    const hasRecords =
        records.some(
            record =>
                record.wishId === id
        );


    if (hasRecords) {

        const confirmDelete =
            confirm(
                "这个心愿已经有购物记录归属。\n\n删除心愿后，这些购物记录将变成「不计入配货」。\n\n确定继续吗？"
            );


        if (!confirmDelete) {
            return;
        }


        records =
            records.map(
                record => {

                    if (
                        record.wishId === id
                    ) {

                        return {
                            ...record,
                            wishId: ""
                        };

                    }

                    return record;

                }
            );

    } else {

        if (
            !confirm(
                "确定删除这件心愿吗？"
            )
        ) {
            return;
        }

    }


    wishes =
        wishes.filter(
            wish =>
                wish.id !== id
        );


    saveData();

    renderAll();

    showToast(
        "心愿已删除"
    );

}


/* =====================================================
   RECORD FORM
===================================================== */

function openRecordModal(
    id = null
) {

    editingRecordId =
        id;

    recordImageData =
        "";


    const form =
        document.getElementById(
            "recordForm"
        );

    if (!form) return;


    form.reset();


    const previewWrap =
        document.getElementById(
            "recordImagePreview"
        );


    if (previewWrap) {

        previewWrap.classList.remove(
            "show"
        );

    }


    populateWishSelect();


    if (id) {

        const record =
            records.find(
                item =>
                    item.id === id
            );


        if (!record) return;


        document.getElementById(
            "recordModalTitle"
        ).textContent =
            "编辑记录";


        document.getElementById(
            "recordName"
        ).value =
            record.name || "";


        document.getElementById(
            "recordCategory"
        ).value =
            record.category ||
            "包袋";


        document.getElementById(
            "recordMaterial"
        ).value =
            record.material ||
            "";


        document.getElementById(
            "recordColor"
        ).value =
            record.color ||
            "";


        document.getElementById(
            "recordSize"
        ).value =
            record.size ||
            "";


        document.getElementById(
            "recordPrice"
        ).value =
            record.price ||
            "";


        document.getElementById(
            "recordCurrency"
        ).value =
            record.currency ||
            "USD";


        document.getElementById(
            "recordStore"
        ).value =
            record.store ||
            "";


        document.getElementById(
            "recordDate"
        ).value =
            record.date ||
            "";


        document.getElementById(
            "recordWish"
        ).value =
            record.wishId ||
            "";


        recordImageData =
            record.image ||
            "";


        if (record.image) {

            const preview =
                document.getElementById(
                    "recordPreviewImg"
                );


            if (preview) {

                preview.src =
                    record.image;

            }


            if (previewWrap) {

                previewWrap.classList.add(
                    "show"
                );

            }

        }

    } else {

        document.getElementById(
            "recordModalTitle"
        ).textContent =
            "新增记录";


        document.getElementById(
            "recordDate"
        ).value =
            new Date()
                .toISOString()
                .split("T")[0];

    }


    updateAllocationField();


    const modal =
        document.getElementById(
            "recordModal"
        );


    if (modal) {

        modal.classList.add(
            "show"
        );

    }

}


function closeRecordModal() {

    const modal =
        document.getElementById(
            "recordModal"
        );

    if (!modal) return;


    modal.classList.remove(
        "show"
    );


    editingRecordId =
        null;

}


/* =====================================================
   WISH SELECT
===================================================== */

function populateWishSelect() {

    const select =
        document.getElementById(
            "recordWish"
        );


    if (!select) return;


    select.innerHTML = `

        <option value="">
            不计入配货
        </option>

    `;


    wishes.forEach(
        wish => {

            const option =
                document.createElement(
                    "option"
                );


            option.value =
                wish.id;


            option.textContent =
                `${wish.name} · ${wish.currency}`;


            select.appendChild(
                option
            );

        }
    );

}


/* =====================================================
   PACKAGE CATEGORY LOGIC
===================================================== */

function updateAllocationField() {

    const categoryElement =
        document.getElementById(
            "recordCategory"
        );


    const select =
        document.getElementById(
            "recordWish"
        );


    if (!categoryElement || !select) {
        return;
    }


    const category =
        categoryElement.value;


    const eligible =
        category !== "包袋";


    if (!eligible) {

        select.value = "";

        select.disabled = true;

        select.title =
            "包袋不计入配货";

    } else {

        select.disabled = false;

        select.title = "";

    }

}


/* =====================================================
   SAVE RECORD
===================================================== */

function saveRecord(event) {

    event.preventDefault();


    const category =
        document.getElementById(
            "recordCategory"
        ).value;


    let wishId =
        document.getElementById(
            "recordWish"
        ).value;


    /*
        包袋绝对不能进入配货。
    */

    if (
        category === "包袋"
    ) {

        wishId = "";

    }


    const price =
        Number(
            document.getElementById(
                "recordPrice"
            ).value
        );


    const currency =
        document.getElementById(
            "recordCurrency"
        ).value;


    /*
        检查心愿币种。
    */

    if (wishId) {

        const wish =
            wishes.find(
                item =>
                    item.id === wishId
            );


        if (
            wish &&
            wish.currency !== currency
        ) {

            const shouldContinue =
                confirm(
                    `这个心愿的币种是 ${wish.currency}，\n当前购物记录是 ${currency}。\n\n不同币种不会自动换算。\n\n仍然要归属到这个心愿吗？`
                );


            if (!shouldContinue) {

                return;

            }

        }

    }


    const data = {

        name:
            document
                .getElementById(
                    "recordName"
                )
                .value
                .trim(),

        category,

        material:
            document
                .getElementById(
                    "recordMaterial"
                )
                .value
                .trim(),

        color:
            document
                .getElementById(
                    "recordColor"
                )
                .value
                .trim(),

        size:
            document
                .getElementById(
                    "recordSize"
                )
                .value
                .trim(),

        price,

        currency,

        store:
            document
                .getElementById(
                    "recordStore"
                )
                .value
                .trim(),

        date:
            document
                .getElementById(
                    "recordDate"
                )
                .value,

        image:
            recordImageData,

        wishId

    };


    if (!data.name) {

        showToast(
            "请输入品名"
        );

        return;

    }


    if (editingRecordId) {

        const index =
            records.findIndex(
                record =>
                    record.id ===
                    editingRecordId
            );


        if (index !== -1) {

            records[index] = {

                ...records[index],

                ...data

            };

        }


        showToast(
            "记录已更新，配货额度已同步"
        );

    } else {

        records.unshift({

            id: uid(),

            ...data,

            createdAt:
                new Date()
                    .toISOString()

        });


        showToast(
            wishId
                ? "记录已保存，配货额度已更新"
                : "记录已保存"
        );

    }


    saveData();

    renderAll();

    closeRecordModal();

}


/* =====================================================
   DELETE RECORD
===================================================== */

function deleteRecord(id) {

    const record =
        records.find(
            item =>
                item.id === id
        );


    if (!record) return;


    const allocationText =
        record.wishId
            ? "\n\n删除后，这笔消费也会从对应心愿的配货进度中扣除。"
            : "";


    if (
        !confirm(
            "确定删除这条记录吗？" +
            allocationText
        )
    ) {

        return;

    }


    records =
        records.filter(
            item =>
                item.id !== id
        );


    saveData();

    renderAll();

    showToast(
        "记录已删除，配货额度已同步"
    );

}


/* =====================================================
   RECORD FILTER
===================================================== */

function renderFilters() {

    const container =
        document.getElementById(
            "categoryFilters"
        );


    if (!container) return;


    container.innerHTML =
        categories.map(
            category => `

                <button
                    class="
                        filter
                        ${
                            currentFilter ===
                            category
                                ? "active"
                                : ""
                        }
                    "
                    data-filter="${category}"
                >
                    ${category}
                </button>

            `
        ).join("");

}


function setFilter(category) {

    currentFilter =
        category;

    renderFilters();

    renderRecords();

}


/* =====================================================
   RECORD LIST
===================================================== */

function getWishById(id) {

    return wishes.find(
        wish =>
            wish.id === id
    );

}


function renderRecords() {

    const list =
        document.getElementById(
            "recordList"
        );


    if (!list) return;


    let filtered =
        [...records].sort(
            (a, b) =>
                new Date(b.date) -
                new Date(a.date)
        );


    if (
        currentFilter !== "全部"
    ) {

        filtered =
            filtered.filter(
                record =>
                    record.category ===
                    currentFilter
            );

    }


    if (!filtered.length) {

        list.innerHTML = `

            <div class="empty">

                <div class="empty-title">
                    暂无记录
                </div>

                <div class="empty-text">
                    点击「新增记录」
                </div>

            </div>

        `;

        return;

    }


    list.innerHTML =
        filtered.map(
            record => {

                const wish =
                    getWishById(
                        record.wishId
                    );


                const allocationHTML =
                    wish
                        ? `

                            <div
                                class="
                                    record-allocation
                                "
                            >

                                <span
                                    class="
                                        allocation-dot
                                    "
                                ></span>

                                配货至：
                                ${escapeHTML(
                                    wish.name
                                )}

                            </div>

                          `
                        : "";


                return `

                    <article class="record">

                        <div
                            class="record-image"
                        >

                            ${
                                record.image

                                ? `
                                    <img
                                        src="${record.image}"
                                        alt="${escapeHTML(
                                            record.name
                                        )}"
                                    >
                                  `

                                : `
                                    <div
                                        class="
                                            image-placeholder
                                        "
                                    >
                                        Archive
                                    </div>
                                  `
                            }

                        </div>


                        <div>

                            <div
                                class="record-name"
                            >
                                ${escapeHTML(
                                    record.name
                                )}
                            </div>


                            <div
                                class="record-meta"
                            >

                                <span>
                                    ${escapeHTML(
                                        record.category
                                    )}
                                </span>

                                ${
                                    record.material
                                        ? `
                                            <span>
                                                ${escapeHTML(
                                                    record.material
                                                )}
                                            </span>
                                          `
                                        : ""
                                }

                                ${
                                    record.color
                                        ? `
                                            <span>
                                                ${escapeHTML(
                                                    record.color
                                                )}
                                            </span>
                                          `
                                        : ""
                                }

                                ${
                                    record.size
                                        ? `
                                            <span>
                                                ${escapeHTML(
                                                    record.size
                                                )}
                                            </span>
                                          `
                                        : ""
                                }

                                ${
                                    record.store
                                        ? `
                                            <span>
                                                ${escapeHTML(
                                                    record.store
                                                )}
                                            </span>
                                          `
                                        : ""
                                }

                            </div>


                            ${allocationHTML}


                            <div
                                class="record-actions"
                            >

                                <button
                                    class="icon-btn"
                                    data-edit-record="${record.id}"
                                >
                                    ✎
                                </button>

                                <button
                                    class="icon-btn"
                                    data-delete-record="${record.id}"
                                >
                                    ×
                                </button>

                            </div>

                        </div>


                        <div
                            class="record-right"
                        >

                            <div
                                class="record-price"
                            >
                                ${money(
                                    record.price,
                                    record.currency
                                )}
                            </div>

                            <div
                                class="record-date"
                            >
                                ${dateText(
                                    record.date
                                )}
                            </div>

                        </div>

                    </article>

                `;

            }
        ).join("");

}


/* =====================================================
   SUMMARY
===================================================== */

function updateSummary() {

    const count =
        records.length;


    const pieceCount =
        document.getElementById(
            "pieceCount"
        );


    const headerCount =
        document.getElementById(
            "headerCount"
        );


    const wishlistCount =
        document.getElementById(
            "wishlistCount"
        );


    if (pieceCount) {

        pieceCount.textContent =
            count;

    }


    if (headerCount) {

        headerCount.textContent =
            `${count} Pieces`;

    }


    if (wishlistCount) {

        wishlistCount.textContent =
            wishes.filter(
                wish =>
                    getWishStatus(wish) !==
                    "已入手"
            ).length;

    }


    const totals = {};


    records.forEach(
        record => {

            const currency =
                record.currency ||
                "USD";


            totals[currency] =
                (
                    totals[currency] ||
                    0
                )
                +
                Number(
                    record.price || 0
                );

        }
    );


    const currencies =
        Object.keys(totals);


    const totalSpending =
        document.getElementById(
            "totalSpending"
        );


    const currencySummary =
        document.getElementById(
            "currencySummary"
        );


    if (!currencies.length) {

        if (totalSpending) {

            totalSpending.textContent =
                "—";

        }


        if (currencySummary) {

            currencySummary.textContent =
                "暂无消费";

        }

    } else {

        const first =
            currencies[0];


        if (totalSpending) {

            totalSpending.textContent =
                money(
                    totals[first],
                    first
                );

        }


        if (currencySummary) {

            currencySummary.textContent =
                currencies
                    .map(
                        currency =>
                            `${currency} ${
                                totals[
                                    currency
                                ].toLocaleString()
                            }`
                    )
                    .join(" · ");

        }

    }


    const sorted =
        [...records].sort(
            (a, b) =>
                new Date(b.date) -
                new Date(a.date)
        );


    const latestDate =
        document.getElementById(
            "latestDate"
        );


    const latestName =
        document.getElementById(
            "latestName"
        );


    if (sorted.length) {

        if (latestDate) {

            latestDate.textContent =
                dateText(
                    sorted[0].date
                );

        }


        if (latestName) {

            latestName.textContent =
                sorted[0].name;

        }

    } else {

        if (latestDate) {

            latestDate.textContent =
                "—";

        }


        if (latestName) {

            latestName.textContent =
                "—";

        }

    }

}


/* =====================================================
   STORE FILTER
===================================================== */


/*
    从购物记录中自动收集店铺。

    例如：

    Beverly Hills
    Rodeo Drive
    New York

    会自动出现在消费权重的店铺选择器中。
*/


function getStores() {

    const storeSet =
        new Set();


    records.forEach(
        record => {

            const store =
                String(
                    record.store || ""
                ).trim();


            if (store) {

                storeSet.add(
                    store
                );

            }

        }
    );


    return Array.from(
        storeSet
    ).sort(
        (a, b) =>
            a.localeCompare(
                b,
                "zh-CN"
            )
    );

}


function renderStoreFilter() {

    document
        .querySelectorAll(
            "#storeFilter"
        )
        .forEach(
            extra => {

                const wrapper =
                    extra.closest(
                        ".store-filter-wrap"
                    );


                if (wrapper) {

                    wrapper.remove();

                } else {

                    extra.remove();

                }

            }
        );


    const select =
        document.getElementById(
            "analysisStore"
        );


    if (!select) return;


    /*
        自动收集当前记录里的所有店铺。
    */

    const stores =
        getStores();


    /*
        如果之前选择的店铺已经不存在，
        自动恢复为「全部」。
    */

    if (
        analysisStore !== "全部" &&
        !stores.includes(
            analysisStore
        )
    ) {

        analysisStore =
            "全部";

    }


    /*
        重建下拉菜单。
    */

    select.innerHTML = `

        <option value="全部">
            全部店铺
        </option>

        ${
            stores.map(
                store => `

                    <option
                        value="${escapeHTML(
                            store
                        )}"
                    >
                        ${escapeHTML(
                            store
                        )}
                    </option>

                `
            ).join("")
        }

    `;


    /*
        恢复当前选中的店铺。
    */

    select.value =
        analysisStore;

}


function buildCategoryTotals(
    items,
    getValue
) {

    const totals = {};


    Object.keys(categoryGroups)
        .forEach(
            key =>
                totals[key] = 0
        );


    items.forEach(
        item => {

            Object.entries(categoryGroups)
                .forEach(
                    ([group, groupCategories]) => {

                        if (
                            groupCategories.includes(
                                item.category
                            )
                        ) {

                            totals[group] +=
                                Number(
                                    getValue(item) ||
                                    0
                                );

                        }

                    }
                );

        }
    );


    return totals;

}


function renderCategoryPie({
    pie,
    totalElement,
    legend,
    entries,
    items,
    emptyTitle,
    emptyText
}) {

    const total =
        entries.reduce(
            (sum, [, value]) =>
                sum + value,
            0
        );


    if (
        !pie ||
        !totalElement ||
        !legend
    ) {

        return;

    }


    if (!total) {

        pie.style.background =
            "#e4ddd2";

        totalElement.textContent =
            "—";

        legend.innerHTML = `

            <div class="empty">

                <div class="empty-title">
                    ${emptyTitle}
                </div>

                <div class="empty-text">
                    ${emptyText}
                </div>

            </div>

        `;

        return;

    }


    let current = 0;


    const segments =
        entries.map(
            ([name, value]) => {

                const percent =
                    value /
                    total *
                    100;

                const start =
                    current;

                current += percent;

                return {
                    name,
                    value,
                    percent,
                    start,
                    end: current,
                    color:
                        analysisColors[name]
                };

            }
        );


    pie.style.background =
        `conic-gradient(${
            segments
                .map(
                    segment =>
                        `${segment.color} ${segment.start}% ${segment.end}%`
                )
                .join(", ")
        })`;


    const currencies =
        Array.from(
            new Set(
                items
                    .filter(
                        item =>
                            Number(
                                item.price || 0
                            ) > 0
                    )
                    .map(
                        item =>
                            item.currency ||
                            "USD"
                    )
            )
        );


    if (currencies.length === 1) {

        totalElement.textContent =
            money(
                total,
                currencies[0]
            );

    } else if (currencies.length > 1) {

        totalElement.textContent =
            "多币种";

    } else {

        totalElement.textContent =
            "—";

    }


    legend.innerHTML =
        segments.map(
            segment => `

                <div class="legend-item">

                    <div
                        class="legend-dot"
                        style="background:${segment.color}"
                    ></div>

                    <div>

                        <div>
                            ${escapeHTML(segment.name)}
                        </div>

                        <div class="legend-percent">
                            ${segment.percent.toFixed(1)}%
                        </div>

                    </div>

                    <div class="legend-value">
                        ${
                            currencies.length === 1
                                ? money(
                                    segment.value,
                                    currencies[0]
                                )
                                : segment.value.toLocaleString(
                                    "en-US",
                                    {
                                        maximumFractionDigits: 2
                                    }
                                )
                        }
                    </div>

                </div>

            `
        ).join("");

}


/* =====================================================
   PIE ANALYSIS
===================================================== */


/*
    =====================================================
    消费权重分析逻辑
    =====================================================

    第一层：
    店铺筛选

    第二层：
    店铺内部的品类权重


    例如：

    全部店铺
        ↓
    所有店铺消费

    Beverly Hills
        ↓
    只分析 Beverly Hills

    Rodeo Drive
        ↓
    只分析 Rodeo Drive


    含包袋：

        包袋
        丝巾 / 家居
        鞋履 / 小皮具
        首饰
        成衣


    不含包袋：

        丝巾 / 家居
        鞋履 / 小皮具
        首饰
        成衣


    注意：

    「店铺」不是一个消费品类。

    它只是分析范围。

    所以饼图里面不会再出现一个
    「店铺」的饼图分类。

    页面上只需要一个店铺选择器。
*/


function renderAnalysis() {

    renderStoreFilter();


    let analysisRecords =
        [...records];


    if (
        analysisStore !== "全部"
    ) {

        analysisRecords =
            records.filter(
                record =>
                    String(
                        record.store || ""
                    ).trim() ===
                    analysisStore
            );

    }


    analysisRecords =
        analysisRecords.filter(
            record =>
                analysisWithBag ||
                record.category !== "包袋"
        );


    const totals =
        buildCategoryTotals(
            analysisRecords,
            record =>
                record.price
        );


    const entries =
        Object.entries(totals)
            .filter(
                ([group, value]) => {

                    if (
                        !analysisWithBag &&
                        group === "包袋"
                    ) {

                        return false;

                    }


                    return value > 0;

                }
            );


    renderCategoryPie({
        pie:
            document.getElementById(
                "pie"
            ),
        totalElement:
            document.getElementById(
                "pieTotal"
            ),
        legend:
            document.getElementById(
                "legend"
            ),
        entries,
        items:
            analysisRecords,
        emptyTitle:
            analysisStore === "全部"
                ? "暂无消费数据"
                : `「${escapeHTML(analysisStore)}」暂无消费数据`,
        emptyText:
            analysisWithBag
                ? "含包袋"
                : "不含包袋"
    });

}


/* =====================================================
   IMAGE RESIZE
===================================================== */

function resizeImage(
    file,
    maxWidth,
    callback
) {

    const reader =
        new FileReader();


    reader.onload =
        function(event) {

            const image =
                new Image();


            image.onload =
                function() {

                    const scale =
                        Math.min(
                            1,
                            maxWidth /
                            image.width
                        );


                    const canvas =
                        document.createElement(
                            "canvas"
                        );


                    canvas.width =
                        image.width *
                        scale;


                    canvas.height =
                        image.height *
                        scale;


                    const ctx =
                        canvas.getContext(
                            "2d"
                        );


                    ctx.drawImage(
                        image,
                        0,
                        0,
                        canvas.width,
                        canvas.height
                    );


                    callback(
                        canvas.toDataURL(
                            "image/jpeg",
                            .82
                        )
                    );

                };


            image.src =
                event.target.result;

        };


    reader.readAsDataURL(file);

}


/* =====================================================
   IMAGE UPLOAD
===================================================== */

function setupImageUploads() {

    const wishImage =
        document.getElementById(
            "wishImage"
        );


    if (wishImage) {

        wishImage.addEventListener(
            "change",
            function() {

                const file =
                    this.files[0];


                if (!file) return;


                resizeImage(
                    file,
                    900,
                    data => {

                        wishImageData =
                            data;


                        const preview =
                            document.getElementById(
                                "wishPreviewImg"
                            );


                        const previewWrap =
                            document.getElementById(
                                "wishImagePreview"
                            );


                        if (preview) {

                            preview.src =
                                data;

                        }


                        if (previewWrap) {

                            previewWrap.classList.add(
                                "show"
                            );

                        }

                    }
                );

            }
        );

    }


    const recordImage =
        document.getElementById(
            "recordImage"
        );


    if (recordImage) {

        recordImage.addEventListener(
            "change",
            function() {

                const file =
                    this.files[0];


                if (!file) return;


                resizeImage(
                    file,
                    1000,
                    data => {

                        recordImageData =
                            data;


                        const preview =
                            document.getElementById(
                                "recordPreviewImg"
                            );


                        const previewWrap =
                            document.getElementById(
                                "recordImagePreview"
                            );


                        if (preview) {

                            preview.src =
                                data;

                        }


                        if (previewWrap) {

                            previewWrap.classList.add(
                                "show"
                            );

                        }

                    }
                );

            }
        );

    }

}


/* =====================================================
   RENDER ALL
===================================================== */

function renderAll() {

    renderWishlist();

    renderWishlistAnalysis();

    renderHarvested();

    renderFilters();

    renderRecords();

    updateSummary();

    renderAnalysis();

}


/* =====================================================
   EVENT DELEGATION
===================================================== */

document.addEventListener(
    "click",
    event => {

        const filter =
            event.target.closest(
                "[data-filter]"
            );


        if (filter) {

            setFilter(
                filter.dataset.filter
            );

            return;

        }


        const editWish =
            event.target.closest(
                "[data-edit-wish]"
            );


        if (editWish) {

            openWishModal(
                editWish.dataset.editWish
            );

            return;

        }


        const deleteWishButton =
            event.target.closest(
                "[data-delete-wish]"
            );


        if (deleteWishButton) {

            deleteWish(
                deleteWishButton
                    .dataset
                    .deleteWish
            );

            return;

        }


        const statusButton =
            event.target.closest(
                "[data-cycle-status]"
            );


        if (statusButton) {

            cycleStatus(
                statusButton
                    .dataset
                    .cycleStatus
            );

            return;

        }


        const editRecordButton =
            event.target.closest(
                "[data-edit-record]"
            );


        if (editRecordButton) {

            openRecordModal(
                editRecordButton
                    .dataset
                    .editRecord
            );

            return;

        }


        const deleteRecordButton =
            event.target.closest(
                "[data-delete-record]"
            );


        if (deleteRecordButton) {

            deleteRecord(
                deleteRecordButton
                    .dataset
                    .deleteRecord
            );

            return;

        }

    }
);


/* =====================================================
   TAB SWITCH
===================================================== */

document
    .querySelectorAll(".tab")
    .forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(
                            ".tab"
                        )
                        .forEach(
                            tab =>
                                tab.classList
                                    .remove(
                                        "active"
                                    )
                        );


                    button.classList.add(
                        "active"
                    );


                    const page =
                        button.dataset.page;


                    document
                        .querySelectorAll(
                            ".page"
                        )
                        .forEach(
                            pageElement => {

                                pageElement.hidden =
                                    pageElement.id !==
                                    `${page}Page`;

                            }
                        );

                }
            );

        }
    );


/* =====================================================
   MODAL OPEN BUTTONS
===================================================== */

const addWishBtn =
    document.getElementById(
        "addWishBtn"
    );


if (addWishBtn) {

    addWishBtn.addEventListener(
        "click",
        () =>
            openWishModal()
    );

}


const addRecordBtn =
    document.getElementById(
        "addRecordBtn"
    );


if (addRecordBtn) {

    addRecordBtn.addEventListener(
        "click",
        () =>
            openRecordModal()
    );

}


/* =====================================================
   MODAL CLOSE
===================================================== */

document
    .querySelectorAll(
        "[data-close-wish]"
    )
    .forEach(
        button =>
            button.addEventListener(
                "click",
                closeWishModal
            )
    );


document
    .querySelectorAll(
        "[data-close-record]"
    )
    .forEach(
        button =>
            button.addEventListener(
                "click",
                closeRecordModal
            )
    );


const wishModal =
    document.getElementById(
        "wishModal"
    );


if (wishModal) {

    wishModal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                event.currentTarget
            ) {

                closeWishModal();

            }

        }
    );

}


const recordModal =
    document.getElementById(
        "recordModal"
    );


if (recordModal) {

    recordModal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                event.currentTarget
            ) {

                closeRecordModal();

            }

        }
    );

}


/* =====================================================
   ESC
===================================================== */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key ===
            "Escape"
        ) {

            closeWishModal();

            closeRecordModal();

        }

    }
);


/* =====================================================
   FORM EVENTS
===================================================== */

const wishForm =
    document.getElementById(
        "wishForm"
    );


if (wishForm) {

    wishForm.addEventListener(
        "submit",
        saveWish
    );

}


const recordForm =
    document.getElementById(
        "recordForm"
    );


if (recordForm) {

    recordForm.addEventListener(
        "submit",
        saveRecord
    );

}


const recordCategory =
    document.getElementById(
        "recordCategory"
    );


if (recordCategory) {

    recordCategory.addEventListener(
        "change",
        updateAllocationField
    );

}


const exportDataBtn =
    document.getElementById(
        "exportDataBtn"
    );


if (exportDataBtn) {

    exportDataBtn.addEventListener(
        "click",
        exportData
    );

}


const importDataBtn =
    document.getElementById(
        "importDataBtn"
    );


const importDataInput =
    document.getElementById(
        "importDataFile"
    );


if (
    importDataBtn &&
    importDataInput
) {

    importDataBtn.addEventListener(
        "click",
        () =>
            importDataInput.click()
    );


    importDataInput.addEventListener(
        "change",
        () => {

            importBackupFile(
                importDataInput.files[0]
            );

            importDataInput.value =
                "";

        }
    );

}


window.addEventListener(
    "storage",
    event => {

        if (
            event.key === DATA_SYNC_KEY ||
            event.key === RECORD_KEY ||
            event.key === WISH_KEY
        ) {

            refreshDataFromStorage();

        }

    }
);


/* =====================================================
   ANALYSIS MODE
===================================================== */

const withBagBtn =
    document.getElementById(
        "withBagBtn"
    );


if (withBagBtn) {

    withBagBtn.addEventListener(
        "click",
        () =>
            setAnalysisMode(true)
    );

}


const withoutBagBtn =
    document.getElementById(
        "withoutBagBtn"
    );


if (withoutBagBtn) {

    withoutBagBtn.addEventListener(
        "click",
        () =>
            setAnalysisMode(false)
    );

}


const analysisStoreSelect =
    document.getElementById(
        "analysisStore"
    );


if (analysisStoreSelect) {

    analysisStoreSelect.addEventListener(
        "change",
        () => {

            analysisStore =
                analysisStoreSelect.value ||
                "全部";

            renderAnalysis();

        }
    );

}


function setAnalysisMode(
    withBag
) {

    analysisWithBag =
        withBag;


    if (withBagBtn) {

        withBagBtn.classList.toggle(
            "active",
            withBag
        );

    }


    if (withoutBagBtn) {

        withoutBagBtn.classList.toggle(
            "active",
            !withBag
        );

    }


    renderAnalysis();

}


/* =====================================================
   INITIALIZE
===================================================== */

setupImageUploads();

renderAll();
