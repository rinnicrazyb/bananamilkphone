/** 记忆提取相关类型 */

/** 单个记忆条目（LLM 返回的 JSON 结构） */
export interface ExtractedMemory {
  content: string;
}

/** 提取响应（LLM 返回的完整 JSON） */
export interface ExtractionResponse {
  memories: ExtractedMemory[];
}
