/** UUID v7: the Kernel's InternalId format (time-ordered, RFC 9562). */
export function uuid7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let timestamp = Date.now();
  for (let index = 5; index >= 0; index--) { bytes[index] = timestamp % 256; timestamp = Math.floor(timestamp / 256); }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const short = (id: string | undefined, length = 8) => (id ? id.replace(/-/g, "").slice(-length) : "—");
export const lines = (value: string | undefined) => (value ?? "").split(/\r?\n/).map(item => item.trim()).filter(Boolean);
