/**
 * Authoritative phone normalisation (the browser runs the same rules in
 * src/lib/phone.ts for instant feedback; keep the two in step). Customers
 * write numbers as "0170 1234567" or "+49 170 1234567", so normalise to E.164
 * before validating and before any database lookup. A single leading 0 is a
 * German national number (+49) - this is a Berlin-only service.
 */

export function normalizePhone(input: string): string {
  let s = input.trim().replace(/\(0\)/g, "");
  const hasPlus = s.startsWith("+");
  s = s.replace(/\D/g, "");
  if (hasPlus) s = `+${s}`;
  else if (s.startsWith("00")) s = `+${s.slice(2)}`;
  else if (s.startsWith("0")) s = `+49${s.slice(1)}`;
  // "+49 0170 …" - the national trunk 0 is not part of the international form.
  if (s.startsWith("+490")) s = `+49${s.slice(4)}`;
  return s;
}

export function isValidPhone(normalized: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(normalized);
}
