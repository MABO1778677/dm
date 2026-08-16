# SQL 数据管理器

一个基于 SQLPub 服务的在线 SQL 查询工具，提供简洁美观的界面和丰富的数据库操作功能。

## 项目结构

```
SqlHub/
├── index.html      # 主页面
├── style.css       # 样式文件
├── app.js          # 应用逻辑
├── data_handle.js  # 数据库操作API封装
└── README.md       # 使用文档
```

## 快速开始

1. 直接在浏览器中打开 `index.html` 文件
2. 在 SQL 编辑器中输入查询语句
3. 点击「执行查询」按钮或按 `Ctrl + Enter`

## 界面功能

### SQL 编辑器
- 支持多行 SQL 语句编辑
- `Ctrl + Enter` 快捷键执行
- 代码高亮风格的编辑区

### 快捷操作
- **获取所有表**：一键查询数据库中的所有表
- **显示所有表**：执行 `SHOW TABLES`
- **当前数据库**：查看当前连接的数据库名
- **数据库版本**：查看 MySQL 版本信息

### 查询结果
- 表格形式展示数据
- 点击表头进行排序（升序/降序）
- 分页浏览（每页10条）
- 响应式表格，支持横向滚动

## API 使用文档

`data_handle.js` 提供了丰富的数据库操作方法，通过全局对象 `dataHandler` 调用。

### Token 管理

```javascript
// 确保获取有效 token（自动处理缓存和过期）
const token = await dataHandler.ensureToken();
```

### 表结构查询

```javascript
// 获取数据库中所有表
const tables = await dataHandler.getTables();
// 返回: [{ table_name: 'users', table_comment: '用户表' }, ...]

// 获取指定表的结构信息
const structure = await dataHandler.getTableStructure('users');
// 返回: [{ column_name: 'id', data_type: 'int', ... }, ...]

// 获取表的主键字段
const primaryKey = await dataHandler.getPrimaryKey('users');
// 返回: 'id'
```

### 数据查询

#### 精确查找
```javascript
// 根据条件精确匹配查询
const users = await dataHandler.findExact('users', 
    { status: 'active', age: 25 },  // 条件
    { fields: '*', limit: 10 }       // 选项
);
```

#### 模糊查找
```javascript
// 模糊搜索
const results = await dataHandler.findFuzzy(
    'users',
    '张三',                          // 关键词
    ['name', 'email'],               // 搜索字段
    { limit: 20 }
);
```

#### 排序查询
```javascript
// 带排序的查询
const users = await dataHandler.findWithSort('users', {
    fields: 'id, name, email',
    conditions: { status: 'active' },
    sortField: 'created_at',
    sortDirection: 'DESC',
    limit: 50
});
```

#### 分页查询
```javascript
// 分页获取数据
const pageData = await dataHandler.findByPage('users', 1, 10, {
    fields: '*',
    conditions: { status: 'active' },
    sortField: 'id',
    sortDirection: 'ASC'
});
// 返回: { data: [...], pagination: { page: 1, pageSize: 10, total: 100, totalPages: 10 } }
```

#### 根据 ID 查询
```javascript
// 查询单条记录
const user = await dataHandler.findById('users', 1, 'id');
// 返回: { id: 1, name: '张三', ... }
```

#### 统计记录数
```javascript
// 统计数量
const count = await dataHandler.count('users', { status: 'active' });
// 返回: 50
```

### 数据插入

#### 单条插入
```javascript
const result = await dataHandler.insert('users', {
    name: '张三',
    email: 'zhangsan@example.com',
    age: 25
});
```

#### 批量插入
```javascript
const result = await dataHandler.batchInsert('users', [
    { name: '张三', email: 'zhangsan@example.com' },
    { name: '李四', email: 'lisi@example.com' },
    { name: '王五', email: 'wangwu@example.com' }
]);
```

### 数据更新

#### 条件更新
```javascript
// 更新符合条件的记录
const result = await dataHandler.update(
    'users',
    { status: 'inactive', updated_at: '2024-01-01' },  // 更新的数据
    { id: 1 }                                           // 条件
);
```

#### 批量更新
```javascript
// 批量更新（使用 CASE WHEN）
const result = await dataHandler.batchUpdate('users', [
    { id: 1, name: '张三三', age: 26 },
    { id: 2, name: '李四四', age: 28 },
    { id: 3, name: '王五五', age: 30 }
], 'id');
```

### 数据删除

#### 条件删除
```javascript
// 删除符合条件的记录
const result = await dataHandler.delete('users', { status: 'deleted' });
```

#### 根据 ID 删除
```javascript
// 删除单条记录
const result = await dataHandler.deleteById('users', 1, 'id');
```

#### 批量删除
```javascript
// 批量删除
const result = await dataHandler.batchDelete('users', [1, 2, 3], 'id');
```

### 高级查询

#### 范围查询
```javascript
// 查询年龄在 18 到 30 之间的用户
const users = await dataHandler.findInRange(
    'users',
    'age',
    18,
    30,
    { fields: '*', limit: 100 }
);
```

#### IN 查询
```javascript
// 查询 ID 在指定范围内的记录
const users = await dataHandler.findIn(
    'users',
    'id',
    [1, 2, 3, 4, 5],
    { fields: '*' }
);
```

#### 聚合查询
```javascript
// 统计查询
const stats = await dataHandler.aggregate('users', {
    total_count: 'COUNT(*)',
    avg_age: 'AVG(age)',
    max_age: 'MAX(age)',
    min_age: 'MIN(age)'
}, { conditions: { status: 'active' } });
// 返回: [{ total_count: 100, avg_age: 25.5, max_age: 60, min_age: 18 }]

// 分组统计
const groupStats = await dataHandler.aggregate('users', {
    count: 'COUNT(*)'
}, { groupBy: 'status' });
// 返回: [{ status: 'active', count: 80 }, { status: 'inactive', count: 20 }]
```

#### 多表关联查询
```javascript
// 关联查询
const results = await dataHandler.joinQuery(
    'users',                          // 主表
    [                                 // 关联表配置
        { table: 'orders', type: 'LEFT', on: 'users.id = orders.user_id' },
        { table: 'products', type: 'LEFT', on: 'orders.product_id = products.id' }
    ],
    {
        fields: 'users.name, orders.id as order_id, products.name as product_name',
        conditions: { 'users.status': 'active' }
    }
);
```

### 执行原始 SQL

```javascript
// 执行任意 SQL 语句
const result = await dataHandler.executeRawSQL(
    'SELECT * FROM users WHERE age > ? LIMIT 10',
    25000  // 超时时间（毫秒）
);
// 返回: { success: true, data: [...], ... }
```

## 配置说明

数据库连接配置在 `data_handle.js` 中：

```javascript
this.connectionConfig = {
    host: "127.0.0.1",
    port: 3306,
    dbName: "app_info",
    dbUser: "mb1154820",
    password: "pJbkyzeYJX1bQKTt"
};
```

## 注意事项

1. **Token 自动管理**：API 会自动处理 token 的获取、缓存和刷新，无需手动管理
2. **SQL 注入防护**：API 方法内部对字符串参数进行了转义处理，但执行原始 SQL 时请注意安全
3. **超时设置**：默认查询超时时间为 25 秒，可根据需要调整
4. **浏览器支持**：需要使用支持 ES6+ 的现代浏览器

## 浏览器兼容性

- Chrome 60+
- Firefox 60+
- Safari 12+
- Edge 79+

## 许可证

MIT License
