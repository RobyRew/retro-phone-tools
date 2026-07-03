// Unified tool wiring. Each page sets <body data-tool="…">; we wire that one.
import * as unlock from './unlock.js';
import { decryptRom, TYPE_MCU } from './dct4.js';
import { scanAssets } from './tones.js';
import { decodeMThc } from './mthc.js';

const tool = document.body.dataset.tool;
const $ = (id) => document.getElementById(id);
const EXAMPLE_IMEI = '353275011947661';

// Dynamic strings (result labels/messages) — kept in-sync with the language.
const DICT = {
  es: {
    imeiBad: 'El IMEI debe tener 15 dígitos.', imeiOk: '✓ IMEI válido (Luhn correcto).',
    imeiLuhn: '⚠ El dígito de control no cuadra; se calcula igualmente.',
    copy: 'Copiar', copied: '¡Copiado!', download: 'Descargar',
    hwUnlock: 'Código de desbloqueo (Unlock)', hwFlash: 'Código de flash (Flash)',
    zNckOld: 'Antiguos · NCK', zSpckOld: 'Antiguos · SPCK', zB03: 'Firmware B03 · NCK', zB04: 'Firmware B04 · NCK',
    alcNck: 'NCK', alcSpck: 'SPCK', bbBad: 'Introduce un MEP o PRD válido, p. ej. MEP-04103-001.',
    decType: 'Tipo', decKey: 'CryptKey', decAddr: 'Dirección inicial', decSize: 'Tamaño',
    decDl: 'Descargar ROM descifrada', decExtract: 'Ir a «Extraer tonos»', decErr: 'Error al descifrar.',
    keyBad: 'La CryptKey debe ser hex de 1–4 dígitos (o marca autodetectar).',
    extFound: (n) => `Encontrados ${n} recursos.`, extNone: 'No se encontraron recursos. ¿La ROM está descifrada?',
    mthcDone: (s) => `MIDI generado: ${s}.`, mthcErr: '¿Es realmente un tono MThc?', noAssets: 'nada que descargar',
  },
  en: {
    imeiBad: 'The IMEI must be 15 digits.', imeiOk: '✓ Valid IMEI (Luhn checks out).',
    imeiLuhn: '⚠ Check digit mismatch; calculating anyway.',
    copy: 'Copy', copied: 'Copied!', download: 'Download',
    hwUnlock: 'Unlock code', hwFlash: 'Flash code',
    zNckOld: 'Old · NCK', zSpckOld: 'Old · SPCK', zB03: 'Firmware B03 · NCK', zB04: 'Firmware B04 · NCK',
    alcNck: 'NCK', alcSpck: 'SPCK', bbBad: 'Enter a valid MEP or PRD, e.g. MEP-04103-001.',
    decType: 'Type', decKey: 'CryptKey', decAddr: 'Start address', decSize: 'Size',
    decDl: 'Download decrypted ROM', decExtract: 'Go to "Extract tones"', decErr: 'Decryption failed.',
    keyBad: 'The CryptKey must be 1–4 hex digits (or tick auto-detect).',
    extFound: (n) => `Found ${n} assets.`, extNone: 'No assets found. Is the ROM decrypted?',
    mthcDone: (s) => `MIDI generated: ${s}.`, mthcErr: 'Is this really an MThc tone?', noAssets: 'nothing to download',
  },
};
const lang = () => ((document.documentElement.lang || 'es').startsWith('en') ? 'en' : 'es');
const D = (k, ...a) => { const v = DICT[lang()][k]; return typeof v === 'function' ? v(...a) : v; };

let lastRender = null; // re-render current results when language changes
document.addEventListener('langchange', () => { if (lastRender) lastRender(); });

// ---- shared helpers -------------------------------------------------------
const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);
function download(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const readFile = (input) => new Promise((res, rej) => {
  const f = input.files[0]; if (!f) return rej(new Error('no file'));
  const r = new FileReader();
  r.onload = () => res({ name: f.name, bytes: new Uint8Array(r.result) });
  r.onerror = () => rej(new Error('read error'));
  r.readAsArrayBuffer(f);
});
function showError(box, msg) { box.hidden = false; box.innerHTML = ''; const d = document.createElement('div'); d.className = 'err-box'; d.textContent = msg; box.append(d); }
function codeCards(box, entries) {
  box.hidden = false; box.innerHTML = '';
  for (const { label, value } of entries) {
    const card = document.createElement('div'); card.className = 'result-card';
    const meta = document.createElement('div'); meta.className = 'meta';
    const l = document.createElement('div'); l.className = 'label'; l.textContent = label;
    const v = document.createElement('div'); v.className = 'value'; v.textContent = value;
    meta.append(l, v);
    const btn = document.createElement('button'); btn.className = 'copy'; btn.type = 'button'; btn.textContent = D('copy');
    btn.addEventListener('click', async () => { try { await navigator.clipboard.writeText(value); btn.textContent = D('copied'); setTimeout(() => (btn.textContent = D('copy')), 1200); } catch {} });
    card.append(meta, btn); box.append(card);
  }
}

// ---- IMEI (unlock tools) --------------------------------------------------
function luhn(imei) { let s = 0; for (let i = 0; i < 15; i++) { let d = +imei[i]; if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; } s += d; } return s % 10 === 0; }
function setupImei() {
  const inp = $('imei'), st = $('imei-status');
  if (!inp) return () => ({ ok: false });
  inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 15); status(); });
  $('example')?.addEventListener('click', () => { inp.value = EXAMPLE_IMEI; status(); inp.focus(); });
  function status() {
    st.className = 'status';
    if (!inp.value) { st.textContent = ''; return; }
    if (!/^\d{15}$/.test(inp.value)) { st.classList.add('err'); st.textContent = D('imeiBad'); return; }
    if (luhn(inp.value)) { st.classList.add('ok'); st.textContent = D('imeiOk'); } else { st.textContent = D('imeiLuhn'); }
  }
  document.addEventListener('langchange', status);
  return () => (/^\d{15}$/.test(inp.value) ? { ok: true, imei: inp.value } : (status(), { ok: false }));
}

// ---- tool inits -----------------------------------------------------------
const inits = {
  huawei() {
    const read = setupImei();
    $('run').addEventListener('click', () => {
      const r = read(); const box = $('results'); if (!r.ok) return;
      const render = () => { const x = unlock.huaweiOld(r.imei); codeCards(box, [{ label: D('hwUnlock'), value: x.unlock }, { label: D('hwFlash'), value: x.flash }]); };
      lastRender = render; render();
    });
  },
  zte() {
    const read = setupImei();
    $('run').addEventListener('click', () => {
      const r = read(); const box = $('results'); if (!r.ok) return;
      const render = () => { const o = unlock.zteOld(r.imei); codeCards(box, [
        { label: D('zNckOld'), value: o.nck }, { label: D('zSpckOld'), value: o.spck },
        { label: D('zB03'), value: unlock.zteB03(r.imei).nck }, { label: D('zB04'), value: unlock.zteB04(r.imei).nck }]); };
      lastRender = render; render();
    });
  },
  alcatel() {
    const sel = $('alc-model');
    for (const m of Object.keys(unlock.ALCATEL_MODELS)) { const o = document.createElement('option'); o.value = m; o.textContent = m; if (m === 'C700') o.selected = true; sel.append(o); }
    const read = setupImei();
    $('run').addEventListener('click', () => {
      const r = read(); const box = $('results'); if (!r.ok) return;
      const render = () => { const x = unlock.alcatel(sel.value, r.imei); codeCards(box, [{ label: `${sel.value} · ${D('alcNck')}`, value: x.nck }, { label: `${sel.value} · ${D('alcSpck')}`, value: x.spck }]); };
      lastRender = render; render();
    });
  },
  blackberry() {
    const read = setupImei();
    let data = null;
    const load = () => data ? Promise.resolve(data) : Promise.all([
      fetch(new URL('../data/mep.json', import.meta.url)).then((x) => x.json()),
      fetch(new URL('../data/prd.json', import.meta.url)).then((x) => x.json()),
    ]).then(([mep, prd]) => (data = { mep, prd }));
    $('run').addEventListener('click', async () => {
      const r = read(); const box = $('results'); if (!r.ok) return;
      const code = $('bb-mep').value.trim().toUpperCase();
      if (!/^(MEP|PRD)-\d+-\d+$/.test(code)) return showError(box, D('bbBad'));
      await load();
      let mep16 = code.startsWith('MEP') ? data.mep[code] : (data.prd[code] ? data.mep[data.prd[code]] : undefined);
      if (!mep16) mep16 = new Array(16).fill(0);
      const render = () => { const x = unlock.blackberry(code, r.imei, mep16); codeCards(box, [1, 2, 3, 4, 5].map((n) => ({ label: `MEP${n}`, value: x['mep' + n] }))); };
      lastRender = render; render();
    });
  },
  decrypt() {
    let input = null;
    $('dec-file').addEventListener('change', async (e) => { try { input = await readFile(e.target); $('dec-run').disabled = false; } catch { input = null; $('dec-run').disabled = true; } });
    $('dec-auto').addEventListener('change', (e) => { $('dec-key').disabled = e.target.checked; });
    $('dec-run').addEventListener('click', () => {
      const box = $('dec-results'); if (!input) return;
      let code = null;
      if (!$('dec-auto').checked) { const v = $('dec-key').value.trim(); if (!/^[0-9a-fA-F]{1,4}$/.test(v)) return showError(box, D('keyBad')); code = parseInt(v, 16); }
      try {
        const rr = decryptRom(input.bytes, code);
        const render = () => {
          box.hidden = false; box.innerHTML = '';
          const s = document.createElement('div'); s.className = 'summary';
          s.innerHTML = `${D('decType')}: <b>${rr.type === TYPE_MCU ? 'MCU' : 'PPM'}</b> · ${D('decKey')}: <b>0x${rr.code.toString(16).toUpperCase().padStart(4, '0')}</b> · ${D('decAddr')}: <b>0x${rr.startAddr.toString(16).toUpperCase()}</b> · ${D('decSize')}: <b>${fmtBytes(rr.output.length)}</b>`;
          const row = document.createElement('div'); row.className = 'row';
          const dl = document.createElement('button'); dl.className = 'dl'; dl.textContent = D('decDl'); dl.addEventListener('click', () => download(rr.output, `decr_${input.name}`));
          const ex = document.createElement('a'); ex.className = 'dl ghost-dl'; ex.textContent = D('decExtract'); ex.href = '../extract/';
          row.append(dl, ex); box.append(s, row);
        };
        lastRender = render; render();
      } catch (err) { showError(box, err.message || D('decErr')); }
    });
  },
  extract() {
    let input = null;
    $('scan-file').addEventListener('change', async (e) => { try { input = await readFile(e.target); $('scan-run').disabled = false; } catch { input = null; $('scan-run').disabled = true; } });
    $('scan-run').addEventListener('click', () => {
      const box = $('scan-results'); if (!input) return;
      try {
        const hits = scanAssets(input.bytes);
        const render = () => {
          box.hidden = false; box.innerHTML = '';
          const s = document.createElement('div'); s.className = 'summary'; s.textContent = hits.length ? D('extFound', hits.length) : D('extNone'); box.append(s);
          hits.forEach((h, i) => {
            const safe = (h.name || String(i)).replace(/[^\w.\- ]/g, '_').slice(0, 40) || String(i);
            const fname = `${safe}.${h.ext}`;
            const row = document.createElement('div'); row.className = 'asset';
            const meta = document.createElement('div'); meta.className = 'meta';
            const nm = document.createElement('div'); nm.className = 'name'; nm.textContent = fname;
            const sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = `${h.ext.toUpperCase()} · ${fmtBytes(h.size)} · 0x${h.offset.toString(16)}`;
            meta.append(nm, sub);
            const dl = document.createElement('button'); dl.className = 'dl'; dl.textContent = D('download'); dl.addEventListener('click', () => download(h.bytes, fname));
            row.append(meta, dl); box.append(row);
          });
        };
        lastRender = render; render();
      } catch (err) { showError(box, err.message); }
    });
  },
  mthc() {
    let input = null;
    $('mthc-file').addEventListener('change', async (e) => { try { input = await readFile(e.target); $('mthc-run').disabled = false; } catch { input = null; $('mthc-run').disabled = true; } });
    $('mthc-run').addEventListener('click', () => {
      const box = $('mthc-results'); if (!input) return;
      try {
        const midi = decodeMThc(input.bytes);
        const render = () => {
          box.hidden = false; box.innerHTML = '';
          const s = document.createElement('div'); s.className = 'summary'; s.textContent = D('mthcDone', fmtBytes(midi.length));
          const name = input.name.replace(/\.[^.]+$/, '') + '.mid';
          const dl = document.createElement('button'); dl.className = 'dl'; dl.textContent = `${D('download')} ${name}`; dl.addEventListener('click', () => download(midi, name));
          box.append(s, dl);
        };
        lastRender = render; render();
      } catch (err) { showError(box, `${err.message} — ${D('mthcErr')}`); }
    });
  },
};

inits[tool]?.();
