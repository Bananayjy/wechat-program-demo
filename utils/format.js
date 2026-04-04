"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fenToYuan = fenToYuan;
exports.formatDate = formatDate;
exports.formatDateTime = formatDateTime;
exports.yuanInputToFen = yuanInputToFen;
/** 分转元字符串，保留两位小数 */
function fenToYuan(fen) {
    const n = Math.round(fen) / 100;
    return n.toFixed(2);
}
function formatDate(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function formatDateTime(ts) {
    const d = new Date(ts);
    const h = `${d.getHours()}`.padStart(2, '0');
    const min = `${d.getMinutes()}`.padStart(2, '0');
    return `${formatDate(ts)} ${h}:${min}`;
}
/** 解析用户输入为元，再转分 */
function yuanInputToFen(yuanStr) {
    const s = yuanStr.trim().replace(/[^\d.]/g, '');
    if (!s)
        return null;
    const n = parseFloat(s);
    if (Number.isNaN(n) || n < 0)
        return null;
    if (n > 99999999.99)
        return null;
    return Math.round(n * 100);
}
