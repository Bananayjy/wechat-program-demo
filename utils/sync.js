"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushToRemote = pushToRemote;
exports.pullFromRemote = pullFromRemote;
exports.validateSyncConfig = validateSyncConfig;
const storage_1 = require("./storage");
/**
 * 云开发或自建 API 同步占位：将本地数据 POST 到 baseUrl（路径需以 / 开头）。
 * 实际对接时请在后端实现对应接口并替换请求体格式。
 */
function pushToRemote() {
    const cfg = (0, storage_1.loadSyncConfig)();
    if (!cfg.enabled || !cfg.apiBase) {
        return Promise.resolve({ ok: false, message: '未启用同步或未配置站点地址' });
    }
    const url = joinApi(cfg.apiBase, '/accountbook/sync');
    const body = (0, storage_1.buildFullSyncPayload)();
    return new Promise((resolve) => {
        wx.request({
            url,
            method: 'POST',
            header: { 'content-type': 'application/json' },
            data: body,
            success: (res) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ ok: true, message: '已上传' });
                }
                else {
                    resolve({ ok: false, message: `同步失败 ${res.statusCode}` });
                }
            },
            fail: (err) => {
                resolve({ ok: false, message: err.errMsg || '网络错误' });
            },
        });
    });
}
function pullFromRemote() {
    const cfg = (0, storage_1.loadSyncConfig)();
    if (!cfg.enabled || !cfg.apiBase) {
        return Promise.resolve({ ok: false, message: '未启用同步或未配置站点地址' });
    }
    const url = joinApi(cfg.apiBase, '/accountbook/pull');
    return new Promise((resolve) => {
        wx.request({
            url,
            method: 'GET',
            success: (res) => {
                var _a, _b;
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    resolve({ ok: false, message: `拉取失败 ${res.statusCode}` });
                    return;
                }
                const data = res.data;
                if (data.ledgers && Array.isArray(data.ledgers) && data.books && Array.isArray(data.books)) {
                    (0, storage_1.applyFullSyncPayload)({
                        ledgers: data.ledgers,
                        books: data.books,
                        clientTime: (_a = data.clientTime) !== null && _a !== void 0 ? _a : Date.now(),
                    });
                    resolve({ ok: true, message: '已拉取并合并' });
                    return;
                }
                if (data.categories && Array.isArray(data.categories) && data.transactions && Array.isArray(data.transactions)) {
                    const bid = (0, storage_1.getCurrentBookId)();
                    const ledgers = (0, storage_1.loadLedgers)();
                    const target = ledgers.some((l) => l.id === bid) ? bid : (_b = ledgers[0]) === null || _b === void 0 ? void 0 : _b.id;
                    if (target) {
                        (0, storage_1.saveCategoriesForBook)(target, data.categories);
                        (0, storage_1.saveTransactionsForBook)(target, data.transactions);
                    }
                    resolve({ ok: true, message: '已拉取并合并（旧版格式，仅当前账本）' });
                    return;
                }
                resolve({ ok: false, message: '数据格式无效' });
            },
            fail: (err) => {
                resolve({ ok: false, message: err.errMsg || '网络错误' });
            },
        });
    });
}
function joinApi(apiBase, path) {
    const base = apiBase.replace(/\/$/, '');
    const p = path.startsWith('/') ? path : '/' + path;
    return base + p;
}
/** 业务路径需以 / 开头；站点根需为 https 完整地址 */
function validateSyncConfig(c) {
    if (!c.enabled)
        return null;
    if (!c.apiBase)
        return '请填写 https 站点地址';
    if (!/^https:\/\//i.test(c.apiBase.trim())) {
        return '站点地址需为 https 完整 URL';
    }
    return null;
}
