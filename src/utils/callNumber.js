// src/utils/callNumber.js
// ============================================================
// Dial-pad masking helpers. Trip responses carry `callNumber`: a SaveLife
// masked number the driver dials from their registered phone (null when
// the trip can't be called). Only this masked number is ever dialled —
// never the customer's own number.
// ============================================================

// Digits and a leading + only; null if nothing dialable is left.
export function sanitizeDialNumber(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  const cleaned = (raw.startsWith('+') ? '+' : '') + raw.replace(/\D/g, '');
  return cleaned.replace('+', '').length >= 3 ? cleaned : null;
}

// "••••1234" — last four digits of the user's own registered number.
export function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : '••••';
}
