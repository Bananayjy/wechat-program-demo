"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const category_icons_1 = require("../../utils/category-icons");
const storage_1 = require("../../utils/storage");
const sync_1 = require("../../utils/sync");
function isValidType(type) {
    return type === 'income' || type === 'expense';
}
Page({
    data: {
        currentType: 'expense',
        categoryList: [],
        showAddPlaceholder: false,
        iconOptions: (0, category_icons_1.getCategoryIcons)('expense'),
        showCreateModal: false,
        showEditIconModal: false,
        editTargetId: '',
        editIconKey: (0, category_icons_1.getDefaultIconKeyByType)('expense'),
        newName: '',
        newIconKey: (0, category_icons_1.getDefaultIconKeyByType)('expense'),
    },
    onLoad(q) {
        const type = q.type;
        if (!isValidType(type))
            return;
        this.setData({
            currentType: type,
            iconOptions: (0, category_icons_1.getCategoryIcons)(type),
            newIconKey: (0, category_icons_1.getDefaultIconKeyByType)(type),
            editIconKey: (0, category_icons_1.getDefaultIconKeyByType)(type),
        });
    },
    onShow() {
        this.refresh();
    },
    refresh() {
        const type = this.data.currentType;
        const list = (0, storage_1.loadCategories)()
            .filter((c) => c.type === type)
            .map((c) => ({
            ...c,
            iconKey: (0, category_icons_1.normalizeCategoryIconKey)(c.iconKey, type),
            iconSrc: (0, category_icons_1.resolveCategoryIconSrc)(c.iconKey, type),
        }));
        this.setData({
            categoryList: list,
            showAddPlaceholder: list.length % 2 === 0,
            iconOptions: (0, category_icons_1.getCategoryIcons)(type),
            newIconKey: (0, category_icons_1.normalizeCategoryIconKey)(this.data.newIconKey, type),
            editIconKey: (0, category_icons_1.normalizeCategoryIconKey)(this.data.editIconKey, type),
        });
    },
    onTypeTap(e) {
        const nextType = e.currentTarget.dataset.type;
        if (!isValidType(nextType) || nextType === this.data.currentType)
            return;
        this.setData({
            currentType: nextType,
            showCreateModal: false,
            showEditIconModal: false,
            editTargetId: '',
            newName: '',
            newIconKey: (0, category_icons_1.getDefaultIconKeyByType)(nextType),
            editIconKey: (0, category_icons_1.getDefaultIconKeyByType)(nextType),
            iconOptions: (0, category_icons_1.getCategoryIcons)(nextType),
        });
        this.refresh();
    },
    noop() {
        // 用于阻止弹层点击冒泡到遮罩层
    },
    openCreateModal() {
        const type = this.data.currentType;
        this.setData({
            showCreateModal: true,
            newName: '',
            newIconKey: (0, category_icons_1.getDefaultIconKeyByType)(type),
        });
    },
    closeCreateModal() {
        const type = this.data.currentType;
        this.setData({
            showCreateModal: false,
            newName: '',
            newIconKey: (0, category_icons_1.getDefaultIconKeyByType)(type),
        });
    },
    closeEditIconModal() {
        const type = this.data.currentType;
        this.setData({
            showEditIconModal: false,
            editTargetId: '',
            editIconKey: (0, category_icons_1.getDefaultIconKeyByType)(type),
        });
    },
    onNewNameInput(e) {
        this.setData({ newName: e.detail.value });
    },
    onPickNewIcon(e) {
        const key = e.currentTarget.dataset.key;
        if (!key)
            return;
        const type = this.data.currentType;
        this.setData({ newIconKey: (0, category_icons_1.normalizeCategoryIconKey)(key, type) });
    },
    onPickEditIcon(e) {
        const key = e.currentTarget.dataset.key;
        if (!key)
            return;
        const type = this.data.currentType;
        this.setData({ editIconKey: (0, category_icons_1.normalizeCategoryIconKey)(key, type) });
    },
    async confirmCreate() {
        const name = this.data.newName.trim();
        if (!name) {
            wx.showToast({ title: '请输入名称', icon: 'none' });
            return;
        }
        const type = this.data.currentType;
        const iconKey = (0, category_icons_1.normalizeCategoryIconKey)(this.data.newIconKey, type);
        const r = await (0, sync_1.cloudFirstAddCategory)({ name, type, iconKey });
        if (!r.ok) {
            wx.showToast({ title: r.message, icon: 'none' });
            return;
        }
        this.closeCreateModal();
        this.refresh();
        wx.showToast({ title: '已添加', icon: 'success' });
    },
    onEditName(e) {
        const id = e.currentTarget.dataset.id;
        if (!id)
            return;
        const item = this.data.categoryList.find((c) => c.id === id);
        if (!item)
            return;
        wx.showModal({
            title: '修改分类名称',
            editable: true,
            placeholderText: item.name,
            content: item.name,
            success: (res) => {
                if (!res.confirm)
                    return;
                const next = (res.content || '').trim();
                if (!next) {
                    wx.showToast({ title: '名称不能为空', icon: 'none' });
                    return;
                }
                const doUpdate = async () => {
                    const r = await (0, sync_1.cloudFirstUpdateCategory)(id, { name: next });
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
    onEditIcon(e) {
        const id = e.currentTarget.dataset.id;
        if (!id)
            return;
        const item = this.data.categoryList.find((c) => c.id === id);
        if (!item)
            return;
        const type = this.data.currentType;
        this.setData({
            showEditIconModal: true,
            editTargetId: id,
            editIconKey: (0, category_icons_1.normalizeCategoryIconKey)(item.iconKey, type),
        });
    },
    async confirmEditIcon() {
        const id = this.data.editTargetId.trim();
        if (!id)
            return;
        const type = this.data.currentType;
        const iconKey = (0, category_icons_1.normalizeCategoryIconKey)(this.data.editIconKey, type);
        const r = await (0, sync_1.cloudFirstUpdateCategory)(id, { iconKey });
        if (!r.ok) {
            wx.showToast({ title: r.message, icon: 'none' });
            return;
        }
        this.closeEditIconModal();
        this.refresh();
        wx.showToast({ title: r.message || '图标已更新', icon: 'none' });
    },
    onRemove(e) {
        const id = e.currentTarget.dataset.id;
        if (!id)
            return;
        const txs = (0, storage_1.loadTransactions)();
        if (txs.some((t) => t.categoryId === id)) {
            wx.showToast({ title: '该分类下已有流水', icon: 'none' });
            return;
        }
        wx.showModal({
            title: '删除分类',
            content: '确定删除？',
            success: (r) => {
                if (!r.confirm)
                    return;
                const doRemove = async () => {
                    const rr = await (0, sync_1.cloudFirstRemoveCategory)(id);
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
