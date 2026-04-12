"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cloudSync_1 = require("../../utils/cloudSync");
const session_1 = require("../../utils/session");
const storage_1 = require("../../utils/storage");
const sync_1 = require("../../utils/sync");
Page({
    data: {
        username: '',
        password: '',
        cloudEnvId: '',
        loading: false,
        mode: 'login',
    },
    onShow() {
        if ((0, session_1.getSession)()) {
            const pages = getCurrentPages();
            if (pages.length > 1) {
                wx.navigateBack({ delta: 1 });
            }
            else {
                wx.reLaunch({ url: '/pages/index/index' });
            }
        }
    },
    async pullAfterLogin() {
        let cfg = (0, storage_1.loadSyncConfig)();
        const cloudCfg = await (0, sync_1.pullSyncConfigRemote)(cfg);
        if (cloudCfg.ok && cloudCfg.config) {
            (0, storage_1.saveSyncConfig)(cloudCfg.config, { silent: true });
            cfg = cloudCfg.config;
        }
        const metaRes = await (0, sync_1.getRemoteSyncMeta)();
        if (!metaRes.ok || !metaRes.meta) {
            return `已登录，检查云端数据失败：${metaRes.message}`;
        }
        if (metaRes.meta.bookIds.length > 0) {
            const pullRes = await (0, sync_1.pullFromRemote)();
            if (pullRes.ok)
                return '已登录并完成云端覆盖';
            return `已登录，自动拉取失败：${pullRes.message}`;
        }
        const pushRes = await (0, sync_1.pushToRemote)();
        if (pushRes.ok)
            return '已登录；云端无数据，已上传本地数据';
        return `已登录，云端无数据但自动上传失败：${pushRes.message}`;
    },
    onUsername(e) {
        this.setData({ username: e.detail.value });
    },
    onPassword(e) {
        this.setData({ password: e.detail.value });
    },
    onCloudEnv(e) {
        this.setData({ cloudEnvId: e.detail.value });
    },
    switchMode() {
        const mode = this.data.mode === 'login' ? 'register' : 'login';
        this.setData({ mode });
    },
    async submit() {
        const username = this.data.username.trim();
        const password = this.data.password;
        const cloudEnvId = this.data.cloudEnvId.trim();
        if (username.length < 2) {
            wx.showToast({ title: '用户名至少 2 个字符', icon: 'none' });
            return;
        }
        if (password.length < 6) {
            wx.showToast({ title: '密码至少 6 位', icon: 'none' });
            return;
        }
        const path = this.data.mode === 'login' ? '/auth/login' : '/auth/register';
        this.setData({ loading: true });
        const res = await (0, cloudSync_1.callCloudPublicPath)(path, { username, password }, cloudEnvId);
        this.setData({ loading: false });
        if (!res.ok || !res.data) {
            wx.showToast({ title: res.message || '失败', icon: 'none' });
            return;
        }
        const d = res.data;
        (0, session_1.saveSession)({
            token: d.token,
            expiresAt: d.expiresAt,
            accountId: d.accountId,
            username: d.username,
            nickName: d.nickName || '',
            avatarUrl: d.avatarUrl || '',
        });
        (0, storage_1.setStorageAccountId)(d.accountId);
        if (cloudEnvId) {
            const cfg = (0, storage_1.loadSyncConfig)();
            (0, storage_1.saveSyncConfig)({ ...cfg, cloudEnvId }, { silent: true });
            wx.cloud.init({ env: cloudEnvId, traceUser: true });
        }
        wx.login({
            success: () => {
                const cfg = (0, storage_1.loadSyncConfig)();
                void (0, sync_1.bindWechatRemote)(cfg);
            },
        });
        const pullMessage = await this.pullAfterLogin();
        wx.showToast({ title: pullMessage, icon: 'none' });
        setTimeout(() => {
            const pages = getCurrentPages();
            if (pages.length > 1) {
                wx.navigateBack({ delta: 1 });
            }
            else {
                wx.reLaunch({ url: '/pages/index/index' });
            }
        }, 900);
    },
});
