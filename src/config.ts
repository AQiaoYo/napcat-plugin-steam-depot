/**
 * 插件配置模块
 * 定义默认配置和 WebUI 配置 Schema
 */

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { PluginConfig, RepoConfig, ManifestHubConfig, MultiSourceConfig, ManifestSourceConfig } from './types';

/** 默认仓库列表 */
const DEFAULT_REPOSITORIES: RepoConfig[] = [
    { name: 'AQiaoYo/ManifestHub', type: 'Branch', enabled: true },
    { name: 'Auiowu/ManifestAutoUpdate', type: 'Decrypted', enabled: false },
    { name: 'ikun0014/ManifestHub', type: 'Decrypted', enabled: false },
    { name: 'tymolu233/ManifestAutoUpdate', type: 'Decrypted', enabled: false },
];

/** 默认多清单源列表 */
const DEFAULT_MANIFEST_SOURCES: ManifestSourceConfig[] = [
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

/** 默认配置 */
export const DEFAULT_CONFIG: PluginConfig = {
    enabled: true,
    debug: false,
    commandPrefix: '#depot',
    githubToken: '',
    useGithubToken: false,
    repositories: DEFAULT_REPOSITORIES,
    tempDir: 'temp',
    cooldownSeconds: 300,
    groupConfigs: {},
    manifestHub: {
        enabled: true,
        depotKeySource: 'Both',
        includeDLC: true,
        setManifestId: true,
        cacheExpireHours: 24,
    },
    multiSource: {
        enabled: true,
        sources: DEFAULT_MANIFEST_SOURCES,
        autoFallback: true,
    },
};

/**
 * 初始化 WebUI 配置 Schema
 * 使用 NapCat 提供的构建器生成配置界面
 */
export function initConfigUI(ctx: NapCatPluginContext) {
    const schema = ctx.NapCatConfig.combine(
        ctx.NapCatConfig.html(`
            <div style="padding: 20px; background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                    <div style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: #1b2838; border-radius: 8px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#66c0f4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12h10V2z"/><path d="M2 12a10 10 0 0 0 10 10V12H2z"/></svg>
                    </div>
                    <div>
                        <div style="font-size: 16px; font-weight: 700; color: #111827;">Steam Depot 下载器</div>
                        <div style="font-size: 12px; color: #9ca3af; margin-top: 2px;">从 GitHub 仓库获取 Steam 游戏的 manifest 和解密密钥</div>
                    </div>
                </div>
                <div style="padding: 14px 16px; background: #f9fafb; border-radius: 8px; border: 1px solid #f3f4f6;">
                    <div style="font-size: 13px; color: #374151; line-height: 1.6;">
                        请前往 <strong>扩展页面</strong> 中的 <strong>Steam Depot</strong> 页面打开 WebUI 控制台进行详细配置，包括仪表盘、仓库管理、群管理等功能。
                    </div>
                </div>
            </div>
        `)
    );

    return schema;
}

/**
 * 获取默认配置的副本
 */
export function getDefaultConfig(): PluginConfig {
    return {
        ...DEFAULT_CONFIG,
        repositories: [...DEFAULT_REPOSITORIES.map(r => ({ ...r }))],
        groupConfigs: {},
        manifestHub: { ...DEFAULT_CONFIG.manifestHub },
        multiSource: {
            ...DEFAULT_CONFIG.multiSource,
            sources: [...DEFAULT_MANIFEST_SOURCES.map(s => ({ ...s }))]
        },
    };
}
