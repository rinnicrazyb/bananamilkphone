/**
 * PlaceholderTransformer — 占位符替换
 *
 * 预留接口，后续替换消息中的 {{time}}、{{date}}、{{user_name}} 等占位符。
 *
 * 当前为空实现（直接返回原消息），因为目前项目中没有使用占位符。
 * 后续扩展时：
 * 1. 从 ctx.placeholders 获取替换映射
 * 2. 遍历每条消息的 content，进行字符串替换
 * 3. 注意只替换纯文本 content，不修改 toolCallId 等结构化字段
 */
import type { LLMMessage } from '../llm/types';
import type { MessageTransformer, TransformerContext } from './types';

/**
 * PlaceholderTransformer
 *
 * 当前为空实现。后续接入时：
 * 1. 定义默认占位符：{{time}}, {{date}}, {{user_name}} 等
 * 2. 用 ctx.placeholders 覆盖默认值
 * 3. 遍历所有消息的 content 执行替换
 */
export const placeholderTransformer: MessageTransformer = (
  messages: LLMMessage[],
  _ctx: TransformerContext
): LLMMessage[] => {
  // ⚡ 占位：后续在此处实现占位符替换
  return messages;
};
