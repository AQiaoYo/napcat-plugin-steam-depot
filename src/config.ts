/**
 * 插件配置模块
 * 定义默认配置和 WebUI 配置 Schema
 */

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { PluginConfig, RepoConfig, ManifestHubConfig } from './types';

/** 默认仓库列表 */
const DEFAULT_REPOSITORIES: RepoConfig[] = [
    { name: 'AQiaoYo/ManifestHub', type: 'Branch', enabled: true },
    { name: 'Auiowu/ManifestAutoUpdate', type: 'Decrypted', enabled: false },
    { name: 'ikun0014/ManifestHub', type: 'Decrypted', enabled: false },
    { name: 'tymolu233/ManifestAutoUpdate', type: 'Decrypted', enabled: false },
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
    groupConfigs: {},
    manifestHub: {
        enabled: true,
        depotKeySource: 'SAC',
        includeDLC: true,
        setManifestId: true,
        cacheExpireHours: 24,
    },
};

/**
 * 初始化 WebUI 配置 Schema
 * 使用 NapCat 提供的构建器生成配置界面
 */
export function initConfigUI(ctx: NapCatPluginContext) {
    const schema = ctx.NapCatConfig.combine(
        // 插件信息头部
        ctx.NapCatConfig.html(`
            <div style="padding: 16px; background: linear-gradient(135deg, #1b2838 0%, #2a475e 100%); border-radius: 12px; margin-bottom: 20px; color: white;">
                <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: bold;">🎮 Steam Depot 下载器</h3>
                <p style="margin: 0; font-size: 14px; opacity: 0.9;">从 GitHub 仓库获取 Steam 游戏的 manifest 和解密密钥，打包发送到群里。</p>
            </div>
        `),
        // 全局开关
        ctx.NapCatConfig.switch('enabled', '启用插件', '是否启用 Steam Depot 下载功能'),
        // 调试模式
        ctx.NapCatConfig.switch('debug', '调试模式', '启用后将输出详细的调试日志'),
        // 命令前缀
        ctx.NapCatConfig.input('commandPrefix', '命令前缀', '触发下载命令的前缀，默认为 #depot'),
        // GitHub Token 开关
        ctx.NapCatConfig.switch('useGithubToken', '使用 GitHub Token', '启用后将使用 GitHub Token 提高 API 速率限制'),
        // GitHub Token
        ctx.NapCatConfig.input('githubToken', 'GitHub Token', 'GitHub Personal Access Token，用于提高 API 请求限制')
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
    };
}
