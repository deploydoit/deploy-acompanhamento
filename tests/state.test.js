import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  StateManager,
  calculateExpectedDates,
  validateFollowUp,
  resolveConflict
} from '../js/state.js';

// ─── Mock FirebaseService ─────────────────────────────────────────────────────

function createMockFirebaseService() {
  const subscriptions = {};
  return {
    subscribeToChanges: vi.fn((path, callback) => {
      subscriptions[path] = callback;
      return () => { delete subscriptions[path]; };
    }),
    writeFollowUp: vi.fn(() => Promise.resolve()),
    readClients: vi.fn(() => Promise.resolve([])),
    _trigger: (path, data) => {
      if (subscriptions[path]) subscriptions[path](data);
    },
    _subscriptions: subscriptions
  };
}

// ─── Mock localforage ─────────────────────────────────────────────────────────

function createMockLocalForage() {
  const store = {};
  return {
    getItem: vi.fn((key) => Promise.resolve(store[key] || null)),
    setItem: vi.fn((key, val) => { store[key] = val; return Promise.resolve(); }),
    removeItem: vi.fn((key) => { delete store[key]; return Promise.resolve(); }),
    _store: store
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StateManager', () => {
  let firebaseService;
  let stateManager;
  let mockLocalForage;

  beforeEach(() => {
    vi.useFakeTimers();
    firebaseService = createMockFirebaseService();
    stateManager = new StateManager(firebaseService);
    mockLocalForage = createMockLocalForage();
    globalThis.localforage = mockLocalForage;

    // Mock sessionStorage
    const sessionStore = {};
    globalThis.sessionStorage = {
      getItem: vi.fn((key) => sessionStore[key] || null),
      setItem: vi.fn((key, val) => { sessionStore[key] = val; }),
      removeItem: vi.fn((key) => { delete sessionStore[key]; }),
    };

    // Mock localStorage for member identification
    globalThis.localStorage = {
      getItem: vi.fn((key) => key === 'membro' ? 'Isabela Soares' : null),
      setItem: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.localforage;
    delete globalThis.sessionStorage;
    delete globalThis.localStorage;
  });

  // ─── Reading ─────────────────────────────────────────────────────────────────

  describe('getClients()', () => {
    it('should return empty array initially', () => {
      expect(stateManager.getClients()).toEqual([]);
    });

    it('should return clients as array with id after sync', async () => {
      await stateManager.startSync();
      firebaseService._trigger('clients', {
        abc: { nome: 'Cliente A', lider: 'Ana Paula' },
        def: { nome: 'Cliente B', lider: 'Bruno Hideo Toyama' }
      });

      const clients = stateManager.getClients();
      expect(clients).toHaveLength(2);
      expect(clients[0]).toMatchObject({ id: 'abc', nome: 'Cliente A' });
      expect(clients[1]).toMatchObject({ id: 'def', nome: 'Cliente B' });
    });
  });

  describe('getClient(id)', () => {
    it('should return null for non-existing client', () => {
      expect(stateManager.getClient('nonexist')).toBeNull();
    });

    it('should return client with id field', async () => {
      await stateManager.startSync();
      firebaseService._trigger('clients', {
        abc: { nome: 'Cliente A', lider: 'Ana Paula' }
      });

      const client = stateManager.getClient('abc');
      expect(client).toMatchObject({ id: 'abc', nome: 'Cliente A', lider: 'Ana Paula' });
    });
  });

  describe('getFilters()', () => {
    it('should return empty object initially', () => {
      expect(stateManager.getFilters()).toEqual({});
    });

    it('should return filters after setFilters', () => {
      stateManager.setFilters({ leader: 'Ana Paula', phase: 'Acompanhamento' });
      expect(stateManager.getFilters()).toEqual({ leader: 'Ana Paula', phase: 'Acompanhamento' });
    });
  });

  // ─── Writing ─────────────────────────────────────────────────────────────────

  describe('updateFollowUp()', () => {
    it('should debounce writes by 2 seconds', async () => {
      stateManager.connectionStatus = 'online';
      const data = { contato_realizado: 'sim', canal: 'whatsapp', ocorreu: 'sim' };

      stateManager.updateFollowUp('client1', 0, data);
      expect(firebaseService.writeFollowUp).not.toHaveBeenCalled();

      // Advance less than 2 seconds
      vi.advanceTimersByTime(1500);
      expect(firebaseService.writeFollowUp).not.toHaveBeenCalled();

      // Advance past 2 seconds total
      vi.advanceTimersByTime(600);
      // Allow promise to resolve
      await vi.runAllTimersAsync();
      expect(firebaseService.writeFollowUp).toHaveBeenCalledWith('client1', 0, data);
    });

    it('should reset debounce timer on subsequent calls to same slot', async () => {
      stateManager.connectionStatus = 'online';
      const data1 = { ocorreu: 'não' };
      const data2 = { ocorreu: 'sim' };

      stateManager.updateFollowUp('client1', 0, data1);
      vi.advanceTimersByTime(1500);
      // Second call resets the timer
      stateManager.updateFollowUp('client1', 0, data2);
      vi.advanceTimersByTime(1500);
      // First timer would have fired, but it was cleared
      expect(firebaseService.writeFollowUp).not.toHaveBeenCalled();

      // Complete the second debounce
      vi.advanceTimersByTime(600);
      await vi.runAllTimersAsync();
      expect(firebaseService.writeFollowUp).toHaveBeenCalledTimes(1);
      expect(firebaseService.writeFollowUp).toHaveBeenCalledWith('client1', 0, data2);
    });

    it('should return validation result for inconsistent state', () => {
      const result = stateManager.updateFollowUp('client1', 0, {
        ocorreu: 'sim',
        contato_realizado: 'não'
      });
      expect(result).toEqual({ needsConfirmation: true });
    });

    it('should not require confirmation for consistent state', () => {
      const result = stateManager.updateFollowUp('client1', 0, {
        ocorreu: 'sim',
        contato_realizado: 'sim'
      });
      expect(result).toEqual({ needsConfirmation: false });
    });

    it('should queue writes when offline', async () => {
      stateManager.connectionStatus = 'offline';
      const data = { ocorreu: 'sim', contato_realizado: 'sim' };

      stateManager.updateFollowUp('client1', 0, data);
      vi.advanceTimersByTime(2100);
      await vi.runAllTimersAsync();

      expect(firebaseService.writeFollowUp).not.toHaveBeenCalled();
      expect(mockLocalForage.setItem).toHaveBeenCalled();
    });
  });

  // ─── setFilters ──────────────────────────────────────────────────────────────

  describe('setFilters()', () => {
    it('should update filters and persist to sessionStorage', () => {
      stateManager.setFilters({ leader: 'Bruno Hideo Toyama' });
      expect(stateManager.getFilters()).toEqual({ leader: 'Bruno Hideo Toyama' });
      expect(globalThis.sessionStorage.setItem).toHaveBeenCalled();
    });

    it('should emit clients-updated event on filter change', () => {
      const callback = vi.fn();
      stateManager.on('clients-updated', callback);
      stateManager.setFilters({ phase: 'Produção' });
      expect(callback).toHaveBeenCalled();
    });
  });

  // ─── Sync ────────────────────────────────────────────────────────────────────

  describe('startSync()', () => {
    it('should subscribe to clients and connection status', async () => {
      await stateManager.startSync();
      expect(firebaseService.subscribeToChanges).toHaveBeenCalledWith('clients', expect.any(Function));
      expect(firebaseService.subscribeToChanges).toHaveBeenCalledWith('.info/connected', expect.any(Function));
    });

    it('should update clients when Firebase emits changes', async () => {
      await stateManager.startSync();
      firebaseService._trigger('clients', {
        c1: { nome: 'Test', lider: 'Ana Paula' }
      });

      expect(stateManager.getClients()).toHaveLength(1);
      expect(stateManager.getClients()[0].nome).toBe('Test');
    });

    it('should emit clients-updated event on data change', async () => {
      const callback = vi.fn();
      stateManager.on('clients-updated', callback);
      await stateManager.startSync();

      firebaseService._trigger('clients', { c1: { nome: 'Test' } });
      expect(callback).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ id: 'c1', nome: 'Test' })
      ]));
    });

    it('should load offline queue from localForage on start', async () => {
      await stateManager.startSync();
      expect(mockLocalForage.getItem).toHaveBeenCalledWith('state_offline_queue');
    });
  });

  describe('stopSync()', () => {
    it('should unsubscribe from all Firebase listeners', async () => {
      await stateManager.startSync();
      stateManager.stopSync();

      // After stop, triggering data should not update state
      const clientsBefore = stateManager.getClients();
      firebaseService._trigger('clients', { new: { nome: 'Should not appear' } });
      expect(stateManager.getClients()).toEqual(clientsBefore);
    });

    it('should clear debounce timers', async () => {
      await stateManager.startSync();
      stateManager.connectionStatus = 'online';
      stateManager.updateFollowUp('c1', 0, { ocorreu: 'sim' });
      stateManager.stopSync();

      vi.advanceTimersByTime(3000);
      await vi.runAllTimersAsync();
      expect(firebaseService.writeFollowUp).not.toHaveBeenCalled();
    });
  });

  // ─── Connection Status ───────────────────────────────────────────────────────

  describe('getConnectionStatus()', () => {
    it('should return offline initially', () => {
      expect(stateManager.getConnectionStatus()).toBe('offline');
    });

    it('should return online when Firebase is connected', async () => {
      await stateManager.startSync();
      firebaseService._trigger('.info/connected', true);
      expect(stateManager.getConnectionStatus()).toBe('online');
    });

    it('should return offline when Firebase disconnects', async () => {
      await stateManager.startSync();
      firebaseService._trigger('.info/connected', true);
      firebaseService._trigger('.info/connected', false);
      expect(stateManager.getConnectionStatus()).toBe('offline');
    });

    it('should emit connection-change event', async () => {
      const callback = vi.fn();
      stateManager.on('connection-change', callback);
      await stateManager.startSync();

      firebaseService._trigger('.info/connected', true);
      expect(callback).toHaveBeenCalledWith('online');

      firebaseService._trigger('.info/connected', false);
      expect(callback).toHaveBeenCalledWith('offline');
    });
  });

  // ─── Offline Queue ───────────────────────────────────────────────────────────

  describe('offline queue', () => {
    it('should flush offline queue on reconnection', async () => {
      // Pre-populate localForage so startSync loads the queue
      const queueData = [
        { clientId: 'c1', slotIndex: 0, data: { ocorreu: 'sim' }, timestamp: 1000 },
        { clientId: 'c2', slotIndex: 1, data: { ocorreu: 'não' }, timestamp: 2000 }
      ];
      mockLocalForage._store['state_offline_queue'] = queueData;

      await stateManager.startSync();
      // Set status to offline first so reconnection triggers flush
      stateManager.connectionStatus = 'offline';
      // Simulate reconnection
      firebaseService._trigger('.info/connected', true);
      // Allow async flush to complete
      await vi.runAllTimersAsync();

      expect(firebaseService.writeFollowUp).toHaveBeenCalledTimes(2);
      expect(firebaseService.writeFollowUp).toHaveBeenCalledWith('c1', 0, { ocorreu: 'sim' });
      expect(firebaseService.writeFollowUp).toHaveBeenCalledWith('c2', 1, { ocorreu: 'não' });
    });

    it('should persist remaining queue if flush fails midway', async () => {
      firebaseService.writeFollowUp
        .mockResolvedValueOnce(undefined) // First succeeds
        .mockRejectedValueOnce(new Error('Network error')); // Second fails

      // Pre-populate localForage so startSync loads the queue
      const queueData = [
        { clientId: 'c1', slotIndex: 0, data: { ocorreu: 'sim' }, timestamp: 1000 },
        { clientId: 'c2', slotIndex: 1, data: { ocorreu: 'não' }, timestamp: 2000 }
      ];
      mockLocalForage._store['state_offline_queue'] = queueData;

      await stateManager.startSync();
      // Set status to offline first so reconnection triggers flush
      stateManager.connectionStatus = 'offline';
      firebaseService._trigger('.info/connected', true);
      await vi.runAllTimersAsync();

      // Only one item should remain in queue
      expect(stateManager._offlineQueue).toHaveLength(1);
      expect(stateManager._offlineQueue[0].clientId).toBe('c2');
    });
  });

  // ─── Events ──────────────────────────────────────────────────────────────────

  describe('on(event, callback)', () => {
    it('should register and invoke multiple listeners for same event', async () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      stateManager.on('clients-updated', cb1);
      stateManager.on('clients-updated', cb2);

      await stateManager.startSync();
      firebaseService._trigger('clients', { c1: { nome: 'Test' } });

      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });

    it('should handle errors in listeners without breaking others', async () => {
      const errorCb = vi.fn(() => { throw new Error('Listener error'); });
      const normalCb = vi.fn();
      stateManager.on('clients-updated', errorCb);
      stateManager.on('clients-updated', normalCb);

      await stateManager.startSync();
      firebaseService._trigger('clients', { c1: { nome: 'Test' } });

      expect(errorCb).toHaveBeenCalled();
      expect(normalCb).toHaveBeenCalled();
    });
  });

  // ─── Conflict Detection ──────────────────────────────────────────────────────

  describe('conflict detection', () => {
    it('should emit conflict event when another user overwrites a slot being edited', async () => {
      const conflictCb = vi.fn();
      stateManager.on('conflict', conflictCb);

      await stateManager.startSync();
      // Initial data
      firebaseService._trigger('clients', {
        c1: {
          nome: 'Cliente',
          followUps: { 0: { ocorreu: 'não', ultima_edicao: { membro: 'Isabela Soares', timestamp: 1000 } } }
        }
      });

      // User starts editing slot 0
      stateManager.connectionStatus = 'online';
      stateManager.updateFollowUp('c1', 0, { ocorreu: 'sim' });

      // Another user overwrites the same slot
      firebaseService._trigger('clients', {
        c1: {
          nome: 'Cliente',
          followUps: { 0: { ocorreu: 'não', retorno: 'Outro edit', ultima_edicao: { membro: 'Bruno Hideo Toyama', timestamp: 2000 } } }
        }
      });

      expect(conflictCb).toHaveBeenCalledWith(expect.objectContaining({
        clientId: 'c1',
        slotIndex: 0,
        overwrittenBy: 'Bruno Hideo Toyama'
      }));
    });
  });
});

// ─── Exported pure function tests ────────────────────────────────────────────

describe('calculateExpectedDates()', () => {
  it('should calculate 4 dates: +7d, +37d, +67d, +97d from fim_capacitacao', () => {
    const dates = calculateExpectedDates('2026-07-18');
    expect(dates).toEqual([
      '2026-07-25', // +7 days
      '2026-08-24', // +30 from first
      '2026-09-23', // +30 from second
      '2026-10-23'  // +30 from third
    ]);
  });

  it('should return empty array for null input', () => {
    expect(calculateExpectedDates(null)).toEqual([]);
  });

  it('should return empty array for invalid date', () => {
    expect(calculateExpectedDates('invalid-date')).toEqual([]);
  });

  it('should handle month boundaries correctly', () => {
    const dates = calculateExpectedDates('2026-01-25');
    expect(dates[0]).toBe('2026-02-01'); // Jan 25 + 7 = Feb 1
    expect(dates[1]).toBe('2026-03-03'); // Feb 1 + 30 = Mar 3
  });

  it('should handle year boundaries', () => {
    const dates = calculateExpectedDates('2026-12-25');
    expect(dates[0]).toBe('2027-01-01'); // Dec 25 + 7 = Jan 1
  });
});

describe('validateFollowUp()', () => {
  it('should return needsConfirmation true when ocorreu=sim and contato_realizado=não', () => {
    expect(validateFollowUp({ ocorreu: 'sim', contato_realizado: 'não' }))
      .toEqual({ needsConfirmation: true });
  });

  it('should return needsConfirmation false for all other combinations', () => {
    expect(validateFollowUp({ ocorreu: 'sim', contato_realizado: 'sim' }))
      .toEqual({ needsConfirmation: false });
    expect(validateFollowUp({ ocorreu: 'não', contato_realizado: 'não' }))
      .toEqual({ needsConfirmation: false });
    expect(validateFollowUp({ ocorreu: 'não', contato_realizado: 'sim' }))
      .toEqual({ needsConfirmation: false });
  });

  it('should handle missing fields gracefully', () => {
    expect(validateFollowUp({})).toEqual({ needsConfirmation: false });
    expect(validateFollowUp({ ocorreu: 'sim' })).toEqual({ needsConfirmation: false });
  });
});

describe('resolveConflict()', () => {
  it('should return the edit with the latest timestamp', () => {
    const local = { value: 'A', timestamp: 1000 };
    const remote = { value: 'B', timestamp: 2000 };
    expect(resolveConflict(local, remote)).toBe(remote);
  });

  it('should return local when timestamps are equal', () => {
    const local = { value: 'A', timestamp: 1000 };
    const remote = { value: 'B', timestamp: 1000 };
    expect(resolveConflict(local, remote)).toBe(local);
  });

  it('should return local when it has later timestamp', () => {
    const local = { value: 'A', timestamp: 3000 };
    const remote = { value: 'B', timestamp: 2000 };
    expect(resolveConflict(local, remote)).toBe(local);
  });
});
