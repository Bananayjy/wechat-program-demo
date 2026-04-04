import { fenToYuan } from '../../utils/format';
import {
  getCurrentBookId,
  loadCategories,
  loadLedgers,
  loadTransactions,
  setCurrentBookId,
} from '../../utils/storage';

interface BarVM {
  id: string;
  name: string;
  yuan: string;
  pct: number;
}

function monthRange(ym: string): { start: number; end: number } {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0).getTime();
  const end = new Date(y, m, 0, 23, 59, 59, 999).getTime();
  return { start, end };
}

Page({
  data: {
    ledgerNames: [] as string[],
    ledgerIndex: 0,
    ledgerDisplay: '',
    monthStr: '',
    incomeYuan: '0.00',
    expenseYuan: '0.00',
    incomeBars: [] as BarVM[],
    expenseBars: [] as BarVM[],
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
    const ledgers = loadLedgers();
    const names = ledgers.map((l) => l.name);
    const cur = getCurrentBookId();
    let ledgerIndex = ledgers.findIndex((l) => l.id === cur);
    if (ledgerIndex < 0) ledgerIndex = 0;
    const ledgerDisplay = names[ledgerIndex] ?? '';
    this.setData({ ledgerNames: names, ledgerIndex, ledgerDisplay });
  },

  onLedgerChange(e: WechatMiniprogram.PickerChange) {
    const idx = Number(e.detail.value);
    const ledgers = loadLedgers();
    const l = ledgers[idx];
    if (!l) return;
    setCurrentBookId(l.id);
    this.setData(
      {
        ledgerIndex: idx,
        ledgerDisplay: l.name,
      },
      () => {
        this.compute();
      }
    );
  },

  onMonthChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ monthStr: e.detail.value as string });
    this.compute();
  },

  compute() {
    const { start, end } = monthRange(this.data.monthStr);
    const cats = loadCategories();
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const txs = loadTransactions().filter(
      (t) => t.occurredAt >= start && t.occurredAt <= end
    );

    let incomeFen = 0;
    let expenseFen = 0;
    const incMap = new Map<string, number>();
    const expMap = new Map<string, number>();

    for (const t of txs) {
      if (t.type === 'income') {
        incomeFen += t.amountFen;
        const k = t.categoryId;
        incMap.set(k, (incMap.get(k) || 0) + t.amountFen);
      } else {
        expenseFen += t.amountFen;
        const k = t.categoryId;
        expMap.set(k, (expMap.get(k) || 0) + t.amountFen);
      }
    }

    const toBars = (m: Map<string, number>, total: number): BarVM[] => {
      if (total === 0) return [];
      const arr: BarVM[] = [];
      for (const [id, fen] of m) {
        arr.push({
          id,
          name: catName.get(id) || '未分类',
          yuan: fenToYuan(fen),
          pct: Math.round((fen / total) * 100),
        });
      }
      arr.sort((a, b) => b.pct - a.pct);
      return arr;
    };

    this.setData({
      incomeYuan: fenToYuan(incomeFen),
      expenseYuan: fenToYuan(expenseFen),
      incomeBars: toBars(incMap, incomeFen),
      expenseBars: toBars(expMap, expenseFen),
    });
  },
});
