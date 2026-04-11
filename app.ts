import { loadSyncConfig } from './utils/storage';

App({
  globalData: {},
  onLaunch() {
    if (!wx.cloud) return;
    const cfg = loadSyncConfig();
    const env = cfg.cloudEnvId?.trim();
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
