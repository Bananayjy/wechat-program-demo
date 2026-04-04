import type { Category, Transaction } from './types';

const KEY_CATEGORIES = 'accountbook_categories_v1';
const KEY_TRANSACTIONS = 'accountbook_transactions_v1';
const KEY_SYNC_CONFIG = 'accountbook_sync_config_v1';

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
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

export function loadCategories(): Category[] {
  try {
    const raw = wx.getStorageSync(KEY_CATEGORIES) as string | Category[] | undefined;
    if (!raw) return getDefaultCategories();
    const list = typeof raw === 'string' ? (JSON.parse(raw) as Category[]) : raw;
    if (!Array.isArray(list) || list.length === 0) return getDefaultCategories();
    return list;
  } catch {
    return getDefaultCategories();
  }
}

export function saveCategories(list: Category[]): void {
  wx.setStorageSync(KEY_CATEGORIES, list);
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

export function loadTransactions(): Transaction[] {
  try {
    const raw = wx.getStorageSync(KEY_TRANSACTIONS) as string | Transaction[] | undefined;
    if (!raw) return [];
    const list = typeof raw === 'string' ? (JSON.parse(raw) as Transaction[]) : raw;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveTransactions(list: Transaction[]): void {
  wx.setStorageSync(KEY_TRANSACTIONS, list);
}

export function addTransaction(
  input: Omit<Transaction, 'id'>
): Transaction {
  const item: Transaction = { ...input, id: uid() };
  const list = loadTransactions();
  list.push(item);
  list.sort((a, b) => b.occurredAt - a.occurredAt);
  saveTransactions(list);
  return item;
}

export function updateTransaction(
  id: string,
  patch: Partial<Omit<Transaction, 'id'>>
): boolean {
  const list = loadTransactions();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return false;
  list[i] = { ...list[i], ...patch };
  list.sort((a, b) => b.occurredAt - a.occurredAt);
  saveTransactions(list);
  return true;
}

export function removeTransaction(id: string): boolean {
  const list = loadTransactions().filter((t) => t.id !== id);
  saveTransactions(list);
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

/** 移除本应用全部本地键（流水、分类、同步配置）；下次 load 时与首次安装一致 */
export function clearAllLocalAccountData(): void {
  for (const k of [KEY_TRANSACTIONS, KEY_CATEGORIES, KEY_SYNC_CONFIG]) {
    try {
      wx.removeStorageSync(k);
    } catch {
      // 单键失败仍继续清其余
    }
  }
}

export { uid };
