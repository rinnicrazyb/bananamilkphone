# 世界书 APP — 开发规格文档

> 来源：LEARN_RikkaHub_Lorebook_System.md 技术学习 + grill-me 访谈确认（2026-07-16）
> 技术设计完全仿照 RikkaHub，UI 上做书架书封美化

---

## 一、数据模型

### 1.1 Lorebook（世界书）

```typescript
interface Lorebook {
  id: string;                    // UUID
  name: string;                  // 名称
  description: string;           // 简介
  cover?: string;                // 书封图片（base64/URL，可选）
  enabled: boolean;              // 启用/禁用（整体开关）
  entries: LorebookEntry[];      // 条目列表
  createdAt: number;             // 创建时间
  updatedAt: number;             // 更新时间
}
```

### 1.2 LorebookEntry（条目 = 一条注入规则）

```typescript
interface LorebookEntry {
  id: string;                    // UUID
  name: string;                  // 条目名称
  enabled: boolean;              // 启用/禁用
  priority: number;              // 优先级（1-100），数值越高注入越靠前
  position: InjectionPosition;   // 注入位置（5种）
  content: string;               // 注入到 LLM 的提示词内容
  role: 'user' | 'assistant';   // 注入角色（仅 TOP_OF_CHAT/BOTTOM_OF_CHAT/AT_DEPTH 有效）
  keywords: string[];           // 触发关键词列表
  useRegex: boolean;             // 是否使用正则表达式匹配
  caseSensitive: boolean;        // 是否大小写敏感
  scanDepth: number;             // 扫描最近 N 条消息（默认 5）
  constantActive: boolean;       // 常驻激活（无需关键词匹配，始终注入）
  injectDepth?: number;          // AT_DEPTH 时：从最新消息往前数的深度（默认 4）
}
```

### 1.3 InjectionPosition（5 种注入位置）

| 值 | 说明 | 效果 |
|----|------|------|
| `BEFORE_SYSTEM_PROMPT` | 系统提示词前 | 追加到 system message 开头（合并到系统提示词） |
| `AFTER_SYSTEM_PROMPT` | 系统提示词后 | 追加到 system message 末尾（合并到系统提示词） |
| `TOP_OF_CHAT` | 对话开头 | 在第一条用户消息前插入独立消息（角色=role） |
| `BOTTOM_OF_CHAT` | 最新消息前 | 在最后一条消息前插入独立消息（角色=role） |
| `AT_DEPTH` | 指定深度 | 从最新消息往前数 injectDepth 条位置插入独立消息（角色=role） |

### 1.4 Agent（智能体）扩展

在 `Agent` 接口中添加：
```typescript
interface Agent {
  // ... 已有字段
  lorebookIds: string[];  // 绑定的世界书 ID 列表
}
```

### 1.5 TransformerContext 扩展

在 `TransformerContext` 中添加：
```typescript
interface TransformerContext {
  // ... 已有字段
  lorebooks: Lorebook[];  // 当前智能体绑定的世界书列表（已包含 entries）
}
```

---

## 二、注入机制（完全仿照 RikkaHub）

### 2.1 触发流程

```
发送消息前
  ↓
promptInjectionTransformer.transform(messages, ctx)
  ↓
1. collectInjections()
   ├── 从 ctx.lorebooks 获取绑定的世界书
   ├── 对每个启用且绑定的世界书，遍历其启用条目
   │   ├── constantActive = true → 直接加入注入列表
   │   └── 否则：
   │       ├── 从 messages 中提取非 SYSTEM 消息
   │       ├── 取最近 scanDepth 条消息拼接为上下文文本
   │       ├── 对每条关键词执行匹配（正则/普通，区分大小写）
   │       └── 匹配成功 → 加入注入列表
   └── 返回注入列表

2. 按 position 分组，组内按 priority 降序排序，优先级相同按列表顺序

3. applyInjections()
   ├── BEFORE_SYSTEM_PROMPT：内容拼接到 system message 开头
   ├── AFTER_SYSTEM_PROMPT：内容拼接到 system message 末尾
   ├── TOP_OF_CHAT：在第一条 user 消息前插入独立消息
   ├── BOTTOM_OF_CHAT：在最后一条消息前插入独立消息
   ├── AT_DEPTH：在 result.length - depth 位置插入独立消息
   └── 注意 findSafeInsertIndex（不插入 USER→ASSISTANT(tool) 之间）
```

### 2.2 注入位置的两类行为

**修改系统提示词（BEFORE / AFTER）**：
- 内容直接合并到 system message 的文本中
- 不产生新消息，LLM 看到的是一条完整的系统提示词
- `role` 字段在此模式下不起作用

**插入独立消息（TOP / BOTTOM / AT_DEPTH）**：
- 产生一条新消息，角色由 `role` 字段决定（USER 或 ASSISTANT）
- 多条同位置同角色的注入合并为一条消息

### 2.3 优先级处理

- 同一位置的多个条目按 `priority` 降序排列
- 优先级相同则按在 entries 列表中的顺序
- 系统提示词模式（BEFORE/AFTER）：用 `\n` 拼接所有内容
- 独立消息模式（TOP/BOTTOM/AT_DEPTH）：按 role 分组后，组内用 `\n` 拼接

---

## 三、UI 设计

### 3.1 书架（世界书列表页）

- **布局**：4×6 网格中一行摆 2 本书，类真实书架
- **每本书卡片**：书封图片（若无则默认封面）+ 书名 + 简介（一行）
- **交互**：点击进入世界书；长按无操作（排序按时间自动）
- **排序**：按最近编辑时间降序
- **添加按钮**：右上角或浮动按钮，点击创建新的世界书
- **空状态**：书架为空时显示引导文案

### 3.2 世界书详情页（类 Book 阅读体验）

采用**翻页式设计**，像在微信读书中翻一本书：

**第 1 页 — 封面页**：
- 书封图片（大图，若无则默认）
- 世界书名称
- 世界书描述/简介
- 启用/禁用开关

**第 2 页 — 目录页**：
- 条目列表，每行显示：
  - 条目名称（标题）
  - 关键词预览（最多显示 3 个，超出显示 +N）
  - 启用状态（绿色/灰色小点）
- 目录页底部：添加新条目按钮

**第 3 页起 — 条目内容页**（每个条目一页）：
- 顶部：条目名称
- 信息区：关键词列表、注入位置、优先级、扫描深度、角色、匹配方式等
- 正文区：注入内容（可滚动）
- 底部：编辑/删除按钮

**翻页交互**：
- 手机触屏：手指在屏幕中间区域左右滑动翻页
- 电脑浏览器：底部左右两侧小箭头按钮
- 防止误触：上下滑动为条目内滚动，左右滑动为翻页

**侧边栏**（从屏幕左边缘向右滑出）：
- 显示所有条目名称列表 + 启用状态绿点
- 点击条目跳转到对应页
- 类似微信读书的侧边栏设计（从左边缘滑出）

### 3.3 条目编辑弹窗

- 底部弹窗（Modal Bottom Sheet）形式
- 字段：
  - 名称（文本框）
  - 启用（开关）
  - 优先级 1-100（数字输入）
  - 注入位置（5选1下拉选择）
  - 注入角色（USER/ASSISTANT，仅 TOP/BOTTOM/AT_DEPTH 时显示）
  - 注入内容（多行文本框，即发送给 LLM 的提示词）
  - 触发方式（常驻激活 开关）
  - 关键词（Chip 标签式输入，回车添加，×删除）
  - 使用正则表达式（开关）
  - 大小写敏感（开关）
  - 扫描深度（数字输入，默认 5，仅非常驻时显示）
  - AT_DEPTH 深度值（数字输入，默认 4，仅 AT_DEPTH 时显示）
- 底部：取消 + 确认按钮

### 3.4 智能体设定处的世界书挂载

在 `AgentSettings` 中：
- 世界书挂载区域改为勾选列表
- 显示所有已创建的世界书（名称 + 启用状态）
- checkbox 勾选即绑定该世界书
- 当没有世界书时显示引导文案"暂无世界书，请先在世界书 APP 中创建"

### 3.5 世界书 APP 内的绑定信息

- 在封面页或目录页底部，显示"已绑定到：智能体A、智能体B……"
- 只读展示，不可在此处解绑（解绑需到智能体设定处操作）

---

## 四、导入/导出

### 4.1 单本导出

- 每本世界书在书架卡片上或详情页提供导出按钮
- 导出为 JSON 格式文件
- JSON 包含完整的世界书数据（名称、描述、书封、所有条目）

### 4.2 单本导入

- 书架页提供导入按钮
- 选择 JSON 文件 → 解析 → 校验 → 添加到书架
- 若 ID 冲突则重新生成 ID

---

## 五、与聊天 APP 的耦合清单

| 模块 | 改动内容 | 类型 |
|------|---------|------|
| `src/apps/chat/types.ts` | Agent 添加 `lorebookIds: string[]` | 新增字段 |
| `src/apps/chat/store/chat-store.ts` | store 初始化时传递 lorebooks | 修改 |
| `src/apps/chat/components/AgentSettings.tsx` | 世界书挂载改为勾选列表 | 重写 |
| `src/apps/chat/pages/ContextPreviewPage.tsx` | 适配世界书注入显示 | 修改 |
| `src/hooks/use-send-message.ts` | TransformerContext 传入 lorebooks | 修改 |
| `src/services/transformer-pipeline/types.ts` | 添加 Lorebook/LorebookEntry 类型引用 | 新增字段 |
| `src/services/transformer-pipeline/prompt-injection.ts` | 填充完整触发+注入逻辑 | 重写 |
| `src/services/transformer-pipeline/index.ts` | 无需改动（已注册） | — |

---

## 六、开发任务清单

### Phase A：类型与数据层
- [ ] A1：在 chat types 中添加 Lorebook/LorebookEntry/LorebookEntryPartial 类型
- [ ] A2：Agent 添加 lorebookIds 字段
- [ ] A3：创建 lorebook Store（Zustand，IndexedDB 持久化）
- [ ] A4：TransformerContext 添加 lorebooks 字段
- [ ] A5：在 App.tsx 中注册 lorebook store provider

### Phase B：Transformer 注入逻辑
- [ ] B1：实现 collectInjections（关键词匹配 + 常驻激活）
- [ ] B2：实现 applyInjections（按位置注入 + 安全插入）
- [ ] B3：实现 findSafeInsertIndex（供应商兼容）
- [ ] B4：编写单元测试

### Phase C：世界书 APP UI
- [ ] C1：书架列表页（网格布局，书封卡片）
- [ ] C2：世界书详情页（翻页式：封面→目录→条目）
- [ ] C3：侧边栏（左边缘滑出，显示条目名称+状态）
- [ ] C4：条目编辑弹窗（完整字段）
- [ ] C5：书封上传裁剪
- [ ] C6：导入/导出 JSON

### Phase D：绑定与集成
- [ ] D1：AgentSettings 世界书勾选列表
- [ ] D2：ContextPreview 适配世界书注入区块
- [ ] D3：use-send-message 传入 lorebooks
- [ ] D4：回归测试

---

*规格确认时间：2026-07-16，通过 grill-me 访谈确认所有设计点*
