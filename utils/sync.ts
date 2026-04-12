import {
  addCategory,
  addLedger,
  addTransaction,
  applyFullSyncPayload,
  buildFullSyncPayload,
  loadSyncConfig,
  removeCategory,
  removeLedger,
  removeTransaction,
  renameLedger,
  runWithAutoSyncSuppressed,
  saveSyncConfig,
  updateCategory,
  updateLedgerCover,
  updateTransaction,
  type AccountBookSyncPayload,
  type SyncConfig,
} from './storage';
import type { Category, Ledger, Transaction } from './types';
import { callCloudPath } from './cloudSync';
import { getSession } from './session';

export interface UserProfileRemote {
  username: string;
  nickName: string;
  avatarUrl: string;
}

export async function fetchProfileRemote(
  cfg: SyncConfig
): Promise<{ ok: boolean; message: string; profile?: UserProfileRemote }> {
  const res = await callCloudPath<UserProfileRemote>('/user/profile/get', {}, cfg);
  if (!res.ok || !res.data) return { ok: false, message: res.message };
  return { ok: true, message: res.message, profile: res.data };
}

export async function updateProfileRemote(
  cfg: SyncConfig,
  patch: { nickName: string; avatarUrl: string }
): Promise<{ ok: boolean; message: string }> {
  const res = await callCloudPath(
    '/user/profile/update',
    patch as unknown as Record<string, unknown>,
    cfg
  );
  return { ok: res.ok, message: res.message };
}

export async function bindWechatRemote(cfg: SyncConfig): Promise<{ ok: boolean; message: string }> {
  const res = await callCloudPath('/wechat/bind', {}, cfg);
  return { ok: res.ok, message: res.message };
}

/** 云开发同步入口：业务路径统一以 / 开头，不含 /kapi。 */
const UPLOAD_TX_CHUNK_SIZE = 120;
const PULL_TX_CHUNK_SIZE = 120;
const AUTO_SYNC_DEBOUNCE_MS = 800;
let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;
let autoSyncRunning = false;
let autoSyncPending = false;
let autoSyncReason = '';

interface PullMetaData {
  ledgers: Ledger[];
  bookIds: string[];
  clientTime: number;
  syncRevision?: number;
}

interface SyncConflictState {
  pending: boolean;
  message: string;
  updatedAt: number;
}

function getScopedSyncKey(suffix: string): string {
  const s = getSession();
  const accountId = s?.accountId || 'guest_local';
  return `accountbook_sync_runtime_v1_${accountId}_${suffix}`;
}

function getConflictState(): SyncConflictState {
  try {
    const raw = wx.getStorageSync(getScopedSyncKey('conflictState')) as
      | SyncConflictState
      | string
      | undefined;
    if (!raw) return { pending: false, message: '', updatedAt: 0 };
    const parsed = typeof raw === 'string' ? (JSON.parse(raw) as SyncConflictState) : raw;
    if (!parsed || typeof parsed !== 'object') {
      return { pending: false, message: '', updatedAt: 0 };
    }
    return {
      pending: !!parsed.pending,
      message: typeof parsed.message === 'string' ? parsed.message : '',
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return { pending: false, message: '', updatedAt: 0 };
  }
}

function setConflictState(state: SyncConflictState): void {
  try {
    wx.setStorageSync(getScopedSyncKey('conflictState'), state);
  } catch {
    /* empty */
  }
}

function markConflictPending(message: string): void {
  setConflictState({
    pending: true,
    message: message || '检测到并发更新，请先拉取最新数据',
    updatedAt: Date.now(),
  });
}

function clearConflictPending(): void {
  setConflictState({ pending: false, message: '', updatedAt: Date.now() });
}

function getLastKnownRevision(): number {
  try {
    return Number(wx.getStorageSync(getScopedSyncKey('lastKnownRevision'))) || 0;
  } catch {
    return 0;
  }
}

function setLastKnownRevision(revision: number): void {
  try {
    wx.setStorageSync(getScopedSyncKey('lastKnownRevision'), revision);
  } catch {
    /* empty */
  }
}

function getLaunchPullDone(): boolean {
  try {
    return !!wx.getStorageSync(getScopedSyncKey('launchPullDone'));
  } catch {
    return false;
  }
}

function setLaunchPullDone(done: boolean): void {
  try {
    wx.setStorageSync(getScopedSyncKey('launchPullDone'), done);
  } catch {
    /* empty */
  }
}

export function resetLaunchPullFlag(): void {
  setLaunchPullDone(false);
}

export function shouldPullOnFirstEnterAfterLaunch(): boolean {
  if (!shouldAutoPullOnPageEnter()) return false;
  return !getLaunchPullDone();
}

function markLaunchPullDone(): void {
  setLaunchPullDone(true);
}

export function markPullSuccessNow(revision?: number): void {
  markLaunchPullDone();
  if (typeof revision === 'number' && Number.isFinite(revision) && revision >= 0) {
    setLastKnownRevision(revision);
  }
  clearConflictPending();
}

async function commitWithCloudFirst<T>(mutateLocal: () => T): Promise<{
  ok: boolean;
  message: string;
  result?: T;
}> {
  if (!getSession()) {
    return { ok: true, message: '游客模式本地保存成功', result: mutateLocal() };
  }
  const snapshot = buildFullSyncPayload();
  let result: T | undefined;
  runWithAutoSyncSuppressed(() => {
    result = mutateLocal();
  });
  const pushRes = await pushToRemote();
  if (pushRes.ok) {
    return { ok: true, message: pushRes.message, result };
  }
  if (!pushRes.message.includes('当前有用户正在操作')) {
    runWithAutoSyncSuppressed(() => {
      applyFullSyncPayload(snapshot);
    });
  }
  return { ok: false, message: pushRes.message };
}

async function runAutoSyncLoop(): Promise<void> {
  if (autoSyncRunning) {
    autoSyncPending = true;
    return;
  }
  autoSyncRunning = true;
  try {
    do {
      autoSyncPending = false;
      if (!getSession()) return;
      const cfg = loadSyncConfig();
      if (!cfg.enabled) return;
      const res = await pushToRemote();
      if (!res.ok) {
        // 自动同步失败不影响本地写入流程
        console.warn(`[sync] 自动同步失败(${autoSyncReason}): ${res.message}`);
        if (res.message.includes('当前有用户正在操作')) {
          wx.showToast({ title: '检测到并发更新，请处理同步冲突', icon: 'none' });
        }
      }
    } while (autoSyncPending);
  } finally {
    autoSyncRunning = false;
  }
}

export function syncAfterLocalMutation(reason: string): void {
  if (!getSession()) return;
  const cfg = loadSyncConfig();
  if (!cfg.enabled) return;
  autoSyncReason = reason;
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => {
    autoSyncTimer = null;
    void runAutoSyncLoop();
  }, AUTO_SYNC_DEBOUNCE_MS);
}

export async function getRemoteSyncMeta(): Promise<{
  ok: boolean;
  message: string;
  meta?: PullMetaData;
}> {
  const cfg = loadSyncConfig();
  const metaRes = await callCloudPath<PullMetaData>('/accountbook/pull/meta', {}, cfg);
  if (!metaRes.ok) return { ok: false, message: metaRes.message };
  const meta = metaRes.data;
  if (!meta || !Array.isArray(meta.ledgers) || !Array.isArray(meta.bookIds)) {
    return { ok: false, message: '拉取元数据失败' };
  }
  return { ok: true, message: '已获取云端元数据', meta };
}

export function shouldAutoPullOnPageEnter(): boolean {
  if (!getSession()) return false;
  const cfg = loadSyncConfig();
  return !!cfg.enabled;
}

async function askRetryPull(pageName: string, message: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
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

export async function resolveConflictIfNeeded(
  pageName: string
): Promise<{ ok: boolean; message: string }> {
  if (!shouldAutoPullOnPageEnter()) {
    return { ok: true, message: '未启用同步冲突处理' };
  }
  const conflict = getConflictState();
  if (!conflict.pending) return { ok: true, message: '无待处理冲突' };
  const choosePull = await new Promise<boolean>((resolve) => {
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
    if (!retry) return { ok: false, message: pullRes.message };
  }
}

export async function pullLatestForPageOrBlock(
  pageName: string
): Promise<{ ok: boolean; message: string }> {
  if (!getSession()) {
    return { ok: true, message: '未登录，使用本地缓存' };
  }
  if (!shouldAutoPullOnPageEnter()) {
    return { ok: true, message: '未启用自动拉取，使用本地缓存' };
  }
  if (!shouldPullOnFirstEnterAfterLaunch()) {
    return { ok: true, message: '本次启动已完成首次同步，使用本地缓存' };
  }
  const cfg = loadSyncConfig();
  const cloudCfg = await pullSyncConfigRemote(cfg);
  if (cloudCfg.ok && cloudCfg.config) {
    saveSyncConfig(cloudCfg.config, { silent: true });
  }
  while (true) {
    wx.showLoading({ title: '同步中' });
    const res = await pullFromRemote();
    wx.hideLoading();
    if (res.ok) return res;
    if (res.message.includes('云端暂无可用同步数据')) {
      markPullSuccessNow();
      return { ok: true, message: res.message };
    }
    const retry = await askRetryPull(pageName, res.message);
    if (!retry) return { ok: false, message: res.message };
  }
}

export async function pushToRemote(): Promise<{ ok: boolean; message: string }> {
  const cfg = loadSyncConfig();
  const fullData = buildFullSyncPayload();
  const bookIds = fullData.books.map((b) => b.bookId);
  const ledgerMap = new Map<string, Ledger>(fullData.ledgers.map((l) => [l.id, l]));
  const baseRevision = getLastKnownRevision();

  const resetRes = await callCloudPath(
    '/accountbook/sync/reset',
    {
      ledgers: fullData.ledgers,
      bookIds,
      clientTime: fullData.clientTime,
      baseRevision,
    },
    cfg
  );
  if (!resetRes.ok && resetRes.statusCode === 409) {
    const conflictMessage = '当前有用户正在操作，请稍后再试...';
    markConflictPending(conflictMessage);
    const cfgPullRes = await pullSyncConfigRemote(cfg);
    if (cfgPullRes.ok && cfgPullRes.config) {
      saveSyncConfig(cfgPullRes.config, { silent: true });
    }
    const pullRes = await pullFromRemote();
    if (pullRes.ok) {
      return { ok: false, message: `${conflictMessage} 已自动拉取最新云端数据` };
    }
    return { ok: false, message: `${conflictMessage} 自动拉取失败：${pullRes.message}` };
  }
  if (!resetRes.ok) return { ok: false, message: `初始化失败：${resetRes.message}` };
  const syncToken =
    resetRes.data &&
    typeof (resetRes.data as Record<string, unknown>).syncToken === 'string'
      ? ((resetRes.data as Record<string, unknown>).syncToken as string)
      : '';
  const nextRevisionRaw =
    resetRes.data && typeof (resetRes.data as Record<string, unknown>).nextRevision === 'number'
      ? Number((resetRes.data as Record<string, unknown>).nextRevision)
      : NaN;

  let txCount = 0;
  for (const book of fullData.books) {
    const resetBookRes = await callCloudPath(
      '/accountbook/sync/book/reset',
      {
        bookId: book.bookId,
        ledger: ledgerMap.get(book.bookId),
        categories: book.categories,
        syncToken,
      },
      cfg
    );
    if (!resetBookRes.ok) {
      return { ok: false, message: `重置账本失败(${book.bookId})：${resetBookRes.message}` };
    }

    const chunks = splitChunks(book.transactions, UPLOAD_TX_CHUNK_SIZE);
    for (const chunk of chunks) {
      const chunkRes = await callCloudPath(
        '/accountbook/sync/book/chunk',
        {
          bookId: book.bookId,
          transactions: chunk,
          syncToken,
        },
        cfg
      );
      if (!chunkRes.ok) {
        return { ok: false, message: `上传分片失败(${book.bookId})：${chunkRes.message}` };
      }
      txCount += chunk.length;
    }
  }

  const pruneRes = await callCloudPath('/accountbook/sync/prune', { bookIds, syncToken }, cfg);
  if (!pruneRes.ok) return { ok: false, message: `清理旧数据失败：${pruneRes.message}` };
  if (Number.isFinite(nextRevisionRaw) && nextRevisionRaw >= 0) {
    setLastKnownRevision(nextRevisionRaw);
  }

  return { ok: true, message: `已上传 ${bookIds.length} 个账本，${txCount} 条流水` };
}

export async function pullFromRemote(): Promise<{ ok: boolean; message: string }> {
  const cfg = loadSyncConfig();
  const metaRes = await getRemoteSyncMeta();
  if (!metaRes.ok || !metaRes.meta) return { ok: false, message: metaRes.message };
  const meta = metaRes.meta;
  if (meta.bookIds.length === 0) {
    return { ok: false, message: '云端暂无可用同步数据' };
  }

  const books: AccountBookSyncPayload['books'] = [];
  let txCount = 0;
  for (const bookId of meta.bookIds) {
    let offset = 0;
    let hasMore = true;
    let categories = [] as AccountBookSyncPayload['books'][number]['categories'];
    const transactions: AccountBookSyncPayload['books'][number]['transactions'] = [];

    while (hasMore) {
      const pageRes = await callCloudPath<{
        bookId: string;
        categories: AccountBookSyncPayload['books'][number]['categories'];
        transactions: AccountBookSyncPayload['books'][number]['transactions'];
        nextOffset: number;
        hasMore: boolean;
      }>(
        '/accountbook/pull/book',
        {
          bookId,
          offset,
          limit: PULL_TX_CHUNK_SIZE,
        },
        cfg
      );
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

  applyFullSyncPayload({
    ledgers: meta.ledgers,
    books,
    clientTime: meta.clientTime ?? Date.now(),
  });
  markPullSuccessNow(meta.syncRevision);
  return { ok: true, message: `已拉取 ${books.length} 个账本，${txCount} 条流水` };
}

export function saveSyncConfigRemote(
  config: SyncConfig
): Promise<{ ok: boolean; message: string }> {
  return callCloudPath<{
    savedAt: number;
  }>('/accountbook/config/save', config as unknown as Record<string, unknown>, config).then(
    (res) => {
      if (!res.ok) return { ok: false, message: res.message };
      return { ok: true, message: '配置已保存到云端' };
    }
  );
}

export function pullSyncConfigRemote(
  cfg: SyncConfig
): Promise<{ ok: boolean; message: string; config?: SyncConfig }> {
  return callCloudPath<SyncConfig>('/accountbook/config/pull', {}, cfg).then((res) => {
    if (!res.ok) return { ok: false, message: res.message };
    if (!res.data) return { ok: false, message: '云端无配置' };
    return { ok: true, message: '已拉取云端配置', config: res.data };
  });
}

export function cloudFirstAddTransaction(
  input: Omit<Transaction, 'id'>
): Promise<{ ok: boolean; message: string; item?: Transaction }> {
  return commitWithCloudFirst(() => addTransaction(input)).then((res) => ({
    ok: res.ok,
    message: res.message,
    item: res.result,
  }));
}

export function cloudFirstUpdateTransaction(
  id: string,
  patch: Partial<Omit<Transaction, 'id'>>
): Promise<{ ok: boolean; message: string }> {
  return commitWithCloudFirst(() => updateTransaction(id, patch)).then((res) => ({
    ok: res.ok && !!res.result,
    message: res.ok && !res.result ? '记录不存在' : res.message,
  }));
}

export function cloudFirstRemoveTransaction(
  id: string
): Promise<{ ok: boolean; message: string }> {
  return commitWithCloudFirst(() => removeTransaction(id)).then((res) => ({
    ok: res.ok && !!res.result,
    message: res.ok && !res.result ? '记录不存在' : res.message,
  }));
}

export function cloudFirstAddCategory(
  input: Omit<Category, 'id'>
): Promise<{ ok: boolean; message: string; item?: Category }> {
  return commitWithCloudFirst(() => addCategory(input)).then((res) => ({
    ok: res.ok,
    message: res.message,
    item: res.result,
  }));
}

export function cloudFirstUpdateCategory(
  id: string,
  patch: Partial<Omit<Category, 'id'>>
): Promise<{ ok: boolean; message: string }> {
  return commitWithCloudFirst(() => updateCategory(id, patch)).then((res) => ({
    ok: res.ok && !!res.result,
    message: res.ok && !res.result ? '分类不存在' : res.message,
  }));
}

export function cloudFirstRemoveCategory(
  id: string
): Promise<{ ok: boolean; message: string }> {
  return commitWithCloudFirst(() => removeCategory(id)).then((res) => ({
    ok: res.ok && !!res.result,
    message: res.ok && !res.result ? '删除失败，请检查是否有关联流水' : res.message,
  }));
}

export function cloudFirstAddLedger(name: string): Promise<{ ok: boolean; message: string }> {
  return commitWithCloudFirst(() => addLedger(name)).then((res) => ({
    ok: res.ok,
    message: res.message,
  }));
}

export function cloudFirstRenameLedger(
  id: string,
  name: string
): Promise<{ ok: boolean; message: string }> {
  return commitWithCloudFirst(() => renameLedger(id, name)).then((res) => ({
    ok: res.ok && !!res.result,
    message: res.ok && !res.result ? '账本不存在或名称无效' : res.message,
  }));
}

export function cloudFirstRemoveLedger(
  id: string
): Promise<{ ok: boolean; message: string }> {
  return commitWithCloudFirst(() => {
    const r = removeLedger(id);
    if (!r.ok) throw new Error(r.message || '删除失败');
    return true;
  })
    .then((res) => ({ ok: res.ok, message: res.message }))
    .catch((err: unknown) => ({
      ok: false,
      message: err instanceof Error ? err.message : '删除失败',
    }));
}

export function cloudFirstUpdateLedgerCover(
  id: string,
  localPath: string | undefined
): Promise<{ ok: boolean; message: string }> {
  return commitWithCloudFirst(() => updateLedgerCover(id, localPath)).then((res) => ({
    ok: res.ok && !!res.result,
    message: res.ok && !res.result ? '账本不存在' : res.message,
  }));
}

function splitChunks<T>(list: T[], chunkSize: number): T[][] {
  if (!Array.isArray(list) || list.length === 0) return [];
  if (chunkSize <= 0) return [list];
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += chunkSize) {
    out.push(list.slice(i, i + chunkSize));
  }
  return out;
}

/** 业务路径需以 / 开头；站点根需为 https 完整地址 */
export function validateSyncConfig(c: SyncConfig): string | null {
  if (!c.enabled) return null;
  if (c.apiBase && !/^https:\/\//i.test(c.apiBase.trim())) {
    return '站点地址需为 https 完整 URL';
  }
  return null;
}
