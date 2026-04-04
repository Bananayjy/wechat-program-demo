import { formatDate, yuanInputToFen } from '../../utils/format';

/** 计算器按键拼接金额，与 yuanInputToFen 上限一致 */
function appendCalcKey(amountYuan: string, key: string): string {
  let s = amountYuan;
  if (key === 'clear') return '';
  if (key === 'del') return s.slice(0, -1);
  if (key === '.') {
    if (s.includes('.')) return s;
    return s === '' ? '0.' : s + '.';
  }
  if (!/^\d$/.test(key)) return s;
  const parts = s.split('.');
  if (parts.length === 2 && parts[1].length >= 2) return s;
  if (s === '') return key;
  if (s === '0') return key;
  const next = s + key;
  const n = parseFloat(next);
  if (Number.isNaN(n) || n > 99999999.99) return s;
  return next;
}
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

  onShow() {
    this.applyCategories(this.data.txType);
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

  onCalcKey(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as string;
    if (!key) return;
    const next = appendCalcKey(this.data.amountYuan, key);
    this.setData({ amountYuan: next });
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
