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

// 云环境Id处理
function resolveCloudEnv(cfg: SyncConfig): string {
  const env = cfg.cloudEnvId?.trim();
  return env || '';
}

export async function callCloudPath<T>(
  path: string,
  payload: Record<string, unknown>,
  cfg: SyncConfig
): Promise<CloudResult<T>> {
  //  !wx.cloud: 当前运行环境没有注入云 API
  // !wx.cloud.callFunction: 当前环境是否提供了 callFunction 方法(这里没有加括号调用，wx.cloud.callFunction 指的是这个 API 函数本身（引用），不是“调用云函数”)
  if (!wx.cloud || !wx.cloud.callFunction) {
    return { ok: false, statusCode: 0, message: '当前基础库不支持云开发' };
  }
  try {
    const cloudEnv = resolveCloudEnv(cfg);
    // 组装传给微信云函数 wx.cloud.callFunction 的参数
    // 类型写成 Record<string, unknown> 只是为了 TypeScript 里能灵活往里塞字段（后面还会加 config 等）
    const args: Record<string, unknown> = {
      name: SYNC_FUNCTION_NAME, // 要调用的云函数名称
      // 传给该云函数的业务数据
      data: {
        path, // 接口路径
        payload,  // 该路径对应的请求体（参数对象）
        clientTs: Date.now(), // 客户端时间戳，便于日志或排查
        authToken: getAuthToken(),  // 从本地会话取的登录令牌，云端用来校验身份或调后端
      },
    };
    // 如果有云环境Id，进行赋值2
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

/**
 * 云函数调用封装（带一次自动重试）
 * async：函数里可以用 await
 * @param args 参数
 * @param hasCustomEnv 是否自定义云环境
 */
async function callFunctionWithFallback(
  args: Record<string, unknown>,
  hasCustomEnv: boolean
): Promise<unknown> {
  try {
    // await：等待云函数调用结束；成功则把结果返回给外层
    // args as never：类型断言，通过 TypeScript 检查，不改变运行时行为——运行时仍是把整个 args 传给微信 API
    return await wx.cloud.callFunction(args as never);
  } catch (err) {
    // 没有自定义环境时，第一次调用已经是「默认环境」；原样抛出 err
    if (!hasCustomEnv) throw err;
    // 允许用户填错云环境 ID 时自动回退到默认环境重试一次
    // 浅拷贝一份参数对象，避免直接改原对象
    const retryArgs = { ...args };
    // 使用默认环境
    delete retryArgs.config;
    // 云函数调用，若仍失败，错误会向外抛出（外层 callCloudPath 的 try/catch 会接住并转成你们自己的 CloudResult）
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
