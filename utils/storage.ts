import type { Category, Ledger, Transaction } from './types';

const KEY_CATEGORIES = 'accountbook_categories_v1';
const KEY_TRANSACTIONS = 'accountbook_transactions_v1';
const KEY_LEDGERS = 'accountbook_ledgers_v1';
const KEY_CURRENT_BOOK = 'accountbook_current_book_v1';
const KEY_SYNC_CONFIG = 'accountbook_sync_config_v1';

function txKey(bookId: string): string {
  return `accountbook_transactions_v1_${bookId}`;
}
function catKey(bookId: string): string {
  return `accountbook_categories_v1_${bookId}`;
}

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

let migrationDone = false;

function runMigrationOnce(): void {
  if (migrationDone) return;
  migrationDone = true;
  try {
    const rawLedgers = wx.getStorageSync(KEY_LEDGERS) as string | Ledger[] | undefined;
    if (rawLedgers !== undefined && rawLedgers !== null && rawLedgers !== '') {
      const parsed =
        typeof rawLedgers === 'string' ? (JSON.parse(rawLedgers) as Ledger[]) : rawLedgers;
      if (Array.isArray(parsed) && parsed.length > 0) return;
    }

    const legacyTxRaw = wx.getStorageSync(KEY_TRANSACTIONS) as string | Transaction[] | undefined;
    const legacyCatRaw = wx.getStorageSync(KEY_CATEGORIES) as string | Category[] | undefined;

    let legacyTxs: Transaction[] = [];
    if (legacyTxRaw) {
      const list =
        typeof legacyTxRaw === 'string' ? (JSON.parse(legacyTxRaw) as Transaction[]) : legacyTxRaw;
      legacyTxs = Array.isArray(list) ? list : [];
    }

    let legacyCats: Category[] = [];
    if (legacyCatRaw) {
      const list =
        typeof legacyCatRaw === 'string' ? (JSON.parse(legacyCatRaw) as Category[]) : legacyCatRaw;
      legacyCats = Array.isArray(list) ? list : [];
    }

    const bookId = uid();
    const now = Date.now();
    const ledger: Ledger = { id: bookId, name: '默认账本', createdAt: now };

    wx.setStorageSync(KEY_LEDGERS, [ledger]);
    wx.setStorageSync(KEY_CURRENT_BOOK, bookId);

    const cats = legacyCats.length > 0 ? legacyCats : getDefaultCategories();
    wx.setStorageSync(catKey(bookId), cats);
    wx.setStorageSync(txKey(bookId), legacyTxs);

    try {
      wx.removeStorageSync(KEY_TRANSACTIONS);
    } catch {
      /* empty */
    }
    try {
      wx.removeStorageSync(KEY_CATEGORIES);
    } catch {
      /* empty */
    }
  } catch {
    migrationDone = false;
  }
}

function ensureStorageReady(): void {
  runMigrationOnce();
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
  ensureStorageReady();
  try {
    const raw = wx.getStorageSync(KEY_LEDGERS) as string | Ledger[] | undefined;
    if (!raw) return [];
    const list = typeof raw === 'string' ? (JSON.parse(raw) as Ledger[]) : raw;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveLedgersInternal(list: Ledger[]): void {
  wx.setStorageSync(KEY_LEDGERS, list);
}

export function getCurrentBookId(): string {
  ensureStorageReady();
  try {
    const id = wx.getStorageSync(KEY_CURRENT_BOOK) as string | undefined;
    const ledgers = loadLedgers();
    if (id && ledgers.some((l) => l.id === id)) return id;
    const first = ledgers[0]?.id;
    if (first) {
      wx.setStorageSync(KEY_CURRENT_BOOK, first);
      return first;
    }
    return '';
  } catch {
    return '';
  }
}

export function setCurrentBookId(id: string): void {
  ensureStorageReady();
  const ledgers = loadLedgers();
  if (!ledgers.some((l) => l.id === id)) return;
  wx.setStorageSync(KEY_CURRENT_BOOK, id);
}

export function addLedger(name: string): Ledger {
  ensureStorageReady();
  const trimmed = name.trim() || '新账本';
  const item: Ledger = { id: uid(), name: trimmed, createdAt: Date.now() };
  const list = loadLedgers();
  list.push(item);
  saveLedgersInternal(list);
  wx.setStorageSync(catKey(item.id), getDefaultCategories());
  wx.setStorageSync(txKey(item.id), [] as Transaction[]);
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
    wx.removeStorageSync(txKey(id));
  } catch {
    /* empty */
  }
  try {
    wx.removeStorageSync(catKey(id));
  } catch {
    /* empty */
  }
  const cur = getCurrentBookId();
  if (cur === id) {
    const first = next[0]?.id;
    if (first) wx.setStorageSync(KEY_CURRENT_BOOK, first);
  }
  return { ok: true };
}

export function loadCategoriesForBook(bookId: string): Category[] {
  ensureStorageReady();
  try {
    const raw = wx.getStorageSync(catKey(bookId)) as string | Category[] | undefined;
    if (!raw) return getDefaultCategories();
    const list = typeof raw === 'string' ? (JSON.parse(raw) as Category[]) : raw;
    if (!Array.isArray(list) || list.length === 0) return getDefaultCategories();
    return list;
  } catch {
    return getDefaultCategories();
  }
}

export function saveCategoriesForBook(bookId: string, list: Category[]): void {
  ensureStorageReady();
  wx.setStorageSync(catKey(bookId), list);
}

export function loadTransactionsForBook(bookId: string): Transaction[] {
  ensureStorageReady();
  try {
    const raw = wx.getStorageSync(txKey(bookId)) as string | Transaction[] | undefined;
    if (!raw) return [];
    const list = typeof raw === 'string' ? (JSON.parse(raw) as Transaction[]) : raw;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveTransactionsForBook(bookId: string, list: Transaction[]): void {
  ensureStorageReady();
  wx.setStorageSync(txKey(bookId), list);
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
}

export function loadSyncConfig(): SyncConfig {
  try {
    const raw = wx.getStorageSync(KEY_SYNC_CONFIG) as SyncConfig | string | undefined;
    if (!raw) return { apiBase: '', enabled: false };
    const parsed = (
      typeof raw === 'string' ? JSON.parse(raw) : raw
    ) as unknown as Record<string, unknown>;
    const apiBaseRaw = parsed.apiBase ?? parsed.baseUrl;
    const apiBase =
      typeof apiBaseRaw === 'string' && apiBaseRaw.startsWith('http')
        ? apiBaseRaw
        : '';
    return {
      apiBase,
      enabled: !!parsed.enabled,
    };
  } catch {
    return { apiBase: '', enabled: false };
  }
}

export function saveSyncConfig(c: SyncConfig): void {
  wx.setStorageSync(KEY_SYNC_CONFIG, c);
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
    wx.setStorageSync(KEY_CURRENT_BOOK, ledgers[0].id);
  }
}

/** 移除本应用全部本地键（流水、分类、账本、同步配置）；下次 load 时与首次安装一致 */
export function clearAllLocalAccountData(): void {
  ensureStorageReady();
  const keysToRemove = new Set<string>([
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
    } catch {
      /* empty */
    }
  }
  migrationDone = false;
}

export { uid };
