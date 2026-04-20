"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ROUTE_MAP = {
    expense: '/pages/category-expense/category-expense',
    income: '/pages/category-income/category-income',
};
Page({
    data: {
        activeType: 'expense',
    },
    onLoad(q) {
        const type = q.type;
        if (type === 'income' || type === 'expense') {
            this.setData({ activeType: type });
        }
    },
    onTypeTap(e) {
        const type = e.currentTarget.dataset.type;
        if (!type || !ROUTE_MAP[type])
            return;
        this.setData({ activeType: type });
        wx.navigateTo({ url: ROUTE_MAP[type] });
    },
});
