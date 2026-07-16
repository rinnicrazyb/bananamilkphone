/**
 * PromptInjectionTransformer 单元测试
 *
 * 测试用例设计参照 RikkaHub PromptInjectionTransformerTest：
 * - 无注入情况
 * - AFTER_SYSTEM_PROMPT / BEFORE_SYSTEM_PROMPT
 * - TOP_OF_CHAT / BOTTOM_OF_CHAT / AT_DEPTH
 * - 关键词匹配（大小写敏感/不敏感、正则、scanDepth）
 * - 常驻激活 (constantActive)
 * - 禁用条目/世界书
 * - 多个注入组合
 * - findSafeInsertIndex 供应商兼容
 * - collectInjections 收集逻辑
 */
import { describe, it, expect } from 'vitest';
import type { LLMMessage } from '../llm/types';
import type { TransformerContext } from './types';
import type { LorebookEntry, Lorebook } from '../../apps/lorebook/types';
import {
  collectInjections,
  applyInjections,
  findSafeInsertIndex,
  isTriggered,
  promptInjectionTransformer,
} from './prompt-injection';
import { createDefaultEntry, createDefaultLorebook } from '../../apps/lorebook/types';

// ─── 辅助函数 ─────────────────────────────────────

function msg(role: LLMMessage['role'], content: string, toolCalls?: LLMMessage['toolCalls']): LLMMessage {
  return { role, content, ...(toolCalls ? { toolCalls } : {}) };
}

const system = (c: string) => msg('system', c);
const user = (c: string) => msg('user', c);
const assistant = (c: string, toolCalls?: LLMMessage['toolCalls']) => msg('assistant', c, toolCalls);

function makeCtx(overrides?: Partial<TransformerContext>): TransformerContext {
  return {
    agent: { id: 'a1', name: 'TestAgent', avatar: '', unreadCount: 0, settings: { systemPrompt: '', worldBookIds: [] } },
    memories: [],
    displayConfig: undefined,
    mcpServers: [],
    searchProviders: {},
    lorebooks: [],
    ...overrides,
  };
}

function makeEntry(overrides?: Partial<LorebookEntry>): LorebookEntry {
  return createDefaultEntry(overrides);
}

function makeLorebook(id: string, entries: LorebookEntry[], overrides?: Partial<Lorebook>): Lorebook {
  return createDefaultLorebook({ id, name: 'Test Lorebook', entries, ...overrides });
}

function systemText(msgs: LLMMessage[]): string {
  return msgs.find((m) => m.role === 'system')?.content ?? '';
}

// ─── 测试用例 ─────────────────────────────────────

describe('promptInjectionTransformer', () => {
  it('无注入应返回原消息', () => {
    const messages = [system('System'), user('Hello'), assistant('Hi')];
    const result = promptInjectionTransformer(messages, makeCtx());
    expect(result).toEqual(messages);
  });

  it('无绑定世界书时应返回原消息', () => {
    const messages = [system('System'), user('Hello')];
    const lorebook = makeLorebook('b1', [makeEntry({ keywords: ['Hello'], content: 'World' })]);
    const result = promptInjectionTransformer(messages, makeCtx({ lorebooks: [lorebook] }));
    expect(result).toEqual(messages);
  });
});

describe('isTriggered', () => {
  it('禁用条目不触发', () => {
    expect(isTriggered(makeEntry({ enabled: false, keywords: ['test'] }), 'test')).toBe(false);
  });

  it('常驻激活始终触发', () => {
    expect(isTriggered(makeEntry({ constantActive: true, keywords: [] }), '')).toBe(true);
  });

  it('无关键词不触发（非常驻）', () => {
    expect(isTriggered(makeEntry({ keywords: [] }), 'anything')).toBe(false);
  });

  it('关键词匹配成功', () => {
    expect(isTriggered(makeEntry({ keywords: ['hello'] }), 'hello world')).toBe(true);
  });

  it('关键词匹配失败', () => {
    expect(isTriggered(makeEntry({ keywords: ['bye'] }), 'hello world')).toBe(false);
  });

  it('大小写不敏感匹配', () => {
    expect(isTriggered(makeEntry({ keywords: ['Hello'] }), 'hello world')).toBe(true);
  });

  it('大小写敏感匹配', () => {
    expect(isTriggered(makeEntry({ keywords: ['Hello'], caseSensitive: true }), 'Hello world')).toBe(true);
    expect(isTriggered(makeEntry({ keywords: ['Hello'], caseSensitive: true }), 'hello world')).toBe(false);
  });

  it('正则匹配', () => {
    expect(isTriggered(makeEntry({ keywords: ['\\d{3}'], useRegex: true }), 'abc123def')).toBe(true);
    expect(isTriggered(makeEntry({ keywords: ['\\d{3}'], useRegex: true }), 'abcdef')).toBe(false);
  });

  it('正则无效时静默跳过', () => {
    expect(isTriggered(makeEntry({ keywords: ['['], useRegex: true }), 'test')).toBe(false);
  });

  it('多个关键词任一匹配即可', () => {
    expect(isTriggered(makeEntry({ keywords: ['cat', 'dog'] }), 'I have a dog')).toBe(true);
    expect(isTriggered(makeEntry({ keywords: ['cat', 'dog'] }), 'I have a bird')).toBe(false);
  });
});

describe('collectInjections', () => {
  it('无 agent 返回空', () => {
    expect(collectInjections([], makeCtx({ agent: undefined }))).toEqual([]);
  });

  it('无绑定 ID 返回空', () => {
    const lorebook = makeLorebook('b1', [makeEntry({ keywords: ['Hello'], content: 'Content' })]);
    const ctx = makeCtx({ lorebooks: [lorebook] });
    expect(collectInjections([user('Hello')], ctx)).toEqual([]);
  });

  it('收集绑定且启用的常驻条目', () => {
    const entry = makeEntry({ constantActive: true, content: 'Always' });
    const lorebook = makeLorebook('b1', [entry]);
    const ctx = makeCtx({
      agent: { id: 'a1', name: 'A', avatar: '', unreadCount: 0, settings: { systemPrompt: '', worldBookIds: ['b1'] } },
      lorebooks: [lorebook],
    });
    const result = collectInjections([user('Hello')], ctx);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Always');
  });

  it('关键词匹配成功时收集', () => {
    const entry = makeEntry({ keywords: ['magic'], content: 'Magic content' });
    const lorebook = makeLorebook('b1', [entry]);
    const ctx = makeCtx({
      agent: { id: 'a1', name: 'A', avatar: '', unreadCount: 0, settings: { systemPrompt: '', worldBookIds: ['b1'] } },
      lorebooks: [lorebook],
    });
    const result = collectInjections([user('Tell me about magic')], ctx);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Magic content');
  });

  it('关键词不匹配时不收集', () => {
    const entry = makeEntry({ keywords: ['magic'], content: 'Magic' });
    const lorebook = makeLorebook('b1', [entry]);
    const ctx = makeCtx({
      agent: { id: 'a1', name: 'A', avatar: '', unreadCount: 0, settings: { systemPrompt: '', worldBookIds: ['b1'] } },
      lorebooks: [lorebook],
    });
    const result = collectInjections([user('Hello')], ctx);
    expect(result).toHaveLength(0);
  });

  it('禁用世界书不触发', () => {
    const entry = makeEntry({ keywords: ['magic'], content: 'Magic' });
    const lorebook = makeLorebook('b1', [entry], { enabled: false });
    const ctx = makeCtx({
      agent: { id: 'a1', name: 'A', avatar: '', unreadCount: 0, settings: { systemPrompt: '', worldBookIds: ['b1'] } },
      lorebooks: [lorebook],
    });
    expect(collectInjections([user('magic')], ctx)).toHaveLength(0);
  });

  it('禁用条目不触发', () => {
    const entry = makeEntry({ keywords: ['magic'], content: 'Magic', enabled: false });
    const lorebook = makeLorebook('b1', [entry]);
    const ctx = makeCtx({
      agent: { id: 'a1', name: 'A', avatar: '', unreadCount: 0, settings: { systemPrompt: '', worldBookIds: ['b1'] } },
      lorebooks: [lorebook],
    });
    expect(collectInjections([user('magic')], ctx)).toHaveLength(0);
  });

  it('按优先级降序排列', () => {
    const low = makeEntry({ keywords: ['x'], content: 'Low', priority: 10 });
    const high = makeEntry({ keywords: ['x'], content: 'High', priority: 50 });
    const lorebook = makeLorebook('b1', [low, high]);
    const ctx = makeCtx({
      agent: { id: 'a1', name: 'A', avatar: '', unreadCount: 0, settings: { systemPrompt: '', worldBookIds: ['b1'] } },
      lorebooks: [lorebook],
    });
    const result = collectInjections([user('x')], ctx);
    expect(result[0].content).toBe('High');
    expect(result[1].content).toBe('Low');
  });

  it('scanDepth 限制扫描范围', () => {
    const entry = makeEntry({ keywords: ['old'], scanDepth: 1, content: 'Old content' });
    const lorebook = makeLorebook('b1', [entry]);
    const ctx = makeCtx({
      agent: { id: 'a1', name: 'A', avatar: '', unreadCount: 0, settings: { systemPrompt: '', worldBookIds: ['b1'] } },
      lorebooks: [lorebook],
    });
    const messages = [user('old message'), assistant('response'), user('latest')];
    expect(collectInjections(messages, ctx)).toHaveLength(0);

    const entry2 = makeEntry({ keywords: ['old'], scanDepth: 5, content: 'Old content' });
    const lorebook2 = makeLorebook('b1', [entry2]);
    const ctx2 = makeCtx({
      agent: { id: 'a1', name: 'A', avatar: '', unreadCount: 0, settings: { systemPrompt: '', worldBookIds: ['b1'] } },
      lorebooks: [lorebook2],
    });
    expect(collectInjections(messages, ctx2)).toHaveLength(1);
  });
});

describe('applyInjections', () => {
  it('空分组返回原消息', () => {
    const messages = [system('S'), user('U')];
    expect(applyInjections(messages, {})).toEqual(messages);
  });

  it('AFTER_SYSTEM_PROMPT 追加到 system message 末尾', () => {
    const result = applyInjections(
      [system('Original'), user('Hello')],
      { AFTER_SYSTEM_PROMPT: [makeCollected('Appended content')] }
    );
    expect(systemText(result)).toContain('Original');
    expect(systemText(result)).toContain('Appended content');
    expect(systemText(result).indexOf('Original')).toBeLessThan(systemText(result).indexOf('Appended'));
  });

  it('BEFORE_SYSTEM_PROMPT 插入到 system message 开头', () => {
    const result = applyInjections(
      [system('Original'), user('Hello')],
      { BEFORE_SYSTEM_PROMPT: [makeCollected('Prepended')] }
    );
    expect(systemText(result)).toContain('Original');
    expect(systemText(result)).toContain('Prepended');
    expect(systemText(result).indexOf('Prepended')).toBeLessThan(systemText(result).indexOf('Original'));
  });

  it('无 system 消息时创建新 system 消息', () => {
    const result = applyInjections(
      [user('Hello')],
      { AFTER_SYSTEM_PROMPT: [makeCollected('New system')] }
    );
    expect(result[0].role).toBe('system');
    expect(result[0].content).toBe('New system');
  });

  it('TOP_OF_CHAT 在第一条用户消息前插入', () => {
    const result = applyInjections(
      [system('S'), user('U1'), assistant('A1'), user('U2')],
      { TOP_OF_CHAT: [makeCollected('Top injection', 'user')] }
    );
    const topIdx = result.findIndex((m) => m.content === 'Top injection');
    const originalU1Idx = result.findIndex((m) => m.content === 'U1');
    // 注入消息应在原始第一条用户消息之前
    expect(topIdx).toBeLessThan(originalU1Idx);
    expect(result[topIdx].role).toBe('user');
  });

  it('BOTTOM_OF_CHAT 在最后一条消息前插入', () => {
    const result = applyInjections(
      [system('S'), user('U1'), assistant('A1'), user('U2')],
      { BOTTOM_OF_CHAT: [makeCollected('Bottom injection')] }
    );
    const bottomIdx = result.findIndex((m) => m.content === 'Bottom injection');
    const lastMsgIdx = result.length - 1;
    expect(bottomIdx).toBeLessThan(lastMsgIdx);
  });

  it('AT_DEPTH depth=1 在最后一条消息前', () => {
    const result = applyInjections(
      [system('S'), user('U1'), assistant('A1')],
      { AT_DEPTH: [makeCollected('Depth injection', 'user', 1)] }
    );
    const depthIdx = result.findIndex((m) => m.content === 'Depth injection');
    const lastMsgIdx = result.length - 1;
    expect(depthIdx).toBeLessThan(lastMsgIdx);
    expect(result[lastMsgIdx].content).toBe('A1');
  });

  it('多个注入位置同时生效', () => {
    const result = applyInjections(
      [system('S'), user('U')],
      {
        BEFORE_SYSTEM_PROMPT: [makeCollected('Before')],
        AFTER_SYSTEM_PROMPT: [makeCollected('After')],
        TOP_OF_CHAT: [makeCollected('Top', 'user')],
      }
    );
    expect(result.length).toBe(3);
    expect(systemText(result)).toMatch(/^Before/);
    expect(systemText(result)).toContain('After');
    expect(result[1].content).toBe('Top');
  });

  it('同 role 的注入合并为一条消息', () => {
    const result = applyInjections(
      [system('S'), user('U')],
      {
        TOP_OF_CHAT: [
          makeCollected('First', 'user'),
          makeCollected('Second', 'user'),
        ],
      }
    );
    const topUser = result.filter((m) => m.role === 'user' && m.content.includes('First'));
    expect(topUser).toHaveLength(1);
    expect(topUser[0].content).toContain('First');
    expect(topUser[0].content).toContain('Second');
  });

  it('不同 role 的注入分为多条消息', () => {
    const result = applyInjections(
      [system('S'), user('U')],
      {
        TOP_OF_CHAT: [
          makeCollected('User msg', 'user'),
          makeCollected('Assistant msg', 'assistant'),
        ],
      }
    );
    expect(result.filter((m) => m.role === 'user' && m.content === 'User msg')).toHaveLength(1);
    expect(result.filter((m) => m.role === 'assistant' && m.content === 'Assistant msg')).toHaveLength(1);
  });
});

describe('findSafeInsertIndex', () => {
  it('不应插入 USER → ASSISTANT(含Tool) 之间', () => {
    const messages = [
      system('S'),
      user('Call a tool'),
      assistant('', [{ id: 'c1', type: 'function', function: { name: 'tool', arguments: '{}' } }]),
    ];
    const safe = findSafeInsertIndex(messages, 2);
    expect(safe).toBe(1);
  });

  it('允许插入 ASSISTANT(无Tool) 之前', () => {
    const messages = [system('S'), user('U'), assistant('Hi')];
    expect(findSafeInsertIndex(messages, 2)).toBe(2);
  });

  it('边界值 0 不报错', () => {
    expect(findSafeInsertIndex([system('S'), user('U')], 0)).toBe(0);
  });

  it('BOTTOM_OF_CHAT 不插入 USER→ASSISTANT(tool) 之间', () => {
    const messages = [system('S'), user('Call tool'), assistant('', [{ id: 'c1', type: 'function', function: { name: 't', arguments: '{}' } }])];
    const result = applyInjections(messages, { BOTTOM_OF_CHAT: [makeCollected('Bottom', 'user')] });
    const bottomIdx = result.findIndex((m) => m.content === 'Bottom');
    const userIdx = result.findIndex((m) => m.content === 'Call tool');
    expect(bottomIdx).toBeLessThan(userIdx);
  });
});

// ─── 内部辅助 ─────────────────────────────────────

function makeCollected(
  content: string,
  role: 'user' | 'assistant' = 'user',
  injectDepth: number = 4,
  position: string = 'AFTER_SYSTEM_PROMPT'
) {
  return {
    id: '',
    content,
    position: position as any,
    priority: 0,
    injectDepth,
    role,
    sourceBook: 'Test',
    sourceEntry: 'Entry',
  };
}
