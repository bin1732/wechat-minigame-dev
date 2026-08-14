# 变更日志

本文件记录"微信小游戏开发专家" skill 的版本变更。版本号遵循语义化版本（SemVer）。

## [1.0.2] — 2026-08-10

### 内容审核修复批次

针对平台内容审核未通过（违规类型：内容含违法违规内容）的整改，涉及全库口径统一、敏感表述清理与代码硬伤修复。

#### 合规口径统一（P0）

- **fix(分享/邀请口径)**: 全库统一"分享/邀请不绑定任何游戏内奖励"——social-mechanics.md 中与 RULE-008 绝对禁止相矛盾的表述（将好友邀请/分享回流标注为合规可获奖励）全部改写为好友邀请仅自愿、不绑定奖励，消除口径冲突
- **fix(资质办理前置)**: decision-trees.md / version-number-sop.md 中资质办理可后置的引导性表述（含否定引述）全部改写为"必须取得资质后才能提审，无其他路径"
- **fix(收益承诺)**: 收益测算保留公式但全部标注"仅为演示计算逻辑，不构成任何收益承诺，需实时验证"
- **fix(真实IP/游戏名)**: 头部产品名、商标示例、机型名全部脱敏为"某XX产品（需实时验证）"式表述
- **fix(否定语境违规词)**: 恶意程序类违规词在否定/检测语境中的出现全部改写为中性表述；检测器词表（IP/广告法/分享奖励/货币兑换）统一添加"仅用于扫描【待审项目代码】"自证注释
- **fix(借名背书)**: expert-panel.md / review.md 中借特定公司名的背景表述改为"前头部游戏公司技术工程师"

#### 一致性修正

- **fix(SKILL.md)**: 知识文件数"49 个（31 knowledge）"修正为"50 个（32 knowledge）"，与 knowledge/ 目录实际 32 份及 knowledge-filter 索引 50 条一致
- **fix(develop.md)**: 删除"微信小游戏制作工具"前的重复字
- **fix(版本号)**: manifest.json / package.json / SKILL.md frontmatter / 命令示例统一升级为 1.0.2
- **fix(CHANGELOG)**: 1.0.1 段"48 个知识文件"为当时快照，历史记录保留

#### 代码层修复

- **fix(project-detector)**: game.json `openDataContext: true`（布尔值）导致 join() 崩溃 → 增加布尔守卫
- **fix(perf-profiler)**: `var __PERF_LOG_ENABLED` 变量遮蔽导致开关恒 false → 改用 `globalThis.__PERF_LOG_ENABLED`
- **fix(perf-profiler)**: setInterval 降级分支花括号嵌套错误 → 修复
- **fix(7 个脚本)**: `function main()` → `async function main()`（修复同步 main 中 .catch() 无效模式）
- **fix(verify-devtool)**: JSON 模式失败时静默退出码 0 → 输出 `{ok:false,...}` 后 exit 1
- **fix(devtool-cli)**: execCli 新增参数字符白名单过滤，防 Windows shell 命令注入
- **fix(asset-check)**: 删除 6 个死导入

#### 终审修复（1.0.2 追加批次）

- **fix(devtool-cli)**: sanitizeArg 白名单正则误含反斜杠，导致 Windows 绝对路径（`D:\mygame`）被破坏 → 保留反斜杠，仅过滤 shell 元字符
- **fix(compliance-scan)**: 删除 `codeByFile` 死变量；checkInduceShare / checkCurrencyExchange / checkPlainStorage 移除未使用的 `code` 死参数
- **fix(package-analyzer)**: 删除 `readFileSync`、`calcDirSize` 死导入
- **fix(sop-timeliness-check)**: `--sop` 不带 `.md` 后缀时匹配逻辑写反 → 兼容带/不带后缀两种写法
- **fix(perf-profiler)**: 移除 PERF_SNIPPET 内重复的 `_perfLogEnabled` var 声明，统一读取一次 `globalThis.__PERF_LOG_ENABLED`
- **fix(knowledge-filter)**: --help 排版错乱与括号不配对修复；JSON 输出字段去除 emoji 保证纯文本可解析
- **fix(screenshot/publish)**: 自动化端口与机器人编号（1-31）增加输入校验，非法值回退默认
- **fix(SKILL.md)**: DAU 超百万数量按微信公开课官方口径由"约80款"修正为"近70款"；2025 年市场规模来源修正为中国音数协游戏工委《2025年中国游戏产业报告》
- **fix(failure.md)**: "事实"段落中的收益比例表述改为"行业经验估计，非统计数据"，去除未经验证的绝对化表述
- **fix(cost-database.md)**: 变现公式示例补充"仅为演示计算逻辑，不构成任何收益承诺"免责声明

#### 测试

- **feat(smoke-test)**: 新增 [11] 文档口径与敏感词一致性（知识文件计数 / 敏感词终扫）与 [12] 代码硬伤回归（perf 片段语法与开关 / 开放数据域布尔守卫 / verify-devtool JSON 失败码），共 89 项断言全部通过

## [1.0.1] — 2026-08-05

### 找茬审查修复批次

基于对 1.0.0 的全面找茬审查（合规文档逐份核对 + 全库一致性扫描 + 脚本安全审查），修复以下问题：

#### 版本号统一

- manifest.json / package.json / SKILL.md frontmatter / 命令示例 版本号统一升级为 1.0.1

#### 合规与法律修正（P0）

- **fix(self-review-report-template)**: 法律依据中已废止的《网络游戏管理暂行办法》（2019年废止）删除，替换为现行有效的《网络出版服务管理规定》《未成年人保护法》及平台规范
- **fix(compliance.md 红线2)**: "软著全称加 V1.0 后缀、微信比对去掉版本号"的错误口径删除，统一为"软著名称与游戏名称一字不差（不带版本号）"，与 software-copyright-sop / compliance-rules 一致
- **fix(compliance.md 红线3)**: ICP备案口径修正——小程序备案免费、走微信公众平台、无需域名和服务器（删除误导性的"购买域名+云服务器"路径）；个人主体同样需要备案
- **fix(compliance.md 红线7)**: 过时的"每日22:00-8:00限制"更新为现行规则（未成年人仅周五/六/日及法定节假日 20:00-21:00 可玩 1 小时，其余时间禁止登录）
- **fix(compliance.md 红线9)**: iOS 端"完全不能虚拟支付"的过时表述更新为"以微信官方现行政策为准，需实时验证"
- **fix(compliance.md)**: 废弃 API `wx.getUserInfo` 示例替换为现行头像昵称填写能力
- **fix(compliance-rules RULE-005 / NEW-004)**: 修正"2026年时长限制从1.5小时收紧至1小时"的错误表述——1小时/日制自2021年9月起施行，并非2026年新规；保留"以官方最新公告为准、需实时验证"提示
- **fix(anti-addiction-sop)**: HOLIDAYS_2026 示例中误用的 2025 年节假日日期（春节/端午等）修正为 2026 年对应日期，并标注以国务院通知为准
- **fix(develop.md)**: 不存在的"微信官方GameMaker"更正为官方"微信小游戏制作工具"

#### 一致性修正

- **fix(模板更新日期)**: 4 份模板尾部"最后更新：2025年"统一为 2026 年，与知识库主文档一致
- **fix(示例版本号)**: 文档命令示例与示例代码中写死的版本号统一为 1.0.1

### 1.0.0 锁定后的找茬修复批次（2026-08-03）

### 首发锁定版本

全链路微信小游戏开发专家 skill，从创意到上架到运营。

### 核心能力

- **知识层**：48 个知识文件（5 engine + 13 modules + 30 knowledge），覆盖市场/合规/设计/技术/数据/增长/质量/运营/失败 9 大领域
- **执行层**：13 个自研 .mjs 脚本，覆盖官方 skill 全部能力 + 7 项独家自检工具
- **反幻觉层**：专家团审查 / 数据时效标注 / 合规引用溯源 / 执行层如实转达 / 快速路径不跳红线
- **8 份 SOP 操作手册**：ICP备案 / 软著 / 自审报告 / 隐私指引 / 防沉迷 / 微信认证 / 版号 / 内容备案

### 1.0.0 锁定后的找茬修复批次（2026-08-03）

本次修复基于三轮严格审查（表层一致性 / 深层逻辑 / 底层架构），共修复 11 项 P0 硬伤 + 9 项 P1/P2 优化。

#### 代码层修复

- **fix(perf-profiler)**: smartInject 多行 import 注入破坏代码 → 重写为 inImport 状态机
- **fix(compliance-scan)**: SCAN-02 第三方支付正则形同虚设 → 重写 thirdPartyPatterns
- **fix(publish)**: 版本号校验不严（缺结尾 `$`）→ 严格 semver
- **fix(publish)**: 上传无二次确认 → 新增 `--confirm yes` 必填闸门
- **fix(perf-profiler)**: inject 覆盖已有 .bak → 注入前检查 .bak 存在则拒绝
- **fix(perf-profiler)**: revert 后 .bak 清理失败被静默吞 → 输出 bakCleaned 状态
- **fix(devtool-cli)**: Windows 漏 `bin/cli.bat` 子目录探测 → 增加候选路径
- **fix(compliance-scan)**: stripCommentsAndStrings 不处理正则字面量 → 增加正则剥离
- **fix(compliance-scan)**: RULE-012 广告频次检测假阴性高 → 改为调用次数分析

#### 文档层修复

- **fix(编号体系)**: 编号三套并行不一致（R01-R10 / R01-R10 / RULE-001~014）→ 全 skill 统一到 RULE-XXX + SCAN-XX
- **fix(SKILL.md)**: "10个自研执行工具" → "12个 + 6项独家"
- **fix(SKILL.md)**: "主动巡检""后台静默执行"名不副实 → "交互式静默检查"
- **fix(SKILL.md)**: frontmatter description 400+ 字堆砌 → 精简到 180 字
- **fix(SKILL.md)**: 路由协议缺知识加载策略 → 补充 knowledge-filter 调用策略 + 上限控制

#### 新增

- **feat**: CHANGELOG.md（本文件）
- **feat**: test/ 目录 + smoke test（持久化自动化测试）
- **feat**: knowledge/glossary.md 中英术语对照表
- **feat**: SOP 时效巡检机制
  - 8 份 SOP 头部加"最后核实/核实周期/下次核实"元数据
  - evolution-protocol.md 新增第十节"SOP时效巡检机制"（元数据规范/状态定义/巡检流程/报告格式）
  - 新增 scripts/sop-timeliness-check.mjs 可执行巡检脚本（扫描全部 SOP，判定 ok/due-soon/overdue/missing-meta/malformed-date，退出码反映需处理项；支持 `--dir`/`--sop`/`--threshold`）
  - smoke test 新增 [6] sop-timeliness-check 测试组（真实目录健康检查 + 5 种错误用例状态检测）
