/**
 * 构建后资源复制脚本
 * 将 webui、templates 和 package.json 复制到 dist 目录
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

// 确保 dist 目录存在
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// 复制 webui 目录（如果存在）
const webuiSrc = path.resolve(rootDir, 'src/webui');
const webuiDest = path.resolve(distDir, 'webui');
if (fs.existsSync(webuiSrc)) {
    fs.cpSync(webuiSrc, webuiDest, { recursive: true });
    console.log('✅ 已复制 webui 目录');
}

// 复制 templates 目录（如果存在）
const templatesSrc = path.resolve(rootDir, 'templates');
const templatesDest = path.resolve(distDir, 'templates');
if (fs.existsSync(templatesSrc)) {
    fs.cpSync(templatesSrc, templatesDest, { recursive: true });
    console.log('✅ 已复制 templates 目录');
}

// 复制并清理 package.json
const pkgPath = path.resolve(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
delete pkg.devDependencies;
delete pkg.scripts;
fs.writeFileSync(
    path.resolve(distDir, 'package.json'),
    JSON.stringify(pkg, null, 2)
);
console.log('✅ 已复制 package.json 到 dist 目录');

console.log('🎉 资源复制完成！');
