import {
  addCategory,
  loadCategories,
  loadTransactions,
  removeCategory,
  updateCategory,
} from '../../utils/storage';
import type { Category, TxType } from '../../utils/types';

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

  onAdd() {
    const name = this.data.newName.trim();
    if (!name) {
      wx.showToast({ title: '请输入名称', icon: 'none' });
      return;
    }
    addCategory({ name, type: this.data.newType });
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
        updateCategory(id, { name: next });
        this.refresh();
        wx.showToast({ title: '已更新', icon: 'none' });
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
          if (removeCategory(id)) {
            this.refresh();
            wx.showToast({ title: '已删除', icon: 'none' });
          }
        }
      },
    });
  },
});
