import {
  applyFullSyncPayload,
  buildFullSyncPayload,
  loadSyncConfig,
  type AccountBookSyncPayload,
  type SyncConfig,
} from './storage';
import type { Ledger } from './types';
import { callCloudPath } from './cloudSync';

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

export async function pushToRemote(): Promise<{ ok: boolean; message: string }> {
  const cfg = loadSyncConfig();
  if (!cfg.enabled) {
    return { ok: false, message: '未启用同步' };
  }
  const fullData = buildFullSyncPayload();
  const bookIds = fullData.books.map((b) => b.bookId);
  const ledgerMap = new Map<string, Ledger>(fullData.ledgers.map((l) => [l.id, l]));

  const resetRes = await callCloudPath(
    '/accountbook/sync/reset',
    {
      ledgers: fullData.ledgers,
      bookIds,
      clientTime: fullData.clientTime,
    },
    cfg
  );
  if (!resetRes.ok) return { ok: false, message: `初始化失败：${resetRes.message}` };

  let txCount = 0;
  for (const book of fullData.books) {
    const resetBookRes = await callCloudPath(
      '/accountbook/sync/book/reset',
      {
        bookId: book.bookId,
        ledger: ledgerMap.get(book.bookId),
        categories: book.categories,
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
        },
        cfg
      );
      if (!chunkRes.ok) {
        return { ok: false, message: `上传分片失败(${book.bookId})：${chunkRes.message}` };
      }
      txCount += chunk.length;
    }
  }

  const pruneRes = await callCloudPath('/accountbook/sync/prune', { bookIds }, cfg);
  if (!pruneRes.ok) return { ok: false, message: `清理旧数据失败：${pruneRes.message}` };

  return { ok: true, message: `已上传 ${bookIds.length} 个账本，${txCount} 条流水` };
}

export async function pullFromRemote(): Promise<{ ok: boolean; message: string }> {
  const cfg = loadSyncConfig();
  if (!cfg.enabled) {
    return { ok: false, message: '未启用同步' };
  }
  const metaRes = await callCloudPath<{
    ledgers: Ledger[];
    bookIds: string[];
    clientTime: number;
  }>('/accountbook/pull/meta', {}, cfg);
  if (!metaRes.ok) return { ok: false, message: metaRes.message };

  const meta = metaRes.data;
  if (!meta || !Array.isArray(meta.ledgers) || !Array.isArray(meta.bookIds)) {
    return { ok: false, message: '拉取元数据失败' };
  }
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
