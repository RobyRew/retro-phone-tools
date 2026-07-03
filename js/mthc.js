// Faithful JavaScript port of MidiDecode (Postrediori/mobile-phone-tools):
// unpacks Nokia DCT4 compressed MIDI (MThc) into a standard MIDI (MThd/MTrk)
// file. Pure byte manipulation. Safety bounds are added (the browser must not
// hang or read out of range) — on valid MThc data the output matches the C
// reference; on malformed input it throws instead of misbehaving.

const MThc = 0x4d546863;
const MThp = 0x4d546870;

const u16be = (d, o) => ((d[o] << 8) | d[o + 1]) & 0xffff;
const u32be = (d, o) => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
const swap16 = (n) => (((n & 0xff) << 8) | (n >> 8)) & 0xffff;

// LZ-style unpacker. Mirrors unpack_data_chunk() in the C, with bounds checks.
function unpackChunk(data, off, dataSize, expectedOut) {
  let dp = off;
  const end = off + dataSize;
  const cap = Math.max(expectedOut * 4 + 64, 1 << 16); // safety ceiling
  const out = [];
  let code = 0, code2 = 0, backCopyOfs = 1;

  const rd = () => { if (dp >= data.length) throw new Error('MThc: read past end'); return data[dp++]; };
  const control = () => {
    if ((code & 0x7f) === 0) code = (rd() * 2 + 1) >>> 0;
    else code = (code << 1) >>> 0;
  };
  const guard = () => { if (out.length > cap) throw new Error('MThc: output overflow'); };

  for (;;) {
    for (;;) {
      control();
      if ((code & 0x100) === 0) break;
      out.push(rd()); guard();
    }
    let controlLen = 1;
    do {
      control();
      controlLen = ((code >> 8) & 1) + controlLen * 2;
      control();
    } while ((code & 0x100) !== 0);

    if (controlLen !== 2) {
      const b = rd();
      backCopyOfs = controlLen * 0x100 - 0x2ff + b;
      if (backCopyOfs === 0) {
        if (dp !== end) throw new Error('MThc: trailing data after stream');
        return Uint8Array.from(out);
      }
    }

    // NEXT_CONTROL_CODE(code, code2)
    if ((code & 0x7f) === 0) code2 = (rd() * 2 + 1) >>> 0; else code2 = (code << 1) >>> 0;
    // NEXT_CONTROL_CODE(code2, code)
    if ((code2 & 0x7f) === 0) code = (rd() * 2 + 1) >>> 0; else code = (code2 << 1) >>> 0;

    controlLen = ((code2 >> 7) & 2) + ((code >> 8) & 1);
    if (controlLen === 0) {
      controlLen = 1;
      do {
        control();
        controlLen = ((code >> 8) & 1) + controlLen * 2;
        control();
      } while ((code & 0x100) !== 0);
      controlLen += 2;
    }
    let backCopyLen = controlLen + 1;
    if (backCopyOfs > 0xd00) backCopyLen = controlLen + 2;

    let bcp = out.length - backCopyOfs;
    if (bcp < 0) throw new Error('MThc: back-reference before start');
    do {
      out.push(out[bcp]); bcp++; backCopyLen--; guard();
    } while (backCopyLen !== 0);
  }
}

// Mirrors decode_data(): splits the MThc container into unpacked chunks.
function decodeData(data) {
  if (data.length < 5) throw new Error('File too small to be MThc');
  if (u32be(data, 0) !== MThc) throw new Error('Not compressed MIDI (missing MThc signature)');
  const chunksCount = data[4];
  const chunks = [];
  let ptr = 5;
  for (let i = 0; i < chunksCount && ptr < data.length; i++) {
    const compressed = u16be(data, ptr + 2);
    if (data.length - ptr < compressed + 3) throw new Error('Not enough data for a compressed stream');
    const unpackedSize = u16be(data, ptr);
    ptr += 4;
    const unpacked = unpackChunk(data, ptr, compressed, unpackedSize);
    if (unpacked.length !== unpackedSize) throw new Error(`Unpacked size mismatch (${unpacked.length} vs ${unpackedSize})`);
    chunks.push(unpacked);
    ptr += compressed;
  }
  return chunks;
}

// Mirrors normalize_chunks(): reassembles a standard MIDI file from chunks.
function normalizeChunks(chunks) {
  if (!chunks.length) throw new Error('No chunks to normalize');
  const out = [];
  const push = (arr) => { for (const b of arr) out.push(b); };
  const pushStr = (s) => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); };

  let tracksCount = 0;
  let tracksSizes = null;

  // Pass 1: header + per-track total sizes.
  for (const c of chunks) {
    let ptr = 0;
    if (u32be(c, 0) === MThp) {
      pushStr('MThd');
      push(c.subarray(4, 14));
      tracksCount = u16be(c, 10);
      tracksSizes = new Array(tracksCount).fill(0);
      ptr += 0x10;
    }
    if (!tracksSizes) throw new Error('First chunk lacks the MThp header');
    let chunkTracks = u16be(c, ptr + 2);
    if (chunkTracks > 255) chunkTracks = swap16(chunkTracks);
    ptr += 4;
    for (let t = 0; t < chunkTracks; t++) {
      const len = u16be(c, ptr); ptr += 2;
      if (t < tracksSizes.length) tracksSizes[t] += len;
      ptr += len;
    }
  }

  // Pass 2: write each non-empty track by concatenating its data across chunks.
  let nonEmpty = tracksCount;
  for (let track = 0; track < tracksCount; track++) {
    if (tracksSizes[track] === 0) { nonEmpty--; continue; }
    pushStr('MTrk');
    push([(tracksSizes[track] >>> 24) & 255, (tracksSizes[track] >>> 16) & 255,
          (tracksSizes[track] >>> 8) & 255, tracksSizes[track] & 255]);
    for (const c of chunks) {
      let ptr = 0;
      if (u32be(c, 0) === MThp) ptr += 0x10;
      ptr += 4;
      for (let i = 0; i <= track; i++) {
        const tlen = u16be(c, ptr); ptr += 2;
        if (i < track) ptr += tlen;
        else push(c.subarray(ptr, ptr + tlen));
      }
    }
  }

  const midi = Uint8Array.from(out);
  if (nonEmpty !== tracksCount) {
    midi[10] = (nonEmpty >> 8) & 0xff;
    midi[11] = nonEmpty & 0xff;
  }
  return midi;
}

/** Decode an MThc (compressed MIDI) buffer into a standard MIDI file. */
export function decodeMThc(fileBytes) {
  return normalizeChunks(decodeData(fileBytes));
}
