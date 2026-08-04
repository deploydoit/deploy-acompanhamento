import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for FirebaseService (js/firebase-service.js)
 * Since Firebase SDK is loaded via CDN (not as an npm module), we mock the global
 * `firebase` object to test the service logic in isolation.
 */

// ─── Firebase SDK Mock ───────────────────────────────────────────────────────

function createMockSnapshot(val) {
  return { val: () => val };
}

function createMockRef(data = null) {
  const listeners = [];
  return {
    _data: data,
    _listeners: listeners,
    once: vi.fn((event) => Promise.resolve(createMockSnapshot(data))),
    set: vi.fn(() => Promise.resolve()),
    push: vi.fn(() => ({ key: 'generated-key-123' })),
    on: vi.fn((event, cb) => {
      listeners.push(cb);
      return cb; // Firebase returns the callback as listener handle
    }),
    off: vi.fn((event, cb) => {
      const idx = listeners.indexOf(cb);
      if (idx !== -1) listeners.splice(idx, 1);
    }),
  };
}

function setupFirebaseMock() {
  const refs = {};
  const mockDb = {
    ref: vi.fn((path) => {
      if (!refs[path]) refs[path] = createMockRef();
      return refs[path];
    }),
    goOnline: vi.fn(),
  };
  const mockAuth = {
    signInAnonymously: vi.fn(() => Promise.resolve()),
    onAuthStateChanged: vi.fn((cb) => cb({ uid: 'test-uid' })),
  };

  globalThis.firebase = {
    apps: [],
    initializeApp: vi.fn(() => ({ name: 'test-app' })),
    database: vi.fn(() => mockDb),
    auth: vi.fn(() => mockAuth),
  };
  // Static property for server timestamp
  globalThis.firebase.database.ServerValue = { TIMESTAMP: { '.sv': 'timestamp' } };

  return { mockDb, mockAuth, refs };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FirebaseService', () => {
  let FirebaseService;
  let mockDb, mockAuth, refs;

  beforeEach(async () => {
    ({ mockDb, mockAuth, refs } = setupFirebaseMock());

    // Mock localStorage
    const storage = {};
    globalThis.localStorage = {
      getItem: vi.fn((key) => storage[key] || null),
      setItem: vi.fn((key, val) => { storage[key] = val; }),
    };
    globalThis.localStorage.setItem('membro', 'Isabela Soares');
    // Direct assignment for getItem mock return
    globalThis.localStorage.getItem = vi.fn((key) => storage[key] || null);

    // Dynamic import to pick up the global mock
    const module = await import('../js/firebase-service.js');
    FirebaseService = module.FirebaseService;
  });

  afterEach(() => {
    delete globalThis.firebase;
    delete globalThis.localStorage;
    vi.resetModules();
  });

  describe('constructor and initialization', () => {
    it('should initialize Firebase app if none exists', () => {
      const service = new FirebaseService({ apiKey: 'test' });
      expect(globalThis.firebase.initializeApp).toHaveBeenCalledWith({ apiKey: 'test' });
      expect(service.db).toBeDefined();
      expect(service.auth).toBeDefined();
    });

    it('should reuse existing Firebase app if already initialized', () => {
      globalThis.firebase.apps = [{ name: 'existing-app' }];
      const service = new FirebaseService();
      expect(globalThis.firebase.initializeApp).not.toHaveBeenCalled();
      expect(service.app).toEqual({ name: 'existing-app' });
    });

    it('should sign in anonymously on init', () => {
      new FirebaseService();
      expect(mockAuth.signInAnonymously).toHaveBeenCalled();
    });
  });

  describe('readClients()', () => {
    it('should return empty array when no clients exist', async () => {
      refs['clients'] = createMockRef(null);
      const service = new FirebaseService();
      const clients = await service.readClients();
      expect(clients).toEqual([]);
    });

    it('should return array of clients with id field added', async () => {
      const clientsData = {
        'abc123': { nome: 'Cliente A', lider: 'Bruno Hideo Toyama' },
        'def456': { nome: 'Cliente B', lider: 'Ana Paula' },
      };
      refs['clients'] = createMockRef(clientsData);
      const service = new FirebaseService();
      const clients = await service.readClients();

      expect(clients).toHaveLength(2);
      expect(clients[0]).toEqual({ id: 'abc123', nome: 'Cliente A', lider: 'Bruno Hideo Toyama' });
      expect(clients[1]).toEqual({ id: 'def456', nome: 'Cliente B', lider: 'Ana Paula' });
    });
  });

  describe('writeFollowUp()', () => {
    it('should write follow-up data with ultima_edicao metadata', async () => {
      const followUpPath = 'clients/abc123/followUps/0';
      refs[followUpPath] = createMockRef();
      const service = new FirebaseService();

      const data = { data: '2026-07-25', contato_realizado: 'sim', canal: 'whatsapp', ocorreu: 'sim' };
      await service.writeFollowUp('abc123', 0, data);

      expect(refs[followUpPath].set).toHaveBeenCalledWith({
        ...data,
        ultima_edicao: {
          membro: 'Isabela Soares',
          timestamp: { '.sv': 'timestamp' },
        },
      });
    });

    it('should use "Desconhecido" if no membro in localStorage', async () => {
      globalThis.localStorage.getItem = vi.fn(() => null);
      const followUpPath = 'clients/xyz/followUps/2';
      refs[followUpPath] = createMockRef();
      const service = new FirebaseService();

      await service.writeFollowUp('xyz', 2, { ocorreu: 'não' });

      const calledWith = refs[followUpPath].set.mock.calls[0][0];
      expect(calledWith.ultima_edicao.membro).toBe('Desconhecido');
    });
  });

  describe('writeClient()', () => {
    it('should write client data using provided id as key', async () => {
      const clientPath = 'clients/abc123';
      refs[clientPath] = createMockRef();
      const service = new FirebaseService();

      const client = { id: 'abc123', nome: 'Test Client', lider: 'Ana Paula' };
      await service.writeClient(client);

      expect(refs[clientPath].set).toHaveBeenCalledWith({ nome: 'Test Client', lider: 'Ana Paula' });
    });

    it('should generate a new key when client has no id', async () => {
      // The push().key is 'generated-key-123' from our mock
      refs['clients'] = createMockRef();
      refs['clients/generated-key-123'] = createMockRef();
      const service = new FirebaseService();

      const client = { nome: 'New Client', lider: 'Henrique Puertas Stefano' };
      await service.writeClient(client);

      expect(refs['clients/generated-key-123'].set).toHaveBeenCalledWith({
        nome: 'New Client',
        lider: 'Henrique Puertas Stefano',
      });
    });
  });

  describe('subscribeToChanges()', () => {
    it('should subscribe and call callback with snapshot value', () => {
      const path = 'clients';
      refs[path] = createMockRef();
      const service = new FirebaseService();
      const callback = vi.fn();

      service.subscribeToChanges(path, callback);

      expect(refs[path].on).toHaveBeenCalledWith('value', expect.any(Function));
    });

    it('should return an unsubscribe function that calls ref.off', () => {
      const path = 'clients/abc123';
      refs[path] = createMockRef();
      const service = new FirebaseService();
      const callback = vi.fn();

      const unsubscribe = service.subscribeToChanges(path, callback);
      expect(typeof unsubscribe).toBe('function');

      unsubscribe();
      expect(refs[path].off).toHaveBeenCalledWith('value', expect.any(Function));
    });
  });

  describe('getLastImportDate()', () => {
    it('should return date string when metadata exists', async () => {
      refs['metadata/lastImport/projetos/date'] = createMockRef('15/07/2026 14:30');
      const service = new FirebaseService();
      const date = await service.getLastImportDate('projetos');
      expect(date).toBe('15/07/2026 14:30');
    });

    it('should return null when no import date is set', async () => {
      refs['metadata/lastImport/eventos/date'] = createMockRef(null);
      const service = new FirebaseService();
      const date = await service.getLastImportDate('eventos');
      expect(date).toBeNull();
    });
  });

  describe('setLastImportDate()', () => {
    it('should write date and member to metadata path', async () => {
      refs['metadata/lastImport/projetos'] = createMockRef();
      const service = new FirebaseService();

      await service.setLastImportDate('projetos', '20/07/2026 10:00');

      expect(refs['metadata/lastImport/projetos'].set).toHaveBeenCalledWith({
        date: '20/07/2026 10:00',
        by: 'Isabela Soares',
      });
    });
  });

  describe('enablePersistence()', () => {
    it('should call db.goOnline()', () => {
      const service = new FirebaseService();
      service.enablePersistence();
      expect(mockDb.goOnline).toHaveBeenCalled();
    });
  });

  describe('getOfflineQueue()', () => {
    it('should return an empty array (queue managed externally)', async () => {
      const service = new FirebaseService();
      const queue = await service.getOfflineQueue();
      expect(queue).toEqual([]);
    });
  });
});
