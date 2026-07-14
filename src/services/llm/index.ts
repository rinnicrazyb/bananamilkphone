/**
 * LLM API 服务 —— 兼容 OpenAI 流式接口
 */

import type { LLMConfig, LLMMessage, StreamChunk } from './types';

export class LLMError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'LLMError';
    this.status = status;
  }
}

/**
 * 调用 LLM 流式接口，逐块回调 onChunk
 */
export async function streamChat(
  config: LLMConfig,
  messages: LLMMessage[],
  onChunk: (chunk: StreamChunk) => void,
  signal?: AbortSignal
): Promise<void> {
  const url = config.baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const body = JSON.stringify({
    model: config.model,
    messages,
    temperature: config.temperature ?? 0.7,
    top_p: config.topP ?? 1,
    stream: true,
  });

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
      signal,
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
      // ignore parse error
    }
    throw new LLMError(errMsg, response.status);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new LLMError('响应体不可读');
  }

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
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          // reasoning_content 是 DeepSeek 等模型的思考链字段
          const reasoning = delta.reasoning_content || delta.reasoning;
          const content = delta.content;

          onChunk({
            content: content || undefined,
            reasoning: reasoning || undefined,
            done: false,
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
