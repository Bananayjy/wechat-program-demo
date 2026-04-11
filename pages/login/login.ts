import { callCloudPublicPath } from '../../utils/cloudSync';
import { getSession, saveSession } from '../../utils/session';
import { loadSyncConfig, saveSyncConfig, setStorageAccountId } from '../../utils/storage';
import { bindWechatRemote, pullFromRemote, pullSyncConfigRemote } from '../../utils/sync';

Page({
  data: {
    username: '',
    password: '',
    cloudEnvId: '',
    loading: false,
    mode: 'login' as 'login' | 'register',
  },

  onShow() {
    if (getSession()) {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack({ delta: 1 });
      } else {
        wx.reLaunch({ url: '/pages/index/index' });
      }
    }
  },

  async pullAfterLogin(): Promise<string> {
    let cfg = loadSyncConfig();
    const cloudCfg = await pullSyncConfigRemote(cfg);
    if (cloudCfg.ok && cloudCfg.config) {
      saveSyncConfig(cloudCfg.config);
      cfg = cloudCfg.config;
    }
    const pullRes = await pullFromRemote();
    if (pullRes.ok) return '已登录并完成云端覆盖';
    if (
      pullRes.message.includes('云端暂无可用同步数据') ||
      pullRes.message.includes('云端无配置') ||
      pullRes.message.includes('未启用同步')
    ) {
      return '已登录；云端暂无数据，已保留本地数据';
    }
    return `已登录，自动拉取失败：${pullRes.message}`;
  },

  onUsername(e: WechatMiniprogram.Input) {
    this.setData({ username: e.detail.value });
  },

  onPassword(e: WechatMiniprogram.Input) {
    this.setData({ password: e.detail.value });
  },

  onCloudEnv(e: WechatMiniprogram.Input) {
    this.setData({ cloudEnvId: e.detail.value });
  },

  switchMode() {
    const mode = this.data.mode === 'login' ? 'register' : 'login';
    this.setData({ mode });
  },

  async submit() {
    const username = this.data.username.trim();
    const password = this.data.password;
    const cloudEnvId = this.data.cloudEnvId.trim();
    if (username.length < 2) {
      wx.showToast({ title: '用户名至少 2 个字符', icon: 'none' });
      return;
    }
    if (password.length < 6) {
      wx.showToast({ title: '密码至少 6 位', icon: 'none' });
      return;
    }

    const path = this.data.mode === 'login' ? '/auth/login' : '/auth/register';
    this.setData({ loading: true });
    const res = await callCloudPublicPath<{
      token: string;
      expiresAt: number;
      accountId: string;
      username?: string;
      nickName?: string;
      avatarUrl?: string;
    }>(path, { username, password }, cloudEnvId);
    this.setData({ loading: false });

    if (!res.ok || !res.data) {
      wx.showToast({ title: res.message || '失败', icon: 'none' });
      return;
    }

    const d = res.data;
    saveSession({
      token: d.token,
      expiresAt: d.expiresAt,
      accountId: d.accountId,
      username: d.username,
      nickName: d.nickName || '',
      avatarUrl: d.avatarUrl || '',
    });
    setStorageAccountId(d.accountId);

    if (cloudEnvId) {
      const cfg = loadSyncConfig();
      saveSyncConfig({ ...cfg, cloudEnvId });
      wx.cloud.init({ env: cloudEnvId, traceUser: true });
    }

    wx.login({
      success: () => {
        const cfg = loadSyncConfig();
        void bindWechatRemote(cfg);
      },
    });

    const pullMessage = await this.pullAfterLogin();
    wx.showToast({ title: pullMessage, icon: 'none' });
    setTimeout(() => {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack({ delta: 1 });
      } else {
        wx.reLaunch({ url: '/pages/index/index' });
      }
    }, 900);
  },
});
