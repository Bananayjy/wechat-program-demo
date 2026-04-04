"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionsToCsv = transactionsToCsv;
const format_1 = require("./format");
function transactionsToCsv(txs, categories) {
    const map = new Map(categories.map((c) => [c.id, c.name]));
    const header = '时间,类型,分类,金额(元),备注';
    const lines = txs.map((t) => {
        const typeLabel = t.type === 'income' ? '收入' : '支出';
        const cat = map.get(t.categoryId) || '';
        const amount = (0, format_1.fenToYuan)(t.amountFen);
        const note = (t.note || '').replace(/"/g, '""');
        return `"${(0, format_1.formatDateTime)(t.occurredAt)}","${typeLabel}","${cat}","${amount}","${note}"`;
    });
    return '\uFEFF' + header + '\n' + lines.join('\n');
}
