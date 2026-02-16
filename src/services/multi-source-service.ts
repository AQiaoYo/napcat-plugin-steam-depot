/**
 * 多清单源服务
 * 集成来自 cai-install 项目的多个清单源
 * 包括: printedwaste, cysaw, furcate, assiw, steamdatabase, steamautocracks_v2, buqiuren
 */

import { pluginState } from '../core/state';
import type { DownloadResult, SteamAppInfo, ManifestSourceType, ManifestSourceConfig } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { createWriteStream } from 'fs';

// ==================== 类型定义 ====================

/**
 * 清单源下载结果
 */
export interface SourceDownloadResult extends DownloadResult {
    /** 来源名称 */
    sourceName?: ManifestSourceType;
}

// ==================== 常量配置 ====================

/**
 * 默认清单源配置
 */
export const DEFAULT_MANIFEST_SOURCES: ManifestSourceConfig[] = [
    {
        name: 'printedwaste',
        enabled: true,
        displayName: 'PrintedWaste',
        baseUrl: 'https://github.com/printedwaste/ManifestHub/raw/main'
    },
    {
        name: 'cysaw',
        enabled: true,
        displayName: 'Cysaw',
        baseUrl: 'https://github.com/cysaw/ManifestAutoUpdate/raw/main'
    },
    {
        name: 'furcate',
        enabled: true,
        displayName: 'Furcate',
        baseUrl: 'https://github.com/furcate/ManifestHub/raw/main'
    },
    {
        name: 'assiw',
        enabled: true,
        displayName: 'Assiw',
        baseUrl: 'https://github.com/assiw/ManifestAutoUpdate/raw/main'
    },
    {
        name: 'steamdatabase',
        enabled: true,
        displayName: 'SteamDatabase',
        baseUrl: 'https://github.com/SteamDatabase/ManifestHub/raw/main'
    },
    {
        name: 'steamautocracks_v2',
        enabled: true,
        displayName: 'SteamAutoCracks V2',
        baseUrl: 'https://api.steam.ddxnb.cn'
    },
    {
        name: 'buqiuren',
        enabled: false,
        displayName: 'Buqiuren',
        baseUrl: 'https://api.buqiuren.com'
    }
];

// ==================== 密钥解析工具 ====================

/**
 * 从 Lua 文件内容中解析 Depot 密钥
 * 参考 cai-install 的 parse_lua_file_for_depots 实现
 * 匹配格式: addappid(depotId, 1, "key")
 */
function parseLuaForDepotKeys(luaContent: string): Array<{ depotId: string; decryptionKey: string }> {
    const keys: Array<{ depotId: string; decryptionKey: string }> = [];
    const pattern = /addappid\((\d+),\s*1,\s*"([^"]+)"\)/g;
    let match;
    while ((match = pattern.exec(luaContent)) !== null) {
        keys.push({
            depotId: match[1],
            decryptionKey: match[2]
        });
    }
    return keys;
}

/**
 * 从 VDF 文件内容中解析 Depot 密钥
 * 匹配 "depots" 节中的 "DecryptionKey"
 */
function parseVdfForDepotKeys(vdfContent: string): Array<{ depotId: string; decryptionKey: string }> {
    const keys: Array<{ depotId: string; decryptionKey: string }> = [];
    const lines = vdfContent.split('\n');

    let currentDepotId: string | null = null;
    let inDepotsSection = false;

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.toLowerCase() === '"depots"') {
            inDepotsSection = true;
            continue;
        }

        if (!inDepotsSection) continue;

        const depotMatch = trimmed.match(/^"(\d+)"$/);
        if (depotMatch) {
            currentDepotId = depotMatch[1];
            continue;
        }

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

// ==================== 工具函数 ====================

/**
 * HTTP GET 请求
 */
async function httpGet(url: string, headers?: Record<string, string>): Promise<{ status: number; data: Buffer; text: string }> {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { headers }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const data = Buffer.concat(chunks);
                resolve({
                    status: res.statusCode || 0,
                    data,
                    text: data.toString('utf-8')
                });
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * 下载文件到本地
 */
async function downloadFile(url: string, destPath: string): Promise<boolean> {
    try {
        const client = url.startsWith('https') ? https : http;
        return new Promise((resolve, reject) => {
            client.get(url, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                const fileStream = createWriteStream(destPath);
                res.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve(true);
                });
                fileStream.on('error', reject);
            }).on('error', reject);
        });
    } catch (error) {
        pluginState.logDebug(`下载文件失败: ${url} -> ${error}`);
        return false;
    }
}

/**
 * 递归收集目录下所有文件的绝对路径
 */
function collectFilesRecursive(dir: string): string[] {
    const results: string[] = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...collectFilesRecursive(fullPath));
            } else if (entry.isFile()) {
                results.push(fullPath);
            }
        }
    } catch (e) {
        pluginState.logDebug(`遍历目录失败: ${dir} - ${e}`);
    }
    return results;
}

/**
 * 获取 Steam 游戏信息
 */
async function getSteamAppInfo(appId: string): Promise<SteamAppInfo | null> {
    try {
        const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=schinese`;
        const res = await httpGet(url);
        if (res.status === 200) {
            const json = JSON.parse(res.text);
            if (json[appId]?.success && json[appId]?.data) {
                const data = json[appId].data;
                return {
                    name: data.name,
                    appid: parseInt(appId),
                    type: data.type,
                    headerImage: data.header_image,
                    shortDescription: data.short_description
                };
            }
        }
    } catch (error) {
        pluginState.logDebug(`获取 Steam 游戏信息失败: ${appId}`);
    }
    return null;
}

// ==================== ZIP 格式清单源处理 ====================

/**
 * 从 ZIP 格式清单源下载
 * 适用于: printedwaste, cysaw, furcate, assiw, steamdatabase
 */
async function downloadFromZipSource(
    appId: string,
    source: ManifestSourceConfig,
    tempDir: string
): Promise<SourceDownloadResult> {
    const result: SourceDownloadResult = {
        success: false,
        appId,
        depotKeys: [],
        manifests: [],
        isBranch: false,
        sourceName: source.name
    };

    try {
        pluginState.logDebug(`尝试从 ${source.displayName} 下载 AppID: ${appId}`);

        // 构建下载 URL
        const zipUrl = `${source.baseUrl}/${appId}.zip`;
        const zipPath = path.join(tempDir, `${appId}_${source.name}.zip`);

        // 下载 ZIP 文件
        const downloaded = await downloadFile(zipUrl, zipPath);
        if (!downloaded || !fs.existsSync(zipPath)) {
            result.error = `从 ${source.displayName} 下载失败`;
            return result;
        }

        // 解压 ZIP 文件
        const extractDir = path.join(tempDir, `${appId}_${source.name}`);
        if (!fs.existsSync(extractDir)) {
            fs.mkdirSync(extractDir, { recursive: true });
        }

        // 使用 adm-zip 解压
        try {
            const AdmZip = (await import('adm-zip')).default;
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(extractDir, true);
        } catch (zipError) {
            result.error = `解压 ZIP 失败: ${zipError}`;
            return result;
        }

        // 递归收集所有文件（ZIP 可能有子目录）
        const allFiles = collectFilesRecursive(extractDir);
        const manifestFiles = allFiles.filter(f => f.endsWith('.manifest'));
        const luaFiles = allFiles.filter(f => f.endsWith('.lua'));
        const vdfFiles = allFiles.filter(f => {
            const name = path.basename(f).toLowerCase();
            return name === 'key.vdf' || name === 'config.vdf';
        });

        // 从 .lua 文件中解析密钥
        for (const luaFile of luaFiles) {
            try {
                const luaContent = fs.readFileSync(luaFile, 'utf-8');
                const keys = parseLuaForDepotKeys(luaContent);
                if (keys.length > 0) {
                    result.depotKeys.push(...keys);
                    pluginState.logDebug(`从 ${path.basename(luaFile)} 解析到 ${keys.length} 个密钥`);
                }
            } catch (e) {
                pluginState.logDebug(`解析 Lua 文件失败: ${luaFile} - ${e}`);
            }
        }

        // 从 key.vdf / config.vdf 文件中解析密钥
        for (const vdfFile of vdfFiles) {
            try {
                const vdfContent = fs.readFileSync(vdfFile, 'utf-8');
                const keys = parseVdfForDepotKeys(vdfContent);
                if (keys.length > 0) {
                    result.depotKeys.push(...keys);
                    pluginState.logDebug(`从 ${path.basename(vdfFile)} 解析到 ${keys.length} 个密钥`);
                }
            } catch (e) {
                pluginState.logDebug(`解析 VDF 文件失败: ${vdfFile} - ${e}`);
            }
        }

        result.manifests = manifestFiles;
        result.success = manifestFiles.length > 0 || result.depotKeys.length > 0;
        result.sourceRepo = source.displayName;

        if (result.success) {
            pluginState.log('info', `从 ${source.displayName} 成功获取: ${manifestFiles.length} 个 manifest, ${result.depotKeys.length} 个密钥`);
        } else {
            result.error = `ZIP 中未找到 manifest 文件或密钥`;
        }

        // 清理 ZIP 文件
        fs.unlinkSync(zipPath);

    } catch (error) {
        result.error = `${source.displayName} 处理失败: ${error}`;
        pluginState.logDebug(result.error);
    }

    return result;
}

// ==================== SteamAutoCracks V2 处理 ====================

/**
 * 从 SteamAutoCracks V2 API 获取数据
 */
async function downloadFromSteamAutoCracksV2(
    appId: string,
    tempDir: string
): Promise<SourceDownloadResult> {
    const result: SourceDownloadResult = {
        success: false,
        appId,
        depotKeys: [],
        manifests: [],
        isBranch: false,
        sourceName: 'steamautocracks_v2'
    };

    try {
        pluginState.logDebug(`尝试从 SteamAutoCracks V2 获取 AppID: ${appId}`);

        // 获取 Depot 和 Manifest 映射
        const infoUrl = `https://steam.ddxnb.cn/v1/info/${appId}`;
        const res = await httpGet(infoUrl);

        if (res.status !== 200) {
            result.error = 'SteamAutoCracks V2 API 请求失败';
            return result;
        }

        const data = JSON.parse(res.text);
        if (!data.depots || Object.keys(data.depots).length === 0) {
            result.error = '未找到 Depot 信息';
            return result;
        }

        // 提取 Depot 和 Manifest 信息
        const depots = data.depots;
        const manifestMap: Record<string, string> = {};

        for (const [depotId, depotInfo] of Object.entries(depots)) {
            if (typeof depotInfo === 'object' && depotInfo !== null) {
                const info = depotInfo as any;
                if (info.manifests && info.manifests.public) {
                    manifestMap[depotId] = info.manifests.public;
                }
            }
        }

        if (Object.keys(manifestMap).length === 0) {
            result.error = '未找到可用的 Manifest';
            return result;
        }

        // 生成虚拟 manifest 文件（实际上只需要 ID）
        const extractDir = path.join(tempDir, `${appId}_sac_v2`);
        if (!fs.existsSync(extractDir)) {
            fs.mkdirSync(extractDir, { recursive: true });
        }

        const manifestFiles: string[] = [];
        for (const [depotId, manifestId] of Object.entries(manifestMap)) {
            const manifestPath = path.join(extractDir, `${depotId}_${manifestId}.manifest`);
            fs.writeFileSync(manifestPath, `# Depot: ${depotId}\n# Manifest: ${manifestId}\n`);
            manifestFiles.push(manifestPath);
        }

        result.manifests = manifestFiles;
        result.success = true;
        result.sourceRepo = 'SteamAutoCracks V2';

        pluginState.log('info', `从 SteamAutoCracks V2 成功获取 ${manifestFiles.length} 个 Depot 信息`);

    } catch (error) {
        result.error = `SteamAutoCracks V2 处理失败: ${error}`;
        pluginState.logDebug(result.error);
    }

    return result;
}

// ==================== Buqiuren 处理 ====================

/**
 * 从 Buqiuren API 获取数据
 */
async function downloadFromBuqiuren(
    appId: string,
    tempDir: string
): Promise<SourceDownloadResult> {
    const result: SourceDownloadResult = {
        success: false,
        appId,
        depotKeys: [],
        manifests: [],
        isBranch: false,
        sourceName: 'buqiuren'
    };

    try {
        pluginState.logDebug(`尝试从 Buqiuren 获取 AppID: ${appId}`);

        // 获取 Session Token
        const tokenUrl = 'https://api.buqiuren.com/api/get_session_token';
        const tokenRes = await httpGet(tokenUrl);

        if (tokenRes.status !== 200) {
            result.error = 'Buqiuren 获取 Token 失败';
            return result;
        }

        const tokenData = JSON.parse(tokenRes.text);
        const sessionToken = tokenData.session_token;

        if (!sessionToken) {
            result.error = 'Buqiuren Token 无效';
            return result;
        }

        // 获取 Depot 列表
        const depotUrl = `https://api.buqiuren.com/api/get_depots?appid=${appId}&session_token=${sessionToken}`;
        const depotRes = await httpGet(depotUrl);

        if (depotRes.status !== 200) {
            result.error = 'Buqiuren 获取 Depot 失败';
            return result;
        }

        const depotData = JSON.parse(depotRes.text);
        if (!depotData.depots || depotData.depots.length === 0) {
            result.error = '未找到 Depot 信息';
            return result;
        }

        // 下载 Manifest 文件
        const extractDir = path.join(tempDir, `${appId}_buqiuren`);
        if (!fs.existsSync(extractDir)) {
            fs.mkdirSync(extractDir, { recursive: true });
        }

        const manifestFiles: string[] = [];
        for (const depot of depotData.depots) {
            const depotId = depot.depot_id;
            const manifestId = depot.manifest_id;

            if (!depotId || !manifestId) continue;

            const manifestUrl = `https://api.buqiuren.com/api/download_manifest?depot_id=${depotId}&manifest_id=${manifestId}&session_token=${sessionToken}`;
            const manifestPath = path.join(extractDir, `${depotId}_${manifestId}.manifest`);

            const downloaded = await downloadFile(manifestUrl, manifestPath);
            if (downloaded) {
                manifestFiles.push(manifestPath);
            }
        }

        result.manifests = manifestFiles;
        result.success = manifestFiles.length > 0;
        result.sourceRepo = 'Buqiuren';

        if (result.success) {
            pluginState.log('info', `从 Buqiuren 成功下载 ${manifestFiles.length} 个 manifest 文件`);
        } else {
            result.error = '未能下载任何 manifest 文件';
        }

    } catch (error) {
        result.error = `Buqiuren 处理失败: ${error}`;
        pluginState.logDebug(result.error);
    }

    return result;
}

// ==================== 主导出函数 ====================

/**
 * 从多个清单源下载
 * 按优先级尝试各个源，返回第一个成功的结果
 */
export async function downloadFromMultiSources(
    appId: string,
    sources?: ManifestSourceConfig[]
): Promise<SourceDownloadResult> {
    const tempDir = path.join(pluginState.dataPath, pluginState.config.tempDir, `multi_source_${appId}_${Date.now()}`);

    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // 使用默认源或自定义源
    const sourcesToTry = sources || DEFAULT_MANIFEST_SOURCES.filter(s => s.enabled);

    pluginState.log('info', `开始从多个清单源下载 AppID: ${appId}`);

    // 按顺序尝试每个源
    for (const source of sourcesToTry) {
        if (!source.enabled) continue;

        let result: SourceDownloadResult;

        switch (source.name) {
            case 'steamautocracks_v2':
                result = await downloadFromSteamAutoCracksV2(appId, tempDir);
                break;
            case 'buqiuren':
                result = await downloadFromBuqiuren(appId, tempDir);
                break;
            default:
                // ZIP 格式源
                result = await downloadFromZipSource(appId, source, tempDir);
                break;
        }

        if (result.success) {
            // 获取游戏信息
            const appInfo = await getSteamAppInfo(appId);
            if (appInfo) {
                result.gameName = appInfo.name;
            }

            pluginState.log('info', `成功从 ${source.displayName} 获取数据`);
            return result;
        }

        pluginState.logDebug(`${source.displayName} 失败: ${result.error}`);
    }

    // 所有源都失败
    return {
        success: false,
        error: '所有清单源均失败',
        appId,
        depotKeys: [],
        manifests: [],
        isBranch: false
    };
}

/**
 * 获取启用的清单源列表
 */
export function getEnabledSources(): ManifestSourceConfig[] {
    return DEFAULT_MANIFEST_SOURCES.filter(s => s.enabled);
}

/**
 * 更新清单源配置
 */
export function updateSourceConfig(name: ManifestSourceType, enabled: boolean): void {
    const source = DEFAULT_MANIFEST_SOURCES.find(s => s.name === name);
    if (source) {
        source.enabled = enabled;
        pluginState.log('info', `清单源 ${source.displayName} 已${enabled ? '启用' : '禁用'}`);
    }
}
