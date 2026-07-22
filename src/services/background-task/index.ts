/**
 * BackgroundTaskManager — 后台生成任务管理器
 *
 * 使 LLM 生成独立于 React 组件生命周期：
 * - 支持多对话同时生成
 * - 生成完成时通知（事件 + 回调）
 * - 主动消息复用同一底座
 */

type TaskId = string;

interface GenerationTask {
  id: TaskId;
  conversationId: string;
  agentId: string;
  prompt?: string;
  abortController: AbortController;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  createdAt: number;
}

interface TaskCallbacks {
  onComplete?: (task: GenerationTask) => void;
  onError?: (task: GenerationTask, error: Error) => void;
}

type TaskListener = (task: GenerationTask, event: 'started' | 'completed' | 'failed') => void;

class BackgroundTaskManager {
  private tasks = new Map<TaskId, GenerationTask>();
  private listeners = new Set<TaskListener>();
  private callbacks = new Map<TaskId, TaskCallbacks>();

  /** 启动新生成任务 */
  startTask(
    conversationId: string,
    agentId: string,
    runGeneration: (signal: AbortSignal) => Promise<void>,
    callbacks?: TaskCallbacks
  ): TaskId {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const task: GenerationTask = {
      id, conversationId, agentId,
      abortController: new AbortController(),
      status: 'running',
      createdAt: Date.now(),
    };

    this.tasks.set(id, task);
    if (callbacks) this.callbacks.set(id, callbacks);
    this.notify(task, 'started');

    runGeneration(task.abortController.signal)
      .then(() => {
        task.status = 'completed';
        this.tasks.set(id, task);
        this.notify(task, 'completed');
        callbacks?.onComplete?.(task);
      })
      .catch((err) => {
        if (task.abortController.signal.aborted) {
          task.status = 'aborted';
        } else {
          task.status = 'failed';
        }
        this.tasks.set(id, task);
        this.notify(task, 'failed');
        callbacks?.onError?.(task, err as Error);
      })
      .finally(() => {
        this.callbacks.delete(id);
        // 30秒后清理
        setTimeout(() => this.tasks.delete(id), 30_000);
      });

    return id;
  }

  /** 中止任务 */
  abortTask(id: TaskId): void {
    const task = this.tasks.get(id);
    if (task && task.status === 'running') {
      task.abortController.abort();
    }
  }

  /** 获取对话的活跃任务 */
  getActiveTask(conversationId: string): GenerationTask | undefined {
    for (const task of this.tasks.values()) {
      if (task.conversationId === conversationId && task.status === 'running') {
        return task;
      }
    }
    return undefined;
  }

  /** 是否有任何运行中的任务 */
  hasActiveTasks(): boolean {
    for (const task of this.tasks.values()) {
      if (task.status === 'running') return true;
    }
    return false;
  }

  /** 订阅任务事件 */
  subscribe(listener: TaskListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(task: GenerationTask, event: 'started' | 'completed' | 'failed'): void {
    this.listeners.forEach((l) => l(task, event));
  }
}

/** 全局单例 */
export const taskManager = new BackgroundTaskManager();
