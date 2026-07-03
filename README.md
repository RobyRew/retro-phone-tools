# Retro Phone Tools

Free, **100% in-browser** tools for retro phones and modems — no install, nothing
uploaded. Two families, each tool on its own shareable, indexable page:

**Unlock-code calculators (from IMEI)**
- [Huawei](https://robyrew.github.io/retro-phone-tools/unlock/huawei/) · [ZTE](https://robyrew.github.io/retro-phone-tools/unlock/zte/) · [Alcatel](https://robyrew.github.io/retro-phone-tools/unlock/alcatel/) · [BlackBerry](https://robyrew.github.io/retro-phone-tools/unlock/blackberry/)

**Nokia DCT4 firmware**
- [Decrypt ROM](https://robyrew.github.io/retro-phone-tools/firmware/decrypt/) · [Extract tones](https://robyrew.github.io/retro-phone-tools/firmware/extract/) · [MThc → MIDI](https://robyrew.github.io/retro-phone-tools/firmware/mthc/)

**Live:** https://robyrew.github.io/retro-phone-tools/

## Features

- **Multi-page** — every tool is a real URL (great for sharing and search).
- **i18n** — Spanish/English with automatic detection (`navigator.language`) and a toggle; choice is remembered.
- **Theme** — light/dark auto-detected from the device, with a manual toggle; remembered.
- **SEO + AI** — per-page `<title>`/description/canonical, Open Graph + Twitter cards, JSON-LD (`SoftwareApplication`, `BreadcrumbList`, `ItemList`), `sitemap.xml`, `robots.txt`, and `llms.txt`.
- **No backend, no tracking.** Pure static site.

## Honest scope

- The unlock calculators cover **old** Huawei/ZTE USB modems and legacy Alcatel/BlackBerry handsets. They do **not** work on modern smartphones.
- The DCT4 firmware tools **decrypt/inspect** Nokia firmware; they do **not** SIM-unlock a phone. The *CryptKey* is the firmware-image key and is unrelated to the IMEI.
- Verification: the DCT4 decrypt is byte-identical to the C reference binary; the tone scanner matches the ToneSniffer reference; **MThc → MIDI is experimental** (faithful port, not verified against a real tone).

## How it's built

Static site generated from a single template:

```
build.mjs           generates all pages + js/i18n-data.js + sitemap/robots/llms
js/shell.js         theme + language runtime
js/app.js           tool wiring (per <body data-tool>)
js/unlock.js|dct4.js|tones.js|mthc.js   the verified algorithm ports
js/crypto.js        MD5/SHA-1
data/*.json         BlackBerry MEP/PRD tables
```

Regenerate with `node build.mjs`. Preview locally:

```bash
node build.mjs && python3 -m http.server 8000   # http://localhost:8000
```

CI (`.github/workflows/deploy.yml`) runs `node build.mjs` and deploys to GitHub Pages on every push to `main`.

## Credits & licence

MIT (the port). Algorithms from
[Go-Unlock-Code-Calculator](https://github.com/alexanderritola/Go-Unlock-Code-Calculator) and
[mobile-phone-tools](https://gitlab.com/Postrediori/mobile-phone-tools)
(based on [DCT4Crypt](https://github.com/g3gg0/DCT4Crypt) and [mtex](https://github.com/wackypack/mtex)).
See [`NOTICE`](NOTICE) and [`LICENSE`](LICENSE).
