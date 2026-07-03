// Faithful JavaScript port of dct4decrypt (Postrediori/mobile-phone-tools),
// itself based on decr.c / DCT4Crypt by g3gg0. Decrypts Nokia DCT4 flash ROMs
// (MCU / PPM) entirely in the browser — pure byte manipulation, no network.
//
// The "CryptKey" this derives is the 16-bit FIRMWARE-image key. It is NOT a
// SIM-unlock code and has nothing to do with the IMEI.

export const TYPE_MCU = 0;
export const TYPE_PPM = 1;

const ZERO_MASK = 0x0000;

const MBIT = [
  0x1221, 0xa91a, 0x52a5, 0x0908,
  0xa918, 0x1020, 0xffff, 0x52a1,
  0x0100, 0x1220, 0xad1a, 0x0900,
  0x1000, 0x2908, 0x5221, 0xa908,
];
const MADDR = [
  0x0fae, 0x3e7f, 0xc99f, 0xd6f7,
  0xa71b, 0x14c4, 0x52a5, 0xcbb1,
  0x4285, 0xefdf, 0xdff7, 0x5080,
  0xee9f, 0x0000, 0x8432, 0x5221,
  0x4084, 0xa91a, 0x56e7, 0xb93a,
  0x5b21, 0xa818, 0x0000, 0xefdf,
];
// [addr_bits, xor_value]
const MADDR_ADJ = [
  [0x00140, 0x1000], [0x00220, 0x52a1], [0x00480, 0x1221], [0x00600, 0xb928],
  [0x00810, 0x5221], [0x00840, 0x1220], [0x00900, 0x2008], [0x01020, 0x1221],
  [0x01080, 0x0908], [0x01100, 0x52a1], [0x02020, 0x0100], [0x02080, 0xfbbd],
  [0x04010, 0xa91a], [0x04040, 0xa908], [0x08008, 0x2908], [0x09000, 0x1000],
  [0x0a000, 0xbd3a], [0x10010, 0xad1a], [0x10040, 0x5221], [0x10400, 0x0908],
  [0x20200, 0x53a5], [0x40040, 0xa91a], [0x44000, 0x1b20], [0x80100, 0xa918],
  [0x800000, 0xb908],
];

// Firmware layout constants (non-TIKU / classic DCT4, e.g. 6020/6610-class).
const CFG = {
  mcuFlashStart: 0x1000000,
  mcuCryptStart: 0x84,
  mcuAutoOffset: 0x0084,
  ppmAutoOffset: 0x0000,
  mcuAutoValues: 0xffff,
  ppmAutoValues: 0x5050,
  flsEndianess: 0,
};

let EN_CODES = null;
let DE_CODES = null;

/** Build the substitution tables once (lazy). */
function generateCodes() {
  if (EN_CODES) return;
  EN_CODES = new Uint16Array(65536);
  DE_CODES = new Uint16Array(65536);
  for (let c = 0; c <= 65535; c++) {
    let nc = ZERO_MASK;
    for (let i = 0; i < 16; i++) if (c & (1 << i)) nc ^= MBIT[i];
    DE_CODES[nc] = c;
    EN_CODES[c] = nc;
  }
}

function addressBits(code, addr) {
  addr = addr >>> 0;
  for (const [bits, xorv] of MADDR_ADJ) {
    if ((addr & bits) === bits) code ^= xorv;
  }
  for (let i = 0; i < 24; i++) {
    if (addr & (1 << (i + 1))) code ^= MADDR[i];
  }
  return code & 0xffff;
}

const getHalf = (buf, ofs) => ((buf[ofs] << 8) | buf[ofs ^ 1]) & 0xffff;
function setHalf(buf, ofs, code) {
  buf[ofs] = (code >> 8) & 0xff;
  buf[ofs ^ 1] = code & 0xff;
}

/** Decrypt `len` half-words of `buf` in place. Mirrors decode() in the C. */
function decodeBlock(buf, addr, len, basecode, type) {
  const e = CFG.flsEndianess;
  for (let ofs = 0; ofs < len * 2; ofs += 2) {
    const fad = (addr + ofs - CFG.mcuFlashStart) >>> 0;
    if (fad >= CFG.mcuCryptStart || type === TYPE_PPM) {
      let code = getHalf(buf, ofs ^ e);
      code = addressBits(code, (addr + ofs) >>> 0);
      code = DE_CODES[code];
      code = (code ^ basecode) & 0xffff; // address_fix
      setHalf(buf, ofs ^ e, code);
    }
  }
}

/** Encrypt `len` half-words in place — inverse of decodeBlock (used in tests). */
export function encodeBlock(buf, addr, len, basecode, type) {
  generateCodes();
  const e = CFG.flsEndianess;
  for (let ofs = 0; ofs < len * 2; ofs += 2) {
    const fad = (addr + ofs - CFG.mcuFlashStart) >>> 0;
    if (fad >= CFG.mcuCryptStart || type === TYPE_PPM) {
      let code = getHalf(buf, ofs ^ e);
      code = (code ^ basecode) & 0xffff;
      code = EN_CODES[code];
      code = addressBits(code, (addr + ofs) >>> 0);
      setHalf(buf, ofs, code);
    }
  }
}

function getWord(bytes, p) {
  return ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
}

// Parse one flash chunk starting at p, skipping 0x20/0x21 markers until 0x14.
function getChunk(bytes, p) {
  for (;;) {
    if (p >= bytes.length) return null;
    const b0 = bytes[p]; p += 1;
    if (b0 === 0x14) break;
    if (b0 === 0x21) { p += 5; }
    else if (b0 === 0x20) {
      const b3 = bytes[p + 2], b4 = bytes[p + 3];
      p += 5;
      p += ((b3 << 8) | b4);
    }
  }
  const addr = getWord(bytes, p); p += 4;
  const hb = [bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3], bytes[p + 4]]; p += 5;
  const len = (hb[1] << 16) | (hb[2] << 8) | hb[3];
  const data = bytes.subarray(p, p + len); p += len;
  return { addr, data, lenHalf: Math.floor(len / 2), nextP: p };
}

/** Read a DCT4 flash file into a linear image. Mirrors read_flash(). */
export function readFlash(bytes) {
  let p = 1;
  const skip = getWord(bytes, p); p += 4 + skip;
  const chunks = [];
  let startAddr = null;
  let lastEnd = 0;
  for (;;) {
    const c = getChunk(bytes, p);
    if (!c) break;
    p = c.nextP;
    if (startAddr === null) startAddr = c.addr;
    chunks.push(c);
    lastEnd = Math.max(lastEnd, c.addr + c.lenHalf * 2 - startAddr);
  }
  if (startAddr === null) throw new Error('No DCT4 flash chunks found — is this a valid ROM file?');
  const serialized = new Uint8Array(lastEnd);
  for (const c of chunks) serialized.set(c.data.subarray(0, c.lenHalf * 2), c.addr - startAddr);
  return { serialized, startAddr };
}

// Decrypt a serialized image block-by-block. Mirrors do_decode().
function doDecode(serialized, startAddr, code, type) {
  const out = new Uint8Array(serialized.length - (serialized.length % 2));
  let address = startAddr >>> 0;
  let cur = code & 0xffff;
  let firstBlock = true;
  for (let pos = 0; pos < out.length; ) {
    const len = Math.min(0x2000, Math.floor((out.length - pos) / 2));
    if (len === 0) break;
    const buf = serialized.slice(pos, pos + len * 2);
    decodeBlock(buf, address, len, cur, type);
    if (firstBlock && cur === 0) {
      const off = type === TYPE_MCU ? CFG.mcuAutoOffset : CFG.ppmAutoOffset;
      const val = type === TYPE_MCU ? CFG.mcuAutoValues : CFG.ppmAutoValues;
      cur = (((buf[off] << 8) | buf[off + 1]) ^ val) & 0xffff;
      let idx = type === TYPE_MCU ? CFG.mcuCryptStart : 0;
      for (; idx < len * 2; idx += 2) {
        buf[idx] ^= (cur >> 8) & 0xff;
        buf[idx + 1] ^= cur & 0xff;
      }
    }
    out.set(buf, address - startAddr);
    address = (address + len * 2) >>> 0;
    pos += len * 2;
    firstBlock = false;
  }
  return { output: out, code: cur };
}

/**
 * Decrypt a Nokia DCT4 ROM file.
 * @param {Uint8Array} fileBytes  raw firmware ROM (MCU or PPM)
 * @param {?number} providedCode  16-bit CryptKey, or null to auto-detect (MCU)
 * @returns {{output: Uint8Array, code: number, type: number, startAddr: number}}
 */
export function decryptRom(fileBytes, providedCode = null) {
  generateCodes();
  const { serialized, startAddr } = readFlash(fileBytes);
  const type = startAddr > 0x01000000 ? TYPE_PPM : TYPE_MCU;
  const { output, code } = doDecode(serialized, startAddr, providedCode == null ? 0 : providedCode & 0xffff, type);
  return { output, code, type, startAddr };
}

// Exposed for the test harness.
export const __test = { generateCodes, addressBits, get EN_CODES() { return EN_CODES; }, get DE_CODES() { return DE_CODES; }, CFG };
