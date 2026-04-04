import {
  loadCategories,
  loadSyncConfig,
  loadTransactions,
  saveCategories,
  saveTransactions,
  type SyncConfig,
} from './storage';
import type { Category, Transaction } from './types';

/**
 * 云开发或自建 API 同步占位：将本地数据 POST 到 baseUrl（路径需以 / 开头）。
 * 实际对接时请在后端实现对应接口并替换请求体格式。
 */
export function pushToRemote(): Promise<{ ok: boolean; message: string }> {
  const cfg = loadSyncConfig();
  if (!cfg.enabled || !cfg.apiBase) {
    return Promise.resolve({ ok: false, message: '未启用同步或未配置站点地址' });
  }
  const url = joinApi(cfg.apiBase, '/accountbook/sync');
  const body = {
    categories: loadCategories(),
    transactions: loadTransactions(),
    clientTime: Date.now(),
  };
  return new Promise((resolve) => {
    wx.request({
      url,
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: body,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, message: '已上传' });
        } else {
          resolve({ ok: false, message: `同步失败 ${res.statusCode}` });
        }
      },
      fail: (err) => {
        resolve({ ok: false, message: err.errMsg || '网络错误' });
      },
    });
  });
}

export function pullFromRemote(): Promise<{ ok: boolean; message: string }> {
  const cfg = loadSyncConfig();
  if (!cfg.enabled || !cfg.apiBase) {
    return Promise.resolve({ ok: false, message: '未启用同步或未配置站点地址' });
  }
  const url = joinApi(cfg.apiBase, '/accountbook/pull');
  return new Promise((resolve) => {
    wx.request({
      url,
      method: 'GET',
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          resolve({ ok: false, message: `拉取失败 ${res.statusCode}` });
          return;
        }
        const data = res.data as {
          categories?: Category[];
          transactions?: Transaction[];
        };
        if (data.categories && Array.isArray(data.categories)) {
          saveCategories(data.categories);
        }
        if (data.transactions && Array.isArray(data.transactions)) {
          saveTransactions(data.transactions);
        }
        resolve({ ok: true, message: '已拉取并合并' });
      },
      fail: (err) => {
        resolve({ ok: false, message: err.errMsg || '网络错误' });
      },
    });
  });
}

function joinApi(apiBase: string, path: string): string {
  const base = apiBase.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : '/' + path;
  return base + p;
}

/** 业务路径需以 / 开头；站点根需为 https 完整地址 */
export function validateSyncConfig(c: SyncConfig): string | null {
  if (!c.enabled) return null;
  if (!c.apiBase) return '请填写 https 站点地址';
  if (!/^https:\/\//i.test(c.apiBase.trim())) {
    return '站点地址需为 https 完整 URL';
  }
  return null;
}
