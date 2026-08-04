/**
 * views/agenda.js — Agenda View
 * Renders timeline of upcoming follow-ups sorted by date.
 * Groups: "Atrasados" (overdue, top), "Esta semana", "Próximas semanas"
 * Requirements: 3.4, 7.4
 */

import { FilterEngine } from '../filters.js';

/**
 * Compute the difference in calendar days between two dates (ignoring time).
 * @param {Date} target - The target date
 * @param {Date} reference - The reference date (usually "today")
 * @returns {number} Positive = future, negative = past
 */
function diffDays(target, reference) {
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const r = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  return Math.round((t - r) / (1000 * 60 * 60 * 24));
}

/**
 * Format a relative days value into human-readable Portuguese text.
 * @param {number} days - Days relative to today (negative = overdue)
 * @returns {string}
 */
function formatRelativeDays(days) {
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Amanhã';
  if (days === -1) return 'Ontem';
  if (days < 0) return `${Math.abs(days)} dias atrás`;
  return `em ${days} dias`;
}

/**
 * Get the urgency CSS class based on days until the follow-up.
 * red: days < 0 (overdue), yellow: 0 ≤ days ≤ 7, green: days > 7
 * @param {number} days
 * @returns {string}
 */
function getUrgencyClass(days) {
  if (days < 0) return 'urgency--bad';
  if (days <= 7) return 'urgency--warn';
  return 'urgency--ok';
}

/**
 * Format an ISO date (YYYY-MM-DD) to DD/MM/AAAA.
 * @param {string} isoDate
 * @returns {string}
 */
function formatDateBR(isoDate) {
  if (!isoDate) return '—';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Check if a date falls within the current week (Monday to Sunday).
 * @param {Date} date
 * @param {Date} today
 * @returns {boolean}
 */
function isThisWeek(date, today) {
  const dayOfWeek = today.getDay();
  // Monday = start of week (adjusting Sunday=0 to be 7)
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return d >= monday && d <= sunday;
}

/**
 * Extract all pending follow-up entries from a list of clients.
 * A follow-up is pending when ocorreu !== 'sim' and it has a scheduled date.
 * @param {Array} clients
 * @param {Date} today
 * @returns {Array<{clientId, clientName, lider, date, dateISO, days, urgencyClass, slotIndex}>}
 */
export function extractPendingFollowUps(clients, today) {
  const entries = [];

  for (const client of clients) {
    const datas = client.datas_previstas || [];
    const followUps = client.followUps || {};

    for (let i = 0; i < 4; i++) {
      const slot = followUps[i] || {};
      // Skip if already completed
      if (slot.ocorreu === 'sim') continue;

      // Get the scheduled date for this slot
      const dateISO = datas[i];
      if (!dateISO) continue;

      const targetDate = new Date(dateISO + 'T00:00:00');
      if (isNaN(targetDate.getTime())) continue;

      const days = diffDays(targetDate, today);

      entries.push({
        clientId: client.id || client.codigo,
        clientName: client.nome || client.cliente || 'Cliente sem nome',
        lider: client.lider || '—',
        date: targetDate,
        dateISO: dateISO,
        days: days,
        urgencyClass: getUrgencyClass(days),
        slotIndex: i,
      });
    }
  }

  return entries;
}

/**
 * Group entries into Atrasados, Esta semana, Próximas semanas.
 * @param {Array} entries - sorted entries from extractPendingFollowUps
 * @param {Date} today
 * @returns {{ atrasados: Array, estaSemana: Array, proximasSemanas: Array }}
 */
export function groupEntries(entries, today) {
  const atrasados = [];
  const estaSemana = [];
  const proximasSemanas = [];

  for (const entry of entries) {
    if (entry.days < 0) {
      atrasados.push(entry);
    } else if (isThisWeek(entry.date, today)) {
      estaSemana.push(entry);
    } else {
      proximasSemanas.push(entry);
    }
  }

  // Sort: overdue by most overdue first (most negative days first)
  atrasados.sort((a, b) => a.days - b.days);
  // Sort upcoming by date ascending
  estaSemana.sort((a, b) => a.days - b.days);
  proximasSemanas.sort((a, b) => a.days - b.days);

  return { atrasados, estaSemana, proximasSemanas };
}

export class AgendaView {
  /**
   * @param {HTMLElement} container - The DOM container (#view-container)
   * @param {object} stateManager - StateManager instance
   */
  constructor(container, stateManager) {
    this.container = container;
    this.stateManager = stateManager;
    this.filterEngine = new FilterEngine();
    this._currentFilters = {};
    this._onClientsUpdated = null;
  }

  /**
   * Render the agenda view with client data.
   * @param {Array} data - Array of client objects
   * @param {Date} [today] - Optional reference date (default: now). Useful for testing.
   */
  render(data, today) {
    const referenceDate = today || new Date();
    const clients = Array.isArray(data) ? data : [];

    // Apply filters
    const filtered = this.filterEngine.applyFilters(clients, this._currentFilters);

    // Extract pending follow-ups
    const entries = extractPendingFollowUps(filtered, referenceDate);

    // Group
    const { atrasados, estaSemana, proximasSemanas } = groupEntries(entries, referenceDate);

    // Build HTML
    this.container.innerHTML = this._buildHTML(atrasados, estaSemana, proximasSemanas);

    // Bind click events
    this._bindEvents();
  }

  /**
   * Build the full HTML for the agenda view.
   * @param {Array} atrasados
   * @param {Array} estaSemana
   * @param {Array} proximasSemanas
   * @returns {string}
   */
  _buildHTML(atrasados, estaSemana, proximasSemanas) {
    const totalEntries = atrasados.length + estaSemana.length + proximasSemanas.length;

    if (totalEntries === 0) {
      return `
        <div class="agenda">
          <h2 class="agenda__title">Agenda de Contatos</h2>
          <div class="agenda__empty">
            <p>Nenhum acompanhamento pendente encontrado.</p>
          </div>
        </div>
      `;
    }

    let html = `<div class="agenda"><h2 class="agenda__title">Agenda de Contatos</h2>`;

    if (atrasados.length > 0) {
      html += this._buildGroup('Atrasados', atrasados, 'agenda__group--overdue');
    }

    if (estaSemana.length > 0) {
      html += this._buildGroup('Esta semana', estaSemana, 'agenda__group--week');
    }

    if (proximasSemanas.length > 0) {
      html += this._buildGroup('Próximas semanas', proximasSemanas, 'agenda__group--future');
    }

    html += `</div>`;
    return html;
  }

  /**
   * Build HTML for a single group section.
   * @param {string} title
   * @param {Array} entries
   * @param {string} groupClass
   * @returns {string}
   */
  _buildGroup(title, entries, groupClass) {
    let html = `
      <div class="agenda__group ${groupClass}">
        <h3 class="agenda__group-title">${title} <span class="agenda__group-count">(${entries.length})</span></h3>
        <div class="agenda__list">
    `;

    for (const entry of entries) {
      html += this._buildItem(entry);
    }

    html += `</div></div>`;
    return html;
  }

  /**
   * Build HTML for a single agenda item.
   * @param {object} entry
   * @returns {string}
   */
  _buildItem(entry) {
    return `
      <div class="agenda__item card ${entry.urgencyClass}" data-client-id="${entry.clientId}" data-slot="${entry.slotIndex}">
        <div class="agenda__item-header">
          <span class="agenda__client-name">${entry.clientName}</span>
          <span class="agenda__relative-days">${formatRelativeDays(entry.days)}</span>
        </div>
        <div class="agenda__item-details">
          <span class="agenda__lider">Líder: ${entry.lider}</span>
          <span class="agenda__date">${formatDateBR(entry.dateISO)}</span>
        </div>
      </div>
    `;
  }

  /**
   * Bind click events on agenda items to navigate to the client.
   */
  _bindEvents() {
    const items = this.container.querySelectorAll('.agenda__item[data-client-id]');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const clientId = item.getAttribute('data-client-id');
        if (clientId) {
          this._navigateToClient(clientId);
        }
      });
      // Keyboard accessibility
      item.setAttribute('tabindex', '0');
      item.setAttribute('role', 'button');
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const clientId = item.getAttribute('data-client-id');
          if (clientId) {
            this._navigateToClient(clientId);
          }
        }
      });
    });
  }

  /**
   * Navigate to or emit event for a specific client.
   * @param {string} clientId
   */
  _navigateToClient(clientId) {
    // Emit a custom event that the app can listen to
    const event = new CustomEvent('agenda:navigate-to-client', {
      bubbles: true,
      detail: { clientId },
    });
    this.container.dispatchEvent(event);
  }

  /**
   * Handle filter changes and re-render.
   * @param {object} filters
   */
  onFilterChange(filters) {
    this._currentFilters = filters || {};
    if (this.stateManager) {
      const clients = this.stateManager.getClients();
      this.render(clients);
    }
  }

  /**
   * Clean up event listeners and DOM content.
   */
  destroy() {
    if (this._onClientsUpdated && this.stateManager) {
      // If we registered a state listener, remove reference
      this._onClientsUpdated = null;
    }
    this.container.innerHTML = '';
  }
}
