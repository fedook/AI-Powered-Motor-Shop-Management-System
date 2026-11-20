/** Monetary helpers. Values are stored as PostgreSQL numeric(…,2) strings. */

export function toCents(value: string | number): number {
  const amount = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(amount)) throw new Error(`Invalid monetary value: ${value}`);
  return Math.round(amount * 100);
}

export function fromCents(cents: number): string {
  if (!Number.isFinite(cents)) throw new Error("Invalid cents value");
  return (cents / 100).toFixed(2);
}

export function money(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const amount = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

export function moneyString(value: string | number): string {
  return fromCents(toCents(value));
}
