import { useState, useCallback } from 'react';
import { Plugs, Plus, CaretLeft, ArrowsClockwise, PencilSimple, Trash, CheckCircle, XCircle, Warning } from '@phosphor-icons/react';
import { useSettingsStore } from '../../../store/settings-store';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { MCPServer, MCPDiscoveredTool } from '../types';
import MCPServerForm, { type MCPServerFormData } from '../components/MCPServerForm';

interface Props {
  onBack: () => void;
}

/* ───── 状态指示灯 ───── */
function StatusDot({ status }: { status: MCPServer['status'] }) {
  const colors: Record<MCPServer['status'], string> = {
    stopped: '#aaa',
    connecting: '#f0ad4e',
    connected: '#27ae60',
    error: '#e74c3c',
  };
  return (
    <span
      className="mcp-status-dot"
      style={{ backgroundColor: colors[status] }}
      title={
        status === 'stopped' ? '已停止' :
        status === 'connecting' ? '连接中' :
        status === 'connected' ? '已连接' : '错误'
      }
    />
  );
}

/* ───── MCP 连通性测试（使用 @modelcontextprotocol/sdk） ───── */
async function testMCPConnection(server: MCPServer): Promise<{ ok: boolean; error?: string; latency?: number }> {
  const start = Date.now();
  try {
    const { connectToServer } = await import('../../../services/mcp-client/index');
    const status = await connectToServer(server);
    const latency = Date.now() - start;
    if (status.state === 'connected') return { ok: true, latency };
    return { ok: false, error: status.error || '连接失败', latency };
  } catch (err) {
    return { ok: false, error: (err as Error).message, latency: Date.now() - start };
  }
}

/* ───── 发现 MCP 工具（SDK listTools） ───── */
async function discoverMCPTools(server: MCPServer): Promise<MCPDiscoveredTool[]> {
  try {
    const { connectToServer, getDiscoveredTools } = await import('../../../services/mcp-client/index');
    const status = await connectToServer(server);
    if (status.state !== 'connected') return [];
    // 保留已有的 enabled/needsApproval 设置，新工具默认启用
    const existingMap = new Map((server.discoveredTools || []).map((t) => [t.name, t]));
    return (getDiscoveredTools(server.id) || []).map((t: Tool) => {
      const existing = existingMap.get(t.name);
      return {
        name: t.name,
        description: (t as any).description || '',
        inputSchema: (t as any).inputSchema || {},
        enabled: existing?.enabled ?? true,
        needsApproval: existing?.needsApproval ?? false,
      };
    });
  } catch {
    return [];
  }
}

/* ───── 主页面 ───── */
export default function MCPSettingsPage({ onBack }: Props) {
  const mcpServers = useSettingsStore((s) => s.mcpServers);
  const addMCPServer = useSettingsStore((s) => s.addMCPServer);
  const updateMCPServer = useSettingsStore((s) => s.updateMCPServer);
  const removeMCPServer = useSettingsStore((s) => s.removeMCPServer);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; error?: string; latency?: number }>>({});

  const handleAdd = () => { setEditId(null); setShowForm(true); };
  const handleEdit = (id: string) => { setEditId(id); setShowForm(true); };

  const handleFormConfirm = (data: MCPServerFormData) => {
    if (editId) {
      updateMCPServer(editId, { ...data, status: 'stopped' });
    } else {
      addMCPServer({
        id: crypto.randomUUID(),
        ...data,
        enabled: false,
        status: 'stopped',
        discoveredTools: [],
      });
    }
    setShowForm(false);
    setEditId(null);
  };

  const handleFormCancel = () => { setShowForm(false); setEditId(null); };

  // 启停切换 → 启动时自动测试连接 + 发现工具
  const handleToggle = useCallback(async (server: MCPServer) => {
    if (server.enabled) {
      updateMCPServer(server.id, { enabled: false, status: 'stopped' });
      import('../../../services/mcp-client/index').then((mod) => mod.disconnectFromServer(server.id));
    } else {
      updateMCPServer(server.id, { enabled: true, status: 'connecting' });
      const conn = await testMCPConnection(server);
      if (conn.ok) {
        const tools = await discoverMCPTools(server);
        updateMCPServer(server.id, { status: 'connected', discoveredTools: tools });
      } else {
        updateMCPServer(server.id, { status: 'error', lastError: conn.error });
      }
    }
  }, [updateMCPServer]);

  // 连通性测试 → 也同步发现工具
  const handleTest = useCallback(async (server: MCPServer) => {
    setTestingId(server.id);
    setTestResult((prev) => ({ ...prev, [server.id]: undefined as any }));
    updateMCPServer(server.id, { status: 'connecting' });
    const conn = await testMCPConnection(server);
    if (conn.ok) {
      const tools = await discoverMCPTools(server);
      updateMCPServer(server.id, { status: 'connected', discoveredTools: tools });
      setTestResult((prev) => ({ ...prev, [server.id]: { ...conn, toolCount: tools.length } }));
    } else {
      updateMCPServer(server.id, { status: 'error', lastError: conn.error });
      setTestResult((prev) => ({ ...prev, [server.id]: conn }));
    }
    setTestingId(null);
  }, [updateMCPServer]);

  // 工具启用切换
  const handleToolToggle = useCallback((serverId: string, toolName: string, enabled: boolean) => {
    const server = mcpServers.find((s) => s.id === serverId);
    if (!server) return;
    const updated = (server.discoveredTools ?? []).map((t) =>
      t.name === toolName ? { ...t, enabled } : t
    );
    updateMCPServer(serverId, { discoveredTools: updated });
  }, [mcpServers, updateMCPServer]);

  // 工具审批切换
  const handleApprovalToggle = useCallback((serverId: string, toolName: string, needsApproval: boolean) => {
    const server = mcpServers.find((s) => s.id === serverId);
    if (!server) return;
    const updated = (server.discoveredTools ?? []).map((t) =>
      t.name === toolName ? { ...t, needsApproval } : t
    );
    updateMCPServer(serverId, { discoveredTools: updated });
  }, [mcpServers, updateMCPServer]);

  const handleDelete = useCallback((id: string) => {
    if (window.confirm('确定要删除此 MCP 服务器？')) {
      import('../../../services/mcp-client/index').then((mod) => mod.disconnectFromServer(id));
      removeMCPServer(id);
    }
  }, [removeMCPServer]);

  // 表单模式
  if (showForm) {
    const editing = editId ? mcpServers.find((s) => s.id === editId) : undefined;
    return <MCPServerForm initial={editing} onConfirm={handleFormConfirm} onCancel={handleFormCancel} />;
  }

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <button className="back-btn" onClick={onBack}><CaretLeft size={18} /></button>
        <h1>MCP 服务器配置</h1>
        <button className="settings-header-btn" onClick={handleAdd} title="添加服务器">
          <Plus size={22} weight="bold" />
        </button>
      </div>

      <div className="settings-page__body">
        <p className="settings-section__desc">管理 MCP 服务器。启动后将自动发现可用工具，每个工具可单独启用和设置是否需要审批。</p>

        {mcpServers.length === 0 ? (
          <div className="settings-empty">
            <Plugs size={48} className="settings-empty__icon" />
            <p className="settings-empty__text">暂无 MCP 服务器</p>
            <p className="settings-empty__hint">点击右上角 + 添加</p>
          </div>
        ) : (
          <div className="settings-cards">
            {mcpServers.map((server) => (
              <div key={server.id} className="mcp-card">
                {/* 头部 */}
                <div className="mcp-card__header">
                  <div className="mcp-card__title-row">
                    <StatusDot status={server.status} />
                    <span className="mcp-card__name">{server.name}</span>
                    <span className="mcp-card__protocol">{server.protocol === 'sse' ? 'SSE' : 'HTTP'}</span>
                  </div>
                  <label className={`settings-toggle${server.enabled ? ' settings-toggle--on' : ''}`} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={server.enabled} onChange={() => handleToggle(server)} className="settings-toggle__input" />
                    <span className="settings-toggle__slider" />
                  </label>
                </div>

                <div className="mcp-card__url" title={server.url}>{server.url}</div>

                {/* 操作按钮 */}
                <div className="mcp-card__actions">
                  <button className="mcp-card__btn" onClick={() => handleTest(server)} disabled={testingId === server.id}>
                    {testingId === server.id ? '测试中…' : <><ArrowsClockwise size={18} /> 测试连接</>}
                  </button>
                  <button className="mcp-card__btn" onClick={() => handleEdit(server.id)}><PencilSimple size={18} /> 编辑</button>
                  <button className="mcp-card__btn mcp-card__btn--danger" onClick={() => handleDelete(server.id)}><Trash size={18} /> 删除</button>
                </div>

                {/* 测试结果 */}
                {testResult[server.id] && (
                  <div className={`mcp-card__result ${testResult[server.id].ok ? 'mcp-card__result--ok' : 'mcp-card__result--err'}`}>
                    {testResult[server.id].ok
                      ? <><CheckCircle size={18} weight="fill" /> 连接成功 ({testResult[server.id].latency}ms){(testResult[server.id] as any).toolCount ? ` | 发现 ${(testResult[server.id] as any).toolCount} 个工具` : ''}</>
                      : <><XCircle size={18} weight="fill" /> {testResult[server.id].error}</>}
                  </div>
                )}

                {/* 错误信息 */}
                {server.status === 'error' && server.lastError && (
                  <div className="mcp-card__result mcp-card__result--err"><Warning size={18} weight="fill" /> {server.lastError}</div>
                )}

                {/* 已发现的工具列表 */}
                {server.discoveredTools?.length > 0 && (
                  <div className="mcp-tools">
                    <div className="mcp-tools__title">已发现工具 ({server.discoveredTools?.length ?? 0})</div>
                    {(server.discoveredTools ?? []).map((tool) => (
                      <div key={tool.name} className="mcp-tool-row">
                        <div className="mcp-tool-row__info">
                          <span className="mcp-tool-row__name">{tool.name}</span>
                          <span className="mcp-tool-row__desc">{tool.description || '无描述'}</span>
                        </div>
                        <div className="mcp-tool-row__switches">
                          <label className="mcp-tool-row__switch" title="启用">
                            <input type="checkbox" checked={tool.enabled} onChange={(e) => handleToolToggle(server.id, tool.name, e.currentTarget.checked)} />
                            <span>启用</span>
                          </label>
                          <label className="mcp-tool-row__switch" title="需要审批">
                            <input type="checkbox" checked={tool.needsApproval} onChange={(e) => handleApprovalToggle(server.id, tool.name, e.currentTarget.checked)} />
                            <span>审批</span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-page__footer">
        <button className="theme-btn" onClick={onBack}>确认</button>
        <button className="theme-btn theme-btn--cancel" onClick={onBack}>取消</button>
      </div>
    </div>
  );
}
