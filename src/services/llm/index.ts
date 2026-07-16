/**
 * LLM API 服务 —— 兼容 OpenAI 流式接口，支持 Function Calling
 */

import type { LLMConfig, LLMMessage, StreamChunk, LLMToolDefinition } from './types';

/**
 * 将 LLMMessage 转换为 OpenAI API 格式（camelCase → snake_case）
 */
function toAPIMessages(msgs: LLMMessage[]): Record<string, unknown>[] {
  return msgs.map((m) => {
    const api: Record<string, unknown> = {
      role: m.role,
      content: m.role === 'assistant' && m.toolCalls?.length ? null : (m.content || null),
    };
    if (m.toolCalls?.length) {
      api.tool_calls = m.toolCalls;
    }
    if (m.toolCallId) {
      api.tool_call_id = m.toolCallId;
    }
    return api;
  });
}

export class LLMError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'LLMError';
    this.status = status;
  }
}

export interface StreamChatOptions {
  /** 工具定义列表（Function Calling） */
  tools?: LLMToolDefinition[];
  /** tool_choice 策略 */
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  /** 中断信号 */
  signal?: AbortSignal;
}

/**
 * 调用 LLM 流式接口，逐块回调 onChunk
 * 支持 tools、tool_calls 增量解析、finish_reason 检测
 */
export async function streamChat(
  config: LLMConfig,
  messages: LLMMessage[],
  onChunk: (chunk: StreamChunk) => void,
  options?: StreamChatOptions
): Promise<void> {
  const url = config.baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const bodyObj: Record<string, unknown> = {
    model: config.model,
    messages: toAPIMessages(messages),
    temperature: config.temperature ?? 0.7,
    top_p: config.topP ?? 1,
    stream: true,
  };

  if (config.reasoningEffort) {
    bodyObj.reasoning_effort = config.reasoningEffort;
  }

  if (options?.tools && options.tools.length > 0) {
    bodyObj.tools = options.tools;
    bodyObj.tool_choice = options.toolChoice ?? 'auto';
  }

  const body = JSON.stringify(bodyObj);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
      signal: options?.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      onChunk({ done: true });
      return;
    }
    throw new LLMError('网络请求失败: ' + (err as Error).message);
  }

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      errMsg = errBody.error?.message || errMsg;
    } catch {
      // ignore
    }
    throw new LLMError(errMsg, response.status);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new LLMError('响应体不可读');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          onChunk({ done: true });
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];
          if (!choice) {
            // 部分提供商在最后一个 chunk 同时返回 usage 和空的 choices
            if (parsed.usage) {
              onChunk({
                usage: {
                  promptTokens: parsed.usage.prompt_tokens ?? 0,
                  completionTokens: parsed.usage.completion_tokens ?? 0,
                  cachedTokens: parsed.usage.prompt_cache_hit_tokens ?? parsed.usage.cached_tokens ?? undefined,
                },
                done: true,
              });
            }
            continue;
          }

          const delta = choice.delta || {};
          const finishReason = choice.finish_reason || null;

          // token 用量（部分提供商在 finish_reason 时附带）
          const usage = parsed.usage
            ? {
                promptTokens: parsed.usage.prompt_tokens ?? 0,
                completionTokens: parsed.usage.completion_tokens ?? 0,
                cachedTokens: parsed.usage.prompt_cache_hit_tokens ?? parsed.usage.cached_tokens ?? undefined,
              }
            : undefined;

          // 常规内容
          const reasoning = delta.reasoning_content || delta.reasoning;
          const content = delta.content;

          // tool_calls 增量
          const toolCallDeltas = delta.tool_calls
            ? delta.tool_calls.map((tc: any) => ({
                index: tc.index,
                id: tc.id,
                type: tc.type,
                function: tc.function
                  ? {
                      name: tc.function.name,
                      arguments: tc.function.arguments,
                    }
                  : undefined,
              }))
            : undefined;

          onChunk({
            content: content || undefined,
            reasoning: reasoning || undefined,
            toolCallDeltas,
            finishReason,
            usage,
            done: !!finishReason && finishReason !== 'tool_calls',
          });
        } catch {
          // 跳过非 JSON 行
        }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      onChunk({ done: true });
      return;
    }
    throw new LLMError('读取流式响应失败: ' + (err as Error).message);
  } finally {
    reader.releaseLock();
    onChunk({ done: true });
  }
}

/**
 * 非流式调用 LLM，返回完整文本内容
 * 用于记忆提取、标题生成等一次性任务
 */
export async function chatCompletion(
  config: LLMConfig,
  messages: LLMMessage[],
  options?: { signal?: AbortSignal }
): Promise<string> {
  const url = config.baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const bodyObj: Record<string, unknown> = {
    model: config.model,
    messages: toAPIMessages(messages),
    temperature: 0.3,       // 提取用低温度保证一致性
    top_p: config.topP ?? 1,
    stream: false,
  };

  const body = JSON.stringify(bodyObj);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body,
    signal: options?.signal,
  });

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      errMsg = errBody.error?.message || errMsg;
    } catch { /* ignore */ }
    throw new LLMError(errMsg, response.status);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return content;
}
