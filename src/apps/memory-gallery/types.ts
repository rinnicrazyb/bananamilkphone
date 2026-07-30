/** 记忆游廊——房间 */
export interface GalleryRoom {
  id: string;
  name: string;          // 自动用智能体名称，unbound 时为 "新房间"
  agentId: string | null; // 绑定的智能体 ID，null = 未绑定
  createdAt: number;
  updatedAt: number;
}

/** 记忆节点——树状结构的一节点 */
export interface GalleryNode {
  id: string;
  roomId: string;
  parentId: string | null;   // null = 根级节点
  domain: string;            // core / writer / game / notes / narrative
  path: string;              // 路径名称，可以是中文
  content: string;
  priority: number;          // 0=最高，越大越低
  disclosure: string;        // AI 触发条件
  title: string;             // 英文标题（AI 友好，可选）
  createdAt: number;
  updatedAt: number;
}

/** 别名——同一节点可从多条路径访问 */
export interface GalleryAlias {
  id: string;
  nodeId: string;
  domain: string;
  path: string;
  priority: number;
  disclosure: string;
}

/** 关键词触发 */
export interface GalleryTrigger {
  id: string;
  nodeId: string;
  keyword: string;
}

/** 快照——用于审批审计 */
export interface GallerySnapshot {
  id: string;
  roomId: string;
  nodeId: string | null;    // null = 全局操作
  action: 'created' | 'modified' | 'deleted';
  beforeContent: string;
  afterContent: string;
  beforeMeta: string;        // JSON
  afterMeta: string;         // JSON
  createdAt: number;
  integrated: number;        // 0=pending, 1=accepted, -1=rejected
}

/** 记忆游廊的状态 */
export interface GalleryState {
  rooms: GalleryRoom[];
  currentRoomId: string | null;
  nodes: GalleryNode[];
  aliases: GalleryAlias[];
  triggers: GalleryTrigger[];
  snapshots: GallerySnapshot[];
  selectedDomain: string;
}

/** 有效的 domain 列表（与 Nocturne Memory 一致） */
export const VALID_DOMAINS = ['core', 'writer', 'game', 'notes', 'narrative'];

/** 默认 domain */
export const DEFAULT_DOMAIN = 'core';
