// Site shell: theme detection/toggle + locale detection/switch (es/en).
// Runs on every page. Translates all [data-i18n]/[data-i18n-ph] nodes and keeps
// <title>/<meta description> in sync per page. Dispatches 'langchange'.
import { I18N, PAGEMETA, LANGS } from './i18n-data.js';

const html = document.documentElement;

function detectLang() {
  try { const s = localStorage.getItem('rpt-lang'); if (s && LANGS.includes(s)) return s; } catch {}
  const n = (navigator.language || 'es').slice(0, 2).toLowerCase();
  return LANGS.includes(n) ? n : LANGS[0];
}
let lang = LANGS.includes(html.lang) ? html.lang : detectLang();

function translate(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = I18N[el.dataset.i18n]?.[lang];
    if (v != null) el.textContent = v;
  });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    const v = I18N[el.dataset.i18nPh]?.[lang];
    if (v != null) el.placeholder = v;
  });
}

function applyLang(l) {
  lang = l; html.lang = l;
  try { localStorage.setItem('rpt-lang', l); } catch {}
  translate(document);
  const meta = PAGEMETA[html.dataset.slug];
  if (meta) {
    document.title = `${meta.title[l]} · Retro Phone Tools`;
    document.querySelector('meta[name=description]')?.setAttribute('content', meta.desc[l]);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', meta.title[l]);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', meta.desc[l]);
  }
  const cur = document.getElementById('lang-cur'); if (cur) cur.textContent = l.toUpperCase();
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: l } }));
}

// theme toggle (initial value already set inline in <head> to avoid FOUC)
document.getElementById('theme-btn')?.addEventListener('click', () => {
  const t = html.dataset.theme === 'dark' ? 'light' : 'dark';
  html.dataset.theme = t;
  try { localStorage.setItem('rpt-theme', t); } catch {}
});

// language cycle (es ⇄ en)
document.getElementById('lang-btn')?.addEventListener('click', () => {
  applyLang(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]);
});

applyLang(lang);
