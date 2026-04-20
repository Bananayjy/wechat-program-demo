"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCategoryIcons = getCategoryIcons;
exports.getDefaultIconKeyByType = getDefaultIconKeyByType;
exports.normalizeCategoryIconKey = normalizeCategoryIconKey;
exports.resolveCategoryIconSrc = resolveCategoryIconSrc;
exports.resolveCategoryIconName = resolveCategoryIconName;
const EXPENSE_ICONS = [
    { key: 'exp_food', name: '餐饮', type: 'expense', src: '/assets/category/expense/exp_food.png' },
    { key: 'exp_transport', name: '交通', type: 'expense', src: '/assets/category/expense/exp_transport.png' },
    { key: 'exp_shopping', name: '购物', type: 'expense', src: '/assets/category/expense/exp_shopping.png' },
    { key: 'exp_housing', name: '居住', type: 'expense', src: '/assets/category/expense/exp_housing.png' },
    { key: 'exp_medical', name: '医疗', type: 'expense', src: '/assets/category/expense/exp_medical.png' },
    { key: 'exp_entertainment', name: '娱乐', type: 'expense', src: '/assets/category/expense/exp_entertainment.png' },
    { key: 'exp_pet', name: '宠物', type: 'expense', src: '/assets/category/expense/exp_pet.png' },
    { key: 'exp_other', name: '其他', type: 'expense', src: '/assets/category/expense/exp_other.png' },
];
const INCOME_ICONS = [
    { key: 'in_salary', name: '工资', type: 'income', src: '/assets/category/income/in_salary.png' },
    { key: 'in_bonus', name: '奖金', type: 'income', src: '/assets/category/income/in_bonus.png' },
    { key: 'in_invest', name: '投资', type: 'income', src: '/assets/category/income/in_invest.png' },
    { key: 'in_sidejob', name: '副业', type: 'income', src: '/assets/category/income/in_sidejob.png' },
    { key: 'in_gift', name: '礼金', type: 'income', src: '/assets/category/income/in_gift.png' },
    { key: 'in_refund', name: '退款', type: 'income', src: '/assets/category/income/in_refund.png' },
    { key: 'in_other', name: '其他', type: 'income', src: '/assets/category/income/in_other.png' },
];
const ICONS_BY_TYPE = {
    expense: EXPENSE_ICONS,
    income: INCOME_ICONS,
};
const DEFAULT_ICON_KEY_BY_TYPE = {
    expense: 'exp_other',
    income: 'in_other',
};
const ICON_MAP = new Map([...EXPENSE_ICONS, ...INCOME_ICONS].map((item) => [item.key, item]));
function getCategoryIcons(type) {
    return ICONS_BY_TYPE[type].map((item) => ({ ...item }));
}
function getDefaultIconKeyByType(type) {
    return DEFAULT_ICON_KEY_BY_TYPE[type];
}
function normalizeCategoryIconKey(iconKey, type) {
    if (!iconKey)
        return getDefaultIconKeyByType(type);
    const found = ICON_MAP.get(iconKey);
    if (!found || found.type !== type)
        return getDefaultIconKeyByType(type);
    return iconKey;
}
function resolveCategoryIconSrc(iconKey, type) {
    const key = normalizeCategoryIconKey(iconKey, type);
    return ICON_MAP.get(key)?.src || ICON_MAP.get(getDefaultIconKeyByType(type)).src;
}
function resolveCategoryIconName(iconKey, type) {
    const key = normalizeCategoryIconKey(iconKey, type);
    return ICON_MAP.get(key)?.name || '其他';
}
