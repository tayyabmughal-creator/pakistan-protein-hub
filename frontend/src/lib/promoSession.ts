const PROMO_SESSION_KEY = "applied_promo_code";

export const getAppliedPromoCode = () => {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(PROMO_SESSION_KEY) || "";
};

export const setAppliedPromoCode = (code: string) => {
  if (typeof window === "undefined") return;
  if (code) {
    window.sessionStorage.setItem(PROMO_SESSION_KEY, code);
  } else {
    window.sessionStorage.removeItem(PROMO_SESSION_KEY);
  }
};

export const clearAppliedPromoCode = () => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PROMO_SESSION_KEY);
};
