import { useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { Battery } from '@capawesome/capacitor-battery';
import { WifiHigh, WifiSlash, BatteryCharging } from '@phosphor-icons/react';

interface StatusBarState {
  time: string;
  batteryLevel: number;
  isCharging: boolean;
  networkConnected: boolean;
  networkType: string;
}

function formatTime(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function initState(): StatusBarState {
  return {
    time: formatTime(),
    batteryLevel: 1,
    isCharging: false,
    networkConnected: true,
    networkType: 'unknown',
  };
}

/**
 * Cellular signal SVG — 模仿 Android 信号格样式
 */
function CellularIcon() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" style={{ marginRight: 4 }}>
      <rect x="0" y="7" width="3" height="5" rx="0.5" fill="currentColor" opacity="0.4" />
      <rect x="4.5" y="4" width="3" height="8" rx="0.5" fill="currentColor" opacity="0.6" />
      <rect x="9" y="2" width="3" height="10" rx="0.5" fill="currentColor" opacity="0.8" />
      <rect x="13.5" y="0" width="3" height="12" rx="0.5" fill="currentColor" />
    </svg>
  );
}

export default function StatusBar() {
  const [state, setState] = useState<StatusBarState>(initState);
  const isNative = Capacitor.isNativePlatform();

  // 刷新时间
  useEffect(() => {
    const timer = setInterval(() => {
      setState((prev) => ({ ...prev, time: formatTime() }));
    }, 10_000);
    return () => clearInterval(timer);
  }, []);

  // 获取电量（原生端用插件，浏览器端用 mock）
  const fetchBattery = useCallback(async () => {
    if (!isNative) {
      // 浏览器端使用 Battery API（标准 Web API）
      try {
        const b = await (navigator as any).getBattery?.();
        if (b) {
          setState((prev) => ({
            ...prev,
            batteryLevel: b.level,
            isCharging: b.charging,
          }));
          b.addEventListener('levelchange', () => {
            setState((prev) => ({ ...prev, batteryLevel: b.level }));
          });
          b.addEventListener('chargingchange', () => {
            setState((prev) => ({ ...prev, isCharging: b.charging }));
          });
        }
      } catch {
        // 静默
      }
      return;
    }

    try {
      const [levelResult, stateResult] = await Promise.all([
        Battery.getBatteryLevel(),
        Battery.getBatteryState(),
      ]);
      setState((prev) => ({
        ...prev,
        batteryLevel: levelResult.level,
        isCharging: stateResult.state === 'charging' || stateResult.state === 'full',
      }));
    } catch {
      // 插件不可用时保持默认
    }
  }, [isNative]);

  // 获取网络状态（原生端用插件，浏览器端用 navigator.onLine）
  const fetchNetwork = useCallback(async () => {
    if (!isNative) {
      setState((prev) => ({
        ...prev,
        networkConnected: navigator.onLine,
        networkType: navigator.onLine ? 'wifi' : 'none',
      }));
      return;
    }

    try {
      const status = await Network.getStatus();
      setState((prev) => ({
        ...prev,
        networkConnected: status.connected,
        networkType: status.connectionType,
      }));
    } catch {
      // 静默
    }
  }, [isNative]);

  // 监听网络变化（原生端）
  useEffect(() => {
    if (!isNative) {
      const goOnline = () => setState((prev) => ({ ...prev, networkConnected: true, networkType: 'wifi' }));
      const goOffline = () => setState((prev) => ({ ...prev, networkConnected: false, networkType: 'none' }));
      window.addEventListener('online', goOnline);
      window.addEventListener('offline', goOffline);
      return () => {
        window.removeEventListener('online', goOnline);
        window.removeEventListener('offline', goOffline);
      };
    }

    let handle: { remove: () => void } | undefined;
    Network.addListener('networkStatusChange', (status) => {
      setState((prev) => ({
        ...prev,
        networkConnected: status.connected,
        networkType: status.connectionType,
      }));
    }).then((l) => { handle = l; });
    return () => { handle?.remove(); };
  }, [isNative]);

  // 初始读取
  useEffect(() => {
    fetchBattery();
    fetchNetwork();
  }, [fetchBattery, fetchNetwork]);

  const batteryPercent = Math.round(state.batteryLevel * 100);
  const batteryWidth = Math.max(2, 13 * state.batteryLevel);

  return (
    <div className="status-bar">
      <span className="status-bar__time">{state.time}</span>
      <span className="status-bar__spacer" />

      {/* 网络图标 */}
      <span className="status-bar__network">
        {state.networkType === 'cellular' ? (
          <CellularIcon />
        ) : state.networkConnected ? (
          <WifiHigh size={14} weight="fill" />
        ) : (
          <WifiSlash size={14} weight="fill" />
        )}
      </span>

      {/* 充电提示 */}
      {state.isCharging && (
        <span className="status-bar__charging">
          <BatteryCharging size={14} weight="fill" />
        </span>
      )}

      {/* 电池 */}
      <span className="status-bar__battery">
        <svg width="22" height="12" viewBox="0 0 22 12" fill="none">
          <rect x="0.5" y="0.5" width="17" height="11" rx="2" stroke="currentColor" />
          <rect
            x="2"
            y="2"
            width={batteryWidth}
            height="8"
            rx="1"
            fill="currentColor"
          />
          <rect x="19" y="3.5" width="3" height="5" rx="1" fill="currentColor" />
        </svg>
      </span>

      {/* 电量百分比 */}
      <span className="status-bar__percent">{batteryPercent}%</span>
    </div>
  );
}
