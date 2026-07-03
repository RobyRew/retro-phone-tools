// Faithful JavaScript port of ToneSniffer S30 (msearch/tonesniffer_s30.py from
// Postrediori/mobile-phone-tools, originally by wackypack). Scans a DECRYPTED
// Nokia ROM for embedded audio/ringtone assets and returns them for download.
//
// Supported: MThd MIDI, MThc compressed MIDI, ADPCM (g722), SMAF (MMMD), RIFF
// (WAVE/DLS/SF2/RMI/QCP), iMelody, cmid(PMD), mfmp, MCDF(DXM), and optionally
// MLD/NRT.

// Feature flags (defaults match the reference).
const DEFAULTS = { findNrt: false, findMmf: true, findMld: false, findS30Formats: true };

const S30_SIGS = [
  { sig: [0x4d, 0x54, 0x68, 0x63], ext: 'mid' },          // "MThc"
  { sig: [...'audio/g722'].map((c) => c.charCodeAt(0)), ext: 'adp' },
];

// Tune header layout (S30).
const TUNE_HEADER_SIZE = 20, TUNE_TOTAL_SIZE_OFFSET = 4, TUNE_ID_OFFSET = 8,
      TUNE_DUMMY_OFFSET = 12, TUNE_NAME_OFFSET = 17, TUNE_DATA_SIZE_OFFSET = 18;
const DUMMY_SIGNATURE = [0x00, 0x00, 0x00, 0x00, 0x01];
const TUNE_ID_RE = /^[A-Z0-9]{4}$/;

export function scanAssets(bin, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const size = bin.length;
  const found = [];
  let count = 0;

  const u32be = (o) => ((bin[o] << 24) | (bin[o + 1] << 16) | (bin[o + 2] << 8) | bin[o + 3]) >>> 0;
  const u32le = (o) => ((bin[o + 3] << 24) | (bin[o + 2] << 16) | (bin[o + 1] << 8) | bin[o]) >>> 0;
  const eq = (o, arr) => {
    if (o + arr.length > size) return false;
    for (let i = 0; i < arr.length; i++) if (bin[o + i] !== arr[i]) return false;
    return true;
  };
  const str = (s) => [...s].map((c) => c.charCodeAt(0));
  const add = (offset, sz, ext, name) => {
    if (sz <= 0 || offset + sz > size) return;
    found.push({ offset, size: sz, ext, name: name || String(count), bytes: bin.subarray(offset, offset + sz) });
    count++;
  };

  const MTh = str('MTh'), MCD = str('MCD'), cmi = str('cmi'), mel = str('mel'),
        mfm = str('mfm'), MMM = str('MMM'), RIF = str('RIF'), BEG = str('BEG');
  const NRT1 = [0x00, 0x0a, 0x08], NRT2 = [0x00, 0x02, 0xfc];

  for (let x = 0; x < size; x++) {
    const p3 = [bin[x], bin[x + 1], bin[x + 2]];
    const is = (a) => p3[0] === a[0] && p3[1] === a[1] && p3[2] === a[2];

    if (is(MTh) || is(MCD) || is(cmi) || is(mel) || is(mfm) || is(MMM) ||
        is(RIF) || is(BEG) || is(NRT1) || is(NRT2)) {
      let chunkSize = 0;

      if (eq(x, str('MThd')) && eq(x + 14, str('MTrk'))) {
        let mtrkSize = u32be(x + 18);
        chunkSize = mtrkSize + 22;
        let test = false;
        while (!test) {
          if (eq(x + chunkSize, str('MTrk'))) {
            mtrkSize = u32be(x + chunkSize + 4);
            chunkSize += mtrkSize + 8;
          }
          if (!eq(x + chunkSize, str('MTrk'))) test = true;
        }
        add(x, chunkSize, 'mid');
      }

      if (eq(x, str('MCDF'))) {
        let readCTrk = false;
        while (!(readCTrk = eq(x + chunkSize, str('CTrk')))) {
          chunkSize += 1;
          if (chunkSize >= size - x) break;
        }
        if (readCTrk) {
          const trkLen = u32be(x + chunkSize + 4);
          chunkSize += trkLen + 8;
          add(x, chunkSize, 'dxm');
        }
      }

      if (eq(x, str('cmid'))) add(x, u32be(x + 4) + 8, 'pmd');
      if (cfg.findMld && eq(x, str('melo'))) add(x, u32be(x + 4) + 8, 'mld');
      if (eq(x, str('mfmp'))) add(x, u32be(x + 4) + 8, 'mfm');
      if (cfg.findMmf && eq(x, str('MMMD'))) add(x, u32be(x + 4) + 8, 'mmf');

      if (eq(x, str('RIFF'))) {
        const cs = u32le(x + 4);
        if (eq(x + 8, str('WAVE'))) add(x, cs + 8, 'wav');
        if (eq(x + 8, str('DLS '))) add(x, cs + 8, 'dls');
        if (eq(x + 8, str('sfbk'))) add(x, cs + 8, 'sf2');
        if (eq(x + 8, str('RMID'))) add(x, cs + 8, 'rmi');
        if (eq(x + 8, str('QLCM'))) add(x, cs + 8, 'qcp');
      }

      if (eq(x, str('BEGIN:IMELODY'))) {
        const END = str('END:IMELODY');
        let done = false;
        while (!(done = eq(x + chunkSize, END))) {
          chunkSize += 1;
          if (chunkSize >= size - x) { done = true; break; }
        }
        if (eq(x + chunkSize, END)) add(x, chunkSize + 11, 'imy');
      }

      if (cfg.findNrt && (eq(x, NRT1) || eq(x, NRT2))) {
        const STOP = [0x07, 0x0b];
        while (!eq(x + chunkSize, STOP)) {
          chunkSize += 1;
          if (chunkSize >= size - x) break;
        }
        if (eq(x + chunkSize, STOP)) add(x, chunkSize + 2, 'nrt');
      }
    }

    if (cfg.findS30Formats) {
      const match = S30_SIGS.find((s) => eq(x, s.sig));
      if (match) {
        const tune = reverseS30HeaderSearch(bin, x, size);
        if (tune) add(x, tune.chunkSize, match.ext, tune.name);
      }
    }
  }
  return found;
}

function reverseS30HeaderSearch(data, signatureOffset, size) {
  if (signatureOffset <= TUNE_DUMMY_OFFSET) return null;
  const startOffset = signatureOffset - TUNE_DUMMY_OFFSET;
  const eqAt = (o, arr) => arr.every((v, i) => data[o + i] === v);

  for (let x = startOffset; x > TUNE_DUMMY_OFFSET; x--) {
    if (!eqAt(x, DUMMY_SIGNATURE)) continue;
    const headerOffset = x - TUNE_DUMMY_OFFSET;

    const idOffset = headerOffset + TUNE_ID_OFFSET;
    let tuneId = '';
    for (let i = 0; i < 4; i++) tuneId += String.fromCharCode(data[idOffset + i]);
    if (!TUNE_ID_RE.test(tuneId)) break;

    const dataLenOfs = headerOffset + TUNE_DATA_SIZE_OFFSET;
    let dataLen = data[dataLenOfs] | (data[dataLenOfs + 1] << 8); // little-endian

    const nameLen = data[headerOffset + TUNE_NAME_OFFSET];
    if (nameLen * 2 !== signatureOffset - headerOffset - TUNE_HEADER_SIZE) break;

    const nameOfs = headerOffset + TUNE_HEADER_SIZE;
    let nameBytes = data.slice(nameOfs, nameOfs + (nameLen - 1) * 2);
    if (nameBytes.length && nameBytes[0] === 0) {
      const swapped = new Uint8Array(nameBytes.length);
      for (let i = 0; i < nameBytes.length; i++) swapped[i] = i % 2 === 0 ? nameBytes[i + 1] : nameBytes[i - 1];
      nameBytes = swapped;
      dataLen = (data[dataLenOfs] << 8) | data[dataLenOfs + 1]; // big-endian
    }
    let name = '';
    try { name = new TextDecoder('utf-16le').decode(nameBytes); } catch { name = tuneId; }

    const chunkSize = dataLen - 0x14 - nameLen * 2;
    return { tuneId, name, chunkSize };
  }
  return null;
}
