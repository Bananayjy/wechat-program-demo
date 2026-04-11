"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callCloudPath = callCloudPath;
exports.callCloudPublicPath = callCloudPublicPath;
const session_1 = require("./session");
const SYNC_FUNCTION_NAME = 'accountbookSync';
function resolveCloudEnv(cfg) {
    var _a;
    const env = (_a = cfg.cloudEnvId) === null || _a === void 0 ? void 0 : _a.trim();
    return env || '';
}
async function callCloudPath(path, payload, cfg) {
    if (!wx.cloud || !wx.cloud.callFunction) {
        return { ok: false, statusCode: 0, message: '当前基础库不支持云开发' };
    }
    try {
        const cloudEnv = resolveCloudEnv(cfg);
        const args = {
            name: SYNC_FUNCTION_NAME,
            data: {
                path,
                payload,
                clientTs: Date.now(),
                authToken: (0, session_1.getAuthToken)(),
            },
        };
        if (cloudEnv) {
            args.config = { env: cloudEnv };
        }
        const res = (await callFunctionWithFallback(args, !!cloudEnv));
        const raw = (res.result || {});
        const hasResultPayload = raw && Object.keys(raw).length > 0;
        const normalizedMessage = raw.message ||
            raw.errMsg ||
            raw.errmsg ||
            raw.error ||
            '';
        const hasStatus = typeof raw.statusCode === 'number' && Number.isFinite(raw.statusCode);
        const statusCode = hasStatus
            ? raw.statusCode
            : raw.ok
                ? 200
                : 500;
        const ok = !!raw.ok && statusCode >= 200 && statusCode < 300;
        return {
            ok,
            statusCode,
            message: normalizedMessage ||
                (ok
                    ? '操作成功'
                    : hasResultPayload
                        ? '云函数返回失败'
                        : `${path} 返回为空，请确认已部署最新 ${SYNC_FUNCTION_NAME} 且环境一致`),
            data: raw.data,
        };
    }
    catch (err) {
        const e = err;
        return {
            ok: false,
            statusCode: 0,
            message: `${path} 调用失败：${e.errMsg || '云函数调用失败'}`,
        };
    }
}
async function callFunctionWithFallback(args, hasCustomEnv) {
    try {
        return await wx.cloud.callFunction(args);
    }
    catch (err) {
        if (!hasCustomEnv)
            throw err;
        // 允许用户填错云环境 ID 时自动回退到默认环境重试一次
        const retryArgs = { ...args };
        delete retryArgs.config;
        return await wx.cloud.callFunction(retryArgs);
    }
}
/** 未登录也可调用的云路径（如 /auth/login），仅需云环境 ID */
async function callCloudPublicPath(path, payload, cloudEnvId = '') {
    return callCloudPath(path, payload, {
        apiBase: '',
        enabled: false,
        cloudEnvId: cloudEnvId.trim(),
    });
}
