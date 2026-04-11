"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSession = getSession;
exports.isSessionValid = isSessionValid;
exports.getAuthToken = getAuthToken;
exports.saveSession = saveSession;
exports.clearSession = clearSession;
exports.patchSessionProfile = patchSessionProfile;
const KEY_SESSION = 'accountbook_session_v1';
function readRaw() {
    try {
        const raw = wx.getStorageSync(KEY_SESSION);
        if (!raw)
            return null;
        const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!p || !p.token || !p.accountId)
            return null;
        return p;
    }
    catch (_a) {
        return null;
    }
}
function getSession() {
    const p = readRaw();
    if (!p)
        return null;
    if (typeof p.expiresAt === 'number' && Date.now() >= p.expiresAt) {
        clearSession();
        return null;
    }
    return p;
}
function isSessionValid() {
    return getSession() !== null;
}
function getAuthToken() {
    const s = getSession();
    return (s === null || s === void 0 ? void 0 : s.token) || '';
}
function saveSession(p) {
    wx.setStorageSync(KEY_SESSION, p);
}
function clearSession() {
    try {
        wx.removeStorageSync(KEY_SESSION);
    }
    catch (_a) {
        /* empty */
    }
}
function patchSessionProfile(patch) {
    const s = getSession();
    if (!s)
        return;
    saveSession({ ...s, ...patch });
}
