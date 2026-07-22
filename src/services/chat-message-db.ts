/**
 * 聊天消息数据库接口 —— 窗口化聊天的数据层
 *
 * 所有消息查询直接走 SQLite messages 表。
 * PersistedData blob 仍保留用于备份/WebDAV，消息写入时双写。
 */
import { querySql, runSql, runSqlNoSave, runInTransaction } from '../services/sqlite/index';
import type { Message, MessagePart, ToolCall } from '../apps/chat/types';
import type { SqlValue } from 'sql.js';

// ─── 行 ↔ Message 转换 ─────────────────────────────

function rowToMessage(row: Record<string, unknown>): Message {
  const tc = safeJsonParse<ToolCall[]>((row.tool_calls as string) || '[]', []);
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    role: row.role as Message['role'],
    content: (row.content as string) || '',
    parts: safeJsonParse<MessagePart[]>((row.parts as string) || '[]', []),
    reasoning: (row.reasoning as string) || undefined,
    toolCalls: tc.length > 0 ? tc : undefined,
    toolCallId: (row.tool_call_id as string) || undefined,
    timestamp: row.timestamp as number,
    status: (row.status as Message['status']) || 'sent',
    memoryExtracted: (row.memory_extracted as number) === 1 ? true : undefined,
    tokenCount: (row.token_prompt != null || row.token_completion != null)
      ? { prompt: (row.token_prompt as number) ?? 0, completion: (row.token_completion as number) ?? 0, cached: (row.token_cached as number) ?? 0 }
      : undefined,
  };
}

function messageToParams(msg: Message): SqlValue[] {
  return [
    msg.id, msg.conversationId, msg.role, msg.content,
    JSON.stringify(msg.parts || []),
    msg.reasoning || '', JSON.stringify(msg.toolCalls || []), msg.toolCallId || '',
    msg.timestamp, msg.status, msg.memoryExtracted ? 1 : 0,
    msg.tokenCount?.prompt ?? null, msg.tokenCount?.completion ?? null, msg.tokenCount?.cached ?? null,
  ];
}

function safeJsonParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json); } catch { return fallback; }
}

// ─── 分页查询 ──────────────────────────────────────

/** 获取指定会话的窗口消息 */
export async function getWindowMessages(
  conversationId: string, offset: number, limit: number
): Promise<{ items: Message[]; total: number }> {
  const cnt = querySql('SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?', [conversationId]);
  const total = (cnt[0]?.cnt as number) || 0;
  const rows = querySql(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?',
    [conversationId, limit, Math.max(0, offset)]
  );
  return { items: rows.map(rowToMessage), total };
}

/** 获取最近 N 条消息（LLM 上下文用） */
export async function getRecentMessages(conversationId: string, limit: number): Promise<Message[]> {
  const rows = querySql(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT ?',
    [conversationId, limit]
  );
  return rows.map(rowToMessage).reverse();
}

/** 获取消息总数 */
export async function getMessageCount(conversationId: string): Promise<number> {
  const r = querySql('SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?', [conversationId]);
  return (r[0]?.cnt as number) || 0;
}

// ─── 搜索 ──────────────────────────────────────────

/** 搜索当前对话（不含 tool 消息） */
export async function searchConversationMessages(
  conversationId: string, query: string
): Promise<Message[]> {
  const rows = querySql(
    `SELECT * FROM messages WHERE conversation_id = ? AND role != 'tool' AND content LIKE ? COLLATE NOCASE ORDER BY timestamp ASC`,
    [conversationId, `%${query}%`]
  );
  return rows.map(rowToMessage);
}

/** 全局搜索（跨所有对话），结果不含对话标题——调用方自行补齐 */
export async function searchAllMessages(query: string, limit = 50): Promise<Message[]> {
  const rows = querySql(
    `SELECT * FROM messages WHERE role != 'tool' AND content LIKE ? COLLATE NOCASE ORDER BY timestamp DESC LIMIT ?`,
    [`%${query}%`, limit]
  );
  return rows.map(rowToMessage);
}

// ─── 写入 ──────────────────────────────────────────

const INSERT_SQL = `INSERT OR REPLACE INTO messages (id, conversation_id, role, content, parts, reasoning, tool_calls, tool_call_id, timestamp, status, memory_extracted, token_prompt, token_completion, token_cached) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** 插入单条 */
export async function insertMessage(msg: Message): Promise<void> {
  runSql(INSERT_SQL, messageToParams(msg));
}

/** 批量插入（事务） */
export async function insertMessages(msgs: Message[]): Promise<void> {
  if (msgs.length === 0) return;
  runInTransaction(() => {
    for (const m of msgs) runSqlNoSave(INSERT_SQL, messageToParams(m));
  });
}

/** 更新消息字段 */
export async function updateMessage(msgId: string, updates: Partial<Message>): Promise<void> {
  const rows = querySql('SELECT * FROM messages WHERE id = ?', [msgId]);
  if (rows.length === 0) return;
  const merged = { ...rowToMessage(rows[0]), ...updates };
  await insertMessage(merged);
}

/** 删除单条 */
export async function deleteMessage(msgId: string): Promise<void> {
  runSql('DELETE FROM messages WHERE id = ?', [msgId]);
}

/** 删除整个对话的消息 */
export async function deleteConversationMessages(conversationId: string): Promise<void> {
  runSql('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
}

// ─── 迁移 ──────────────────────────────────────────

/** 从 PersistedData blob 迁移到 messages 表 */
export async function migrateFromBlob(data: { messages: Record<string, Message[]> }): Promise<void> {
  const all: Message[] = [];
  for (const msgs of Object.values(data.messages)) all.push(...msgs);
  if (all.length === 0) return;
  await insertMessages(all);
  console.log(`[chat-message-db] migrated ${all.length} messages from blob`);
}

/** 是否已有消息数据（用于判断是否需要迁移） */
export async function hasMessageData(): Promise<boolean> {
  const r = querySql('SELECT COUNT(*) as cnt FROM messages', []);
  return ((r[0]?.cnt as number) || 0) > 0;
}
