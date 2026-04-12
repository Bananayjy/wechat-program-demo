import {
  loadLedgers,
} from '../../utils/storage';
import {
  cloudFirstAddLedger,
  cloudFirstRemoveLedger,
  cloudFirstRenameLedger,
  cloudFirstUpdateLedgerCover,
} from '../../utils/sync';

interface TileVM {
  id: string;
  name: string;
  cover: string;
  canDelete: boolean;
}

Page({
  data: {
    tiles: [] as TileVM[],
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const ledgers = loadLedgers();
    const canDelete = ledgers.length > 1;
    const tiles: TileVM[] = ledgers.map((l) => ({
      id: l.id,
      name: l.name,
      cover: l.coverImagePath || '',
      canDelete,
    }));
    this.setData({ tiles });
  },

  onAddLedger() {
    wx.showModal({
      title: '新增账本',
      editable: true,
      placeholderText: '账本名称',
      success: (res) => {
        if (!res.confirm) return;
        const name = ((res as WechatMiniprogram.ShowModalSuccessCallbackResult).content || '').trim();
        if (!name) {
          wx.showToast({ title: '请输入名称', icon: 'none' });
          return;
        }
        const doAdd = async () => {
          const r = await cloudFirstAddLedger(name);
          if (!r.ok) {
            wx.showToast({ title: r.message, icon: 'none' });
            return;
          }
          this.refresh();
          wx.showToast({ title: '已添加', icon: 'success' });
        };
        void doAdd();
      },
    });
  },

  onRename(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    const cur = loadLedgers().find((l) => l.id === id);
    if (!cur) return;
    wx.showModal({
      title: '重命名',
      editable: true,
      placeholderText: '账本名称',
      content: cur.name,
      success: (res) => {
        if (!res.confirm) return;
        const name = ((res as WechatMiniprogram.ShowModalSuccessCallbackResult).content || '').trim();
        if (!name) {
          wx.showToast({ title: '名称不能为空', icon: 'none' });
          return;
        }
        const doRename = async () => {
          const r = await cloudFirstRenameLedger(id, name);
          if (!r.ok) {
            wx.showToast({ title: r.message, icon: 'none' });
            return;
          }
          this.refresh();
          wx.showToast({ title: '已更新', icon: 'success' });
        };
        void doRename();
      },
    });
  },

  onDeleteLedger(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    wx.showModal({
      title: '删除账本',
      content: '该账本下的流水与分类将一并删除，且无法恢复。',
      confirmText: '删除',
      confirmColor: '#e87868',
      success: (res) => {
        if (!res.confirm) return;
        const doRemove = async () => {
          const r = await cloudFirstRemoveLedger(id);
          if (!r.ok) {
            wx.showToast({ title: r.message || '无法删除', icon: 'none' });
            return;
          }
          this.refresh();
          wx.showToast({ title: '已删除', icon: 'success' });
        };
        void doRemove();
      },
    });
  },

  onPickCover(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const temp = res.tempFiles[0]?.tempFilePath;
        if (!temp) return;
        wx.getFileSystemManager().saveFile({
          tempFilePath: temp,
          success: (r) => {
            const saved = r.savedFilePath;
            if (saved) {
              const doUpdateCover = async () => {
                const r = await cloudFirstUpdateLedgerCover(id, saved);
                if (!r.ok) {
                  wx.showToast({ title: r.message, icon: 'none' });
                  return;
                }
                this.refresh();
              };
              void doUpdateCover();
            }
          },
          fail: () => {
            wx.showToast({ title: '保存失败', icon: 'none' });
          },
        });
      },
    });
  },
});
