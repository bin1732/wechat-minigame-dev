/**
 * 项目检测器（自研）
 *
 * 检测一个目录是否为有效的微信小游戏项目，并提取关键信息：
 *  - 项目类型（小游戏 / 小程序 / 未知）
 *  - AppID
 *  - 项目名称
 *  - 主包大小估算
 *  - 基础库版本
 *  - 是否有分包
 *  - 是否有云开发
 */

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join, extname, relative, sep } from 'node:path';

/**
 * 检测项目
 * @param {string} projectPath
 * @returns {{valid: boolean, type: string, appId: string|null, projectName: string|null, errors: string[], info: object}}
 */
export function detectProject(projectPath) {
  const errors = [];

  if (!existsSync(projectPath)) {
    return {
      valid: false,
      type: 'unknown',
      appId: null,
      projectName: null,
      errors: [`项目路径不存在: ${projectPath}`],
      info: {},
    };
  }

  // 检测关键文件
  const gameJsonPath = join(projectPath, 'game.json');
  const gameJsPath = join(projectPath, 'game.js');
  const projectConfigPath = join(projectPath, 'project.config.json');
  const appJsonPath = join(projectPath, 'app.json');

  const hasGameJson = existsSync(gameJsonPath);
  const hasGameJs = existsSync(gameJsPath);
  const hasProjectConfig = existsSync(projectConfigPath);
  const hasAppJson = existsSync(appJsonPath);

  // 判断类型
  let type = 'unknown';
  if (hasGameJson && hasGameJs) {
    type = 'minigame';
  } else if (hasAppJson) {
    type = 'miniprogram';
  }

  if (type === 'unknown') {
    errors.push('未找到 game.json/game.js 或 app.json，不是有效的微信小游戏/小程序项目');
  }

  // 解析 project.config.json
  let appId = null;
  let projectName = null;
  let libVersion = null;
  if (hasProjectConfig) {
    try {
      const cfg = JSON.parse(readFileSync(projectConfigPath, 'utf-8'));
      appId = cfg.appid || cfg.appId || null;
      projectName = cfg.projectname || cfg.projectName || null;
      libVersion = cfg.libVersion || cfg.lib_version || null;
    } catch (e) {
      errors.push(`project.config.json 解析失败: ${e.message}`);
    }
  }

  // 解析 game.json
  let deviceOrientation = null;
  let subpackages = [];
  let openDataContext = null;
  if (hasGameJson) {
    try {
      const cfg = JSON.parse(readFileSync(gameJsonPath, 'utf-8'));
      deviceOrientation = cfg.deviceOrientation || null;
      subpackages = cfg.subpackages || cfg.subPackages || [];
      openDataContext = cfg.openDataContext || null;
    } catch (e) {
      errors.push(`game.json 解析失败: ${e.message}`);
    }
  }

  // 估算主包大小（排除分包目录、node_modules、.git）
  const mainPackageSize = calcDirSize(projectPath, [
    'node_modules', '.git', 'miniprogram_npm', 'typings',
    ...subpackages.map((s) => s.root || s.name),
  ]);

  // 检测云开发
  const hasCloudFunctions = existsSync(join(projectPath, 'cloudfunctions'))
    || existsSync(join(projectPath, 'cloud'))
    || existsSync(join(projectPath, 'functions'));

  // 检测开放数据域（game.json 中 openDataContext 可能是布尔值 true 或子目录名）
  let hasOpenDataContext = false;
  if (typeof openDataContext === 'string' && openDataContext) {
    hasOpenDataContext = existsSync(join(projectPath, openDataContext));
  } else if (openDataContext === true) {
    hasOpenDataContext = true;
  }

  return {
    valid: type !== 'unknown' && errors.length === 0,
    type,
    appId,
    projectName,
    errors,
    info: {
      hasGameJson,
      hasGameJs,
      hasProjectConfig,
      libVersion,
      deviceOrientation,
      subpackageCount: subpackages.length,
      subpackages,
      mainPackageSizeBytes: mainPackageSize,
      mainPackageSizeMB: +(mainPackageSize / 1024 / 1024).toFixed(2),
      hasCloudFunctions,
      hasOpenDataContext,
    },
  };
}

/**
 * 计算目录大小（排除指定子目录）
 */
export function calcDirSize(dir, excludeDirs = []) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (excludeDirs.includes(entry)) continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        total += calcDirSize(full, []);
      } else {
        total += stat.size;
      }
    }
  } catch (_) {
    // 忽略无权限目录
  }
  return total;
}

/**
 * 列出项目中指定类型的文件
 */
export function listFiles(projectPath, extensions = [], excludeDirs = ['node_modules', '.git', 'miniprogram_npm']) {
  const results = [];
  if (!existsSync(projectPath)) return results;

  function walk(dir) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (excludeDirs.includes(entry)) continue;
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else {
          const ext = extname(entry).toLowerCase().slice(1);
          if (extensions.length === 0 || extensions.includes(ext)) {
            results.push({
              path: full,
              relPath: relative(projectPath, full).split(sep).join('/'),
              size: stat.size,
              ext,
            });
          }
        }
      }
    } catch (_) {
      // 忽略
    }
  }

  walk(projectPath);
  return results;
}

export default { detectProject, calcDirSize, listFiles };
