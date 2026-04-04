import { formatDate, yuanInputToFen } from '../../utils/format';
import { addTransaction, loadCategories } from '../../utils/storage';
import type { TxType } from '../../utils/types';

Page({
  data: {
    txType: 'expense' as TxType,
    amountYuan: '',
    categoryId: '',
    filteredCategories: [] as { id: string; name: string }[],
    dateStr: '',
    note: '',
  },

  onLoad() {
    const d = new Date();
    this.setData({ dateStr: formatDate(d.getTime()) });
    this.applyCategories('expense');
  },

  onTypeTap(e: WechatMiniprogram.TouchEvent) {
    const type = e.currentTarget.dataset.type as TxType;
    if (!type) return;
    this.setData({ txType: type });
    this.applyCategories(type);
  },

  applyCategories(type: TxType) {
    const all = loadCategories().filter((c) => c.type === type);
    const first = all[0]?.id || '';
    this.setData({
      filteredCategories: all,
      categoryId: all.some((c) => c.id === this.data.categoryId)
        ? this.data.categoryId
        : first,
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
    addTransaction({
      amountFen: fen,
      type: this.data.txType,
      categoryId: this.data.categoryId,
      note: this.data.note.trim(),
      occurredAt: at,
    });
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 400);
  },
});
