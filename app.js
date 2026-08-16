/**
 * SQL 数据管理器 - 主应用逻辑
 */

// 全局状态
const state = {
    currentData: [],
    currentPage: 1,
    itemsPerPage: 10,
    sortField: null,
    sortDirection: 'asc',
    isLoading: false
};

// 智能查询状态
const smartQueryState = {
    tables: [],           // 所有表名
    tableStructure: {},   // 表结构缓存 { tableName: [columns] }
    conditions: [],       // 当前条件列表
    currentTable: '',     // 当前选中的表
    selectedFields: [],   // 选中的字段列表
    generatedSQL: '',     // 生成的SQL
    queryHistory: []      // 查询历史
};

// DOM 元素
const elements = {
    sqlInput: document.getElementById('sqlInput'),
    executeBtn: document.getElementById('executeBtn'),
    resetBtn: document.getElementById('resetBtn'),
    getTablesBtn: document.getElementById('getTablesBtn'),
    tableHeader: document.getElementById('tableHeader'),
    tableBody: document.getElementById('tableBody'),
    pagination: document.getElementById('pagination')
};

// 智能查询 DOM 元素
const smartElements = {
    step2: document.getElementById('step2'),
    tableSelect: document.getElementById('smartTableSelect'),
    fieldsCheckboxList: document.getElementById('fieldsCheckboxList'),
    selectAllFieldsBtn: document.getElementById('selectAllFields'),
    deselectAllFieldsBtn: document.getElementById('deselectAllFields'),
    clearUncheckedFieldsBtn: document.getElementById('clearUncheckedFields'),
    conditionsList: document.getElementById('conditionsList'),
    addConditionBtn: document.getElementById('addConditionBtn'),
    reportTableName: document.getElementById('reportTableName'),
    selectedFieldsSummary: document.getElementById('selectedFieldsSummary'),
    conditionsSummary: document.getElementById('conditionsSummary'),
    andConditions: document.getElementById('andConditions'),
    orConditions: document.getElementById('orConditions'),
    showSQLBtn: document.getElementById('showSQLBtn'),
    executeSmartQueryBtn: document.getElementById('executeSmartQueryBtn'),
    sqlDisplay: document.getElementById('sqlDisplay'),
    generatedSQL: document.getElementById('generatedSQL'),
    historyList: document.getElementById('historyList')
};

// 查询历史存储键
const HISTORY_KEY = 'smartQueryHistory';

/**
 * 显示通知消息
 */
function showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

/**
 * 显示加载状态
 */
function showLoading() {
    state.isLoading = true;
    elements.executeBtn.disabled = true;
    elements.tableBody.innerHTML = `
        <tr>
            <td colspan="100%">
                <div class="loading">
                    <div class="spinner"></div>
                    <p>正在查询数据...</p>
                </div>
            </td>
        </tr>
    `;
    elements.tableHeader.innerHTML = '';
    elements.pagination.innerHTML = '';
}

/**
 * 隐藏加载状态
 */
function hideLoading() {
    state.isLoading = false;
    elements.executeBtn.disabled = false;
}

/**
 * 显示空状态
 */
function showEmptyState(message = '暂无数据') {
    elements.tableBody.innerHTML = `
        <tr>
            <td colspan="100%">
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <div class="empty-state-text">${message}</div>
                </div>
            </td>
        </tr>
    `;
}

/**
 * 显示错误状态
 */
function showError(message) {
    elements.tableBody.innerHTML = `
        <tr>
            <td colspan="100%">
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <div class="empty-state-text" style="color: #f44336;">${message}</div>
                </div>
            </td>
        </tr>
    `;
}

/**
 * 检查并清理不存在的表的缓存
 */
function checkAndCleanTableCache(errorMessage) {
    // 检查是否是表不存在的错误 (Error 1146)
    if (!errorMessage || !errorMessage.includes('Error 1146')) {
        return;
    }

    // 提取表名 - 匹配 "Table 'database.table' doesn't exist" 格式
    const match = errorMessage.match(/Table\s+'[^']+\.([^']+)'\s+doesn't\s+exist/i);
    if (!match) {
        return;
    }

    const deletedTableName = match[1];

    // 清理表结构缓存
    if (smartQueryState.tableStructure[deletedTableName]) {
        delete smartQueryState.tableStructure[deletedTableName];
    }

    // 清理查询历史中与该表相关的记录
    const beforeCount = smartQueryState.queryHistory.length;
    smartQueryState.queryHistory = smartQueryState.queryHistory.filter(
        item => item.tableName !== deletedTableName
    );
    const afterCount = smartQueryState.queryHistory.length;

    // 保存更新后的历史
    saveQueryHistory();

    // 如果当前选中的表被删除了，重置当前表
    if (smartQueryState.currentTable === deletedTableName) {
        smartQueryState.currentTable = '';
        smartQueryState.selectedFields = [];
        smartQueryState.conditions = [];
        smartElements.tableSelect.value = '';
        smartElements.fieldsCheckboxList.innerHTML = '<p class="fields-hint">请先选择数据表</p>';
        smartElements.conditionsList.innerHTML = '<p class="conditions-hint">请先选择数据表</p>';
        smartElements.step2.classList.remove('active');
        smartElements.sqlDisplay.classList.add('hidden');
    }

    // 重新渲染历史记录
    renderQueryHistory();

    // 显示清理通知
    const cleanedCount = beforeCount - afterCount;
    if (cleanedCount > 0) {
        showNotification(`检测到表 "${deletedTableName}" 已被删除，已清理 ${cleanedCount} 条相关查询记录`, 'warning');
    } else {
        showNotification(`检测到表 "${deletedTableName}" 已被删除`, 'warning');
    }
}

/**
 * 执行SQL查询
 */
async function executeSQL() {
    const sql = elements.sqlInput.value.trim();

    if (!sql) {
        showNotification('请输入SQL语句', 'warning');
        return;
    }

    showLoading();
    const startTime = Date.now();

    try {
        const result = await dataHandler.executeRawSQL(sql);
        const executionTime = Date.now() - startTime;

        if (result.success) {
            if (result.data && Array.isArray(result.data)) {
                state.currentData = result.data;
                state.currentPage = 1;
                state.sortField = null;
                state.sortDirection = 'asc';
                renderTable();
                showNotification(`查询成功，返回 ${result.data.length} 条记录 (${executionTime}ms)`, 'success');
            } else {
                state.currentData = [];
                showEmptyState('查询成功，但没有返回数据');
                showNotification(`执行成功 (${executionTime}ms)`, 'success');
            }
        } else {
            // 检查是否是表不存在的错误，如果是则清理缓存
            checkAndCleanTableCache(result.errorMessage);
            showError(result.errorMessage || '查询失败');
            showNotification(result.errorMessage || '查询失败', 'error');
        }
    } catch (error) {
        console.error('SQL执行错误:', error);
        // 检查是否是表不存在的错误，如果是则清理缓存
        checkAndCleanTableCache(error.message);
        showError(error.message || '执行出错');
        showNotification(error.message || '执行出错', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 获取所有表
 */
async function getAllTables() {
    elements.sqlInput.value = `-- 查询数据库中的所有表
SELECT TABLE_NAME as 表名, TABLE_COMMENT as 表注释 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE();`;
    await executeSQL();
}

/**
 * 渲染表格
 */

/**
 * 显示图片预览
 */
function showImagePreview(src) {
    // 移除已存在的预览
    const existing = document.querySelector('.img-preview-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'img-preview-overlay';
    overlay.innerHTML = `
        <div class="img-preview-box">
            <img src="${src}" alt="预览">
            <button class="img-preview-close">&times;</button>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.classList.contains('img-preview-close')) {
            overlay.remove();
        }
    });
}

function renderTable() {
    if (state.currentData.length === 0) {
        showEmptyState();
        return;
    }

    const fields = Object.keys(state.currentData[0]);

    // 渲染表头
    const headerRow = document.createElement('tr');
    fields.forEach(field => {
        const th = document.createElement('th');
        th.textContent = field;
        th.setAttribute('data-field', field);
        th.addEventListener('click', () => handleSort(field));

        const sortIndicator = document.createElement('span');
        sortIndicator.className = 'sort-indicator';
        if (state.sortField === field) {
            sortIndicator.textContent = state.sortDirection === 'asc' ? '↑' : '↓';
        } else {
            sortIndicator.textContent = '↕';
        }
        th.appendChild(sortIndicator);
        headerRow.appendChild(th);
    });
    elements.tableHeader.innerHTML = '';
    elements.tableHeader.appendChild(headerRow);

    // 应用排序
    let sortedData = [...state.currentData];
    if (state.sortField) {
        sortedData.sort((a, b) => {
            const aVal = a[state.sortField];
            const bVal = b[state.sortField];
            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;
            if (aVal < bVal) return state.sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return state.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // 应用分页
    const startIndex = (state.currentPage - 1) * state.itemsPerPage;
    const endIndex = startIndex + state.itemsPerPage;
    const paginatedData = sortedData.slice(startIndex, endIndex);

    // 渲染表格主体
    elements.tableBody.innerHTML = '';
    paginatedData.forEach(rowData => {
        const tr = document.createElement('tr');
        fields.forEach(field => {
            const td = document.createElement('td');
            const value = rowData[field];
            if (value !== null && value !== undefined) {
                const strValue = String(value);
                if (strValue.startsWith('data:image/')) {
                    const img = document.createElement('img');
                    img.src = strValue;
                    img.alt = '图片';
                    img.className = 'table-cell-img';
                    img.addEventListener('click', () => showImagePreview(strValue));
                    td.appendChild(img);
                } else {
                    td.textContent = strValue;
                    td.title = strValue;
                }
            } else {
                td.textContent = '';
            }
            tr.appendChild(td);
        });
        elements.tableBody.appendChild(tr);
    });

    // 渲染分页
    renderPagination(sortedData.length);
}

/**
 * 处理排序
 */
function handleSort(field) {
    if (state.sortField === field) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortField = field;
        state.sortDirection = 'asc';
    }
    state.currentPage = 1;
    renderTable();
}

/**
 * 渲染分页控件
 */
function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / state.itemsPerPage);

    if (totalPages <= 1) {
        elements.pagination.innerHTML = `<span class="pagination-info">共 ${totalItems} 条记录</span>`;
        return;
    }

    let html = '';

    // 上一页
    html += `<button data-page="${state.currentPage - 1}" ${state.currentPage === 1 ? 'disabled' : ''}>上一页</button>`;

    // 页码
    const maxVisible = 5;
    let startPage = Math.max(1, state.currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    
    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
        html += `<button data-page="1">1</button>`;
        if (startPage > 2) html += `<span>...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button data-page="${i}" class="${i === state.currentPage ? 'active' : ''}">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span>...</span>`;
        html += `<button data-page="${totalPages}">${totalPages}</button>`;
    }

    // 下一页
    html += `<button data-page="${state.currentPage + 1}" ${state.currentPage === totalPages ? 'disabled' : ''}>下一页</button>`;

    html += `<span class="pagination-info">共 ${totalItems} 条记录，${totalPages} 页</span>`;

    elements.pagination.innerHTML = html;

    // 使用事件委托绑定分页按钮
    elements.pagination.querySelectorAll('button[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            if (!isNaN(page)) {
                changePage(page);
            }
        });
    });
}

/**
 * 切换页面
 */
function changePage(page) {
    state.currentPage = page;
    renderTable();
}

/**
 * 重置
 */
function reset() {
    elements.sqlInput.value = `-- 查询数据库中的所有表
SELECT TABLE_NAME as 表名, TABLE_COMMENT as 表注释 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE();`;
    state.currentData = [];
    state.currentPage = 1;
    state.sortField = null;
    state.sortDirection = 'asc';
    elements.tableHeader.innerHTML = '';
    elements.tableBody.innerHTML = '';
    elements.pagination.innerHTML = '';
    showEmptyState('点击"执行查询"开始');
}

/**
 * 快捷查询
 */
function quickQuery(sql) {
    elements.sqlInput.value = sql;
    executeSQL();
}

// ==================== 智能查询功能 ====================

/**
 * 加载查询历史
 */
function loadQueryHistory() {
    try {
        const history = localStorage.getItem(HISTORY_KEY);
        if (history) {
            smartQueryState.queryHistory = JSON.parse(history);
        }
    } catch (e) {
        console.error('加载查询历史失败:', e);
        smartQueryState.queryHistory = [];
    }
    renderQueryHistory();
}

/**
 * 保存查询历史
 */
function saveQueryHistory() {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(smartQueryState.queryHistory));
    } catch (e) {
        console.error('保存查询历史失败:', e);
    }
}

/**
 * 添加查询到历史
 */
function addToHistory(queryData) {
    const historyItem = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        tableName: queryData.tableName,
        selectedFields: queryData.selectedFields,
        conditions: queryData.conditions,
        andIndices: queryData.andIndices,
        orIndices: queryData.orIndices
    };
    
    // 添加到开头，限制5条
    smartQueryState.queryHistory.unshift(historyItem);
    if (smartQueryState.queryHistory.length > 5) {
        smartQueryState.queryHistory = smartQueryState.queryHistory.slice(0, 5);
    }
    
    saveQueryHistory();
    renderQueryHistory();
}

/**
 * 渲染查询历史
 */
function renderQueryHistory() {
    if (smartQueryState.queryHistory.length === 0) {
        smartElements.historyList.innerHTML = '<p class="history-empty">暂无查询记录</p>';
        return;
    }
    
    smartElements.historyList.innerHTML = '';
    smartQueryState.queryHistory.forEach((item, index) => {
        const historyEl = document.createElement('div');
        historyEl.className = 'history-item';
        
        const time = new Date(item.timestamp).toLocaleString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const fieldsCount = item.selectedFields.length;
        const conditionsCount = item.conditions.length;
        
        historyEl.innerHTML = `
            <div class="history-item-info">
                <div class="history-item-title">表: ${item.tableName}</div>
                <div class="history-item-desc">
                    ${fieldsCount > 0 ? `字段: ${fieldsCount}个` : '字段: 全部'} | 
                    条件: ${conditionsCount}个
                </div>
            </div>
            <span class="history-item-time">${time}</span>
            <button class="history-item-delete" data-id="${item.id}">删除</button>
        `;
        
        // 点击加载历史记录
        historyEl.addEventListener('click', (e) => {
            if (!e.target.classList.contains('history-item-delete')) {
                loadHistoryItem(item);
            }
        });
        
        // 删除按钮
        const deleteBtn = historyEl.querySelector('.history-item-delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteHistoryItem(item.id);
        });
        
        smartElements.historyList.appendChild(historyEl);
    });
}

/**
 * 加载历史记录到表单
 */
async function loadHistoryItem(item) {
    // 选择表
    smartElements.tableSelect.value = item.tableName;
    await handleTableChange();

    // 恢复选中的字段
    smartQueryState.selectedFields = [...item.selectedFields];
    renderFieldsCheckbox();

    // 恢复条件
    smartQueryState.conditions = item.conditions.map((c, idx) => ({
        ...c,
        id: Date.now() + idx
    }));
    renderConditions();

    // 恢复与或条件
    smartElements.andConditions.value = item.andIndices ? item.andIndices.join(',') : '';
    smartElements.orConditions.value = item.orIndices ? item.orIndices.join(',') : '';

    // 同步更新报告（使用getOrderedSelectedFields确保顺序一致）
    updateQueryReport();

    showNotification('已加载历史查询', 'success');
}

/**
 * 删除历史记录
 */
function deleteHistoryItem(id) {
    smartQueryState.queryHistory = smartQueryState.queryHistory.filter(item => item.id !== id);
    saveQueryHistory();
    renderQueryHistory();
    showNotification('已删除查询记录', 'info');
}

/**
 * 初始化智能查询 - 加载所有表
 */
async function initSmartQuery() {
    // 加载查询历史
    loadQueryHistory();
    
    try {
        const tables = await dataHandler.getTables();
        smartQueryState.tables = tables.map(t => t.table_name);
        
        // 填充下拉框
        smartElements.tableSelect.innerHTML = '<option value="">-- 请选择表 --</option>';
        tables.forEach(table => {
            const option = document.createElement('option');
            option.value = table.table_name;
            option.textContent = table.table_comment 
                ? `${table.table_name} (${table.table_comment})` 
                : table.table_name;
            smartElements.tableSelect.appendChild(option);
        });
        
        showNotification('已加载数据库表列表', 'success');
    } catch (error) {
        console.error('加载表列表失败:', error);
        showNotification('加载表列表失败', 'error');
    }
}

/**
 * 加载表结构
 */
async function loadTableStructure(tableName) {
    if (!tableName) return;
    
    // 如果已缓存，直接返回
    if (smartQueryState.tableStructure[tableName]) {
        return smartQueryState.tableStructure[tableName];
    }
    
    try {
        const structure = await dataHandler.getTableStructure(tableName);
        smartQueryState.tableStructure[tableName] = structure;
        return structure;
    } catch (error) {
        console.error('加载表结构失败:', error);
        showNotification('加载表结构失败', 'error');
        return [];
    }
}

/**
 * 渲染字段复选框（带拖拽排序）
 */
function renderFieldsCheckbox() {
    const structure = smartQueryState.tableStructure[smartQueryState.currentTable] || [];

    if (structure.length === 0) {
        smartElements.fieldsCheckboxList.innerHTML = '<p class="fields-hint">请先选择数据表</p>';
        return;
    }

    smartElements.fieldsCheckboxList.innerHTML = '';

    // 按表结构顺序渲染字段
    structure.forEach((col, index) => {
        const checkboxItem = document.createElement('div');
        checkboxItem.className = 'checkbox-item';
        checkboxItem.draggable = true;
        checkboxItem.dataset.index = index;
        checkboxItem.dataset.field = col.column_name;

        const isChecked = smartQueryState.selectedFields.includes(col.column_name);
        if (isChecked) {
            checkboxItem.classList.add('checked');
        }

        checkboxItem.innerHTML = `
            <label class="checkbox-left">
                <input type="checkbox" value="${col.column_name}" ${isChecked ? 'checked' : ''}>
                <span class="checkbox-custom"></span>
                <span class="checkbox-label" title="${col.column_name}">${col.column_name}</span>
                ${col.column_comment ? `<span class="checkbox-comment">${col.column_comment}</span>` : ''}
            </label>
            <span class="drag-handle" title="拖拽排序">⋮⋮</span>
        `;

        // 绑定change事件 - 实时同步更新
        const checkbox = checkboxItem.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (!smartQueryState.selectedFields.includes(col.column_name)) {
                    smartQueryState.selectedFields.push(col.column_name);
                }
                checkboxItem.classList.add('checked');
            } else {
                smartQueryState.selectedFields = smartQueryState.selectedFields.filter(
                    f => f !== col.column_name
                );
                checkboxItem.classList.remove('checked');
            }
            // 实时同步更新：已选字段摘要和生成的SQL
            updateSelectedFieldsSummary();
            if (!smartElements.sqlDisplay.classList.contains('hidden')) {
                generateSQL();
            }
        });

        // 拖拽事件
        checkboxItem.addEventListener('dragstart', handleDragStart);
        checkboxItem.addEventListener('dragover', handleDragOver);
        checkboxItem.addEventListener('drop', handleDrop);
        checkboxItem.addEventListener('dragend', handleDragEnd);
        checkboxItem.addEventListener('dragenter', handleDragEnter);
        checkboxItem.addEventListener('dragleave', handleDragLeave);

        smartElements.fieldsCheckboxList.appendChild(checkboxItem);
    });
}

// 拖拽状态
let dragSrcEl = null;
let dragSrcIndex = null;

function handleDragStart(e) {
    dragSrcEl = this;
    dragSrcIndex = parseInt(this.dataset.index);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    if (this !== dragSrcEl) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    if (dragSrcEl !== this) {
        const dragTargetIndex = parseInt(this.dataset.index);

        // 重新排序表结构
        const structure = smartQueryState.tableStructure[smartQueryState.currentTable];
        const movedItem = structure.splice(dragSrcIndex, 1)[0];
        structure.splice(dragTargetIndex, 0, movedItem);

        // 更新表结构缓存
        smartQueryState.tableStructure[smartQueryState.currentTable] = structure;

        // 同步更新三处：1.字段选择列表 2.已选字段摘要 3.生成的SQL
        renderFieldsCheckbox();
        updateSelectedFieldsSummary();
        if (!smartElements.sqlDisplay.classList.contains('hidden')) {
            generateSQL();
        }

        showNotification('字段顺序已更新', 'success');
    }

    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.checkbox-item').forEach(item => {
        item.classList.remove('drag-over');
    });
}

/**
 * 全选字段
 */
function selectAllFields() {
    const structure = smartQueryState.tableStructure[smartQueryState.currentTable] || [];
    smartQueryState.selectedFields = structure.map(col => col.column_name);
    renderFieldsCheckbox();
    // 实时同步更新
    updateSelectedFieldsSummary();
    if (!smartElements.sqlDisplay.classList.contains('hidden')) {
        generateSQL();
    }
}

/**
 * 全不选字段
 */
function deselectAllFields() {
    smartQueryState.selectedFields = [];
    renderFieldsCheckbox();
    // 实时同步更新
    updateSelectedFieldsSummary();
    if (!smartElements.sqlDisplay.classList.contains('hidden')) {
        generateSQL();
    }
}

/**
 * 清除未选中的字段（只保留选中的字段在列表中）
 */
function clearUncheckedFields() {
    const structure = smartQueryState.tableStructure[smartQueryState.currentTable] || [];

    if (smartQueryState.selectedFields.length === 0) {
        showNotification('没有选中的字段，请先选择字段', 'warning');
        return;
    }

    // 过滤只保留选中的字段，保持选中顺序
    const newStructure = [];
    smartQueryState.selectedFields.forEach(fieldName => {
        const field = structure.find(col => col.column_name === fieldName);
        if (field) {
            newStructure.push(field);
        }
    });

    // 更新表结构缓存
    smartQueryState.tableStructure[smartQueryState.currentTable] = newStructure;

    // 重新渲染并同步更新
    renderFieldsCheckbox();
    updateSelectedFieldsSummary();
    if (!smartElements.sqlDisplay.classList.contains('hidden')) {
        generateSQL();
    }

    showNotification(`已清除未选中字段，保留 ${newStructure.length} 个字段`, 'success');
}

/**
 * 添加条件
 */
function addCondition() {
    if (!smartQueryState.currentTable) {
        showNotification('请先选择数据表', 'warning');
        return;
    }

    const structure = smartQueryState.tableStructure[smartQueryState.currentTable];
    if (!structure || structure.length === 0) {
        showNotification('表结构未加载', 'warning');
        return;
    }

    const conditionIndex = smartQueryState.conditions.length + 1;
    const condition = {
        id: Date.now(),
        index: conditionIndex,
        field: structure[0].column_name,
        matchType: 'exact',
        value: ''
    };

    smartQueryState.conditions.push(condition);
    renderConditions();
    // 实时同步更新报告
    updateQueryReport();
    if (!smartElements.sqlDisplay.classList.contains('hidden')) {
        generateSQL();
    }
}

/**
 * 删除条件
 */
function removeCondition(id) {
    smartQueryState.conditions = smartQueryState.conditions.filter(c => c.id !== id);
    // 重新编号
    smartQueryState.conditions.forEach((c, idx) => {
        c.index = idx + 1;
    });
    renderConditions();
    // 实时同步更新报告
    updateQueryReport();
    if (!smartElements.sqlDisplay.classList.contains('hidden')) {
        generateSQL();
    }
}

/**
 * 更新条件
 */
function updateCondition(id, field, value) {
    const condition = smartQueryState.conditions.find(c => c.id === id);
    if (condition) {
        condition[field] = value;
        // 实时同步更新报告
        updateQueryReport();
        if (!smartElements.sqlDisplay.classList.contains('hidden')) {
            generateSQL();
        }
    }
}

/**
 * 渲染条件列表
 */
function renderConditions() {
    const structure = smartQueryState.tableStructure[smartQueryState.currentTable] || [];
    
    smartElements.conditionsList.innerHTML = '';
    
    if (smartQueryState.conditions.length === 0) {
        smartElements.conditionsList.innerHTML = '<p class="conditions-hint">暂无条件，点击"添加条件"按钮添加</p>';
        return;
    }
    
    smartQueryState.conditions.forEach(condition => {
        const row = document.createElement('div');
        row.className = 'condition-row';
        
        // 条件编号
        const numSpan = document.createElement('span');
        numSpan.className = 'condition-number';
        numSpan.textContent = condition.index;
        row.appendChild(numSpan);
        
        // 字段选择
        const fieldSelect = document.createElement('select');
        structure.forEach(col => {
            const option = document.createElement('option');
            option.value = col.column_name;
            option.textContent = col.column_comment 
                ? `${col.column_name} (${col.column_comment})`
                : col.column_name;
            if (col.column_name === condition.field) {
                option.selected = true;
            }
            fieldSelect.appendChild(option);
        });
        fieldSelect.onchange = (e) => updateCondition(condition.id, 'field', e.target.value);
        row.appendChild(fieldSelect);
        
        // 匹配类型
        const matchSelect = document.createElement('select');
        matchSelect.className = 'match-type';
        const matchTypes = [
            { value: 'exact', text: '精确匹配' },
            { value: 'fuzzy', text: '模糊匹配' }
        ];
        matchTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.value;
            option.textContent = type.text;
            if (type.value === condition.matchType) {
                option.selected = true;
            }
            matchSelect.appendChild(option);
        });
        matchSelect.onchange = (e) => updateCondition(condition.id, 'matchType', e.target.value);
        row.appendChild(matchSelect);
        
        // 值输入
        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.placeholder = '输入匹配值';
        valueInput.value = condition.value;
        valueInput.onchange = (e) => updateCondition(condition.id, 'value', e.target.value);
        valueInput.oninput = (e) => updateCondition(condition.id, 'value', e.target.value);
        row.appendChild(valueInput);
        
        // 删除按钮
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove';
        removeBtn.textContent = '删除';
        removeBtn.addEventListener('click', () => removeCondition(condition.id));
        row.appendChild(removeBtn);
        
        smartElements.conditionsList.appendChild(row);
    });
}

/**
 * 获取按当前表结构顺序排列的选中字段
 */
function getOrderedSelectedFields() {
    const structure = smartQueryState.tableStructure[smartQueryState.currentTable] || [];
    // 按表结构顺序过滤出选中的字段
    return structure
        .filter(col => smartQueryState.selectedFields.includes(col.column_name))
        .map(col => col.column_name);
}

/**
 * 更新已选字段摘要（用于拖拽排序后同步更新）
 */
function updateSelectedFieldsSummary() {
    if (!smartQueryState.currentTable) return;

    smartElements.selectedFieldsSummary.innerHTML = '';
    const orderedFields = getOrderedSelectedFields();
    if (orderedFields.length > 0) {
        smartElements.selectedFieldsSummary.innerHTML = `
            <h4>📋 已选字段（${orderedFields.length}个）</h4>
            <div class="fields-list">${orderedFields.join(', ')}</div>
        `;
    } else {
        smartElements.selectedFieldsSummary.innerHTML = `
            <h4>📋 查询字段</h4>
            <div class="fields-list">全部字段（*）</div>
        `;
    }
}

/**
 * 更新查询报告（实时同步）
 */
function updateQueryReport() {
    if (!smartQueryState.currentTable) {
        smartElements.step2.classList.remove('active');
        return;
    }

    // 显示报告
    smartElements.reportTableName.textContent = smartQueryState.currentTable;

    // 渲染选中字段摘要
    updateSelectedFieldsSummary();

    // 渲染条件摘要
    if (smartQueryState.conditions.length > 0) {
        smartElements.conditionsSummary.innerHTML = '<h4>🔍 查询条件列表：</h4>';
        smartQueryState.conditions.forEach(condition => {
            const item = document.createElement('div');
            item.className = 'condition-item';
            const matchText = condition.matchType === 'exact' ? '精确匹配' : '模糊匹配';
            item.innerHTML = `
                <span class="cond-num">${condition.index}</span>
                <span class="cond-text">字段 <strong>${condition.field}</strong>，${matchText}，<strong>${condition.value}</strong></span>
            `;
            smartElements.conditionsSummary.appendChild(item);
        });
    } else {
        smartElements.conditionsSummary.innerHTML = '<h4>🔍 查询条件</h4><p style="color: #999; font-size: 13px;">无条件限制（查询所有数据）</p>';
    }

    // 激活步骤2
    smartElements.step2.classList.add('active');
}

/**
 * 生成SQL语句
 */
function generateSQL() {
    const tableName = smartQueryState.currentTable;
    const conditions = smartQueryState.conditions;
    
    // 解析与条件和或条件
    const andInput = smartElements.andConditions.value.trim();
    const orInput = smartElements.orConditions.value.trim();
    
    const andIndices = andInput ? andInput.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0 && n <= conditions.length) : [];
    const orIndices = orInput ? orInput.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0 && n <= conditions.length) : [];
    
    // 构建SELECT字段（按表结构顺序，用反引号包裹避免特殊字符问题）
    let fieldsStr = '*';
    const orderedFields = getOrderedSelectedFields();
    if (orderedFields.length > 0) {
        fieldsStr = orderedFields.map(f => `\`${f}\``).join(', ');
    }
    
    // 构建WHERE子句
    let whereParts = [];
    
    conditions.forEach((condition, idx) => {
        const conditionNum = idx + 1;
        const isAnd = andIndices.length === 0 || andIndices.includes(conditionNum);
        const isOr = orIndices.includes(conditionNum);
        
        let operator = 'AND';
        if (isOr && !isAnd) {
            operator = 'OR';
        }
        
        let clause = '';
        const escapedValue = condition.value.replace(/'/g, "''");
        
        if (condition.matchType === 'exact') {
            clause = `${condition.field} = '${escapedValue}'`;
        } else {
            clause = `${condition.field} LIKE '%${escapedValue}%'`;
        }
        
        whereParts.push({ clause, operator, num: conditionNum });
    });
    
    // 构建最终SQL（表名用反引号包裹避免特殊字符问题）
    let sql = `SELECT ${fieldsStr} FROM \`${tableName}\``;
    
    if (whereParts.length > 0) {
        sql += ' WHERE ';
        
        // 分组处理AND和OR
        let andClauses = [];
        let orClauses = [];
        
        whereParts.forEach(part => {
            if (part.operator === 'AND') {
                andClauses.push(part.clause);
            } else {
                orClauses.push(part.clause);
            }
        });
        
        let whereClause = '';
        
        if (andClauses.length > 0) {
            whereClause += andClauses.join(' AND ');
        }
        
        if (orClauses.length > 0) {
            if (whereClause) {
                whereClause += ' AND (';
            }
            whereClause += orClauses.join(' OR ');
            if (andClauses.length > 0) {
                whereClause += ')';
            }
        }
        
        sql += whereClause;
    }
    
    sql += ';';
    
    smartQueryState.generatedSQL = sql;
    smartElements.generatedSQL.textContent = sql;
    smartElements.sqlDisplay.classList.remove('hidden');
    
    return sql;
}

/**
 * 执行智能查询
 */
async function executeSmartQuery() {
    // 强制同步更新三处，确保字段顺序一致
    renderFieldsCheckbox();
    updateSelectedFieldsSummary();

    // 解析与或条件用于保存历史
    const andInput = smartElements.andConditions.value.trim();
    const orInput = smartElements.orConditions.value.trim();
    const andIndices = andInput ? andInput.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];
    const orIndices = orInput ? orInput.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];

    // 保存到历史（使用按顺序排列的字段）
    addToHistory({
        tableName: smartQueryState.currentTable,
        selectedFields: getOrderedSelectedFields(),
        conditions: JSON.parse(JSON.stringify(smartQueryState.conditions)),
        andIndices: andIndices,
        orIndices: orIndices
    });

    // 生成SQL（会使用getOrderedSelectedFields获取按顺序排列的字段）
    const sql = generateSQL();

    elements.sqlInput.value = sql;
    await executeSQL();

    // 滚动到结果区域
    elements.tableHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * 处理表选择变化
 */
async function handleTableChange() {
    const tableName = smartElements.tableSelect.value;
    smartQueryState.currentTable = tableName;
    smartQueryState.conditions = [];
    smartQueryState.selectedFields = [];

    // 重置步骤2
    smartElements.step2.classList.remove('active');
    smartElements.sqlDisplay.classList.add('hidden');
    smartElements.andConditions.value = '';
    smartElements.orConditions.value = '';

    if (tableName) {
        await loadTableStructure(tableName);
        renderFieldsCheckbox();
        renderConditions();
        // 自动显示查询报告（实时同步）
        updateQueryReport();
    } else {
        smartElements.fieldsCheckboxList.innerHTML = '<p class="fields-hint">请先选择数据表</p>';
        smartElements.conditionsList.innerHTML = '<p class="conditions-hint">请先选择数据表</p>';
        // 清空报告
        smartElements.reportTableName.textContent = '-';
        smartElements.selectedFieldsSummary.innerHTML = '';
        smartElements.conditionsSummary.innerHTML = '';
    }
}

// 事件绑定
document.addEventListener('DOMContentLoaded', () => {
    // 执行查询
    elements.executeBtn.addEventListener('click', executeSQL);
    
    // 重置
    elements.resetBtn.addEventListener('click', reset);
    
    // 获取所有表
    elements.getTablesBtn.addEventListener('click', getAllTables);
    
    // 快捷查询按钮
    document.querySelectorAll('.quick-btns button').forEach(btn => {
        btn.addEventListener('click', () => {
            quickQuery(btn.getAttribute('data-sql'));
        });
    });

    // Ctrl+Enter 执行查询
    elements.sqlInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            executeSQL();
        }
    });

    // 初始化显示空状态
    showEmptyState('点击"执行查询"开始');
    
    // ==================== 智能查询事件绑定 ====================
    
    // 初始化智能查询
    initSmartQuery();
    
    // 表选择变化
    smartElements.tableSelect.addEventListener('change', handleTableChange);
    
    // 字段全选/全不选/清除未选中
    smartElements.selectAllFieldsBtn.addEventListener('click', selectAllFields);
    smartElements.deselectAllFieldsBtn.addEventListener('click', deselectAllFields);
    smartElements.clearUncheckedFieldsBtn.addEventListener('click', clearUncheckedFields);

    // 添加条件
    smartElements.addConditionBtn.addEventListener('click', addCondition);

    // 显示SQL
    smartElements.showSQLBtn.addEventListener('click', generateSQL);

    // 执行智能查询
    smartElements.executeSmartQueryBtn.addEventListener('click', executeSmartQuery);

    // 与或条件输入框实时同步
    smartElements.andConditions.addEventListener('input', () => {
        if (!smartElements.sqlDisplay.classList.contains('hidden')) {
            generateSQL();
        }
    });
    smartElements.orConditions.addEventListener('input', () => {
        if (!smartElements.sqlDisplay.classList.contains('hidden')) {
            generateSQL();
        }
    });
});
