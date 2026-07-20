/**
 * 服务层统一错误类型
 *
 * 对标 RikkaHub 的 WebDavException / McpException 设计。
 * 所有服务层抛出的异常都继承自 ServiceError，保证 catch 侧能用 instanceof 统一处理。
 *
 * 注意：TypeScript 6.0 禁止 enum 和 parameter properties（erasableSyntaxOnly），
 * 所以用 const object + as const 模式替代。
 */

/** 错误码常量 */
export const ErrorCode = {
  // 通用
  UNKNOWN: 'UNKNOWN',
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  NOT_FOUND: 'NOT_FOUND',

  // WebDAV
  WEBDAV_AUTH_FAILED: 'WEBDAV_AUTH_FAILED',
  WEBDAV_METHOD_NOT_ALLOWED: 'WEBDAV_METHOD_NOT_ALLOWED',
  WEBDAV_CONNECTION_FAILED: 'WEBDAV_CONNECTION_FAILED',
  WEBDAV_XML_PARSE_ERROR: 'WEBDAV_XML_PARSE_ERROR',

  // MCP
  MCP_CONNECTION_FAILED: 'MCP_CONNECTION_FAILED',
  MCP_NOT_CONNECTED: 'MCP_NOT_CONNECTED',
  MCP_TOOL_CALL_FAILED: 'MCP_TOOL_CALL_FAILED',
  MCP_INIT_FAILED: 'MCP_INIT_FAILED',
  MCP_SERVER_ERROR: 'MCP_SERVER_ERROR',

  // Search
  SEARCH_API_ERROR: 'SEARCH_API_ERROR',
  SEARCH_RATE_LIMITED: 'SEARCH_RATE_LIMITED',
  SEARCH_INVALID_KEY: 'SEARCH_INVALID_KEY',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** 服务层异常基类 */
export class ServiceError extends Error {
  readonly code: ErrorCode;
  readonly status?: number;
  readonly responseBody?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    status?: number,
    responseBody?: string
  ) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = status;
    this.responseBody = responseBody;
  }
}

/** WebDAV 异常 */
export class WebDavError extends ServiceError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    status?: number,
    responseBody?: string
  ) {
    super(message, code, status, responseBody);
    this.name = 'WebDavError';
  }
}

/** MCP 异常 */
export class McpError extends ServiceError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    status?: number
  ) {
    super(message, code, status);
    this.name = 'McpError';
  }
}

/** 搜索服务异常 */
export class SearchError extends ServiceError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    status?: number
  ) {
    super(message, code, status);
    this.name = 'SearchError';
  }
}

/**
 * 安全提取错误消息（替代 `(err as Error).message`）
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof ServiceError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
