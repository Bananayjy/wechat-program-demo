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

function isValidType(type: string | undefined): type is TxType {
  return type === 'income' || type === 'expense';
}

Page({
  data: {
    currentType: 'expense' as TxType,
    categoryList: [] as CategoryVM[],
    showAddPlaceholder: false,
    iconOptions: getCategoryIcons('expense'),
    showCreateModal: false,
    showEditIconModal: false,
    editTargetId: '',
    editIconKey: getDefaultIconKeyByType('expense'),
    newName: '',
    newIconKey: getDefaultIconKeyByType('expense'),
  },

  onLoad(q: Record<string, string | undefined>) {
    const type = q.type;
    if (!isValidType(type)) return;
    this.setData({
      currentType: type,
      iconOptions: getCategoryIcons(type),
      newIconKey: getDefaultIconKeyByType(type),
      editIconKey: getDefaultIconKeyByType(type),
    });
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const type = this.data.currentType as TxType;
    const list = loadCategories()
      .filter((c) => c.type === type)
      .map((c) => ({
        ...c,
        iconKey: normalizeCategoryIconKey(c.iconKey, type),
        iconSrc: resolveCategoryIconSrc(c.iconKey, type),
      }));
    this.setData({
      categoryList: list,
      showAddPlaceholder: list.length % 2 === 0,
      iconOptions: getCategoryIcons(type),
      newIconKey: normalizeCategoryIconKey(this.data.newIconKey, type),
      editIconKey: normalizeCategoryIconKey(this.data.editIconKey, type),
    });
  },

  onTypeTap(e: WechatMiniprogram.TouchEvent) {
    const nextType = e.currentTarget.dataset.type as string | undefined;
    if (!isValidType(nextType) || nextType === this.data.currentType) return;
    this.setData({
      currentType: nextType,
      showCreateModal: false,
      showEditIconModal: false,
      editTargetId: '',
      newName: '',
      newIconKey: getDefaultIconKeyByType(nextType),
      editIconKey: getDefaultIconKeyByType(nextType),
      iconOptions: getCategoryIcons(nextType),
    });
    this.refresh();
  },

  noop() {
    // 用于阻止弹层点击冒泡到遮罩层
  },

  openCreateModal() {
    const type = this.data.currentType as TxType;
    this.setData({
      showCreateModal: true,
      newName: '',
      newIconKey: getDefaultIconKeyByType(type),
    });
  },

  closeCreateModal() {
    const type = this.data.currentType as TxType;
    this.setData({
      showCreateModal: false,
      newName: '',
      newIconKey: getDefaultIconKeyByType(type),
    });
  },

  closeEditIconModal() {
    const type = this.data.currentType as TxType;
    this.setData({
      showEditIconModal: false,
      editTargetId: '',
      editIconKey: getDefaultIconKeyByType(type),
    });
  },

  onNewNameInput(e: WechatMiniprogram.Input) {
    this.setData({ newName: e.detail.value });
  },

  onPickNewIcon(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as string;
    if (!key) return;
    const type = this.data.currentType as TxType;
    this.setData({ newIconKey: normalizeCategoryIconKey(key, type) });
  },

  onPickEditIcon(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as string;
    if (!key) return;
    const type = this.data.currentType as TxType;
    this.setData({ editIconKey: normalizeCategoryIconKey(key, type) });
  },

  async confirmCreate() {
    const name = this.data.newName.trim();
    if (!name) {
      wx.showToast({ title: '请输入名称', icon: 'none' });
      return;
    }
    const type = this.data.currentType as TxType;
    const iconKey = normalizeCategoryIconKey(this.data.newIconKey, type);
    const r = await cloudFirstAddCategory({ name, type, iconKey });
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
    const type = this.data.currentType as TxType;
    this.setData({
      showEditIconModal: true,
      editTargetId: id,
      editIconKey: normalizeCategoryIconKey(item.iconKey, type),
    });
  },

  async confirmEditIcon() {
    const id = this.data.editTargetId.trim();
    if (!id) return;
    const type = this.data.currentType as TxType;
    const iconKey = normalizeCategoryIconKey(this.data.editIconKey, type);
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
