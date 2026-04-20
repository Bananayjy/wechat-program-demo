import type { TxType } from './types';

export interface CategoryIconOption {
  key: string;
  name: string;
  type: TxType;
  src: string;
}

const EXPENSE_ICONS: CategoryIconOption[] = [
  { key: 'exp_food', name: '餐饮', type: 'expense', src: '/assets/category/expense/exp_food.png' },
  { key: 'exp_transport', name: '交通', type: 'expense', src: '/assets/category/expense/exp_transport.png' },
  { key: 'exp_shopping', name: '购物', type: 'expense', src: '/assets/category/expense/exp_shopping.png' },
  { key: 'exp_housing', name: '居住', type: 'expense', src: '/assets/category/expense/exp_housing.png' },
  { key: 'exp_medical', name: '医疗', type: 'expense', src: '/assets/category/expense/exp_medical.png' },
  { key: 'exp_entertainment', name: '娱乐', type: 'expense', src: '/assets/category/expense/exp_entertainment.png' },
  { key: 'exp_pet', name: '宠物', type: 'expense', src: '/assets/category/expense/exp_pet.png' },
  { key: 'exp_other', name: '其他', type: 'expense', src: '/assets/category/expense/exp_other.png' },
];

const INCOME_ICONS: CategoryIconOption[] = [
  { key: 'in_salary', name: '工资', type: 'income', src: '/assets/category/income/in_salary.png' },
  { key: 'in_bonus', name: '奖金', type: 'income', src: '/assets/category/income/in_bonus.png' },
  { key: 'in_invest', name: '投资', type: 'income', src: '/assets/category/income/in_invest.png' },
  { key: 'in_sidejob', name: '副业', type: 'income', src: '/assets/category/income/in_sidejob.png' },
  { key: 'in_gift', name: '礼金', type: 'income', src: '/assets/category/income/in_gift.png' },
  { key: 'in_refund', name: '退款', type: 'income', src: '/assets/category/income/in_refund.png' },
  { key: 'in_other', name: '其他', type: 'income', src: '/assets/category/income/in_other.png' },
];

const ICONS_BY_TYPE: Record<TxType, CategoryIconOption[]> = {
  expense: EXPENSE_ICONS,
  income: INCOME_ICONS,
};

const DEFAULT_ICON_KEY_BY_TYPE: Record<TxType, string> = {
  expense: 'exp_other',
  income: 'in_other',
};

const ICON_MAP = new Map<string, CategoryIconOption>(
  [...EXPENSE_ICONS, ...INCOME_ICONS].map((item) => [item.key, item])
);

export function getCategoryIcons(type: TxType): CategoryIconOption[] {
  return ICONS_BY_TYPE[type].map((item) => ({ ...item }));
}

export function getDefaultIconKeyByType(type: TxType): string {
  return DEFAULT_ICON_KEY_BY_TYPE[type];
}

export function normalizeCategoryIconKey(iconKey: string | undefined, type: TxType): string {
  if (!iconKey) return getDefaultIconKeyByType(type);
  const found = ICON_MAP.get(iconKey);
  if (!found || found.type !== type) return getDefaultIconKeyByType(type);
  return iconKey;
}

export function resolveCategoryIconSrc(iconKey: string | undefined, type: TxType): string {
  const key = normalizeCategoryIconKey(iconKey, type);
  return ICON_MAP.get(key)?.src || ICON_MAP.get(getDefaultIconKeyByType(type))!.src;
}

export function resolveCategoryIconName(iconKey: string | undefined, type: TxType): string {
  const key = normalizeCategoryIconKey(iconKey, type);
  return ICON_MAP.get(key)?.name || '其他';
}
