# Dialysis Log (PWA) – v1
Static, offline-first tracker. No build step. Research and direction choice: `research.md`.

- `config.js` – **edit to launch Pro**: `GUMROAD_PRODUCT_ID` and `CHECKOUT_URL` are EMPTY placeholders until Slade creates the Gumroad product. While empty, the app is fully free and Pro shows "coming soon".
- `sw.js` – service worker; bump `VERSION` on every publish.
- `privacy.html` – privacy + not-medical-advice page (link from Gumroad).
- Pro unlock = Gumroad per-buyer license key, verified once from the browser (api.gumroad.com allows CORS), then offline; refunds/chargebacks/disabled keys refused and re-checked ~monthly; 5 activations per key. Licenses never travel in backups.

## Gumroad setup
1. New digital product "Dialysis Log Pro", one-time price (config shows $2.99 – change `PRO_PRICE` to match).
2. Tick "Generate a unique license key per sale"; copy the product_id it shows.
3. Receipt text: "Open Dialysis Log → More → About Pro / enter license key, while online."
4. Paste product_id + product link into `config.js`, bump `VERSION` in `sw.js`, redeploy.

Tests: `/workspace/dialysis-tests/test_app.py` (Playwright, Gumroad mocked).

## Terms of Use
`terms.html` holds the Terms of Use. On first open (and for existing users once) the app shows a required agree step before anything else. The agreement is stored on the device under `dialysislog:terms` as `{agreed, version, at}`. **When you change terms.html, also change `TERMS_VERSION` in config.js and bump `VERSION` in sw.js**; everyone is then asked to agree again.
