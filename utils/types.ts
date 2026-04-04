/** 收支类型 */
export type TxType = 'income' | 'expense';

/** 账本元数据 */
export interface Ledger {
  id: string;
  name: string;
  createdAt: number;
  /** 封面本地路径（通常为 USER_DATA_PATH 下 saveFile 结果） */
  coverImagePath?: string;
}

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
