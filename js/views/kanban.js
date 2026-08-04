/**
 * views/kanban.js — Kanban Board View
 * Renders 5 columns based on follow-up completion count
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { FilterEngine } from '../filters.js';

/**
 * Column definitions for the Kanban board.
 * Index matches the count of follow-ups with ocorreu === "sim".
 */
export const KANBAN_COLUMNS = [
  { id: 0, title: 'Sem contato' },
  { id: 1, title: '1º acompanhamento' },
  { id: 2, title: '2º acompanhamento' },
  { id: 3, title: '3º acompanhamento' },
  { id: 4, title: 'Completo (4/4)' },
];

/**
 * Count the number of follow-up slots where ocorreu === "sim".
 * @param {object} client - Client object with followUps
 * @returns {number} 0–4
 */
export function countCompletedFollowUps(client) {
  const followUps = client.followUps || {};
  let count = 0;
  for (let i = 0; i < 4; i++) {
    if (followUps[i] && followUps[i].ocorreu === 'sim') {
      count++;
    }
  }
  return count;
}

/**
 * Calculate the number of days until the next pending follow-up.
 * Returns null if the client has no pending dates (datas_previstas empty/missing).
 * @param {object} client - Client object with followUps and datas_previstas
 * @param {Date} [today] - Reference date (defaults to now)
 * @returns {number|null} Days until next pending contact (negative = overdue), or null
 */
export function daysUntilNextContact(client, today) {
  const referenceDate = today || new Date();
  const datas = client.datas_previstas;

  if (!datas || !Array.isArray(datas) || datas.length === 0) {
    return null;
  }

  const followUps = client.followUps || {};

  // Find the first slot that hasn't occurred yet and has a scheduled date
  for (let i = 0; i < 4; i++) {
    const slotOccurred = followUps[i] && followUps[i].ocorreu === 'sim';
    if (!slotOccurred && datas[i]) {
      const expectedDate = new Date(datas[i] + 'T00:00:00');
      if (isNaN(expectedDate.getTime())) continue;
      const todayNormalized = new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        referenceDate.getDate()
      );
      const diffMs = expectedDate.getTime() - todayNormalized.getTime();
      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }
  }

  return null;
}

/**
 * Determine urgency level based on days until next contact.
 * @param {number|null} days - Days until next contact
 * @returns {'ok'|'warn'|'bad'|null} Urgency level, or null if no date
 */
export function getUrgencyLevel(days) {
  if (days === null || days === undefined) return null;
  if (days < 0) return 'bad';
  if (days <= 7) return 'warn';
  return 'ok';
}

/**
 * Determine the Kanban column index for a client.
 * @param {object} client
 * @returns {number} 0–4
 */
export function getColumnIndex(client) {
  return countCompletedFollowUps(client);
}

export class KanbanView {
  /**
   * @param {HTMLElement} container - DOM element to render into (#view-container)
   * @param {object} stateManager - StateManager instance
   * @param {object} [options] - Optional configuration
   * @param {Function} [options.onClientClick] - Callback when a client card is clicked
   * @param {FilterEngine} [options.filterEngine] - FilterEngine instance for filtering
   */
  constructor(container, stateManager, options = {}) {
    this.container = container;
    this.stateManager = stateManager;
    this.onClientClick = options.onClientClick || null;
    this.filterEngine = options.filterEngine || new FilterEngine();
    this._currentFilters = {};
    this._boundOnClientsUpdated = this._onClientsUpdated.bind(this);
  }

  /**
   * Render the Kanban board with client data.
   * @param {object[]} [data] - Array of client objects (if not provided, fetches from stateManager)
   */
  render(data) {
    const clients = data || this.stateManager.getClients();
    const filteredClients = this.filterEngine.applyFilters(clients, this._currentFilters);

    // Group clients into columns
    const columns = this._groupByColumn(filteredClients);

    // Build the Kanban HTML
    this.container.innerHTML = this._buildBoardHTML(columns);

    // Attach click listeners to cards
    this._attachCardListeners();
  }

  /**
   * Clean up event listeners and DOM.
   */
  destroy() {
    this.container.innerHTML = '';
  }

  /**
   * Handle filter changes — re-render with new filters.
   * @param {object} filters
   */
  onFilterChange(filters) {
    this._currentFilters = filters || {};
    this.render();
  }

  /**
   * Groups clients into columns by their completed follow-up count.
   * @param {object[]} clients
   * @returns {Map<number, object[]>}
   */
  _groupByColumn(clients) {
    const columns = new Map();
    for (const col of KANBAN_COLUMNS) {
      columns.set(col.id, []);
    }

    for (const client of clients) {
      const colIndex = getColumnIndex(client);
      // Clamp to 0-4 range
      const safeIndex = Math.max(0, Math.min(4, colIndex));
      columns.get(safeIndex).push(client);
    }

    return columns;
  }

  /**
   * Builds the complete Kanban board HTML.
   * @param {Map<number, object[]>} columns
   * @returns {string} HTML string
   */
  _buildBoardHTML(columns) {
    const columnElements = KANBAN_COLUMNS.map(col => {
      const clients = columns.get(col.id) || [];
      return this._buildColumnHTML(col, clients);
    }).join('');

    return `<div class="kanban-board">${columnElements}</div>`;
  }

  /**
   * Builds HTML for a single Kanban column.
   * @param {object} column - Column definition { id, title }
   * @param {object[]} clients - Clients in this column
   * @returns {string} HTML string
   */
  _buildColumnHTML(column, clients) {
    const cards = clients.map(client => this._buildCardHTML(client)).join('');

    return `
      <div class="kanban-column" data-column-id="${column.id}">
        <div class="kanban-column__header">
          <h3 class="kanban-column__title">${column.title}</h3>
          <span class="kanban-column__count">${clients.length}</span>
        </div>
        <div class="kanban-column__cards">
          ${cards || '<p class="kanban-column__empty">Nenhum cliente</p>'}
        </div>
      </div>
    `;
  }

  /**
   * Builds HTML for a single client card.
   * @param {object} client
   * @returns {string} HTML string
   */
  _buildCardHTML(client) {
    const days = daysUntilNextContact(client);
    const urgency = getUrgencyLevel(days);
    const isOverdue = urgency === 'bad';
    const hasNoDates = !client.datas_previstas || client.datas_previstas.length === 0;

    // Build urgency class
    const urgencyClass = urgency ? `urgency--${urgency}` : '';
    const overdueClass = isOverdue ? 'kanban-card--overdue' : '';

    // Days display
    let daysDisplay;
    if (hasNoDates) {
      daysDisplay = '<span class="kanban-card__no-date">Sem data prevista</span>';
    } else if (days === null) {
      // All slots completed - no pending date
      daysDisplay = '<span class="kanban-card__complete">Completo</span>';
    } else if (days < 0) {
      daysDisplay = `<span class="kanban-card__days kanban-card__days--overdue">${days}d (atrasado)</span>`;
    } else if (days === 0) {
      daysDisplay = `<span class="kanban-card__days kanban-card__days--today">Hoje</span>`;
    } else {
      daysDisplay = `<span class="kanban-card__days">${days}d</span>`;
    }

    // Urgency dot indicator
    const urgencyDot = urgency
      ? `<span class="kanban-card__urgency-dot kanban-card__urgency-dot--${urgency}" aria-label="Urgência: ${this._urgencyLabel(urgency)}"></span>`
      : '';

    return `
      <div class="kanban-card card ${urgencyClass} ${overdueClass}" data-client-id="${client.id}" role="button" tabindex="0" aria-label="Detalhes de ${this._escapeHTML(client.nome || '')}">
        <div class="kanban-card__header">
          <span class="kanban-card__nome">${this._escapeHTML(client.nome || '')}</span>
          ${urgencyDot}
        </div>
        <div class="kanban-card__lider">${this._escapeHTML(client.lider || '')}</div>
        <div class="kanban-card__meta">
          ${daysDisplay}
        </div>
      </div>
    `;
  }

  /**
   * Attaches click and keyboard listeners to cards.
   */
  _attachCardListeners() {
    const cards = this.container.querySelectorAll('.kanban-card[data-client-id]');
    cards.forEach(card => {
      const clientId = card.getAttribute('data-client-id');

      card.addEventListener('click', () => {
        this._handleCardClick(clientId);
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._handleCardClick(clientId);
        }
      });
    });
  }

  /**
   * Handles a card click — opens client details.
   * @param {string} clientId
   */
  _handleCardClick(clientId) {
    if (this.onClientClick) {
      this.onClientClick(clientId);
    }
  }

  /**
   * Handles state manager 'clients-updated' event.
   */
  _onClientsUpdated() {
    this.render();
  }

  /**
   * Get human-readable urgency label.
   * @param {'ok'|'warn'|'bad'} level
   * @returns {string}
   */
  _urgencyLabel(level) {
    switch (level) {
      case 'ok': return 'No prazo';
      case 'warn': return 'Próximo';
      case 'bad': return 'Atrasado';
      default: return '';
    }
  }

  /**
   * Escape HTML to prevent XSS.
   * @param {string} str
   * @returns {string}
   */
  _escapeHTML(str) {
    const div = typeof document !== 'undefined' ? document.createElement('div') : null;
    if (div) {
      div.textContent = str;
      return div.innerHTML;
    }
    // Fallback for non-browser environments (tests)
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
