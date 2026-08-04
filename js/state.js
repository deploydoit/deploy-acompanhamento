/**
 * state.js — State Manager with Firebase sync and offline support
 * Manages application state, real-time sync, and conflict resolution
 */

/**
 * Calculate expected follow-up dates based on fim_capacitacao.
 * 1st = fim_capacitacao + 7 days, then each subsequent +30 days.
 * @param {string|null} fimCapacitacao - ISO date string (YYYY-MM-DD)
 * @returns {string[]} Array of 4 ISO date strings, or empty array if no date
 */
export function calculateExpectedDates(fimCapacitacao) {
  if (!fimCapacitacao) return [];
  const base = new Date(fimCapacitacao + 'T00:00:00');
  if (isNaN(base.getTime())) return [];

  const dates = [];
  // 1st: +7 days from fim_capacitacao
  const first = new Date(base);
  first.setDate(first.getDate() + 7);
  dates.push(formatISODate(first));

  // 2nd, 3rd, 4th: each +30 days from previous
  for (let i = 1; i < 4; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00');
    prev.setDate(prev.getDate() + 30);
    dates.push(formatISODate(prev));
  }

  return dates;
}

/**
 * Validate follow-up data for inconsistent state.
 * Returns { needsConfirmation: true } if ocorreu='sim' and contato_realizado='não'.
 * @param {object} data - Follow-up data with ocorreu and contato_realizado fields
 * @returns {{ needsConfirmation: boolean }}
 */
export function validateFollowUp(data) {
  if (data.ocorreu === 'sim' && data.contato_realizado === 'não') {
    return { needsConfirmation: true };
  }
  return { needsConfirmation: false };
}

/**
 * Resolve conflict using last-write-wins strategy.
 * @param {object} localEdit - { value, timestamp }
 * @param {object} remoteEdit - { value, timestamp }
 * @returns {object} The edit with the latest timestamp
 */
export function resolveConflict(localEdit, remoteEdit) {
  if (localEdit.timestamp >= remoteEdit.timestamp) {
    return localEdit;
  }
  return remoteEdit;
}

/**
 * Format a Date object as ISO date string (YYYY-MM-DD).
 * @param {Date} date
 * @returns {string}
 */
function formatISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Default offline queue key for localForage
const OFFLINE_QUEUE_KEY = 'state_offline_queue';
const FILTERS_SESSION_KEY = 'panel_filters';

export class StateManager {
  /**
   * @param {import('./firebase-service.js').FirebaseService} firebaseService
   */
  constructor(firebaseService) {
    this.firebaseService = firebaseService;
    this.clients = {};
    this.filters = {};
    this.connectionStatus = 'offline';
    this._listeners = {};
    this._unsubscribeClients = null;
    this._unsubscribeConnection = null;
    this._debounceTimers = {};
    this._offlineQueue = [];
    this._syncing = false;
  }

  // ─── Reading ─────────────────────────────────────────────────────────────────

  /**
   * Returns all clients as an array.
   * @returns {object[]}
   */
  getClients() {
    return Object.entries(this.clients).map(([id, client]) => ({ id, ...client }));
  }

  /**
   * Returns a single client by ID.
   * @param {string} id
   * @returns {object|null}
   */
  getClient(id) {
    if (!this.clients[id]) return null;
    return { id, ...this.clients[id] };
  }

  /**
   * Returns current filter state.
   * @returns {object}
   */
  getFilters() {
    return { ...this.filters };
  }

  // ─── Writing ─────────────────────────────────────────────────────────────────

  /**
   * Update a follow-up slot with 2-second debounce.
   * If offline, queues the write for later sync.
   * @param {string} clientId
   * @param {number} slotIndex - 0-3
   * @param {object} data - Follow-up fields
   * @returns {{ needsConfirmation: boolean }} Validation result
   */
  updateFollowUp(clientId, slotIndex, data) {
    // Validate for inconsistent state
    const validation = validateFollowUp(data);

    // Debounce key for this specific slot
    const debounceKey = `${clientId}_${slotIndex}`;

    // Clear any existing debounce timer for this slot
    if (this._debounceTimers[debounceKey]) {
      clearTimeout(this._debounceTimers[debounceKey]);
    }

    // Set up debounced write (2 seconds)
    this._debounceTimers[debounceKey] = setTimeout(() => {
      this._executeWrite(clientId, slotIndex, data);
      delete this._debounceTimers[debounceKey];
    }, 2000);

    return validation;
  }

  /**
   * Execute the actual write operation (called after debounce).
   * If offline, queues the write in localForage.
   * @param {string} clientId
   * @param {number} slotIndex
   * @param {object} data
   */
  async _executeWrite(clientId, slotIndex, data) {
    const timestamp = Date.now();
    const writeData = { ...data };

    if (this.connectionStatus === 'offline') {
      // Queue for later sync
      const queueEntry = {
        clientId,
        slotIndex,
        data: writeData,
        timestamp
      };
      this._offlineQueue.push(queueEntry);
      await this._persistOfflineQueue();
      return;
    }

    try {
      this._setConnectionStatus('syncing');
      await this.firebaseService.writeFollowUp(clientId, slotIndex, writeData);
      this._setConnectionStatus('online');
    } catch (error) {
      console.error('[StateManager] Write failed, queuing offline:', error);
      // Queue the failed write
      const queueEntry = {
        clientId,
        slotIndex,
        data: writeData,
        timestamp
      };
      this._offlineQueue.push(queueEntry);
      await this._persistOfflineQueue();
    }
  }

  /**
   * Apply filter state and persist to sessionStorage.
   * @param {object} filters
   */
  setFilters(filters) {
    this.filters = { ...filters };
    this._persistFilters();
    this._emit('clients-updated', this.getClients());
  }

  // ─── Sync ────────────────────────────────────────────────────────────────────

  /**
   * Start real-time sync with Firebase.
   * Subscribes to client data changes and connection status.
   */
  async startSync() {
    // Restore offline queue from localForage
    await this._loadOfflineQueue();

    // Restore filters from sessionStorage
    this._restoreFilters();

    // Subscribe to client data changes
    this._unsubscribeClients = this.firebaseService.subscribeToChanges('clients', (data) => {
      const previousClients = { ...this.clients };
      this.clients = data || {};

      // Detect conflicts (another user overwrote a slot we recently edited)
      this._detectConflicts(previousClients, this.clients);

      // Recalculate expected dates for all clients
      this._recalculateExpectedDates();

      this._emit('clients-updated', this.getClients());
    });

    // Subscribe to connection status via .info/connected
    this._unsubscribeConnection = this.firebaseService.subscribeToChanges('.info/connected', (connected) => {
      if (connected) {
        const wasOffline = this.connectionStatus === 'offline';
        this._setConnectionStatus('online');

        // If coming back online, flush offline queue
        if (wasOffline && this._offlineQueue.length > 0) {
          this._flushOfflineQueue();
        }
      } else {
        this._setConnectionStatus('offline');
      }
    });
  }

  /**
   * Stop real-time sync. Unsubscribes from Firebase listeners.
   */
  stopSync() {
    if (this._unsubscribeClients) {
      this._unsubscribeClients();
      this._unsubscribeClients = null;
    }
    if (this._unsubscribeConnection) {
      this._unsubscribeConnection();
      this._unsubscribeConnection = null;
    }

    // Clear all debounce timers
    Object.values(this._debounceTimers).forEach(clearTimeout);
    this._debounceTimers = {};
  }

  /**
   * Get current connection status.
   * @returns {'online'|'offline'|'syncing'}
   */
  getConnectionStatus() {
    return this.connectionStatus;
  }

  // ─── Events ──────────────────────────────────────────────────────────────────

  /**
   * Register an event listener.
   * @param {string} event - 'clients-updated' | 'connection-change' | 'conflict'
   * @param {function} callback
   */
  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
  }

  /**
   * Emit an event to all registered listeners.
   * @param {string} event
   * @param {*} data
   */
  _emit(event, data) {
    const callbacks = this._listeners[event] || [];
    callbacks.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[StateManager] Error in '${event}' listener:`, err);
      }
    });
  }

  // ─── Private: Connection ─────────────────────────────────────────────────────

  /**
   * Update connection status and emit event.
   * @param {'online'|'offline'|'syncing'} status
   */
  _setConnectionStatus(status) {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      this._emit('connection-change', status);
    }
  }

  // ─── Private: Offline Queue ──────────────────────────────────────────────────

  /**
   * Persist the offline queue to localForage (IndexedDB).
   */
  async _persistOfflineQueue() {
    try {
      if (typeof localforage !== 'undefined') {
        await localforage.setItem(OFFLINE_QUEUE_KEY, this._offlineQueue);
      }
    } catch (err) {
      console.error('[StateManager] Failed to persist offline queue:', err);
    }
  }

  /**
   * Load the offline queue from localForage.
   */
  async _loadOfflineQueue() {
    try {
      if (typeof localforage !== 'undefined') {
        const queue = await localforage.getItem(OFFLINE_QUEUE_KEY);
        this._offlineQueue = queue || [];
      }
    } catch (err) {
      console.error('[StateManager] Failed to load offline queue:', err);
      this._offlineQueue = [];
    }
  }

  /**
   * Flush the offline queue sequentially on reconnection.
   * Uses last-write-wins: each queued write is sent with its original timestamp.
   */
  async _flushOfflineQueue() {
    if (this._syncing || this._offlineQueue.length === 0) return;

    this._syncing = true;
    this._setConnectionStatus('syncing');

    // Process queue sequentially
    while (this._offlineQueue.length > 0) {
      const entry = this._offlineQueue[0];
      try {
        await this.firebaseService.writeFollowUp(entry.clientId, entry.slotIndex, entry.data);
        this._offlineQueue.shift(); // Remove processed entry
      } catch (err) {
        console.error('[StateManager] Failed to flush queue entry:', err);
        // Stop processing on failure — will retry on next reconnection
        break;
      }
    }

    // Persist remaining queue (if any entries failed)
    await this._persistOfflineQueue();
    this._syncing = false;
    this._setConnectionStatus(this._offlineQueue.length === 0 ? 'online' : 'offline');
  }

  // ─── Private: Conflict Detection ────────────────────────────────────────────

  /**
   * Detect conflicts by comparing previous and new client data.
   * Emits 'conflict' event when a slot we recently edited was overwritten by another user.
   * @param {object} previous - Previous clients map
   * @param {object} current - Current clients map
   */
  _detectConflicts(previous, current) {
    // Check each debounce key to see if that slot was changed by someone else
    for (const key of Object.keys(this._debounceTimers)) {
      const [clientId, slotStr] = key.split('_');
      const slotIndex = parseInt(slotStr, 10);

      const prevSlot = previous[clientId]?.followUps?.[slotIndex];
      const currSlot = current[clientId]?.followUps?.[slotIndex];

      if (prevSlot && currSlot && currSlot.ultima_edicao) {
        const currentMember = this._getCurrentMember();
        if (currSlot.ultima_edicao.membro !== currentMember &&
            currSlot.ultima_edicao.timestamp !== prevSlot?.ultima_edicao?.timestamp) {
          // Another user wrote to a slot we're currently editing
          this._emit('conflict', {
            clientId,
            slotIndex,
            overwrittenBy: currSlot.ultima_edicao.membro,
            timestamp: currSlot.ultima_edicao.timestamp
          });
        }
      }
    }
  }

  /**
   * Get current team member name.
   * @returns {string}
   */
  _getCurrentMember() {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('membro') || 'Desconhecido';
    }
    return 'Desconhecido';
  }

  // ─── Private: Expected Dates ─────────────────────────────────────────────────

  /**
   * Recalculate expected dates for all clients based on fim_capacitacao.
   */
  _recalculateExpectedDates() {
    for (const [id, client] of Object.entries(this.clients)) {
      if (client.fim_capacitacao) {
        client.datas_previstas = calculateExpectedDates(client.fim_capacitacao);
      }
    }
  }

  // ─── Private: Filters ────────────────────────────────────────────────────────

  /**
   * Persist filters to sessionStorage.
   */
  _persistFilters() {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(FILTERS_SESSION_KEY, JSON.stringify(this.filters));
      }
    } catch (err) {
      console.error('[StateManager] Failed to persist filters:', err);
    }
  }

  /**
   * Restore filters from sessionStorage.
   */
  _restoreFilters() {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const stored = sessionStorage.getItem(FILTERS_SESSION_KEY);
        if (stored) {
          this.filters = JSON.parse(stored);
        }
      }
    } catch (err) {
      console.error('[StateManager] Failed to restore filters:', err);
      this.filters = {};
    }
  }
}
