/** Donation links and crypto address. */
export const DONATE = {
  /** CloudTips page for RUB donations (Russia). */
  cloudtipsUrl: "https://pay.cloudtips.ru/p/90454b32",
  /** Ko-fi page for international donations. */
  bmcUrl: "https://ko-fi.com/archival_maps",
  /** TRON (TRC-20) USDT address. */
  tronAddress: "TXNFMqYjAdWUPnsFMQYB7QgusXY23LSskj",
} as const;

/** Base58 alphabet used by TRON addresses (no 0, O, I, l). */
const BASE58_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

/** Known placeholder fragments we ship as defaults — should be replaced before going live. */
const PLACEHOLDER_FRAGMENTS = ["REPLACE_ME", "XXXXXXXX", "xxxxxxxx"];

export type DonateValidation = {
  cloudtipsOk: boolean;
  bmcOk: boolean;
  tronOk: boolean;
  /** Any issues to surface in UI. */
  issues: string[];
};

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_FRAGMENTS.some((f) => value.includes(f));
}

function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Validate TRON (TRC-20) address: starts with "T", 34 chars, Base58 alphabet. */
export function isValidTronAddress(addr: string): boolean {
  return typeof addr === "string" && addr.length === 34 && BASE58_RE.test(addr) && !isPlaceholder(addr);
}

export function validateDonate(d: typeof DONATE = DONATE): DonateValidation {
  const issues: string[] = [];

  const cloudtipsOk = isHttpsUrl(d.cloudtipsUrl) && !isPlaceholder(d.cloudtipsUrl);
  if (!cloudtipsOk) issues.push("CloudTips URL не настроен или содержит плейсхолдер.");

  const bmcOk = isHttpsUrl(d.bmcUrl) && !isPlaceholder(d.bmcUrl);
  if (!bmcOk) issues.push("Ko-fi / Buy Me a Coffee URL не настроен.");

  const tronOk = isValidTronAddress(d.tronAddress);
  if (!tronOk) issues.push("TRON-адрес (TRC-20) в неверном формате или это плейсхолдер.");

  return { cloudtipsOk, bmcOk, tronOk, issues };
}
