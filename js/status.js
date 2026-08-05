/**
 * status.js — Single source of truth for project status matching.
 *
 * XLSX exports are inconsistent: accents may be composed (NFC, "ç" = U+00E7) or
 * decomposed (NFD, "c" + U+0327), and cells often carry non-breaking spaces.
 * Comparing raw strings therefore fails silently. Everything here normalizes
 * first, then compares.
 */

/** Statuses that belong in the follow-up panel. */
export const TRACKED_STATUSES = ['acompanhamento', 'producao'];

/**
 * Normalize a status cell: strip accents, collapse all whitespace, lowercase.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeStatus(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')                 // split "ç" into "c" + combining cedilla
    .replace(/[\u0300-\u036f]/g, '')  // drop the combining marks
    .replace(/\s+/g, ' ')             // NBSP/tabs/newlines -> single space
    .trim()
    .toLowerCase();
}

/**
 * True when the project status is Acompanhamento or Produção.
 * Uses substring matching so decorated values ("Produção - Em andamento") match.
 * @param {object} client
 * @returns {boolean}
 */
export function isTrackedStatus(client) {
  const status = normalizeStatus(client && client.status_projeto);
  if (!status) return false;
  return TRACKED_STATUSES.some(tracked => status.includes(tracked));
}

/**
 * Clients that should drive the panel: tracked status and not blocked from contact.
 * @param {object[]} clients
 * @returns {object[]}
 */
export function getActiveClients(clients) {
  if (!Array.isArray(clients)) return [];
  return clients.filter(c => isTrackedStatus(c) && !c.nao_entrar_em_contato);
}
