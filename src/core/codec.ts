// ─── core/codec.ts — varint + base64url helpers shared by binary codecs ────

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const REVERSE = new Map<string, number>([...ALPHABET].map((c, i) => [c, i]));

export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += ALPHABET[a >> 2]!;
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    if (b !== undefined) out += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    if (c !== undefined) out += ALPHABET[c & 63]!;
  }
  return out;
}

export function base64UrlToBytes(s: string): Uint8Array | null {
  if (!s || s.length > 200_000) return null;
  const vals: number[] = [];
  for (const ch of s) {
    const v = REVERSE.get(ch);
    if (v === undefined) return null;
    vals.push(v);
  }
  const out: number[] = [];
  for (let i = 0; i < vals.length; i += 4) {
    const a = vals[i]!;
    const b = vals[i + 1];
    const c = vals[i + 2];
    const d = vals[i + 3];
    if (b === undefined) return null;
    out.push((a << 2) | (b >> 4));
    if (c !== undefined) out.push(((b & 15) << 4) | (c >> 2));
    if (d !== undefined) out.push((((c ?? 0) & 3) << 6) | d);
  }
  return Uint8Array.from(out);
}

export class ByteWriter {
  private bytes: number[] = [];
  byte(v: number): this { this.bytes.push(v & 0xff); return this; }
  varint(n: number): this {
    let v = n >>> 0;
    while (v >= 0x80) { this.bytes.push((v & 0x7f) | 0x80); v >>>= 7; }
    this.bytes.push(v);
    return this;
  }
  zigzag(n: number): this { return this.varint(n >= 0 ? n * 2 : -n * 2 - 1); }
  utf8(s: string): this {
    const encoded = new TextEncoder().encode(s);
    this.varint(encoded.length);
    for (const b of encoded) this.bytes.push(b);
    return this;
  }
  finish(): Uint8Array { return Uint8Array.from(this.bytes); }
  encode(): string { return bytesToBase64Url(this.finish()); }
}

export class ByteReader {
  private pos = 0;
  constructor(private bytes: Uint8Array) {}
  get left(): number { return this.bytes.length - this.pos; }
  byte(): number | null {
    if (this.pos >= this.bytes.length) return null;
    return this.bytes[this.pos++]!;
  }
  varint(): number | null {
    let result = 0;
    let shift = 0;
    for (let i = 0; i < 5; i++) {
      const b = this.byte();
      if (b === null) return null;
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) return result >>> 0;
      shift += 7;
    }
    return null;
  }
  zigzag(): number | null {
    const v = this.varint();
    if (v === null) return null;
    return v % 2 === 0 ? v / 2 : -(v + 1) / 2;
  }
  utf8(): string | null {
    const len = this.varint();
    if (len === null || len > this.left || len > 4096) return null;
    const slice = this.bytes.subarray(this.pos, this.pos + len);
    this.pos += len;
    try { return new TextDecoder().decode(slice); } catch { return null; }
  }
}
