# accountbookSync 云函数说明

## 环境变量

- **`JWT_SECRET`**（必填）：用于签发与校验登录 JWT，请在云开发控制台为该云函数配置，勿提交到仓库。
- 登录态有效期 **6 小时**（JWT `exp`）。

## 认证与用户

- `/auth/register`：自助注册，`payload`：`username`、`password`
- `/auth/login`：登录，返回 `token`、`expiresAt`、`accountId` 等
- `/user/profile/get`：拉取资料（需 `authToken`）
- `/user/profile/update`：更新昵称、头像（需 `authToken`），`payload`：`nickName`、`avatarUrl`（可为云存储 fileID）
- `/wechat/bind`：将当前微信 `OPENID` 与账号绑定（需 `authToken`）

以上路径与同步路径均通过云函数 `event.authToken` 传入 JWT（注册/登录除外）。

## 支持路径（同步）

- `/accountbook/sync/reset`：上传前初始化（账本列表）
- `/accountbook/sync/book/reset`：重置单账本（分类 + 清空旧流水）
- `/accountbook/sync/book/chunk`：分片上传账本流水
- `/accountbook/sync/prune`：清理已删除账本的数据
- `/accountbook/pull/meta`：拉取账本元数据
- `/accountbook/pull/book`：按分页拉取单账本流水
- `/accountbook/config/save`：保存同步配置
- `/accountbook/config/pull`：拉取同步配置

## 数据库集合

- `app_users`：账号、`passwordHash`、`nickName`、`avatarUrl` 等
- `wechat_bindings`：`openid` 与 `accountId` 绑定
- `accountbook_ledgers`
  - 关键字段：`accountId`、`bookId`、`ledger`、`updatedAt`
- `accountbook_categories`
  - 关键字段：`accountId`、`bookId`、`categories`、`updatedAt`
- `accountbook_transactions`
  - 关键字段：`accountId`、`bookId`、`txId`、`tx`、`occurredAt`
- `accountbook_sync_configs`
  - 关键字段：`accountId`、`enabled`、`cloudEnvId`、`updatedAt`

## 权限建议

- 建议设置数据库权限为“仅创建者可读写”或“仅云函数可读写”。
- 小程序端不直接访问数据库，统一经云函数访问。
