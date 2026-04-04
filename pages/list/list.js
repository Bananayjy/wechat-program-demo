"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const format_1 = require("../../utils/format");
const storage_1 = require("../../utils/storage");
function monthKeyFromTs(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    return `${y}-${m}`;
}
function monthLabelFromKey(key) {
    const parts = key.split('-').map(Number);
    const y = parts[0];
    const m = parts[1];
    return `${y}年${m}月`;
}
function uniqueMonthKeysFromTxs(txs) {
    const set = new Set();
    for (const t of txs) {
        set.add(monthKeyFromTs(t.occurredAt));
    }
    return [...set].sort((a, b) => (a > b ? -1 : 1));
}
Page({
    data: {
        typeIndex: 0,
        typeLabelDisplay: '全部',
        filterLabelDisplay: '全部',
        monthFilterDisplay: '全部时间',
        filterType: 'all',
        filterLabels: ['全部'],
        filterIndex: 0,
        filterCategoryId: '',
        monthFilterLabels: ['全部时间'],
        monthFilterKeys: [''],
        monthFilterIndex: 0,
        filterMonth: '',
        monthGroups: [],
    },
    onShow() {
        this.buildList();
    },
    onTypeSegmentTap(e) {
        const raw = e.currentTarget.dataset.index;
        const idx = typeof raw === 'number' ? raw : Number(raw);
        if (idx < 0 || idx > 2 || Number.isNaN(idx))
            return;
        const types = ['all', 'income', 'expense'];
        this.setData({ typeIndex: idx, filterType: types[idx] ?? 'all' }, () => {
            this.buildList();
        });
    },
    onFilterChange(e) {
        var _a;
        const idx = Number(e.detail.value);
        const cats = (0, storage_1.loadCategories)();
        const id = idx === 0 ? '' : ((_a = cats[idx - 1]) === null || _a === void 0 ? void 0 : _a.id) || '';
        this.setData({ filterIndex: idx, filterCategoryId: id }, () => {
            this.buildList();
        });
    },
    onMonthFilterChange(e) {
        const idx = Number(e.detail.value);
        const keys = this.data.monthFilterKeys;
        const k = keys[idx] ?? '';
        this.setData({ monthFilterIndex: idx, filterMonth: k }, () => {
            this.buildList();
        });
    },
    buildList() {
        const cats = (0, storage_1.loadCategories)();
        const labels = ['全部', ...cats.map((c) => `${c.name}(${c.type === 'income' ? '收' : '支'})`)];
        const catMap = new Map(cats.map((c) => [c.id, c.name]));
        const allTxs = (0, storage_1.loadTransactions)();
        const monthKeysSorted = uniqueMonthKeysFromTxs(allTxs);
        const monthFilterKeys = ['', ...monthKeysSorted];
        const monthFilterLabels = ['全部时间', ...monthKeysSorted.map(monthLabelFromKey)];
        let filterMonth = this.data.filterMonth;
        let monthFilterIndex = 0;
        if (filterMonth && monthFilterKeys.includes(filterMonth)) {
            monthFilterIndex = monthFilterKeys.indexOf(filterMonth);
        }
        else {
            filterMonth = '';
            monthFilterIndex = 0;
        }
        let txs = allTxs;
        const fid = this.data.filterCategoryId;
        if (fid)
            txs = txs.filter((t) => t.categoryId === fid);
        const ft = this.data.filterType;
        if (ft === 'income')
            txs = txs.filter((t) => t.type === 'income');
        else if (ft === 'expense')
            txs = txs.filter((t) => t.type === 'expense');
        if (filterMonth) {
            txs = txs.filter((t) => monthKeyFromTs(t.occurredAt) === filterMonth);
        }
        const groupMap = new Map();
        const daySumFen = new Map();
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
            if (!daySumFen.has(dk))
                daySumFen.set(dk, { incomeFen: 0, expenseFen: 0 });
            const s = daySumFen.get(dk);
            if (t.type === 'income')
                s.incomeFen += t.amountFen;
            else
                s.expenseFen += t.amountFen;
        }
        const dayKeys = [...groupMap.keys()].sort((a, b) => (a > b ? -1 : 1));
        const dayGroups = dayKeys.map((dateKey) => {
            const s = daySumFen.get(dateKey);
            return {
                dateKey,
                dateLabel: dateKey,
                items: groupMap.get(dateKey),
                incomeTotalYuan: (0, format_1.fenToYuan)(s.incomeFen),
                expenseTotalYuan: (0, format_1.fenToYuan)(s.expenseFen),
            };
        });
        const monthMap = new Map();
        for (const dg of dayGroups) {
            const mk = dg.dateKey.slice(0, 7);
            if (!monthMap.has(mk))
                monthMap.set(mk, []);
            monthMap.get(mk).push(dg);
        }
        const monthOrder = [...monthMap.keys()].sort((a, b) => (a > b ? -1 : 1));
        const prevExpanded = new Map((this.data.monthGroups || []).map((m) => [m.monthKey, m.expanded]));
        const monthGroups = monthOrder.map((monthKey) => {
            const dgs = monthMap.get(monthKey);
            let incomeFen = 0;
            let expenseFen = 0;
            for (const dg of dgs) {
                const s = daySumFen.get(dg.dateKey);
                incomeFen += s.incomeFen;
                expenseFen += s.expenseFen;
            }
            return {
                monthKey,
                monthLabel: monthLabelFromKey(monthKey),
                expanded: prevExpanded.has(monthKey) ? prevExpanded.get(monthKey) : true,
                dayGroups: dgs,
                incomeTotalYuan: (0, format_1.fenToYuan)(incomeFen),
                expenseTotalYuan: (0, format_1.fenToYuan)(expenseFen),
            };
        });
        let filterIndex = this.data.filterIndex;
        if (filterIndex >= labels.length)
            filterIndex = 0;
        let typeIndex = this.data.typeIndex;
        if (typeIndex < 0 || typeIndex > 2)
            typeIndex = 0;
        const typeLabelsConst = ['全部', '收入', '支出'];
        this.setData({
            monthFilterLabels,
            monthFilterKeys,
            monthFilterIndex,
            filterMonth,
            filterLabels: labels,
            filterIndex,
            typeIndex,
            typeLabelDisplay: typeLabelsConst[typeIndex] ?? '全部',
            filterLabelDisplay: labels[filterIndex] ?? '全部',
            monthFilterDisplay: monthFilterLabels[monthFilterIndex] ?? '全部时间',
            monthGroups,
        });
    },
    onMonthToggle(e) {
        const key = e.currentTarget.dataset.key;
        if (!key)
            return;
        const monthGroups = this.data.monthGroups.map((m) => (m.monthKey === key ? { ...m, expanded: !m.expanded } : m));
        this.setData({ monthGroups });
    },
    onRowTap(e) {
        const id = e.currentTarget.dataset.id;
        if (id) {
            wx.navigateTo({ url: `/pages/transaction-edit/transaction-edit?id=${id}` });
        }
    },
});
