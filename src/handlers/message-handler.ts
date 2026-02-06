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

// ==================== CD 冷却管理 ====================

/**
 * CD 冷却记录
 * key: `${groupId}:${appId}`, value: 过期时间戳
 */
const cooldownMap = new Map<string, number>();

/**
 * 检查是否在 CD 中
 * @param groupId 群号
 * @param appId AppID
 * @returns 剩余 CD 秒数，0 表示不在 CD 中
 */
function getCooldownRemaining(groupId: number | string, appId: string): number {
    const cdSeconds = pluginState.config.cooldownSeconds ?? 300;
    if (cdSeconds <= 0) return 0;

    const key = `${groupId}:${appId}`;
    const expireTime = cooldownMap.get(key);
    if (!expireTime) return 0;

    const remaining = Math.ceil((expireTime - Date.now()) / 1000);
    if (remaining <= 0) {
        cooldownMap.delete(key);
        return 0;
    }
    return remaining;
}

/**
 * 设置 CD 冷却
 * @param groupId 群号
 * @param appId AppID
 */
function setCooldown(groupId: number | string, appId: string): void {
    const cdSeconds = pluginState.config.cooldownSeconds ?? 300;
    if (cdSeconds <= 0) return;

    const key = `${groupId}:${appId}`;
    cooldownMap.set(key, Date.now() + cdSeconds * 1000);
}

// ==================== 消息发送工具 ====================

/**
 * 合并转发消息节点类型
 */
interface ForwardNode {
    type: 'node';
    data: {
        user_id: string;
        nickname: string;
        content: Array<{ type: string; data: any }>;
    };
}

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
 * 发送群合并转发消息
 * @param ctx 插件上下文
 * @param groupId 群号
 * @param messages 合并转发消息节点数组
 */
async function sendGroupForwardMsg(ctx: NapCatPluginContext, groupId: number | string, messages: ForwardNode[]): Promise<boolean> {
    try {
        await ctx.actions.call(
            'send_group_forward_msg',
            {
                group_id: String(groupId),
                messages: messages
            },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        return true;
    } catch (error) {
        pluginState.log('error', `发送群合并转发消息失败:`, error);
        return false;
    }
}

/**
 * 构建伪造的合并转发消息节点
 * @param userId 发送者 QQ 号
 * @param nickname 发送者昵称
 * @param content 消息内容数组
 */
function buildForwardNode(userId: string, nickname: string, content: Array<{ type: string; data: any }>): ForwardNode {
    return {
        type: 'node',
        data: {
            user_id: userId,
            nickname: nickname,
            content: content
        }
    };
}

/**
 * 设置消息表情回复
 * @param ctx 插件上下文
 * @param messageId 消息 ID
 * @param emojiId 表情 ID（10024: 闪光/处理中, 124: ok/完成, 10060: ❌/失败）
 */
async function setMsgEmojiLike(ctx: NapCatPluginContext, messageId: number | string, emojiId: string): Promise<boolean> {
    try {
        await ctx.actions.call(
            'set_msg_emoji_like',
            {
                message_id: messageId,
                emoji_id: emojiId
            },
            ctx.adapterName,
            ctx.pluginManager.config
        );
        pluginState.logDebug(`设置表情回复成功: message_id=${messageId}, emoji_id=${emojiId}`);
        return true;
    } catch (error) {
        pluginState.log('error', `设置表情回复失败:`, error);
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

// ==================== 消息段构建工具 ====================

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

// ==================== 命令解析 ====================

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

// ==================== 命令处理器 ====================

/**
 * 处理 depot 下载命令
 */
async function handleDepotCommand(ctx: NapCatPluginContext, groupId: number, appId: string, messageId: number, selfId: string): Promise<void> {
    // 验证 AppID 格式
    if (!/^\d+$/.test(appId)) {
        await sendGroupMessage(ctx, groupId, [
            replySegment(messageId),
            textSegment(`❌ 无效的 AppID: ${appId}\n请输入纯数字的 Steam AppID`)
        ]);
        return;
    }

    // 检查 CD 冷却
    const cdRemaining = getCooldownRemaining(groupId, appId);
    if (cdRemaining > 0) {
        await sendGroupMessage(ctx, groupId, [
            replySegment(messageId),
            textSegment(`⏳ AppID ${appId} 正在冷却中，请 ${cdRemaining} 秒后再试`)
        ]);
        return;
    }

    // 贴一个"闪光"表情表示开始处理
    if (messageId) {
        await setMsgEmojiLike(ctx, messageId, '10024');
    }

    try {
        // 调用下载服务
        const result = await downloadSteamDepot(appId);

        if (result.success && result.zipPath) {
            // 构建成功消息 - 使用合并转发
            const gameName = result.gameName || `AppID ${appId}`;
            const fileSize = getFileSizeString(result.zipPath);
            const fileName = `${gameName.replace(/[<>:"/\\|?*]/g, '_')} - ${appId}.zip`;

            const botNickname = 'Steam Depot';
            const forwardNodes: ForwardNode[] = [];

            // 节点1：游戏基本信息
            let infoText = `🎮 游戏: ${gameName}\n`;
            infoText += `📦 AppID: ${appId}\n`;
            infoText += `📁 文件大小: ${fileSize}\n`;
            infoText += `📂 来源: ${result.sourceRepo || '未知'}`;
            forwardNodes.push(buildForwardNode(selfId, botNickname, [textSegment(infoText)]));

            // 节点2：密钥和清单信息
            if (result.depotKeys.length > 0 || result.manifests.length > 0) {
                let detailText = '';
                if (result.depotKeys.length > 0) {
                    detailText += `🔑 密钥数量: ${result.depotKeys.length}\n`;
                }
                if (result.manifests.length > 0) {
                    detailText += `📋 Manifest: ${result.manifests.length} 个`;
                }
                forwardNodes.push(buildForwardNode(selfId, botNickname, [textSegment(detailText.trim())]));
            }

            // 节点3：文件
            forwardNodes.push(buildForwardNode(selfId, botNickname, [
                { type: 'file', data: { file: result.zipPath, name: fileName } }
            ]));

            // 节点4：完成提示
            forwardNodes.push(buildForwardNode(selfId, botNickname, [textSegment(`✅ 下载成功！`)]));

            // 发送合并转发（包含文件）
            const sent = await sendGroupForwardMsg(ctx, groupId, forwardNodes);

            if (sent) {
                pluginState.incrementProcessedCount();
            } else {
                // 合并转发失败，尝试单独上传群文件作为兜底
                pluginState.log('warn', '合并转发发送失败，尝试单独上传群文件');
                const uploaded = await uploadGroupFile(ctx, groupId, result.zipPath, fileName);
                if (uploaded) {
                    pluginState.incrementProcessedCount();
                } else {
                    await sendGroupMessage(ctx, groupId, [
                        textSegment(`⚠️ 文件发送失败，请稍后重试`)
                    ]);
                }
            }

            // 设置 CD（成功才计入 CD）
            setCooldown(groupId, appId);

            // 贴一个"ok"表情表示完成
            if (messageId) {
                await setMsgEmojiLike(ctx, messageId, '124');
            }

            // 清理临时文件
            const tempDir = path.dirname(result.zipPath);
            setTimeout(() => {
                cleanupTempDir(tempDir);
            }, 5000);

        } else {
            // 下载失败 - 不计入 CD
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
        // 异常不计入 CD
    }
}

/**
 * 处理 info 命令 - 查询游戏的密钥和清单信息（不下载，仅展示）
 */
async function handleInfoCommand(ctx: NapCatPluginContext, groupId: number, appId: string, messageId: number, selfId: string): Promise<void> {
    // 验证 AppID 格式
    if (!/^\d+$/.test(appId)) {
        await sendGroupMessage(ctx, groupId, [
            replySegment(messageId),
            textSegment(`❌ 无效的 AppID: ${appId}\n请输入纯数字的 Steam AppID`)
        ]);
        return;
    }

    // 检查 CD 冷却
    const cdRemaining = getCooldownRemaining(groupId, appId);
    if (cdRemaining > 0) {
        await sendGroupMessage(ctx, groupId, [
            replySegment(messageId),
            textSegment(`⏳ AppID ${appId} 正在冷却中，请 ${cdRemaining} 秒后再试`)
        ]);
        return;
    }

    // 贴一个"闪光"表情表示开始处理
    if (messageId) {
        await setMsgEmojiLike(ctx, messageId, '10024');
    }

    try {
        const hubResult = await fetchFromManifestHub(appId);

        if (!hubResult.success) {
            // 查询失败 - 不计入 CD
            await sendGroupMessage(ctx, groupId, [
                replySegment(messageId),
                textSegment(`❌ 查询失败: ${hubResult.error || '未知错误'}`)
            ]);
            return;
        }

        const botNickname = 'Steam Depot';
        const forwardNodes: ForwardNode[] = [];

        // 节点1：基本信息
        let basicText = `📊 AppID ${appId} 信息\n`;
        if (hubResult.gameName) {
            basicText += `🎮 游戏: ${hubResult.gameName}\n`;
        }
        basicText += `📦 数据源: ManifestHub (${hubResult.keySource || 'SAC'})`;
        forwardNodes.push(buildForwardNode(selfId, botNickname, [textSegment(basicText)]));

        // 节点2：密钥信息
        let keyText = `🔑 Depot 密钥: ${hubResult.depotKeys.length} 个\n`;
        for (const key of hubResult.depotKeys.slice(0, 10)) {
            keyText += `  ${key.depotId} → ${key.decryptionKey.substring(0, 16)}...\n`;
        }
        if (hubResult.depotKeys.length > 10) {
            keyText += `  ... 还有 ${hubResult.depotKeys.length - 10} 个`;
        }
        forwardNodes.push(buildForwardNode(selfId, botNickname, [textSegment(keyText.trim())]));

        // 节点3：清单信息
        const manifestEntries = Object.entries(hubResult.manifests);
        let manifestText = `📋 Manifest: ${manifestEntries.length} 个\n`;
        for (const [depotId, manifestId] of manifestEntries.slice(0, 10)) {
            manifestText += `  ${depotId} → ${manifestId}\n`;
        }
        if (manifestEntries.length > 10) {
            manifestText += `  ... 还有 ${manifestEntries.length - 10} 个`;
        }
        forwardNodes.push(buildForwardNode(selfId, botNickname, [textSegment(manifestText.trim())]));

        // 节点4：DLC 信息（如果有）
        if (hubResult.dlcIds && hubResult.dlcIds.length > 0) {
            let dlcText = `🎁 DLC: ${hubResult.dlcIds.length} 个\n`;
            const displayDlcs = hubResult.dlcIds.slice(0, 15);
            dlcText += `  ${displayDlcs.join(', ')}`;
            if (hubResult.dlcIds.length > 15) {
                dlcText += ` ... 等`;
            }
            forwardNodes.push(buildForwardNode(selfId, botNickname, [textSegment(dlcText)]));
        }

        // 发送合并转发
        await sendGroupForwardMsg(ctx, groupId, forwardNodes);

        // 设置 CD（成功才计入 CD）
        setCooldown(groupId, appId);

        // 贴一个"ok"表情表示完成
        if (messageId) {
            await setMsgEmojiLike(ctx, messageId, '124');
        }

    } catch (error) {
        pluginState.log('error', `查询 info 失败:`, error);
        await sendGroupMessage(ctx, groupId, [
            replySegment(messageId),
            textSegment(`❌ 查询时发生错误，请稍后重试`)
        ]);
        // 异常不计入 CD
    }
}

/**
 * 处理 cache 命令 - 管理 DepotKeys 缓存
 */
async function handleCacheCommand(ctx: NapCatPluginContext, groupId: number, action: string, messageId: number, selfId: string): Promise<void> {
    const botNickname = 'Steam Depot';

    if (action === 'clear' || action === '清除') {
        clearDepotKeysCache();
        const forwardNodes: ForwardNode[] = [
            buildForwardNode(selfId, botNickname, [textSegment(`✅ DepotKeys 缓存已清除`)])
        ];
        await sendGroupForwardMsg(ctx, groupId, forwardNodes);
    } else if (action === 'refresh' || action === '刷新') {
        // 贴一个"闪光"表情表示开始处理
        if (messageId) {
            await setMsgEmojiLike(ctx, messageId, '10024');
        }

        try {
            const keys = await getDepotKeys(true);
            const forwardNodes: ForwardNode[] = [
                buildForwardNode(selfId, botNickname, [textSegment(`✅ DepotKeys 缓存已刷新，共 ${Object.keys(keys).length} 个密钥`)])
            ];
            await sendGroupForwardMsg(ctx, groupId, forwardNodes);

            // 贴一个"ok"表情表示完成
            if (messageId) {
                await setMsgEmojiLike(ctx, messageId, '124');
            }
        } catch (error) {
            await sendGroupMessage(ctx, groupId, [
                replySegment(messageId),
                textSegment(`❌ 刷新失败: ${error}`)
            ]);
        }
    } else {
        const forwardNodes: ForwardNode[] = [
            buildForwardNode(selfId, botNickname, [textSegment(
                `📦 缓存管理命令:\n${pluginState.config.commandPrefix} cache clear - 清除缓存\n${pluginState.config.commandPrefix} cache refresh - 刷新缓存`
            )])
        ];
        await sendGroupForwardMsg(ctx, groupId, forwardNodes);
    }
}

/**
 * 处理帮助命令
 */
async function handleHelpCommand(ctx: NapCatPluginContext, groupId: number, prefix: string, selfId: string): Promise<void> {
    const botNickname = 'Steam Depot';
    const forwardNodes: ForwardNode[] = [];

    // 节点1：标题
    forwardNodes.push(buildForwardNode(selfId, botNickname, [textSegment(`🎮 Steam Depot 下载器 帮助`)]));

    // 节点2：使用方法
    const usageText = `📌 使用方法:\n${prefix} <AppID> - 下载指定 AppID 的游戏数据\n${prefix} info <AppID> - 查询密钥和清单信息（不下载）\n${prefix} cache clear - 清除 DepotKeys 缓存\n${prefix} cache refresh - 刷新 DepotKeys 缓存`;
    forwardNodes.push(buildForwardNode(selfId, botNickname, [textSegment(usageText)]));

    // 节点3：示例
    const exampleText = `📝 示例:\n${prefix} 730 - 下载 CS:GO\n${prefix} info 1245620 - 查询 Elden Ring 的信息`;
    forwardNodes.push(buildForwardNode(selfId, botNickname, [textSegment(exampleText)]));

    // 节点4：提示
    const tipText = `💡 提示:\n- AppID 可在 Steam 商店页面 URL 中找到\n- 例如: store.steampowered.com/app/730/\n- 下载包含 Lua 脚本、密钥和清单信息\n- 数据来源: ManifestHub + GitHub 仓库\n- 同一 AppID 请求有 ${pluginState.config.cooldownSeconds ?? 300} 秒冷却时间`;
    forwardNodes.push(buildForwardNode(selfId, botNickname, [textSegment(tipText)]));

    await sendGroupForwardMsg(ctx, groupId, forwardNodes);
}

// ==================== 消息处理主函数 ====================

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
        const selfId = String(event.self_id || '10000');

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
            await handleHelpCommand(ctx, groupId, prefix, selfId);
        } else if (command === 'info' && args.length > 0 && /^\d+$/.test(args[0])) {
            // info 命令：查询密钥和清单信息
            await handleInfoCommand(ctx, groupId, args[0], messageId, selfId);
        } else if (command === 'cache') {
            // cache 命令：管理缓存
            await handleCacheCommand(ctx, groupId, args[0] || '', messageId, selfId);
        } else if (command === '' && args.length === 0) {
            // 只输入了前缀，显示帮助
            await handleHelpCommand(ctx, groupId, prefix, selfId);
        } else if (/^\d+$/.test(command)) {
            // 直接输入的 AppID
            await handleDepotCommand(ctx, groupId, command, messageId, selfId);
        } else if (args.length > 0 && /^\d+$/.test(args[0])) {
            // 命令后跟 AppID
            await handleDepotCommand(ctx, groupId, args[0], messageId, selfId);
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
