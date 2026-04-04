"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultCategories = getDefaultCategories;
exports.loadCategories = loadCategories;
exports.saveCategories = saveCategories;
exports.addCategory = addCategory;
exports.updateCategory = updateCategory;
exports.removeCategory = removeCategory;
exports.loadTransactions = loadTransactions;
exports.saveTransactions = saveTransactions;
exports.addTransaction = addTransaction;
exports.updateTransaction = updateTransaction;
exports.removeTransaction = removeTransaction;
exports.loadSyncConfig = loadSyncConfig;
exports.saveSyncConfig = saveSyncConfig;
exports.uid = uid;
const KEY_CATEGORIES = 'accountbook_categories_v1';
const KEY_TRANSACTIONS = 'accountbook_transactions_v1';
const KEY_SYNC_CONFIG = 'accountbook_sync_config_v1';
function uid() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
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
function loadCategories() {
    try {
        const raw = wx.getStorageSync(KEY_CATEGORIES);
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
function saveCategories(list) {
    wx.setStorageSync(KEY_CATEGORIES, list);
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
function loadTransactions() {
    try {
        const raw = wx.getStorageSync(KEY_TRANSACTIONS);
        if (!raw)
            return [];
        const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(list) ? list : [];
    }
    catch (_a) {
        return [];
    }
}
function saveTransactions(list) {
    wx.setStorageSync(KEY_TRANSACTIONS, list);
}
function addTransaction(input) {
    const item = { ...input, id: uid() };
    const list = loadTransactions();
    list.push(item);
    list.sort((a, b) => b.occurredAt - a.occurredAt);
    saveTransactions(list);
    return item;
}
function updateTransaction(id, patch) {
    const list = loadTransactions();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0)
        return false;
    list[i] = { ...list[i], ...patch };
    list.sort((a, b) => b.occurredAt - a.occurredAt);
    saveTransactions(list);
    return true;
}
function removeTransaction(id) {
    const list = loadTransactions().filter((t) => t.id !== id);
    saveTransactions(list);
    return true;
}
function loadSyncConfig() {
    var _a;
    try {
        const raw = wx.getStorageSync(KEY_SYNC_CONFIG);
        if (!raw)
            return { apiBase: '', enabled: false };
        const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw);
        const apiBaseRaw = (_a = parsed.apiBase) !== null && _a !== void 0 ? _a : parsed.baseUrl;
        const apiBase = typeof apiBaseRaw === 'string' && apiBaseRaw.startsWith('http')
            ? apiBaseRaw
            : '';
        return {
            apiBase,
            enabled: !!parsed.enabled,
        };
    }
    catch (_b) {
        return { apiBase: '', enabled: false };
    }
}
function saveSyncConfig(c) {
    wx.setStorageSync(KEY_SYNC_CONFIG, c);
}
