import { fenToYuan } from '../../utils/format';
import type { Transaction } from '../../utils/types';
import { loadCategories, loadTransactions } from '../../utils/storage';

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

Page({
  data: {
    todayIncome: '0.00',
    todayExpense: '0.00',
    monthIncome: '0.00',
    monthExpense: '0.00',
    todayRankIncome: [] as RankRow[],
    todayRankExpense: [] as RankRow[],
    monthRankIncome: [] as RankRow[],
    monthRankExpense: [] as RankRow[],
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const now = Date.now();
    const dayStart = startOfDay(now);
    const monthStart = startOfMonth(now);
    const txs = loadTransactions();
    const cats = loadCategories();
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

    this.setData({
      todayIncome: fenToYuan(ti),
      todayExpense: fenToYuan(te),
      monthIncome: fenToYuan(mi),
      monthExpense: fenToYuan(me),
      todayRankIncome: top3ByCategory(txs, catName, dayInRange, 'income'),
      todayRankExpense: top3ByCategory(txs, catName, dayInRange, 'expense'),
      monthRankIncome: top3ByCategory(txs, catName, monthInRange, 'income'),
      monthRankExpense: top3ByCategory(txs, catName, monthInRange, 'expense'),
    });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' });
  },
});
