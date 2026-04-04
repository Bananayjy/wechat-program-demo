"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const format_1 = require("../../utils/format");
const storage_1 = require("../../utils/storage");
Page({
    data: {
        loaded: false,
        id: '',
        txType: 'expense',
        amountYuan: '',
        categoryId: '',
        filteredCategories: [],
        dateStr: '',
        note: '',
    },
    onLoad(q) {
        var _a;
        const id = q.id || '';
        if (!id) {
            wx.showToast({ title: '参数错误', icon: 'none' });
            return;
        }
        const txs = (0, storage_1.loadTransactions)();
        const t = txs.find((x) => x.id === id);
        if (!t) {
            wx.showToast({ title: '记录不存在', icon: 'none' });
            return;
        }
        this.setData({
            loaded: true,
            id: t.id,
            txType: t.type,
            amountYuan: (0, format_1.fenToYuan)(t.amountFen),
            categoryId: t.categoryId,
            dateStr: (0, format_1.formatDate)(t.occurredAt),
            note: t.note,
        });
        this.applyCategories(t.type);
        const cats = (0, storage_1.loadCategories)().filter((c) => c.type === t.type);
        if (!cats.some((c) => c.id === t.categoryId)) {
            const first = ((_a = cats[0]) === null || _a === void 0 ? void 0 : _a.id) || '';
            this.setData({ categoryId: first });
        }
    },
    onTypeTap(e) {
        const type = e.currentTarget.dataset.type;
        if (!type)
            return;
        this.setData({ txType: type });
        this.applyCategories(type);
    },
    applyCategories(type) {
        var _a;
        const all = (0, storage_1.loadCategories)().filter((c) => c.type === type);
        const cid = this.data.categoryId;
        const next = all.some((c) => c.id === cid) ? cid : ((_a = all[0]) === null || _a === void 0 ? void 0 : _a.id) || '';
        this.setData({
            filteredCategories: all,
            categoryId: next,
        });
    },
    onAmountInput(e) {
        this.setData({ amountYuan: e.detail.value });
    },
    onCategoryTap(e) {
        const id = e.currentTarget.dataset.id;
        if (id)
            this.setData({ categoryId: id });
    },
    onDateChange(e) {
        this.setData({ dateStr: e.detail.value });
    },
    onNoteInput(e) {
        this.setData({ note: e.detail.value });
    },
    onSave() {
        const fen = (0, format_1.yuanInputToFen)(this.data.amountYuan);
        if (fen === null || fen === 0) {
            wx.showToast({ title: '请输入有效金额', icon: 'none' });
            return;
        }
        if (!this.data.categoryId) {
            wx.showToast({ title: '请选择分类', icon: 'none' });
            return;
        }
        const [y, m, day] = this.data.dateStr.split('-').map(Number);
        const at = new Date(y, m - 1, day, 12, 0, 0, 0).getTime();
        (0, storage_1.updateTransaction)(this.data.id, {
            amountFen: fen,
            type: this.data.txType,
            categoryId: this.data.categoryId,
            note: this.data.note.trim(),
            occurredAt: at,
        });
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => wx.navigateBack({ delta: 1 }), 400);
    },
    onDelete() {
        wx.showModal({
            title: '确认删除',
            content: '删除后不可恢复',
            success: (res) => {
                if (res.confirm) {
                    (0, storage_1.removeTransaction)(this.data.id);
                    wx.showToast({ title: '已删除', icon: 'none' });
                    setTimeout(() => wx.navigateBack({ delta: 1 }), 400);
                }
            },
        });
    },
});
