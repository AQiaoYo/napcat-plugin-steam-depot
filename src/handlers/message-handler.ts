/**
 * 消息处理器
 * 处理 Steam Depot 下载命令
 */

import fs from 'fs';
import path from 'path';
import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import { pluginState } from '../core/state';
import { downloadSteamDepot, cleanupTempDir, getFileSizeString } from '../services/steam-depot-service';
import { fetchFromManifestHub, clearDepotKeysCache, getDepotKeys } from '../services/manifesthub-service';

/**
 * 发送群消息
 * @param ctx 插件上下文
 * @param groupId 群号
 * @param message 消息内容
 */
export async function sendGroupMessage(ctx: NapCatPluginContext, groupId: number | string, message: any[]): Promise<boolean> {
    try {
        await ctx.actions.call(
            'send_group_msg',
            {
                group_id: groupId,
                message: message
            },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        return true;
    } catch (error) {
        pluginState.log('error', `发送群消息失败:`, error);
        return false;
    }
}

/**
 * 发送私聊消息
 * @param ctx 插件上下文
 * @param userId 用户 QQ 号
 * @param message 消息内容
 */
export async function sendPrivateMessage(ctx: NapCatPluginContext, userId: number | string, message: any[]): Promise<boolean> {
    try {
        await ctx.actions.call(
            'send_private_msg',
            {
                user_id: userId,
                message: message
            },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        return true;
    } catch (error) {
        pluginState.log('error', `发送私聊消息失败:`, error);
        return false;
    }
}

/**
 * 上传群文件
 * @param ctx 插件上下文
 * @param groupId 群号
 * @param filePath 文件路径
 * @param fileName 文件名
 */
async function uploadGroupFile(ctx: NapCatPluginContext, groupId: number | string, filePath: string, fileName: string): Promise<boolean> {
    try {
        await ctx.actions.call(
            'upload_group_file',
            {
                group_id: groupId,
                file: filePath,
                name: fileName
            },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        pluginState.log('info', `群文件上传成功: ${fileName}`);
        return true;
    } catch (error) {
        pluginState.log('error', `上传群文件失败:`, error);
        return false;
    }
}

/**
 * 构建文本消息段
 */
export function textSegment(text: string) {
    return { type: 'text', data: { text } };
}

/**
 * 构建图片消息段
 * @param file 图片路径或 URL 或 base64
 */
export function imageSegment(file: string) {
    return { type: 'image', data: { file } };
}

/**
 * 构建 @ 消息段
 * @param qq QQ 号，'all' 表示 @全体成员
 */
export function atSegment(qq: string | number) {
    return { type: 'at', data: { qq: String(qq) } };
}

/**
 * 构建回复消息段
 * @param messageId 要回复的消息 ID
 */
export function replySegment(messageId: string | number) {
    return { type: 'reply', data: { id: String(messageId) } };
}

/**
 * 解析命令和参数
 * @param rawMessage 原始消息
 * @param prefix 命令前缀
 * @returns [命令, 参数数组] 或 null
 */
function parseCommand(rawMessage: string, prefix: string): [string, string[]] | null {
    const trimmed = rawMessage.trim();
    if (!trimmed.startsWith(prefix)) {
        return null;
    }

    const parts = trimmed.slice(prefix.length).trim().split(/\s+/);
    const command = parts[0]?.toLowerCase() || '';
    const args = parts.slice(1);

    return [command, args];
}

/**
 * 处理 depot 下载命令
 */
async function handleDepotCommand(ctx: NapCatPluginContext, groupId: number, appId: string, messageId: number): Promise<void> {
    // 验证 AppID 格式
    if (!/^\d+$/.test(appId)) {
        await sendGroupMessage(ctx, groupId, [
            replySegment(messageId),
            textSegment(`❌ 无效的 AppID: ${appId}\n请输入纯数字的 Steam AppID`)
        ]);
        return;
    }

    // 发送开始下载提示
    await sendGroupMessage(ctx, groupId, [
        replySegment(messageId),
        textSegment(`🔍 正在查找 AppID: ${appId} ...\n请稍候，这可能需要一点时间`)
    ]);

    try {
        // 调用下载服务
        const result = await downloadSteamDepot(appId);

        if (result.success && result.zipPath) {
            // 构建成功消息
            const gameName = result.gameName || `AppID ${appId}`;
            const fileSize = getFileSizeString(result.zipPath);
            const fileName = `${gameName.replace(/[<>:"/\\|?*]/g, '_')} - ${appId}.zip`;

            let infoText = `✅ 下载成功!\n`;
            infoText += `🎮 游戏: ${gameName}\n`;
            infoText += `📦 AppID: ${appId}\n`;
            infoText += `📁 文件大小: ${fileSize}\n`;
            infoText += `📂 来源: ${result.sourceRepo || '未知'}\n`;

            if (result.depotKeys.length > 0) {
                infoText += `🔑 密钥数量: ${result.depotKeys.length}\n`;
            }
            if (result.manifests.length > 0) {
                infoText += `📋 Manifest: ${result.manifests.length} 个\n`;
            }

            infoText += `\n正在上传文件...`;

            await sendGroupMessage(ctx, groupId, [textSegment(infoText)]);

            // 上传文件
            const uploaded = await uploadGroupFile(ctx, groupId, result.zipPath, fileName);

            if (uploaded) {
                await sendGroupMessage(ctx, groupId, [
                    textSegment(`📤 文件已上传: ${fileName}`)
                ]);
                pluginState.incrementProcessedCount();
            } else {
                await sendGroupMessage(ctx, groupId, [
                    textSegment(`⚠️ 文件上传失败，请稍后重试`)
                ]);
            }

            // 清理临时文件
            const tempDir = path.dirname(result.zipPath);
            setTimeout(() => {
                cleanupTempDir(tempDir);
            }, 5000);

        } else {
            // 下载失败
            await sendGroupMessage(ctx, groupId, [
                replySegment(messageId),
                textSegment(`❌ 下载失败\n${result.error || '未能在仓库中找到该游戏'}`)
            ]);
        }

    } catch (error) {
        pluginState.log('error', `处理下载命令失败:`, error);
        await sendGroupMessage(ctx, groupId, [
            replySegment(messageId),
            textSegment(`❌ 处理请求时发生错误，请稍后重试`)
        ]);
    }
}

/**
 * 处理 info 命令 - 查询游戏的密钥和清单信息（不下载，仅展示）
 */
async function handleInfoCommand(ctx: NapCatPluginContext, groupId: number, appId: string, messageId: number): Promise<void> {
    // 验证 AppID 格式
    if (!/^\d+$/.test(appId)) {
        await sendGroupMessage(ctx, groupId, [
            replySegment(messageId),
            textSegment(`❌ 无效的 AppID: ${appId}\n请输入纯数字的 Steam AppID`)
        ]);
        return;
    }

    await sendGroupMessage(ctx, groupId, [
        replySegment(messageId),
        textSegment(`🔍 正在查询 AppID: ${appId} 的密钥和清单信息...\n请稍候`)
    ]);

    try {
        const hubResult = await fetchFromManifestHub(appId);

        if (!hubResult.success) {
            await sendGroupMessage(ctx, groupId, [
                replySegment(messageId),
                textSegment(`❌ 查询失败: ${hubResult.error || '未知错误'}`)
            ]);
            return;
        }

        let infoText = `📊 AppID ${appId} 信息\n`;
        if (hubResult.gameName) {
            infoText += `🎮 游戏: ${hubResult.gameName}\n`;
        }
        infoText += `📦 数据源: ManifestHub (${hubResult.keySource || 'SAC'})\n`;
        infoText += `\n`;

        // 密钥信息
        infoText += `🔑 Depot 密钥: ${hubResult.depotKeys.length} 个\n`;
        for (const key of hubResult.depotKeys.slice(0, 10)) {
            infoText += `  ${key.depotId} → ${key.decryptionKey.substring(0, 16)}...\n`;
        }
        if (hubResult.depotKeys.length > 10) {
            infoText += `  ... 还有 ${hubResult.depotKeys.length - 10} 个\n`;
        }

        // 清单信息
        const manifestEntries = Object.entries(hubResult.manifests);
        infoText += `\n📋 Manifest: ${manifestEntries.length} 个\n`;
        for (const [depotId, manifestId] of manifestEntries.slice(0, 10)) {
            infoText += `  ${depotId} → ${manifestId}\n`;
        }
        if (manifestEntries.length > 10) {
            infoText += `  ... 还有 ${manifestEntries.length - 10} 个\n`;
        }

        // DLC 信息
        if (hubResult.dlcIds && hubResult.dlcIds.length > 0) {
            infoText += `\n🎁 DLC: ${hubResult.dlcIds.length} 个\n`;
            const displayDlcs = hubResult.dlcIds.slice(0, 15);
            infoText += `  ${displayDlcs.join(', ')}`;
            if (hubResult.dlcIds.length > 15) {
                infoText += ` ... 等`;
            }
            infoText += `\n`;
        }

        await sendGroupMessage(ctx, groupId, [textSegment(infoText)]);

    } catch (error) {
        pluginState.log('error', `查询 info 失败:`, error);
        await sendGroupMessage(ctx, groupId, [
            replySegment(messageId),
            textSegment(`❌ 查询时发生错误，请稍后重试`)
        ]);
    }
}

/**
 * 处理 cache 命令 - 管理 DepotKeys 缓存
 */
async function handleCacheCommand(ctx: NapCatPluginContext, groupId: number, action: string, messageId: number): Promise<void> {
    if (action === 'clear' || action === '清除') {
        clearDepotKeysCache();
        await sendGroupMessage(ctx, groupId, [
            replySegment(messageId),
            textSegment(`✅ DepotKeys 缓存已清除`)
        ]);
    } else if (action === 'refresh' || action === '刷新') {
        await sendGroupMessage(ctx, groupId, [
            replySegment(messageId),
            textSegment(`🔄 正在刷新 DepotKeys 缓存...`)
        ]);
        try {
            const keys = await getDepotKeys(true);
            await sendGroupMessage(ctx, groupId, [
                textSegment(`✅ DepotKeys 缓存已刷新，共 ${Object.keys(keys).length} 个密钥`)
            ]);
        } catch (error) {
            await sendGroupMessage(ctx, groupId, [
                textSegment(`❌ 刷新失败: ${error}`)
            ]);
        }
    } else {
        await sendGroupMessage(ctx, groupId, [
            replySegment(messageId),
            textSegment(`📦 缓存管理命令:\n${pluginState.config.commandPrefix} cache clear - 清除缓存\n${pluginState.config.commandPrefix} cache refresh - 刷新缓存`)
        ]);
    }
}

/**
 * 处理帮助命令
 */
async function handleHelpCommand(ctx: NapCatPluginContext, groupId: number, prefix: string): Promise<void> {
    const helpText = `🎮 Steam Depot 下载器 帮助

📌 使用方法:
${prefix} <AppID> - 下载指定 AppID 的游戏数据
${prefix} info <AppID> - 查询密钥和清单信息（不下载）
${prefix} cache clear - 清除 DepotKeys 缓存
${prefix} cache refresh - 刷新 DepotKeys 缓存

📝 示例:
${prefix} 730 - 下载 CS:GO
${prefix} info 1245620 - 查询 Elden Ring 的信息

💡 提示:
- AppID 可在 Steam 商店页面 URL 中找到
- 例如: store.steampowered.com/app/730/
- 下载包含 Lua 脚本、密钥和清单信息
- 数据来源: ManifestHub + GitHub 仓库`;

    await sendGroupMessage(ctx, groupId, [textSegment(helpText)]);
}

/**
 * 消息处理主函数
 */
export async function handleMessage(ctx: NapCatPluginContext, event: OB11Message): Promise<void> {
    try {
        // 获取消息内容
        const rawMessage = event.raw_message || '';
        const messageType = event.message_type; // 'group' | 'private'
        const groupId = (event as any).group_id;
        const userId = event.user_id;
        const messageId = event.message_id;

        pluginState.logDebug(`收到消息: ${rawMessage} | 类型: ${messageType}`);

        // 仅处理群消息
        if (messageType !== 'group' || !groupId) {
            return;
        }

        // 检查该群是否启用
        if (!pluginState.isGroupEnabled(String(groupId))) {
            pluginState.logDebug(`群 ${groupId} 未启用，跳过处理`);
            return;
        }

        // 解析命令
        const prefix = pluginState.config.commandPrefix || '#depot';
        const parsed = parseCommand(rawMessage, prefix);

        if (!parsed) {
            return; // 不是本插件的命令
        }

        const [command, args] = parsed;

        // 处理不同命令
        if (command === 'help' || command === '帮助') {
            await handleHelpCommand(ctx, groupId, prefix);
        } else if (command === 'info' && args.length > 0 && /^\d+$/.test(args[0])) {
            // info 命令：查询密钥和清单信息
            await handleInfoCommand(ctx, groupId, args[0], messageId);
        } else if (command === 'cache') {
            // cache 命令：管理缓存
            await handleCacheCommand(ctx, groupId, args[0] || '', messageId);
        } else if (command === '' && args.length === 0) {
            // 只输入了前缀，显示帮助
            await handleHelpCommand(ctx, groupId, prefix);
        } else if (/^\d+$/.test(command)) {
            // 直接输入的 AppID
            await handleDepotCommand(ctx, groupId, command, messageId);
        } else if (args.length > 0 && /^\d+$/.test(args[0])) {
            // 命令后跟 AppID
            await handleDepotCommand(ctx, groupId, args[0], messageId);
        } else {
            // 无法识别的格式
            await sendGroupMessage(ctx, groupId, [
                replySegment(messageId),
                textSegment(`❓ 无法识别的命令格式\n请输入 ${prefix} help 查看帮助`)
            ]);
        }

    } catch (error) {
        pluginState.log('error', '处理消息时出错:', error);
    }
}
