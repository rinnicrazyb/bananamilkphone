/**
 * 记忆游廊 —— SQLite 数据层
 *
 * 使用 sql.js 底层 API（runSql / querySql），
 * 在同一个 SQLite 数据库中创建独立的 gallery 表。
 */
import { initDatabase, runSql, querySql, runInTransaction } from '../../../services/sqlite/index';
import type { SqlValue } from 'sql.js';
import type { GalleryRoom, GalleryNode, GallerySnapshot } from '../types';

// ─── 工具：snake_case → camelCase ──────────────────

function mapRoom(row: Record<string, unknown>): GalleryRoom {
  return {
    id: row.id as string,
    name: row.name as string,
    agentId: row.agent_id as string | null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function mapNode(row: Record<string, unknown>): GalleryNode {
  return {
    id: row.id as string,
    roomId: row.room_id as string,
    parentId: row.parent_id as string | null,
    domain: row.domain as string,
    path: row.path as string,
    content: row.content as string,
    priority: row.priority as number,
    disclosure: row.disclosure as string,
    title: row.title as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function mapSnapshot(row: Record<string, unknown>): GallerySnapshot {
  return {
    id: row.id as string,
    roomId: row.room_id as string,
    nodeId: row.node_id as string | null,
    action: row.action as 'created' | 'modified' | 'deleted',
    beforeContent: row.before_content as string,
    afterContent: row.after_content as string,
    beforeMeta: row.before_meta as string,
    afterMeta: row.after_meta as string,
    createdAt: row.created_at as number,
    integrated: row.integrated as number,
  };
}

// ─── 建表 ──────────────────────────────────────────

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS gallery_rooms (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    agent_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS gallery_nodes (
    id TEXT PRIMARY KEY NOT NULL,
    room_id TEXT NOT NULL,
    parent_id TEXT,
    domain TEXT NOT NULL DEFAULT 'core',
    path TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    priority INTEGER NOT NULL DEFAULT 2,
    disclosure TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES gallery_rooms(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gallery_nodes_room ON gallery_nodes(room_id)`,
  `CREATE TABLE IF NOT EXISTS gallery_aliases (
    id TEXT PRIMARY KEY NOT NULL,
    node_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    path TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 2,
    disclosure TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (node_id) REFERENCES gallery_nodes(id)
  )`,
  `CREATE TABLE IF NOT EXISTS gallery_triggers (
    id TEXT PRIMARY KEY NOT NULL,
    node_id TEXT NOT NULL,
    keyword TEXT NOT NULL,
    FOREIGN KEY (node_id) REFERENCES gallery_nodes(id)
  )`,
  `CREATE TABLE IF NOT EXISTS gallery_snapshots (
    id TEXT PRIMARY KEY NOT NULL,
    room_id TEXT NOT NULL,
    node_id TEXT,
    action TEXT NOT NULL,
    before_content TEXT NOT NULL DEFAULT '',
    after_content TEXT NOT NULL DEFAULT '',
    before_meta TEXT NOT NULL DEFAULT '{}',
    after_meta TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    integrated INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (room_id) REFERENCES gallery_rooms(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gallery_snapshots_room ON gallery_snapshots(room_id)`,
];

/** 初始化 gallery 表 */
export async function initGalleryTables(): Promise<void> {
  await initDatabase();
  for (const sql of CREATE_TABLES) {
    runSql(sql);
  }
}

// ─── 房间 CRUD ────────────────────────────────────

export async function loadRooms(): Promise<GalleryRoom[]> {
  const rows = querySql('SELECT * FROM gallery_rooms ORDER BY created_at DESC');
  return rows.map(mapRoom);
}

export async function saveRoom(room: GalleryRoom): Promise<void> {
  runSql(
    `INSERT OR REPLACE INTO gallery_rooms (id, name, agent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [room.id, room.name, room.agentId, room.createdAt, room.updatedAt]
  );
}

export async function updateRoom(id: string, data: Partial<GalleryRoom>): Promise<void> {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name); }
  if (data.agentId !== undefined) { sets.push('agent_id = ?'); params.push(data.agentId); }
  if (data.updatedAt !== undefined) { sets.push('updated_at = ?'); params.push(data.updatedAt); }
  if (sets.length === 0) return;
  params.push(id);
  runSql(`UPDATE gallery_rooms SET ${sets.join(', ')} WHERE id = ?`, params);
}

/** 级联删除房间（删房间 + 其所有节点/别名/触发器/快照） */
export async function deleteRoomCascade(roomId: string): Promise<void> {
  runInTransaction(() => {
    runSql('DELETE FROM gallery_triggers WHERE node_id IN (SELECT id FROM gallery_nodes WHERE room_id = ?)', [roomId]);
    runSql('DELETE FROM gallery_aliases WHERE node_id IN (SELECT id FROM gallery_nodes WHERE room_id = ?)', [roomId]);
    runSql('DELETE FROM gallery_nodes WHERE room_id = ?', [roomId]);
    runSql('DELETE FROM gallery_snapshots WHERE room_id = ?', [roomId]);
    runSql('DELETE FROM gallery_rooms WHERE id = ?', [roomId]);
  });
}

// ─── 节点 CRUD ────────────────────────────────────

export async function loadNodes(roomId: string): Promise<GalleryNode[]> {
  const rows = querySql('SELECT * FROM gallery_nodes WHERE room_id = ? ORDER BY domain, path', [roomId]);
  return rows.map(mapNode);
}

export async function saveNode(node: GalleryNode): Promise<void> {
  runSql(
    `INSERT OR REPLACE INTO gallery_nodes (id, room_id, parent_id, domain, path, content, priority, disclosure, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [node.id, node.roomId, node.parentId, node.domain, node.path, node.content, node.priority, node.disclosure, node.title, node.createdAt, node.updatedAt]
  );
}

export async function deleteNodeCascade(nodeId: string): Promise<void> {
  runInTransaction(() => {
    runSql('DELETE FROM gallery_triggers WHERE node_id = ?', [nodeId]);
    runSql('DELETE FROM gallery_aliases WHERE node_id = ?', [nodeId]);
    runSql('DELETE FROM gallery_nodes WHERE id = ?', [nodeId]);
  });
}

// ─── 快照 ──────────────────────────────────────────

export async function loadSnapshots(roomId: string): Promise<GallerySnapshot[]> {
  const rows = querySql('SELECT * FROM gallery_snapshots WHERE room_id = ? ORDER BY created_at DESC', [roomId]);
  return rows.map(mapSnapshot);
}

export async function saveSnapshot(snapshot: GallerySnapshot): Promise<void> {
  runSql(
    `INSERT INTO gallery_snapshots (id, room_id, node_id, action, before_content, after_content, before_meta, after_meta, created_at, integrated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [snapshot.id, snapshot.roomId, snapshot.nodeId, snapshot.action, snapshot.beforeContent, snapshot.afterContent, snapshot.beforeMeta, snapshot.afterMeta, snapshot.createdAt, snapshot.integrated]
  );
}

export async function updateSnapshot(id: string, integrated: number): Promise<void> {
  runSql('UPDATE gallery_snapshots SET integrated = ? WHERE id = ?', [integrated, id]);
}
