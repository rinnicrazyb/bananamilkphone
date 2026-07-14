/** 事件总线 —— 内存发布-订阅，及时消耗，不持久化 */

type EventHandler<T = unknown> = (payload: T) => void;

interface ListenerEntry {
  handler: EventHandler;
  once: boolean;
}

class EventBus {
  private listeners = new Map<string, ListenerEntry[]>();

  /** 订阅事件 */
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    const entry: ListenerEntry = { handler: handler as EventHandler, once: false };
    const list = this.listeners.get(event) || [];
    list.push(entry);
    this.listeners.set(event, list);
    return () => this.off(event, handler);
  }

  /** 一次性订阅 */
  once<T = unknown>(event: string, handler: EventHandler<T>): void {
    const entry: ListenerEntry = { handler: handler as EventHandler, once: true };
    const list = this.listeners.get(event) || [];
    list.push(entry);
    this.listeners.set(event, list);
  }

  /** 取消订阅 */
  off<T = unknown>(event: string, handler: EventHandler<T>): void {
    const list = this.listeners.get(event);
    if (!list) return;
    this.listeners.set(
      event,
      list.filter((e) => e.handler !== handler)
    );
  }

  /** 发布事件 —— 立即同步通知所有订阅者 */
  emit<T = unknown>(event: string, payload: T): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const toRemove: EventHandler[] = [];
    for (const entry of list) {
      entry.handler(payload);
      if (entry.once) toRemove.push(entry.handler);
    }
    if (toRemove.length > 0) {
      this.listeners.set(
        event,
        list.filter((e) => !toRemove.includes(e.handler))
      );
    }
  }

  /** 清除某事件全部订阅 */
  clear(event: string): void {
    this.listeners.delete(event);
  }

  /** 清除所有订阅 */
  clearAll(): void {
    this.listeners.clear();
  }
}

export const eventBus = new EventBus();
export type { EventHandler };
