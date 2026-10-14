# Dialysis Log (PWA) – v1.2.0
Static, offline-first tracker. No build step. Research and direction choice: `research.md`.

- `config.js` – **edit to launch Pro**: `GUMROAD_PRODUCT_ID` and `CHECKOUT_URL` are set (product created Oct 11, 2026). If emptied, the app is fully free and Pro shows "coming soon".
- `sw.js` – service worker; bump `VERSION` on every publish.
- `privacy.html` – privacy + not-medical-advice page (link from Gumroad).
- Pro unlock = Gumroad per-buyer license key, verified once from the browser (api.gumroad.com allows CORS), then offline; refunds/chargebacks/disabled keys refused and re-checked ~monthly; 5 activations per key. Licenses never travel in backups.

## Gumroad setup
1. New digital product "Dialysis Log Pro", one-time price. Done: product `iJvHWo0Z03uhw7LEoJTuxA==`, https://sladepatterson.gumroad.com/l/aeklk, $4.99 (keep `PRO_PRICE` in config.js matching Gumroad).
2. Tick "Generate a unique license key per sale"; copy the product_id it shows.
3. Receipt text: "Open Dialysis Log → More → About Pro / enter license key, while online."
4. Paste product_id + product link into `config.js`, bump `VERSION` in `sw.js`, redeploy.

Tests: `/workspace/dialysis-tests/test_app.py` (Playwright, Gumroad mocked).

## Terms of Use
`terms.html` holds the Terms of Use. On first open (and for existing users once) the app shows a required agree step before anything else. The agreement is stored on the device under `dialysislog:terms` as `{agreed, version, at}`. **When you change terms.html, also change `TERMS_VERSION` in config.js and bump `VERSION` in sw.js**; everyone is then asked to agree again.

## v1.2.0 (Oct 14, 2026)
- **Spanish / Español:** full UI translation in `i18n-es.js` (keyed by the English text in `app.js`), plus `terms-es.html` and `privacy-es.html`. Auto-detects `navigator.language` es*, switchable in More → Settings → Language (saved on the device), and `?lang=es` / `?lang=en` in the URL. hreflang tags + sitemap entries added.
  **A review by a native Spanish speaker is recommended** before promoting the Spanish version (especially the Terms). The English Terms prevail if the two differ.
- **Printable blank weekly log sheet:** `log-sheet.html` / `log-sheet-es.html` (landscape print, QR to `?ref=print`), cached for offline.
- **Send today’s summary** (Today screen, free): Web Share API, clipboard fallback, link with `?ref=summary`.
- **Share this app** (More): QR generated offline with vendored `vendor/qrcode.js` (qrcode-generator, MIT, © Kazuhiko Arase) linking `?ref=qr`, native share/copy link with `?ref=share`.
- Terms now name the operator only as “Dialysis Log”; `TERMS_VERSION` → 2026-10-14 (users re-agree once).
- Support and refunds go through Gumroad only. No email address anywhere.
