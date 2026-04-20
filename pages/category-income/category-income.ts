import {
  getCategoryIcons,
  getDefaultIconKeyByType,
  normalizeCategoryIconKey,
  resolveCategoryIconSrc,
} from '../../utils/category-icons';
import { loadCategories, loadTransactions } from '../../utils/storage';
import {
  cloudFirstAddCategory,
  cloudFirstRemoveCategory,
  cloudFirstUpdateCategory,
} from '../../utils/sync';
import type { Category, TxType } from '../../utils/types';

interface CategoryVM extends Category {
  iconSrc: string;
}

const PAGE_TYPE: TxType = 'income';
const OTHER_PAGE_URL = '/pages/category-expense/category-expense';

Page({
  data: {
    currentType: PAGE_TYPE as TxType,
    categoryList: [] as CategoryVM[],
    showAddPlaceholder: false,
    iconOptions: getCategoryIcons(PAGE_TYPE),
    showCreateModal: false,
    showEditIconModal: false,
    editTargetId: '',
    editIconKey: getDefaultIconKeyByType(PAGE_TYPE),
    newName: '',
    newIconKey: getDefaultIconKeyByType(PAGE_TYPE),
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const list = loadCategories()
      .filter((c) => c.type === PAGE_TYPE)
      .map((c) => ({
        ...c,
        iconKey: normalizeCategoryIconKey(c.iconKey, PAGE_TYPE),
        iconSrc: resolveCategoryIconSrc(c.iconKey, PAGE_TYPE),
      }));
    const newIconKey = normalizeCategoryIconKey(this.data.newIconKey, PAGE_TYPE);
    this.setData({
      categoryList: list,
      showAddPlaceholder: list.length % 2 === 0,
      iconOptions: getCategoryIcons(PAGE_TYPE),
      newIconKey,
    });
  },

  onTypeTap(e: WechatMiniprogram.TouchEvent) {
    const type = e.currentTarget.dataset.type as TxType;
    if (!type || type === PAGE_TYPE) return;
    wx.redirectTo({ url: OTHER_PAGE_URL });
  },

  noop() {
    // 用于阻止弹层点击冒泡到遮罩层
  },

  openCreateModal() {
    this.setData({
      showCreateModal: true,
      newName: '',
      newIconKey: getDefaultIconKeyByType(PAGE_TYPE),
    });
  },

  closeCreateModal() {
    this.setData({
      showCreateModal: false,
      newName: '',
      newIconKey: getDefaultIconKeyByType(PAGE_TYPE),
    });
  },

  closeEditIconModal() {
    this.setData({
      showEditIconModal: false,
      editTargetId: '',
      editIconKey: getDefaultIconKeyByType(PAGE_TYPE),
    });
  },

  onNewNameInput(e: WechatMiniprogram.Input) {
    this.setData({ newName: e.detail.value });
  },

  onPickNewIcon(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as string;
    if (!key) return;
    this.setData({ newIconKey: normalizeCategoryIconKey(key, PAGE_TYPE) });
  },

  onPickEditIcon(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as string;
    if (!key) return;
    this.setData({ editIconKey: normalizeCategoryIconKey(key, PAGE_TYPE) });
  },

  async confirmCreate() {
    const name = this.data.newName.trim();
    if (!name) {
      wx.showToast({ title: '请输入名称', icon: 'none' });
      return;
    }
    const iconKey = normalizeCategoryIconKey(this.data.newIconKey, PAGE_TYPE);
    const r = await cloudFirstAddCategory({ name, type: PAGE_TYPE, iconKey });
    if (!r.ok) {
      wx.showToast({ title: r.message, icon: 'none' });
      return;
    }
    this.closeCreateModal();
    this.refresh();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  onEditName(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    const item = this.data.categoryList.find((c) => c.id === id);
    if (!item) return;
    wx.showModal({
      title: '修改分类名称',
      editable: true,
      placeholderText: item.name,
      content: item.name,
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

  onEditIcon(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    const item = this.data.categoryList.find((c) => c.id === id);
    if (!item) return;
    this.setData({
      showEditIconModal: true,
      editTargetId: id,
      editIconKey: normalizeCategoryIconKey(item.iconKey, PAGE_TYPE),
    });
  },

  async confirmEditIcon() {
    const id = this.data.editTargetId.trim();
    if (!id) return;
    const iconKey = normalizeCategoryIconKey(this.data.editIconKey, PAGE_TYPE);
    const r = await cloudFirstUpdateCategory(id, { iconKey });
    if (!r.ok) {
      wx.showToast({ title: r.message, icon: 'none' });
      return;
    }
    this.closeEditIconModal();
    this.refresh();
    wx.showToast({ title: r.message || '图标已更新', icon: 'none' });
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
        if (!r.confirm) return;
        const doRemove = async () => {
          const rr = await cloudFirstRemoveCategory(id);
          if (!rr.ok) {
            wx.showToast({ title: rr.message, icon: 'none' });
            return;
          }
          this.refresh();
          wx.showToast({ title: '已删除', icon: 'none' });
        };
        void doRemove();
      },
    });
  },
});
