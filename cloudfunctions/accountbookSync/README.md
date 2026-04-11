# accountbookSync 云函数说明

## 支持路径

- `/accountbook/sync/reset`：上传前初始化（账本列表）
- `/accountbook/sync/book/reset`：重置单账本（分类 + 清空旧流水）
- `/accountbook/sync/book/chunk`：分片上传账本流水
- `/accountbook/sync/prune`：清理已删除账本的数据
- `/accountbook/pull/meta`：拉取账本元数据
- `/accountbook/pull/book`：按分页拉取单账本流水
- `/accountbook/config/save`：保存同步配置
- `/accountbook/config/pull`：拉取同步配置

## 数据库集合

- `accountbook_ledgers`
  - 关键字段：`openid`、`catalogueCode`、`bookId`、`ledger`、`updatedAt`
- `accountbook_categories`
  - 关键字段：`openid`、`catalogueCode`、`bookId`、`categories`、`updatedAt`
- `accountbook_transactions`
  - 关键字段：`openid`、`catalogueCode`、`bookId`、`txId`、`tx`、`occurredAt`
- `accountbook_sync_configs`
  - 关键字段：`openid`、`catalogueCode`、`enabled`、`cloudEnvId`、`updatedAt`

## 权限建议

- 建议设置数据库权限为“仅创建者可读写”或“仅云函数可读写”。
- 小程序端不直接访问数据库，统一经云函数访问。
