import type { Category, Ledger, Transaction } from './types';

let storageAccountId: string | null = null;
export const GUEST_ACCOUNT_ID = 'guest_local';

/** 登录成功后必须调用，之后所有账本读写均隔离在该账号下 */
export function setStorageAccountId(id: string): void {
  storageAccountId = id;
  migrationDoneForAccount = '';
}

export function getStorageAccountId(): string | null {
  return storageAccountId;
}

export function clearStorageAccountId(): void {
  storageAccountId = null;
  migrationDoneForAccount = '';
}

function requireAccountId(): string | null {
  return storageAccountId || GUEST_ACCOUNT_ID;
}

function keyLedgers(accountId: string): string {
  return `accountbook_ledgers_v1_${accountId}`;
}
function keyCurrentBook(accountId: string): string {
  return `accountbook_current_book_v1_${accountId}`;
}
function keySyncConfig(accountId: string): string {
  return `accountbook_sync_config_v1_${accountId}`;
}
function txKey(accountId: string, bookId: string): string {
  return `accountbook_transactions_v1_${accountId}_${bookId}`;
}
function catKey(accountId: string, bookId: string): string {
  return `accountbook_categories_v1_${accountId}_${bookId}`;
}

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

let migrationDoneForAccount = '';

function initAccountIfEmpty(accountId: string): void {
  if (migrationDoneForAccount === accountId) return;
  migrationDoneForAccount = accountId;
  try {
    const rawLedgers = wx.getStorageSync(keyLedgers(accountId)) as string | Ledger[] | undefined;
    if (rawLedgers !== undefined && rawLedgers !== null && rawLedgers !== '') {
      const parsed =
        typeof rawLedgers === 'string' ? (JSON.parse(rawLedgers) as Ledger[]) : rawLedgers;
      if (Array.isArray(parsed) && parsed.length > 0) return;
    }

    const bookId = uid();
    const now = Date.now();
    const ledger: Ledger = { id: bookId, name: '默认账本', createdAt: now };

    wx.setStorageSync(keyLedgers(accountId), [ledger]);
    wx.setStorageSync(keyCurrentBook(accountId), bookId);
    wx.setStorageSync(catKey(accountId, bookId), getDefaultCategories());
    wx.setStorageSync(txKey(accountId, bookId), [] as Transaction[]);
  } catch {
    migrationDoneForAccount = '';
  }
}

function ensureStorageReady(): void {
  const aid = requireAccountId();
  if (!aid) return;
  initAccountIfEmpty(aid);
}

const DEFAULT_EXPENSE: Category[] = [
  { id: 'c_exp_food', name: '餐饮', type: 'expense' },
  { id: 'c_exp_transport', name: '交通', type: 'expense' },
  { id: 'c_exp_shopping', name: '购物', type: 'expense' },
  { id: 'c_exp_housing', name: '居住', type: 'expense' },
  { id: 'c_exp_other', name: '其他', type: 'expense' },
];

const DEFAULT_INCOME: Category[] = [
  { id: 'c_in_salary', name: '工资', type: 'income' },
  { id: 'c_in_bonus', name: '奖金', type: 'income' },
  { id: 'c_in_other', name: '其他', type: 'income' },
];

export function getDefaultCategories(): Category[] {
  return [...DEFAULT_EXPENSE, ...DEFAULT_INCOME];
}

export function loadLedgers(): Ledger[] {
  const aid = requireAccountId();
  if (!aid) return [];
  ensureStorageReady();
  try {
    const raw = wx.getStorageSync(keyLedgers(aid)) as string | Ledger[] | undefined;
    if (!raw) return [];
    const list = typeof raw === 'string' ? (JSON.parse(raw) as Ledger[]) : raw;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveLedgersInternal(list: Ledger[]): void {
  const aid = requireAccountId();
  if (!aid) return;
  wx.setStorageSync(keyLedgers(aid), list);
}

export function getCurrentBookId(): string {
  const aid = requireAccountId();
  if (!aid) return '';
  ensureStorageReady();
  try {
    const id = wx.getStorageSync(keyCurrentBook(aid)) as string | undefined;
    const ledgers = loadLedgers();
    if (id && ledgers.some((l) => l.id === id)) return id;
    const first = ledgers[0]?.id;
    if (first) {
      wx.setStorageSync(keyCurrentBook(aid), first);
      return first;
    }
    return '';
  } catch {
    return '';
  }
}

export function setCurrentBookId(id: string): void {
  const aid = requireAccountId();
  if (!aid) return;
  ensureStorageReady();
  const ledgers = loadLedgers();
  if (!ledgers.some((l) => l.id === id)) return;
  wx.setStorageSync(keyCurrentBook(aid), id);
}

export function addLedger(name: string): Ledger {
  const aid = requireAccountId();
  if (!aid) {
    throw new Error('未登录');
  }
  ensureStorageReady();
  const trimmed = name.trim() || '新账本';
  const item: Ledger = { id: uid(), name: trimmed, createdAt: Date.now() };
  const list = loadLedgers();
  list.push(item);
  saveLedgersInternal(list);
  wx.setStorageSync(catKey(aid, item.id), getDefaultCategories());
  wx.setStorageSync(txKey(aid, item.id), [] as Transaction[]);
  return item;
}

export function renameLedger(id: string, name: string): boolean {
  ensureStorageReady();
  const trimmed = name.trim();
  if (!trimmed) return false;
  const list = loadLedgers();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return false;
  list[i] = { ...list[i], name: trimmed };
  saveLedgersInternal(list);
  return true;
}

function unlinkLedgerCoverIfLocal(path: string | undefined): void {
  if (!path || !path.startsWith(`${wx.env.USER_DATA_PATH}`)) return;
  try {
    wx.getFileSystemManager().unlinkSync(path);
  } catch {
    /* empty */
  }
}

/** 设置账本封面本地路径；传 undefined 表示清除封面并删除旧本地文件 */
export function updateLedgerCover(id: string, localPath: string | undefined): boolean {
  ensureStorageReady();
  const list = loadLedgers();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return false;
  const prev = list[i].coverImagePath;
  if (prev && prev !== localPath) {
    unlinkLedgerCoverIfLocal(prev);
  }
  list[i] = { ...list[i], coverImagePath: localPath };
  saveLedgersInternal(list);
  return true;
}

export function removeLedger(id: string): { ok: boolean; message?: string } {
  const aid = requireAccountId();
  if (!aid) return { ok: false, message: '未登录' };
  ensureStorageReady();
  const list = loadLedgers();
  if (list.length <= 1) {
    return { ok: false, message: '至少保留一个账本' };
  }
  if (!list.some((l) => l.id === id)) {
    return { ok: false, message: '账本不存在' };
  }
  const victim = list.find((l) => l.id === id);
  if (victim?.coverImagePath) {
    unlinkLedgerCoverIfLocal(victim.coverImagePath);
  }
  const next = list.filter((l) => l.id !== id);
  saveLedgersInternal(next);
  try {
    wx.removeStorageSync(txKey(aid, id));
  } catch {
    /* empty */
  }
  try {
    wx.removeStorageSync(catKey(aid, id));
  } catch {
    /* empty */
  }
  const cur = getCurrentBookId();
  if (cur === id) {
    const first = next[0]?.id;
    if (first) wx.setStorageSync(keyCurrentBook(aid), first);
  }
  return { ok: true };
}

export function loadCategoriesForBook(bookId: string): Category[] {
  const aid = requireAccountId();
  if (!aid) return getDefaultCategories();
  ensureStorageReady();
  try {
    const raw = wx.getStorageSync(catKey(aid, bookId)) as string | Category[] | undefined;
    if (!raw) return getDefaultCategories();
    const list = typeof raw === 'string' ? (JSON.parse(raw) as Category[]) : raw;
    if (!Array.isArray(list) || list.length === 0) return getDefaultCategories();
    return list;
  } catch {
    return getDefaultCategories();
  }
}

export function saveCategoriesForBook(bookId: string, list: Category[]): void {
  const aid = requireAccountId();
  if (!aid) return;
  ensureStorageReady();
  wx.setStorageSync(catKey(aid, bookId), list);
}

export function loadTransactionsForBook(bookId: string): Transaction[] {
  const aid = requireAccountId();
  if (!aid) return [];
  ensureStorageReady();
  try {
    const raw = wx.getStorageSync(txKey(aid, bookId)) as string | Transaction[] | undefined;
    if (!raw) return [];
    const list = typeof raw === 'string' ? (JSON.parse(raw) as Transaction[]) : raw;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveTransactionsForBook(bookId: string, list: Transaction[]): void {
  const aid = requireAccountId();
  if (!aid) return;
  ensureStorageReady();
  wx.setStorageSync(txKey(aid, bookId), list);
}

export function loadCategories(): Category[] {
  return loadCategoriesForBook(getCurrentBookId());
}

export function saveCategories(list: Category[]): void {
  saveCategoriesForBook(getCurrentBookId(), list);
}

export function loadTransactions(): Transaction[] {
  return loadTransactionsForBook(getCurrentBookId());
}

export function saveTransactions(list: Transaction[]): void {
  saveTransactionsForBook(getCurrentBookId(), list);
}

export function addCategory(c: Omit<Category, 'id'>): Category {
  const item: Category = { ...c, id: uid() };
  const list = loadCategories();
  list.push(item);
  saveCategories(list);
  return item;
}

export function updateCategory(id: string, patch: Partial<Omit<Category, 'id'>>): boolean {
  const list = loadCategories();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return false;
  list[i] = { ...list[i], ...patch };
  saveCategories(list);
  return true;
}

export function removeCategory(id: string): boolean {
  const txs = loadTransactions();
  if (txs.some((t) => t.categoryId === id)) {
    return false;
  }
  const list = loadCategories().filter((c) => c.id !== id);
  saveCategories(list);
  return true;
}

export function addTransaction(input: Omit<Transaction, 'id'>): Transaction {
  const item: Transaction = { ...input, id: uid() };
  const bookId = getCurrentBookId();
  const list = loadTransactionsForBook(bookId);
  list.push(item);
  list.sort((a, b) => b.occurredAt - a.occurredAt);
  saveTransactionsForBook(bookId, list);
  return item;
}

export function updateTransaction(
  id: string,
  patch: Partial<Omit<Transaction, 'id'>>
): boolean {
  const bookId = getCurrentBookId();
  const list = loadTransactionsForBook(bookId);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return false;
  list[i] = { ...list[i], ...patch };
  list.sort((a, b) => b.occurredAt - a.occurredAt);
  saveTransactionsForBook(bookId, list);
  return true;
}

export function removeTransaction(id: string): boolean {
  const bookId = getCurrentBookId();
  const list = loadTransactionsForBook(bookId).filter((t) => t.id !== id);
  saveTransactionsForBook(bookId, list);
  return true;
}

export interface SyncConfig {
  /** 自建同步站点根地址，需 https 完整域名，如 https://api.example.com */
  apiBase: string;
  enabled: boolean;
  /** 云开发环境 ID；为空时使用当前动态环境 */
  cloudEnvId: string;
}

function normalizeSyncConfig(raw: unknown): SyncConfig {
  const parsed = (raw || {}) as Record<string, unknown>;
  const apiBaseRaw = parsed.apiBase ?? parsed.baseUrl;
  const cloudEnvIdRaw = parsed.cloudEnvId;
  const apiBase =
    typeof apiBaseRaw === 'string' && apiBaseRaw.startsWith('http')
      ? apiBaseRaw.trim()
      : '';
  const cloudEnvId = typeof cloudEnvIdRaw === 'string' ? cloudEnvIdRaw.trim() : '';
  return {
    apiBase,
    enabled: !!parsed.enabled,
    cloudEnvId,
  };
}

export function loadSyncConfig(): SyncConfig {
  const aid = requireAccountId();
  if (!aid) {
    return { apiBase: '', enabled: false, cloudEnvId: '' };
  }
  try {
    const raw = wx.getStorageSync(keySyncConfig(aid)) as SyncConfig | string | undefined;
    if (!raw) {
      return { apiBase: '', enabled: false, cloudEnvId: '' };
    }
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return normalizeSyncConfig(parsed);
  } catch {
    return { apiBase: '', enabled: false, cloudEnvId: '' };
  }
}

export function saveSyncConfig(c: SyncConfig): void {
  const aid = requireAccountId();
  if (!aid) return;
  wx.setStorageSync(keySyncConfig(aid), normalizeSyncConfig(c));
}

/** 多账本同步载荷：账本列表 + 各账本分类与流水 */
export interface AccountBookSyncPayload {
  ledgers: Ledger[];
  books: Array<{
    bookId: string;
    categories: Category[];
    transactions: Transaction[];
  }>;
  clientTime: number;
}

export function buildFullSyncPayload(): AccountBookSyncPayload {
  ensureStorageReady();
  const ledgers = loadLedgers();
  const books = ledgers.map((l) => ({
    bookId: l.id,
    categories: loadCategoriesForBook(l.id),
    transactions: loadTransactionsForBook(l.id),
  }));
  return { ledgers, books, clientTime: Date.now() };
}

export function applyFullSyncPayload(data: AccountBookSyncPayload): void {
  ensureStorageReady();
  if (data.ledgers && Array.isArray(data.ledgers) && data.ledgers.length > 0) {
    saveLedgersInternal(data.ledgers);
  }
  if (data.books && Array.isArray(data.books)) {
    for (const b of data.books) {
      if (!b.bookId) continue;
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
    if (aid) wx.setStorageSync(keyCurrentBook(aid), ledgers[0].id);
  }
}

/** 移除当前账号下全部本地键（流水、分类、账本、同步配置） */
export function clearAllLocalAccountData(): void {
  const aid = requireAccountId();
  if (!aid) return;
  const ledgerIds: string[] = [];
  try {
    const raw = wx.getStorageSync(keyLedgers(aid)) as string | Ledger[] | undefined;
    if (raw) {
      const list = typeof raw === 'string' ? (JSON.parse(raw) as Ledger[]) : raw;
      if (Array.isArray(list)) {
        for (const l of list) {
          if (l && l.id) ledgerIds.push(l.id);
        }
      }
    }
  } catch {
    /* empty */
  }
  const keysToRemove = new Set<string>([
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
    } catch {
      /* empty */
    }
  }
  migrationDoneForAccount = '';
}

export { uid };
