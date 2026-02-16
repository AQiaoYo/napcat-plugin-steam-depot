/** WebUI 前端类型定义 */

export interface PluginStatus {
    pluginName: string
    uptime: number
    uptimeFormatted: string
    config: PluginConfig
    stats: {
        processed: number
        todayProcessed: number
        lastUpdateDay: string
    }
}

export interface PluginConfig {
    enabled: boolean
    debug: boolean
    commandPrefix: string
    githubToken?: string
    useGithubToken: boolean
    repositories: RepoConfig[]
    tempDir: string
    cooldownSeconds: number
    groupConfigs?: Record<string, GroupConfig>
    manifestHub: ManifestHubConfig
}

export interface RepoConfig {
    name: string
    type: 'Encrypted' | 'Decrypted' | 'Branch'
    enabled: boolean
}

export interface GroupConfig {
    enabled?: boolean
}

export interface ManifestHubConfig {
    enabled: boolean
    depotKeySource: 'SAC' | 'Sudama' | 'Both'
    includeDLC: boolean
    setManifestId: boolean
    cacheExpireHours: number
}

export interface GroupInfo {
    group_id: number
    group_name: string
    member_count: number
    max_member_count: number
    enabled: boolean
}

export interface ApiResponse<T = unknown> {
    code: number
    data?: T
    message?: string
}
