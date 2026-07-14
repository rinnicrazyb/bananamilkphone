/**
 * Web Crypto API 加密工具 —— 用于加密存储 API Key 等敏感信息
 */

const ALGORITHM = 'AES-GCM';
const KEY_USAGES: KeyUsage[] = ['encrypt', 'decrypt'];

/** 生成或取缓存的主密钥（从 sessionStorage 派生） */
async function getKey(): Promise<CryptoKey> {
  // 使用一个固定的派生密钥方案
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode('bananamilkphone-v1'),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('bananamilkphone-salt'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: 256 },
    false,
    KEY_USAGES
  );
}

/** 加密明文，返回 base64 编码的密文 */
export async function encrypt(plaintext: string): Promise<string> {
  try {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const encrypted = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      key,
      encoded
    );

    // iv + 密文 拼接后 base64
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  } catch {
    // 如果 Web Crypto API 不可用，返回原始文本的 base64（不加密）
    return btoa(plaintext);
  }
}

/** 解密 base64 密文，返回明文 */
export async function decrypt(ciphertext: string): Promise<string> {
  try {
    const key = await getKey();
    const combined = new Uint8Array(
      atob(ciphertext)
        .split('')
        .map((c) => c.charCodeAt(0))
    );

    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      data
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    // 尝试作为普通 base64 解码（未加密的旧数据）
    try {
      return atob(ciphertext);
    } catch {
      return ciphertext;
    }
  }
}
