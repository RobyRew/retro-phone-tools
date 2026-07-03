// Minimal, dependency-free MD5 (RFC 1321) and SHA-1 (RFC 3174) over byte arrays.
// Synchronous by design: the unlock algorithms chain several digests together,
// so a sync API keeps them readable. Verified byte-for-byte against Node's
// crypto module (see tests). All I/O is Uint8Array.

/** ASCII/Latin-1 string -> bytes. Inputs here (IMEIs, salts) are ASCII. */
export function strToBytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

/** Hex string -> bytes. */
export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/** bytes -> lowercase hex. */
export function bytesToHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = (() => {
  const k = new Uint32Array(64);
  for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
  return k;
})();

export function md5Bytes(bytes) {
  const len = bytes.length;
  const bitLen = len * 8;
  let padded = len + 1;
  while (padded % 64 !== 56) padded++;
  const total = padded + 8;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[len] = 0x80;
  const lo = bitLen >>> 0;
  const hi = Math.floor(bitLen / 4294967296) >>> 0;
  buf[padded] = lo & 0xff; buf[padded + 1] = (lo >>> 8) & 0xff;
  buf[padded + 2] = (lo >>> 16) & 0xff; buf[padded + 3] = (lo >>> 24) & 0xff;
  buf[padded + 4] = hi & 0xff; buf[padded + 5] = (hi >>> 8) & 0xff;
  buf[padded + 6] = (hi >>> 16) & 0xff; buf[padded + 7] = (hi >>> 24) & 0xff;

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) {
      M[i] = buf[off + i * 4] | (buf[off + i * 4 + 1] << 8) |
             (buf[off + i * 4 + 2] << 16) | (buf[off + i * 4 + 3] << 24);
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + MD5_K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + (((F << MD5_S[i]) | (F >>> (32 - MD5_S[i]))) >>> 0)) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((v, i) => {
    out[i * 4] = v & 0xff; out[i * 4 + 1] = (v >>> 8) & 0xff;
    out[i * 4 + 2] = (v >>> 16) & 0xff; out[i * 4 + 3] = (v >>> 24) & 0xff;
  });
  return out;
}

export function sha1Bytes(bytes) {
  const len = bytes.length;
  const bitLen = len * 8;
  let padded = len + 1;
  while (padded % 64 !== 56) padded++;
  const total = padded + 8;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[len] = 0x80;
  const hi = Math.floor(bitLen / 4294967296) >>> 0;
  const lo = bitLen >>> 0;
  buf[padded] = (hi >>> 24) & 0xff; buf[padded + 1] = (hi >>> 16) & 0xff;
  buf[padded + 2] = (hi >>> 8) & 0xff; buf[padded + 3] = hi & 0xff;
  buf[padded + 4] = (lo >>> 24) & 0xff; buf[padded + 5] = (lo >>> 16) & 0xff;
  buf[padded + 6] = (lo >>> 8) & 0xff; buf[padded + 7] = lo & 0xff;

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = ((buf[off + i * 4] << 24) | (buf[off + i * 4 + 1] << 16) |
              (buf[off + i * 4 + 2] << 8) | buf[off + i * 4 + 3]) >>> 0;
    }
    for (let i = 16; i < 80; i++) {
      const v = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = ((v << 1) | (v >>> 31)) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = ((((a << 5) | (a >>> 27)) >>> 0) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  [h0, h1, h2, h3, h4].forEach((v, i) => {
    out[i * 4] = (v >>> 24) & 0xff; out[i * 4 + 1] = (v >>> 16) & 0xff;
    out[i * 4 + 2] = (v >>> 8) & 0xff; out[i * 4 + 3] = v & 0xff;
  });
  return out;
}

export const md5Hex = (s) => bytesToHex(md5Bytes(typeof s === 'string' ? strToBytes(s) : s));
export const sha1Hex = (s) => bytesToHex(sha1Bytes(typeof s === 'string' ? strToBytes(s) : s));
