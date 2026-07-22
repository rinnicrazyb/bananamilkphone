# 学习笔记：RikkaHub API / TTS / OCR 配置架构

> 来源：`C:\refs\rikkahub-master` 项目源码分析
> 日期：2026-07-20
> 目的：对照升级香蕉牛奶机的 API 配置系统

---

## 一、Provider 体系（多供应商管理）

RikkaHub 不是单一 API 配置，而是 **Provider 列表**：

```
Settings.providers: List<ProviderSetting>
  ├── ProviderSetting (sealed class)
  │   ├── OpenAI   (id, name, apiKey, baseUrl, enabled, models)
  │   ├── Google   (id, name, apiKey, baseUrl, enabled, models)
  │   └── Claude   (id, name, apiKey, baseUrl, enabled, models)
  └── 每个 Provider 含 Model 列表
      └── Model (id, modelId, displayName, inputModalities, outputModalities, abilities, type)
```

默认 18 个内置供应商：RikkaHub, OpenAI, Gemini, AiHubMix, 硅基流动, DeepSeek, OpenRouter, Vercel AI Gateway 等。

### 香蕉牛奶机现状

我们目前用的是单一扁平 `LLMConfig` + `LLMPreset[]`。没有 Provider 抽象层。本次升级在 `LLMPreset` 中扩展了 TTS/OCR 字段，但未引入多 Provider 架构。

---

## 二、模型按任务分配（非单一全局模型）

RikkaHub 为每个 AI 任务分配独立模型：

| 任务 | 字段 | 用途 |
|------|------|------|
| 聊天 | `chatModelId` | 主聊天模型 |
| 快速响应 | `fastModelId` | 轻量快速回复 |
| 标题生成 | `titleModelId` | 对话自动标题 |
| 翻译 | `translateModeId` | 翻译任务 |
| **OCR** | `ocrModelId` | 图片→文字 |
| 压缩 | `compressModelId` | 上下文压缩 |
| 建议 | `suggestionModelId` | 下一条消息建议 |

### 香蕉牛奶机现状

我们只有一个全局聊天模型 + agent 级别的 model 覆盖。OCR 模型留了占位（`ocrModel` 字段），但未实现完整的 OCR 管线。

---

## 三、TTS 架构

RikkaHub 的 TTS 是独立子系统：

```
TTSProviderSetting (sealed class, 11 种子类型)
  ├── OpenAI       (apiKey, baseUrl, model, voice)
  ├── Gemini       (apiKey, baseUrl, model, voiceName)
  ├── SystemTTS    (speechRate, pitch — 无需 API)
  ├── MiniMax      (apiKey, baseUrl, model, voiceId, speed)
  ├── Qwen         (apiKey, baseUrl, model, voice)
  ├── Groq         (apiKey, baseUrl, model, voice)
  ├── XAI          (apiKey, baseUrl, voiceId)
  ├── MiMo         (apiKey, baseUrl, model, voice)
  ├── ElevenLabs   (apiKey, baseUrl, model, voiceId, stability, similarityBoost)
  ├── Step         (apiKey, baseUrl, model, voice, speed, volume 等)
  └── FishAudio    (apiKey, baseUrl, model, referenceId, temperature 等)

Settings.selectedTTSProviderId: Uuid  （全局选中的 TTS）
```

UI：`SettingSpeechPage` → TTS/ASR 双 Tab，Provider 卡片式列表（拖拽排序、添加、编辑）

### 香蕉牛奶机现状

本次升级在 `ApiSettings.tsx` 中添加了 TTS 配置区（供应商选择 ElevenLabs/MiniMax + API Key + 模型 + 语音 ID），存入 `LLMPreset` 的 `ttsProvider/ttsApiKey/ttsModel/ttsVoice` 字段。但这远不如 RikkaHub 的 11 种子类型 Provider 体系完善。

---

## 四、OCR 架构

RikkaHub 的 OCR **不是独立 Provider**，而是复用 LLM Provider：

- `Settings.ocrModelId`：指定哪个 LLM 模型做 OCR
- `Settings.ocrPrompt`：自定义 OCR 提示词
- `OcrTransformer.kt`：使用 ocrModelId + ocrPrompt 调用 LLM API，图片→文字描述
- `DEFAULT_OCR_PROMPT`：提取图中文字 + 描述非文字元素位置

### 香蕉牛奶机现状

本次升级在 `ApiSettings.tsx` 中添加了 OCR 配置区（模型名称 + 自定义提示词 textarea），存入 `LLMPreset` 的 `ocrModel/ocrPrompt` 字段。agent 级别也有 `ocrModel` 占位字段。但实际的 OCR Transformer 管线尚未实现。

---

## 五、ASR 架构

RikkaHub 有 ASR（语音识别）Provider：

```
ASRProviderSetting (sealed class, 5 种子类型)
  ├── OpenAIRealtime
  ├── DashScope
  ├── Volcengine
  ├── MiMo
  └── Step
```

### 香蕉牛奶机现状

未引入 ASR，后续若有语音输入需求可参考。

---

## 六、我们已对齐的改动（2026-07-20）

1. `LLMPreset` 扩展 `ttsProvider/ttsApiKey/ttsModel/ttsVoice` 字段
2. `LLMPreset` 扩展 `ocrModel/ocrPrompt` 字段
3. `settings-store` 新增 `ttsConfig` + `ocrConfig` 全局状态
4. `ApiSettings.tsx` 新增 TTS 供应商选择 + OCR 模型/提示词配置区
5. 预设全局应用时同步更新 TTS/OCR 配置

---

## 七、尚存差距（后续可做）

| 功能 | RikkaHub 实现 | 我们状态 |
|------|-------------|---------|
| 多 Provider 管理 | 18 个内置 + 自定义添加/导入/拖拽排序 | 无 Provider 层 |
| 模型按任务分配 | 7 个独立模型 ID | 1 全局 + agent 覆盖 |
| TTS 11 种子类型 | 每种独立表单（stability, speed, volume 等） | 仅 ElevenLabs/MiniMax 基础字段 |
| OCR Transformer | 完整管线（图片→LLM→文字） | 仅配置，无管线 |
| ASR | 5 种子类型 | 未引入 |
| 提示词自定义 | title/translate/suggestion/ocr/compress | 仅系统提示词 |
| 余额查询 | 可选 balance API | 无 |
| Provider 导入 | QR 码 / 相册图片 | 无 |
