/**
 * ManifestHub 服务模块
 * 参考 ManifestHub-GUI 的实现，从公开数据源获取 Steam Depot 密钥和清单信息
 *
 * 数据流：
 * 1. DepotKeys: 从 GitHub (SAC) 或第三方 API (Sudama) 获取全量 depotkeys.json
 * 2. Manifests: 从 steam.ddxnb.cn 获取指定 AppID 的 depot→manifest 映射
 * 3. DLC 信息: 从 api.steamcmd.net 获取 DLC 列表
 * 4. 合并生成 Lua 脚本
 */

import fs from 'fs';
import path from 'path';
import { pluginState } from '../core/state';
import type {
    DepotKey,
    DepotKeysMap,
    DepotKeySource,
    ManifestMap,
    ManifestHubResult,
} from '../types';

// ==================== 常量定义 ====================

/** SAC (AQiaoYo/ManifestHub) DepotKey 数据源列表（国内镜像优先） */
const SAC_DEPOTKEY_SOURCES = [
    // 国内 CDN 镜像（优先）
    'https://cdn.jsdmirror.com/gh/AQiaoYo/ManifestHub@main/depotkeys.json',
    'https://gh.akass.cn/AQiaoYo/ManifestHub/main/depotkeys.json',
    'https://ghfast.top/https://raw.githubusercontent.com/AQiaoYo/ManifestHub/main/depotkeys.json',
    'https://gh-proxy.com/https://raw.githubusercontent.com/AQiaoYo/ManifestHub/main/depotkeys.json',
    'https://raw.gitmirror.com/AQiaoYo/ManifestHub/main/depotkeys.json',
    'https://raw.dgithub.xyz/AQiaoYo/ManifestHub/main/depotkeys.json',
    // GitHub 官方源（回退）
    'https://raw.githubusercontent.com/AQiaoYo/ManifestHub/main/depotkeys.json',
];

/** Sudama DepotKey 数据源 */
const SUDAMA_DEPOTKEY_URL = 'https://api.993499094.xyz/depotkeys.json';

/** Steam Depot 信息 API (获取 manifest) */
const STEAM_DEPOT_INFO_API = 'https://steam.ddxnb.cn/v1/info';

/** SteamCMD API (获取 DLC 信息) */
const STEAMCMD_API = 'https://api.steamcmd.net/v1/info';

/** 默认请求头 */
const DEFAULT_HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// ==================== 缓存管理 ====================

/** DepotKeys 内存缓存 */
let depotKeysCache: DepotKeysMap | null = null;
/** 缓存时间戳 */
let depotKeysCacheTime: number = 0;

/**
 * 获取缓存文件路径
 */
function getCachePath(): string {
    return path.join(pluginState.dataPath, 'cache', 'depotkeys.json');
}

/**
 * 从本地缓存加载 DepotKeys
 */
function loadDepotKeysFromCache(): DepotKeysMap | null {
    try {
        const cachePath = getCachePath();
        if (!fs.existsSync(cachePath)) return null;

        const cacheExpireHours = pluginState.config.manifestHub?.cacheExpireHours ?? 24;
        if (cacheExpireHours <= 0) return null;

        const stat = fs.statSync(cachePath);
        const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
        if (ageHours > cacheExpireHours) {
            pluginState.logDebug(`DepotKeys 缓存已过期 (${ageHours.toFixed(1)}h > ${cacheExpireHours}h)`);
            return null;
        }

        const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        if (typeof data === 'object' && data !== null && Object.keys(data).length > 0) {
            pluginState.logDebug(`从本地缓存加载 ${Object.keys(data).length} 个 DepotKeys`);
            return data as DepotKeysMap;
        }
    } catch (error) {
        pluginState.logDebug(`读取 DepotKeys 缓存失败: ${error}`);
    }
    return null;
}

/**
 * 保存 DepotKeys 到本地缓存
 */
function saveDepotKeysToCache(keys: DepotKeysMap): void {
    try {
        const cachePath = getCachePath();
        const cacheDir = path.dirname(cachePath);
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        fs.writeFileSync(cachePath, JSON.stringify(keys), 'utf-8');
        pluginState.logDebug(`已保存 ${Object.keys(keys).length} 个 DepotKeys 到缓存`);
    } catch (error) {
        pluginState.log('warn', `保存 DepotKeys 缓存失败: ${error}`);
    }
}

// ==================== HTTP 请求 ====================

/** 默认请求超时时间（毫秒） */
const DEFAULT_TIMEOUT = 30_000;
/** DepotKeys 下载超时（文件较大，给更多时间） */
const DEPOTKEYS_TIMEOUT = 60_000;

/**
 * HTTP GET 请求封装（带超时）
 */
async function httpGet(url: string, extraHeaders?: Record<string, string>, timeout: number = DEFAULT_TIMEOUT): Promise<{ status: number; text: string; data: any }> {
    const headers = { ...DEFAULT_HEADERS, ...extraHeaders };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
        const text = await response.text();
        let data: any = null;
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
        return { status: response.status, text, data };
    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            throw new Error(`请求超时 (${timeout}ms): ${url}`);
        }
        pluginState.log('error', `HTTP GET 失败: ${url}`, error);
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

// ==================== DepotKeys 获取 ====================

/**
 * 从单个 URL 获取 DepotKeys（带超时，支持外部取消）
 * 返回 null 表示失败
 */
async function fetchDepotKeysFromUrl(url: string, signal?: AbortSignal): Promise<DepotKeysMap | null> {
    try {
        const extraHeaders: Record<string, string> = {};
        if (url.includes('raw.githubusercontent.com') && pluginState.config.useGithubToken && pluginState.config.githubToken) {
            extraHeaders['Authorization'] = `Bearer ${pluginState.config.githubToken}`;
        }

        const headers = { ...DEFAULT_HEADERS, ...extraHeaders };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DEPOTKEYS_TIMEOUT);

        // 监听外部取消信号
        const onAbort = () => controller.abort();
        signal?.addEventListener('abort', onAbort);

        try {
            const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
            const text = await response.text();
            let data: any = null;
            try { data = JSON.parse(text); } catch { data = text; }

            if (response.status !== 200) return null;
            if (typeof data !== 'object' || data === null || Object.keys(data).length === 0) return null;

            return data as DepotKeysMap;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }
    } catch {
        return null;
    }
}

/**
 * 从 SAC (AQiaoYo/ManifestHub) GitHub 仓库获取 DepotKeys
 * 使用竞速模式：所有镜像源并发请求，第一个成功后立即取消其余请求
 */
async function fetchSACDepotKeys(): Promise<DepotKeysMap> {
    pluginState.log('info', `开始竞速下载 DepotKeys (${SAC_DEPOTKEY_SOURCES.length} 个源)...`);
    const startTime = Date.now();

    // 共享的取消控制器，一个源成功后取消其余所有请求
    const sharedController = new AbortController();

    const racePromises = SAC_DEPOTKEY_SOURCES.map(async (url, index) => {
        pluginState.logDebug(`[源${index}] 尝试: ${url}`);
        const keys = await fetchDepotKeysFromUrl(url, sharedController.signal);
        if (keys) {
            pluginState.log('info', `[源${index}] 成功! ${Object.keys(keys).length} 个 DepotKeys, 耗时 ${Date.now() - startTime}ms, URL: ${url}`);
            // 取消其他还在进行的请求
            sharedController.abort();
            return keys;
        }
        throw new Error(`源 ${index} 失败: ${url}`);
    });

    try {
        const keys = await Promise.any(racePromises);
        return keys;
    } catch (aggregateError) {
        throw new Error(`所有 SAC 源均失败`);
    }
}

/**
 * 从 Sudama 第三方 API 获取 DepotKeys
 */
async function fetchSudamaDepotKeys(): Promise<DepotKeysMap> {
    pluginState.logDebug(`从 Sudama API 获取 DepotKeys: ${SUDAMA_DEPOTKEY_URL}`);

    const { status, data } = await httpGet(SUDAMA_DEPOTKEY_URL);

    if (status !== 200) {
        throw new Error(`Sudama API 返回 ${status}`);
    }

    if (typeof data !== 'object' || data === null || Object.keys(data).length === 0) {
        throw new Error('Sudama API 返回空数据');
    }

    const keys = data as DepotKeysMap;
    pluginState.log('info', `从 Sudama API 获取到 ${Object.keys(keys).length} 个 DepotKeys`);
    return keys;
}

/**
 * 获取 DepotKeys（带缓存）
 * @param forceRefresh 是否强制刷新（忽略缓存）
 */
export async function getDepotKeys(forceRefresh: boolean = false): Promise<DepotKeysMap> {
    const source = pluginState.config.manifestHub?.depotKeySource ?? 'SAC';

    // 检查内存缓存
    if (!forceRefresh && depotKeysCache) {
        const cacheExpireHours = pluginState.config.manifestHub?.cacheExpireHours ?? 24;
        const ageHours = (Date.now() - depotKeysCacheTime) / (1000 * 60 * 60);
        if (ageHours < cacheExpireHours) {
            pluginState.logDebug(`使用内存缓存的 DepotKeys (${Object.keys(depotKeysCache).length} 个, ${ageHours.toFixed(1)}h)`);
            return depotKeysCache;
        }
    }

    // 检查本地文件缓存
    if (!forceRefresh) {
        const cached = loadDepotKeysFromCache();
        if (cached) {
            depotKeysCache = cached;
            depotKeysCacheTime = Date.now();
            return cached;
        }
    }

    // 从网络获取
    pluginState.log('info', `从 ${source} 获取 DepotKeys...`);
    let keys: DepotKeysMap;

    if (source === 'Sudama') {
        keys = await fetchSudamaDepotKeys();
    } else {
        keys = await fetchSACDepotKeys();
    }

    // 更新缓存
    depotKeysCache = keys;
    depotKeysCacheTime = Date.now();
    saveDepotKeysToCache(keys);

    return keys;
}

// ==================== Manifest 获取 ====================

/**
 * 从 steam.ddxnb.cn 获取指定 AppID 的 Depot → Manifest 映射
 * 参考 ManifestHub-GUI 的 GetManifests 实现
 */
export async function getManifests(appId: string): Promise<ManifestMap> {
    const url = `${STEAM_DEPOT_INFO_API}/${appId}`;
    pluginState.log('info', `获取 Manifests: ${url}`);

    const { status, data } = await httpGet(url);

    if (status !== 200) {
        throw new Error(`Manifest API 返回 ${status}`);
    }

    // 检查 API 状态
    if (!data || data.status !== 'success') {
        throw new Error(`Manifest API 请求失败: ${JSON.stringify(data?.status || data)}`);
    }

    // 解析数据: data.data[appId].depots
    const appData = data.data?.[appId];
    if (!appData) {
        throw new Error(`未找到 AppID ${appId} 的数据`);
    }

    const depots = appData.depots;
    if (!depots || typeof depots !== 'object') {
        throw new Error(`AppID ${appId} 没有 Depot 数据`);
    }

    const manifestMap: ManifestMap = {};

    for (const depotId of Object.keys(depots)) {
        // 过滤非数字的 Depot ID（如 "branches" 等）
        if (!/^\d+$/.test(depotId)) continue;

        const depotInfo = depots[depotId];
        if (!depotInfo || typeof depotInfo !== 'object') continue;

        // 提取 manifests.public.gid
        const publicManifest = depotInfo.manifests?.public;
        if (publicManifest && typeof publicManifest === 'object') {
            const gid = publicManifest.gid;
            if (typeof gid === 'string' && gid) {
                manifestMap[depotId] = gid;
            }
        }
    }

    pluginState.log('info', `获取到 ${Object.keys(manifestMap).length} 个 Depot 的 Manifest`);
    return manifestMap;
}

// ==================== DLC 信息获取 ====================

/**
 * 从 SteamCMD API 获取 DLC 列表
 * 参考 ManifestHub-GUI 的 GetDLC 实现
 */
export async function getDLCList(appId: string): Promise<string[]> {
    const url = `${STEAMCMD_API}/${appId}`;
    pluginState.logDebug(`获取 DLC 列表: ${url}`);

    try {
        const { status, data } = await httpGet(url);

        if (status !== 200 || !data) {
            pluginState.logDebug(`DLC API 返回 ${status}`);
            return [];
        }

        const appData = data.data?.[appId];
        if (!appData) return [];

        const dlcIds = new Set<string>();

        // 从 common.listofdlc 提取
        const commonList = appData.common?.listofdlc;
        if (typeof commonList === 'string') {
            const matches = commonList.match(/\d+/g);
            if (matches) matches.forEach((id: string) => dlcIds.add(id));
        }

        // 从 extended.listofdlc 提取
        const extendedList = appData.extended?.listofdlc;
        if (typeof extendedList === 'string') {
            const matches = extendedList.match(/\d+/g);
            if (matches) matches.forEach((id: string) => dlcIds.add(id));
        }

        // 从 depots 中提取 DLC
        if (appData.depots && typeof appData.depots === 'object') {
            const dlcSection = appData.depots.dlc;
            if (dlcSection && typeof dlcSection === 'object') {
                Object.keys(dlcSection).forEach(id => dlcIds.add(id));
            }
        }

        // 从 dlc 字典提取
        if (appData.dlc && typeof appData.dlc === 'object') {
            Object.keys(appData.dlc).forEach(id => dlcIds.add(id));
        }

        const result = Array.from(dlcIds).sort((a, b) => parseInt(a) - parseInt(b));
        pluginState.logDebug(`AppID ${appId} 共有 ${result.length} 个 DLC`);
        return result;

    } catch (error) {
        pluginState.log('warn', `获取 DLC 列表失败: ${appId}`, error);
        return [];
    }
}

// ==================== Lua 脚本生成 ====================

/**
 * 生成 SteamTools Lua 脚本
 * 参考 ManifestHub-GUI 的 GenerateLua 和帖子中的 Lua 格式
 *
 * 格式:
 *   addappid(AppID, 1)                          -- 游戏本体/普通DLC（不需要key）
 *   addappid(DepotID, 1, "decryptionKey")       -- 仓库（需要key）
 *   setManifestid(DepotID, "manifestID")        -- 固定清单（可选）
 */
export function generateManifestHubLua(
    appId: string,
    depotKeys: DepotKey[],
    manifests: ManifestMap,
    dlcIds?: string[],
    setManifestId: boolean = true,
): string {
    const lines: string[] = [];
    const addedIds = new Set<string>();

    // 1. 添加主游戏 AppID
    const mainKey = depotKeys.find(k => k.depotId === appId);
    if (mainKey) {
        lines.push(`addappid(${appId}, 1, "${mainKey.decryptionKey}")`);
    } else {
        lines.push(`addappid(${appId}, 1)`);
    }
    addedIds.add(appId);

    // 2. 添加所有 Depot（带密钥）
    const depotIds = Object.keys(manifests).sort((a, b) => parseInt(a) - parseInt(b));
    for (const depotId of depotIds) {
        if (addedIds.has(depotId)) continue;

        const key = depotKeys.find(k => k.depotId === depotId);
        if (key) {
            lines.push(`addappid(${depotId}, 1, "${key.decryptionKey}")`);
        } else {
            lines.push(`addappid(${depotId}, 1)`);
        }
        addedIds.add(depotId);
    }

    // 3. 添加无仓库的 DLC（只需解锁 ID）
    if (dlcIds && dlcIds.length > 0) {
        for (const dlcId of dlcIds) {
            if (!addedIds.has(dlcId)) {
                lines.push(`addappid(${dlcId}, 1)`);
                addedIds.add(dlcId);
            }
        }
    }

    // 4. 可选：设置固定清单 ID
    if (setManifestId) {
        for (const depotId of depotIds) {
            const manifestId = manifests[depotId];
            if (manifestId) {
                lines.push(`setManifestid(${depotId}, "${manifestId}")`);
            }
        }
    }

    return lines.join('\n');
}

// ==================== 主入口函数 ====================

/**
 * 通过 ManifestHub 方式获取游戏的密钥和清单信息
 * 并行获取 DepotKeys 和 Manifests，然后合并
 *
 * @param appId Steam AppID
 * @returns ManifestHubResult
 */
export async function fetchFromManifestHub(appId: string): Promise<ManifestHubResult> {
    const result: ManifestHubResult = {
        success: false,
        appId,
        depotKeys: [],
        manifests: {},
    };

    const config = pluginState.config.manifestHub;
    if (!config?.enabled) {
        result.error = 'ManifestHub 数据源未启用';
        return result;
    }

    try {
        // 并行获取 DepotKeys 和 Manifests
        pluginState.log('info', `[ManifestHub] 开始获取 AppID ${appId} 的数据...`);

        const [allDepotKeys, manifests] = await Promise.all([
            getDepotKeys(),
            getManifests(appId),
        ]);

        result.manifests = manifests;
        result.keySource = config.depotKeySource;

        // 收集当前游戏所需的所有 DepotKey
        const requiredIds = new Set<string>([appId]);
        for (const depotId of Object.keys(manifests)) {
            requiredIds.add(depotId);
        }

        // 从全量密钥表中筛选出需要的密钥
        for (const id of requiredIds) {
            if (allDepotKeys[id]) {
                result.depotKeys.push({
                    depotId: id,
                    decryptionKey: allDepotKeys[id],
                });
            }
        }

        // 检查是否有缺失的密钥，尝试强制刷新
        const missingKeys = Array.from(requiredIds).filter(id => !allDepotKeys[id]);
        if (missingKeys.length > 0) {
            pluginState.log('info', `[ManifestHub] 发现 ${missingKeys.length} 个缺失的 DepotKey，尝试刷新...`);
            try {
                const refreshedKeys = await getDepotKeys(true);
                for (const id of missingKeys) {
                    if (refreshedKeys[id]) {
                        result.depotKeys.push({
                            depotId: id,
                            decryptionKey: refreshedKeys[id],
                        });
                    }
                }
            } catch (refreshError) {
                pluginState.log('warn', `[ManifestHub] 刷新 DepotKeys 失败: ${refreshError}`);
            }
        }

        // 获取 DLC 列表（可选）
        if (config.includeDLC) {
            try {
                const dlcIds = await getDLCList(appId);
                result.dlcIds = dlcIds;
            } catch (dlcError) {
                pluginState.log('warn', `[ManifestHub] 获取 DLC 列表失败: ${dlcError}`);
            }
        }

        const depotCount = Object.keys(manifests).length;
        const keyCount = result.depotKeys.length;
        const dlcCount = result.dlcIds?.length ?? 0;

        pluginState.log('info', `[ManifestHub] 获取完成: ${depotCount} 个 Depot, ${keyCount} 个密钥, ${dlcCount} 个 DLC`);

        result.success = depotCount > 0 || keyCount > 0;
        if (!result.success) {
            result.error = `AppID ${appId} 未找到有效的 Depot 或密钥数据`;
        }

    } catch (error) {
        result.error = `ManifestHub 获取失败: ${error}`;
        pluginState.log('error', `[ManifestHub] 获取 AppID ${appId} 失败:`, error);
    }

    return result;
}

/**
 * 清除 DepotKeys 缓存
 */
export function clearDepotKeysCache(): void {
    depotKeysCache = null;
    depotKeysCacheTime = 0;
    try {
        const cachePath = getCachePath();
        if (fs.existsSync(cachePath)) {
            fs.unlinkSync(cachePath);
        }
    } catch (error) {
        pluginState.log('warn', `清除缓存失败: ${error}`);
    }
    pluginState.log('info', '[ManifestHub] DepotKeys 缓存已清除');
}

/**
 * 插件启动时后台预加载 DepotKeys
 * 不阻塞插件初始化，在后台静默完成
 */
export function preloadDepotKeys(): void {
    if (!pluginState.config.manifestHub?.enabled) {
        pluginState.logDebug('[ManifestHub] 未启用，跳过预加载');
        return;
    }

    pluginState.log('info', '[ManifestHub] 后台预加载 DepotKeys...');
    const startTime = Date.now();

    // 不 await，让它在后台运行
    getDepotKeys().then((keys) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        pluginState.log('info', `[ManifestHub] 预加载完成: ${Object.keys(keys).length} 个 DepotKeys, 耗时 ${elapsed}s`);
    }).catch((error) => {
        pluginState.log('warn', `[ManifestHub] 预加载失败 (不影响后续使用): ${error}`);
    });
}
