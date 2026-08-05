/**
 * filters.js — Filter Engine and Search
 * Implements AND between categories, OR within category, partial case-insensitive search
 */

const STORAGE_KEY = 'deploy-panel-filters';

/**
 * Counts the number of follow-ups where ocorreu === 'sim' for a client.
 * @param {object} client
 * @returns {number}
 */
function countCompleted(client) {
  const followUps = client.followUps || {};
  let count = 0;
  for (let i = 0; i < 4; i++) {
    if (followUps[i] && followUps[i].ocorreu === 'sim') {
      count++;
    }
  }
  return count;
}

export class FilterEngine {
  constructor() {
    this._debounceTimer = null;
  }

  /**
   * Applies all active filters to a list of clients.
   * Uses AND logic between different filter categories, OR within a category if multiple values.
   * @param {Array} clients - Array of client objects
   * @param {object} filters - { leader, phase, status, search, urgency }
   * @returns {Array} Filtered clients
   */
  applyFilters(clients, filters) {
    if (!clients || !Array.isArray(clients)) return [];
    if (!filters) filters = {};

    // By default, hide clients marked as "nao_entrar_em_contato" unless filter explicitly asks for them
    let result = clients;
    if (!filters.showNaoContatar) {
      result = result.filter(client => !client.nao_entrar_em_contato);
    }

    const predicates = this.combineFilters(filters);
    result = result.filter(client => predicates.every(predicate => predicate(client)));

    // Apply search on top of filters
    if (filters.search && filters.search.trim()) {
      result = this.applySearch(result, filters.search);
    }

    return result;
  }

  /**
   * Applies a partial case-insensitive search across nome, projeto (cliente), líder, cidade, estado (uf).
   * @param {Array} clients - Array of client objects
   * @param {string} query - Search string
   * @returns {Array} Matching clients
   */
  applySearch(clients, query) {
    if (!clients || !Array.isArray(clients)) return [];
    if (!query || !query.trim()) return clients;

    const normalizedQuery = query.trim().toLowerCase();

    return clients.filter(client => {
      const searchableFields = [
        client.nome || '',
        client.cliente || '',
        client.lider || '',
        client.cidade || '',
        client.uf || '',
      ];

      return searchableFields.some(field =>
        field.toLowerCase().includes(normalizedQuery)
      );
    });
  }

  /**
   * Combines all active filter categories into an array of predicate functions.
   * AND logic between different categories; OR within same category (if arrays are used).
   * @param {object} filters - { leader, phase, status }
   * @returns {Array<Function>} Array of predicate functions
   */
  combineFilters(filters) {
    const predicates = [];

    if (!filters) return predicates;

    // Leader filter
    if (filters.leader && filters.leader !== 'todos') {
      if (Array.isArray(filters.leader)) {
        // OR within: match any of the leaders
        predicates.push(client =>
          filters.leader.some(l => (client.lider || '').toLowerCase() === l.toLowerCase())
        );
      } else {
        predicates.push(client =>
          (client.lider || '').toLowerCase() === filters.leader.toLowerCase()
        );
      }
    }

    // Phase filter
    if (filters.phase && filters.phase !== 'todos') {
      if (Array.isArray(filters.phase)) {
        predicates.push(client =>
          filters.phase.some(p => (client.status_projeto || '').toLowerCase() === p.toLowerCase())
        );
      } else {
        predicates.push(client =>
          (client.status_projeto || '').toLowerCase() === filters.phase.toLowerCase()
        );
      }
    }

    // Status filter (progress-based)
    if (filters.status && filters.status !== 'todos') {
      if (Array.isArray(filters.status)) {
        predicates.push(client =>
          filters.status.some(s => this._matchesStatus(client, s))
        );
      } else {
        predicates.push(client => this._matchesStatus(client, filters.status));
      }
    }

    return predicates;
  }

  /**
   * Checks if a client matches a given status filter value.
   * - "zero": 0 follow-ups completed
   * - "pendentes": 1-3 follow-ups completed
   * - "completos": all 4 follow-ups completed
   * - "todos": no filter (always matches)
   * @param {object} client
   * @param {string} status
   * @returns {boolean}
   */
  _matchesStatus(client, status) {
    const completed = countCompleted(client);

    switch (status) {
      case 'zero':
        return completed === 0;
      case 'pendentes':
        return completed >= 1 && completed <= 3;
      case 'completos':
        return completed === 4;
      case 'todos':
      default:
        return true;
    }
  }

  /**
   * Persists current filter state to sessionStorage.
   * @param {object} filters
   */
  persistFilters(filters) {
    try {
      const serialized = JSON.stringify(filters);
      sessionStorage.setItem(STORAGE_KEY, serialized);
    } catch (e) {
      // sessionStorage may not be available (e.g., in tests without browser)
      // Fail silently
    }
  }

  /**
   * Restores filter state from sessionStorage.
   * @returns {object|null} Saved filters or null if none found
   */
  restoreFilters() {
    try {
      const serialized = sessionStorage.getItem(STORAGE_KEY);
      if (!serialized) return null;
      return JSON.parse(serialized);
    } catch (e) {
      return null;
    }
  }

  /**
   * Creates a debounced search function that delays execution by 300ms.
   * @param {Function} callback - Function to call with search results: (filteredClients) => void
   * @param {Array} clients - Full list of clients to search in
   * @param {object} filters - Current active filters (applied before search)
   * @returns {Function} Debounced function accepting a search query string
   */
  createDebouncedSearch(callback, clients, filters) {
    return (query) => {
      if (this._debounceTimer) {
        clearTimeout(this._debounceTimer);
      }

      this._debounceTimer = setTimeout(() => {
        const updatedFilters = { ...filters, search: query };
        const results = this.applyFilters(clients, updatedFilters);
        callback(results);
      }, 300);
    };
  }

  /**
   * Cancels any pending debounced search.
   */
  cancelDebouncedSearch() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }
}
