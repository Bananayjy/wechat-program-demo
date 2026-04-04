"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const format_1 = require("../../utils/format");
const storage_1 = require("../../utils/storage");
function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}
function startOfMonth(ts) {
    const d = new Date(ts);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}
Page({
    data: {
        todayIncome: '0.00',
        todayExpense: '0.00',
        monthIncome: '0.00',
        monthExpense: '0.00',
    },
    onShow() {
        this.refresh();
    },
    refresh() {
        const now = Date.now();
        const dayStart = startOfDay(now);
        const monthStart = startOfMonth(now);
        const txs = (0, storage_1.loadTransactions)();
        let ti = 0;
        let te = 0;
        let mi = 0;
        let me = 0;
        for (const t of txs) {
            if (t.occurredAt < monthStart)
                continue;
            if (t.type === 'income')
                mi += t.amountFen;
            else
                me += t.amountFen;
            if (t.occurredAt >= dayStart) {
                if (t.type === 'income')
                    ti += t.amountFen;
                else
                    te += t.amountFen;
            }
        }
        this.setData({
            todayIncome: (0, format_1.fenToYuan)(ti),
            todayExpense: (0, format_1.fenToYuan)(te),
            monthIncome: (0, format_1.fenToYuan)(mi),
            monthExpense: (0, format_1.fenToYuan)(me),
        });
    },
    goAdd() {
        wx.navigateTo({ url: '/pages/add/add' });
    },
});
