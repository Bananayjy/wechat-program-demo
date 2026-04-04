import { fenToYuan, formatDate } from '../../utils/format';
import { loadCategories, loadTransactions } from '../../utils/storage';

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
}

Page({
  data: {
    filterLabels: ['全部'],
    filterIndex: 0,
    filterCategoryId: '' as string,
    groups: [] as GroupVM[],
  },

  onShow() {
    this.buildList();
  },

  onFilterChange(e: WechatMiniprogram.PickerChange) {
    const idx = Number(e.detail.value);
    const cats = loadCategories();
    const labels = ['全部', ...cats.map((c) => `${c.name}(${c.type === 'income' ? '收' : '支'})`)];
    const id = idx === 0 ? '' : cats[idx - 1]?.id || '';
    this.setData({ filterIndex: idx, filterCategoryId: id });
    this.buildList();
  },

  buildList() {
    const cats = loadCategories();
    const labels = ['全部', ...cats.map((c) => `${c.name}(${c.type === 'income' ? '收' : '支'})`)];
    const catMap = new Map(cats.map((c) => [c.id, c.name]));
    let txs = loadTransactions();
    const fid = this.data.filterCategoryId;
    if (fid) txs = txs.filter((t) => t.categoryId === fid);

    const groupMap = new Map<string, RowVM[]>();
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
    }

    const keys = [...groupMap.keys()].sort((a, b) => (a > b ? -1 : 1));
    const groups: GroupVM[] = keys.map((dateKey) => ({
      dateKey,
      dateLabel: dateKey,
      items: groupMap.get(dateKey)!,
    }));

    let filterIndex = this.data.filterIndex;
    if (filterIndex >= labels.length) filterIndex = 0;

    this.setData({
      filterLabels: labels,
      filterIndex,
      groups,
    });
  },

  onRowTap(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (id) {
      wx.navigateTo({ url: `/pages/transaction-edit/transaction-edit?id=${id}` });
    }
  },
});
