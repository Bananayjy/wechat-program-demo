/** 收支类型 */
export type TxType = 'income' | 'expense';

export interface Category {
  id: string;
  name: string;
  type: TxType;
}

export interface Transaction {
  id: string;
  /** 金额，单位：分，正整数 */
  amountFen: number;
  type: TxType;
  categoryId: string;
  note: string;
  /** 发生时间，毫秒时间戳 */
  occurredAt: number;
}
