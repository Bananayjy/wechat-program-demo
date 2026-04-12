import { transactionsToCsv } from '../../utils/export';
import { getSession, patchSessionProfile, clearSession } from '../../utils/session';
import {
  clearAllLocalAccountData,
  clearStorageAccountId,
  loadCategories,
  loadSyncConfig,
  loadTransactions,
  saveSyncConfig,
} from '../../utils/storage';
import {
  bindWechatRemote,
  fetchProfileRemote,
  pullLatestForPageOrBlock,
  resolveConflictIfNeeded,
  pullFromRemote,
  pullSyncConfigRemote,
  pushToRemote,
  saveSyncConfigRemote,
  updateProfileRemote,
  validateSyncConfig,
} from '../../utils/sync';

Page({
  data: {
    apiBase: '',
    cloudEnvId: '',
    syncEnabled: false,
    username: '',
    profileNick: '',
    profileAvatarFileId: '',
    profileAvatar: '',
    editNick: '',
    isLoggedIn: false,
  },

  async onShow() {
    const conflictRes = await resolveConflictIfNeeded('我的');
    if (!conflictRes.ok) return;
    const syncRes = await pullLatestForPageOrBlock('我的');
    if (!syncRes.ok) return;
    const s = getSession();
    this.setData({
      isLoggedIn: !!s,
      username: s?.username || '',
      profileNick: s?.nickName || '',
      profileAvatarFileId: s?.avatarUrl || '',
      profileAvatar: s?.avatarUrl || '',
      editNick: s?.nickName || '',
    });
    this.renderAvatar(this.data.profileAvatarFileId);

    const c = loadSyncConfig();
    this.setData({
      apiBase: c.apiBase,
      cloudEnvId: c.cloudEnvId,
      syncEnabled: c.enabled,
    });

    if (s) {
      await this.refreshProfileFromCloud();
      const cloudCfg = await pullSyncConfigRemote(c);
      if (!cloudCfg.ok || !cloudCfg.config) return;
      saveSyncConfig(cloudCfg.config, { silent: true });
      this.setData({
        apiBase: cloudCfg.config.apiBase,
        cloudEnvId: cloudCfg.config.cloudEnvId,
        syncEnabled: cloudCfg.config.enabled,
      });
    }
  },

  ensureLoginOrRedirect(tip = '请先登录账号'): boolean {
    if (getSession()) return true;
    wx.showToast({ title: tip, icon: 'none' });
    setTimeout(() => {
      wx.navigateTo({ url: '/pages/login/login' });
    }, 300);
    return false;
  },

  async refreshProfileFromCloud() {
    const c = loadSyncConfig();
    const r = await fetchProfileRemote(c);
    if (!r.ok || !r.profile) return;
    patchSessionProfile({
      nickName: r.profile.nickName,
      avatarUrl: r.profile.avatarUrl,
    });
    this.setData({
      profileNick: r.profile.nickName,
      profileAvatarFileId: r.profile.avatarUrl,
      editNick: r.profile.nickName,
      username: r.profile.username || this.data.username,
    });
    this.renderAvatar(r.profile.avatarUrl);
  },

  async renderAvatar(raw: string) {
    const v = raw.trim();
    if (!v) {
      this.setData({ profileAvatar: '' });
      return;
    }
    if (v.startsWith('cloud://') && wx.cloud?.getTempFileURL) {
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [v] });
        const item = Array.isArray(res.fileList) ? res.fileList[0] : null;
        const url = item && item.tempFileURL ? item.tempFileURL : v;
        this.setData({ profileAvatar: url });
        return;
      } catch {
        /* empty */
      }
    }
    this.setData({ profileAvatar: v });
  },

  onEditNick(e: WechatMiniprogram.Input) {
    this.setData({ editNick: e.detail.value });
  },

  async onChooseAvatar(e: WechatMiniprogram.CustomEvent) {
    if (!this.ensureLoginOrRedirect()) return;
    const temp = (e.detail as { avatarUrl?: string }).avatarUrl;
    if (!temp || !wx.cloud?.uploadFile) {
      wx.showToast({ title: '请选择头像', icon: 'none' });
      return;
    }
    const session = getSession();
    if (!session) return;
    wx.showLoading({ title: '上传中' });
    try {
      const cloudPath = `user_avatars/${session.accountId}_${Date.now()}.jpg`;
      const up = await wx.cloud.uploadFile({ cloudPath, filePath: temp });
      const avatarUrl = up.fileID;
      const cfg = loadSyncConfig();
      const nickName = this.data.editNick.trim();
      const save = await updateProfileRemote(cfg, { nickName, avatarUrl });
      if (!save.ok) {
        wx.showToast({ title: save.message, icon: 'none' });
        return;
      }
      patchSessionProfile({ avatarUrl });
      this.setData({ profileAvatarFileId: avatarUrl });
      await this.renderAvatar(avatarUrl);
      wx.showToast({ title: '头像已保存', icon: 'success' });
    } catch {
      wx.showToast({ title: '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async saveNickName() {
    if (!this.ensureLoginOrRedirect()) return;
    const nickName = this.data.editNick.trim();
    const cfg = loadSyncConfig();
    const avatarUrl = this.data.profileAvatarFileId || '';
    wx.showLoading({ title: '保存中' });
    const save = await updateProfileRemote(cfg, { nickName, avatarUrl });
    wx.hideLoading();
    if (!save.ok) {
      wx.showToast({ title: save.message, icon: 'none' });
      return;
    }
    patchSessionProfile({ nickName, avatarUrl });
    this.setData({ profileNick: nickName });
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  bindWechat() {
    if (!this.ensureLoginOrRedirect()) return;
    wx.login({
      success: () => {
        const cfg = loadSyncConfig();
        void bindWechatRemote(cfg).then((r) => {
          wx.showToast({
            title: r.ok ? '微信已绑定' : r.message,
            icon: r.ok ? 'success' : 'none',
          });
        });
      },
    });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需重新登录；本机已按账号隔离的数据仍会保留。',
      success: (res) => {
        if (!res.confirm) return;
        clearSession();
        clearStorageAccountId();
        this.setData({
          isLoggedIn: false,
          username: '',
          profileNick: '',
          profileAvatar: '',
          profileAvatarFileId: '',
          editNick: '',
        });
        wx.showToast({ title: '已退出，当前为游客模式', icon: 'none' });
      },
    });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  goLedgerManage() {
    wx.navigateTo({ url: '/pages/ledger-manage/ledger-manage' });
  },

  goCategories() {
    wx.navigateTo({ url: '/pages/category-edit/category-edit' });
  },

  onClearLocal() {
    wx.showModal({
      title: '清除本地数据',
      content:
        '将删除当前模式下（游客或登录账号）在本机的全部流水与自定义分类，同步配置也会清空，且无法恢复。确定继续？',
      confirmText: '清除',
      confirmColor: '#e87868',
      success: (res) => {
        if (!res.confirm) return;
        clearAllLocalAccountData();
        wx.showToast({ title: '已清除', icon: 'success' });
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/index/index' });
        }, 800);
      },
    });
  },

  onExport() {
    const txs = loadTransactions().sort((a, b) => b.occurredAt - a.occurredAt);
    const cats = loadCategories();
    const csv = transactionsToCsv(txs, cats);
    const fs = wx.getFileSystemManager();
    const path = `${wx.env.USER_DATA_PATH}/accountbook_export.txt`;
    try {
      fs.writeFileSync(path, csv, 'utf8');
      wx.openDocument({
        filePath: path,
        showMenu: true,
        success: () => {
          wx.showToast({ title: '当前账本，可通过右上角菜单分享', icon: 'none' });
        },
        fail: () => {
          wx.setClipboardData({
            data: csv.slice(0, 5000),
            success: () => {
              wx.showModal({
                title: '导出',
                content: '文件打开失败，已复制部分 CSV 到剪贴板，可粘贴到备忘录。',
                showCancel: false,
              });
            },
          });
        },
      });
    } catch {
      wx.showToast({ title: '写入失败', icon: 'none' });
    }
  },

  onApiBaseInput(e: WechatMiniprogram.Input) {
    this.setData({ apiBase: e.detail.value });
  },

  onCloudEnvInput(e: WechatMiniprogram.Input) {
    this.setData({ cloudEnvId: e.detail.value });
  },

  onSyncSwitch(e: WechatMiniprogram.SwitchChange) {
    this.setData({ syncEnabled: e.detail.value });
  },

  async onSaveSync() {
    const c = {
      apiBase: this.data.apiBase.trim(),
      cloudEnvId: this.data.cloudEnvId.trim(),
      enabled: this.data.syncEnabled,
    };
    const err = validateSyncConfig(c);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    saveSyncConfig(c);
    if (!getSession()) {
      wx.showToast({ title: '已保存到本地，登录后可同步到云端', icon: 'none' });
      return;
    }
    const remote = await saveSyncConfigRemote(c);
    wx.showToast({
      title: remote.ok ? '本地和云端已保存' : `本地已保存，云端失败：${remote.message}`,
      icon: remote.ok ? 'success' : 'none',
    });
  },

  async onPush() {
    if (!this.ensureLoginOrRedirect('上传前请先登录账号')) return;
    const confirm = await new Promise<boolean>((resolve) => {
      wx.showModal({
        title: '上传到云端',
        content: '将使用本地数据全量覆盖云端数据，是否继续？',
        confirmText: '继续上传',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirm) return;
    wx.showLoading({ title: '上传中' });
    const r = await pushToRemote();
    wx.hideLoading();
    wx.showToast({ title: r.message, icon: r.ok ? 'success' : 'none' });
  },

  async onPull() {
    if (!this.ensureLoginOrRedirect('拉取前请先登录账号')) return;
    const confirm = await new Promise<boolean>((resolve) => {
      wx.showModal({
        title: '从云端拉取',
        content: '将使用云端数据全量覆盖本地数据，是否继续？',
        confirmText: '继续拉取',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirm) return;
    wx.showLoading({ title: '拉取中' });
    const r = await pullFromRemote();
    wx.hideLoading();
    wx.showToast({ title: r.message, icon: r.ok ? 'success' : 'none' });
  },
});
