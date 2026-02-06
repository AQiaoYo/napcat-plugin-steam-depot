/**
 * NapCat 插件模板
 * 
 * 这是一个通用的 NapCat 插件开发模板，包含：
 * - 插件生命周期管理
 * - 配置管理（持久化、WebUI 配置界面）
 * - 消息处理框架
 * - WebUI API 路由注册
 * - 群级别配置管理
 * 
 * @author Your Name
 * @license MIT
 */

// @ts-ignore - NapCat 类型定义
import type { PluginConfigSchema, PluginConfigUIController } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
// @ts-ignore - NapCat 消息类型
import type { OB11Message } from 'napcat-types/napcat-onebot';
// @ts-ignore - NapCat 事件类型
import { EventType } from 'napcat-types/napcat-onebot/event/index';

import { initConfigUI } from './config';
import { pluginState } from './core/state';
import { handleMessage } from './handlers/message-handler';
import { registerApiRoutes } from './services/api-service';

/** 框架配置 UI Schema，NapCat WebUI 会读取此导出来展示配置面板 */
export let plugin_config_ui: PluginConfigSchema = [];

/**
 * 插件初始化函数
 * 负责加载配置、注册 WebUI 路由
 */
const plugin_init = async (ctx: NapCatPluginContext) => {
    try {
        // 初始化状态和加载配置
        pluginState.initFromContext(ctx);
        pluginState.loadConfig(ctx);
        pluginState.log('info', `初始化完成 | name=${ctx.pluginName}`);

        // 生成配置 schema 并导出（用于 NapCat WebUI 配置面板）
        try {
            const schema = initConfigUI(ctx);
            plugin_config_ui = schema || [];
        } catch (e) {
            pluginState.logDebug('initConfigUI 未实现或抛出错误，已跳过');
        }

        // 注册 WebUI 路由
        try {
            const base = (ctx as any).router;

            // 插件信息脚本（必须在静态目录之前注册）
            if (base && base.get) {
                base.get('/static/plugin-info.js', (_req: any, res: any) => {
                    try {
                        res.type('application/javascript');
                        res.send(`window.__PLUGIN_NAME__ = ${JSON.stringify(ctx.pluginName)};`);
                    } catch (e) {
                        res.status(500).send('// failed to generate plugin-info');
                    }
                });
            }

            // 静态资源目录
            if (base && base.static) {
                base.static('/static', 'webui');
            }

            // 注册 API 路由
            registerApiRoutes(ctx);

            // 注册仪表盘页面（可选）
            if (base && base.page) {
                base.page({
                    path: 'plugin-dashboard',
                    title: '插件仪表盘',
                    icon: '🔌',
                    htmlFile: 'webui/dashboard.html',
                    description: '插件管理控制台'
                });
            }
        } catch (e) {
            pluginState.log('warn', '注册 WebUI 路由失败', e);
        }

        pluginState.log('info', '插件初始化完成');
    } catch (error) {
        pluginState.log('error', '插件初始化失败:', error);
    }
};

/**
 * 消息处理函数
 * 当收到消息时触发
 */
const plugin_onmessage = async (ctx: NapCatPluginContext, event: OB11Message) => {
    // 检查插件是否启用
    if (!pluginState.config.enabled) return;
    // 只处理消息事件
    if (event.post_type !== EventType.MESSAGE || !event.raw_message) return;
    // 调用消息处理器
    await handleMessage(ctx, event);
};

/**
 * 插件卸载函数
 * 在插件被卸载时调用，用于清理资源
 */
const plugin_cleanup = async (ctx: NapCatPluginContext) => {
    try {
        // TODO: 在这里添加你的清理逻辑
        pluginState.log('info', '插件已卸载');
    } catch (e) {
        pluginState.log('warn', '插件卸载时出错:', e);
    }
};

/** 获取当前配置 */
export const plugin_get_config = async (ctx: NapCatPluginContext) => {
    return pluginState.getConfig();
};

/** 设置配置（完整替换） */
export const plugin_set_config = async (ctx: NapCatPluginContext, config: any) => {
    pluginState.logDebug(`plugin_set_config 调用: ${JSON.stringify(config)}`);
    pluginState.replaceConfig(ctx, config);
    pluginState.log('info', '配置已通过 API 更新');
};

/**
 * 配置变更回调
 * 当 WebUI 中修改配置时触发
 */
export const plugin_on_config_change = async (
    ctx: NapCatPluginContext,
    ui: PluginConfigUIController,
    key: string,
    value: any,
    currentConfig?: Record<string, any>
) => {
    try {
        pluginState.logDebug(`plugin_on_config_change: key=${key}, value=${JSON.stringify(value)}`);
        pluginState.setConfig(ctx, { [key]: value });
        pluginState.logDebug(`配置项 ${key} 已更新`);
    } catch (err) {
        pluginState.log('error', `更新配置项 ${key} 失败:`, err);
    }
};

// 导出生命周期函数
export {
    plugin_init,
    plugin_onmessage,
    plugin_cleanup
};
