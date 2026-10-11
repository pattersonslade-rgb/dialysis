/* Dialysis Log settings: the only file you need to edit to launch Pro.
 *
 * >>> PLACEHOLDER: GUMROAD_PRODUCT_ID is intentionally EMPTY. <<<
 *   Slade has not created the Gumroad product yet. Do NOT guess it.
 *   After creating the product on Gumroad with "Generate a unique license key per sale" ticked,
 *   copy the product_id Gumroad shows and paste it between the quotes below.
 *   While it is empty, the app works fully for free and the Pro screen says "coming soon".
 * CHECKOUT_URL: the Gumroad product link (e.g. "https://sladepatterson.gumroad.com/l/xxxx"). Also EMPTY until created.
 * License keys are verified ONCE online with Gumroad (api.gumroad.com allows browser CORS calls); after that Pro
 *   works offline. Refunded / charged-back / disabled keys are refused and re-checked about every RECHECK_DAYS.
 * DEV_MODE: keep false in production. When true, the code DIALYSIS-TEST unlocks Pro without the network.
 */
window.DIALYSIS_CONFIG = {
  APP_NAME: "Dialysis Log",
  PRO_PRICE: "$2.99",                         // shown in the app; set to match the Gumroad price
  PRO_PRICE_NOTE: "One-time. No subscription.",
  CHECKOUT_URL: "",                           // PLACEHOLDER: Gumroad product link
  GUMROAD_PRODUCT_ID: "",                     // PLACEHOLDER: Gumroad product_id (never guess)
  LICENSE_VERIFY_URL: "https://api.gumroad.com/v2/licenses/verify",
  MAX_ACTIVATIONS: 5,
  RECHECK_DAYS: 30,
  SUPPORT_EMAIL: "",

  DEV_MODE: false,
  DEV_UNLOCK_CODE_SHA256: [
    "6295cce5840b077c9548f754a2c76fa0726a50927f331354c9296e8755c5dcb1" // DIALYSIS-TEST (only when DEV_MODE is true)
  ]
};
