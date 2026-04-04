import { fenToYuan, formatDateTime } from './format';
import type { Category, Transaction } from './types';

export function transactionsToCsv(
  txs: Transaction[],
  categories: Category[]
): string {
  const map = new Map(categories.map((c) => [c.id, c.name]));
  const header = '时间,类型,分类,金额(元),备注';
  const lines = txs.map((t) => {
    const typeLabel = t.type === 'income' ? '收入' : '支出';
    const cat = map.get(t.categoryId) || '';
    const amount = fenToYuan(t.amountFen);
    const note = (t.note || '').replace(/"/g, '""');
    return `"${formatDateTime(t.occurredAt)}","${typeLabel}","${cat}","${amount}","${note}"`;
  });
  return '\uFEFF' + header + '\n' + lines.join('\n');
}
