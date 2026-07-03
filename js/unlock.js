// Faithful JavaScript port of alexanderritola/Go-Unlock-Code-Calculator (MIT).
// Each function reproduces the reference algorithm exactly, including its quirks
// (documented inline). Verified against a Python reference that uses hashlib.
//
// IMPORTANT: these are historical, reverse-engineered algorithms for OLD devices
// (2008-2014-era USB modems / legacy handsets). They do not apply to modern
// phones, and none of them is the Nokia DCT4 algorithm.

import { md5Bytes, sha1Bytes, strToBytes, hexToBytes, bytesToHex } from './crypto.js';

// ----------------------------------------------------------------------------
// Huawei — older USB modems (e.g. E169/E220/E1550-era data cards)
// ----------------------------------------------------------------------------
function huaweiCode(imei, salt) {
  const b = md5Bytes(strToBytes(imei + salt));
  let app = [
    b[0] ^ b[4] ^ b[8] ^ b[12],
    b[1] ^ b[5] ^ b[9] ^ b[13],
    b[2] ^ b[6] ^ b[10] ^ b[14],
    b[3] ^ b[7] ^ b[11] ^ b[15],
  ];
  const part1 = [0x01, 0xff, 0xff, 0xff];
  const part2 = [0x02, 0x00, 0x00, 0x00];
  app = app.map((v, i) => v & part1[i]);
  app = app.map((v, i) => v | part2[i]);
  const hex = app.map((v) => v.toString(16).padStart(2, '0')).join('');
  return parseInt(hex, 16).toString(10);
}

export function huaweiOld(imei) {
  const ucSalt = bytesToHex(md5Bytes(strToBytes('hwe620datacard'))).slice(8, 24);
  const fcSalt = bytesToHex(md5Bytes(strToBytes('e630upgrade'))).slice(8, 24);
  return { unlock: huaweiCode(imei, ucSalt), flash: huaweiCode(imei, fcSalt) };
}

// ----------------------------------------------------------------------------
// ZTE — three variants: old models, firmware B03, firmware B04
// ----------------------------------------------------------------------------
export function zteOld(imei) {
  const magic = [6, 8, 8, 9, 5, 0, 0, 0, 0, 0, 0, 0];
  const d = [];
  for (let i = 0; i < 12; i++) d.push(Number(imei[i + 3])); // digits imei[3..14]
  const cs = d.reduce((a, b) => a + b, 0);
  let nck = '', spck = '';
  for (let i = 0; i < 12; i++) {
    const code = (d[i] * cs + d[11 - i] * 8 + magic[i]) % 10;
    nck += code;
    spck += (code + d[11 - i]) % 10;
  }
  return { nck, spck };
}

function zteMd5Key(imei, b04) {
  const pre = md5Bytes(strToBytes(imei)); // 16 bytes, values 0..255
  let out = '';
  for (let i = 0; i < 8; i++) {
    const sum = pre[i] + pre[i + 8] + (b04 ? pre[i + 4] + 40 : 0);
    // Reference precedence: ((sum & 0xFF) * 9) / 255, integer division.
    const key = Math.floor(((sum & 0xff) * 0x09) / 0xff);
    out += key.toString(16);
  }
  return out;
}
export const zteB03 = (imei) => ({ nck: zteMd5Key(imei, false) });
export const zteB04 = (imei) => ({ nck: zteMd5Key(imei, true) });

// ----------------------------------------------------------------------------
// Alcatel — specific legacy models, selected via a friendly model name
// ----------------------------------------------------------------------------
// [imp(NCK), imp(SPCK), perm, xorder]
const ALCATEL_DATA = {
  duck:      ['8F', 'BE', '876543210', '110A090201100B0803000F0C0704130E0D060512'],
  playboy:   ['3C', 'E2', '785432106', '0B121307000C110806010D100905020E0F0A0403'],
  misssixty: ['6C', 'B9', '456132807', '0503011311040200121007090B0D0F06080A0C0E'],
  s215:      ['74', '9A', '547682031', '0504010D0F0C06070A0010080B0E031202111309'],
  s853:      ['53', 'AE', '876543210', '0004080C100105090D1102060A0E1203070B0F13'],
};
// Model -> dataset. Faithful to the reference: "S853" resolves to the "duck"
// dataset (the standalone "s853" entry above is defined but unused upstream).
export const ALCATEL_MODELS = {
  MandarinaDuck: 'duck', C820: 'duck', C825: 'duck',
  Playboy: 'playboy', C717: 'playboy', C700: 'playboy', EL03: 'playboy',
  MissSixty: 'misssixty', S520: 'misssixty',
  S215: 's215', S218: 's215', S219: 's215', S320: 's215', S321: 's215',
  S853: 'duck',
};

function alcatelCalc(imei, imp, perm, xorn) {
  const simei = imei + '0';
  let swap = '08';
  for (let i = 0; i < simei.length - 1; i += 2) swap += simei[i + 1] + simei[i];
  const doswap = new Array(9).fill(0);
  for (let i = 0; i < perm.length - 1; i++) doswap[i] = Number(perm[i]);
  const tmp = new Array(9);
  for (let i = 0, j = 0; i < 9; i++, j += 2) tmp[i] = swap[j] + swap[j + 1];
  let permimei = '';
  for (let i = 0; i < 9; i++) permimei += tmp[doswap[i]];
  const bRay = sha1Bytes(hexToBytes(imp + swap + swap + permimei));
  const xorder = hexToBytes(xorn);
  const doxor = new Array(20).fill(0);
  for (let i = 0; i < xorder.length - 1; i++) doxor[i] = xorder[i];
  let pre = '';
  for (let i = 0; i < doxor.length - 1; i += 5) {
    const myxor = bRay[doxor[i]] ^ bRay[doxor[i + 1]] ^ bRay[doxor[i + 2]] ^
                  bRay[doxor[i + 3]] ^ bRay[doxor[i + 4]];
    pre += myxor.toString(16).padStart(2, '0');
  }
  return parseInt(pre, 16).toString(10);
}

export function alcatel(model, imei) {
  const k = ALCATEL_DATA[ALCATEL_MODELS[model]];
  return {
    nck: alcatelCalc(imei, k[0], k[2], k[3]),
    spck: alcatelCalc(imei, k[1], k[2], k[3]),
  };
}

// ----------------------------------------------------------------------------
// BlackBerry — HMAC-SHA1 over the IMEI keyed by the per-MEP secret.
// Needs the 16-byte key for the MEP/PRD (looked up from the data tables).
// ----------------------------------------------------------------------------
const BB_STATIC = [0x16, 0x27, 0x99, 0xc2, 0xc8, 0x99, 0xb8, 0xc9,
                   0xde, 0xed, 0x77, 0xa2, 0x62, 0xd2, 0x66, 0x5e];
const MEP8 = 'MEP-23361-001,MEP-30218-002,MEP-15326-002,MEP-04626-002,' +
             'MEP-27501-003,MEP-31845-001,MEP-22793-001,MEP-04103-001';

function bbPrivatePass(mep16) {
  const p = new Array(64).fill(0);
  for (let i = 0; i < 16; i++) p[i] = BB_STATIC[i] ^ mep16[i];
  return p;
}
function bbSha1(imei, pPass, n) {
  const imeiHex = bytesToHex(strToBytes(imei)).toUpperCase() + '0' + n;
  let oPad = '', iPad = '';
  for (let i = 0; i < 64; i++) {
    oPad += (pPass[i] ^ 0x5c).toString(16).padStart(2, '0');
    iPad += (pPass[i] ^ 0x36).toString(16).padStart(2, '0');
  }
  const p1 = bytesToHex(sha1Bytes(hexToBytes(iPad + imeiHex))).toUpperCase();
  const p2 = bytesToHex(sha1Bytes(hexToBytes(oPad + p1))).toUpperCase();
  return p2;
}
function bbCode(hashHex, mep) {
  const size = MEP8.includes(mep) ? 8 : 16; // reference: strings.Count(...) != 0
  const b = hexToBytes(hashHex);
  let out = '';
  for (let i = 0; i < size; i++) {
    const dec = b[i].toString(10);
    out += dec[dec.length - 1]; // last decimal digit of each hash byte
  }
  return out;
}
/** mep16: 16-byte key for the MEP/PRD (all zeros if unknown, matching Go). */
export function blackberry(mepOrPrd, imei, mep16) {
  const res = {};
  for (let n = 1; n <= 5; n++) {
    res['mep' + n] = bbCode(bbSha1(imei, bbPrivatePass(mep16), n), mepOrPrd);
  }
  return res;
}
