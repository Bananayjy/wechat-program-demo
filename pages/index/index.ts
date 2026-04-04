import { fenToYuan } from '../../utils/format';
import type { Transaction } from '../../utils/types';
import {
  getCurrentBookId,
  loadCategoriesForBook,
  loadLedgers,
  loadTransactionsForBook,
  setCurrentBookId,
} from '../../utils/storage';

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonth(ts: number): number {
  const d = new Date(ts);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

interface RankRow {
  id: string;
  name: string;
  amount: string;
}

interface BookSlideVM {
  bookId: string;
  bookName: string;
  todayIncome: string;
  todayExpense: string;
  monthIncome: string;
  monthExpense: string;
  todayRankIncome: RankRow[];
  todayRankExpense: RankRow[];
  monthRankIncome: RankRow[];
  monthRankExpense: RankRow[];
}

function top3ByCategory(
  txs: Transaction[],
  catName: Map<string, string>,
  inRange: (t: Transaction) => boolean,
  type: 'income' | 'expense'
): RankRow[] {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (!inRange(t)) continue;
    if (t.type !== type) continue;
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
      amount: fenToYuan(fen),
    }));
}

function buildSlideForBook(bookId: string, bookName: string, now: number): BookSlideVM {
  const dayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const txs = loadTransactionsForBook(bookId);
  const cats = loadCategoriesForBook(bookId);
  const catName = new Map(cats.map((c) => [c.id, c.name]));

  let ti = 0;
  let te = 0;
  let mi = 0;
  let me = 0;
  for (const t of txs) {
    if (t.occurredAt < monthStart) continue;
    if (t.type === 'income') mi += t.amountFen;
    else me += t.amountFen;
    if (t.occurredAt >= dayStart) {
      if (t.type === 'income') ti += t.amountFen;
      else te += t.amountFen;
    }
  }

  const dayInRange = (t: Transaction) => t.occurredAt >= dayStart;
  const monthInRange = (t: Transaction) => t.occurredAt >= monthStart;

  return {
    bookId,
    bookName,
    todayIncome: fenToYuan(ti),
    todayExpense: fenToYuan(te),
    monthIncome: fenToYuan(mi),
    monthExpense: fenToYuan(me),
    todayRankIncome: top3ByCategory(txs, catName, dayInRange, 'income'),
    todayRankExpense: top3ByCategory(txs, catName, dayInRange, 'expense'),
    monthRankIncome: top3ByCategory(txs, catName, monthInRange, 'income'),
    monthRankExpense: top3ByCategory(txs, catName, monthInRange, 'expense'),
  };
}

Page({
  data: {
    bookSlides: [] as BookSlideVM[],
    bookSwiperIndex: 0,
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const now = Date.now();
    const ledgers = loadLedgers();
    const bookSlides = ledgers.map((l) => buildSlideForBook(l.id, l.name, now));
    const cur = getCurrentBookId();
    let bookSwiperIndex = bookSlides.findIndex((b) => b.bookId === cur);
    if (bookSwiperIndex < 0) bookSwiperIndex = 0;
    this.setData({ bookSlides, bookSwiperIndex });
  },

  onBookSwiperChange(e: WechatMiniprogram.SwiperChange) {
    const idx = e.detail.current;
    const slides = this.data.bookSlides;
    const id = slides[idx]?.bookId;
    if (id) setCurrentBookId(id);
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' });
  },
});
