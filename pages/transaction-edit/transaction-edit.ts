import { fenToYuan, formatDate, yuanInputToFen } from '../../utils/format';
import {
  loadCategories,
  loadTransactions,
  removeTransaction,
  updateTransaction,
} from '../../utils/storage';
import type { TxType } from '../../utils/types';

Page({
  data: {
    loaded: false,
    id: '',
    txType: 'expense' as TxType,
    amountYuan: '',
    categoryId: '',
    filteredCategories: [] as { id: string; name: string }[],
    dateStr: '',
    note: '',
  },

  onLoad(q: Record<string, string | undefined>) {
    const id = q.id || '';
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    const txs = loadTransactions();
    const t = txs.find((x) => x.id === id);
    if (!t) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      return;
    }
    this.setData({
      loaded: true,
      id: t.id,
      txType: t.type,
      amountYuan: fenToYuan(t.amountFen),
      categoryId: t.categoryId,
      dateStr: formatDate(t.occurredAt),
      note: t.note,
    });
    this.applyCategories(t.type);
    const cats = loadCategories().filter((c) => c.type === t.type);
    if (!cats.some((c) => c.id === t.categoryId)) {
      const first = cats[0]?.id || '';
      this.setData({ categoryId: first });
    }
  },

  onTypeTap(e: WechatMiniprogram.TouchEvent) {
    const type = e.currentTarget.dataset.type as TxType;
    if (!type) return;
    this.setData({ txType: type });
    this.applyCategories(type);
  },

  applyCategories(type: TxType) {
    const all = loadCategories().filter((c) => c.type === type);
    const cid = this.data.categoryId;
    const next =
      all.some((c) => c.id === cid) ? cid : all[0]?.id || '';
    this.setData({
      filteredCategories: all,
      categoryId: next,
    });
  },

  onAmountInput(e: WechatMiniprogram.Input) {
    this.setData({ amountYuan: e.detail.value });
  },

  onCategoryTap(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (id) this.setData({ categoryId: id });
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ dateStr: e.detail.value as string });
  },

  onNoteInput(e: WechatMiniprogram.Input) {
    this.setData({ note: e.detail.value });
  },

  onSave() {
    const fen = yuanInputToFen(this.data.amountYuan);
    if (fen === null || fen === 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }
    if (!this.data.categoryId) {
      wx.showToast({ title: '请选择分类', icon: 'none' });
      return;
    }
    const [y, m, day] = this.data.dateStr.split('-').map(Number);
    const at = new Date(y, m - 1, day, 12, 0, 0, 0).getTime();
    updateTransaction(this.data.id, {
      amountFen: fen,
      type: this.data.txType,
      categoryId: this.data.categoryId,
      note: this.data.note.trim(),
      occurredAt: at,
    });
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack({ delta: 1 }), 400);
  },

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复',
      success: (res) => {
        if (res.confirm) {
          removeTransaction(this.data.id);
          wx.showToast({ title: '已删除', icon: 'none' });
          setTimeout(() => wx.navigateBack({ delta: 1 }), 400);
        }
      },
    });
  },
});
