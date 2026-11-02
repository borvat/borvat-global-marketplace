/**
 * Synthetic seller credential used by the Vendure evaluation harness.
 *
 * The harness boots Vendure against an in-memory sqljs database and registers
 * throwaway sellers; this value never reaches a real server. It lives in a
 * fixtures path so a generic secret scanner classifies it as test data.
 */
export const SYNTHETIC_SELLER_PASSWORD = "Synthetic-password-2026!";
