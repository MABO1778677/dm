/**
 * 数据库操作API封装
 * 提供丰富的增删改查功能
 * 依赖：sqlhub-token.js（提供 token 管理和 SQL 执行能力）
 */

/**
 * 用反引号包裹SQL标识符（表名、字段名），避免特殊字符导致语法错误
 * @param {string} name - 标识符名称
 * @returns {string} - 用反引号包裹的标识符
 */
function wrapIdentifier(name) {
    if (!name) return name;
    if (name.startsWith('`') && name.endsWith('`')) return name;
    return '`' + name.replace(/`/g, '``') + '`';
}

class DataHandler {
    constructor() {
        // 兼容模式：优先使用 SqlHubToken，若不可用则回退到原有逻辑
        if (typeof window.SqlHubToken !== 'undefined') {
            try {
                this.tokenManager = new window.SqlHubToken({
                    host: "127.0.0.1",
                    port: 3306,
                    dbName: "ret_db",
                    dbUser: "mb1154",
                    password: "sFkyEt3o7dV0IV1a"
                }, {
                    storageKey: 'tokenTool_sqlToken'
                });
                this.connectionConfig = this.tokenManager.connectionConfig;
                this.useTokenManager = true;
            } catch (e) {
                console.warn('SqlHubToken 初始化失败，使用兼容模式', e);
                this._initFallback();
            }
        } else {
            console.warn('SqlHubToken 未加载，使用兼容模式');
            this._initFallback();
        }
    }

    /**
     * 初始化回退模式（兼容没有 sqlhub-token.js 的场景）
     */
    _initFallback() {
        this.useTokenManager = false;
        this.connectionConfig = {
            host: "127.0.0.1",
            port: 3306,
            dbName: "app_info",
            dbUser: "mb1154820",
            password: "pJbkyzeYJX1bQKTt"
        };
        this.baseUrl = 'https://client.sqlpub.com/api/database/execute';
        this.connectionApiUrl = 'https://client.sqlpub.com/api/connection';
        this.sqlTokenKey = 'tokenTool_sqlToken';
        this.cache = { token: null, lastValidated: 0, validationCacheDuration: 5 * 60 * 1000 };
    }

    /**
     * 执行原始SQL查询
     */
    async executeRawSQL(sql, timeout = 25000) {
        if (this.useTokenManager && this.tokenManager) {
            return await this.tokenManager.executeSQL(sql, timeout);
        }
        // 回退模式
        const token = await this._ensureTokenFallback();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'authorization': 'Bearer ' + token,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ sql }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);
            return await response.json();
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') throw new Error('查询超时');
            throw e;
        }
    }

    async _ensureTokenFallback() {
        const now = Date.now();
        if (this.cache.token && (now - this.cache.lastValidated) < this.cache.validationCacheDuration) {
            return this.cache.token;
        }
        let token = localStorage.getItem(this.sqlTokenKey) || '';
        if (token) {
            const valid = await this._validateTokenFallback(token);
            if (valid) {
                this.cache.token = token;
                this.cache.lastValidated = now;
                return token;
            }
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
            const resp = await fetch(this.connectionApiUrl, {
                method: 'POST',
                headers: { 'accept': 'application/json', 'content-type': 'application/json' },
                body: JSON.stringify(this.connectionConfig),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await resp.json();
            if (data.success && data.data && data.data.token) {
                token = data.data.token;
                localStorage.setItem(this.sqlTokenKey, token);
                this.cache.token = token;
                this.cache.lastValidated = Date.now();
                return token;
            }
            throw new Error(data.errorMessage || '获取token失败');
        } catch (e) {
            clearTimeout(timeoutId);
            throw new Error('获取token失败: ' + e.message);
        }
    }

    async _validateTokenFallback(token) {
        try {
            const resp = await fetch(this.baseUrl, {
                method: 'POST',
                headers: { 'authorization': 'Bearer ' + token, 'content-type': 'application/json' },
                body: JSON.stringify({ sql: 'SELECT 1;' })
            });
            const data = await resp.json();
            return data && data.success;
        } catch {
            return false;
        }
    }

    // ==================== 表结构查询 ====================

    /**
     * 获取数据库中所有表
     */
    async getTables() {
        const dbName = this.connectionConfig.dbName;
        const sql = `SELECT TABLE_NAME as table_name, TABLE_COMMENT as table_comment 
                     FROM INFORMATION_SCHEMA.TABLES 
                     WHERE TABLE_SCHEMA = '${dbName}'`;
        const result = await this.executeRawSQL(sql);
        return result.data || [];
    }

    /**
     * 获取指定表的结构信息
     */
    async getTableStructure(tableName) {
        const dbName = this.connectionConfig.dbName;
        const sql = `SELECT COLUMN_NAME as column_name, DATA_TYPE as data_type, 
                            IS_NULLABLE as is_nullable, COLUMN_DEFAULT as column_default,
                            COLUMN_COMMENT as column_comment
                     FROM INFORMATION_SCHEMA.COLUMNS 
                     WHERE TABLE_SCHEMA = '${dbName}' 
                     AND TABLE_NAME = '${tableName}'`;
        const result = await this.executeRawSQL(sql);
        return result.data || [];
    }

    /**
     * 获取表的主键字段
     */
    async getPrimaryKey(tableName) {
        const dbName = this.connectionConfig.dbName;
        const sql = `SELECT COLUMN_NAME as column_name 
                     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
                     WHERE TABLE_SCHEMA = '${dbName}' 
                     AND TABLE_NAME = '${tableName}' 
                     AND CONSTRAINT_NAME = 'PRIMARY'`;
        const result = await this.executeRawSQL(sql);
        return result.data && result.data.length > 0 ? result.data[0].column_name : null;
    }

    // ==================== 数据查询操作 ====================

    /**
     * 精确查找 - 根据条件精确匹配
     */
    async findExact(tableName, conditions = {}, options = {}) {
        const { fields = '*', limit = null, offset = null } = options;
        
        let whereClause = '';
        const conditionKeys = Object.keys(conditions);
        
        if (conditionKeys.length > 0) {
            const conditions_sql = conditionKeys.map(key => {
                const value = conditions[key];
                if (value === null) {
                    return `${key} IS NULL`;
                }
                return `${key} = '${String(value).replace(/'/g, "''")}'`;
            }).join(' AND ');
            whereClause = `WHERE ${conditions_sql}`;
        }

        let sql = `SELECT ${fields} FROM ${wrapIdentifier(tableName)} ${whereClause}`;
        
        if (limit) {
            sql += ` LIMIT ${limit}`;
        }
        if (offset) {
            sql += ` OFFSET ${offset}`;
        }

        const result = await this.executeRawSQL(sql);
        return result.data || [];
    }

    /**
     * 模糊查找 - 根据关键词模糊匹配
     */
    async findFuzzy(tableName, keyword, searchFields, options = {}) {
        const { fields = '*', limit = null } = options;
        
        if (!searchFields || searchFields.length === 0) {
            throw new Error('模糊查询需要指定搜索字段');
        }

        const escapedKeyword = String(keyword).replace(/'/g, "''");
        const likeConditions = searchFields.map(field => 
            `${field} LIKE '%${escapedKeyword}%'`
        ).join(' OR ');

        let sql = `SELECT ${fields} FROM ${wrapIdentifier(tableName)} WHERE ${likeConditions}`;
        
        if (limit) {
            sql += ` LIMIT ${limit}`;
        }

        const result = await this.executeRawSQL(sql);
        return result.data || [];
    }

    /**
     * 排序查询
     */
    async findWithSort(tableName, options = {}) {
        const { 
            fields = '*', 
            conditions = {},
            sortField = null, 
            sortDirection = 'ASC',
            limit = null,
            offset = null
        } = options;

        let whereClause = '';
        const conditionKeys = Object.keys(conditions);
        
        if (conditionKeys.length > 0) {
            const conditions_sql = conditionKeys.map(key => {
                const value = conditions[key];
                if (value === null) {
                    return `${key} IS NULL`;
                }
                return `${key} = '${String(value).replace(/'/g, "''")}'`;
            }).join(' AND ');
            whereClause = `WHERE ${conditions_sql}`;
        }

        let sql = `SELECT ${fields} FROM ${wrapIdentifier(tableName)} ${whereClause}`;
        
        if (sortField) {
            const direction = sortDirection.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
            sql += ` ORDER BY ${sortField} ${direction}`;
        }
        
        if (limit) {
            sql += ` LIMIT ${limit}`;
        }
        if (offset) {
            sql += ` OFFSET ${offset}`;
        }

        const result = await this.executeRawSQL(sql);
        return result.data || [];
    }

    /**
     * 分页查询
     */
    async findByPage(tableName, page = 1, pageSize = 10, options = {}) {
        const { fields = '*', conditions = {}, sortField = null, sortDirection = 'ASC' } = options;
        const offset = (page - 1) * pageSize;

        const data = await this.findWithSort(tableName, {
            fields,
            conditions,
            sortField,
            sortDirection,
            limit: pageSize,
            offset: offset
        });

        const countResult = await this.count(tableName, conditions);
        
        return {
            data: data,
            pagination: {
                page: page,
                pageSize: pageSize,
                total: countResult,
                totalPages: Math.ceil(countResult / pageSize)
            }
        };
    }

    /**
     * 统计记录数
     */
    async count(tableName, conditions = {}) {
        let whereClause = '';
        const conditionKeys = Object.keys(conditions);
        
        if (conditionKeys.length > 0) {
            const conditions_sql = conditionKeys.map(key => {
                const value = conditions[key];
                if (value === null) {
                    return `${key} IS NULL`;
                }
                return `${key} = '${String(value).replace(/'/g, "''")}'`;
            }).join(' AND ');
            whereClause = `WHERE ${conditions_sql}`;
        }

        const sql = `SELECT COUNT(*) as count FROM ${wrapIdentifier(tableName)} ${whereClause}`;
        const result = await this.executeRawSQL(sql);
        return result.data && result.data[0] ? result.data[0].count : 0;
    }

    /**
     * 根据ID查询单条记录
     */
    async findById(tableName, id, idField = 'id') {
        const result = await this.findExact(tableName, { [idField]: id }, { limit: 1 });
        return result.length > 0 ? result[0] : null;
    }

    // ==================== 数据修改操作 ====================

    /**
     * 插入单条记录
     */
    async insert(tableName, data) {
        const keys = Object.keys(data);
        const values = keys.map(key => {
            const value = data[key];
            if (value === null || value === undefined) {
                return 'NULL';
            }
            return `'${String(value).replace(/'/g, "''")}'`;
        });

        const sql = `INSERT INTO ${wrapIdentifier(tableName)} (${keys.join(', ')}) VALUES (${values.join(', ')})`;
        return await this.executeRawSQL(sql);
    }

    /**
     * 批量插入记录
     */
    async batchInsert(tableName, dataArray) {
        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            throw new Error('批量插入需要数组数据');
        }

        const keys = Object.keys(dataArray[0]);
        const valueGroups = dataArray.map(data => {
            const values = keys.map(key => {
                const value = data[key];
                if (value === null || value === undefined) {
                    return 'NULL';
                }
                return `'${String(value).replace(/'/g, "''")}'`;
            });
            return `(${values.join(', ')})`;
        });

        const sql = `INSERT INTO ${wrapIdentifier(tableName)} (${keys.join(', ')}) VALUES ${valueGroups.join(', ')}`;
        return await this.executeRawSQL(sql);
    }

    /**
     * 更新单条记录
     */
    async update(tableName, data, conditions) {
        const setClause = Object.keys(data).map(key => {
            const value = data[key];
            if (value === null || value === undefined) {
                return `${key} = NULL`;
            }
            return `${key} = '${String(value).replace(/'/g, "''")}'`;
        }).join(', ');

        const whereClause = Object.keys(conditions).map(key => {
            const value = conditions[key];
            if (value === null) {
                return `${key} IS NULL`;
            }
            return `${key} = '${String(value).replace(/'/g, "''")}'`;
        }).join(' AND ');

        const sql = `UPDATE ${wrapIdentifier(tableName)} SET ${setClause} WHERE ${whereClause}`;
        return await this.executeRawSQL(sql);
    }

    /**
     * 批量更新记录（使用CASE WHEN）
     */
    async batchUpdate(tableName, dataArray, idField = 'id') {
        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            throw new Error('批量更新需要数组数据');
        }

        const ids = dataArray.map(item => item[idField]);
        const fields = Object.keys(dataArray[0]).filter(f => f !== idField);

        const setClauses = fields.map(field => {
            const whenClauses = dataArray.map(item => {
                const value = item[field];
                const valStr = value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`;
                return `WHEN ${idField} = '${item[idField]}' THEN ${valStr}`;
            }).join(' ');
            return `${field} = CASE ${whenClauses} ELSE ${field} END`;
        }).join(', ');

        const idList = ids.map(id => `'${id}'`).join(', ');
        const sql = `UPDATE ${wrapIdentifier(tableName)} SET ${setClauses} WHERE ${idField} IN (${idList})`;
        
        return await this.executeRawSQL(sql);
    }

    /**
     * 删除记录
     */
    async delete(tableName, conditions) {
        const whereClause = Object.keys(conditions).map(key => {
            const value = conditions[key];
            if (value === null) {
                return `${key} IS NULL`;
            }
            return `${key} = '${String(value).replace(/'/g, "''")}'`;
        }).join(' AND ');

        const sql = `DELETE FROM ${wrapIdentifier(tableName)} WHERE ${whereClause}`;
        return await this.executeRawSQL(sql);
    }

    /**
     * 根据ID删除记录
     */
    async deleteById(tableName, id, idField = 'id') {
        return await this.delete(tableName, { [idField]: id });
    }

    /**
     * 批量删除记录
     */
    async batchDelete(tableName, ids, idField = 'id') {
        const idList = ids.map(id => `'${id}'`).join(', ');
        const sql = `DELETE FROM ${wrapIdentifier(tableName)} WHERE ${idField} IN (${idList})`;
        return await this.executeRawSQL(sql);
    }

    // ==================== 高级查询操作 ====================

    /**
     * 范围查询
     */
    async findInRange(tableName, field, minValue, maxValue, options = {}) {
        const { fields = '*', limit = null } = options;
        
        let sql = `SELECT ${fields} FROM ${wrapIdentifier(tableName)} WHERE ${field} >= '${minValue}' AND ${field} <= '${maxValue}'`;
        
        if (limit) {
            sql += ` LIMIT ${limit}`;
        }

        const result = await this.executeRawSQL(sql);
        return result.data || [];
    }

    /**
     * IN查询
     */
    async findIn(tableName, field, values, options = {}) {
        const { fields = '*', limit = null } = options;
        
        const valueList = values.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ');
        let sql = `SELECT ${fields} FROM ${wrapIdentifier(tableName)} WHERE ${field} IN (${valueList})`;
        
        if (limit) {
            sql += ` LIMIT ${limit}`;
        }

        const result = await this.executeRawSQL(sql);
        return result.data || [];
    }

    /**
     * 聚合查询
     */
    async aggregate(tableName, aggregations, options = {}) {
        const { conditions = {}, groupBy = null } = options;
        
        const aggFields = Object.entries(aggregations).map(([alias, func]) => {
            return `${func} as ${alias}`;
        }).join(', ');

        let whereClause = '';
        const conditionKeys = Object.keys(conditions);
        
        if (conditionKeys.length > 0) {
            const conditions_sql = conditionKeys.map(key => {
                const value = conditions[key];
                if (value === null) {
                    return `${key} IS NULL`;
                }
                return `${key} = '${String(value).replace(/'/g, "''")}'`;
            }).join(' AND ');
            whereClause = `WHERE ${conditions_sql}`;
        }

        let sql = `SELECT ${aggFields} FROM ${wrapIdentifier(tableName)} ${whereClause}`;
        
        if (groupBy) {
            sql += ` GROUP BY ${groupBy}`;
        }

        const result = await this.executeRawSQL(sql);
        return result.data || [];
    }

    /**
     * 多表关联查询
     */
    async joinQuery(mainTable, joins, options = {}) {
        const { fields = '*', conditions = {} } = options;
        
        let joinClause = joins.map(j => {
            const joinType = j.type || 'INNER';
            return `${joinType} JOIN ${wrapIdentifier(j.table)} ON ${j.on}`;
        }).join(' ');

        let whereClause = '';
        const conditionKeys = Object.keys(conditions);

        if (conditionKeys.length > 0) {
            const conditions_sql = conditionKeys.map(key => {
                const value = conditions[key];
                if (value === null) {
                    return `${key} IS NULL`;
                }
                return `${key} = '${String(value).replace(/'/g, "''")}'`;
            }).join(' AND ');
            whereClause = `WHERE ${conditions_sql}`;
        }

        const sql = `SELECT ${fields} FROM ${wrapIdentifier(mainTable)} ${joinClause} ${whereClause}`;
        const result = await this.executeRawSQL(sql);
        return result.data || [];
    }
}

// 创建全局实例
window.dataHandler = new DataHandler();
