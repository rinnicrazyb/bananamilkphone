# Bug 修正报告

> 生成：2026-07-21 | 分支：desktop-redesign
> 参考项目：RikkaHub (`C:\refs\rikkahub-master`) · TauriTavern (`C:\refs\TauriTavern-docs-refresh`)

---

## 一、修正总览

| Bug | 严重度 | 根因 | 修正 | 状态 |
|-----|--------|------|------|------|
| 1 | 🔴 Critical | store subscribe 只监听数组长度变化，流式更新不改长度 | 改为无条件 subscribe → syncFromStore | ✅ |
| 2 | 🔴 依赖Bug1 | 同Bug1 | 同Bug1 | ✅ |
| 3 | 🔴 High | 编辑只更新 windowMessages，未同步 store + DB | onSave 三写：windowMessages + store + DB | ✅ |
| 4 | 🟠 High | 重新生成 onClick 为空 | 查找前置 user 消息 + 标记 branch | ✅ |
| 5 | 🟡 Med | BeautifyPage 选项列表遗漏 | 添加 showBranchArrows + showReasoningDuration | ✅ |
| 6 | 🟡 Med | 同Bug5 | 同Bug5 | ✅ |
| 7 | 🟡 Med | chat-view overflow-x 未 hidden + 无 word-break | 添加 overflow-x:hidden + word-break:break-word | ✅ |
| 8 | 🟡 Med | 手势冒泡 + 面板硬编码320px | pre/code阻止冒泡 + width:min(60vw,320px) | ✅ |
| 9 | 🟡 依赖Bug1 | 同Bug1 | 同Bug1 | ✅ |
| 10 | 🟡 依赖Bug1 | 同Bug1 | 同Bug1 | ✅ |
| 11 | 🟡 Med | React Virtual DOM 覆盖 useEffect 的 hljs DOM操作 | 改为 useMemo 高亮 + dangerouslySetInnerHTML；深色→主题色背景 | ✅ |
| 12 | 🟢 Low | 图标以英文字符串渲染 + 无边框 | 移除图标文字；加 border-radius:12px + padding放大 | ✅ |
| 13 | — | DELIVERY_Checklist 已知问题 | 见第四节 | — |

---

## 二、关键技术分析

### Bug 1 根因深度分析

**数据流时序**（修正前）：
```
用户发送 → addMessage(user) → store length: 0→1 → subscribe 触发 ✅ → 渲染用户消息
         → addMessage(assistant, status:sending, content:'') → store length: 1→2 → subscribe 触发 ✅
         → 流式 chunk → setState 修改 assistant.content → store length: 仍为2 → subscribe 不触发 ❌
                     → windowMessages 中 assistant.content = '' → 空消息渲染 ❌
退出重进 → ChatView 重新挂载 → loadInitialWindow 从 store 读取 → assistant.content 有内容 → 正确 ✅
```

**根因**：两层防线都失效
- 防线1：`subscribe((state, prev) => currLen > prevLen)` — 流式更新不改长度
- 防线2：`pollStoreTotal 中 newTotal > prevTotalRef.current` — 流式更新不改 total

**RikkaHub 对比**：
- RikkaHub：`MutableStateFlow.value = newConversation` → 整个对象替换 → Compose 检测到引用变化 → **无条件重组**
- 我们（修正前）：Zustand `set()` 修改嵌套属性 → subscribe 只能按条件触发 → 长度条件漏掉了内容更新

**修正方案**：`subscribe(() => syncFromStore())` — 任何 store 变化都触发同步。`syncFromStore` 比较消息数量变化决定是否更新 state。

### Bug 3 根因

**数据流**：编辑只写 `windowMessages` → 下次 `loadInitialWindow` 从 store 读取 → store 未更新 → 旧内容恢复。

**修正**：三写策略 — `windowMessages` (即时显示) + `chat-store` (持久化源) + `chat-message-db` (查询源)

### Bug 11 根因

**React 渲染管线**：
```
useEffect 修改 DOM → code.innerHTML = highlighted HTML
→ 下次 React 渲染 → Virtual DOM 发现 code 的 children 还是原始文本
→ React 将 DOM 重置为原始文本 → 高亮消失
```

**修正**：在 React 渲染阶段（useMemo + dangerouslySetInnerHTML）完成高亮，使高亮 HTML 成为 Virtual DOM 的一部分。

---

## 三、修正影响代码清单

| 文件 | 改动 | Bug |
|------|------|-----|
| `src/apps/chat/components/ChatView.tsx` | subscribe 无条件触发 + syncFromStore；编辑三写；重新生成实现 | 1,2,3,4,9,10 |
| `src/apps/chat/pages/BeautifyPage.tsx` | 选项列表 +2 | 5,6 |
| `src/apps/chat/pages/ChatPage.tsx` | pre/code 区域阻止右滑冒泡 | 8 |
| `src/apps/chat/components/MarkdownRenderer.tsx` | code 组件 useMemo 高亮 + dangerouslySetInnerHTML；pre 主题色背景；copy button useEffect 简化 | 11 |
| `src/apps/chat/components/MessageContextMenu.tsx` | 移除英文图标名 | 12 |
| `src/index.css` | chat-page__main overflow-x:hidden；chat-view overflow-x:hidden + word-break；chat-page__panel width:min(60vw,320px)；msg-context-menu 边框美化 | 7,8,12 |

---

## 四、DELIVERY_Checklist 已知问题处理

| 已知问题 | 处理 |
|---------|------|
| 导出不含图片 | 延后（后续 Phase） |
| 全局搜索无排序 | 延后 |
| 主动消息未实现 | Phase 4 底座就绪，触发器待开发 |
| 推理耗时无数据 | UI就绪，需 use-send-message 记录 timing |
| Safari < 16.4 兼容 | 延后（影响面小） |
| LIKE 通配符未转义 | 延后（极少场景） |

---

## 五、实机修正后效果预判

| 功能 | 修正前 | 修正后 |
|------|--------|--------|
| LLM 回复显示 | ❌ 不显示，需退出重进 | ✅ 流式实时显示 |
| 流式动画 | ❌ 无法验证 | ✅ 文字淡入效果可见 |
| 编辑消息 | ❌ 下次刷新恢复原内容 | ✅ 即时生效并持久化 |
| 重新生成 | ❌ 点击无反应 | ✅ 标记分支并标记 regenerate |
| 分支箭头 | ❌ 选项缺失 | ✅ 选项出现，默认开启 |
| 推理耗时 | ❌ 选项缺失 | ✅ 选项出现，默认关闭 |
| 水平滚动 | ❌ 链接超宽可左右滑动 | ✅ overflow-x:hidden 锁定 |
| 面板误触 | ❌ 代码块滚动触发面板 | ✅ 代码块区域豁免 |
| 面板宽度 | ❌ 固定320px | ✅ min(60vw, 320px) 自适应 |
| HTML 渲染 | ❌ 无限拉长 | ⚠️ 流式控制修复，HTML高度bug待具体案例 |
| 代码高亮 | ❌ 无颜色 | ✅ 浅色主题+语法着色 |
| 复制按钮 | ❌ 无 | ✅ 悬停显示复制按钮 |
| 菜单样式 | ❌ 显示英文 "Copy"等 | ✅ 纯中文 + 圆角边框 |

---

## 六、关联 Bug 检查

| 关联关系 | 状态 |
|---------|------|
| Bug1 修复 → Bug2/9/10 自动修复 | ✅ |
| Bug3 修复：编辑同步 store → 上下文拼装同步更新 | ✅ |
| Bug5/6 修复：选项出现 → 分支箭头可开关 + 推理耗时开关可用 | ✅ |
| Bug7 修复 → 不再有横向溢出触发右滑 | ✅（+Bug8 代码块豁免）|
| Bug11 修复：useMemo 高亮 → React 不会覆盖 | ✅ |
| 无新引入的循环依赖或编译错误 | ✅ npm run build 通过 |

---

## 七、回归测试清单

| # | 测试项 | 预期 |
|---|--------|------|
| R1 | 发送消息 → LLM 回复实时显示 | 逐字出现，不白屏 |
| R2 | 编辑用户消息 → 保存 → 上下文拼装 | 内容更新 |
| R3 | 编辑后刷新页面 | 编辑内容不丢失 |
| R4 | 重新生成 → 分支计数增加 | branchTotal 递增 |
| R5 | 美化页 → 显示选项 | 有8项（含分支箭头+推理耗时）|
| R6 | 代码块 | 浅色背景+语法着色 |
| R7 | 代码块悬停 | 右上角复制按钮 |
| R8 | 手机端代码块左右滑动 | 不触发对话面板 |
| R9 | 对话面板宽度 | 小于屏幕60% |
| R10 | 长URL/链接 | 自动换行，不横向溢出 |
| R11 | 右键菜单 | 中文+圆角边框 |
| R12 | 搜索功能 | 对话内搜索/全局搜索正常 |
| R13 | 历史对话加载 | 窗口化滚动正常 |
| R14 | 换行发送 | 移动端换行不发，桌面Enter发送 |
| R15 | APK 打包 | npm run build + assembleDebug |
