import type { TxType } from '../../utils/types';

const ROUTE_MAP: Record<TxType, string> = {
  expense: '/pages/category-expense/category-expense',
  income: '/pages/category-income/category-income',
};

Page({
  data: {
    activeType: 'expense' as TxType,
  },

  onLoad(q: Record<string, string | undefined>) {
    const type = q.type;
    if (type === 'income' || type === 'expense') {
      this.setData({ activeType: type });
    }
  },

  onTypeTap(e: WechatMiniprogram.TouchEvent) {
    const type = e.currentTarget.dataset.type as TxType;
    if (!type || !ROUTE_MAP[type]) return;
    this.setData({ activeType: type });
    wx.navigateTo({ url: ROUTE_MAP[type] });
  },
});
