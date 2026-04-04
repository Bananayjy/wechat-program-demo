"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const format_1 = require("../../utils/format");
/** 计算器按键拼接金额，与 yuanInputToFen 上限一致 */
function appendCalcKey(amountYuan, key) {
    let s = amountYuan;
    if (key === 'clear')
        return '';
    if (key === 'del')
        return s.slice(0, -1);
    if (key === '.') {
        if (s.includes('.'))
            return s;
        return s === '' ? '0.' : s + '.';
    }
    if (!/^\d$/.test(key))
        return s;
    const parts = s.split('.');
    if (parts.length === 2 && parts[1].length >= 2)
        return s;
    if (s === '')
        return key;
    if (s === '0')
        return key;
    const next = s + key;
    const n = parseFloat(next);
    if (Number.isNaN(n) || n > 99999999.99)
        return s;
    return next;
}
const storage_1 = require("../../utils/storage");
Page({
    data: {
        txType: 'expense',
        amountYuan: '',
        categoryId: '',
        filteredCategories: [],
        dateStr: '',
        note: '',
    },
    onLoad() {
        const d = new Date();
        this.setData({ dateStr: (0, format_1.formatDate)(d.getTime()) });
        this.applyCategories('expense');
    },
    onShow() {
        this.applyCategories(this.data.txType);
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
        const first = ((_a = all[0]) === null || _a === void 0 ? void 0 : _a.id) || '';
        this.setData({
            filteredCategories: all,
            categoryId: all.some((c) => c.id === this.data.categoryId)
                ? this.data.categoryId
                : first,
        });
    },
    onCalcKey(e) {
        const key = e.currentTarget.dataset.key;
        if (!key)
            return;
        const next = appendCalcKey(this.data.amountYuan, key);
        this.setData({ amountYuan: next });
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
        (0, storage_1.addTransaction)({
            amountFen: fen,
            type: this.data.txType,
            categoryId: this.data.categoryId,
            note: this.data.note.trim(),
            occurredAt: at,
        });
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => {
            wx.navigateBack({ delta: 1 });
        }, 400);
    },
});
