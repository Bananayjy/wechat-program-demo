import { getSession } from './utils/session';
import { clearStorageAccountId, loadSyncConfig, setStorageAccountId } from './utils/storage';

App({
  globalData: {},
  onLaunch() {
    if (!wx.cloud) return;
    wx.cloud.init({ traceUser: true });

    const s = getSession();
    if (s) {
      setStorageAccountId(s.accountId);
      const cfg = loadSyncConfig();
      const env = cfg.cloudEnvId?.trim();
      if (env) {
        wx.cloud.init({ env, traceUser: true });
      }
    } else {
      clearStorageAccountId();
    }
  },

  onShow() {
    if (!wx.cloud) return;
    const s = getSession();
    if (s) {
      setStorageAccountId(s.accountId);
      return;
    }
    clearStorageAccountId();
  },
});
