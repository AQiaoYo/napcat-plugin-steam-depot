/**
 * 类型定义文件
 * 定义 Steam Depot 插件所需的所有接口和类型
 */

/**
 * 仓库类型枚举
 * - Encrypted: 加密仓库，需要从 key.vdf 提取解密密钥
 * - Decrypted: 解密仓库，直接下载
 * - Branch: 分支仓库，直接下载整个分支的 zip
 */
export type RepoType = 'Encrypted' | 'Decrypted' | 'Branch';

/**
 * GitHub 仓库配置
 */
export interface RepoConfig {
    /** 仓库全名，格式：owner/repo */
    name: string;
    /** 仓库类型 */
    type: RepoType;
    /** 是否启用此仓库 */
    enabled: boolean;
}

/**
 * 插件主配置接口
 */
export interface PluginConfig {
    /** 全局开关：是否启用插件功能 */
    enabled: boolean;
    /** 调试模式：启用后输出详细日志 */
    debug: boolean;
    /** 触发命令前缀，默认为 #depot */
    commandPrefix: string;
    /** GitHub API Token（可选，用于提高 API 速率限制） */
    githubToken?: string;
    /** 是否使用 GitHub Token */
    useGithubToken: boolean;
    /** 配置的仓库列表 */
    repositories: RepoConfig[];
    /** 临时文件目录 */
    tempDir: string;
    /** 同一 AppID 请求冷却时间（秒），0 表示不限制，解析失败不计入 CD */
    cooldownSeconds: number;
    /** 按群的单独配置 */
    groupConfigs?: Record<string, GroupConfig>;
    /** ManifestHub 数据源配置 */
    manifestHub: ManifestHubConfig;
}

/**
 * 群配置
 */
export interface GroupConfig {
    /** 是否启用此群的功能 */
    enabled?: boolean;
}

/**
 * Depot 解密密钥信息
 */
export interface DepotKey {
    /** Depot ID */
    depotId: string;
    /** 解密密钥 */
    decryptionKey: string;
}

/**
 * 下载结果
 */
export interface DownloadResult {
    /** 是否成功 */
    success: boolean;
    /** 错误消息 */
    error?: string;
    /** 游戏名称 */
    gameName?: string;
    /** AppID */
    appId: string;
    /** 压缩包路径 */
    zipPath?: string;
    /** 收集到的 Depot 密钥 */
    depotKeys: DepotKey[];
    /** 下载的 manifest 文件列表 */
    manifests: string[];
    /** 来源仓库 */
    sourceRepo?: string;
    /** 是否为 Branch 类型下载 */
    isBranch: boolean;
}

/**
 * Steam 游戏信息（来自 Steam API）
 */
export interface SteamAppInfo {
    /** 游戏名称 */
    name: string;
    /** AppID */
    appid: number;
    /** 游戏类型 */
    type?: string;
    /** 封面图片 URL */
    headerImage?: string;
    /** 简介 */
    shortDescription?: string;
}

/**
 * GitHub API 文件树项
 */
export interface GitHubTreeItem {
    path: string;
    type: 'blob' | 'tree';
    sha: string;
    size?: number;
}

/**
 * GitHub 分支信息
 */
export interface GitHubBranchInfo {
    name: string;
    commit: {
        sha: string;
        url: string;
    };
}

/**
 * API 响应格式
 */
export interface ApiResponse<T = any> {
    code: number;
    message?: string;
    data?: T;
}

// ==================== ManifestHub 相关类型 ====================

/**
 * DepotKey 数据源类型
 * - SAC: SteamAutoCracks/ManifestHub GitHub 仓库
 * - Sudama: 第三方 API (api.993499094.xyz)
 */
export type DepotKeySource = 'SAC' | 'Sudama';

/**
 * DepotKeys 映射表
 * key: depotId, value: decryptionKey (hex string)
 */
export type DepotKeysMap = Record<string, string>;

/**
 * Manifest 映射表
 * key: depotId, value: manifestId
 */
export type ManifestMap = Record<string, string>;

/**
 * Steam Depot 详细信息（来自 steam.ddxnb.cn API）
 */
export interface SteamDepotDetail {
    /** Depot ID */
    depotId: string;
    /** Manifest ID (public 分支) */
    manifestId: string;
}

/**
 * ManifestHub 查询结果
 */
export interface ManifestHubResult {
    /** 是否成功 */
    success: boolean;
    /** 错误消息 */
    error?: string;
    /** 游戏 AppID */
    appId: string;
    /** 游戏名称 */
    gameName?: string;
    /** Depot 密钥列表 */
    depotKeys: DepotKey[];
    /** Depot → ManifestID 映射 */
    manifests: ManifestMap;
    /** DLC ID 列表 */
    dlcIds?: string[];
    /** 密钥来源 */
    keySource?: DepotKeySource;
}

/**
 * ManifestHub 配置
 */
export interface ManifestHubConfig {
    /** 是否启用 ManifestHub 数据源 */
    enabled: boolean;
    /** DepotKey 数据源选择 */
    depotKeySource: DepotKeySource;
    /** 是否包含 DLC */
    includeDLC: boolean;
    /** 是否在 Lua 中设置固定 ManifestID */
    setManifestId: boolean;
    /** DepotKeys 缓存过期时间（小时），0 表示不缓存 */
    cacheExpireHours: number;
}
