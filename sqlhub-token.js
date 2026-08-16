/**
 * SQLHub Token 管理器
 * 独立的 token 获取/缓存/验证模块，可被任何静态网页引用
 *
 * 使用方式：
 *   1. 创建实例：
 *      const tokenManager = new SqlHubToken({
 *          host: '127.0.0.1',
 *          port: 3306,
 *          dbName: 'your_db',
 *          dbUser: 'your_user',
 *          password: 'your_password'
 *      });
 *
 *   2. 获取有效 token（自动处理缓存/验证/刷新）：
 *      const token = await tokenManager.getToken();
 *
 *   3. 直接使用 token 执行 SQL：
 *      const result = await tokenManager.executeSQL('SELECT * FROM users');
 *
 *   4. 也可以只获取 token 给自己的 fetch 用：
 *      const token = await tokenManager.ensureToken();
 *      fetch(url, { headers: { authorization: 'Bearer ' + token } });
 */
class SqlHubToken {
    /**
     * @param {Object} config - 数据库连接配置
     * @param {string} config.host - 数据库主机
     * @param {number} config.port - 数据库端口
     * @param {string} config.dbName - 数据库名
     * @param {string} config.dbUser - 数据库用户名
     * @param {string} config.password - 数据库密码
     * @param {Object} [options] - 额外选项
     * @param {string} [options.storageKey] - localStorage 存储键名，默认 'sqlhub_token'
     * @param {number} [options.cacheDuration] - 内存缓存有效期(毫秒)，默认 5 分钟
     * @param {number} [options.fetchTimeout] - 获取 token 超时(毫秒)，默认 10 秒
     * @param {number} [options.validateTimeout] - 验证 token 超时(毫秒)，默认 5 秒
     */
    constructor(config, options = {}) {
        // 必填参数校验
        const required = ['host', 'port', 'dbName', 'dbUser', 'password'];
        for (const key of required) {
            if (!config[key]) {
                throw new Error(`SqlHubToken: 缺少必填参数 ${key}`);
            }
        }

        this.connectionConfig = {
            host: config.host,
            port: config.port,
            dbName: config.dbName,
            dbUser: config.dbUser,
            password: config.password
        };

        this.baseUrl = 'https://client.sqlpub.com/api/database/execute';
        this.connectionApiUrl = 'https://client.sqlpub.com/api/connection';

        this.storageKey = options.storageKey || 'sqlhub_token';
        this.cacheDuration = options.cacheDuration || 5 * 60 * 1000;
        this.fetchTimeout = options.fetchTimeout || 10000;
        this.validateTimeout = options.validateTimeout || 5000;

        // 内存缓存
        this._cache = {
            token: null,
            lastValidated: 0
        };
    }

    /**
     * 从 localStorage 读取已存储的 token
     * @returns {Promise<string>} token 字符串，可能为空
     */
    getStoredToken() {
        return localStorage.getItem(this.storageKey) || '';
    }

    /**
     * 保存 token 到 localStorage 并更新内存缓存
     * @param {string} token
     */
    saveToken(token) {
        localStorage.setItem(this.storageKey, token);
        this._cache.token = token;
        this._cache.lastValidated = Date.now();
    }

    /**
     * 清除本地存储和内存缓存中的 token
     */
    clearToken() {
        localStorage.removeItem(this.storageKey);
        this._cache.token = null;
        this._cache.lastValidated = 0;
    }

    /**
     * 从服务器获取新的 token
     * @returns {Promise<string>} 新 token
     */
    async fetchNewToken() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeout);
        try {
            const response = await fetch(this.connectionApiUrl, {
                method: 'POST',
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'content-type': 'application/json',
                    'origin': 'https://client.sqlpub.com',
                    'referer': 'https://client.sqlpub.com/workbench'
                },
                body: JSON.stringify(this.connectionConfig),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.success && data.data && data.data.token) {
                const token = data.data.token;
                this.saveToken(token);
                return token;
            } else {
                throw new Error(data.errorMessage || '服务器返回失败');
            }
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('获取 token 超时，请检查网络连接');
            }
            throw new Error(`获取 token 失败: ${error.message}`);
        }
    }

    /**
     * 验证 token 是否仍然有效
     * @param {string} token - 待验证的 token
     * @returns {Promise<boolean>}
     */
    async validateToken(token) {
        if (!token) return false;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.validateTimeout);
        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'authorization': 'Bearer ' + token,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ sql: 'SELECT 1;' }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const data = await response.json();
            return data && data.success;
        } catch (error) {
            clearTimeout(timeoutId);
            return false;
        }
    }

    /**
     * 确保有有效的 token（核心方法）
     * 优先级：内存缓存 → localStorage → 服务器获取
     * @returns {Promise<string>} 有效的 token
     */
    async ensureToken() {
        const now = Date.now();

        // 1. 内存缓存仍然有效
        const cacheIsValid = this._cache.token &&
            (now - this._cache.lastValidated) < this.cacheDuration;
        if (cacheIsValid) {
            return this._cache.token;
        }

        // 2. localStorage 中的 token
        let token = this.getStoredToken();
        if (token) {
            const isValid = await this.validateToken(token);
            if (isValid) {
                this._cache.token = token;
                this._cache.lastValidated = now;
                return token;
            }
        }

        // 3. 从服务器获取新 token
        token = await this.fetchNewToken();
        return token;
    }

    /**
     * 使用 token 执行 SQL（便捷方法）
     * 自动处理 token 获取，执行失败时自动刷新 token 重试一次
     * @param {string} sql - SQL 语句
     * @param {number} [timeout=25000] - 超时时间(毫秒)
     * @returns {Promise<Object>} 服务器返回的 JSON
     */
    async executeSQL(sql, timeout = 25000) {
        const token = await this.ensureToken();

        const doFetch = async (tok) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            try {
                const response = await fetch(this.baseUrl, {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json, text/plain, */*',
                        'authorization': 'Bearer ' + tok,
                        'content-type': 'application/json',
                        'origin': 'https://client.sqlpub.com',
                        'referer': 'https://client.sqlpub.com/workbench'
                    },
                    body: JSON.stringify({ sql }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                return await response.json();
            } catch (error) {
                clearTimeout(timeoutId);
                throw error;
            }
        };

        try {
            return await doFetch(token);
        } catch (error) {
            // token 可能过期，清除缓存后重新获取并重试一次
            if (error.name === 'AbortError') {
                throw new Error('查询超时，请检查网络连接');
            }
            this.clearToken();
            const newToken = await this.fetchNewToken();
            return await doFetch(newToken);
        }
    }
}

// 暴露到全局，供非模块化页面使用
if (typeof window !== 'undefined') {
    window.SqlHubToken = SqlHubToken;
}
