// utils/sanitize.js

// remove C0 control chars + DEL, trim, and normalize unicode
export const sanitize = (v) =>
  String(v ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]+/g, '')
    .trim();

// collapse internal whitespace (nice for names, etc.)
export const collapseWhitespace = (v) =>
  sanitize(v).replace(/\s+/g, ' ');

// CSV-safe cell (quote + escape quotes) — if you ever build CSV client-side
export const csvCell = (v) => `"${sanitize(v).replace(/"/g, '""')}"`;

// sanitize every string value in an object (shallow)
export const sanitizeObject = (obj = {}) => {
  const out = {};
  for (const k of Object.keys(obj)) {
    const val = obj[k];
    out[k] = typeof val === 'string' ? sanitize(val) : val;
  }
  return out;
};

// simple typed helpers
export const toSafeInt = (v, fallback = 0) => {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
};

export const toSafeFloat = (v, fallback = 0) => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

// guard against CSV injection characters at the start (if needed in UI)
export const stripCsvLeading = (v) => sanitize(v).replace(/^([=+\-@]+)/, "'$1");