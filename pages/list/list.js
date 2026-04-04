"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const format_1 = require("../../utils/format");
const storage_1 = require("../../utils/storage");
Page({
    data: {
        filterLabels: ['全部'],
        filterIndex: 0,
        filterCategoryId: '',
        groups: [],
    },
    onShow() {
        this.buildList();
    },
    onFilterChange(e) {
        var _a;
        const idx = Number(e.detail.value);
        const cats = (0, storage_1.loadCategories)();
        const labels = ['全部', ...cats.map((c) => `${c.name}(${c.type === 'income' ? '收' : '支'})`)];
        const id = idx === 0 ? '' : ((_a = cats[idx - 1]) === null || _a === void 0 ? void 0 : _a.id) || '';
        this.setData({ filterIndex: idx, filterCategoryId: id });
        this.buildList();
    },
    buildList() {
        const cats = (0, storage_1.loadCategories)();
        const labels = ['全部', ...cats.map((c) => `${c.name}(${c.type === 'income' ? '收' : '支'})`)];
        const catMap = new Map(cats.map((c) => [c.id, c.name]));
        let txs = (0, storage_1.loadTransactions)();
        const fid = this.data.filterCategoryId;
        if (fid)
            txs = txs.filter((t) => t.categoryId === fid);
        const groupMap = new Map();
        for (const t of txs) {
            const dk = (0, format_1.formatDate)(t.occurredAt);
            const row = {
                id: t.id,
                categoryName: catMap.get(t.categoryId) || '未分类',
                note: t.note,
                type: t.type,
                amountYuan: (0, format_1.fenToYuan)(t.amountFen),
            };
            if (!groupMap.has(dk))
                groupMap.set(dk, []);
            groupMap.get(dk).push(row);
        }
        const keys = [...groupMap.keys()].sort((a, b) => (a > b ? -1 : 1));
        const groups = keys.map((dateKey) => ({
            dateKey,
            dateLabel: dateKey,
            items: groupMap.get(dateKey),
        }));
        let filterIndex = this.data.filterIndex;
        if (filterIndex >= labels.length)
            filterIndex = 0;
        this.setData({
            filterLabels: labels,
            filterIndex,
            groups,
        });
    },
    onRowTap(e) {
        const id = e.currentTarget.dataset.id;
        if (id) {
            wx.navigateTo({ url: `/pages/transaction-edit/transaction-edit?id=${id}` });
        }
    },
});
