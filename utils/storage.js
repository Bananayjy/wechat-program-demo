"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUEST_ACCOUNT_ID = void 0;
exports.setStorageAccountId = setStorageAccountId;
exports.getStorageAccountId = getStorageAccountId;
exports.clearStorageAccountId = clearStorageAccountId;
exports.runWithAutoSyncSuppressed = runWithAutoSyncSuppressed;
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
let storageAccountId = null;
exports.GUEST_ACCOUNT_ID = 'guest_local';
/** 登录成功后必须调用，之后所有账本读写均隔离在该账号下 */
function setStorageAccountId(id) {
    storageAccountId = id;
    migrationDoneForAccount = '';
}
function getStorageAccountId() {
    return storageAccountId;
}
function clearStorageAccountId() {
    storageAccountId = null;
    migrationDoneForAccount = '';
}
function requireAccountId() {
    return storageAccountId || exports.GUEST_ACCOUNT_ID;
}
function keyLedgers(accountId) {
    return `accountbook_ledgers_v1_${accountId}`;
}
function keyCurrentBook(accountId) {
    return `accountbook_current_book_v1_${accountId}`;
}
function keySyncConfig(accountId) {
    return `accountbook_sync_config_v1_${accountId}`;
}
function txKey(accountId, bookId) {
    return `accountbook_transactions_v1_${accountId}_${bookId}`;
}
function catKey(accountId, bookId) {
    return `accountbook_categories_v1_${accountId}_${bookId}`;
}
function uid() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
let migrationDoneForAccount = '';
let autoSyncSuppressCount = 0;
function runWithAutoSyncSuppressed(fn) {
    autoSyncSuppressCount += 1;
    try {
        return fn();
    }
    finally {
        autoSyncSuppressCount = Math.max(0, autoSyncSuppressCount - 1);
    }
}
function triggerAutoSync(reason) {
    if (autoSyncSuppressCount > 0)
        return;
    void Promise.resolve().then(() => require('./sync')).then((m) => {
        m.syncAfterLocalMutation(reason);
    })
        .catch(() => {
        /* empty */
    });
}
function initAccountIfEmpty(accountId) {
    if (migrationDoneForAccount === accountId)
        return;
    migrationDoneForAccount = accountId;
    try {
        const rawLedgers = wx.getStorageSync(keyLedgers(accountId));
        if (rawLedgers !== undefined && rawLedgers !== null && rawLedgers !== '') {
            const parsed = typeof rawLedgers === 'string' ? JSON.parse(rawLedgers) : rawLedgers;
            if (Array.isArray(parsed) && parsed.length > 0)
                return;
        }
        const bookId = uid();
        const now = Date.now();
        const ledger = { id: bookId, name: '默认账本', createdAt: now };
        wx.setStorageSync(keyLedgers(accountId), [ledger]);
        wx.setStorageSync(keyCurrentBook(accountId), bookId);
        wx.setStorageSync(catKey(accountId, bookId), getDefaultCategories());
        wx.setStorageSync(txKey(accountId, bookId), []);
    }
    catch (_a) {
        migrationDoneForAccount = '';
    }
}
function ensureStorageReady() {
    const aid = requireAccountId();
    if (!aid)
        return;
    initAccountIfEmpty(aid);
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
    const aid = requireAccountId();
    if (!aid)
        return [];
    ensureStorageReady();
    try {
        const raw = wx.getStorageSync(keyLedgers(aid));
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
    const aid = requireAccountId();
    if (!aid)
        return;
    wx.setStorageSync(keyLedgers(aid), list);
}
function getCurrentBookId() {
    var _a;
    const aid = requireAccountId();
    if (!aid)
        return '';
    ensureStorageReady();
    try {
        const id = wx.getStorageSync(keyCurrentBook(aid));
        const ledgers = loadLedgers();
        if (id && ledgers.some((l) => l.id === id))
            return id;
        const first = (_a = ledgers[0]) === null || _a === void 0 ? void 0 : _a.id;
        if (first) {
            wx.setStorageSync(keyCurrentBook(aid), first);
            return first;
        }
        return '';
    }
    catch (_b) {
        return '';
    }
}
function setCurrentBookId(id) {
    const aid = requireAccountId();
    if (!aid)
        return;
    ensureStorageReady();
    const ledgers = loadLedgers();
    if (!ledgers.some((l) => l.id === id))
        return;
    wx.setStorageSync(keyCurrentBook(aid), id);
    triggerAutoSync('setCurrentBookId');
}
function addLedger(name) {
    const aid = requireAccountId();
    if (!aid) {
        throw new Error('未登录');
    }
    ensureStorageReady();
    const trimmed = name.trim() || '新账本';
    const item = { id: uid(), name: trimmed, createdAt: Date.now() };
    const list = loadLedgers();
    list.push(item);
    saveLedgersInternal(list);
    wx.setStorageSync(catKey(aid, item.id), getDefaultCategories());
    wx.setStorageSync(txKey(aid, item.id), []);
    triggerAutoSync('addLedger');
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
    triggerAutoSync('renameLedger');
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
    triggerAutoSync('updateLedgerCover');
    return true;
}
function removeLedger(id) {
    var _a;
    const aid = requireAccountId();
    if (!aid)
        return { ok: false, message: '未登录' };
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
        wx.removeStorageSync(txKey(aid, id));
    }
    catch (_b) {
        /* empty */
    }
    try {
        wx.removeStorageSync(catKey(aid, id));
    }
    catch (_c) {
        /* empty */
    }
    const cur = getCurrentBookId();
    if (cur === id) {
        const first = (_a = next[0]) === null || _a === void 0 ? void 0 : _a.id;
        if (first)
            wx.setStorageSync(keyCurrentBook(aid), first);
    }
    triggerAutoSync('removeLedger');
    return { ok: true };
}
function loadCategoriesForBook(bookId) {
    const aid = requireAccountId();
    if (!aid)
        return getDefaultCategories();
    ensureStorageReady();
    try {
        const raw = wx.getStorageSync(catKey(aid, bookId));
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
    const aid = requireAccountId();
    if (!aid)
        return;
    ensureStorageReady();
    wx.setStorageSync(catKey(aid, bookId), list);
}
function loadTransactionsForBook(bookId) {
    const aid = requireAccountId();
    if (!aid)
        return [];
    ensureStorageReady();
    try {
        const raw = wx.getStorageSync(txKey(aid, bookId));
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
    const aid = requireAccountId();
    if (!aid)
        return;
    ensureStorageReady();
    wx.setStorageSync(txKey(aid, bookId), list);
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
    triggerAutoSync('addCategory');
    return item;
}
function updateCategory(id, patch) {
    const list = loadCategories();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0)
        return false;
    list[i] = { ...list[i], ...patch };
    saveCategories(list);
    triggerAutoSync('updateCategory');
    return true;
}
function removeCategory(id) {
    const txs = loadTransactions();
    if (txs.some((t) => t.categoryId === id)) {
        return false;
    }
    const list = loadCategories().filter((c) => c.id !== id);
    saveCategories(list);
    triggerAutoSync('removeCategory');
    return true;
}
function addTransaction(input) {
    const item = { ...input, id: uid() };
    const bookId = getCurrentBookId();
    const list = loadTransactionsForBook(bookId);
    list.push(item);
    list.sort((a, b) => b.occurredAt - a.occurredAt);
    saveTransactionsForBook(bookId, list);
    triggerAutoSync('addTransaction');
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
    triggerAutoSync('updateTransaction');
    return true;
}
function removeTransaction(id) {
    const bookId = getCurrentBookId();
    const list = loadTransactionsForBook(bookId).filter((t) => t.id !== id);
    saveTransactionsForBook(bookId, list);
    triggerAutoSync('removeTransaction');
    return true;
}
function normalizeSyncConfig(raw) {
    var _a;
    const parsed = (raw || {});
    const apiBaseRaw = (_a = parsed.apiBase) !== null && _a !== void 0 ? _a : parsed.baseUrl;
    const cloudEnvIdRaw = parsed.cloudEnvId;
    const apiBase = typeof apiBaseRaw === 'string' && apiBaseRaw.startsWith('http')
        ? apiBaseRaw.trim()
        : '';
    const cloudEnvId = typeof cloudEnvIdRaw === 'string' ? cloudEnvIdRaw.trim() : '';
    return {
        apiBase,
        enabled: !!parsed.enabled,
        cloudEnvId,
    };
}
function loadSyncConfig() {
    const aid = requireAccountId();
    if (!aid) {
        return { apiBase: '', enabled: false, cloudEnvId: '' };
    }
    try {
        const raw = wx.getStorageSync(keySyncConfig(aid));
        if (!raw) {
            return { apiBase: '', enabled: false, cloudEnvId: '' };
        }
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return normalizeSyncConfig(parsed);
    }
    catch (_a) {
        return { apiBase: '', enabled: false, cloudEnvId: '' };
    }
}
function saveSyncConfig(c, options) {
    const aid = requireAccountId();
    if (!aid)
        return;
    wx.setStorageSync(keySyncConfig(aid), normalizeSyncConfig(c));
    if (!(options === null || options === void 0 ? void 0 : options.silent)) {
        triggerAutoSync('saveSyncConfig');
    }
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
        const aid = requireAccountId();
        if (aid)
            wx.setStorageSync(keyCurrentBook(aid), ledgers[0].id);
    }
}
/** 移除当前账号下全部本地键（流水、分类、账本、同步配置） */
function clearAllLocalAccountData() {
    const aid = requireAccountId();
    if (!aid)
        return;
    const ledgerIds = [];
    try {
        const raw = wx.getStorageSync(keyLedgers(aid));
        if (raw) {
            const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (Array.isArray(list)) {
                for (const l of list) {
                    if (l && l.id)
                        ledgerIds.push(l.id);
                }
            }
        }
    }
    catch (_a) {
        /* empty */
    }
    const keysToRemove = new Set([
        keyLedgers(aid),
        keyCurrentBook(aid),
        keySyncConfig(aid),
    ]);
    for (const id of ledgerIds) {
        keysToRemove.add(txKey(aid, id));
        keysToRemove.add(catKey(aid, id));
    }
    for (const k of keysToRemove) {
        try {
            wx.removeStorageSync(k);
        }
        catch (_b) {
            /* empty */
        }
    }
    migrationDoneForAccount = '';
}
