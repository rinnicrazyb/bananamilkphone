/**
 * 世界书（Lorebook）类型定义
 *
 * 技术设计完全参照 RikkaHub 的 Lorebook 系统。
 * - Lorebook = 一本世界书（容器），含名称、描述、书封、多条条目
 * - LorebookEntry = 单条注入规则
 */

/** 注入位置（5 种） */
export const InjectionPosition = {
  /** 系统提示词之前（合并到 system message 开头） */
  BEFORE_SYSTEM_PROMPT: 'BEFORE_SYSTEM_PROMPT',
  /** 系统提示词之后（合并到 system message 末尾）—— 最常用 */
  AFTER_SYSTEM_PROMPT: 'AFTER_SYSTEM_PROMPT',
  /** 对话开头（在第一条用户消息前插入独立消息） */
  TOP_OF_CHAT: 'TOP_OF_CHAT',
  /** 最新消息前（在最后一条消息前插入独立消息） */
  BOTTOM_OF_CHAT: 'BOTTOM_OF_CHAT',
  /** 指定深度（从最新消息往前数 N 条的位置插入独立消息） */
  AT_DEPTH: 'AT_DEPTH',
} as const;

export type InjectionPosition = (typeof InjectionPosition)[keyof typeof InjectionPosition];

/** 注入消息的角色 */
export type InjectionRole = 'user' | 'assistant';

/** 单条世界书条目（= RikkaHub 的 RegexInjection） */
export interface LorebookEntry {
  id: string;
  /** 条目名称 */
  name: string;
  /** 启用 */
  enabled: boolean;
  /** 优先级（1-100），数值越高注入越靠前 */
  priority: number;
  /** 注入位置 */
  position: InjectionPosition;
  /** 注入到 LLM 的提示词内容 */
  content: string;
  /** 注入角色（仅 TOP_OF_CHAT / BOTTOM_OF_CHAT / AT_DEPTH 有效） */
  role: InjectionRole;
  /** 触发关键词列表 */
  keywords: string[];
  /** 是否使用正则表达式匹配 */
  useRegex: boolean;
  /** 是否大小写敏感 */
  caseSensitive: boolean;
  /** 扫描最近 N 条消息（默认 5） */
  scanDepth: number;
  /** 常驻激活（无需关键词匹配，始终注入） */
  constantActive: boolean;
  /** AT_DEPTH 时：从最新消息往前数的深度（默认 4） */
  injectDepth: number;
}

/** 创建新条目的默认值 */
export function createDefaultEntry(overrides?: Partial<LorebookEntry>): LorebookEntry {
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: true,
    priority: 50,
    position: InjectionPosition.AFTER_SYSTEM_PROMPT,
    content: '',
    role: 'user',
    keywords: [],
    useRegex: false,
    caseSensitive: false,
    scanDepth: 5,
    constantActive: false,
    injectDepth: 4,
    ...overrides,
  };
}

/** 世界书（容器） */
export interface Lorebook {
  id: string;
  /** 名称 */
  name: string;
  /** 简介 */
  description: string;
  /** 书封图片（base64 data URL，可选） */
  cover?: string;
  /** 启用/禁用（整体开关） */
  enabled: boolean;
  /** 条目列表 */
  entries: LorebookEntry[];
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间戳 */
  updatedAt: number;
}

/** 创建新世界书的默认值 */
export function createDefaultLorebook(overrides?: Partial<Lorebook>): Lorebook {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    enabled: true,
    entries: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}
