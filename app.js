"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const storage_1 = require("./utils/storage");
App({
    globalData: {},
    onLaunch() {
        var _a;
        if (!wx.cloud)
            return;
        const cfg = (0, storage_1.loadSyncConfig)();
        const env = (_a = cfg.cloudEnvId) === null || _a === void 0 ? void 0 : _a.trim();
        if (env) {
            wx.cloud.init({
                env,
                traceUser: true,
            });
            return;
        }
        wx.cloud.init({ traceUser: true });
    },
});
