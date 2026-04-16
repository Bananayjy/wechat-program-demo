const KEY_SESSION = 'accountbook_session_v1';

export interface SessionPayload {
  token: string;
  expiresAt: number;
  accountId: string;
  username?: string;
  nickName?: string;
  avatarUrl?: string;
}

function readRaw(): SessionPayload | null {
  try {
    const raw = wx.getStorageSync(KEY_SESSION) as SessionPayload | string | undefined;
    if (!raw) return null;
    const p = typeof raw === 'string' ? (JSON.parse(raw) as SessionPayload) : raw;
    if (!p || !p.token || !p.accountId) return null;
    return p;
  } catch {
    return null;
  }
}

export function getSession(): SessionPayload | null {
  const p = readRaw();
  if (!p) return null;
  if (typeof p.expiresAt === 'number' && Date.now() >= p.expiresAt) {
    clearSession();
    return null;
  }
  return p;
}

export function isSessionValid(): boolean {
  return getSession() !== null;
}

// 从本地会话取的登录令牌，云端用来校验身份或调后端
export function getAuthToken(): string {
  const s = getSession();
  return s?.token || '';
}

/**
 * 把登录会话信息同步写入小程序本地存储
 * @param p 参数 p 的类型是 SessionPayload
 */
export function saveSession(p: SessionPayload): void {
  // 同步把数据存到当前用户在本机上的本地缓存（类似 key-value）
  wx.setStorageSync(KEY_SESSION, p);
}

/**
 * 清理小程序本地缓存
 */
export function clearSession(): void {
  try {
    wx.removeStorageSync(KEY_SESSION);
  } catch {
    /* empty */
  }
}

export function patchSessionProfile(patch: Partial<Pick<SessionPayload, 'nickName' | 'avatarUrl'>>): void {
  const s = getSession();
  if (!s) return;
  saveSession({ ...s, ...patch });
}
