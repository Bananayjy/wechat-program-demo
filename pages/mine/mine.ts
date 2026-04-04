import { transactionsToCsv } from '../../utils/export';
import {
  clearAllLocalAccountData,
  loadCategories,
  loadSyncConfig,
  loadTransactions,
  saveSyncConfig,
} from '../../utils/storage';
import { pullFromRemote, pushToRemote, validateSyncConfig } from '../../utils/sync';

Page({
  data: {
    apiBase: '',
    syncEnabled: false,
  },

  onShow() {
    const c = loadSyncConfig();
    this.setData({
      apiBase: c.apiBase,
      syncEnabled: c.enabled,
    });
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
        '将删除本机全部流水与自定义分类，同步配置也会清空，且无法恢复。确定继续？',
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

  onSyncSwitch(e: WechatMiniprogram.SwitchChange) {
    this.setData({ syncEnabled: e.detail.value });
  },

  onSaveSync() {
    const c = {
      apiBase: this.data.apiBase.trim(),
      enabled: this.data.syncEnabled,
    };
    const err = validateSyncConfig(c);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    saveSyncConfig(c);
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  async onPush() {
    wx.showLoading({ title: '上传中' });
    const r = await pushToRemote();
    wx.hideLoading();
    wx.showToast({ title: r.message, icon: r.ok ? 'success' : 'none' });
  },

  async onPull() {
    wx.showLoading({ title: '拉取中' });
    const r = await pullFromRemote();
    wx.hideLoading();
    wx.showToast({ title: r.message, icon: r.ok ? 'success' : 'none' });
  },
});
