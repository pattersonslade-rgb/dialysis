/* Dialysis Log settings: the only file you need to edit to launch Pro.
 *
 * GUMROAD_PRODUCT_ID / CHECKOUT_URL: set Oct 11, 2026 for the Gumroad product "Dialysis Log Pro" (permalink aeklk).
 *   If either is emptied, the app works fully free and the Pro screen says "coming soon".
 * License keys are verified ONCE online with Gumroad (api.gumroad.com allows browser CORS calls); after that Pro
 *   works offline. Refunded / charged-back / disabled keys are refused and re-checked about every RECHECK_DAYS.
 * DEV_MODE: keep false in production. When true, the code DIALYSIS-TEST unlocks Pro without the network.
 */
window.DIALYSIS_CONFIG = {
  APP_NAME: "Dialysis Log",
  PRO_PRICE: "$4.99",                         // matches Gumroad (price_cents 499, USD, fixed price) checked Oct 11, 2026
  PRO_PRICE_NOTE: "One-time. No subscription.",
  CHECKOUT_URL: "https://pocketappstudio.gumroad.com/l/aeklk", // Gumroad product page for "Dialysis Log Pro"
  GUMROAD_PRODUCT_ID: "iJvHWo0Z03uhw7LEoJTuxA==", // matches the id on pocketappstudio.gumroad.com
  LICENSE_VERIFY_URL: "https://api.gumroad.com/v2/licenses/verify",
  MAX_ACTIVATIONS: 5,
  RECHECK_DAYS: 30,
  SUPPORT_EMAIL: "",
  TERMS_VERSION: "2026-10-14",                // change this when terms.html changes: everyone is asked to agree again

  DEV_MODE: false,
  DEV_UNLOCK_CODE_SHA256: [
    "6295cce5840b077c9548f754a2c76fa0726a50927f331354c9296e8755c5dcb1" // DIALYSIS-TEST (only when DEV_MODE is true)
  ]
};
