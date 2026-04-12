"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const storage_1 = require("../../utils/storage");
const sync_1 = require("../../utils/sync");
Page({
    data: {
        tiles: [],
    },
    onShow() {
        this.refresh();
    },
    refresh() {
        const ledgers = (0, storage_1.loadLedgers)();
        const canDelete = ledgers.length > 1;
        const tiles = ledgers.map((l) => ({
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
                if (!res.confirm)
                    return;
                const name = (res.content || '').trim();
                if (!name) {
                    wx.showToast({ title: '请输入名称', icon: 'none' });
                    return;
                }
                const doAdd = async () => {
                    const r = await (0, sync_1.cloudFirstAddLedger)(name);
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
    onRename(e) {
        const id = e.currentTarget.dataset.id;
        if (!id)
            return;
        const cur = (0, storage_1.loadLedgers)().find((l) => l.id === id);
        if (!cur)
            return;
        wx.showModal({
            title: '重命名',
            editable: true,
            placeholderText: '账本名称',
            content: cur.name,
            success: (res) => {
                if (!res.confirm)
                    return;
                const name = (res.content || '').trim();
                if (!name) {
                    wx.showToast({ title: '名称不能为空', icon: 'none' });
                    return;
                }
                const doRename = async () => {
                    const r = await (0, sync_1.cloudFirstRenameLedger)(id, name);
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
    onDeleteLedger(e) {
        const id = e.currentTarget.dataset.id;
        if (!id)
            return;
        wx.showModal({
            title: '删除账本',
            content: '该账本下的流水与分类将一并删除，且无法恢复。',
            confirmText: '删除',
            confirmColor: '#e87868',
            success: (res) => {
                if (!res.confirm)
                    return;
                const doRemove = async () => {
                    const r = await (0, sync_1.cloudFirstRemoveLedger)(id);
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
    onPickCover(e) {
        const id = e.currentTarget.dataset.id;
        if (!id)
            return;
        wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            success: (res) => {
                var _a;
                const temp = (_a = res.tempFiles[0]) === null || _a === void 0 ? void 0 : _a.tempFilePath;
                if (!temp)
                    return;
                wx.getFileSystemManager().saveFile({
                    tempFilePath: temp,
                    success: (r) => {
                        const saved = r.savedFilePath;
                        if (saved) {
                            const doUpdateCover = async () => {
                                const r = await (0, sync_1.cloudFirstUpdateLedgerCover)(id, saved);
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
