# 微信云开发指南

> 数据时效：2026-07（微信云开发控制台数据，具体额度以官方最新公告为准）
> 置信度：高（基于官方文档）

---

## 一、云开发是什么

微信云开发是微信官方提供的 Serverless 后端服务，免服务器、免运维，直接在微信开发者工具中管理。

### 核心能力

| 能力 | 说明 | 免费额度 |
|------|------|---------|
| 云数据库 | JSON 文档数据库，支持实时推送 | 2GB 存储 / 50万次/天读写 |
| 云函数 | Node.js 运行时，处理业务逻辑 | 4万次/月 / 40万 GBs/月 |
| 云存储 | 文件存储+CDN加速 | 5GB 存储 / 5GB/天 CDN |
| 云调用 | 直接调用微信开放接口 | 包含在云函数额度内 |

---

## 二、免费额度 vs 付费方案

### 免费额度（适合开发期/小项目）

```
数据库：2GB / 50万次读写每天
云函数：4万次/月 / 40万 GBs
存储：5GB / 5GB CDN每天
```

**适合场景**：DAU < 1000 的小游戏，开发测试阶段。

### 付费方案（2026年基准）

| 套餐 | 月费 | 数据库 | 云函数 | 存储 | 适合 |
|------|------|--------|--------|------|------|
| 基础版 | 19.9元 | 10GB | 25万次 | 20GB | DAU 1万内 |
| 专业版 | 99元 | 50GB | 100万次 | 50GB | DAU 5万内 |
| 企业版 | 599元 | 200GB | 500万次 | 200GB | DAU 20万+ |

**成本拐点**：DAU 超过 5000 时，免费额度可能不够，建议升级基础版。

---

## 三、数据库设计

### 小游戏典型表结构

```javascript
// 用户表 user
{
  _id: "auto",           // 自动ID
  _openid: "用户openid",  // 自动填充
  nickname: "玩家昵称",
  avatar: "头像URL",
  level: 1,
  coins: 100,
  createdAt: Date,
  lastLoginAt: Date
}

// 存档表 save
{
  _id: "auto",
  _openid: "用户openid",
  level: 10,
  score: 9999,
  inventory: ["item1", "item2"],
  progress: {chapter: 3, stage: 5},
  updatedAt: Date
}

// 排行榜 leaderboard
{
  _id: "auto",
  _openid: "用户openid",
  score: 9999,
  week: "2026-W30",  // 按周分区
  rank: 1
}
```

### 索引设计原则

- `_openid` 默认建索引（查询用户数据必用）
- 排行榜按 `score` 降序建索引
- 时间字段建索引（按时间范围查询）

---

## 四、云函数优秀实践

### 登录验证云函数

```javascript
// cloudfunctions/login/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  };
};
```

### 防沉迷校验云函数

```javascript
// cloudfunctions/checkAntiAddiction/index.js
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const db = cloud.database();

  // 查用户今日在线时长
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const record = await db.collection('playtime')
    .where({ _openid: wxContext.OPENID, date: today })
    .get();

  const todayDuration = record.data[0]?.duration || 0;
  const isMinor = record.data[0]?.isMinor || false;

  // 判断是否超时
  if (isMinor) {
    const limit = isWeekend(today) ? 3 * 3600 : 1.5 * 3600;
    if (todayDuration >= limit) {
      return { allow: false, reason: '今日游戏时间已达上限' };
    }
    // 宵禁检查
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 8) {
      return { allow: false, reason: '未成年人请在8:00-22:00期间游戏' };
    }
  }

  return { allow: true, todayDuration };
};
```

---

## 五、云开发 vs 自建服务器

| 维度 | 云开发 | 自建服务器 |
|------|--------|-----------|
| 开发效率 | 高（免运维） | 中（需配置服务器） |
| 成本（DAU<1万） | 免费-20元/月 | 50-100元/月（云服务器） |
| 成本（DAU>10万） | 600元+/月 | 200-500元/月（更划算） |
| 性能 | 中（冷启动延迟） | 高（常驻进程） |
| 灵活性 | 低（受限于云开发API） | 高（完全自主） |
| 扩展性 | 自动扩缩 | 需手动扩容 |
| 微信生态集成 | 原生集成 | 需自行对接 |

**选择建议**：
- DAU < 1万 → 云开发免费额度够用
- DAU 1万-10万 → 云开发付费版
- DAU > 10万 → 考虑自建服务器（成本更优）
- 需要复杂业务逻辑 → 自建服务器更灵活

---

## 六、常见坑

### 坑1：云函数冷启动延迟

```
问题：首次调用云函数延迟 1-3 秒
原因：Serverless 冷启动特性
解法：
  1. 预热：游戏启动时先发一个 ping 请求
  2. 合并：多个小请求合并为一个大请求
  3. 缓存：非实时数据用本地缓存+定时同步
```

### 坑2：数据库查询超限

```
问题：单次查询最多返回 100 条（云开发限制）
解法：
  1. 分页：limit(20) + skip()
  2. 聚合：用 aggregate 替代多次查询
  3. 缓存：排行榜等数据服务端缓存
```

### 坑3：存储 CDN 流量超标

```
问题：免费额度 5GB/天 CDN 流量不够
解法：
  1. 静态资源压缩后再上传
  2. 设置合理缓存策略
  3. 超量后升级套餐或换自有 CDN
```
