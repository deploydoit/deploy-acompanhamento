/**
 * views/client-list.js — Client List View
 * Renders expandable client cards with follow-up slots
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 1.4, 7.6
 */

import { FilterEngine } from '../filters.js';
import { validateFollowUp } from '../state.js';
import { toISODate, toBRDate } from '../dates.js';

/**
 * Format a date for on-screen reading (DD/MM/AAAA).
 * Accepts ISO or Brazilian input.
 * @param {string|null} value
 * @returns {string}
 */
function formatDateDisplay(value) {
  return toBRDate(value);
}

/**
 * Count completed follow-ups (ocorreu === 'sim') for a client.
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

/**
 * Determine urgency class based on days until next pending follow-up.
 * @param {object} client
 * @returns {string} 'ok' | 'warn' | 'bad' | ''
 */
function getUrgencyClass(client) {
  const datas = client.datas_previstas || [];
  const followUps = client.followUps || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 4; i++) {
    if (followUps[i] && followUps[i].ocorreu === 'sim') continue;
    if (!datas[i]) continue;

    const target = new Date(datas[i] + 'T00:00:00');
    const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'bad';
    if (diffDays <= 7) return 'warn';
    return 'ok';
  }
  return '';
}

/**
 * Get the status pill label and class for a client.
 * @param {object} client
 * @returns {{ label: string, cls: string }}
 */
function getStatusPill(client) {
  const datas = client.datas_previstas || [];
  const followUps = client.followUps || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const completed = countCompleted(client);

  if (completed === 4) return { label: 'Completo', cls: 'ok' };

  for (let i = 0; i < 4; i++) {
    if (followUps[i] && followUps[i].ocorreu === 'sim') continue;
    if (!datas[i]) continue;

    const target = new Date(datas[i] + 'T00:00:00');
    const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: `${Math.abs(diffDays)}d atrasado`, cls: 'bad' };
    if (diffDays <= 7) return { label: `Em ${diffDays}d`, cls: 'warn' };
    return { label: `Em ${diffDays}d`, cls: 'ok' };
  }

  if (datas.length === 0) return { label: 'Sem data', cls: '' };
  return { label: `${completed}/4`, cls: '' };
}

/**
 * Build SVG progress ring markup.
 * @param {number} completed - 0-4
 * @returns {string} HTML string
 */
function buildProgressRing(completed) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const progress = completed / 4;
  const offset = circumference * (1 - progress);
  const color = completed === 4 ? 'var(--ok)' : completed > 0 ? 'var(--gold)' : 'var(--ink-soft)';

  return `
    <div class="progress-ring">
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle class="bgc" cx="22" cy="22" r="${radius}" />
        <circle class="fgc" cx="22" cy="22" r="${radius}"
          stroke="${color}"
          stroke-dasharray="${circumference}"
          stroke-dashoffset="${offset}" />
      </svg>
      <span class="count">${completed}/4</span>
    </div>
  `;
}

export class ClientListView {
  /**
   * @param {HTMLElement} container - The #view-container element
   * @param {import('../state.js').StateManager} stateManager
   */
  constructor(container, stateManager) {
    this.container = container;
    this.stateManager = stateManager;
    this.filterEngine = new FilterEngine();
    this._currentFilters = {};
    this._expandedClients = new Set();
    this._saveIndicators = {};
    this._unsubscribe = null;
  }

  /**
   * Render the client list view with the given client data.
   * @param {object[]} clients - Array of client objects
   */
  render(clients) {
    if (!clients || !Array.isArray(clients)) {
      clients = this.stateManager ? this.stateManager.getClients() : [];
    }

    // Apply current filters
    const filteredClients = this.filterEngine.applyFilters(clients, this._currentFilters);

    if (filteredClients.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <p>Nenhum cliente encontrado</p>
          <p style="font-size: 0.875rem; color: var(--ink-soft); font-family: var(--sans);">
            Tente limpar os filtros para ver todos os clientes.
          </p>
        </div>
      `;
      return;
    }

    const resultCount = `<div class="result-count">${filteredClients.length} cliente${filteredClients.length !== 1 ? 's' : ''}</div>`;
    const cards = filteredClients.map(client => this._renderClientCard(client)).join('');

    this.container.innerHTML = resultCount + '<div class="client-list">' + cards + '</div>';

    // Attach event listeners
    this._attachEventListeners();
  }

  /**
   * Destroy the view — clean up listeners.
   */
  destroy() {
    this._expandedClients.clear();
    this._saveIndicators = {};
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this.container.innerHTML = '';
  }

  /**
   * Handle filter changes — re-render with new filters.
   * @param {object} filters
   */
  onFilterChange(filters) {
    this._currentFilters = filters || {};
    const clients = this.stateManager ? this.stateManager.getClients() : [];
    this.render(clients);
  }

  // ─── Private: Rendering ──────────────────────────────────────────────────────

  /**
   * Render a single client card.
   * @param {object} client
   * @returns {string} HTML string
   */
  _renderClientCard(client) {
    const completed = countCompleted(client);
    const urgency = getUrgencyClass(client);
    const pill = getStatusPill(client);
    const isExpanded = this._expandedClients.has(client.id);
    const openClass = isExpanded ? ' open' : '';
    const urgencyBorder = urgency === 'bad' ? ' urgency--bad' : urgency === 'warn' ? ' urgency--warn' : '';

    const pillHtml = pill.label
      ? `<span class="status-pill ${pill.cls}">${pill.label}</span>`
      : '';

    const slotsHtml = this._renderFollowUpSlots(client);

    const agendaNote = this._renderAgendaNote(client);

    const naoContatarBadge = client.nao_entrar_em_contato
      ? '<span class="badge badge--nao-contatar">NÃO ENTRAR EM CONTATO</span>'
      : '';

    const naoContatarBtn = client.nao_entrar_em_contato
      ? `<button class="btn btn--sm btn--restore" data-client-id="${client.id}" data-action="restaurar-contato">Restaurar contato</button>`
      : `<button class="btn btn--sm btn--muted" data-client-id="${client.id}" data-action="nao-contatar">⛔ Não entrar em contato</button>`;

    return `
      <div class="client card${openClass}${urgencyBorder}${client.nao_entrar_em_contato ? ' nao-contatar' : ''}" data-client-id="${client.id}">
        <div class="client-head" data-client-id="${client.id}">
          <div class="ch-left">
            ${buildProgressRing(completed)}
            <div class="ch-name">
              <div class="n1">${this._escapeHtml(client.nome || client.cliente || '')} ${naoContatarBadge}</div>
              <div class="n2">
                <span>${this._escapeHtml(client.lider || '')}</span>
                <span>${this._escapeHtml(client.cidade || '')}${client.uf ? '/' + client.uf : ''}</span>
                <span class="phase-tag">${this._escapeHtml(client.status_projeto || '')}</span>
              </div>
            </div>
          </div>
          <div class="ch-right">
            ${pillHtml}
            <span class="chevron">▼</span>
          </div>
        </div>
        <div class="client-body">
          <div class="contact-info">
            ${client.email ? `<span>✉ <a href="mailto:${this._escapeHtml(client.email)}">${this._escapeHtml(client.email)}</a></span>` : ''}
            ${client.telefone ? `<span>☎ <a href="tel:${this._escapeHtml(client.telefone)}">${this._escapeHtml(client.telefone)}</a></span>` : ''}
            ${naoContatarBtn}
          </div>
          ${agendaNote}
          <div class="slots">
            ${slotsHtml}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render agenda note if client has events from agenda.
   * @param {object} client
   * @returns {string} HTML
   */
  _renderAgendaNote(client) {
    const agenda = client.acompanhamentos_agenda || [];
    if (agenda.length === 0) return '';

    return `
      <div class="agenda-note">
        <b>${agenda.length}</b> evento${agenda.length !== 1 ? 's' : ''} detectado${agenda.length !== 1 ? 's' : ''} na agenda deste cliente.
      </div>
    `;
  }

  /**
   * Render all 4 follow-up slots for a client.
   * @param {object} client
   * @returns {string} HTML
   */
  _renderFollowUpSlots(client) {
    const datas = client.datas_previstas || [];
    const followUps = client.followUps || {};
    const hasDates = datas.length > 0;

    let html = '';
    for (let i = 0; i < 4; i++) {
      const slot = followUps[i] || {};
      const dataPrevista = datas[i] || null;
      html += this._renderSlot(client, i, slot, dataPrevista, hasDates);
    }
    return html;
  }

  /**
   * Render a single follow-up slot.
   * @param {object} client
   * @param {number} index - 0-3
   * @param {object} slot - Follow-up data
   * @param {string|null} dataPrevista - Expected date (ISO)
   * @param {boolean} hasDates - Whether client has expected dates
   * @returns {string} HTML
   */
  _renderSlot(client, index, slot, dataPrevista, hasDates) {
    const slotNum = index + 1;
    const detectedBadge = slot.detectado_agenda
      ? '<span class="agenda-badge">detectado na agenda</span>'
      : '';

    // The date input only accepts YYYY-MM-DD; anything else renders blank.
    // Occurred -> the date it happened. Otherwise -> fall back to the forecast.
    const dataContato = slot.data
      ? toISODate(slot.data)
      : toISODate(dataPrevista);

    // Date prevista display
    let dataPrevistaHtml;
    if (dataPrevista) {
      dataPrevistaHtml = `<span class="slot-date-prevista">Previsto: ${formatDateDisplay(dataPrevista)}</span>`;
    } else if (!hasDates) {
      dataPrevistaHtml = `
        <span class="slot-date-pendente">
          <span class="pendente-label">pendente</span>
          <input type="date" class="manual-date-input" 
            data-client-id="${client.id}" data-slot="${index}" data-field="data_referencia"
            title="Informar data de referência manualmente"
            style="font-size: 11px; padding: 2px 4px; margin-left: 6px; max-width: 130px;">
        </span>
      `;
    } else {
      dataPrevistaHtml = '<span class="slot-date-prevista">—</span>';
    }

    // Last editor info
    const editorInfo = slot.ultima_edicao && slot.ultima_edicao.membro
      ? `<span class="slot-editor">Editado por: ${this._escapeHtml(slot.ultima_edicao.membro)}</span>`
      : '';

    // Save indicator
    const saveIndicatorId = `save-${client.id}-${index}`;

    return `
      <div class="slot" data-client-id="${client.id}" data-slot-index="${index}">
        <div class="slot-head">
          <span class="num">${slotNum}º acomp.</span>
          ${detectedBadge}
          <span class="save-indicator" id="${saveIndicatorId}"></span>
        </div>
        ${dataPrevistaHtml}
        
        <div class="slot-field">
          <label>Data do contato</label>
          <input type="date" value="${dataContato}"
            data-client-id="${client.id}" data-slot="${index}" data-field="data">
        </div>

        <div class="slot-field">
          <label>Contato realizado</label>
          <div class="seg" data-client-id="${client.id}" data-slot="${index}" data-field="contato_realizado">
            <button type="button" data-val="sim" ${slot.contato_realizado === 'sim' ? 'class="active"' : ''}>Sim</button>
            <button type="button" data-val="não" ${slot.contato_realizado === 'não' ? 'class="active"' : ''}>Não</button>
          </div>
        </div>

        <div class="slot-field">
          <label>Canal</label>
          <div class="seg" data-client-id="${client.id}" data-slot="${index}" data-field="canal">
            <button type="button" data-val="whatsapp" ${slot.canal === 'whatsapp' ? 'class="active"' : ''}>WhatsApp</button>
            <button type="button" data-val="email" ${slot.canal === 'email' ? 'class="active"' : ''}>E-mail</button>
            <button type="button" data-val="intercom" ${slot.canal === 'intercom' ? 'class="active"' : ''}>Intercom</button>
          </div>
        </div>

        <div class="slot-field">
          <label>Retorno</label>
          <textarea maxlength="500" data-client-id="${client.id}" data-slot="${index}" data-field="retorno"
            placeholder="Retorno do cliente...">${this._escapeHtml(slot.retorno || '')}</textarea>
        </div>

        <div class="slot-field">
          <label>Ocorreu</label>
          <div class="seg" data-client-id="${client.id}" data-slot="${index}" data-field="ocorreu">
            <button type="button" data-val="sim" ${slot.ocorreu === 'sim' ? 'class="active"' : ''}>Sim</button>
            <button type="button" data-val="não" ${slot.ocorreu === 'não' ? 'class="active"' : ''}>Não</button>
          </div>
        </div>

        ${editorInfo}
      </div>
    `;
  }

  // ─── Private: Event Handling ─────────────────────────────────────────────────

  /**
   * Attach all event listeners to the rendered DOM.
   */
  _attachEventListeners() {
    // Expand/collapse client cards
    const heads = this.container.querySelectorAll('.client-head');
    heads.forEach(head => {
      head.addEventListener('click', (e) => this._handleCardToggle(e));
    });

    // "Não entrar em contato" / "Restaurar" buttons
    const naoContatarBtns = this.container.querySelectorAll('[data-action="nao-contatar"], [data-action="restaurar-contato"]');
    naoContatarBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const clientId = btn.dataset.clientId;
        const action = btn.dataset.action;
        const newValue = action === 'nao-contatar';
        // Update Firebase
        if (this.stateManager && this.stateManager.firebaseService && this.stateManager.firebaseService.db) {
          this.stateManager.firebaseService.db.ref(`clients/${clientId}/nao_entrar_em_contato`).set(newValue);
        }
        // Update local state
        if (this.stateManager.clients[clientId]) {
          this.stateManager.clients[clientId].nao_entrar_em_contato = newValue;
          this.stateManager._emit('clients-updated', this.stateManager.getClients());
        }
      });
    });

    // Segmented button clicks
    const segButtons = this.container.querySelectorAll('.seg button');
    segButtons.forEach(btn => {
      btn.addEventListener('click', (e) => this._handleSegmentClick(e));
    });

    // Date and textarea inputs
    const inputs = this.container.querySelectorAll('input[data-field="data"], textarea[data-field="retorno"]');
    inputs.forEach(input => {
      input.addEventListener('input', (e) => this._handleInputChange(e));
    });

    // Manual date reference input
    const manualDates = this.container.querySelectorAll('.manual-date-input');
    manualDates.forEach(input => {
      input.addEventListener('change', (e) => this._handleManualDateChange(e));
    });
  }

  /**
   * Handle card expand/collapse toggle.
   * @param {Event} e
   */
  _handleCardToggle(e) {
    const head = e.currentTarget;
    const clientId = head.dataset.clientId;
    const card = head.closest('.client');

    if (this._expandedClients.has(clientId)) {
      this._expandedClients.delete(clientId);
      card.classList.remove('open');
    } else {
      this._expandedClients.add(clientId);
      card.classList.add('open');
    }
  }

  /**
   * Handle segmented button click (contato_realizado, canal, ocorreu).
   * @param {Event} e
   */
  _handleSegmentClick(e) {
    const btn = e.currentTarget;
    const seg = btn.closest('.seg');
    const field = seg.dataset.field;
    const clientId = seg.dataset.clientId;
    const slotIndex = parseInt(seg.dataset.slot, 10);
    const value = btn.dataset.val;

    // Update active state in UI
    seg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Build current slot data from DOM
    const slotData = this._collectSlotData(clientId, slotIndex);
    slotData[field] = value;

    // Validate for inconsistent state
    this._saveSlotData(clientId, slotIndex, slotData);
  }

  /**
   * Handle input change (date or textarea).
   * @param {Event} e
   */
  _handleInputChange(e) {
    const input = e.target;
    const clientId = input.dataset.clientId;
    const slotIndex = parseInt(input.dataset.slot, 10);
    const field = input.dataset.field;

    const slotData = this._collectSlotData(clientId, slotIndex);
    slotData[field] = input.value;

    this._saveSlotData(clientId, slotIndex, slotData);
  }

  /**
   * Handle manual date reference input for clients with missing fim_capacitacao.
   * @param {Event} e
   */
  _handleManualDateChange(e) {
    const input = e.target;
    const clientId = input.dataset.clientId;
    const dateValue = input.value;

    if (!dateValue || !this.stateManager) return;

    // Update the data_referencia_manual on the client
    // This triggers recalculation of expected dates
    if (this.stateManager.firebaseService) {
      this.stateManager.firebaseService.writeClient &&
        this.stateManager.firebaseService.writeClient({
          id: clientId,
          data_referencia_manual: dateValue,
          fim_capacitacao: dateValue
        });
    }
  }

  /**
   * Collect current slot data from the DOM for a specific client/slot.
   * @param {string} clientId
   * @param {number} slotIndex
   * @returns {object}
   */
  _collectSlotData(clientId, slotIndex) {
    const slotEl = this.container.querySelector(
      `.slot[data-client-id="${clientId}"][data-slot-index="${slotIndex}"]`
    );
    if (!slotEl) return {};

    const data = {};

    // Date field
    const dateInput = slotEl.querySelector('input[data-field="data"]');
    if (dateInput) data.data = dateInput.value || '';

    // Segmented fields
    const segs = slotEl.querySelectorAll('.seg');
    segs.forEach(seg => {
      const field = seg.dataset.field;
      const activeBtn = seg.querySelector('button.active');
      if (activeBtn) {
        data[field] = activeBtn.dataset.val;
      }
    });

    // Textarea
    const textarea = slotEl.querySelector('textarea[data-field="retorno"]');
    if (textarea) data.retorno = textarea.value || '';

    return data;
  }

  /**
   * Save slot data through the state manager with confirmation check.
   * @param {string} clientId
   * @param {number} slotIndex
   * @param {object} slotData
   */
  _saveSlotData(clientId, slotIndex, slotData) {
    // Validate for inconsistent state (ocorreu=sim + contato=não)
    const validation = validateFollowUp(slotData);

    if (validation.needsConfirmation) {
      const confirmed = confirm(
        'Atenção: o acompanhamento está marcado como "ocorreu" mas o contato não foi realizado. Deseja salvar mesmo assim?'
      );
      if (!confirmed) {
        // Revert the UI change - re-render this slot
        this._revertSlotUI(clientId, slotIndex);
        return;
      }
    }

    if (!this.stateManager) return;

    // Call updateFollowUp (which debounces internally at 2s)
    this.stateManager.updateFollowUp(clientId, slotIndex, slotData);

    // Show saving indicator
    this._showSaveIndicator(clientId, slotIndex);
  }

  /**
   * Show "Salvo ✓" indicator for a slot after debounce completes.
   * @param {string} clientId
   * @param {number} slotIndex
   */
  _showSaveIndicator(clientId, slotIndex) {
    const indicatorId = `save-${clientId}-${slotIndex}`;
    const key = `${clientId}_${slotIndex}`;

    // Clear existing timer for this slot
    if (this._saveIndicators[key]) {
      clearTimeout(this._saveIndicators[key]);
    }

    // Show indicator after 2s debounce + small buffer
    this._saveIndicators[key] = setTimeout(() => {
      const indicator = this.container.querySelector(`#${CSS.escape(indicatorId)}`);
      if (indicator) {
        indicator.textContent = 'Salvo ✓';
        indicator.classList.add('save-indicator--visible');

        // Hide after 2 seconds
        setTimeout(() => {
          indicator.textContent = '';
          indicator.classList.remove('save-indicator--visible');
        }, 2000);
      }
      delete this._saveIndicators[key];
    }, 2200);
  }

  /**
   * Revert slot UI to the stored state (called when user cancels inconsistent state).
   * @param {string} clientId
   * @param {number} slotIndex
   */
  _revertSlotUI(clientId, slotIndex) {
    if (!this.stateManager) return;
    const client = this.stateManager.getClient(clientId);
    if (!client) return;

    const slot = (client.followUps || {})[slotIndex] || {};
    const slotEl = this.container.querySelector(
      `.slot[data-client-id="${clientId}"][data-slot-index="${slotIndex}"]`
    );
    if (!slotEl) return;

    // Revert segmented buttons
    const segs = slotEl.querySelectorAll('.seg');
    segs.forEach(seg => {
      const field = seg.dataset.field;
      const value = slot[field] || '';
      seg.querySelectorAll('button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === value);
      });
    });
  }

  /**
   * Escape HTML special characters.
   * @param {string} str
   * @returns {string}
   */
  _escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
