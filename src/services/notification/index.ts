/**
 * 通知服务 —— 使用 @capacitor/local-notifications
 *
 * 功能：
 * - 初始化通知渠道
 * - 检查/请求通知权限
 * - AI 回复完成时发送通知
 * - 点击通知跳转到对应智能体对话
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const CHANNEL_ID = 'chat-message';
const CHANNEL_NAME = '聊天消息';

/** 是否为 Capacitor 原生环境 */
function isNative(): boolean {
  try { return Capacitor.getPlatform() !== 'web'; } catch { return false; }
}

/** 初始化通知渠道 */
export async function initNotifications(): Promise<void> {
  if (!isNative()) return;

  try {
    // 检查权限
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display === 'prompt') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;
    } else if (perm.display !== 'granted') {
      return;
    }

    // 注册渠道（Android 8+ 需要）
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: CHANNEL_NAME,
      description: 'AI 智能体回复消息通知',
      importance: 4, // IMPORTANCE_HIGH
      visibility: 1, // VISIBILITY_PUBLIC
      sound: 'default',
      vibration: true,
    });
  } catch (err) {
    console.warn('[Notification] Init failed:', err);
  }
}

/** 主动请求通知权限（供设置页面调用） */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const req = await LocalNotifications.requestPermissions();
    return req.display === 'granted';
  } catch {
    return false;
  }
}

/** 发送 AI 回复完成通知 */
export async function notifyMessageReceived(
  agentName: string,
  preview: string,
  deepLink: string
): Promise<void> {
  if (!isNative()) return;

  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;

    await LocalNotifications.schedule({
      notifications: [
        {
          title: agentName,
          body: preview.slice(0, 200),
          id: Date.now(),
          channelId: CHANNEL_ID,
          sound: 'default',
          attachments: [],
          actionTypeId: '',
          extra: { deepLink },
          // Android 特有
          smallIcon: 'ic_stat_icon',
          iconColor: '#863bff',
          // 自动取消（点击后消失）
          autoCancel: true,
        },
      ],
    });
  } catch (err) {
    console.warn('[Notification] Send failed:', err);
  }
}
