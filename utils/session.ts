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

export function getAuthToken(): string {
  const s = getSession();
  return s?.token || '';
}

export function saveSession(p: SessionPayload): void {
  wx.setStorageSync(KEY_SESSION, p);
}

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
