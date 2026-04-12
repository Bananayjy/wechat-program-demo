import {
  loadCategories,
  loadTransactions,
} from '../../utils/storage';
import type { Category, TxType } from '../../utils/types';
import {
  cloudFirstAddCategory,
  cloudFirstRemoveCategory,
  cloudFirstUpdateCategory,
} from '../../utils/sync';

Page({
  data: {
    expenseList: [] as Category[],
    incomeList: [] as Category[],
    newType: 'expense' as TxType,
    newName: '',
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const all = loadCategories();
    this.setData({
      expenseList: all.filter((c) => c.type === 'expense'),
      incomeList: all.filter((c) => c.type === 'income'),
    });
  },

  onNewType(e: WechatMiniprogram.TouchEvent) {
    const type = e.currentTarget.dataset.type as TxType;
    if (type) this.setData({ newType: type });
  },

  onNewNameInput(e: WechatMiniprogram.Input) {
    this.setData({ newName: e.detail.value });
  },

  async onAdd() {
    const name = this.data.newName.trim();
    if (!name) {
      wx.showToast({ title: '请输入名称', icon: 'none' });
      return;
    }
    const r = await cloudFirstAddCategory({ name, type: this.data.newType });
    if (!r.ok) {
      wx.showToast({ title: r.message, icon: 'none' });
      return;
    }
    this.setData({ newName: '' });
    this.refresh();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  onEdit(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    const all = loadCategories();
    const c = all.find((x) => x.id === id);
    if (!c) return;
    wx.showModal({
      title: '修改分类',
      editable: true,
      placeholderText: c.name,
      content: c.name,
      success: (res) => {
        if (!res.confirm) return;
        const next = (res.content || '').trim();
        if (!next) {
          wx.showToast({ title: '名称不能为空', icon: 'none' });
          return;
        }
        const doUpdate = async () => {
          const r = await cloudFirstUpdateCategory(id, { name: next });
          if (!r.ok) {
            wx.showToast({ title: r.message, icon: 'none' });
            return;
          }
          this.refresh();
          wx.showToast({ title: '已更新', icon: 'none' });
        };
        void doUpdate();
      },
    });
  },

  onRemove(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    const txs = loadTransactions();
    if (txs.some((t) => t.categoryId === id)) {
      wx.showToast({ title: '该分类下已有流水', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除分类',
      content: '确定删除？',
      success: (r) => {
        if (r.confirm) {
          const doRemove = async () => {
            const r = await cloudFirstRemoveCategory(id);
            if (!r.ok) {
              wx.showToast({ title: r.message, icon: 'none' });
              return;
            }
            this.refresh();
            wx.showToast({ title: '已删除', icon: 'none' });
          };
          void doRemove();
        }
      },
    });
  },
});
