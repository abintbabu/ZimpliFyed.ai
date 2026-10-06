// ISO 6346 container numbers. Pure. Four letters (owner code + category U/J/Z), six digits, one check digit.
// The check digit catches the single-character typos and transposition errors that cause a booking to be
// rejected or cargo mis-tracked — validated deterministically, never trusted to a model's transcription.

const LETTER_VALUES: Record<string, number> = {};
{
  // A=10, then skip multiples of 11 (11, 22, 33): B=12 … K=21, L=23 … U=32, V=34 … Z=38
  let v = 10;
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (v % 11 === 0) v += 1;
    LETTER_VALUES[ch] = v;
    v += 1;
  }
}

/** Normalises "mscu 123456-7" → "MSCU1234567"; returns null if it cannot be a container number. */
export function normalizeContainerNumber(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z]{3}[UJZ]\d{7}$/.test(s) ? s : null;
}

/** The expected check digit for the first 10 characters. */
export function containerCheckDigit(first10: string): number {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = first10[i];
    const value = i < 4 ? LETTER_VALUES[ch] : Number(ch);
    sum += value * 2 ** i;
  }
  const d = sum % 11;
  return d === 10 ? 0 : d;
}

export type ContainerCheck = { ok: true; number: string } | { ok: false; reason: string };

export function checkContainerNumber(raw: string): ContainerCheck {
  const n = normalizeContainerNumber(raw);
  if (!n) return { ok: false, reason: 'A container number is 3 owner letters, U/J/Z, then 7 digits (e.g. MSCU1234565).' };
  const expected = containerCheckDigit(n.slice(0, 10));
  if (Number(n[10]) !== expected) return { ok: false, reason: `Check digit is wrong — ${n.slice(0, 10)} should end in ${expected}. Re-check the number against the bill of lading.` };
  return { ok: true, number: n };
}
