"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const session_1 = require("./utils/session");
const storage_1 = require("./utils/storage");
const sync_1 = require("./utils/sync");
App({
    globalData: {},
    onLaunch() {
        var _a;
        if (!wx.cloud)
            return;
        wx.cloud.init({ traceUser: true });
        const s = (0, session_1.getSession)();
        if (s) {
            (0, storage_1.setStorageAccountId)(s.accountId);
            const cfg = (0, storage_1.loadSyncConfig)();
            const env = (_a = cfg.cloudEnvId) === null || _a === void 0 ? void 0 : _a.trim();
            if (env) {
                wx.cloud.init({ env, traceUser: true });
            }
        }
        else {
            (0, storage_1.clearStorageAccountId)();
        }
    },
    onShow() {
        if (!wx.cloud)
            return;
        (0, sync_1.markNeedForegroundSync)();
        const s = (0, session_1.getSession)();
        if (s) {
            (0, storage_1.setStorageAccountId)(s.accountId);
            return;
        }
        (0, storage_1.clearStorageAccountId)();
    },
});
