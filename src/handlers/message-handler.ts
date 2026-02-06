/**
 * 消息处理器
 * 处理接收到的消息事件
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import { pluginState } from '../core/state';

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
 * 消息处理主函数
 * 在这里实现你的消息处理逻辑
 */
export async function handleMessage(ctx: NapCatPluginContext, event: OB11Message): Promise<void> {
    try {
        // 获取消息内容
        const rawMessage = event.raw_message || '';
        const messageType = event.message_type; // 'group' | 'private'
        const groupId = (event as any).group_id;
        const userId = event.user_id;

        pluginState.logDebug(`收到消息: ${rawMessage} | 类型: ${messageType}`);

        // 如果是群消息，检查该群是否启用
        if (messageType === 'group' && groupId) {
            if (!pluginState.isGroupEnabled(String(groupId))) {
                pluginState.logDebug(`群 ${groupId} 未启用，跳过处理`);
                return;
            }
        }

        // TODO: 在这里实现你的消息处理逻辑
        // 示例：回复特定命令
        if (rawMessage === '/ping') {
            if (messageType === 'group' && groupId) {
                await sendGroupMessage(ctx, groupId, [textSegment('pong!')]);
            } else if (messageType === 'private') {
                await sendPrivateMessage(ctx, userId, [textSegment('pong!')]);
            }
            pluginState.incrementProcessedCount();
        }

    } catch (error) {
        pluginState.log('error', '处理消息时出错:', error);
    }
}
