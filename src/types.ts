/**
 * 类型定义文件
 * 定义插件所需的所有接口和类型
 */

/**
 * 插件主配置接口
 * 根据你的插件需求添加配置项
 */
export interface PluginConfig {
    /** 全局开关：是否启用插件功能 */
    enabled: boolean;
    /** 调试模式：启用后输出详细日志 */
    debug: boolean;
    /** 按群的单独配置 */
    groupConfigs?: Record<string, GroupConfig>;
    // TODO: 在这里添加你的插件配置项
}

/**
 * 群配置
 */
export interface GroupConfig {
    /** 是否启用此群的功能 */
    enabled?: boolean;
    // TODO: 在这里添加群级别的配置项
}

/**
 * API 响应格式
 */
export interface ApiResponse<T = any> {
    code: number;
    message?: string;
    data?: T;
}
