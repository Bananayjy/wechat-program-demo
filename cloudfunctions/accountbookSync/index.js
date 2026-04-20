const cloud = require('wx-server-sdk');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const LEDGER_COLLECTION = 'accountbook_ledgers';
const CATEGORY_COLLECTION = 'accountbook_categories';
const TRANSACTION_COLLECTION = 'accountbook_transactions';
const CONFIG_COLLECTION = 'accountbook_sync_configs';
const USER_COLLECTION = 'app_users';
const WECHAT_BINDING_COLLECTION = 'wechat_bindings';

// const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_SECRET = '6';
const JWT_EXPIRES_SEC = 6 * 60 * 60;

function ok(data, message = 'ok', statusCode = 200) {
  return { ok: true, statusCode, message, data };
}

function fail(message, statusCode = 400) {
  return { ok: false, statusCode, message };
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(payload) {
  return payload && typeof payload === 'object' ? payload : {};
}

function sanitizeBookId(bookId) {
  const v = typeof bookId === 'string' ? bookId.trim() : '';
  if (!v) throw new Error('bookId 不能为空');
  return v;
}

function sanitizeLedgers(raw) {
  return normalizeArray(raw)
    .filter((item) => item && item.id)
    .map((item) => ({
      id: String(item.id),
      name: typeof item.name === 'string' ? item.name : '',
      createdAt: Number(item.createdAt) || Date.now(),
      coverImagePath:
        typeof item.coverImagePath === 'string' ? item.coverImagePath : undefined,
    }));
}

function sanitizeCategories(raw) {
  return normalizeArray(raw)
    .filter((item) => item && item.id)
    .map((item) => ({
      id: String(item.id),
      name: typeof item.name === 'string' ? item.name : '',
      type: item.type === 'income' ? 'income' : 'expense',
      iconKey:
        typeof item.iconKey === 'string' && item.iconKey.trim()
          ? item.iconKey.trim()
          : item.type === 'income'
          ? 'in_other'
          : 'exp_other',
    }));
}

function sanitizeTransactions(raw) {
  return normalizeArray(raw)
    .filter((item) => item && item.id)
    .map((item) => ({
      id: String(item.id),
      amountFen: Number(item.amountFen) || 0,
      type: item.type === 'income' ? 'income' : 'expense',
      categoryId: typeof item.categoryId === 'string' ? item.categoryId : '',
      note: typeof item.note === 'string' ? item.note : '',
      occurredAt: Number(item.occurredAt) || Date.now(),
    }));
}

async function upsertOne(collection, where, doc) {
  const existing = await db.collection(collection).where(where).limit(1).get();
  if (existing.data.length > 0) {
    await db.collection(collection).doc(existing.data[0]._id).update({ data: doc });
    return;
  }
  await db.collection(collection).add({ data: { ...where, ...doc } });
}

async function removeByQueryInBatches(collection, where, batchSize = 100) {
  for (;;) {
    const page = await db.collection(collection).where(where).field({ _id: true }).limit(batchSize).get();
    const rows = normalizeArray(page.data);
    if (rows.length === 0) return;
    for (const row of rows) {
      await db.collection(collection).doc(row._id).remove();
    }
  }
}

async function getLatestConfigDoc(accountId) {
  const existing = await db
    .collection(CONFIG_COLLECTION)
    .where({ accountId })
    .orderBy('updatedAt', 'desc')
    .limit(1)
    .get();
  return existing.data.length > 0 ? existing.data[0] : null;
}

function scoped(accountId) {
  return { accountId };
}

function sanitizeConfig(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const apiBase = typeof source.apiBase === 'string' ? source.apiBase.trim() : '';
  const cloudEnvId = typeof source.cloudEnvId === 'string' ? source.cloudEnvId.trim() : '';
  const enabled = !!source.enabled;
  if (apiBase && !/^https:\/\//i.test(apiBase)) {
    throw new Error('apiBase 必须为 https 完整地址');
  }

  return {
    apiBase,
    cloudEnvId,
    enabled,
  };
}

function assertJwtSecret() {
  if (!JWT_SECRET) {
    throw new Error('云函数未配置环境变量 JWT_SECRET');
  }
}

function signToken(accountId) {
  assertJwtSecret();
  return jwt.sign({ accountId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_SEC });
}

function verifyAuthToken(authToken) {
  if (!authToken || typeof authToken !== 'string') return null;
  assertJwtSecret();
  try {
    const decoded = jwt.verify(authToken, JWT_SECRET);
    const id = decoded && decoded.accountId;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

function sanitizeUsername(u) {
  const v = typeof u === 'string' ? u.trim() : '';
  if (v.length < 2 || v.length > 32) throw new Error('用户名为 2～32 个字符');
  return v;
}

function sanitizePassword(p) {
  const v = typeof p === 'string' ? p : '';
  if (v.length < 6) throw new Error('密码至少 6 位');
  return v;
}

async function handleRegister(payload) {
  const p = asObject(payload);
  const username = sanitizeUsername(p.username);
  const password = sanitizePassword(p.password);

  const dup = await db.collection(USER_COLLECTION).where({ username }).limit(1).get();
  if (dup.data.length > 0) {
    return fail('该用户名已被注册', 409);
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const addRes = await db.collection(USER_COLLECTION).add({
    data: {
      username,
      passwordHash,
      nickName: '',
      avatarUrl: '',
      createdAt: db.serverDate(),
    },
  });
  const accountId = addRes._id;
  const token = signToken(accountId);
  const expiresAt = Date.now() + JWT_EXPIRES_SEC * 1000;

  return ok(
    {
      token,
      expiresAt,
      accountId,
      username,
      nickName: '',
      avatarUrl: '',
    },
    '注册成功'
  );
}

async function handleLogin(payload) {
  const p = asObject(payload);
  const username = sanitizeUsername(p.username);
  const password = sanitizePassword(p.password);

  const found = await db.collection(USER_COLLECTION).where({ username }).limit(1).get();
  if (found.data.length === 0) {
    return fail('用户名或密码错误', 401);
  }
  const row = found.data[0];
  if (!bcrypt.compareSync(password, row.passwordHash || '')) {
    return fail('用户名或密码错误', 401);
  }
  const accountId = row._id;
  const token = signToken(accountId);
  const expiresAt = Date.now() + JWT_EXPIRES_SEC * 1000;

  return ok(
    {
      token,
      expiresAt,
      accountId,
      username: row.username,
      nickName: typeof row.nickName === 'string' ? row.nickName : '',
      avatarUrl: typeof row.avatarUrl === 'string' ? row.avatarUrl : '',
    },
    '登录成功'
  );
}

async function handleProfileUpdate(accountId, payload) {
  const p = asObject(payload);
  const nickName = typeof p.nickName === 'string' ? p.nickName.trim().slice(0, 32) : '';
  const avatarUrl = typeof p.avatarUrl === 'string' ? p.avatarUrl.trim().slice(0, 500) : '';

  const found = await db.collection(USER_COLLECTION).doc(accountId).get();
  if (!found.data || Object.keys(found.data).length === 0) {
    return fail('用户不存在', 404);
  }

  await db.collection(USER_COLLECTION).doc(accountId).update({
    data: {
      nickName,
      avatarUrl,
      profileUpdatedAt: db.serverDate(),
    },
  });

  return ok({ nickName, avatarUrl }, '资料已更新');
}

async function handleProfileGet(accountId) {
  const found = await db.collection(USER_COLLECTION).doc(accountId).get();
  if (!found.data || Object.keys(found.data).length === 0) {
    return fail('用户不存在', 404);
  }
  const row = found.data;
  return ok(
    {
      username: typeof row.username === 'string' ? row.username : '',
      nickName: typeof row.nickName === 'string' ? row.nickName : '',
      avatarUrl: typeof row.avatarUrl === 'string' ? row.avatarUrl : '',
    },
    'ok'
  );
}

async function handleWechatBind(accountId) {
  const ctx = cloud.getWXContext();
  const openid = ctx.OPENID;
  if (!openid) {
    return fail('未获取到微信身份', 401);
  }

  const existingOpenid = await db.collection(WECHAT_BINDING_COLLECTION).where({ openid }).limit(1).get();
  if (existingOpenid.data.length > 0) {
    const row = existingOpenid.data[0];
    if (row.accountId !== accountId) {
      return fail('该微信已绑定其他账号', 409);
    }
    return ok({ bound: true, accountId }, '已绑定');
  }

  const existingAcc = await db.collection(WECHAT_BINDING_COLLECTION).where({ accountId }).limit(1).get();
  if (existingAcc.data.length > 0) {
    await db.collection(WECHAT_BINDING_COLLECTION).doc(existingAcc.data[0]._id).update({
      data: { openid, updatedAt: db.serverDate() },
    });
  } else {
    await db.collection(WECHAT_BINDING_COLLECTION).add({
      data: {
        openid,
        accountId,
        createdAt: db.serverDate(),
      },
    });
  }

  return ok({ bound: true, accountId }, '微信已绑定');
}

async function handleSaveConfig(accountId, payload, clientTs) {
  const cfg = sanitizeConfig(payload);
  const existingDoc = await getLatestConfigDoc(accountId);

  const doc = {
    ...cfg,
    accountId,
    clientTs: Number(clientTs) || Date.now(),
    lastOp: 'saveConfig',
    syncRevision: Number(existingDoc && existingDoc.syncRevision) || 0,
    updatedAt: db.serverDate(),
  };
  if (existingDoc) {
    await db.collection(CONFIG_COLLECTION).doc(existingDoc._id).update({ data: doc });
  } else {
    await db.collection(CONFIG_COLLECTION).add({ data: doc });
  }
  return ok({ savedAt: Date.now() }, '配置已保存');
}

function sanitizeTxId(txId) {
  const v = typeof txId === 'string' ? txId.trim() : '';
  if (!v) throw new Error('txId 不能为空');
  return v;
}

function sanitizeCategoryId(categoryId) {
  const v = typeof categoryId === 'string' ? categoryId.trim() : '';
  if (!v) throw new Error('categoryId 不能为空');
  return v;
}

async function touchSyncRevision(accountId, clientTs, lastOp) {
  const existingDoc = await getLatestConfigDoc(accountId);
  const nextRevision = (Number(existingDoc && existingDoc.syncRevision) || 0) + 1;
  const doc = {
    accountId,
    apiBase: typeof (existingDoc && existingDoc.apiBase) === 'string' ? existingDoc.apiBase : '',
    enabled: !!(existingDoc && existingDoc.enabled),
    cloudEnvId:
      typeof (existingDoc && existingDoc.cloudEnvId) === 'string' ? existingDoc.cloudEnvId : '',
    clientTs: Number(clientTs) || Date.now(),
    lastOp,
    syncRevision: nextRevision,
    syncPendingToken: '',
    syncPendingNextRevision: null,
    syncUpdatedAt: db.serverDate(),
    updatedAt: db.serverDate(),
  };
  await upsertOne(CONFIG_COLLECTION, { accountId }, doc);
  return nextRevision;
}

async function handleTxAdd(accountId, payload, clientTs) {
  const source = asObject(payload);
  const scope = scoped(accountId);
  const bookId = sanitizeBookId(source.bookId);
  const tx = sanitizeTransactions([source.tx])[0];
  if (!tx) return fail('流水数据无效', 400);

  await upsertOne(
    TRANSACTION_COLLECTION,
    { ...scope, bookId, txId: tx.id },
    {
      tx,
      occurredAt: tx.occurredAt,
      updatedAt: db.serverDate(),
      clientTs: Number(clientTs) || Date.now(),
    }
  );
  const syncRevision = await touchSyncRevision(accountId, clientTs, 'txAdd');
  return ok({ bookId, txId: tx.id, syncRevision }, '流水已保存');
}

async function handleTxUpdate(accountId, payload, clientTs) {
  const source = asObject(payload);
  const scope = scoped(accountId);
  const bookId = sanitizeBookId(source.bookId);
  const tx = sanitizeTransactions([source.tx])[0];
  if (!tx) return fail('流水数据无效', 400);

  await upsertOne(
    TRANSACTION_COLLECTION,
    { ...scope, bookId, txId: tx.id },
    {
      tx,
      occurredAt: tx.occurredAt,
      updatedAt: db.serverDate(),
      clientTs: Number(clientTs) || Date.now(),
    }
  );
  const syncRevision = await touchSyncRevision(accountId, clientTs, 'txUpdate');
  return ok({ bookId, txId: tx.id, syncRevision }, '流水已更新');
}

async function handleTxRemove(accountId, payload, clientTs) {
  const source = asObject(payload);
  const scope = scoped(accountId);
  const bookId = sanitizeBookId(source.bookId);
  const txId = sanitizeTxId(source.txId);
  const existing = await db
    .collection(TRANSACTION_COLLECTION)
    .where({ ...scope, bookId, txId })
    .limit(1)
    .get();
  if (existing.data.length > 0) {
    await db.collection(TRANSACTION_COLLECTION).doc(existing.data[0]._id).remove();
  }
  const syncRevision = await touchSyncRevision(accountId, clientTs, 'txRemove');
  return ok({ bookId, txId, removed: existing.data.length > 0, syncRevision }, '流水已删除');
}

async function handleCategoryAdd(accountId, payload, clientTs) {
  const source = asObject(payload);
  const scope = scoped(accountId);
  const bookId = sanitizeBookId(source.bookId);
  const category = sanitizeCategories([source.category])[0];
  if (!category) return fail('分类数据无效', 400);

  const existing = await db.collection(CATEGORY_COLLECTION).where({ ...scope, bookId }).limit(1).get();
  const categories = sanitizeCategories(
    existing.data[0] && existing.data[0].categories ? existing.data[0].categories : []
  );
  const idx = categories.findIndex((item) => item.id === category.id);
  if (idx >= 0) {
    categories[idx] = category;
  } else {
    categories.push(category);
  }
  await upsertOne(
    CATEGORY_COLLECTION,
    { ...scope, bookId },
    {
      categories,
      updatedAt: db.serverDate(),
      clientTs: Number(clientTs) || Date.now(),
    }
  );
  const syncRevision = await touchSyncRevision(accountId, clientTs, 'categoryAdd');
  return ok({ bookId, categoryId: category.id, syncRevision }, '分类已保存');
}

async function handleCategoryUpdate(accountId, payload, clientTs) {
  const source = asObject(payload);
  const scope = scoped(accountId);
  const bookId = sanitizeBookId(source.bookId);
  const category = sanitizeCategories([source.category])[0];
  if (!category) return fail('分类数据无效', 400);

  const existing = await db.collection(CATEGORY_COLLECTION).where({ ...scope, bookId }).limit(1).get();
  const categories = sanitizeCategories(
    existing.data[0] && existing.data[0].categories ? existing.data[0].categories : []
  );
  const idx = categories.findIndex((item) => item.id === category.id);
  if (idx < 0) return fail('分类不存在', 404);
  categories[idx] = category;
  await upsertOne(
    CATEGORY_COLLECTION,
    { ...scope, bookId },
    {
      categories,
      updatedAt: db.serverDate(),
      clientTs: Number(clientTs) || Date.now(),
    }
  );
  const syncRevision = await touchSyncRevision(accountId, clientTs, 'categoryUpdate');
  return ok({ bookId, categoryId: category.id, syncRevision }, '分类已更新');
}

async function handleCategoryRemove(accountId, payload, clientTs) {
  const source = asObject(payload);
  const scope = scoped(accountId);
  const bookId = sanitizeBookId(source.bookId);
  const categoryId = sanitizeCategoryId(source.categoryId);

  const existing = await db.collection(CATEGORY_COLLECTION).where({ ...scope, bookId }).limit(1).get();
  const categories = sanitizeCategories(
    existing.data[0] && existing.data[0].categories ? existing.data[0].categories : []
  );
  const next = categories.filter((item) => item.id !== categoryId);
  await upsertOne(
    CATEGORY_COLLECTION,
    { ...scope, bookId },
    {
      categories: next,
      updatedAt: db.serverDate(),
      clientTs: Number(clientTs) || Date.now(),
    }
  );
  const syncRevision = await touchSyncRevision(accountId, clientTs, 'categoryRemove');
  return ok({ bookId, categoryId, removed: next.length !== categories.length, syncRevision }, '分类已删除');
}

async function handleLedgerAdd(accountId, payload, clientTs) {
  const source = asObject(payload);
  const scope = scoped(accountId);
  const ledger = sanitizeLedgers([source.ledger])[0];
  if (!ledger) return fail('账本数据无效', 400);
  const categories = sanitizeCategories(source.categories);
  const bookId = ledger.id;

  await upsertOne(
    LEDGER_COLLECTION,
    { ...scope, bookId },
    {
      ledger,
      updatedAt: db.serverDate(),
      clientTs: Number(clientTs) || Date.now(),
    }
  );
  await upsertOne(
    CATEGORY_COLLECTION,
    { ...scope, bookId },
    {
      categories,
      updatedAt: db.serverDate(),
      clientTs: Number(clientTs) || Date.now(),
    }
  );
  const syncRevision = await touchSyncRevision(accountId, clientTs, 'ledgerAdd');
  return ok({ bookId, syncRevision }, '账本已保存');
}

async function handleLedgerRename(accountId, payload, clientTs) {
  const source = asObject(payload);
  const scope = scoped(accountId);
  const bookId = sanitizeBookId(source.bookId);
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  if (!name) return fail('账本名称不能为空', 400);
  const existing = await db.collection(LEDGER_COLLECTION).where({ ...scope, bookId }).limit(1).get();
  if (existing.data.length === 0) return fail('账本不存在', 404);
  const ledger = sanitizeLedgers([existing.data[0].ledger])[0];
  if (!ledger) return fail('账本数据无效', 400);
  ledger.name = name;
  await db.collection(LEDGER_COLLECTION).doc(existing.data[0]._id).update({
    data: {
      ledger,
      updatedAt: db.serverDate(),
      clientTs: Number(clientTs) || Date.now(),
    },
  });
  const syncRevision = await touchSyncRevision(accountId, clientTs, 'ledgerRename');
  return ok({ bookId, syncRevision }, '账本已重命名');
}

async function handleLedgerCoverUpdate(accountId, payload, clientTs) {
  const source = asObject(payload);
  const scope = scoped(accountId);
  const bookId = sanitizeBookId(source.bookId);
  const coverImagePath =
    typeof source.coverImagePath === 'string' && source.coverImagePath.trim()
      ? source.coverImagePath.trim()
      : undefined;
  const existing = await db.collection(LEDGER_COLLECTION).where({ ...scope, bookId }).limit(1).get();
  if (existing.data.length === 0) return fail('账本不存在', 404);
  const ledger = sanitizeLedgers([existing.data[0].ledger])[0];
  if (!ledger) return fail('账本数据无效', 400);
  ledger.coverImagePath = coverImagePath;
  await db.collection(LEDGER_COLLECTION).doc(existing.data[0]._id).update({
    data: {
      ledger,
      updatedAt: db.serverDate(),
      clientTs: Number(clientTs) || Date.now(),
    },
  });
  const syncRevision = await touchSyncRevision(accountId, clientTs, 'ledgerCoverUpdate');
  return ok({ bookId, syncRevision }, '账本封面已更新');
}

async function handleLedgerRemove(accountId, payload, clientTs) {
  const source = asObject(payload);
  const scope = scoped(accountId);
  const bookId = sanitizeBookId(source.bookId);
  await removeByQueryInBatches(LEDGER_COLLECTION, { ...scope, bookId }, 100);
  await removeByQueryInBatches(CATEGORY_COLLECTION, { ...scope, bookId }, 100);
  await removeByQueryInBatches(TRANSACTION_COLLECTION, { ...scope, bookId }, 100);
  const syncRevision = await touchSyncRevision(accountId, clientTs, 'ledgerRemove');
  return ok({ bookId, syncRevision }, '账本已删除');
}

async function handleSyncReset(accountId, payload, clientTs) {
  const source = asObject(payload);
  const scope = scoped(accountId);
  const ledgers = sanitizeLedgers(source.ledgers);
  const bookIds = normalizeArray(source.bookIds).map((item) => String(item)).filter(Boolean);
  const baseRevision = Math.max(0, Number(source.baseRevision) || 0);
  const cfgDoc = await getLatestConfigDoc(accountId);
  const currentRevision = Number(cfgDoc && cfgDoc.syncRevision) || 0;
  if (baseRevision !== currentRevision) {
    return fail('数据已在其他设备更新，请先拉取最新数据再重试', 409);
  }
  const nextRevision = currentRevision + 1;
  const syncToken = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  for (const ledger of ledgers) {
    await upsertOne(
      LEDGER_COLLECTION,
      { ...scope, bookId: ledger.id },
      {
        ledger,
        updatedAt: db.serverDate(),
        clientTs: Number(clientTs) || Date.now(),
      }
    );
  }

  await upsertOne(
    CONFIG_COLLECTION,
    { accountId },
    {
      clientTs: Number(clientTs) || Date.now(),
      lastOp: 'syncReset',
      latestBookIds: bookIds,
      latestClientTime: Number(source.clientTime) || Date.now(),
      syncRevision: currentRevision,
      syncPendingToken: syncToken,
      syncPendingNextRevision: nextRevision,
      updatedAt: db.serverDate(),
    }
  );

  return ok({ reset: true, books: bookIds.length, syncToken, nextRevision }, '重置成功');
}

async function handleSyncBookReset(accountId, payload, clientTs) {
  const source = asObject(payload);
  const scope = scoped(accountId);
  const syncToken = typeof source.syncToken === 'string' ? source.syncToken : '';
  const cfgDoc = await getLatestConfigDoc(accountId);
  if (!cfgDoc || !syncToken || cfgDoc.syncPendingToken !== syncToken) {
    return fail('同步会话失效，请重新上传', 409);
  }
  const bookId = sanitizeBookId(source.bookId);
  const categories = sanitizeCategories(source.categories);
  const ledger = source.ledger && source.ledger.id ? sanitizeLedgers([source.ledger])[0] : null;

  if (ledger) {
    await upsertOne(
      LEDGER_COLLECTION,
      { ...scope, bookId },
      {
        ledger,
        updatedAt: db.serverDate(),
        clientTs: Number(clientTs) || Date.now(),
      }
    );
  }

  await upsertOne(
    CATEGORY_COLLECTION,
    { ...scope, bookId },
    {
      categories,
      updatedAt: db.serverDate(),
      clientTs: Number(clientTs) || Date.now(),
    }
  );

  await removeByQueryInBatches(TRANSACTION_COLLECTION, { ...scope, bookId }, 100);
  return ok({ reset: true, bookId }, '账本已重置');
}

async function handleSyncBookChunk(accountId, payload, clientTs) {
  const source = asObject(payload);
  const scope = scoped(accountId);
  const syncToken = typeof source.syncToken === 'string' ? source.syncToken : '';
  const cfgDoc = await getLatestConfigDoc(accountId);
  if (!cfgDoc || !syncToken || cfgDoc.syncPendingToken !== syncToken) {
    return fail('同步会话失效，请重新上传', 409);
  }
  const bookId = sanitizeBookId(source.bookId);
  const transactions = sanitizeTransactions(source.transactions);

  for (const tx of transactions) {
    await upsertOne(
      TRANSACTION_COLLECTION,
      { ...scope, bookId, txId: tx.id },
      {
        tx,
        occurredAt: tx.occurredAt,
        updatedAt: db.serverDate(),
        clientTs: Number(clientTs) || Date.now(),
      }
    );
  }

  return ok({ accepted: transactions.length, bookId }, '分片写入成功');
}

async function handleSyncPrune(accountId, payload) {
  const source = asObject(payload);
  const scope = scoped(accountId);
  const syncToken = typeof source.syncToken === 'string' ? source.syncToken : '';
  const cfgDoc = await getLatestConfigDoc(accountId);
  if (!cfgDoc || !syncToken || cfgDoc.syncPendingToken !== syncToken) {
    return fail('同步会话失效，请重新上传', 409);
  }
  const nextRevision = Number(cfgDoc.syncPendingNextRevision) || Number(cfgDoc.syncRevision) || 0;
  const bookIds = normalizeArray(source.bookIds).map((item) => String(item)).filter(Boolean);
  if (bookIds.length === 0) {
    await removeByQueryInBatches(LEDGER_COLLECTION, scope, 100);
    await removeByQueryInBatches(CATEGORY_COLLECTION, scope, 100);
    await removeByQueryInBatches(TRANSACTION_COLLECTION, scope, 100);
    await db.collection(CONFIG_COLLECTION).doc(cfgDoc._id).update({
      data: {
        syncRevision: nextRevision,
        syncPendingToken: '',
        syncPendingNextRevision: null,
        syncUpdatedAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    });
    return ok({ removedAll: true, syncRevision: nextRevision }, '清理成功');
  }

  const notInQuery = { ...scope, bookId: _.nin(bookIds) };
  await removeByQueryInBatches(LEDGER_COLLECTION, notInQuery, 100);
  await removeByQueryInBatches(CATEGORY_COLLECTION, notInQuery, 100);
  await removeByQueryInBatches(TRANSACTION_COLLECTION, notInQuery, 100);
  await db.collection(CONFIG_COLLECTION).doc(cfgDoc._id).update({
    data: {
      syncRevision: nextRevision,
      syncPendingToken: '',
      syncPendingNextRevision: null,
      syncUpdatedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
  return ok({ pruned: true, books: bookIds.length, syncRevision: nextRevision }, '清理成功');
}

async function handlePullMeta(accountId) {
  const scope = scoped(accountId);
  const cfgDoc = await getLatestConfigDoc(accountId);
  const ledgersRes = await db.collection(LEDGER_COLLECTION).where(scope).limit(200).get();
  const ledgerRows = normalizeArray(ledgersRes.data);
  const ledgers = ledgerRows.map((row) => row.ledger).filter((item) => item && item.id);
  const bookIds = ledgers.map((item) => String(item.id));
  return ok(
    {
      ledgers,
      bookIds,
      clientTime: Date.now(),
      syncRevision: Number(cfgDoc && cfgDoc.syncRevision) || 0,
    },
    '拉取元数据成功'
  );
}

async function handlePullBook(accountId, payload) {
  const source = asObject(payload);
  const scope = scoped(accountId);
  const bookId = sanitizeBookId(source.bookId);
  const offset = Math.max(0, Number(source.offset) || 0);
  const limit = Math.min(200, Math.max(20, Number(source.limit) || 100));

  const categoryRes = await db
    .collection(CATEGORY_COLLECTION)
    .where({ ...scope, bookId })
    .limit(1)
    .get();
  const categories = sanitizeCategories(
    categoryRes.data[0] && categoryRes.data[0].categories ? categoryRes.data[0].categories : []
  );

  const txQuery = db.collection(TRANSACTION_COLLECTION).where({ ...scope, bookId });
  const [countRes, txRes] = await Promise.all([
    txQuery.count(),
    txQuery.orderBy('occurredAt', 'desc').skip(offset).limit(limit).get(),
  ]);
  const total = Number(countRes.total) || 0;
  const transactions = normalizeArray(txRes.data).map((row) => row.tx).filter((tx) => tx && tx.id);
  const nextOffset = offset + transactions.length;

  return ok(
    {
      bookId,
      categories,
      transactions,
      nextOffset,
      hasMore: nextOffset < total,
    },
    '拉取账本成功'
  );
}

async function handlePullConfig(accountId) {
  const existing = await db
    .collection(CONFIG_COLLECTION)
    .where({ accountId })
    .orderBy('updatedAt', 'desc')
    .limit(1)
    .get();
  if (existing.data.length === 0) {
    return ok(null, '云端无配置');
  }
  const row = existing.data[0];
  return ok(
    {
      apiBase: row.apiBase || '',
      enabled: !!row.enabled,
      cloudEnvId: row.cloudEnvId || '',
    },
    '拉取配置成功'
  );
}

exports.main = async (event) => {
  const path = typeof event.path === 'string' ? event.path : '';
  const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
  const clientTs = Number(event.clientTs) || Date.now();
  const authToken = typeof event.authToken === 'string' ? event.authToken : '';

  try {
    if (path === '/auth/register') {
      return await handleRegister(payload);
    }
    if (path === '/auth/login') {
      return await handleLogin(payload);
    }

    const accountId = verifyAuthToken(authToken);
    if (!accountId) {
      return fail('未登录或登录已过期', 401);
    }

    if (path === '/user/profile/update') {
      return await handleProfileUpdate(accountId, payload);
    }
    if (path === '/user/profile/get') {
      return await handleProfileGet(accountId);
    }
    if (path === '/wechat/bind') {
      return await handleWechatBind(accountId);
    }

    if (path === '/accountbook/tx/add') {
      return await handleTxAdd(accountId, payload, clientTs);
    }
    if (path === '/accountbook/tx/update') {
      return await handleTxUpdate(accountId, payload, clientTs);
    }
    if (path === '/accountbook/tx/remove') {
      return await handleTxRemove(accountId, payload, clientTs);
    }
    if (path === '/accountbook/category/add') {
      return await handleCategoryAdd(accountId, payload, clientTs);
    }
    if (path === '/accountbook/category/update') {
      return await handleCategoryUpdate(accountId, payload, clientTs);
    }
    if (path === '/accountbook/category/remove') {
      return await handleCategoryRemove(accountId, payload, clientTs);
    }
    if (path === '/accountbook/ledger/add') {
      return await handleLedgerAdd(accountId, payload, clientTs);
    }
    if (path === '/accountbook/ledger/rename') {
      return await handleLedgerRename(accountId, payload, clientTs);
    }
    if (path === '/accountbook/ledger/remove') {
      return await handleLedgerRemove(accountId, payload, clientTs);
    }
    if (path === '/accountbook/ledger/cover/update') {
      return await handleLedgerCoverUpdate(accountId, payload, clientTs);
    }

    if (path === '/accountbook/sync/reset') {
      return await handleSyncReset(accountId, payload, clientTs);
    }
    if (path === '/accountbook/sync/book/reset') {
      return await handleSyncBookReset(accountId, payload, clientTs);
    }
    if (path === '/accountbook/sync/book/chunk') {
      return await handleSyncBookChunk(accountId, payload, clientTs);
    }
    if (path === '/accountbook/sync/prune') {
      return await handleSyncPrune(accountId, payload);
    }
    if (path === '/accountbook/pull/meta') {
      return await handlePullMeta(accountId);
    }
    if (path === '/accountbook/pull/book') {
      return await handlePullBook(accountId, payload);
    }
    if (path === '/accountbook/config/save') {
      return await handleSaveConfig(accountId, payload, clientTs);
    }
    if (path === '/accountbook/config/pull') {
      return await handlePullConfig(accountId);
    }

    return fail('未支持的路径，路径需以 / 开头', 404);
  } catch (err) {
    const message = err && err.message ? err.message : '服务器异常';
    return fail(message, 500);
  }
};
