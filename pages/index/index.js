"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const format_1 = require("../../utils/format");
const storage_1 = require("../../utils/storage");
const sync_1 = require("../../utils/sync");
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
function top3ByCategory(txs, catName, inRange, type) {
    const map = new Map();
    for (const t of txs) {
        if (!inRange(t))
            continue;
        if (t.type !== type)
            continue;
        map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amountFen);
    }
    return [...map.entries()]
        .map(([id, fen]) => ({
        id,
        name: catName.get(id) || '未分类',
        fen,
    }))
        .sort((a, b) => b.fen - a.fen)
        .slice(0, 3)
        .map(({ id, name, fen }) => ({
        id,
        name,
        amount: (0, format_1.fenToYuan)(fen),
    }));
}
function buildSlideForBook(bookId, bookName, now) {
    const dayStart = startOfDay(now);
    const monthStart = startOfMonth(now);
    const txs = (0, storage_1.loadTransactionsForBook)(bookId);
    const cats = (0, storage_1.loadCategoriesForBook)(bookId);
    const catName = new Map(cats.map((c) => [c.id, c.name]));
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
    const dayInRange = (t) => t.occurredAt >= dayStart;
    const monthInRange = (t) => t.occurredAt >= monthStart;
    return {
        bookId,
        bookName,
        todayIncome: (0, format_1.fenToYuan)(ti),
        todayExpense: (0, format_1.fenToYuan)(te),
        monthIncome: (0, format_1.fenToYuan)(mi),
        monthExpense: (0, format_1.fenToYuan)(me),
        todayRankIncome: top3ByCategory(txs, catName, dayInRange, 'income'),
        todayRankExpense: top3ByCategory(txs, catName, dayInRange, 'expense'),
        monthRankIncome: top3ByCategory(txs, catName, monthInRange, 'income'),
        monthRankExpense: top3ByCategory(txs, catName, monthInRange, 'expense'),
    };
}
Page({
    data: {
        bookSlides: [],
        bookSwiperIndex: 0,
    },
    async onShow() {
        const conflictRes = await (0, sync_1.resolveConflictIfNeeded)('首页');
        if (!conflictRes.ok)
            return;
        const syncRes = await (0, sync_1.pullLatestForPageOrBlock)('首页');
        if (!syncRes.ok)
            return;
        this.refresh();
    },
    refresh() {
        const now = Date.now();
        const ledgers = (0, storage_1.loadLedgers)();
        const bookSlides = ledgers.map((l) => buildSlideForBook(l.id, l.name, now));
        const cur = (0, storage_1.getCurrentBookId)();
        let bookSwiperIndex = bookSlides.findIndex((b) => b.bookId === cur);
        if (bookSwiperIndex < 0)
            bookSwiperIndex = 0;
        this.setData({ bookSlides, bookSwiperIndex });
    },
    onBookSwiperChange(e) {
        var _a;
        const idx = e.detail.current;
        const slides = this.data.bookSlides;
        const id = (_a = slides[idx]) === null || _a === void 0 ? void 0 : _a.bookId;
        if (id)
            (0, storage_1.setCurrentBookId)(id);
    },
    goAdd() {
        wx.navigateTo({ url: '/pages/add/add' });
    },
});
