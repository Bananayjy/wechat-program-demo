"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const format_1 = require("../../utils/format");
const storage_1 = require("../../utils/storage");
function monthRange(ym) {
    const [y, m] = ym.split('-').map(Number);
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0).getTime();
    const end = new Date(y, m, 0, 23, 59, 59, 999).getTime();
    return { start, end };
}
Page({
    data: {
        ledgerNames: [],
        ledgerIndex: 0,
        ledgerDisplay: '',
        monthStr: '',
        incomeYuan: '0.00',
        expenseYuan: '0.00',
        incomeBars: [],
        expenseBars: [],
    },
    onShow() {
        if (!this.data.monthStr) {
            const d = new Date();
            const ms = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`;
            this.setData({ monthStr: ms });
        }
        this.syncLedgerPicker();
        this.compute();
    },
    syncLedgerPicker() {
        var _a;
        const ledgers = (0, storage_1.loadLedgers)();
        const names = ledgers.map((l) => l.name);
        const cur = (0, storage_1.getCurrentBookId)();
        let ledgerIndex = ledgers.findIndex((l) => l.id === cur);
        if (ledgerIndex < 0)
            ledgerIndex = 0;
        const ledgerDisplay = (_a = names[ledgerIndex]) !== null && _a !== void 0 ? _a : '';
        this.setData({ ledgerNames: names, ledgerIndex, ledgerDisplay });
    },
    onLedgerChange(e) {
        const idx = Number(e.detail.value);
        const ledgers = (0, storage_1.loadLedgers)();
        const l = ledgers[idx];
        if (!l)
            return;
        (0, storage_1.setCurrentBookId)(l.id);
        this.setData({
            ledgerIndex: idx,
            ledgerDisplay: l.name,
        }, () => {
            this.compute();
        });
    },
    onMonthChange(e) {
        this.setData({ monthStr: e.detail.value });
        this.compute();
    },
    compute() {
        const { start, end } = monthRange(this.data.monthStr);
        const cats = (0, storage_1.loadCategories)();
        const catName = new Map(cats.map((c) => [c.id, c.name]));
        const txs = (0, storage_1.loadTransactions)().filter((t) => t.occurredAt >= start && t.occurredAt <= end);
        let incomeFen = 0;
        let expenseFen = 0;
        const incMap = new Map();
        const expMap = new Map();
        for (const t of txs) {
            if (t.type === 'income') {
                incomeFen += t.amountFen;
                const k = t.categoryId;
                incMap.set(k, (incMap.get(k) || 0) + t.amountFen);
            }
            else {
                expenseFen += t.amountFen;
                const k = t.categoryId;
                expMap.set(k, (expMap.get(k) || 0) + t.amountFen);
            }
        }
        const toBars = (m, total) => {
            if (total === 0)
                return [];
            const arr = [];
            for (const [id, fen] of m) {
                arr.push({
                    id,
                    name: catName.get(id) || '未分类',
                    yuan: (0, format_1.fenToYuan)(fen),
                    pct: Math.round((fen / total) * 100),
                });
            }
            arr.sort((a, b) => b.pct - a.pct);
            return arr;
        };
        this.setData({
            incomeYuan: (0, format_1.fenToYuan)(incomeFen),
            expenseYuan: (0, format_1.fenToYuan)(expenseFen),
            incomeBars: toBars(incMap, incomeFen),
            expenseBars: toBars(expMap, expenseFen),
        });
    },
});
