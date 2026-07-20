/**
 * 平台检测工具 —— 集中管理 Capacitor/浏览器环境判断
 *
 * 全局仅此一份定义，所有模块统一引用。
 * 避免之前 4 处 isNative() / 2 处 isViteDev() 重复实现的维护风险。
 */

import { Capacitor } from '@capacitor/core';

/** 是否运行在 Capacitor 原生壳中（Android APK 或 iOS IPA） */
export function isNative(): boolean {
  try {
    return Capacitor.getPlatform() !== 'web';
  } catch {
    return false;
  }
}

/** 是否运行在 Vite 开发服务器（localhost 且非 Capacitor 原生环境） */
export function isViteDev(): boolean {
  return typeof window !== 'undefined' && window.location.hostname === 'localhost' && !isNative();
}

/** 是否运行在 Capacitor 环境（含原生壳和 Capacitor 浏览器调试） */
export function isCapacitor(): boolean {
  try {
    Capacitor.getPlatform();
    return true;
  } catch {
    return false;
  }
}
