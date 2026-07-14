import { useEffect, useState } from 'react';

interface StatusBarState {
  time: string;
  battery: number;
}

function formatTime(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export default function StatusBar() {
  const [state, setState] = useState<StatusBarState>({
    time: formatTime(),
    battery: 100,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setState((prev) => ({ ...prev, time: formatTime() }));
    }, 10_000);

    // 真实设备上可通过 Capacitor Battery Plugin 获取
    // 浏览器中固定为 100
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="status-bar">
      <span className="status-bar__time">{state.time}</span>
      <span className="status-bar__spacer" />
      <span className="status-bar__battery">
        <svg width="22" height="12" viewBox="0 0 22 12" fill="none">
          <rect x="0.5" y="0.5" width="17" height="11" rx="2" stroke="currentColor" />
          <rect
            x="2"
            y="2"
            width={13 * (state.battery / 100)}
            height="8"
            rx="1"
            fill="currentColor"
          />
          <rect x="19" y="3.5" width="3" height="5" rx="1" fill="currentColor" />
        </svg>
      </span>
    </div>
  );
}
