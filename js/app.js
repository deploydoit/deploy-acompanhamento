/**
 * app.js — Application bootstrap and initialization
 * Entry point for the Painel de Acompanhamento de Clientes SPA
 *
 * Tasks: 7.8, 8.3, 11.1, 11.2, 12.1
 */

import { AppRouter } from './router.js';
import { StateManager } from './state.js';
import { FirebaseService } from './firebase-service.js';
import { FilterEngine } from './filters.js';
import { ImportService } from './import.js';
import { ExportService } from './export.js';
import { ClientListView } from './views/client-list.js';
import { KanbanView } from './views/kanban.js';
import { AgendaView } from './views/agenda.js';
import { DashboardView } from './views/dashboard.js';

/**
 * Main application controller.
 * Coordinates all modules: router, state, views, import/export, filters.
 */
class App {
  constructor() {
    this.firebaseService = null;
    this.stateManager = null;
    this.router = null;
    this.filterEngine = null;
    this.importService = null;
    this.exportService = null;
    this.dashboardView = null;
    this.currentView = null;
    this._searchTimeout = null;
  }

  /**
   * Bootstrap the application.
   */
  async init() {
    // Check for member selection before anything else
    this._ensureMemberSelected();

    // Initialize core services
    this.firebaseService = new FirebaseService();
    this.firebaseService.enablePersistence();

    this.stateManager = new StateManager(this.firebaseService);
    this.filterEngine = new FilterEngine();
    this.importService = new ImportService();
    this.exportService = new ExportService();

    // Wire connection status indicators (Task 11.2)
    this._wireConnectionStatus();

    // Wire conflict events (Task 11.2)
    this._wireConflictEvents();

    // Start Firebase sync (non-blocking — show app immediately)
    this.stateManager.startSync();

    // Show app immediately, don't wait for Firebase
    this._showApp();

    // Restore session filters
    const savedFilters = this.filterEngine.restoreFilters();
    if (savedFilters) {
      this.stateManager.setFilters(savedFilters);
      this._restoreFilterUI(savedFilters);
    }

    // Initialize Dashboard in #dashboard-area (always visible)
    const dashboardArea = document.getElementById('dashboard-area');
    if (dashboardArea) {
      this.dashboardView = new DashboardView(dashboardArea, this.stateManager);
      this.dashboardView.startListening();
    }

    // Initialize Router with route-to-view mapping
    this.router = new AppRouter({
      '#/': () => this._renderView('client-list'),
      '#/kanban': () => this._renderView('kanban'),
      '#/agenda': () => this._renderView('agenda'),
      '#/dashboard': () => this._renderView('dashboard'),
    });

    // Wire filter UI controls (Task 12.1)
    this._wireFilterControls();

    // Wire import buttons (Task 7.8)
    this._wireImportUI();

    // Wire export button (Task 8.3)
    this._wireExportUI();

    // Wire responsive navigation (Task 11.1)
    this._wireResponsiveNav();

    // Handle initial route
    this.router.navigate(window.location.hash || '#/');
  }

  // ─── Views ─────────────────────────────────────────────────────────────────

  /**
   * Render the appropriate view in #view-container based on route.
   * @param {string} viewName
   */
  _renderView(viewName) {
    const container = document.getElementById('view-container');
    if (!container) return;

    // Destroy previous view if exists
    if (this.currentView && this.currentView.destroy) {
      this.currentView.destroy();
    }

    const clients = this.stateManager.getClients();
    const filters = this.stateManager.getFilters();

    switch (viewName) {
      case 'client-list': {
        const view = new ClientListView(container, this.stateManager);
        view.onFilterChange(filters);
        this.currentView = view;

        // Listen to state changes for auto-update
        this.stateManager.on('clients-updated', () => {
          if (this.currentView === view) {
            view.onFilterChange(this.stateManager.getFilters());
          }
        });
        break;
      }
      case 'kanban': {
        const view = new KanbanView(container, this.stateManager, {
          onClientClick: (clientId) => {
            // Navigate to client list and expand the clicked client
            this.router.navigate('#/');
          },
        });
        view.onFilterChange(filters);
        this.currentView = view;

        this.stateManager.on('clients-updated', () => {
          if (this.currentView === view) {
            view.onFilterChange(this.stateManager.getFilters());
          }
        });
        break;
      }
      case 'agenda': {
        const view = new AgendaView(container, this.stateManager);
        view.onFilterChange(filters);
        this.currentView = view;

        this.stateManager.on('clients-updated', () => {
          if (this.currentView === view) {
            view.onFilterChange(this.stateManager.getFilters());
          }
        });
        break;
      }
      case 'dashboard': {
        // Full-page dashboard (same as header but full-size)
        const view = new DashboardView(container, this.stateManager);
        view.startListening();
        this.currentView = view;
        break;
      }
    }
  }

  // ─── Filter UI (Task 12.1) ─────────────────────────────────────────────────

  /**
   * Wire filter UI controls: search, leader, phase, status selects.
   */
  _wireFilterControls() {
    const searchInput = document.getElementById('search-input');
    const leaderSelect = document.getElementById('filter-leader');
    const phaseSelect = document.getElementById('filter-phase');
    const statusSelect = document.getElementById('filter-status');

    // Debounced search (300ms)
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        if (this._searchTimeout) clearTimeout(this._searchTimeout);
        this._searchTimeout = setTimeout(() => {
          this._applyFilters();
        }, 300);
      });
    }

    // Select filters — immediate application
    if (leaderSelect) {
      leaderSelect.addEventListener('change', () => this._applyFilters());
    }
    if (phaseSelect) {
      phaseSelect.addEventListener('change', () => this._applyFilters());
    }
    if (statusSelect) {
      statusSelect.addEventListener('change', () => this._applyFilters());
    }
  }

  /**
   * Collect values from filter UI and apply to state + views.
   */
  _applyFilters() {
    const searchInput = document.getElementById('search-input');
    const leaderSelect = document.getElementById('filter-leader');
    const phaseSelect = document.getElementById('filter-phase');
    const statusSelect = document.getElementById('filter-status');

    const filters = {
      search: searchInput ? searchInput.value : '',
      leader: leaderSelect ? leaderSelect.value : '',
      phase: phaseSelect ? phaseSelect.value : '',
      status: statusSelect ? statusSelect.value : '',
    };

    // Persist and set filters
    this.filterEngine.persistFilters(filters);
    this.stateManager.setFilters(filters);

    // Update current view
    if (this.currentView && this.currentView.onFilterChange) {
      this.currentView.onFilterChange(filters);
    }
  }

  /**
   * Restore filter UI controls from saved filters.
   * @param {object} filters
   */
  _restoreFilterUI(filters) {
    if (filters.search) {
      const el = document.getElementById('search-input');
      if (el) el.value = filters.search;
    }
    if (filters.leader) {
      const el = document.getElementById('filter-leader');
      if (el) el.value = filters.leader;
    }
    if (filters.phase) {
      const el = document.getElementById('filter-phase');
      if (el) el.value = filters.phase;
    }
    if (filters.status) {
      const el = document.getElementById('filter-status');
      if (el) el.value = filters.status;
    }
  }

  // ─── Import UI (Task 7.8) ─────────────────────────────────────────────────

  /**
   * Wire import buttons to hidden file inputs.
   */
  _wireImportUI() {
    const btnProjects = document.getElementById('btn-import-projects');
    const btnEvents = document.getElementById('btn-import-events');

    // Create hidden file inputs
    const inputProjects = this._createFileInput('import-projects-input');
    const inputEvents = this._createFileInput('import-events-input');

    if (btnProjects) {
      btnProjects.addEventListener('click', () => inputProjects.click());
      // Show last import date
      this._showLastImportDate('projetos', btnProjects);
    }

    if (btnEvents) {
      btnEvents.addEventListener('click', () => inputEvents.click());
      // Show last import date
      this._showLastImportDate('eventos', btnEvents);
    }

    // Handle file selection — projects
    inputProjects.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await this._handleProjectImport(file);
      inputProjects.value = ''; // reset for re-upload
    });

    // Handle file selection — events
    inputEvents.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await this._handleEventImport(file);
      inputEvents.value = ''; // reset for re-upload
    });
  }

  /**
   * Create a hidden file input element for uploads.
   * @param {string} id
   * @returns {HTMLInputElement}
   */
  _createFileInput(id) {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = id;
    input.accept = '.xlsx';
    input.style.display = 'none';
    document.body.appendChild(input);
    return input;
  }

  /**
   * Handle project file import: parse → validate → merge → show summary.
   * @param {File} file
   */
  async _handleProjectImport(file) {
    try {
      const parseResult = await this.importService.parseProjectsFile(file);

      if (!parseResult.success) {
        this._showErrorModal('Erro na Importação de Projetos', parseResult.errors);
        return;
      }

      const validation = this.importService.validateProjectsData(parseResult.rows);

      if (validation.missingColumns.length > 0) {
        this._showErrorModal('Colunas Obrigatórias Ausentes', [
          { line: 0, message: `Colunas ausentes: ${validation.missingColumns.join(', ')}` }
        ]);
        return;
      }

      // Merge with existing data
      const existingClients = this.stateManager.getClients();
      const mergeResult = this.importService.mergeProjects(existingClients, validation.valid);
      const summary = this.importService.generateImportSummary({
        ...mergeResult,
        errors: validation.invalid
      });

      // Update local state immediately so UI reflects changes
      const allClients = [...mergeResult.added, ...mergeResult.updated, ...mergeResult.unchanged];
      const clientsMap = {};
      allClients.forEach(c => { clientsMap[c.id] = { ...c }; delete clientsMap[c.id].id; });
      this.stateManager.clients = clientsMap;
      this.stateManager._recalculateExpectedDates();
      this.stateManager._emit('clients-updated', this.stateManager.getClients());

      // Write to Firebase (async, non-blocking for UI)
      try {
        for (const client of mergeResult.added) {
          await this.firebaseService.writeClient(client);
        }
        for (const client of mergeResult.updated) {
          await this.firebaseService.writeClient(client);
        }
      } catch (fbErr) {
        console.warn('Firebase write failed, data saved locally:', fbErr.message);
      }

      // Register import date
      const now = this._formatDateTime(new Date());
      try {
        await this.firebaseService.setLastImportDate('projetos', now);
      } catch (e) { /* ignore */ }

      // Show summary modal
      this._showSummaryModal('Importação de Projetos', summary);

      // Update the button with last import date
      const btn = document.getElementById('btn-import-projects');
      if (btn) this._updateImportDateDisplay(btn, now);

    } catch (err) {
      this._showErrorModal('Erro na Importação', [
        { line: 0, message: err.message || 'Erro inesperado ao importar projetos.' }
      ]);
    }
  }

  /**
   * Handle event file import: parse → validate → match → show summary.
   * @param {File} file
   */
  async _handleEventImport(file) {
    try {
      const parseResult = await this.importService.parseEventsFile(file);

      if (!parseResult.success) {
        this._showErrorModal('Erro na Importação de Eventos', parseResult.errors);
        return;
      }

      const validation = this.importService.validateEventsData(parseResult.rows);

      if (validation.missingColumns.length > 0) {
        this._showErrorModal('Colunas Obrigatórias Ausentes', [
          { line: 0, message: `Colunas ausentes: ${validation.missingColumns.join(', ')}` }
        ]);
        return;
      }

      // Match events to clients
      const existingClients = this.stateManager.getClients();
      const matchResult = this.importService.matchEventsToClients(validation.valid, existingClients);

      // Apply pre-filled follow-up data for matched events
      for (const match of matchResult.vinculados) {
        if (match.slotIndex >= 0 && match.slotIndex < 4) {
          await this.firebaseService.writeFollowUp(
            match.client.id,
            match.slotIndex,
            match.followUpData
          );
        }
      }

      // Register import date
      const now = this._formatDateTime(new Date());
      await this.firebaseService.setLastImportDate('eventos', now);

      // Show summary
      this._showSummaryModal('Importação de Eventos', {
        added: matchResult.vinculados.length,
        updated: matchResult.novos.length,
        unchanged: matchResult.ignorados.length,
        errors: validation.invalid
      }, {
        labels: {
          added: 'Eventos vinculados',
          updated: 'Novos (sem cliente correspondente)',
          unchanged: 'Ignorados',
        }
      });

      // Update button date
      const btn = document.getElementById('btn-import-events');
      if (btn) this._updateImportDateDisplay(btn, now);

    } catch (err) {
      this._showErrorModal('Erro na Importação', [
        { line: 0, message: err.message || 'Erro inesperado ao importar eventos.' }
      ]);
    }
  }

  /**
   * Show last import date below a button.
   * @param {string} type - 'projetos' | 'eventos'
   * @param {HTMLElement} btn
   */
  async _showLastImportDate(type, btn) {
    try {
      const date = await this.firebaseService.getLastImportDate(type);
      if (date) {
        this._updateImportDateDisplay(btn, date);
      }
    } catch (e) {
      // Silently fail — non-critical
    }
  }

  /**
   * Update the small date display below an import button.
   * @param {HTMLElement} btn
   * @param {string} dateStr
   */
  _updateImportDateDisplay(btn, dateStr) {
    let dateEl = btn.querySelector('.import-date');
    if (!dateEl) {
      dateEl = document.createElement('small');
      dateEl.className = 'import-date';
      dateEl.style.cssText = 'display: block; font-size: 0.6875rem; color: var(--ink-soft); margin-top: 2px;';
      btn.appendChild(dateEl);
    }
    dateEl.textContent = `Última: ${dateStr}`;
  }

  // ─── Export UI (Task 8.3) ──────────────────────────────────────────────────

  /**
   * Wire the export button.
   */
  _wireExportUI() {
    const btnExport = document.getElementById('btn-export');
    if (!btnExport) return;

    btnExport.addEventListener('click', () => {
      this._handleExport();
    });
  }

  /**
   * Handle export: generate Excel → trigger download.
   */
  _handleExport() {
    try {
      const clients = this.stateManager.getClients();
      const filters = this.stateManager.getFilters();

      const xlsxData = this.exportService.generateExcel(clients, filters);

      if (!xlsxData) {
        this._showToast('Não há dados para exportar', 'warn');
        return;
      }

      // Trigger browser download
      const blob = new Blob([xlsxData], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.exportService.getFileName();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (err) {
      this._showToast('Falha ao exportar: ' + (err.message || 'erro desconhecido'), 'error');
    }
  }

  // ─── Responsive Navigation (Task 11.1) ────────────────────────────────────

  /**
   * Wire hamburger menu to toggle sidebar overlay on mobile.
   */
  _wireResponsiveNav() {
    const hamburger = document.getElementById('hamburger-btn');
    const sidebar = document.getElementById('sidebar');

    if (!hamburger || !sidebar) return;

    // Create overlay backdrop
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.id = 'sidebar-overlay';
    document.body.appendChild(overlay);

    hamburger.addEventListener('click', () => {
      sidebar.classList.toggle('sidebar--open');
      overlay.classList.toggle('sidebar-overlay--visible');
      document.body.classList.toggle('no-scroll');
    });

    // Close sidebar when overlay is clicked
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('sidebar--open');
      overlay.classList.remove('sidebar-overlay--visible');
      document.body.classList.remove('no-scroll');
    });

    // Close sidebar when a nav link is clicked (mobile)
    const navLinks = sidebar.querySelectorAll('.sidebar__link');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
          sidebar.classList.remove('sidebar--open');
          overlay.classList.remove('sidebar-overlay--visible');
          document.body.classList.remove('no-scroll');
        }
      });
    });
  }

  // ─── Connection Status (Task 11.2) ────────────────────────────────────────

  /**
   * Wire StateManager 'connection-change' events to show/hide banners.
   */
  _wireConnectionStatus() {
    const banner = document.getElementById('connection-banner');

    this.stateManager.on('connection-change', (status) => {
      if (!banner) return;

      if (status === 'offline') {
        banner.textContent = 'Modo offline — alterações serão sincronizadas';
        banner.className = 'banner banner--warn';
        banner.hidden = false;
      } else if (status === 'online') {
        // Show green "Sincronizado" flash briefly
        banner.textContent = 'Sincronizado';
        banner.className = 'banner banner--success';
        banner.hidden = false;

        setTimeout(() => {
          banner.hidden = true;
        }, 3000);
      } else if (status === 'syncing') {
        banner.textContent = 'Sincronizando...';
        banner.className = 'banner banner--warn';
        banner.hidden = false;
      }
    });
  }

  /**
   * Wire conflict events to show toast notifications.
   */
  _wireConflictEvents() {
    this.stateManager.on('conflict', (data) => {
      const nome = data.overwrittenBy || 'outro membro';
      this._showToast(`Sua alteração foi sobrescrita por ${nome}`, 'warn');
    });
  }

  // ─── Member Selection (Task 12.1) ─────────────────────────────────────────

  /**
   * Ensure a team member is selected (stored in localStorage).
   * Shows prompt on first visit if not set.
   */
  _ensureMemberSelected() {
    const stored = localStorage.getItem('membro');
    if (stored) return;

    const members = [
      'Bruno Hideo Toyama',
      'Isabela Soares',
      'Henrique Puertas Stefano',
      'Ana Paula',
    ];

    const choice = prompt(
      'Selecione seu nome para identificação no painel:\n\n' +
      members.map((m, i) => `${i + 1}. ${m}`).join('\n') +
      '\n\nDigite o número (1-4):'
    );

    const index = parseInt(choice, 10) - 1;
    if (index >= 0 && index < members.length) {
      localStorage.setItem('membro', members[index]);
    } else {
      // Default to first if invalid
      localStorage.setItem('membro', members[0]);
    }
  }

  // ─── UI Helpers ────────────────────────────────────────────────────────────

  /**
   * Hide loading indicator and show the app shell.
   */
  _showApp() {
    const loading = document.getElementById('loading-indicator');
    const app = document.getElementById('app');
    if (loading) loading.hidden = true;
    if (app) app.hidden = false;
  }

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {'info'|'warn'|'error'|'success'} type
   */
  _showToast(message, type = 'info') {
    // Remove existing toast if any
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    document.body.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      toast.classList.add('toast--hide');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  /**
   * Show a modal with import summary.
   * @param {string} title
   * @param {object} summary - { added, updated, unchanged, errors }
   * @param {object} [options] - { labels }
   */
  _showSummaryModal(title, summary, options = {}) {
    const labels = options.labels || {
      added: 'Adicionados',
      updated: 'Atualizados',
      unchanged: 'Inalterados',
    };

    const errorSection = summary.errors && summary.errors.length > 0
      ? `<div class="modal__errors">
           <p><strong>Erros (${summary.errors.length}):</strong></p>
           <ul>${summary.errors.slice(0, 10).map(e =>
             `<li>Linha ${e.line}: ${e.reason || e.message}</li>`
           ).join('')}</ul>
           ${summary.errors.length > 10 ? `<p>...e mais ${summary.errors.length - 10} erros</p>` : ''}
         </div>`
      : '';

    this._showModal(title, `
      <div class="modal__summary">
        <p><strong>${labels.added}:</strong> ${summary.added}</p>
        <p><strong>${labels.updated}:</strong> ${summary.updated}</p>
        <p><strong>${labels.unchanged}:</strong> ${summary.unchanged}</p>
      </div>
      ${errorSection}
    `);
  }

  /**
   * Show an error modal with a list of errors.
   * @param {string} title
   * @param {Array<{line: number, message: string}>} errors
   */
  _showErrorModal(title, errors) {
    const content = `
      <div class="modal__errors">
        <ul>${errors.map(e =>
          `<li>${e.line > 0 ? `Linha ${e.line}: ` : ''}${e.message || e.reason}</li>`
        ).join('')}</ul>
      </div>
    `;
    this._showModal(title, content);
  }

  /**
   * Show a generic modal dialog.
   * @param {string} title
   * @param {string} contentHTML
   */
  _showModal(title, contentHTML) {
    // Remove existing modal
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal__header">
          <h2 id="modal-title" class="modal__title">${title}</h2>
          <button class="modal__close" aria-label="Fechar">&times;</button>
        </div>
        <div class="modal__body">${contentHTML}</div>
        <div class="modal__footer">
          <button class="btn btn--primary modal__ok">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    const closeModal = () => overlay.remove();
    overlay.querySelector('.modal__close').addEventListener('click', closeModal);
    overlay.querySelector('.modal__ok').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  /**
   * Format a Date to "DD/MM/AAAA HH:mm".
   * @param {Date} date
   * @returns {string}
   */
  _formatDateTime(date) {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${d}/${m}/${y} ${h}:${min}`;
  }
}

// ─── Application Entry Point ──────────────────────────────────────────────────

const app = new App();
app.init().catch((err) => {
  console.error('[App] Initialization failed:', err);
  // Still try to show the app shell even if Firebase fails
  const loading = document.getElementById('loading-indicator');
  const appEl = document.getElementById('app');
  if (loading) loading.hidden = true;
  if (appEl) appEl.hidden = false;
});
