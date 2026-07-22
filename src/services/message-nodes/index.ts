/**
 * message-nodes — MessageNode 工具函数
 *
 * 在 flat Message[] 和 MessageNode[] 之间转换，管理分支选择。
 */
import type { Message, MessageNode } from '../../apps/chat/types';

/** 将 flat 消息数组转换为 MessageNode 数组 */
export function messagesToNodes(messages: Message[]): MessageNode[] {
  const now = Date.now();
  // 按 nodeId 分组（有 nodeId 的按 nodeId，没有的各自成节点）
  const groups = new Map<string, Message[]>();
  for (const m of messages) {
    const nodeId = m.nodeId || `legacy-${m.id}`;
    const list = groups.get(nodeId) || [];
    list.push(m);
    groups.set(nodeId, list);
  }

  const nodes: MessageNode[] = [];
  for (const [nodeId, msgs] of groups) {
    const sorted = [...msgs].sort((a, b) => a.timestamp - b.timestamp);
    const role = sorted[sorted.length - 1]?.role || 'user';
    nodes.push({
      id: nodeId,
      conversationId: sorted[0]?.conversationId || '',
      role: role as MessageNode['role'],
      messages: sorted,
      selectedIndex: sorted.length - 1, // 默认选中最新的分支
      createdAt: sorted[0]?.timestamp || now,
    });
  }
  return nodes.sort((a, b) => a.createdAt - b.createdAt);
}

/** 从 MessageNode[] 中提取当前选中的消息（flat 数组），附带分支信息 */
export function getCurrentMessages(nodes: MessageNode[]): Message[] {
  return nodes.map((n) => {
    const msg = n.messages[n.selectedIndex];
    if (!msg) return null;
    // 添加分支 UI 所需字段（对齐旧的 getVisibleMessages 行为）
    (msg as Message).branchNodeId = n.id;
    (msg as Message).branchIndex = n.selectedIndex;
    (msg as Message).branchTotal = n.messages.length;
    return msg;
  }).filter(Boolean) as Message[];
}

/** 从 MessageNode[] 中提取所有消息（含所有分支，flat） */
export function getAllMessages(nodes: MessageNode[]): Message[] {
  return nodes.flatMap((n) => n.messages);
}

/** 切换指定节点的分支选择 */
export function selectBranch(nodes: MessageNode[], nodeId: string, newIndex: number): MessageNode[] {
  return nodes.map((n) =>
    n.id === nodeId
      ? { ...n, selectedIndex: Math.max(0, Math.min(newIndex, n.messages.length - 1)) }
      : n
  );
}

/** 向指定节点添加新分支消息 */
export function addBranchMessage(nodes: MessageNode[], nodeId: string, msg: Message): MessageNode[] {
  return nodes.map((n) =>
    n.id === nodeId
      ? { ...n, messages: [...n.messages, msg], selectedIndex: n.messages.length }
      : n
  );
}

/** 向末尾追加新节点 */
export function addNode(nodes: MessageNode[], msg: Message): MessageNode[] {
  const nodeId = msg.nodeId || `node-${msg.id}`;
  return [
    ...nodes,
    {
      id: nodeId,
      conversationId: msg.conversationId,
      role: msg.role,
      messages: [msg],
      selectedIndex: 0,
      createdAt: msg.timestamp || Date.now(),
    },
  ];
}

/** 更新节点中指定消息的内容（用于编辑，自动创建新分支） */
export function editMessageInNode(nodes: MessageNode[], msgId: string, newContent: Partial<Message>): MessageNode[] {
  return nodes.map((n) => {
    const idx = n.messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return n;
    // 创建新分支消息（保留原消息 ID 但更新内容，追加到末尾）
    const original = n.messages[idx];
    const branchMsg: Message = {
      ...original,
      ...newContent,
      id: `${original.id}-branch-${n.messages.length}`,
      timestamp: Date.now(),
      nodeId: n.id,
    };
    return {
      ...n,
      messages: [...n.messages, branchMsg],
      selectedIndex: n.messages.length, // 自动切换到新分支
    };
  });
}
