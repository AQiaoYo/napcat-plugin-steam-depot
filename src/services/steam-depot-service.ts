/**
 * Steam Depot 下载服务
 * 从 GitHub 仓库获取 Steam 游戏的 manifest 和解密密钥
 */

import fs from 'fs';
import path from 'path';
import { pluginState } from '../core/state';
import { fetchFromManifestHub, generateManifestHubLua } from './manifesthub-service';
import type {
    DownloadResult,
    DepotKey,
    RepoConfig,
    GitHubTreeItem,
    SteamAppInfo
} from '../types';

/** CDN 列表，用于下载文件 */
const CDN_URLS = [
    'https://raw.githubusercontent.com',
    'https://ghproxy.org/https://raw.githubusercontent.com',
    'https://raw.dgithub.xyz',
];

/**
 * 获取 GitHub API 请求头
 */
function getGitHubHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'NapCat-Steam-Depot-Plugin'
    };

    if (pluginState.config.useGithubToken && pluginState.config.githubToken) {
        headers['Authorization'] = `token ${pluginState.config.githubToken}`;
    }

    return headers;
}

/**
 * HTTP GET 请求封装
 */
async function httpGet(url: string, headers?: Record<string, string>): Promise<{ status: number; data: unknown; text: string }> {
    try {
        const defaultHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
        };
        const response = await fetch(url, {
            method: 'GET',
            headers: { ...defaultHeaders, ...headers }
        });

        const text = await response.text();
        let data = null;
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }

        return { status: response.status, data, text };
    } catch (error) {
        pluginState.log('error', `HTTP 请求失败: ${url}`, error);
        throw error;
    }
}

/**
 * 下载文件内容
 */
async function downloadFile(repo: string, sha: string, filePath: string): Promise<Buffer | null> {
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    for (const cdn of CDN_URLS) {
        try {
            const url = `${cdn}/${repo}/${sha}/${filePath}`;
            pluginState.logDebug(`尝试下载: ${url}`);

            const response = await fetch(url, {
                headers: defaultHeaders
            });

            if (response.status === 200) {
                const buffer = Buffer.from(await response.arrayBuffer());
                pluginState.logDebug(`下载成功: ${filePath} (${buffer.length} bytes)`);
                return buffer;
            }

            if (response.status === 404) {
                pluginState.logDebug(`文件不存在: ${filePath}`);
                continue;
            }
        } catch (error) {
            pluginState.logDebug(`CDN ${cdn} 下载失败: ${error}`);
        }
    }

    return null;
}

/**
 * 获取 Steam 游戏信息
 */
export async function getSteamAppInfo(appId: string): Promise<SteamAppInfo | null> {
    try {
        const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=schinese`;
        const { status, data } = await httpGet(url);

        const steamData = data as Record<string, { success: boolean; data: Record<string, string> }>;
        if (status === 200 && steamData && steamData[appId]?.success) {
            const appData = steamData[appId].data;
            return {
                name: appData.name,
                appid: parseInt(appId),
                type: appData.type,
                headerImage: appData.header_image,
                shortDescription: appData.short_description
            };
        }
    } catch (error) {
        pluginState.log('error', `获取 Steam 游戏信息失败: ${appId}`, error);
    }

    return null;
}

/**
 * 解析 VDF 文件内容，提取 Depot 密钥
 * 简单的 VDF 解析器
 */
function parseVdfForDepotKeys(content: string): DepotKey[] {
    const keys: DepotKey[] = [];
    const lines = content.split('\n');

    let currentDepotId: string | null = null;
    let inDepotsSection = false;

    for (const line of lines) {
        const trimmed = line.trim();

        // 检测 depots 节
        if (trimmed.toLowerCase() === '"depots"') {
            inDepotsSection = true;
            continue;
        }

        if (!inDepotsSection) continue;

        // 匹配 depot ID (纯数字的键)
        const depotMatch = trimmed.match(/^"(\d+)"$/);
        if (depotMatch) {
            currentDepotId = depotMatch[1];
            continue;
        }

        // 匹配解密密钥
        if (currentDepotId) {
            const keyMatch = trimmed.match(/^"DecryptionKey"\s+"([A-Fa-f0-9]+)"$/i);
            if (keyMatch) {
                keys.push({
                    depotId: currentDepotId,
                    decryptionKey: keyMatch[1]
                });
            }
        }
    }

    return keys;
}

/**
 * 生成 Lua 脚本内容
 */
function generateLuaScript(appId: string, depotKeys: DepotKey[], manifests: string[]): string {
    const lines: string[] = [];

    // 添加 AppID
    lines.push(`addappid(${appId})`);

    // 添加 Depot 密钥
    for (const { depotId, decryptionKey } of depotKeys) {
        lines.push(`addappid(${depotId},1,"${decryptionKey}")`);
    }

    // 添加 Manifest 信息
    const processedDepots = new Set<string>();
    for (const manifest of manifests) {
        // manifest 文件名格式: depotId_manifestId.manifest
        const match = path.basename(manifest).match(/^(\d+)_(\d+)\.manifest$/);
        if (match) {
            const [, depotId, manifestId] = match;
            if (!processedDepots.has(depotId)) {
                // 如果这个 depot 还没有添加过密钥，先添加一个空的
                if (!depotKeys.find(k => k.depotId === depotId)) {
                    lines.push(`addappid(${depotId})`);
                }
                processedDepots.add(depotId);
            }
            lines.push(`setManifestid(${depotId},"${manifestId}",0)`);
        }
    }

    return lines.join('\n');
}

/**
 * 从 Branch 类型仓库下载
 */
async function downloadFromBranchRepo(repo: RepoConfig, appId: string, tempDir: string): Promise<DownloadResult> {
    const result: DownloadResult = {
        success: false,
        appId,
        depotKeys: [],
        manifests: [],
        isBranch: true
    };

    try {
        // 尝试使用 GitHub API 获取分支 zip
        const apiUrl = `https://api.github.com/repos/${repo.name}/zipball/${appId}`;
        pluginState.log('info', `尝试下载 Branch: ${apiUrl}`);

        const response = await fetch(apiUrl, {
            headers: getGitHubHeaders(),
            redirect: 'follow'
        });

        if (response.status === 200) {
            const buffer = Buffer.from(await response.arrayBuffer());
            const zipPath = path.join(tempDir, `${appId}.zip`);

            fs.writeFileSync(zipPath, buffer);
            result.success = true;
            result.zipPath = zipPath;
            result.sourceRepo = repo.name;

            pluginState.log('info', `Branch 下载成功: ${zipPath} (${buffer.length} bytes)`);
        } else if (response.status === 404) {
            pluginState.logDebug(`AppID ${appId} 在仓库 ${repo.name} 中不存在`);
        } else {
            pluginState.log('warn', `下载失败 (${response.status}): ${repo.name}/${appId}`);
        }
    } catch (error) {
        pluginState.log('error', `Branch 下载异常: ${repo.name}/${appId}`, error);
    }

    return result;
}

/**
 * 从非 Branch 类型仓库下载 (Encrypted/Decrypted)
 */
async function downloadFromNonBranchRepo(repo: RepoConfig, appId: string, tempDir: string): Promise<DownloadResult> {
    const result: DownloadResult = {
        success: false,
        appId,
        depotKeys: [],
        manifests: [],
        isBranch: false
    };

    try {
        // 1. 获取分支信息
        const branchUrl = `https://api.github.com/repos/${repo.name}/branches/${appId}`;
        const { status, data } = await httpGet(branchUrl, getGitHubHeaders());

        if (status !== 200) {
            pluginState.logDebug(`AppID ${appId} 在仓库 ${repo.name} 中不存在`);
            return result;
        }

        const branchData = data as { commit?: { sha?: string } };
        const sha = branchData.commit?.sha;
        if (!sha) {
            pluginState.log('warn', `无法获取 commit SHA: ${repo.name}/${appId}`);
            return result;
        }

        // 2. 获取文件树
        const treeUrl = `https://api.github.com/repos/${repo.name}/git/trees/${sha}?recursive=1`;
        const treeResp = await httpGet(treeUrl, getGitHubHeaders());

        if (treeResp.status !== 200) {
            pluginState.log('warn', `无法获取文件树: ${repo.name}/${appId}`);
            return result;
        }

        const treeData = treeResp.data as { tree?: GitHubTreeItem[] };
        const treeItems: GitHubTreeItem[] = treeData.tree || [];
        const appDir = path.join(tempDir, appId);

        if (!fs.existsSync(appDir)) {
            fs.mkdirSync(appDir, { recursive: true });
        }

        // 3. 下载文件
        for (const item of treeItems) {
            if (item.type !== 'blob') continue;

            const fileName = item.path.toLowerCase();

            // 下载 manifest 文件
            if (fileName.endsWith('.manifest')) {
                const content = await downloadFile(repo.name, sha, item.path);
                if (content) {
                    const localPath = path.join(appDir, path.basename(item.path));
                    fs.writeFileSync(localPath, content);
                    result.manifests.push(localPath);
                }
            }

            // 下载 key.vdf 或 config.vdf 并解析密钥
            if (fileName === 'key.vdf' || fileName === 'config.vdf') {
                const content = await downloadFile(repo.name, sha, item.path);
                if (content) {
                    const vdfContent = content.toString('utf-8');
                    const keys = parseVdfForDepotKeys(vdfContent);
                    result.depotKeys.push(...keys);
                    pluginState.logDebug(`从 ${item.path} 提取到 ${keys.length} 个密钥`);
                }
            }
        }

        // 4. 生成 Lua 脚本
        if (result.manifests.length > 0 || result.depotKeys.length > 0) {
            const luaContent = generateLuaScript(appId, result.depotKeys, result.manifests);
            const luaPath = path.join(appDir, `${appId}.lua`);
            fs.writeFileSync(luaPath, luaContent, 'utf-8');
            pluginState.logDebug(`生成 Lua 脚本: ${luaPath}`);
        }

        // 5. 打包成 zip
        if (result.manifests.length > 0) {
            const zipPath = await createZipFromDir(appDir, path.join(tempDir, `${appId}.zip`));
            if (zipPath) {
                result.success = true;
                result.zipPath = zipPath;
                result.sourceRepo = repo.name;
            }
        }

    } catch (error) {
        pluginState.log('error', `下载异常: ${repo.name}/${appId}`, error);
    }

    return result;
}

/**
 * 递归收集目录下所有文件（相对路径）
 */
function collectFiles(dir: string, baseDir: string): { relativePath: string; absolutePath: string }[] {
    const results: { relativePath: string; absolutePath: string }[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const absolutePath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, absolutePath);
        if (entry.isDirectory()) {
            results.push(...collectFiles(absolutePath, baseDir));
        } else if (entry.isFile()) {
            results.push({ relativePath, absolutePath });
        }
    }
    return results;
}

/**
 * 创建 ZIP 文件
 * 使用 Node.js 内置 zlib 模块，无需依赖系统 zip 命令
 */
async function createZipFromDir(sourceDir: string, zipPath: string): Promise<string | null> {
    try {
        const zlib = await import('zlib');

        // 删除已存在的 zip 文件
        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }

        const files = collectFiles(sourceDir, sourceDir);
        const buffers: Buffer[] = [];
        const centralDirectory: Buffer[] = [];
        let offset = 0;

        for (const file of files) {
            const content = fs.readFileSync(file.absolutePath);
            const compressed = zlib.deflateRawSync(content);
            // 使用正斜杠作为 ZIP 内路径分隔符
            const fileNameBuf = Buffer.from(file.relativePath.replace(/\\/g, '/'), 'utf-8');

            // CRC-32 计算
            const crc = crc32(content);

            // Local file header (30 bytes + fileName)
            const localHeader = Buffer.alloc(30);
            localHeader.writeUInt32LE(0x04034b50, 0);   // local file header signature
            localHeader.writeUInt16LE(20, 4);            // version needed to extract
            localHeader.writeUInt16LE(0, 6);             // general purpose bit flag
            localHeader.writeUInt16LE(8, 8);             // compression method: deflate
            localHeader.writeUInt16LE(0, 10);            // last mod file time
            localHeader.writeUInt16LE(0, 12);            // last mod file date
            localHeader.writeUInt32LE(crc, 14);          // crc-32
            localHeader.writeUInt32LE(compressed.length, 18);  // compressed size
            localHeader.writeUInt32LE(content.length, 22);     // uncompressed size
            localHeader.writeUInt16LE(fileNameBuf.length, 26); // file name length
            localHeader.writeUInt16LE(0, 28);            // extra field length

            buffers.push(localHeader, fileNameBuf, compressed);

            // Central directory file header (46 bytes + fileName)
            const centralHeader = Buffer.alloc(46);
            centralHeader.writeUInt32LE(0x02014b50, 0);  // central file header signature
            centralHeader.writeUInt16LE(20, 4);           // version made by
            centralHeader.writeUInt16LE(20, 6);           // version needed to extract
            centralHeader.writeUInt16LE(0, 8);            // general purpose bit flag
            centralHeader.writeUInt16LE(8, 10);           // compression method: deflate
            centralHeader.writeUInt16LE(0, 12);           // last mod file time
            centralHeader.writeUInt16LE(0, 14);           // last mod file date
            centralHeader.writeUInt32LE(crc, 16);         // crc-32
            centralHeader.writeUInt32LE(compressed.length, 20);  // compressed size
            centralHeader.writeUInt32LE(content.length, 24);     // uncompressed size
            centralHeader.writeUInt16LE(fileNameBuf.length, 28); // file name length
            centralHeader.writeUInt16LE(0, 30);           // extra field length
            centralHeader.writeUInt16LE(0, 32);           // file comment length
            centralHeader.writeUInt16LE(0, 34);           // disk number start
            centralHeader.writeUInt16LE(0, 36);           // internal file attributes
            centralHeader.writeUInt32LE(0, 38);           // external file attributes
            centralHeader.writeUInt32LE(offset, 42);      // relative offset of local header

            centralDirectory.push(centralHeader, fileNameBuf);

            offset += localHeader.length + fileNameBuf.length + compressed.length;
        }

        const centralDirSize = centralDirectory.reduce((sum, buf) => sum + buf.length, 0);

        // End of central directory record (22 bytes)
        const eocd = Buffer.alloc(22);
        eocd.writeUInt32LE(0x06054b50, 0);               // end of central dir signature
        eocd.writeUInt16LE(0, 4);                         // number of this disk
        eocd.writeUInt16LE(0, 6);                         // disk where central directory starts
        eocd.writeUInt16LE(files.length, 8);              // number of central directory records on this disk
        eocd.writeUInt16LE(files.length, 10);             // total number of central directory records
        eocd.writeUInt32LE(centralDirSize, 12);           // size of central directory
        eocd.writeUInt32LE(offset, 16);                   // offset of start of central directory
        eocd.writeUInt16LE(0, 20);                        // comment length

        const zipBuffer = Buffer.concat([...buffers, ...centralDirectory, eocd]);
        fs.writeFileSync(zipPath, zipBuffer);

        if (fs.existsSync(zipPath)) {
            const stats = fs.statSync(zipPath);
            pluginState.logDebug(`ZIP 创建成功: ${zipPath} (${stats.size} bytes)`);
            return zipPath;
        }
    } catch (error) {
        pluginState.log('error', `创建 ZIP 失败: ${sourceDir}`, error);
    }

    return null;
}

/**
 * CRC-32 计算（ZIP 标准所需）
 */
function crc32(buf: Buffer): number {
    // 预生成 CRC 表
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
    }

    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * 清理临时目录
 */
export function cleanupTempDir(tempDir: string): void {
    try {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            pluginState.logDebug(`清理临时目录: ${tempDir}`);
        }
    } catch (error) {
        pluginState.log('warn', `清理临时目录失败: ${tempDir}`, error);
    }
}

/**
 * 下载 Steam Depot 数据
 * 主入口函数
 */
export async function downloadSteamDepot(appId: string): Promise<DownloadResult> {
    const result: DownloadResult = {
        success: false,
        appId,
        depotKeys: [],
        manifests: [],
        isBranch: false
    };

    // 验证 AppID 格式
    if (!/^\d+$/.test(appId)) {
        result.error = '无效的 AppID 格式';
        return result;
    }

    pluginState.log('info', `开始下载 AppID: ${appId}`);

    // 获取游戏信息
    const gameInfo = await getSteamAppInfo(appId);
    if (gameInfo) {
        result.gameName = gameInfo.name;
        pluginState.log('info', `游戏名称: ${gameInfo.name}`);
    }

    // 创建临时目录
    const tempDir = path.join(pluginState.dataPath, pluginState.config.tempDir, `download_${appId}_${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
        // ==================== ManifestHub 数据源 ====================
        if (pluginState.config.manifestHub?.enabled) {
            pluginState.log('info', `[ManifestHub] 尝试通过 ManifestHub 获取 AppID ${appId} 的数据...`);
            try {
                const hubResult = await fetchFromManifestHub(appId);

                if (hubResult.success) {
                    const manifestHubConfig = pluginState.config.manifestHub;

                    // 生成 Lua 脚本
                    const luaContent = generateManifestHubLua(
                        appId,
                        hubResult.depotKeys,
                        hubResult.manifests,
                        hubResult.dlcIds,
                        manifestHubConfig.setManifestId,
                    );

                    // 创建输出目录
                    const appDir = path.join(tempDir, appId);
                    if (!fs.existsSync(appDir)) {
                        fs.mkdirSync(appDir, { recursive: true });
                    }

                    // 写入 Lua 文件
                    const luaPath = path.join(appDir, `${appId}.lua`);
                    fs.writeFileSync(luaPath, luaContent, 'utf-8');
                    pluginState.log('info', `[ManifestHub] 生成 Lua 脚本: ${luaPath}`);

                    // 写入密钥信息文件（便于用户查看）
                    if (hubResult.depotKeys.length > 0) {
                        const keyLines = hubResult.depotKeys.map(k => `${k.depotId}\t${k.decryptionKey}`);
                        const keyContent = `# Steam Depot Keys for AppID ${appId}\n# DepotID\tDecryptionKey\n${keyLines.join('\n')}`;
                        fs.writeFileSync(path.join(appDir, 'depot_keys.txt'), keyContent, 'utf-8');
                    }

                    // 写入 Manifest 信息文件
                    if (Object.keys(hubResult.manifests).length > 0) {
                        const manifestLines = Object.entries(hubResult.manifests).map(([depotId, manifestId]) => `${depotId}\t${manifestId}`);
                        const manifestContent = `# Steam Manifests for AppID ${appId}\n# DepotID\tManifestID\n${manifestLines.join('\n')}`;
                        fs.writeFileSync(path.join(appDir, 'manifests.txt'), manifestContent, 'utf-8');
                    }

                    // 打包成 zip
                    const zipPath = await createZipFromDir(appDir, path.join(tempDir, `${appId}.zip`));
                    if (zipPath) {
                        result.success = true;
                        result.zipPath = zipPath;
                        result.depotKeys = hubResult.depotKeys;
                        result.manifests = Object.entries(hubResult.manifests).map(
                            ([depotId, manifestId]) => `${depotId}_${manifestId}.manifest`
                        );
                        result.sourceRepo = `ManifestHub (${hubResult.keySource || 'SAC'})`;
                        pluginState.log('info', `[ManifestHub] AppID ${appId} 处理完成`);
                        return result;
                    }
                }
            } catch (hubError) {
                pluginState.log('warn', `[ManifestHub] 获取失败，回退到 GitHub 仓库方式: ${hubError}`);
            }
        }

        // ==================== GitHub 仓库数据源（回退） ====================
        // 获取启用的仓库
        const enabledRepos = pluginState.config.repositories.filter(r => r.enabled);

        if (enabledRepos.length === 0) {
            result.error = '没有启用的仓库，请在配置中启用至少一个仓库';
            return result;
        }

        // 优先尝试 Branch 类型仓库
        const branchRepos = enabledRepos.filter(r => r.type === 'Branch');
        for (const repo of branchRepos) {
            const branchResult = await downloadFromBranchRepo(repo, appId, tempDir);
            if (branchResult.success) {
                return branchResult;
            }
        }

        // 尝试非 Branch 类型仓库
        const nonBranchRepos = enabledRepos.filter(r => r.type !== 'Branch');
        for (const repo of nonBranchRepos) {
            const repoResult = await downloadFromNonBranchRepo(repo, appId, tempDir);
            if (repoResult.success) {
                // 合并游戏名称
                if (result.gameName) {
                    repoResult.gameName = result.gameName;
                }
                return repoResult;
            }
        }

        result.error = `在所有仓库中都未找到 AppID ${appId}`;

    } catch (error) {
        result.error = `下载过程发生错误: ${error}`;
        pluginState.log('error', '下载失败:', error);
    }

    return result;
}

/**
 * 获取下载结果的文件大小（用于展示）
 */
export function getFileSizeString(filePath: string): string {
    try {
        const stats = fs.statSync(filePath);
        const bytes = stats.size;

        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    } catch {
        return '未知大小';
    }
}
