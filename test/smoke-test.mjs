#!/usr/bin/env node
/**
 * smoke-test.mjs — 持久化冒烟测试
 *
 * 用法：node test/smoke-test.mjs
 *
 * 测试范围（覆盖全部 13 个执行脚本）：
 *  1. 全部脚本 --help 参数测试（确保基本可运行）
 *  2. publish 参数校验（--confirm / 版本号 / 项目路径）
 *  3. perf-profiler inject/revert 端到端（多行 import 正确注入）
 *  4. knowledge-filter --list（索引完整性）
 *  5. compliance-scan 正则字面量剥离（正则内容不误报）
 *  6. sop-timeliness-check（真实目录健康检查 + 5 种错误用例状态检测）
 *  7. compliance-scan 编号体系（RULE-008，无旧 R01 残留）
 *  8. asset-check --help 基本可用
 *  9. verify-devtool --help 基本可用
 * 10. run-game / get-logs / screenshot / real-device --help 基本可用
 * 11. readiness-check / package-analyzer --help 基本可用
 * 12. 文档口径与敏感词一致性（知识文件计数 / 敏感词与不良口径终扫）
 * 13. 代码硬伤修复回归（perf 片段语法与开关 / 开放数据域布尔守卫 / verify-devtool JSON 失败码）
 *
 * 退出码：0 全部通过，1 有失败
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = join(__dirname, '..');
const SCRIPTS = join(SKILL_ROOT, 'scripts');
// 测试夹具统一放系统临时目录，避免污染 skill 包（即使清理失败也不影响 skill 根目录）
const TMP_BASE = join(tmpdir(), 'wechat-minigame-skill-smoke');

let passed = 0;
let failed = 0;
const failures = [];

function run(script, args, opts = {}) {
  return spawnSync('node', [join(SCRIPTS, script), ...args], {
    cwd: SKILL_ROOT,
    encoding: 'utf-8',
    timeout: 15000,
    ...opts,
  });
}

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

/**
 * Windows 下 rmSync 可能因子进程文件句柄延迟释放而残留目录（不抛错但未删净）。
 * 重试几次并校验目录已消失，避免 .tmp-* 临时目录污染 skill 包。
 */
function safeRmSync(dir) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (_) { /* 句柄未释放，重试 */ }
    if (!existsSync(dir)) return;
    // 同步忙等约 60ms，给 OS 释放句柄的时间
    const end = Date.now() + 60;
    while (Date.now() < end) { /* spin */ }
  }
}

/**
 * 清理测试夹具目录 TMP_BASE。
 * - 开头调用：清掉前次运行遗留
 * - 结尾调用：此时所有子进程已退出、文件句柄已释放，可彻底清掉本次运行残留
 *   （Windows 下 finally 内的即时 rmSync 常因句柄延迟释放而失败，结尾兜底是关键）
 * 夹具放在系统临时目录，即使清理失败也不污染 skill 包。
 */
function cleanupTmpDirs() {
  safeRmSync(TMP_BASE);
}

console.log('=== 冒烟测试 ===\n');
cleanupTmpDirs(); // 清理前次运行可能遗留的 .tmp-* 目录

// 1. compliance-scan --help 编号体系
console.log('[1] compliance-scan 编号体系');
{
  const r = run('compliance-scan.mjs', ['--help']);
  assert('compliance-scan --help 退出码0', r.status === 0);
  assert('compliance-scan --help 含 RULE-008', r.stdout.includes('RULE-008'), '编号体系未对齐');
  assert('compliance-scan --help 不含旧 R01 编号', !r.stdout.includes('R01 '), '残留旧编号');
  assert('compliance-scan --help 含 SCAN-01', r.stdout.includes('SCAN-01'), '代码扫描专属编号缺失');
}

// 2. publish 参数校验
console.log('\n[2] publish 参数校验');
{
  // 无 --confirm
  const r1 = run('publish.mjs', ['--project', '.', '--version', '1.0.0', '--json']);
  assert('publish 无 --confirm 退出码非0', r1.status !== 0);
  assert('publish 无 --confirm 提示确认', (r1.stdout + r1.stderr).includes('--confirm') || (r1.stdout + r1.stderr).includes('确认'));

  // 非法版本号（缺结尾 $，防注入）
  const r2 = run('publish.mjs', ['--project', '.', '--version', '1.0.0<bad>', '--confirm', 'yes', '--json']);
  assert('publish 非法版本号 1.0.0<bad> 退出码非0', r2.status !== 0);

  // 非法版本号（无补丁号）
  const r3 = run('publish.mjs', ['--project', '.', '--version', '1.0', '--confirm', 'yes', '--json']);
  assert('publish 非法版本号 1.0 退出码非0', r3.status !== 0);

  // 合法版本号+--confirm 但项目路径不存在
  const r4 = run('publish.mjs', ['--project', '不存在的路径xxx', '--version', '1.0.0', '--confirm', 'yes', '--json']);
  assert('publish 路径不存在退出码非0', r4.status !== 0);
}

// 3. perf-profiler inject/revert 端到端（多行 import）
console.log('\n[3] perf-profiler inject/revert（多行 import）');
{
  const tmpDir = join(TMP_BASE, 'perf');
  try {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'game.js'), "import {\n  foo,\n  bar\n} from 'utils';\n\nconsole.log('hello');\n");

    // inject
    const rInj = run('perf-profiler.mjs', ['--project', tmpDir, '--mode', 'inject', '--json']);
    assert('perf-profiler inject 退出码0', rInj.status === 0);
    if (rInj.status === 0) {
      const injData = JSON.parse(rInj.stdout);
      assert('perf-profiler inject 位置 after-imports', injData.injectPosition === 'after-imports', `实际 ${injData.injectPosition}`);

      // 检查注入后 game.js：import 在前，snippet 在后
      const injected = readFileSync(join(tmpDir, 'game.js'), 'utf-8');
      const importPos = injected.indexOf("from 'utils'");
      const snippetPos = injected.indexOf('PERF PROFILER INJECTED');
      assert('perf-profiler import 在 snippet 之前', importPos > -1 && snippetPos > -1 && importPos < snippetPos);
    }

    // .bak 存在性检查（B1 修复：再次 inject 应被拒绝）
    const rInj2 = run('perf-profiler.mjs', ['--project', tmpDir, '--mode', 'inject', '--json']);
    assert('perf-profiler .bak 存在时再次 inject 被拒绝', rInj2.status !== 0, 'B1 修复未生效');

    // revert
    const rRev = run('perf-profiler.mjs', ['--project', tmpDir, '--mode', 'revert', '--json']);
    assert('perf-profiler revert 退出码0', rRev.status === 0);
    if (rRev.status === 0) {
      const revData = JSON.parse(rRev.stdout);
      assert('perf-profiler revert bakCleaned=true', revData.bakCleaned === true);

      // 检查恢复后 game.js 不含 snippet，import 完整
      const reverted = readFileSync(join(tmpDir, 'game.js'), 'utf-8');
      assert('perf-profiler revert 后无 snippet', !reverted.includes('PERF PROFILER INJECTED'));
      assert('perf-profiler revert 后 import 完整', reverted.includes("from 'utils'"));

      // .bak 已清理
      assert('perf-profiler .bak 已清理', !existsSync(join(tmpDir, 'game.js.bak')));
    }
  } finally {
    safeRmSync(tmpDir);
  }
}

// 4. knowledge-filter --list（索引完整性）
console.log('\n[4] knowledge-filter 索引');
{
  const r = run('knowledge-filter.mjs', ['--list', '--json']);
  assert('knowledge-filter --list 退出码0', r.status === 0);
  if (r.status === 0) {
    const data = JSON.parse(r.stdout);
    assert('knowledge-filter --list 返回文件数>40', data.totalFiles > 40, `实际 ${data.totalFiles}`);
    assert('knowledge-filter 含 8 个阶段', data.stages.length >= 8, `实际 ${data.stages.length}`);
    assert('knowledge-filter 含 5 个角色', data.roles.length >= 5, `实际 ${data.roles.length}`);
  }
}

// 5. compliance-scan 正则字面量剥离
console.log('\n[5] compliance-scan 正则字面量剥离');
{
  const tmpDir = join(TMP_BASE, 'regex');
  try {
    mkdirSync(tmpDir, { recursive: true });
    // 代码含正则字面量，正则内容不应被当作代码扫描误报
    writeFileSync(join(tmpDir, 'game.js'), "const re = /abc.*def/;\nconst x = 1;\n");
    const r = run('compliance-scan.mjs', ['--project', tmpDir, '--json']);
    assert('compliance-scan 正则项目扫描退出码0', r.status === 0);
    if (r.status === 0) {
      const data = JSON.parse(r.stdout);
      // 正则字面量里的内容不应触发违规扫描
      const r08Violations = (data.violations || []).filter((v) => v.rule === 'RULE-008');
      assert('compliance-scan 正则内容不误报 RULE-008', r08Violations.length === 0, `误报 ${r08Violations.length} 条`);
    }
  } finally {
    safeRmSync(tmpDir);
  }
}

// 6. sop-timeliness-check SOP 时效巡检
console.log('\n[6] sop-timeliness-check 时效巡检');
{
  // 6a. 真实 SOP 目录：应全部健康
  const rReal = run('sop-timeliness-check.mjs', ['--json']);
  assert('sop-timeliness 真实目录退出码0', rReal.status === 0, `实际 ${rReal.status}`);
  if (rReal.status === 0) {
    const data = JSON.parse(rReal.stdout);
    assert('sop-timeliness 巡检 8 份 SOP', data.totalSops === 8, `实际 ${data.totalSops}`);
    assert('sop-timeliness 全部健康', data.status === 'healthy');
    assert('sop-timeliness 健康度满分10', data.healthScore === 10, `实际 ${data.healthScore}`);
    assert('sop-timeliness 无 overdue', data.statusDistribution.overdue === 0);
    assert('sop-timeliness 无 missing-meta', data.statusDistribution['missing-meta'] === 0);
  }

  // 6b. 错误用例：构造 5 份临时 SOP 覆盖全部状态
  const tmpDir = join(TMP_BASE, 'sop');
  try {
    mkdirSync(tmpDir, { recursive: true });
    const meta = (nv) => `# 测试 SOP\n\n> 适用：测试\n> 最后更新：2026-07-01\n> 最后核实：2026-07-01\n> 核实周期：每季度（测试）\n> 下次核实：${nv}\n\n---\n`;
    // ok：远未来；overdue：已过期；due-soon：7天后（默认阈值14天内）
    writeFileSync(join(tmpDir, 'ok-sop.md'), meta('2027-01-01'));
    writeFileSync(join(tmpDir, 'overdue-sop.md'), meta('2026-01-01'));
    writeFileSync(join(tmpDir, 'due-soon-sop.md'), meta('2026-08-10'));
    // missing-meta：缺"核实周期"行
    writeFileSync(join(tmpDir, 'missing-sop.md'), `# 测试 SOP\n\n> 适用：测试\n> 最后更新：2026-07-01\n> 最后核实：2026-07-01\n> 下次核实：2027-01-01\n\n---\n`);
    // malformed-date：非法日期 2026-13-45
    writeFileSync(join(tmpDir, 'malformed-sop.md'), meta('2026-13-45'));

    const r = run('sop-timeliness-check.mjs', ['--dir', tmpDir, '--json']);
    assert('sop-timeliness 错误用例退出码1', r.status === 1, `实际 ${r.status}`);
    if (r.status === 1) {
      const data = JSON.parse(r.stdout);
      assert('sop-timeliness 检测到 5 份', data.totalSops === 5, `实际 ${data.totalSops}`);
      const byFile = {};
      for (const it of data.items) byFile[it.file] = it.status;
      assert('sop-timeliness ok-sop=ok', byFile['ok-sop.md'] === 'ok', `实际 ${byFile['ok-sop.md']}`);
      assert('sop-timeliness overdue-sop=overdue', byFile['overdue-sop.md'] === 'overdue', `实际 ${byFile['overdue-sop.md']}`);
      assert('sop-timeliness due-soon-sop=due-soon', byFile['due-soon-sop.md'] === 'due-soon', `实际 ${byFile['due-soon-sop.md']}`);
      assert('sop-timeliness missing-sop=missing-meta', byFile['missing-sop.md'] === 'missing-meta', `实际 ${byFile['missing-sop.md']}`);
      assert('sop-timeliness malformed-sop=malformed-date', byFile['malformed-sop.md'] === 'malformed-date', `实际 ${byFile['malformed-sop.md']}`);
      // actionRequired 应含 overdue + missing-meta + malformed-date = 3 项
      assert('sop-timeliness actionRequired 含 3 项', data.actionRequired.length === 3, `实际 ${data.actionRequired.length}`);
      // 存在 P0 缺陷（missing-meta/malformed-date）→ 健康度直接 0
      assert('sop-timeliness P0 缺陷时健康度0', data.healthScore === 0, `实际 ${data.healthScore}`);
    }
  } finally {
    safeRmSync(tmpDir);
  }
}

// 7. 全部脚本 --help 参数测试
console.log('\n[7] 全部脚本 --help 参数测试');
{
  const allScripts = [
    'compliance-scan.mjs', 'publish.mjs', 'perf-profiler.mjs',
    'knowledge-filter.mjs', 'sop-timeliness-check.mjs',
    'verify-devtool.mjs', 'run-game.mjs', 'get-logs.mjs',
    'screenshot.mjs', 'real-device.mjs', 'readiness-check.mjs',
    'package-analyzer.mjs', 'asset-check.mjs',
  ];
  for (const script of allScripts) {
    const r = run(script, ['--help']);
    assert(`${script} --help 退出码0`, r.status === 0, `实际退出码 ${r.status}`);
    assert(`${script} --help 输出非空`, r.stdout.length > 50, `输出仅 ${r.stdout.length} 字节`);
  }
}

// 8. package-analyzer 基本功能测试
console.log('\n[8] package-analyzer 基本功能');
{
  const tmpDir = join(TMP_BASE, 'package');
  try {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'game.js'), 'console.log("test");');
    // 项目路径存在但无实际包体 → 应正常退出而非崩溃
    const r = run('package-analyzer.mjs', ['--project', tmpDir, '--json']);
    assert('package-analyzer 项目扫描退出码0', r.status === 0, `实际 ${r.status}`);
    if (r.status === 0) {
      const data = JSON.parse(r.stdout);
      assert('package-analyzer 返回结果含 summary', data.summary && 'mainPackageSizeMB' in data.summary, 'summary.mainPackageSizeMB 缺失');
    }
  } finally {
    safeRmSync(tmpDir);
  }
}

// 9. asset-check 基本功能测试
console.log('\n[9] asset-check 基本功能');
{
  const tmpDir = join(TMP_BASE, 'asset');
  try {
    mkdirSync(tmpDir, { recursive: true });
    // 创建测试文件（安全的文件名，不含版权敏感词）
    writeFileSync(join(tmpDir, 'bg.png'), 'fake-png-content');
    writeFileSync(join(tmpDir, 'music.mp3'), 'fake-mp3-content');
    const r = run('asset-check.mjs', ['--project', tmpDir, '--json']);
    assert('asset-check 项目扫描退出码0', r.status === 0, `实际 ${r.status}`);
    if (r.status === 0) {
      const data = JSON.parse(r.stdout);
      assert('asset-check 扫描到素材文件', data.stats.totalAssets >= 2, `实际 ${data.stats.totalAssets}`);
      assert('asset-check 图片数正确', data.stats.images >= 1, `实际 ${data.stats.images}`);
      assert('asset-check 音频数正确', data.stats.audios >= 1, `实际 ${data.stats.audios}`);
    }
  } finally {
    safeRmSync(tmpDir);
  }
}

// 10. readiness-check 基本功能测试
console.log('\n[10] readiness-check 基本功能');
{
  const tmpDir = join(TMP_BASE, 'readiness');
  try {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'game.js'), 'console.log("test");');
    writeFileSync(join(tmpDir, 'game.json'), '{}');
    const r = run('readiness-check.mjs', ['--project', tmpDir, '--json']);
    assert('readiness-check 项目扫描退出码0', r.status === 0, `实际 ${r.status}`);
    if (r.status === 0) {
      const data = JSON.parse(r.stdout);
      assert('readiness-check 返回检查项', data.items || data.checks || data.totalChecks, '关键字段缺失');
    }
  } finally {
    safeRmSync(tmpDir);
  }
}

// 11. 文档口径与敏感词一致性
console.log('\n[11] 文档口径与敏感词一致性');
{
  // 遍历收集全部 .md 文档（排除脚本——脚本内的检测词表属扫描待审项目的合法用途）
  function walkMd(dir, out) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walkMd(full, out);
      else if (entry.name.endsWith('.md')) out.push(full);
    }
    return out;
  }
  const mdFiles = walkMd(SKILL_ROOT, []);

  // 知识文件计数（与 SKILL.md 声明一致）
  const engineCount = mdFiles.filter((f) => f.includes(`${sep}engine${sep}`)).length;
  const modulesCount = mdFiles.filter((f) => f.includes(`${sep}modules${sep}`)).length;
  const knowledgeCount = mdFiles.filter((f) => f.includes(`${sep}knowledge${sep}`)).length;
  assert('文档 engine=5', engineCount === 5, `实际 ${engineCount}`);
  assert('文档 modules=13', modulesCount === 13, `实际 ${modulesCount}`);
  assert('文档 knowledge=32', knowledgeCount === 32, `实际 ${knowledgeCount}`);
  assert('知识文件总数=50', engineCount + modulesCount + knowledgeCount === 50, `实际 ${engineCount + modulesCount + knowledgeCount}`);

  // SKILL.md 知识文件数声明与实际情况一致（修复 49→50）
  const skillMd = readFileSync(join(SKILL_ROOT, 'SKILL.md'), 'utf-8');
  assert('SKILL.md 声明 50 个知识文件', skillMd.includes('50 个知识文件（5 engine + 13 modules + 32 knowledge）'), 'SKILL.md 知识文件数声明与实际不符');

  // knowledge-filter 索引条数与实际知识文件数一致（含 error-reference 收纳）
  {
    const r = run('knowledge-filter.mjs', ['--list', '--json']);
    if (r.status === 0) {
      const data = JSON.parse(r.stdout);
      assert('knowledge-filter 索引=50', data.totalFiles === 50, `实际 ${data.totalFiles}`);
    }
  }

  // 敏感词与不良口径终扫（仅文档；检测器正则词表在脚本中且已自证注释）
  const banned = [
    '色情', '情色', '淫秽', '赌博', '博彩', '赌场', '毒品', '吸毒',
    '病毒', '木马', '黑客', '诈骗', '传销',
    '刷量', '返利', '躺赚', '抓包', '前腾讯', '微信微信',
    '先上线后补', '先上架后补', '邀请奖励', '回流奖励', '双向激励',
  ];
  const hits = [];
  for (const f of mdFiles) {
    const content = readFileSync(f, 'utf-8');
    for (const w of banned) {
      if (content.includes(w)) hits.push(`${join('.', sep, f.slice(SKILL_ROOT.length + 1))}:${w}`);
    }
  }
  assert('文档无敏感词/不良口径残留', hits.length === 0, hits.slice(0, 5).join('; '));
}

// 12. 代码硬伤修复回归
console.log('\n[12] 代码硬伤修复回归');
{
  // 12a. perf-profiler 注入片段：语法有效 + globalThis 开关（修复 var 遮蔽导致开关恒 false）
  const perfSrc = readFileSync(join(SCRIPTS, 'perf-profiler.mjs'), 'utf-8');
  const snipTag = perfSrc.indexOf('PERF_SNIPPET');
  const snipOpen = perfSrc.indexOf('`', snipTag);
  const snipClose = perfSrc.indexOf('`', snipOpen + 1);
  const snippet = perfSrc.slice(snipOpen + 1, snipClose);
  assert('perf 片段含注入标记', snippet.includes('PERF PROFILER INJECTED'));
  assert('perf 片段用 globalThis 开关', snippet.includes('globalThis.__PERF_LOG_ENABLED'), 'var 遮蔽修复未生效');
  assert('perf 片段无 var 遮蔽残留', !snippet.includes('var __PERF_LOG_ENABLED'), '残留 var 遮蔽');
  let perfSyntaxOk = true;
  try { new Function(snippet); } catch (_) { perfSyntaxOk = false; }
  assert('perf 片段语法有效', perfSyntaxOk);

  // 12b. project-detector：game.json openDataContext=true 不崩溃（布尔值守卫修复）
  {
    const { detectProject } = await import(new URL('../scripts/lib/project-detector.mjs', import.meta.url));
    const tmpDir = join(TMP_BASE, 'open-data');
    try {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(join(tmpDir, 'game.js'), 'console.log(1);');
      writeFileSync(join(tmpDir, 'game.json'), JSON.stringify({ openDataContext: true }));
      const res = detectProject(tmpDir);
      assert('project-detector openDataContext=true 不崩溃', Array.isArray(res.errors) && res.errors.length === 0, res.errors ? res.errors.join(';') : '');
      assert('project-detector 识别开放数据域', res.info && res.info.hasOpenDataContext === true, 'openDataContext=true 未识别');
    } finally {
      safeRmSync(tmpDir);
    }
  }

  // 12c. verify-devtool：JSON 模式失败时输出 JSON 且退出码 1（修复静默成功）
  {
    const r = run('verify-devtool.mjs', ['--cli', join(TMP_BASE, 'not-exist-cli'), '--json']);
    assert('verify-devtool 无效cli退出码非0', r.status !== 0, `实际 ${r.status}`);
    if (r.status !== 0) {
      let parsed = null;
      try { parsed = JSON.parse(r.stdout); } catch (_) { /* ignore */ }
      assert('verify-devtool JSON模式失败输出JSON', parsed !== null, 'stdout 非 JSON');
      assert('verify-devtool JSON含 ok:false', parsed !== null && parsed.ok === false, '缺少 ok:false');
    }
  }
}

cleanupTmpDirs(); // 结尾兜底：子进程已退出，清掉本次运行残留

console.log(`\n=== 结果：${passed} 通过，${failed} 失败 ===`);
if (failed > 0) {
  console.log('失败项：', failures.join(', '));
  process.exit(1);
}
