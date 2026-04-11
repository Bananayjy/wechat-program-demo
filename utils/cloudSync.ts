import { getAuthToken } from './session';
import type { SyncConfig } from './storage';

const SYNC_FUNCTION_NAME = 'accountbookSync';

interface RawCloudResponse<T> {
  ok?: boolean;
  statusCode?: number;
  message?: string;
  errMsg?: string;
  errmsg?: string;
  error?: string;
  data?: T;
}

export interface CloudResult<T> {
  ok: boolean;
  statusCode: number;
  message: string;
  data?: T;
}

function resolveCloudEnv(cfg: SyncConfig): string {
  const env = cfg.cloudEnvId?.trim();
  return env || '';
}

export async function callCloudPath<T>(
  path: string,
  payload: Record<string, unknown>,
  cfg: SyncConfig
): Promise<CloudResult<T>> {
  if (!wx.cloud || !wx.cloud.callFunction) {
    return { ok: false, statusCode: 0, message: '当前基础库不支持云开发' };
  }
  try {
    const cloudEnv = resolveCloudEnv(cfg);
    const args: Record<string, unknown> = {
      name: SYNC_FUNCTION_NAME,
      data: {
        path,
        payload,
        clientTs: Date.now(),
        authToken: getAuthToken(),
      },
    };
    if (cloudEnv) {
      args.config = { env: cloudEnv };
    }
    const res = (await callFunctionWithFallback(args, !!cloudEnv)) as {
      result?: RawCloudResponse<T>;
    };
    const raw = (res.result || {}) as RawCloudResponse<T>;
    const hasResultPayload = raw && Object.keys(raw).length > 0;
    const normalizedMessage =
      raw.message ||
      raw.errMsg ||
      raw.errmsg ||
      raw.error ||
      '';
    const hasStatus =
      typeof raw.statusCode === 'number' && Number.isFinite(raw.statusCode);
    const statusCode = hasStatus
      ? (raw.statusCode as number)
      : raw.ok
        ? 200
        : 500;
    const ok = !!raw.ok && statusCode >= 200 && statusCode < 300;
    return {
      ok,
      statusCode,
      message:
        normalizedMessage ||
        (ok
          ? '操作成功'
          : hasResultPayload
            ? '云函数返回失败'
            : `${path} 返回为空，请确认已部署最新 ${SYNC_FUNCTION_NAME} 且环境一致`),
      data: raw.data,
    };
  } catch (err) {
    const e = err as { errMsg?: string };
    return {
      ok: false,
      statusCode: 0,
      message: `${path} 调用失败：${e.errMsg || '云函数调用失败'}`,
    };
  }
}

async function callFunctionWithFallback(
  args: Record<string, unknown>,
  hasCustomEnv: boolean
): Promise<unknown> {
  try {
    return await wx.cloud.callFunction(args as never);
  } catch (err) {
    if (!hasCustomEnv) throw err;
    // 允许用户填错云环境 ID 时自动回退到默认环境重试一次
    const retryArgs = { ...args };
    delete retryArgs.config;
    return await wx.cloud.callFunction(retryArgs as never);
  }
}

/** 未登录也可调用的云路径（如 /auth/login），仅需云环境 ID */
export async function callCloudPublicPath<T>(
  path: string,
  payload: Record<string, unknown>,
  cloudEnvId = ''
): Promise<CloudResult<T>> {
  return callCloudPath<T>(path, payload, {
    apiBase: '',
    enabled: false,
    cloudEnvId: cloudEnvId.trim(),
  });
}
