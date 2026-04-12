import type { Transaction } from '../../utils/types';
import { fenToYuan, formatDate } from '../../utils/format';
import {
  getCurrentBookId,
  loadCategories,
  loadLedgers,
  loadTransactions,
  setCurrentBookId,
} from '../../utils/storage';
import { pullLatestForPageOrBlock, resolveConflictIfNeeded } from '../../utils/sync';

interface RowVM {
  id: string;
  categoryName: string;
  note: string;
  type: 'income' | 'expense';
  amountYuan: string;
}

interface GroupVM {
  dateKey: string;
  dateLabel: string;
  items: RowVM[];
  incomeTotalYuan: string;
  expenseTotalYuan: string;
}

interface MonthGroupVM {
  monthKey: string;
  monthLabel: string;
  expanded: boolean;
  dayGroups: GroupVM[];
  incomeTotalYuan: string;
  expenseTotalYuan: string;
}

function monthKeyFromTs(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  return `${y}-${m}`;
}

function monthLabelFromKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${y}年${m}月`;
}

function uniqueMonthKeysFromTxs(txs: Transaction[]): string[] {
  const set = new Set<string>();
  for (const t of txs) {
    set.add(monthKeyFromTs(t.occurredAt));
  }
  return [...set].sort((a, b) => (a > b ? -1 : 1));
}

Page({
  data: {
    ledgerNames: [] as string[],
    ledgerIndex: 0,
    ledgerDisplay: '',
    typeIndex: 0,
    typeLabelDisplay: '全部',
    filterLabelDisplay: '全部',
    monthFilterDisplay: '全部时间',
    filterType: 'all' as 'all' | 'income' | 'expense',
    filterLabels: ['全部'],
    filterIndex: 0,
    filterCategoryId: '' as string,
    monthFilterLabels: ['全部时间'],
    monthFilterKeys: [''] as string[],
    monthFilterIndex: 0,
    filterMonth: '' as string,
    monthGroups: [] as MonthGroupVM[],
  },

  async onShow() {
    const conflictRes = await resolveConflictIfNeeded('流水');
    if (!conflictRes.ok) return;
    const syncRes = await pullLatestForPageOrBlock('流水');
    if (!syncRes.ok) return;
    this.syncLedgerPicker();
    this.buildList();
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
        this.buildList();
      }
    );
  },

  onTypeSegmentTap(e: WechatMiniprogram.TouchEvent) {
    const raw = e.currentTarget.dataset.index;
    const idx = typeof raw === 'number' ? raw : Number(raw);
    if (idx < 0 || idx > 2 || Number.isNaN(idx)) return;
    const types: ('all' | 'income' | 'expense')[] = ['all', 'income', 'expense'];
    this.setData({ typeIndex: idx, filterType: types[idx] ?? 'all' }, () => {
      this.buildList();
    });
  },

  onFilterChange(e: WechatMiniprogram.PickerChange) {
    const idx = Number(e.detail.value);
    const cats = loadCategories();
    const id = idx === 0 ? '' : cats[idx - 1]?.id || '';
    this.setData({ filterIndex: idx, filterCategoryId: id }, () => {
      this.buildList();
    });
  },

  onMonthFilterChange(e: WechatMiniprogram.PickerChange) {
    const idx = Number(e.detail.value);
    const keys = this.data.monthFilterKeys;
    const k = keys[idx] ?? '';
    this.setData({ monthFilterIndex: idx, filterMonth: k }, () => {
      this.buildList();
    });
  },

  buildList() {
    const cats = loadCategories();
    const labels = ['全部', ...cats.map((c) => `${c.name}(${c.type === 'income' ? '收' : '支'})`)];
    const catMap = new Map(cats.map((c) => [c.id, c.name]));

    const allTxs = loadTransactions();
    const monthKeysSorted = uniqueMonthKeysFromTxs(allTxs);
    const monthFilterKeys = ['', ...monthKeysSorted];
    const monthFilterLabels = ['全部时间', ...monthKeysSorted.map(monthLabelFromKey)];

    let filterMonth = this.data.filterMonth;
    let monthFilterIndex = 0;
    if (filterMonth && monthFilterKeys.includes(filterMonth)) {
      monthFilterIndex = monthFilterKeys.indexOf(filterMonth);
    } else {
      filterMonth = '';
      monthFilterIndex = 0;
    }

    let txs = allTxs;
    const fid = this.data.filterCategoryId;
    if (fid) txs = txs.filter((t) => t.categoryId === fid);

    const ft = this.data.filterType;
    if (ft === 'income') txs = txs.filter((t) => t.type === 'income');
    else if (ft === 'expense') txs = txs.filter((t) => t.type === 'expense');

    if (filterMonth) {
      txs = txs.filter((t) => monthKeyFromTs(t.occurredAt) === filterMonth);
    }

    const groupMap = new Map<string, RowVM[]>();
    const daySumFen = new Map<string, { incomeFen: number; expenseFen: number }>();
    for (const t of txs) {
      const dk = formatDate(t.occurredAt);
      const row: RowVM = {
        id: t.id,
        categoryName: catMap.get(t.categoryId) || '未分类',
        note: t.note,
        type: t.type,
        amountYuan: fenToYuan(t.amountFen),
      };
      if (!groupMap.has(dk)) groupMap.set(dk, []);
      groupMap.get(dk)!.push(row);

      if (!daySumFen.has(dk)) {
        daySumFen.set(dk, { incomeFen: 0, expenseFen: 0 });
      }
      const s = daySumFen.get(dk)!;
      if (t.type === 'income') s.incomeFen += t.amountFen;
      else s.expenseFen += t.amountFen;
    }

    const dayKeys = [...groupMap.keys()].sort((a, b) => (a > b ? -1 : 1));
    const dayGroups: GroupVM[] = dayKeys.map((dateKey) => {
      const s = daySumFen.get(dateKey)!;
      return {
        dateKey,
        dateLabel: dateKey,
        items: groupMap.get(dateKey)!,
        incomeTotalYuan: fenToYuan(s.incomeFen),
        expenseTotalYuan: fenToYuan(s.expenseFen),
      };
    });

    const monthMap = new Map<string, GroupVM[]>();
    for (const dg of dayGroups) {
      const mk = dg.dateKey.slice(0, 7);
      if (!monthMap.has(mk)) monthMap.set(mk, []);
      monthMap.get(mk)!.push(dg);
    }

    const monthOrder = [...monthMap.keys()].sort((a, b) => (a > b ? -1 : 1));
    const prevExpanded = new Map(
      (this.data.monthGroups || []).map((m) => [m.monthKey, m.expanded])
    );
    const monthGroups: MonthGroupVM[] = monthOrder.map((monthKey) => {
      const dgs = monthMap.get(monthKey)!;
      let incomeFen = 0;
      let expenseFen = 0;
      for (const dg of dgs) {
        const s = daySumFen.get(dg.dateKey)!;
        incomeFen += s.incomeFen;
        expenseFen += s.expenseFen;
      }
      return {
        monthKey,
        monthLabel: monthLabelFromKey(monthKey),
        expanded: prevExpanded.has(monthKey) ? prevExpanded.get(monthKey)! : true,
        dayGroups: dgs,
        incomeTotalYuan: fenToYuan(incomeFen),
        expenseTotalYuan: fenToYuan(expenseFen),
      };
    });

    let filterIndex = this.data.filterIndex;
    if (filterIndex >= labels.length) filterIndex = 0;

    let typeIndex = this.data.typeIndex;
    if (typeIndex < 0 || typeIndex > 2) typeIndex = 0;

    const typeLabelsConst = ['全部', '收入', '支出'] as const;
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

  onMonthToggle(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as string;
    if (!key) return;
    const monthGroups = this.data.monthGroups.map((m) =>
      m.monthKey === key ? { ...m, expanded: !m.expanded } : m
    );
    this.setData({ monthGroups });
  },

  onRowTap(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (id) {
      wx.navigateTo({ url: `/pages/transaction-edit/transaction-edit?id=${id}` });
    }
  },
});
