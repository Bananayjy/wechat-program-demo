"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultCategories = getDefaultCategories;
exports.loadLedgers = loadLedgers;
exports.getCurrentBookId = getCurrentBookId;
exports.setCurrentBookId = setCurrentBookId;
exports.addLedger = addLedger;
exports.renameLedger = renameLedger;
exports.updateLedgerCover = updateLedgerCover;
exports.removeLedger = removeLedger;
exports.loadCategoriesForBook = loadCategoriesForBook;
exports.saveCategoriesForBook = saveCategoriesForBook;
exports.loadTransactionsForBook = loadTransactionsForBook;
exports.saveTransactionsForBook = saveTransactionsForBook;
exports.loadCategories = loadCategories;
exports.saveCategories = saveCategories;
exports.loadTransactions = loadTransactions;
exports.saveTransactions = saveTransactions;
exports.addCategory = addCategory;
exports.updateCategory = updateCategory;
exports.removeCategory = removeCategory;
exports.addTransaction = addTransaction;
exports.updateTransaction = updateTransaction;
exports.removeTransaction = removeTransaction;
exports.loadSyncConfig = loadSyncConfig;
exports.saveSyncConfig = saveSyncConfig;
exports.buildFullSyncPayload = buildFullSyncPayload;
exports.applyFullSyncPayload = applyFullSyncPayload;
exports.clearAllLocalAccountData = clearAllLocalAccountData;
exports.uid = uid;
const KEY_CATEGORIES = 'accountbook_categories_v1';
const KEY_TRANSACTIONS = 'accountbook_transactions_v1';
const KEY_LEDGERS = 'accountbook_ledgers_v1';
const KEY_CURRENT_BOOK = 'accountbook_current_book_v1';
const KEY_SYNC_CONFIG = 'accountbook_sync_config_v1';
function txKey(bookId) {
    return `accountbook_transactions_v1_${bookId}`;
}
function catKey(bookId) {
    return `accountbook_categories_v1_${bookId}`;
}
function uid() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
let migrationDone = false;
function runMigrationOnce() {
    if (migrationDone)
        return;
    migrationDone = true;
    try {
        const rawLedgers = wx.getStorageSync(KEY_LEDGERS);
        if (rawLedgers !== undefined && rawLedgers !== null && rawLedgers !== '') {
            const parsed = typeof rawLedgers === 'string' ? JSON.parse(rawLedgers) : rawLedgers;
            if (Array.isArray(parsed) && parsed.length > 0)
                return;
        }
        const legacyTxRaw = wx.getStorageSync(KEY_TRANSACTIONS);
        const legacyCatRaw = wx.getStorageSync(KEY_CATEGORIES);
        let legacyTxs = [];
        if (legacyTxRaw) {
            const list = typeof legacyTxRaw === 'string' ? JSON.parse(legacyTxRaw) : legacyTxRaw;
            legacyTxs = Array.isArray(list) ? list : [];
        }
        let legacyCats = [];
        if (legacyCatRaw) {
            const list = typeof legacyCatRaw === 'string' ? JSON.parse(legacyCatRaw) : legacyCatRaw;
            legacyCats = Array.isArray(list) ? list : [];
        }
        const bookId = uid();
        const now = Date.now();
        const ledger = { id: bookId, name: '默认账本', createdAt: now };
        wx.setStorageSync(KEY_LEDGERS, [ledger]);
        wx.setStorageSync(KEY_CURRENT_BOOK, bookId);
        const cats = legacyCats.length > 0 ? legacyCats : getDefaultCategories();
        wx.setStorageSync(catKey(bookId), cats);
        wx.setStorageSync(txKey(bookId), legacyTxs);
        try {
            wx.removeStorageSync(KEY_TRANSACTIONS);
        }
        catch (_a) {
            /* empty */
        }
        try {
            wx.removeStorageSync(KEY_CATEGORIES);
        }
        catch (_b) {
            /* empty */
        }
    }
    catch (_c) {
        migrationDone = false;
    }
}
function ensureStorageReady() {
    runMigrationOnce();
}
const DEFAULT_EXPENSE = [
    { id: 'c_exp_food', name: '餐饮', type: 'expense' },
    { id: 'c_exp_transport', name: '交通', type: 'expense' },
    { id: 'c_exp_shopping', name: '购物', type: 'expense' },
    { id: 'c_exp_housing', name: '居住', type: 'expense' },
    { id: 'c_exp_other', name: '其他', type: 'expense' },
];
const DEFAULT_INCOME = [
    { id: 'c_in_salary', name: '工资', type: 'income' },
    { id: 'c_in_bonus', name: '奖金', type: 'income' },
    { id: 'c_in_other', name: '其他', type: 'income' },
];
function getDefaultCategories() {
    return [...DEFAULT_EXPENSE, ...DEFAULT_INCOME];
}
function loadLedgers() {
    ensureStorageReady();
    try {
        const raw = wx.getStorageSync(KEY_LEDGERS);
        if (!raw)
            return [];
        const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(list) ? list : [];
    }
    catch (_a) {
        return [];
    }
}
function saveLedgersInternal(list) {
    wx.setStorageSync(KEY_LEDGERS, list);
}
function getCurrentBookId() {
    var _a;
    ensureStorageReady();
    try {
        const id = wx.getStorageSync(KEY_CURRENT_BOOK);
        const ledgers = loadLedgers();
        if (id && ledgers.some((l) => l.id === id))
            return id;
        const first = (_a = ledgers[0]) === null || _a === void 0 ? void 0 : _a.id;
        if (first) {
            wx.setStorageSync(KEY_CURRENT_BOOK, first);
            return first;
        }
        return '';
    }
    catch (_b) {
        return '';
    }
}
function setCurrentBookId(id) {
    ensureStorageReady();
    const ledgers = loadLedgers();
    if (!ledgers.some((l) => l.id === id))
        return;
    wx.setStorageSync(KEY_CURRENT_BOOK, id);
}
function addLedger(name) {
    ensureStorageReady();
    const trimmed = name.trim() || '新账本';
    const item = { id: uid(), name: trimmed, createdAt: Date.now() };
    const list = loadLedgers();
    list.push(item);
    saveLedgersInternal(list);
    wx.setStorageSync(catKey(item.id), getDefaultCategories());
    wx.setStorageSync(txKey(item.id), []);
    return item;
}
function renameLedger(id, name) {
    ensureStorageReady();
    const trimmed = name.trim();
    if (!trimmed)
        return false;
    const list = loadLedgers();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0)
        return false;
    list[i] = { ...list[i], name: trimmed };
    saveLedgersInternal(list);
    return true;
}
function unlinkLedgerCoverIfLocal(path) {
    if (!path || !path.startsWith(`${wx.env.USER_DATA_PATH}`))
        return;
    try {
        wx.getFileSystemManager().unlinkSync(path);
    }
    catch (_a) {
        /* empty */
    }
}
/** 设置账本封面本地路径；传 undefined 表示清除封面并删除旧本地文件 */
function updateLedgerCover(id, localPath) {
    ensureStorageReady();
    const list = loadLedgers();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0)
        return false;
    const prev = list[i].coverImagePath;
    if (prev && prev !== localPath) {
        unlinkLedgerCoverIfLocal(prev);
    }
    list[i] = { ...list[i], coverImagePath: localPath };
    saveLedgersInternal(list);
    return true;
}
function removeLedger(id) {
    var _a;
    ensureStorageReady();
    const list = loadLedgers();
    if (list.length <= 1) {
        return { ok: false, message: '至少保留一个账本' };
    }
    if (!list.some((l) => l.id === id)) {
        return { ok: false, message: '账本不存在' };
    }
    const victim = list.find((l) => l.id === id);
    if (victim === null || victim === void 0 ? void 0 : victim.coverImagePath) {
        unlinkLedgerCoverIfLocal(victim.coverImagePath);
    }
    const next = list.filter((l) => l.id !== id);
    saveLedgersInternal(next);
    try {
        wx.removeStorageSync(txKey(id));
    }
    catch (_b) {
        /* empty */
    }
    try {
        wx.removeStorageSync(catKey(id));
    }
    catch (_c) {
        /* empty */
    }
    const cur = getCurrentBookId();
    if (cur === id) {
        const first = (_a = next[0]) === null || _a === void 0 ? void 0 : _a.id;
        if (first)
            wx.setStorageSync(KEY_CURRENT_BOOK, first);
    }
    return { ok: true };
}
function loadCategoriesForBook(bookId) {
    ensureStorageReady();
    try {
        const raw = wx.getStorageSync(catKey(bookId));
        if (!raw)
            return getDefaultCategories();
        const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(list) || list.length === 0)
            return getDefaultCategories();
        return list;
    }
    catch (_a) {
        return getDefaultCategories();
    }
}
function saveCategoriesForBook(bookId, list) {
    ensureStorageReady();
    wx.setStorageSync(catKey(bookId), list);
}
function loadTransactionsForBook(bookId) {
    ensureStorageReady();
    try {
        const raw = wx.getStorageSync(txKey(bookId));
        if (!raw)
            return [];
        const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(list) ? list : [];
    }
    catch (_a) {
        return [];
    }
}
function saveTransactionsForBook(bookId, list) {
    ensureStorageReady();
    wx.setStorageSync(txKey(bookId), list);
}
function loadCategories() {
    return loadCategoriesForBook(getCurrentBookId());
}
function saveCategories(list) {
    saveCategoriesForBook(getCurrentBookId(), list);
}
function loadTransactions() {
    return loadTransactionsForBook(getCurrentBookId());
}
function saveTransactions(list) {
    saveTransactionsForBook(getCurrentBookId(), list);
}
function addCategory(c) {
    const item = { ...c, id: uid() };
    const list = loadCategories();
    list.push(item);
    saveCategories(list);
    return item;
}
function updateCategory(id, patch) {
    const list = loadCategories();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0)
        return false;
    list[i] = { ...list[i], ...patch };
    saveCategories(list);
    return true;
}
function removeCategory(id) {
    const txs = loadTransactions();
    if (txs.some((t) => t.categoryId === id)) {
        return false;
    }
    const list = loadCategories().filter((c) => c.id !== id);
    saveCategories(list);
    return true;
}
function addTransaction(input) {
    const item = { ...input, id: uid() };
    const bookId = getCurrentBookId();
    const list = loadTransactionsForBook(bookId);
    list.push(item);
    list.sort((a, b) => b.occurredAt - a.occurredAt);
    saveTransactionsForBook(bookId, list);
    return item;
}
function updateTransaction(id, patch) {
    const bookId = getCurrentBookId();
    const list = loadTransactionsForBook(bookId);
    const i = list.findIndex((x) => x.id === id);
    if (i < 0)
        return false;
    list[i] = { ...list[i], ...patch };
    list.sort((a, b) => b.occurredAt - a.occurredAt);
    saveTransactionsForBook(bookId, list);
    return true;
}
function removeTransaction(id) {
    const bookId = getCurrentBookId();
    const list = loadTransactionsForBook(bookId).filter((t) => t.id !== id);
    saveTransactionsForBook(bookId, list);
    return true;
}
function normalizeSyncConfig(raw) {
    var _a;
    const parsed = (raw || {});
    const apiBaseRaw = (_a = parsed.apiBase) !== null && _a !== void 0 ? _a : parsed.baseUrl;
    const cloudEnvIdRaw = parsed.cloudEnvId;
    const catalogueCodeRaw = parsed.catalogueCode;
    const apiBase = typeof apiBaseRaw === 'string' && apiBaseRaw.startsWith('http')
        ? apiBaseRaw.trim()
        : '';
    const cloudEnvId = typeof cloudEnvIdRaw === 'string' ? cloudEnvIdRaw.trim() : '';
    const catalogueCode = typeof catalogueCodeRaw === 'string' ? catalogueCodeRaw.trim() : '';
    return {
        apiBase,
        enabled: !!parsed.enabled,
        catalogueCode,
        cloudEnvId,
    };
}
function loadSyncConfig() {
    try {
        const raw = wx.getStorageSync(KEY_SYNC_CONFIG);
        if (!raw) {
            return { apiBase: '', enabled: false, catalogueCode: '', cloudEnvId: '' };
        }
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return normalizeSyncConfig(parsed);
    }
    catch (_a) {
        return { apiBase: '', enabled: false, catalogueCode: '', cloudEnvId: '' };
    }
}
function saveSyncConfig(c) {
    wx.setStorageSync(KEY_SYNC_CONFIG, normalizeSyncConfig(c));
}
function buildFullSyncPayload() {
    ensureStorageReady();
    const ledgers = loadLedgers();
    const books = ledgers.map((l) => ({
        bookId: l.id,
        categories: loadCategoriesForBook(l.id),
        transactions: loadTransactionsForBook(l.id),
    }));
    return { ledgers, books, clientTime: Date.now() };
}
function applyFullSyncPayload(data) {
    ensureStorageReady();
    if (data.ledgers && Array.isArray(data.ledgers) && data.ledgers.length > 0) {
        saveLedgersInternal(data.ledgers);
    }
    if (data.books && Array.isArray(data.books)) {
        for (const b of data.books) {
            if (!b.bookId)
                continue;
            if (b.categories && Array.isArray(b.categories)) {
                saveCategoriesForBook(b.bookId, b.categories);
            }
            if (b.transactions && Array.isArray(b.transactions)) {
                saveTransactionsForBook(b.bookId, b.transactions);
            }
        }
    }
    const cur = getCurrentBookId();
    const ledgers = loadLedgers();
    if (!ledgers.some((l) => l.id === cur) && ledgers[0]) {
        wx.setStorageSync(KEY_CURRENT_BOOK, ledgers[0].id);
    }
}
/** 移除本应用全部本地键（流水、分类、账本、同步配置）；下次 load 时与首次安装一致 */
function clearAllLocalAccountData() {
    ensureStorageReady();
    const keysToRemove = new Set([
        KEY_TRANSACTIONS,
        KEY_CATEGORIES,
        KEY_LEDGERS,
        KEY_CURRENT_BOOK,
        KEY_SYNC_CONFIG,
    ]);
    for (const l of loadLedgers()) {
        keysToRemove.add(txKey(l.id));
        keysToRemove.add(catKey(l.id));
    }
    for (const k of keysToRemove) {
        try {
            wx.removeStorageSync(k);
        }
        catch (_a) {
            /* empty */
        }
    }
    migrationDone = false;
}
