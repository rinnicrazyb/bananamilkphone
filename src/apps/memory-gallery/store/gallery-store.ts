import { create } from 'zustand';
import type { GalleryRoom, GalleryNode, GalleryAlias, GalleryTrigger, GallerySnapshot, GalleryState } from '../types';
import { DEFAULT_DOMAIN } from '../types';
import * as db from './gallery-db';

interface GalleryActions {
  // 房间
  loadRooms: () => Promise<void>;
  addRoom: (room: GalleryRoom) => void;
  updateRoom: (id: string, data: Partial<GalleryRoom>) => void;
  deleteRoom: (id: string) => Promise<void>;
  setCurrentRoomId: (id: string | null) => void;

  // 节点
  loadNodes: (roomId: string) => Promise<void>;
  addNode: (node: GalleryNode) => void;
  updateNode: (id: string, data: Partial<GalleryNode>) => void;
  deleteNode: (id: string) => Promise<void>;

  // 别名
  addAlias: (alias: GalleryAlias) => void;
  removeAlias: (id: string) => void;

  // 触发器
  addTrigger: (trigger: GalleryTrigger) => void;
  removeTrigger: (id: string) => void;

  // 快照
  loadSnapshots: (roomId: string) => Promise<void>;
  addSnapshot: (snapshot: GallerySnapshot) => void;
  updateSnapshot: (id: string, integrated: number) => void;

  // Domain
  setSelectedDomain: (domain: string) => void;
}

type GalleryStore = GalleryState & GalleryActions;

const initialState: GalleryState = {
  rooms: [],
  currentRoomId: null,
  nodes: [],
  aliases: [],
  triggers: [],
  snapshots: [],
  selectedDomain: DEFAULT_DOMAIN,
};

export const useGalleryStore = create<GalleryStore>((set) => ({
  ...initialState,

  // ── 房间 ──
  loadRooms: async () => {
    await db.initGalleryTables();
    const rooms = await db.loadRooms();
    set({ rooms });
  },

  addRoom: (room) => {
    db.saveRoom(room).catch((e) => console.warn('[gallery] save room failed:', e));
    set((s) => ({ rooms: [...s.rooms, room] }));
  },

  updateRoom: (id, data) => {
    db.updateRoom(id, { ...data, updatedAt: Date.now() }).catch((e) => console.warn('[gallery] update room failed:', e));
    set((s) => ({
      rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...data, updatedAt: Date.now() } : r)),
    }));
  },

  deleteRoom: async (id) => {
    await db.deleteRoomCascade(id);
    set((s) => ({
      rooms: s.rooms.filter((r) => r.id !== id),
      currentRoomId: s.currentRoomId === id ? null : s.currentRoomId,
      nodes: s.nodes.filter((n) => n.roomId !== id),
      snapshots: s.snapshots.filter((sn) => sn.roomId !== id),
      aliases: s.aliases.filter((a) => a.nodeId && !s.nodes.find((n) => n.id === a.nodeId)),
    }));
  },

  setCurrentRoomId: (id) => set({ currentRoomId: id }),

  // ── 节点 ──
  loadNodes: async (roomId) => {
    const nodes = await db.loadNodes(roomId);
    set({ nodes });
  },

  addNode: (node) =>
    set((s) => ({ nodes: [...s.nodes, node] })),

  updateNode: (id, data) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...data, updatedAt: Date.now() } : n)),
    })),

  deleteNode: async (id) => {
    await db.deleteNodeCascade(id);
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      aliases: s.aliases.filter((a) => a.nodeId !== id),
      triggers: s.triggers.filter((t) => t.nodeId !== id),
    }));
  },

  // ── 别名 ──
  addAlias: (alias) => set((s) => ({ aliases: [...s.aliases, alias] })),
  removeAlias: (id) => set((s) => ({ aliases: s.aliases.filter((a) => a.id !== id) })),

  // ── 触发器 ──
  addTrigger: (trigger) => set((s) => ({ triggers: [...s.triggers, trigger] })),
  removeTrigger: (id) => set((s) => ({ triggers: s.triggers.filter((t) => t.id !== id) })),

  // ── 快照 ──
  loadSnapshots: async (roomId) => {
    const snapshots = await db.loadSnapshots(roomId);
    set({ snapshots });
  },

  addSnapshot: (snapshot) =>
    set((s) => ({ snapshots: [...s.snapshots, snapshot] })),

  updateSnapshot: (id, integrated) =>
    set((s) => ({
      snapshots: s.snapshots.map((sn) => (sn.id === id ? { ...sn, integrated } : sn)),
    })),

  // ── Domain ──
  setSelectedDomain: (domain) => set({ selectedDomain: domain }),
}));
