"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchProfileRemote = fetchProfileRemote;
exports.updateProfileRemote = updateProfileRemote;
exports.bindWechatRemote = bindWechatRemote;
exports.resetLaunchPullFlag = resetLaunchPullFlag;
exports.shouldPullOnFirstEnterAfterLaunch = shouldPullOnFirstEnterAfterLaunch;
exports.markPullSuccessNow = markPullSuccessNow;
exports.syncAfterLocalMutation = syncAfterLocalMutation;
exports.getRemoteSyncMeta = getRemoteSyncMeta;
exports.shouldAutoPullOnPageEnter = shouldAutoPullOnPageEnter;
exports.resolveConflictIfNeeded = resolveConflictIfNeeded;
exports.pullLatestForPageOrBlock = pullLatestForPageOrBlock;
exports.pushToRemote = pushToRemote;
exports.pullFromRemote = pullFromRemote;
exports.saveSyncConfigRemote = saveSyncConfigRemote;
exports.pullSyncConfigRemote = pullSyncConfigRemote;
exports.cloudFirstAddTransaction = cloudFirstAddTransaction;
exports.cloudFirstUpdateTransaction = cloudFirstUpdateTransaction;
exports.cloudFirstRemoveTransaction = cloudFirstRemoveTransaction;
exports.cloudFirstAddCategory = cloudFirstAddCategory;
exports.cloudFirstUpdateCategory = cloudFirstUpdateCategory;
exports.cloudFirstRemoveCategory = cloudFirstRemoveCategory;
exports.cloudFirstAddLedger = cloudFirstAddLedger;
exports.cloudFirstRenameLedger = cloudFirstRenameLedger;
exports.cloudFirstRemoveLedger = cloudFirstRemoveLedger;
exports.cloudFirstUpdateLedgerCover = cloudFirstUpdateLedgerCover;
exports.validateSyncConfig = validateSyncConfig;
const storage_1 = require("./storage");
const cloudSync_1 = require("./cloudSync");
const session_1 = require("./session");
async function fetchProfileRemote(cfg) {
    const res = await (0, cloudSync_1.callCloudPath)('/user/profile/get', {}, cfg);
    if (!res.ok || !res.data)
        return { ok: false, message: res.message };
    return { ok: true, message: res.message, profile: res.data };
}
async function updateProfileRemote(cfg, patch) {
    const res = await (0, cloudSync_1.callCloudPath)('/user/profile/update', patch, cfg);
    return { ok: res.ok, message: res.message };
}
async function bindWechatRemote(cfg) {
    const res = await (0, cloudSync_1.callCloudPath)('/wechat/bind', {}, cfg);
    return { ok: res.ok, message: res.message };
}
/** 云开发同步入口：业务路径统一以 / 开头，不含 /kapi。 */
const UPLOAD_TX_CHUNK_SIZE = 120;
const PULL_TX_CHUNK_SIZE = 120;
const AUTO_SYNC_DEBOUNCE_MS = 800;
let autoSyncTimer = null;
let autoSyncRunning = false;
let autoSyncPending = false;
let autoSyncReason = '';
function getScopedSyncKey(suffix) {
    const s = (0, session_1.getSession)();
    const accountId = (s === null || s === void 0 ? void 0 : s.accountId) || 'guest_local';
    return `accountbook_sync_runtime_v1_${accountId}_${suffix}`;
}
function getConflictState() {
    try {
        const raw = wx.getStorageSync(getScopedSyncKey('conflictState'));
        if (!raw)
            return { pending: false, message: '', updatedAt: 0 };
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!parsed || typeof parsed !== 'object') {
            return { pending: false, message: '', updatedAt: 0 };
        }
        return {
            pending: !!parsed.pending,
            message: typeof parsed.message === 'string' ? parsed.message : '',
            updatedAt: Number(parsed.updatedAt) || 0,
        };
    }
    catch (_a) {
        return { pending: false, message: '', updatedAt: 0 };
    }
}
function setConflictState(state) {
    try {
        wx.setStorageSync(getScopedSyncKey('conflictState'), state);
    }
    catch (_a) {
        /* empty */
    }
}
function markConflictPending(message) {
    setConflictState({
        pending: true,
        message: message || '检测到并发更新，请先拉取最新数据',
        updatedAt: Date.now(),
    });
}
function clearConflictPending() {
    setConflictState({ pending: false, message: '', updatedAt: Date.now() });
}
function getLastKnownRevision() {
    try {
        return Number(wx.getStorageSync(getScopedSyncKey('lastKnownRevision'))) || 0;
    }
    catch (_a) {
        return 0;
    }
}
function setLastKnownRevision(revision) {
    try {
        wx.setStorageSync(getScopedSyncKey('lastKnownRevision'), revision);
    }
    catch (_a) {
        /* empty */
    }
}
function getLaunchPullDone() {
    try {
        return !!wx.getStorageSync(getScopedSyncKey('launchPullDone'));
    }
    catch (_a) {
        return false;
    }
}
function setLaunchPullDone(done) {
    try {
        wx.setStorageSync(getScopedSyncKey('launchPullDone'), done);
    }
    catch (_a) {
        /* empty */
    }
}
function resetLaunchPullFlag() {
    setLaunchPullDone(false);
}
function shouldPullOnFirstEnterAfterLaunch() {
    if (!shouldAutoPullOnPageEnter())
        return false;
    return !getLaunchPullDone();
}
function markLaunchPullDone() {
    setLaunchPullDone(true);
}
function markPullSuccessNow(revision) {
    markLaunchPullDone();
    if (typeof revision === 'number' && Number.isFinite(revision) && revision >= 0) {
        setLastKnownRevision(revision);
    }
    clearConflictPending();
}
async function commitWithCloudFirst(mutateLocal) {
    if (!(0, session_1.getSession)()) {
        return { ok: true, message: '游客模式本地保存成功', result: mutateLocal() };
    }
    const snapshot = (0, storage_1.buildFullSyncPayload)();
    let result;
    (0, storage_1.runWithAutoSyncSuppressed)(() => {
        result = mutateLocal();
    });
    const pushRes = await pushToRemote();
    if (pushRes.ok) {
        return { ok: true, message: pushRes.message, result };
    }
    if (!pushRes.message.includes('当前有用户正在操作')) {
        (0, storage_1.runWithAutoSyncSuppressed)(() => {
            (0, storage_1.applyFullSyncPayload)(snapshot);
        });
    }
    return { ok: false, message: pushRes.message };
}
async function runAutoSyncLoop() {
    if (autoSyncRunning) {
        autoSyncPending = true;
        return;
    }
    autoSyncRunning = true;
    try {
        do {
            autoSyncPending = false;
            if (!(0, session_1.getSession)())
                return;
            const cfg = (0, storage_1.loadSyncConfig)();
            if (!cfg.enabled)
                return;
            const res = await pushToRemote();
            if (!res.ok) {
                // 自动同步失败不影响本地写入流程
                console.warn(`[sync] 自动同步失败(${autoSyncReason}): ${res.message}`);
                if (res.message.includes('当前有用户正在操作')) {
                    wx.showToast({ title: '检测到并发更新，请处理同步冲突', icon: 'none' });
                }
            }
        } while (autoSyncPending);
    }
    finally {
        autoSyncRunning = false;
    }
}
function syncAfterLocalMutation(reason) {
    if (!(0, session_1.getSession)())
        return;
    const cfg = (0, storage_1.loadSyncConfig)();
    if (!cfg.enabled)
        return;
    autoSyncReason = reason;
    if (autoSyncTimer)
        clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => {
        autoSyncTimer = null;
        void runAutoSyncLoop();
    }, AUTO_SYNC_DEBOUNCE_MS);
}
async function getRemoteSyncMeta() {
    const cfg = (0, storage_1.loadSyncConfig)();
    const metaRes = await (0, cloudSync_1.callCloudPath)('/accountbook/pull/meta', {}, cfg);
    if (!metaRes.ok)
        return { ok: false, message: metaRes.message };
    const meta = metaRes.data;
    if (!meta || !Array.isArray(meta.ledgers) || !Array.isArray(meta.bookIds)) {
        return { ok: false, message: '拉取元数据失败' };
    }
    return { ok: true, message: '已获取云端元数据', meta };
}
function shouldAutoPullOnPageEnter() {
    if (!(0, session_1.getSession)())
        return false;
    const cfg = (0, storage_1.loadSyncConfig)();
    return !!cfg.enabled;
}
async function askRetryPull(pageName, message) {
    return new Promise((resolve) => {
        wx.showModal({
            title: `${pageName}同步失败`,
            content: message || '从云端拉取失败，请重试。',
            confirmText: '重试',
            cancelText: '返回',
            success: (res) => resolve(!!res.confirm),
            fail: () => resolve(false),
        });
    });
}
async function resolveConflictIfNeeded(pageName) {
    if (!shouldAutoPullOnPageEnter()) {
        return { ok: true, message: '未启用同步冲突处理' };
    }
    const conflict = getConflictState();
    if (!conflict.pending)
        return { ok: true, message: '无待处理冲突' };
    const choosePull = await new Promise((resolve) => {
        wx.showModal({
            title: `${pageName}检测到同步冲突`,
            content: conflict.message || '本地改动与云端版本冲突，请选择处理方式。',
            confirmText: '拉取覆盖',
            cancelText: '稍后处理',
            success: (res) => resolve(!!res.confirm),
            fail: () => resolve(false),
        });
    });
    if (!choosePull) {
        return { ok: true, message: '已保留本地数据，稍后处理冲突' };
    }
    while (true) {
        wx.showLoading({ title: '拉取中' });
        const pullRes = await pullFromRemote();
        wx.hideLoading();
        if (pullRes.ok) {
            return { ok: true, message: '已拉取云端最新数据并清除冲突' };
        }
        const retry = await askRetryPull(pageName, pullRes.message);
        if (!retry)
            return { ok: false, message: pullRes.message };
    }
}
async function pullLatestForPageOrBlock(pageName) {
    if (!(0, session_1.getSession)()) {
        return { ok: true, message: '未登录，使用本地缓存' };
    }
    if (!shouldAutoPullOnPageEnter()) {
        return { ok: true, message: '未启用自动拉取，使用本地缓存' };
    }
    if (!shouldPullOnFirstEnterAfterLaunch()) {
        return { ok: true, message: '本次启动已完成首次同步，使用本地缓存' };
    }
    const cfg = (0, storage_1.loadSyncConfig)();
    const cloudCfg = await pullSyncConfigRemote(cfg);
    if (cloudCfg.ok && cloudCfg.config) {
        (0, storage_1.saveSyncConfig)(cloudCfg.config, { silent: true });
    }
    while (true) {
        wx.showLoading({ title: '同步中' });
        const res = await pullFromRemote();
        wx.hideLoading();
        if (res.ok)
            return res;
        if (res.message.includes('云端暂无可用同步数据')) {
            markPullSuccessNow();
            return { ok: true, message: res.message };
        }
        const retry = await askRetryPull(pageName, res.message);
        if (!retry)
            return { ok: false, message: res.message };
    }
}
async function pushToRemote() {
    const cfg = (0, storage_1.loadSyncConfig)();
    const fullData = (0, storage_1.buildFullSyncPayload)();
    const bookIds = fullData.books.map((b) => b.bookId);
    const ledgerMap = new Map(fullData.ledgers.map((l) => [l.id, l]));
    const baseRevision = getLastKnownRevision();
    const resetRes = await (0, cloudSync_1.callCloudPath)('/accountbook/sync/reset', {
        ledgers: fullData.ledgers,
        bookIds,
        clientTime: fullData.clientTime,
        baseRevision,
    }, cfg);
    if (!resetRes.ok && resetRes.statusCode === 409) {
        const conflictMessage = '当前有用户正在操作，请稍后再试...';
        markConflictPending(conflictMessage);
        const cfgPullRes = await pullSyncConfigRemote(cfg);
        if (cfgPullRes.ok && cfgPullRes.config) {
            (0, storage_1.saveSyncConfig)(cfgPullRes.config, { silent: true });
        }
        const pullRes = await pullFromRemote();
        if (pullRes.ok) {
            return { ok: false, message: `${conflictMessage} 已自动拉取最新云端数据` };
        }
        return { ok: false, message: `${conflictMessage} 自动拉取失败：${pullRes.message}` };
    }
    if (!resetRes.ok)
        return { ok: false, message: `初始化失败：${resetRes.message}` };
    const syncToken = resetRes.data &&
        typeof resetRes.data.syncToken === 'string'
        ? resetRes.data.syncToken
        : '';
    const nextRevisionRaw = resetRes.data && typeof resetRes.data.nextRevision === 'number'
        ? Number(resetRes.data.nextRevision)
        : NaN;
    let txCount = 0;
    for (const book of fullData.books) {
        const resetBookRes = await (0, cloudSync_1.callCloudPath)('/accountbook/sync/book/reset', {
            bookId: book.bookId,
            ledger: ledgerMap.get(book.bookId),
            categories: book.categories,
            syncToken,
        }, cfg);
        if (!resetBookRes.ok) {
            return { ok: false, message: `重置账本失败(${book.bookId})：${resetBookRes.message}` };
        }
        const chunks = splitChunks(book.transactions, UPLOAD_TX_CHUNK_SIZE);
        for (const chunk of chunks) {
            const chunkRes = await (0, cloudSync_1.callCloudPath)('/accountbook/sync/book/chunk', {
                bookId: book.bookId,
                transactions: chunk,
                syncToken,
            }, cfg);
            if (!chunkRes.ok) {
                return { ok: false, message: `上传分片失败(${book.bookId})：${chunkRes.message}` };
            }
            txCount += chunk.length;
        }
    }
    const pruneRes = await (0, cloudSync_1.callCloudPath)('/accountbook/sync/prune', { bookIds, syncToken }, cfg);
    if (!pruneRes.ok)
        return { ok: false, message: `清理旧数据失败：${pruneRes.message}` };
    if (Number.isFinite(nextRevisionRaw) && nextRevisionRaw >= 0) {
        setLastKnownRevision(nextRevisionRaw);
    }
    return { ok: true, message: `已上传 ${bookIds.length} 个账本，${txCount} 条流水` };
}
async function pullFromRemote() {
    var _a;
    const cfg = (0, storage_1.loadSyncConfig)();
    const metaRes = await getRemoteSyncMeta();
    if (!metaRes.ok || !metaRes.meta)
        return { ok: false, message: metaRes.message };
    const meta = metaRes.meta;
    if (meta.bookIds.length === 0) {
        return { ok: false, message: '云端暂无可用同步数据' };
    }
    const books = [];
    let txCount = 0;
    for (const bookId of meta.bookIds) {
        let offset = 0;
        let hasMore = true;
        let categories = [];
        const transactions = [];
        while (hasMore) {
            const pageRes = await (0, cloudSync_1.callCloudPath)('/accountbook/pull/book', {
                bookId,
                offset,
                limit: PULL_TX_CHUNK_SIZE,
            }, cfg);
            if (!pageRes.ok || !pageRes.data) {
                return { ok: false, message: `拉取账本失败(${bookId})：${pageRes.message}` };
            }
            if (offset === 0) {
                categories = Array.isArray(pageRes.data.categories) ? pageRes.data.categories : [];
            }
            if (Array.isArray(pageRes.data.transactions)) {
                transactions.push(...pageRes.data.transactions);
                txCount += pageRes.data.transactions.length;
            }
            offset = Number(pageRes.data.nextOffset) || 0;
            hasMore = !!pageRes.data.hasMore;
        }
        books.push({
            bookId,
            categories,
            transactions,
        });
    }
    (0, storage_1.applyFullSyncPayload)({
        ledgers: meta.ledgers,
        books,
        clientTime: (_a = meta.clientTime) !== null && _a !== void 0 ? _a : Date.now(),
    });
    markPullSuccessNow(meta.syncRevision);
    return { ok: true, message: `已拉取 ${books.length} 个账本，${txCount} 条流水` };
}
function saveSyncConfigRemote(config) {
    return (0, cloudSync_1.callCloudPath)('/accountbook/config/save', config, config).then((res) => {
        if (!res.ok)
            return { ok: false, message: res.message };
        return { ok: true, message: '配置已保存到云端' };
    });
}
function pullSyncConfigRemote(cfg) {
    return (0, cloudSync_1.callCloudPath)('/accountbook/config/pull', {}, cfg).then((res) => {
        if (!res.ok)
            return { ok: false, message: res.message };
        if (!res.data)
            return { ok: false, message: '云端无配置' };
        return { ok: true, message: '已拉取云端配置', config: res.data };
    });
}
function cloudFirstAddTransaction(input) {
    return commitWithCloudFirst(() => (0, storage_1.addTransaction)(input)).then((res) => ({
        ok: res.ok,
        message: res.message,
        item: res.result,
    }));
}
function cloudFirstUpdateTransaction(id, patch) {
    return commitWithCloudFirst(() => (0, storage_1.updateTransaction)(id, patch)).then((res) => ({
        ok: res.ok && !!res.result,
        message: res.ok && !res.result ? '记录不存在' : res.message,
    }));
}
function cloudFirstRemoveTransaction(id) {
    return commitWithCloudFirst(() => (0, storage_1.removeTransaction)(id)).then((res) => ({
        ok: res.ok && !!res.result,
        message: res.ok && !res.result ? '记录不存在' : res.message,
    }));
}
function cloudFirstAddCategory(input) {
    return commitWithCloudFirst(() => (0, storage_1.addCategory)(input)).then((res) => ({
        ok: res.ok,
        message: res.message,
        item: res.result,
    }));
}
function cloudFirstUpdateCategory(id, patch) {
    return commitWithCloudFirst(() => (0, storage_1.updateCategory)(id, patch)).then((res) => ({
        ok: res.ok && !!res.result,
        message: res.ok && !res.result ? '分类不存在' : res.message,
    }));
}
function cloudFirstRemoveCategory(id) {
    return commitWithCloudFirst(() => (0, storage_1.removeCategory)(id)).then((res) => ({
        ok: res.ok && !!res.result,
        message: res.ok && !res.result ? '删除失败，请检查是否有关联流水' : res.message,
    }));
}
function cloudFirstAddLedger(name) {
    return commitWithCloudFirst(() => (0, storage_1.addLedger)(name)).then((res) => ({
        ok: res.ok,
        message: res.message,
    }));
}
function cloudFirstRenameLedger(id, name) {
    return commitWithCloudFirst(() => (0, storage_1.renameLedger)(id, name)).then((res) => ({
        ok: res.ok && !!res.result,
        message: res.ok && !res.result ? '账本不存在或名称无效' : res.message,
    }));
}
function cloudFirstRemoveLedger(id) {
    return commitWithCloudFirst(() => {
        const r = (0, storage_1.removeLedger)(id);
        if (!r.ok)
            throw new Error(r.message || '删除失败');
        return true;
    })
        .then((res) => ({ ok: res.ok, message: res.message }))
        .catch((err) => ({
        ok: false,
        message: err instanceof Error ? err.message : '删除失败',
    }));
}
function cloudFirstUpdateLedgerCover(id, localPath) {
    return commitWithCloudFirst(() => (0, storage_1.updateLedgerCover)(id, localPath)).then((res) => ({
        ok: res.ok && !!res.result,
        message: res.ok && !res.result ? '账本不存在' : res.message,
    }));
}
function splitChunks(list, chunkSize) {
    if (!Array.isArray(list) || list.length === 0)
        return [];
    if (chunkSize <= 0)
        return [list];
    const out = [];
    for (let i = 0; i < list.length; i += chunkSize) {
        out.push(list.slice(i, i + chunkSize));
    }
    return out;
}
/** 业务路径需以 / 开头；站点根需为 https 完整地址 */
function validateSyncConfig(c) {
    if (!c.enabled)
        return null;
    if (c.apiBase && !/^https:\/\//i.test(c.apiBase.trim())) {
        return '站点地址需为 https 完整 URL';
    }
    return null;
}
