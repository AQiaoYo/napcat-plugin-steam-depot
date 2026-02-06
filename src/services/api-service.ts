/**
 * API 服务模块
 * 注册 WebUI API 路由
 */

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import { pluginState } from '../core/state';

/** API 路由前缀 - 修改为你的插件名称 */
export const ROUTE_PREFIX = '/plugin';

/**
 * 解析请求体
 * 处理 Express 可能没有解析 body 的情况
 */
async function parseBody(req: any): Promise<any> {
    if (req.body && Object.keys(req.body).length > 0) {
        return req.body;
    }
    try {
        const raw = await new Promise<string>((resolve) => {
            let data = '';
            req.on('data', (chunk: any) => data += chunk);
            req.on('end', () => resolve(data));
        });
        if (raw) return JSON.parse(raw);
    } catch (e) {
        pluginState.log('error', '解析请求体失败:', e);
    }
    return {};
}

/**
 * 注册 API 路由
 * @param ctx 插件上下文
 */
export function registerApiRoutes(ctx: NapCatPluginContext): void {
    const router = (ctx as any).router;
    if (!router) {
        pluginState.log('warn', 'router 不可用，跳过 API 路由注册');
        return;
    }

    // ==================== 基础接口（无认证，供 WebUI 页面调用）====================

    // 插件信息
    router.getNoAuth('/info', (_req: any, res: any) => {
        res.json({
            code: 0,
            data: { pluginName: ctx.pluginName }
        });
    });

    // 状态接口
    router.getNoAuth('/status', (_req: any, res: any) => {
        res.json({
            code: 0,
            data: {
                pluginName: pluginState.pluginName,
                uptime: pluginState.getUptime(),
                uptimeFormatted: pluginState.getUptimeFormatted(),
                config: pluginState.getConfig(),
                stats: pluginState.stats
            }
        });
    });

    // ==================== 配置接口（无认证）====================

    // 获取配置
    router.getNoAuth('/config', (_req: any, res: any) => {
        res.json({ code: 0, data: pluginState.getConfig() });
    });

    // 保存配置
    router.postNoAuth('/config', async (req: any, res: any) => {
        try {
            const body = await parseBody(req);
            pluginState.setConfig(ctx, body);
            pluginState.log('info', '配置已保存');
            res.json({ code: 0, message: 'ok' });
        } catch (err) {
            pluginState.log('error', '保存配置失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // ==================== 群管理接口（无认证）====================

    // 获取群列表
    router.getNoAuth('/groups', async (_req: any, res: any) => {
        try {
            const groups: any[] = await ctx.actions.call(
                'get_group_list',
                {},
                ctx.adapterName,
                ctx.pluginManager.config
            );
            const config = pluginState.getConfig();

            // 为每个群添加配置信息
            const groupsWithConfig = (groups || []).map((group: any) => {
                const groupId = String(group.group_id);
                const groupConfig = config.groupConfigs?.[groupId] || {};
                return {
                    ...group,
                    enabled: groupConfig.enabled !== false
                };
            });

            res.json({ code: 0, data: groupsWithConfig });
        } catch (e) {
            pluginState.log('error', '获取群列表失败:', e);
            res.status(500).json({ code: -1, message: String(e) });
        }
    });

    // 更新群配置
    router.postNoAuth('/groups/:id/config', async (req: any, res: any) => {
        try {
            const groupId = String(req.params?.id || '');
            if (!groupId) {
                return res.status(400).json({ code: -1, message: '缺少群 ID' });
            }

            const body = await parseBody(req);
            const { enabled } = body;

            pluginState.updateGroupConfig(ctx, groupId, { enabled: Boolean(enabled) });
            pluginState.log('info', `群 ${groupId} 配置已更新: enabled=${enabled}`);
            res.json({ code: 0, message: 'ok' });
        } catch (err) {
            pluginState.log('error', '更新群配置失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // 批量更新群配置
    router.postNoAuth('/groups/bulk-config', async (req: any, res: any) => {
        try {
            const body = await parseBody(req);
            const { enabled, groupIds } = body;

            if (typeof enabled !== 'boolean' || !Array.isArray(groupIds)) {
                return res.status(400).json({ code: -1, message: '参数错误' });
            }

            const currentGroupConfigs = { ...(pluginState.config.groupConfigs || {}) };
            for (const groupId of groupIds) {
                const gid = String(groupId);
                currentGroupConfigs[gid] = { ...currentGroupConfigs[gid], enabled };
            }

            pluginState.setConfig(ctx, { groupConfigs: currentGroupConfigs });
            pluginState.log('info', `批量更新群配置完成 | 数量: ${groupIds.length}, enabled=${enabled}`);
            res.json({ code: 0, message: 'ok' });
        } catch (err) {
            pluginState.log('error', '批量更新群配置失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // ==================== 缓存管理接口（无认证）====================

    // 获取缓存状态
    router.getNoAuth('/cache/status', async (_req: any, res: any) => {
        try {
            const { getDepotKeysCacheInfo } = await import('./manifesthub-service');
            const info = getDepotKeysCacheInfo();
            res.json({ code: 0, data: info });
        } catch (err) {
            pluginState.log('error', '获取缓存状态失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // 清除缓存
    router.postNoAuth('/cache/clear', async (_req: any, res: any) => {
        try {
            const { clearDepotKeysCache } = await import('./manifesthub-service');
            clearDepotKeysCache();
            pluginState.log('info', '[WebUI] DepotKeys 缓存已清除');
            res.json({ code: 0, message: '缓存已清除' });
        } catch (err) {
            pluginState.log('error', '清除缓存失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // 刷新缓存
    router.postNoAuth('/cache/refresh', async (_req: any, res: any) => {
        try {
            const { getDepotKeys } = await import('./manifesthub-service');
            const keys = await getDepotKeys(true);
            const count = Object.keys(keys).length;
            pluginState.log('info', `[WebUI] DepotKeys 缓存已刷新，共 ${count} 个密钥`);
            res.json({ code: 0, data: { count }, message: `缓存已刷新，共 ${count} 个密钥` });
        } catch (err) {
            pluginState.log('error', '刷新缓存失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    pluginState.logDebug('API 路由注册完成');
}
