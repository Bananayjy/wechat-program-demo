import { callCloudPublicPath } from '../../utils/cloudSync';
import { getSession, saveSession } from '../../utils/session';
import { loadSyncConfig, saveSyncConfig, setStorageAccountId } from '../../utils/storage';
import {
  bindWechatRemote,
  getRemoteSyncMeta,
  pullFromRemote,
  pullSyncConfigRemote,
  pushToRemote,
} from '../../utils/sync';

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
    // 按当前账号从本地存储里读出「同步配置」，读不到或出错就返回一份安全的默认值
    let cfg = loadSyncConfig();
    // 通过云函数请求 /accountbook/config/pull，拉取云端同步配置
    const cloudCfg = await pullSyncConfigRemote(cfg);
    // 如果拉取成功，把云端配置保存到本地
    if (cloudCfg.ok && cloudCfg.config) {
      // 静默写入本地并更新内存中的 cfg，后面请求都用新配置
      saveSyncConfig(cloudCfg.config, { silent: true });
      cfg = cloudCfg.config;
    }
    // 通过云函数请求 /accountbook/meta/get，获取云端账本列表
    const metaRes = await getRemoteSyncMeta();
    // 如果获取失败，返回错误信息
    if (!metaRes.ok || !metaRes.meta) {
      return `已登录，检查云端数据失败：${metaRes.message}`;
    }
    // 如果账本列表不为空，说明云端有账本，需要拉取
    if (metaRes.meta.bookIds.length > 0) {
      // 通过云函数请求 /accountbook/pull，拉取云端账本
      const pullRes = await pullFromRemote();
      // 如果拉取成功，返回成功信息
      if (pullRes.ok) return '已登录并完成云端覆盖';
      return `已登录，自动拉取失败：${pullRes.message}`;
    }
    // 之前没有同步云端的情况，上传本地账本
    // 通过云函数请求 /accountbook/push，上传本地账本
    const pushRes = await pushToRemote();
    // 如果上传成功，返回成功信息
    if (pushRes.ok) return '已登录；云端无数据，已上传本地数据';
    // 如果上传失败，返回错误信息
    return `已登录，云端无数据但自动上传失败：${pushRes.message}`;
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
    if (username.length > 10) {
      wx.showToast({ title: '用户名最多 10 个字符', icon: 'none' });
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
    // 写入session
    saveSession({
      token: d.token,
      expiresAt: d.expiresAt,
      accountId: d.accountId,
      username: d.username,
      nickName: d.nickName || '',
      avatarUrl: d.avatarUrl || '',
    });
    setStorageAccountId(d.accountId);

    // 用户提供云环境ID，把这个 ID 合并进同步配置并静默保存，同时用 wx.cloud.init 指定云环境并开启 traceUser，保证后面云函数调用连对环境
    if (cloudEnvId) {
      const cfg = loadSyncConfig();
      saveSyncConfig({ ...cfg, cloudEnvId }, { silent: true });
      wx.cloud.init({ env: cloudEnvId, traceUser: true });
    }

    wx.login({
      success: () => {
        // 按当前账号从本地存储里读出「同步配置」，读不到或出错就返回一份安全的默认值
        const cfg = loadSyncConfig();
        // 通过云函数请求 /wechat/bind，把当前登录用户（authToken 已在 callCloudPath 里带上）和微信侧身份在服务端做关联
        void bindWechatRemote(cfg);
      },
    });

    // await：等 pullAfterLogin 跑完
    // 拉同步配置、看云端是否有账本、决定拉取或推送
    const pullMessage = await this.pullAfterLogin();

    // 弹出轻提示，文案就是上面的 pullMessage
    wx.showToast({ title: pullMessage, icon: 'none' });

    // setTimeout(() => { ... }, 900)：登录成功后延迟 900ms 再跳转，给用户一点时间看结果
    setTimeout(() => {
      const pages = getCurrentPages();
      if (pages.length > 1) { // 说明登录页不是唯一一页（例如从别的页 navigateTo 进来的），用 wx.navigateBack({ delta: 1 }) 返回上一页。
        wx.navigateBack({ delta: 1 });
      } else { // 否则直接跳转到首页
        wx.reLaunch({ url: '/pages/index/index' });
      }
    }, 500);
  },
});
