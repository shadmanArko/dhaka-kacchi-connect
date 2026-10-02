/**
 * Phone numbers are stored and matched in E.164 ("+491701234567"). Customers
 * type them the way they write them - "0170 1234567", "+49 170 123 4567",
 * "0049 (0)170-1234567" - so normalise first and validate the result, instead
 * of rejecting everything that isn't already machine-formatted. The server
 * runs the same rules (worker/src/lib/phone.ts) and is the authority; this
 * copy exists to give instant feedback and to send the server a clean value.
 *
 * A single leading 0 is read as a German national number (+49), because this
 * is a Berlin-only service. Anything else must carry its own + or 00 prefix.
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
