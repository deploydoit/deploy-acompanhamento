/**
 * dates.js — Single source of truth for date parsing/formatting.
 *
 * Dates reach us in three shapes:
 *   - "DD/MM/YYYY"  (Brazilian, what the import writes)
 *   - "YYYY-MM-DD"  (ISO, what <input type="date"> requires and returns)
 *   - Excel serial numbers
 *
 * `<input type="date">` silently renders blank for anything that is not ISO,
 * which is why agenda-detected dates looked empty. Always pass values through
 * toISODate() before binding them to a date input.
 */

/**
 * Parse any supported representation into a Date at local midnight.
 * @param {unknown} value
 * @returns {Date|null} null when unparseable
 */
export function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  // Excel serial number (days since 1899-12-30)
  if (typeof value === 'number') {
    const ms = (value - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  const str = String(value).trim();
  if (!str) return null;

  // ISO: YYYY-MM-DD (optionally with a time component)
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  // Brazilian: DD/MM/YYYY (2- or 4-digit year)
  const br = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    let year = Number(br[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(br[2]) - 1, Number(br[1]));
  }

  return null;
}

/**
 * Format as YYYY-MM-DD — the only format <input type="date"> accepts.
 * @param {unknown} value
 * @returns {string} '' when unparseable
 */
export function toISODate(value) {
  const d = parseDate(value);
  if (!d) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Format as DD/MM/YYYY for reading on screen.
 * @param {unknown} value
 * @returns {string} '' when unparseable
 */
export function toBRDate(value) {
  const d = parseDate(value);
  if (!d) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/**
 * True when the date is today or earlier (i.e. the event already happened).
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPastOrToday(value) {
  const d = parseDate(value);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() <= today.getTime();
}

/**
 * Add days to a date, returning DD/MM/YYYY.
 * @param {unknown} value
 * @param {number} days
 * @returns {string} '' when unparseable
 */
export function addDays(value, days) {
  const d = parseDate(value);
  if (!d) return '';
  d.setDate(d.getDate() + days);
  return toBRDate(d);
}
