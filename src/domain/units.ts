/**
 * Lengths are stored in meters. The UI speaks centimeters.
 * Conversion goes through integer tenths of a centimeter (1 mm) so values
 * the user typed come back unchanged: mToCm(cmToM(140)) === 140.
 */

/** Round a centimeter value to the nearest 0.1 cm and convert to meters. */
export function cmToM(cm: number): number {
  return Math.round(cm * 10) / 1000;
}

/** Convert meters to centimeters rounded to 0.1 cm. */
export function mToCm(meters: number): number {
  return Math.round(meters * 1000) / 10;
}

/** Snap a meter value onto the 0.1 cm lattice used by the UI. */
export function roundM(meters: number): number {
  return cmToM(mToCm(meters));
}

export function formatCm(meters: number, digits = 1): string {
  return mToCm(meters).toFixed(digits);
}

/** Round millimeters to the nearest 1 mm and convert to meters. */
export function mmToM(mm: number): number {
  return Math.round(mm) / 1000;
}

/** Convert meters to millimeters rounded to 1 mm. */
export function mToMm(meters: number): number {
  return Math.round(meters * 1000);
}

export function formatMm(meters: number): string {
  return String(mToMm(meters));
}

export function normalizeDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  const wrapped = ((degrees % 360) + 360) % 360;
  const rounded = Math.round(wrapped * 1000) / 1000;
  return rounded === 360 ? 0 : rounded;
}
