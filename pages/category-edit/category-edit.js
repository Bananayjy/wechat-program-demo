"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const storage_1 = require("../../utils/storage");
const sync_1 = require("../../utils/sync");
Page({
    data: {
        expenseList: [],
        incomeList: [],
        newType: 'expense',
        newName: '',
    },
    onShow() {
        this.refresh();
    },
    refresh() {
        const all = (0, storage_1.loadCategories)();
        this.setData({
            expenseList: all.filter((c) => c.type === 'expense'),
            incomeList: all.filter((c) => c.type === 'income'),
        });
    },
    onNewType(e) {
        const type = e.currentTarget.dataset.type;
        if (type)
            this.setData({ newType: type });
    },
    onNewNameInput(e) {
        this.setData({ newName: e.detail.value });
    },
    async onAdd() {
        const name = this.data.newName.trim();
        if (!name) {
            wx.showToast({ title: '请输入名称', icon: 'none' });
            return;
        }
        const r = await (0, sync_1.cloudFirstAddCategory)({ name, type: this.data.newType });
        if (!r.ok) {
            wx.showToast({ title: r.message, icon: 'none' });
            return;
        }
        this.setData({ newName: '' });
        this.refresh();
        wx.showToast({ title: '已添加', icon: 'success' });
    },
    onEdit(e) {
        const id = e.currentTarget.dataset.id;
        if (!id)
            return;
        const all = (0, storage_1.loadCategories)();
        const c = all.find((x) => x.id === id);
        if (!c)
            return;
        wx.showModal({
            title: '修改分类',
            editable: true,
            placeholderText: c.name,
            content: c.name,
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
                if (r.confirm) {
                    const doRemove = async () => {
                        const r = await (0, sync_1.cloudFirstRemoveCategory)(id);
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
