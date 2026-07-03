// Static multi-page site generator for Retro Phone Tools.
// Single source of truth for pages, i18n (es/en) and SEO metadata.
// Run: node build.mjs   → writes index.html + per-tool pages + sitemap/robots/llms.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);

const SITE = {
  name: 'Retro Phone Tools',
  baseUrl: 'https://robyrew.github.io/retro-phone-tools',
  author: 'RobyRew',
  repo: 'https://github.com/RobyRew/retro-phone-tools',
  langs: ['es', 'en'],
  defaultLang: 'es',
};

// ---- shared i18n strings: key -> { es, en } --------------------------------
const L = {
  'nav.home': { es: 'Inicio', en: 'Home' },
  'nav.unlock': { es: 'Códigos de desbloqueo', en: 'Unlock codes' },
  'nav.firmware': { es: 'Firmware DCT4', en: 'DCT4 firmware' },
  'ui.theme': { es: 'Tema', en: 'Theme' },
  'ui.lang': { es: 'Idioma', en: 'Language' },
  'ui.privacy': { es: 'Todo el cálculo ocurre en tu navegador. Nada se sube.', en: 'Everything runs in your browser. Nothing is uploaded.' },
  'ui.imei': { es: 'IMEI (15 dígitos)', en: 'IMEI (15 digits)' },
  'ui.example': { es: 'Usar ejemplo', en: 'Use example' },
  'ui.calculate': { es: 'Calcular', en: 'Calculate' },
  'ui.download': { es: 'Descargar', en: 'Download' },
  'ui.copy': { es: 'Copiar', en: 'Copy' },
  'ui.copied': { es: '¡Copiado!', en: 'Copied!' },
  'ui.related': { es: 'Otras herramientas', en: 'Other tools' },
  'ui.howto': { es: 'Cómo funciona', en: 'How it works' },
  'ui.faq': { es: 'Preguntas frecuentes', en: 'FAQ' },
  'ui.chooseFile': { es: 'Elegir archivo…', en: 'Choose file…' },
  'foot.disclaimer': { es: 'Proyecto educativo. Úsalo solo con dispositivos de tu propiedad. Algoritmos públicos y de dominio abierto.', en: 'Educational project. Use only with devices you own. Public, open-domain algorithms.' },
  'imei.bad': { es: 'El IMEI debe tener 15 dígitos.', en: 'The IMEI must be 15 digits.' },
  'imei.ok': { es: '✓ IMEI válido (Luhn correcto).', en: '✓ Valid IMEI (Luhn checks out).' },
  'imei.luhn': { es: '⚠ El dígito de control no cuadra; se calcula igualmente.', en: '⚠ Check digit mismatch; calculating anyway.' },
};

// per-page/tool i18n lives in PAGES[].t (key -> {es,en}); merged into L at build.
const cat = { unlock: { es: 'Códigos de desbloqueo', en: 'Unlock codes' }, firmware: { es: 'Firmware DCT4', en: 'DCT4 firmware' } };

// ---- tool UI fragments (ids are unique per page) ---------------------------
const imeiBar = `
  <div class="field">
    <label for="imei" data-i18n="ui.imei">IMEI (15 dígitos)</label>
    <div class="imei-row">
      <input id="imei" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="15" placeholder="353275011947661" />
      <button type="button" class="ghost" id="example" data-i18n="ui.example">Usar ejemplo</button>
    </div>
    <p id="imei-status" class="status" aria-live="polite"></p>
  </div>`;

const TOOLS = {
  huawei: `${imeiBar}<button type="button" class="calc" id="run" data-i18n="ui.calculate">Calcular</button><div class="results" id="results" hidden></div>`,
  zte: `${imeiBar}<button type="button" class="calc" id="run" data-i18n="ui.calculate">Calcular</button><div class="results" id="results" hidden></div>`,
  alcatel: `<div class="field"><label for="alc-model" data-i18n="t.alc.model">Modelo</label><select id="alc-model"></select></div>${imeiBar}<button type="button" class="calc" id="run" data-i18n="ui.calculate">Calcular</button><div class="results" id="results" hidden></div>`,
  blackberry: `<div class="field"><label for="bb-mep" data-i18n="t.bb.code">MEP o PRD</label><input id="bb-mep" type="text" autocomplete="off" spellcheck="false" placeholder="MEP-04103-001 · PRD-02930-004" /></div>${imeiBar}<button type="button" class="calc" id="run" data-i18n="ui.calculate">Calcular</button><div class="results" id="results" hidden></div>`,
  decrypt: `<label class="filepick"><input type="file" id="dec-file" /><span data-i18n="ui.chooseFile">Elegir archivo…</span></label>
    <div class="row"><label class="inline"><input type="checkbox" id="dec-auto" checked /> <span data-i18n="t.dec.auto">Autodetectar clave (MCU)</span></label>
    <label class="inline"><span data-i18n="t.dec.key">CryptKey (hex)</span>: <input type="text" id="dec-key" class="key" maxlength="4" placeholder="1B85" disabled /></label></div>
    <button type="button" class="calc" id="dec-run" disabled data-i18n="t.dec.run">Descifrar</button><div class="results" id="dec-results" hidden></div>`,
  extract: `<label class="filepick"><input type="file" id="scan-file" /><span data-i18n="ui.chooseFile">Elegir archivo…</span></label>
    <button type="button" class="calc" id="scan-run" disabled data-i18n="t.ext.run">Escanear</button><div class="results" id="scan-results" hidden></div>`,
  mthc: `<label class="filepick"><input type="file" id="mthc-file" /><span data-i18n="ui.chooseFile">Elegir archivo…</span></label>
    <button type="button" class="calc" id="mthc-run" disabled data-i18n="t.mthc.run">Convertir a MIDI</button><div class="results" id="mthc-results" hidden></div>`,
};

// ---- pages -----------------------------------------------------------------
const PAGES = [
  {
    slug: '', tool: null, group: null, icon: '🏠',
    t: {
      'p.home.nav': { es: 'Inicio', en: 'Home' },
      'p.home.title': { es: 'Retro Phone Tools — desbloqueo y firmware de móviles antiguos', en: 'Retro Phone Tools — unlock codes & firmware for old phones' },
      'p.home.desc': { es: 'Calculadoras de código de desbloqueo (Huawei, ZTE, Alcatel, BlackBerry) y herramientas de firmware Nokia DCT4, gratis y 100% en el navegador.', en: 'Unlock-code calculators (Huawei, ZTE, Alcatel, BlackBerry) and Nokia DCT4 firmware tools, free and 100% in-browser.' },
      'p.home.h1': { es: 'Herramientas para móviles y módems antiguos', en: 'Tools for retro phones and modems' },
      'p.home.intro': { es: 'Calcula códigos de desbloqueo por IMEI y trabaja con firmware Nokia DCT4 — sin instalar nada, sin subir nada. Elige una herramienta:', en: 'Compute IMEI-based unlock codes and work with Nokia DCT4 firmware — nothing to install, nothing uploaded. Pick a tool:' },
    },
    keywords: 'unlock code, código de desbloqueo, Huawei, ZTE, Alcatel, BlackBerry, Nokia DCT4, IMEI, firmware, NCK, MEP',
  },
  {
    slug: 'unlock/huawei', tool: 'huawei', group: 'unlock', icon: '📶',
    t: {
      'p.hw.nav': { es: 'Huawei', en: 'Huawei' },
      'p.hw.title': { es: 'Calculadora de código de desbloqueo Huawei (módems USB)', en: 'Huawei unlock code calculator (USB modems)' },
      'p.hw.desc': { es: 'Genera el código Unlock y Flash de módems USB Huawei antiguos a partir del IMEI. Gratis y en el navegador.', en: 'Generate the Unlock and Flash codes for old Huawei USB modems from the IMEI. Free and in-browser.' },
      'p.hw.h1': { es: 'Código de desbloqueo Huawei', en: 'Huawei unlock code' },
      'p.hw.intro': { es: 'Introduce el IMEI de tu módem USB Huawei antiguo para obtener los códigos de desbloqueo (Unlock) y de flash. Algoritmo MD5 clásico.', en: 'Enter the IMEI of your old Huawei USB modem to get the Unlock and Flash codes. Classic MD5-based algorithm.' },
      'p.hw.how': { es: 'El código es un MD5 del IMEI combinado con salts fijos del fabricante, plegado a 8 dígitos. Válido para la generación «vieja» de módems (E1550, E160, etc.).', en: 'The code is an MD5 of the IMEI combined with fixed vendor salts, folded to 8 digits. Valid for the "old" modem generation (E1550, E160, etc.).' },
    },
    keywords: 'Huawei unlock code, Huawei modem unlock, código desbloqueo Huawei, IMEI, E1550, USB modem NCK',
  },
  {
    slug: 'unlock/zte', tool: 'zte', group: 'unlock', icon: '📡',
    t: {
      'p.zte.nav': { es: 'ZTE', en: 'ZTE' },
      'p.zte.title': { es: 'Calculadora de código de desbloqueo ZTE (NCK / SPCK)', en: 'ZTE unlock code calculator (NCK / SPCK)' },
      'p.zte.desc': { es: 'Calcula NCK y SPCK de módems ZTE (modelos antiguos y firmware B03/B04) desde el IMEI, gratis y en el navegador.', en: 'Compute NCK and SPCK for ZTE modems (old models and firmware B03/B04) from the IMEI, free and in-browser.' },
      'p.zte.h1': { es: 'Código de desbloqueo ZTE', en: 'ZTE unlock code' },
      'p.zte.intro': { es: 'Introduce el IMEI de tu módem ZTE. Se muestran las tres variantes conocidas (antiguos, firmware B03 y B04); usa la que corresponda.', en: 'Enter your ZTE modem IMEI. All three known variants are shown (old, firmware B03 and B04); use the matching one.' },
      'p.zte.how': { es: 'Los modelos antiguos usan una fórmula aritmética sobre los dígitos del IMEI; B03/B04 derivan la clave de un MD5 del IMEI.', en: 'Old models use an arithmetic formula over the IMEI digits; B03/B04 derive the key from an MD5 of the IMEI.' },
    },
    keywords: 'ZTE unlock code, ZTE NCK SPCK, código desbloqueo ZTE, MF, modem unlock, B03 B04',
  },
  {
    slug: 'unlock/alcatel', tool: 'alcatel', group: 'unlock', icon: '📱',
    t: {
      'p.alc.nav': { es: 'Alcatel', en: 'Alcatel' },
      'p.alc.title': { es: 'Calculadora de código de desbloqueo Alcatel (NCK / SPCK)', en: 'Alcatel unlock code calculator (NCK / SPCK)' },
      'p.alc.desc': { es: 'Calcula NCK y SPCK de terminales Alcatel antiguos (C700, C825, S853…) desde el IMEI. Gratis, en el navegador.', en: 'Compute NCK and SPCK for old Alcatel handsets (C700, C825, S853…) from the IMEI. Free, in-browser.' },
      'p.alc.h1': { es: 'Código de desbloqueo Alcatel', en: 'Alcatel unlock code' },
      'p.alc.intro': { es: 'Elige tu modelo Alcatel e introduce el IMEI para obtener NCK y SPCK. Algoritmo SHA-1 con permutación del IMEI.', en: 'Pick your Alcatel model and enter the IMEI to get NCK and SPCK. SHA-1 algorithm with IMEI permutation.' },
      'p.alc.how': { es: 'Cada familia de modelos usa una permutación y un XOR-order propios; el código sale de un SHA-1 sobre el IMEI transformado.', en: 'Each model family uses its own permutation and XOR order; the code comes from a SHA-1 over the transformed IMEI.' },
      't.alc.model': { es: 'Modelo', en: 'Model' },
    },
    keywords: 'Alcatel unlock code, Alcatel NCK, código desbloqueo Alcatel, OT C700 C825 S853, IMEI',
  },
  {
    slug: 'unlock/blackberry', tool: 'blackberry', group: 'unlock', icon: '🔐',
    t: {
      'p.bb.nav': { es: 'BlackBerry', en: 'BlackBerry' },
      'p.bb.title': { es: 'Calculadora de código de desbloqueo BlackBerry (MEP / PRD)', en: 'BlackBerry unlock code calculator (MEP / PRD)' },
      'p.bb.desc': { es: 'Genera los 5 candidatos MEP para BlackBerry a partir del MEP/PRD y el IMEI. 231 MEP y ~7000 PRD. En el navegador.', en: 'Generate the 5 MEP candidates for BlackBerry from the MEP/PRD and IMEI. 231 MEP and ~7000 PRD. In-browser.' },
      'p.bb.h1': { es: 'Código de desbloqueo BlackBerry', en: 'BlackBerry unlock code' },
      'p.bb.intro': { es: 'Introduce el código MEP o PRD del terminal y su IMEI. Se generan los 5 candidatos MEP1–MEP5 (HMAC-SHA1 con la clave del MEP).', en: 'Enter the device MEP or PRD code and its IMEI. The 5 MEP1–MEP5 candidates are generated (HMAC-SHA1 keyed by the MEP).' },
      'p.bb.how': { es: 'Las tablas de 231 MEP y ~7000 PRD se cargan bajo demanda; el código es un HMAC-SHA1 del IMEI con la clave secreta del MEP.', en: 'The 231 MEP and ~7000 PRD tables load on demand; the code is an HMAC-SHA1 of the IMEI keyed by the MEP secret.' },
      't.bb.code': { es: 'MEP o PRD', en: 'MEP or PRD' },
    },
    keywords: 'BlackBerry unlock code, MEP PRD, código desbloqueo BlackBerry, IMEI, MEP1',
  },
  {
    slug: 'firmware/decrypt', tool: 'decrypt', group: 'firmware', icon: '🔓',
    t: {
      'p.dec.nav': { es: 'Descifrar ROM', en: 'Decrypt ROM' },
      'p.dec.title': { es: 'Descifrar firmware Nokia DCT4 (MCU/PPM) online', en: 'Decrypt Nokia DCT4 firmware (MCU/PPM) online' },
      'p.dec.desc': { es: 'Descifra ROMs de firmware Nokia DCT4 (MCU y PPM) y detecta el CryptKey, todo en el navegador. Verificado contra el binario de referencia.', en: 'Decrypt Nokia DCT4 firmware ROMs (MCU and PPM) and detect the CryptKey, all in-browser. Verified against the reference binary.' },
      'p.dec.h1': { es: 'Descifrar ROM Nokia DCT4', en: 'Decrypt Nokia DCT4 ROM' },
      'p.dec.intro': { es: 'Sube una ROM DCT4 (MCU o PPM) de un Nokia como el 6020 (RM-30). Se detecta el tipo y, en MCU, la clave se calcula sola. No desbloquea el teléfono: abre el firmware.', en: 'Upload a DCT4 ROM (MCU or PPM) from a Nokia such as the 6020 (RM-30). The type is detected and, for MCU, the key is computed automatically. This does not SIM-unlock the phone: it opens the firmware.' },
      'p.dec.how': { es: 'Port de dct4decrypt (basado en DCT4Crypt de g3gg0), verificado byte a byte contra el binario C. El CryptKey es la clave de la imagen, no el IMEI.', en: 'Port of dct4decrypt (based on g3gg0\'s DCT4Crypt), verified byte-for-byte against the C binary. The CryptKey is the image key, not the IMEI.' },
      't.dec.auto': { es: 'Autodetectar clave (MCU)', en: 'Auto-detect key (MCU)' },
      't.dec.key': { es: 'CryptKey (hex)', en: 'CryptKey (hex)' },
      't.dec.run': { es: 'Descifrar', en: 'Decrypt' },
    },
    keywords: 'Nokia DCT4 decrypt, descifrar firmware Nokia, DCT4 CryptKey, MCU PPM, 6020 RM-30, DCT4Crypt',
  },
  {
    slug: 'firmware/extract', tool: 'extract', group: 'firmware', icon: '🎵',
    t: {
      'p.ext.nav': { es: 'Extraer tonos', en: 'Extract tones' },
      'p.ext.title': { es: 'Extraer tonos y recursos de firmware Nokia DCT4', en: 'Extract tones & assets from Nokia DCT4 firmware' },
      'p.ext.desc': { es: 'Escanea una ROM DCT4 descifrada y extrae tonos MIDI, WAV, SMAF, iMelody y más. Gratis, en el navegador.', en: 'Scan a decrypted DCT4 ROM and extract MIDI, WAV, SMAF, iMelody tones and more. Free, in-browser.' },
      'p.ext.h1': { es: 'Extraer tonos y recursos', en: 'Extract tones & assets' },
      'p.ext.intro': { es: 'Sube una ROM DCT4 ya descifrada para sacar sus tonos y recursos embebidos (MIDI, WAV, SMAF, iMelody, MThc…). Descarga cada uno.', en: 'Upload an already-decrypted DCT4 ROM to pull out its embedded tones and assets (MIDI, WAV, SMAF, iMelody, MThc…). Download each one.' },
      'p.ext.how': { es: 'Port de ToneSniffer; las extracciones son idénticas a la herramienta de referencia. Primero descifra la ROM en la pestaña anterior.', en: 'Port of ToneSniffer; extractions are identical to the reference tool. Decrypt the ROM first in the previous tool.' },
      't.ext.run': { es: 'Escanear', en: 'Scan' },
    },
    keywords: 'Nokia ringtones extract, extraer tonos Nokia, DCT4 melodies, MThc, MIDI, ToneSniffer, firmware assets',
  },
  {
    slug: 'firmware/mthc', tool: 'mthc', group: 'firmware', icon: '🎼',
    t: {
      'p.mthc.nav': { es: 'MThc → MIDI', en: 'MThc → MIDI' },
      'p.mthc.title': { es: 'Convertir tono Nokia MThc a MIDI estándar', en: 'Convert Nokia MThc tone to standard MIDI' },
      'p.mthc.desc': { es: 'Convierte un tono comprimido Nokia MThc a un archivo MIDI estándar descargable. Experimental, en el navegador.', en: 'Convert a compressed Nokia MThc tone into a standard downloadable MIDI file. Experimental, in-browser.' },
      'p.mthc.h1': { es: 'MThc → MIDI', en: 'MThc → MIDI' },
      'p.mthc.intro': { es: 'Sube un tono MThc (MIDI comprimido de Nokia DCT4) para convertirlo a MIDI estándar. Función experimental (port fiel de MidiDecode).', en: 'Upload an MThc tone (Nokia DCT4 compressed MIDI) to convert it to standard MIDI. Experimental feature (faithful MidiDecode port).' },
      'p.mthc.how': { es: 'Descompresor LZ + reensamblado de pistas MThd/MTrk. Marcado experimental: no verificado contra un tono real por falta de muestra.', en: 'LZ decompressor + MThd/MTrk track reassembly. Marked experimental: not verified against a real tone due to lack of a sample.' },
      't.mthc.run': { es: 'Convertir a MIDI', en: 'Convert to MIDI' },
    },
    keywords: 'MThc to MIDI, Nokia compressed MIDI, MThc decoder, MidiDecode, DCT4 ringtone convert',
  },
];

// merge per-page strings into L
for (const p of PAGES) if (p.t) for (const k in p.t) L[k] = p.t[k];
const KEY = (slug) => slug || 'home';
const pk = (p, s) => `p.${{ '': 'home', 'unlock/huawei': 'hw', 'unlock/zte': 'zte', 'unlock/alcatel': 'alc', 'unlock/blackberry': 'bb', 'firmware/decrypt': 'dec', 'firmware/extract': 'ext', 'firmware/mthc': 'mthc' }[p.slug]}.${s}`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rel = (depth) => '../'.repeat(depth);
const depthOf = (slug) => (slug ? slug.split('/').length : 0);
const absUrl = (slug) => SITE.baseUrl + (slug ? '/' + slug + '/' : '/');
const t = (key, tag = 'span', attrs = '') => `<${tag} data-i18n="${key}"${attrs}>${esc(L[key].es)}</${tag}>`;

function navHtml(cur) {
  const d = depthOf(cur.slug), r = rel(d);
  const link = (slug, key, active, icon) => `<a href="${r}${slug ? slug + '/' : ''}"${active ? ' aria-current="page" class="active"' : ''}><span class="ni" aria-hidden="true">${icon}</span><span data-i18n="${key}">${esc(L[key].es)}</span></a>`;
  const groups = { unlock: PAGES.filter((p) => p.group === 'unlock'), firmware: PAGES.filter((p) => p.group === 'firmware') };
  const grp = (g, labelKey) => `<div class="nav-group"><span class="nav-h" data-i18n="${labelKey}">${esc(L[labelKey].es)}</span>${groups[g].map((p) => link(p.slug, pk(p, 'nav'), p.slug === cur.slug, p.icon)).join('')}</div>`;
  return `<nav class="sidebar-nav" aria-label="tools">${link('', 'nav.home', cur.slug === '', '🏠')}${grp('firmware', 'nav.firmware')}${grp('unlock', 'nav.unlock')}</nav>`;
}

function jsonLd(p) {
  const url = absUrl(p.slug);
  const blocks = [];
  if (!p.slug) {
    blocks.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: SITE.baseUrl, inLanguage: ['es', 'en'], description: L['p.home.desc'].es });
    blocks.push({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: PAGES.filter((x) => x.tool).map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: L[pk(x, 'title')].es, url: absUrl(x.slug) })) });
  } else {
    blocks.push({
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: L[pk(p, 'title')].es, url,
      applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)', description: L[pk(p, 'desc')].es,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, isAccessibleForFree: true, inLanguage: ['es', 'en'], author: { '@type': 'Person', name: SITE.author },
    });
    blocks.push({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: L['nav.home'].es, item: SITE.baseUrl + '/' },
        { '@type': 'ListItem', position: 2, name: L[p.group === 'unlock' ? 'nav.unlock' : 'nav.firmware'].es, item: url },
        { '@type': 'ListItem', position: 3, name: L[pk(p, 'nav')].es, item: url },
      ],
    });
  }
  return blocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join('\n');
}

function homeGrid() {
  const card = (p) => `<a class="tool-card" href="${p.slug}/"><span class="ico" aria-hidden="true">${p.icon}</span><span class="tc-title" data-i18n="${pk(p, 'nav')}">${esc(L[pk(p, 'nav')].es)}</span><span class="tc-desc" data-i18n="${pk(p, 'desc')}">${esc(L[pk(p, 'desc')].es)}</span></a>`;
  const section = (g, labelKey, icon) => `<section class="home-group"><h2><span aria-hidden="true">${icon}</span> <span data-i18n="${labelKey}">${esc(L[labelKey].es)}</span></h2><div class="tool-grid">${PAGES.filter((x) => x.group === g && x.tool).map(card).join('')}</div></section>`;
  return `${section('firmware', 'nav.firmware', '📟')}${section('unlock', 'nav.unlock', '🔓')}`;
}

function relatedHtml(cur) {
  const sib = PAGES.filter((p) => p.tool && p.slug !== cur.slug);
  const r = rel(depthOf(cur.slug));
  return `<section class="related"><h2 data-i18n="ui.related">${esc(L['ui.related'].es)}</h2><div class="rel-links">${sib.map((p) => `<a href="${r}${p.slug}/"><span aria-hidden="true">${p.icon}</span> <span data-i18n="${pk(p, 'nav')}">${esc(L[pk(p, 'nav')].es)}</span></a>`).join('')}</div></section>`;
}

function page(p) {
  const d = depthOf(p.slug), r = rel(d), url = absUrl(p.slug);
  const titleKey = pk(p, 'title'), descKey = pk(p, 'desc');
  const title = esc(L[titleKey].es), desc = esc(L[descKey].es);
  const body = p.tool
    ? `<article class="tool"><nav class="crumbs" aria-label="breadcrumb"><a href="${r}" data-i18n="nav.home">${esc(L['nav.home'].es)}</a> › <span data-i18n="${p.group === 'unlock' ? 'nav.unlock' : 'nav.firmware'}">${esc(L[p.group === 'unlock' ? 'nav.unlock' : 'nav.firmware'].es)}</span> › <span data-i18n="${pk(p, 'nav')}">${esc(L[pk(p, 'nav')].es)}</span></nav>
      <h1 data-i18n="${pk(p, 'h1')}">${esc(L[pk(p, 'h1')].es)}</h1>
      <p class="lede" data-i18n="${pk(p, 'intro')}">${esc(L[pk(p, 'intro')].es)}</p>
      <div class="panel">${TOOLS[p.tool]}</div>
      <section class="howto"><h2 data-i18n="ui.howto">${esc(L['ui.howto'].es)}</h2><p data-i18n="${pk(p, 'how')}">${esc(L[pk(p, 'how')].es)}</p></section>
      ${relatedHtml(p)}</article>`
    : `<section class="hero"><h1 data-i18n="p.home.h1">${esc(L['p.home.h1'].es)}</h1><p class="lede" data-i18n="p.home.intro">${esc(L['p.home.intro'].es)}</p></section>${homeGrid()}`;

  return `<!doctype html>
<html lang="es" data-slug="${KEY(p.slug)}" data-title-key="${titleKey}" data-desc-key="${descKey}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · ${SITE.name}</title>
<meta name="description" content="${desc}" />
<meta name="keywords" content="${esc(p.keywords || '')}" />
<link rel="canonical" href="${url}" />
<meta name="color-scheme" content="light dark" />
<meta name="theme-color" content="#0f766e" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${SITE.name}" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${desc}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${SITE.baseUrl}/assets/og.svg" />
<meta property="og:locale" content="es_ES" />
<meta property="og:locale:alternate" content="en_US" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${desc}" />
<meta name="twitter:image" content="${SITE.baseUrl}/assets/og.svg" />
<link rel="icon" href="${r}assets/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="${r}css/style.css" />
<script>(function(){try{var t=localStorage.getItem('rpt-theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;var l=localStorage.getItem('rpt-lang');if(l)document.documentElement.lang=l;}catch(e){}})();</script>
${jsonLd(p)}
</head>
<body${p.tool ? ` data-tool="${p.tool}"` : ''}>
<a class="skip" href="#main">Saltar al contenido</a>
<header class="appbar">
  <button class="menu-toggle" id="menu-toggle" aria-label="Menu" aria-expanded="false" aria-controls="sidebar"><span></span><span></span><span></span></button>
  <a class="brand" href="${r}"><span class="logo" aria-hidden="true">📟</span> <span class="brand-t">${SITE.name}</span></a>
  <div class="controls">
    <button id="lang-btn" class="chip" aria-label="Language">🌐 <span id="lang-cur">ES</span></button>
    <button id="theme-btn" class="chip icon-btn" aria-label="Theme"></button>
  </div>
</header>
<div class="backdrop" id="backdrop" hidden></div>
<div class="layout">
  <aside class="sidebar" id="sidebar">${navHtml(p)}</aside>
  <main id="main" class="content">
${body}
  </main>
</div>
<footer class="site-footer"><div class="footer-inner">
  <p data-i18n="ui.privacy">${esc(L['ui.privacy'].es)}</p>
  <p class="small" data-i18n="foot.disclaimer">${esc(L['foot.disclaimer'].es)}</p>
  <p class="small"><a href="${SITE.repo}" rel="noopener">GitHub</a> · <a href="${r}README.md">README</a></p>
</div></footer>
<script type="module" src="${r}js/shell.js"></script>
${p.tool ? `<script type="module" src="${r}js/app.js"></script>` : ''}
</body>
</html>`;
}

// ---- write pages -----------------------------------------------------------
for (const p of PAGES) {
  const dir = path.join(ROOT, p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page(p));
}

// ---- i18n runtime data -----------------------------------------------------
const pageMeta = {};
for (const p of PAGES) pageMeta[KEY(p.slug)] = { title: { es: L[pk(p, 'title')].es, en: L[pk(p, 'title')].en }, desc: { es: L[pk(p, 'desc')].es, en: L[pk(p, 'desc')].en } };
fs.writeFileSync(path.join(ROOT, 'js', 'i18n-data.js'),
  `// generated by build.mjs — do not edit\nexport const I18N = ${JSON.stringify(L)};\nexport const PAGEMETA = ${JSON.stringify(pageMeta)};\nexport const LANGS = ${JSON.stringify(SITE.langs)};\n`);

// ---- sitemap / robots / llms ----------------------------------------------
const now = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  PAGES.map((p) => `  <url><loc>${absUrl(p.slug)}</loc><lastmod>${now}</lastmod><changefreq>monthly</changefreq><priority>${p.slug ? '0.8' : '1.0'}</priority></url>`).join('\n') +
  `\n</urlset>\n`);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE.baseUrl}/sitemap.xml\n`);
fs.writeFileSync(path.join(ROOT, 'llms.txt'),
  `# ${SITE.name}\n\n> ${L['p.home.desc'].en}\n\nFree, client-side (no upload) tools for retro phones and modems.\n\n## Unlock code calculators (from IMEI)\n` +
  PAGES.filter((p) => p.group === 'unlock').map((p) => `- [${L[pk(p, 'title')].en}](${absUrl(p.slug)}): ${L[pk(p, 'desc')].en}`).join('\n') +
  `\n\n## Nokia DCT4 firmware tools\n` +
  PAGES.filter((p) => p.group === 'firmware').map((p) => `- [${L[pk(p, 'title')].en}](${absUrl(p.slug)}): ${L[pk(p, 'desc')].en}`).join('\n') +
  `\n\n## Notes\n- The unlock calculators cover OLD Huawei/ZTE USB modems and legacy Alcatel/BlackBerry handsets; they do not work on modern smartphones.\n- The DCT4 firmware tools decrypt/inspect Nokia firmware; they do NOT SIM-unlock a phone. The CryptKey is unrelated to the IMEI.\n- Source: ${SITE.repo}\n`);

console.log(`Generated ${PAGES.length} pages + i18n-data.js + sitemap.xml + robots.txt + llms.txt`);
