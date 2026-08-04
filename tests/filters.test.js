import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FilterEngine } from '../js/filters.js';

// Mock sessionStorage for Node test environment
function setupSessionStorage() {
  const store = {};
  global.sessionStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
  return store;
}

// Helper: Create a client object with sensible defaults
function createClient(overrides = {}) {
  return {
    id: overrides.id || '1',
    nome: overrides.nome || 'Projeto Vortex',
    cliente: overrides.cliente || 'RM Participações',
    lider: overrides.lider || 'Bruno Hideo Toyama',
    cidade: overrides.cidade || 'Porto Alegre',
    uf: overrides.uf || 'RS',
    status_projeto: overrides.status_projeto || 'Acompanhamento',
    followUps: overrides.followUps || {
      0: { ocorreu: 'nao' },
      1: { ocorreu: 'nao' },
      2: { ocorreu: 'nao' },
      3: { ocorreu: 'nao' },
    },
    ...overrides,
  };
}

describe('FilterEngine', () => {
  let engine;
  let store;

  beforeEach(() => {
    engine = new FilterEngine();
    store = setupSessionStorage();
  });

  afterEach(() => {
    engine.cancelDebouncedSearch();
    delete global.sessionStorage;
  });

  describe('applyFilters()', () => {
    it('should return all clients when no filters are active', () => {
      const clients = [createClient({ id: '1' }), createClient({ id: '2' })];
      const result = engine.applyFilters(clients, {});
      expect(result).toHaveLength(2);
    });

    it('should return empty array for null or invalid clients', () => {
      expect(engine.applyFilters(null, {})).toEqual([]);
      expect(engine.applyFilters(undefined, {})).toEqual([]);
      expect(engine.applyFilters('not array', {})).toEqual([]);
    });

    it('should return all clients when filters is null', () => {
      const clients = [createClient()];
      expect(engine.applyFilters(clients, null)).toEqual(clients);
    });

    it('should filter by leader', () => {
      const clients = [
        createClient({ id: '1', lider: 'Bruno Hideo Toyama' }),
        createClient({ id: '2', lider: 'Isabela Soares' }),
        createClient({ id: '3', lider: 'Ana Paula' }),
      ];

      const result = engine.applyFilters(clients, { leader: 'Isabela Soares' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('should filter by phase', () => {
      const clients = [
        createClient({ id: '1', status_projeto: 'Acompanhamento' }),
        createClient({ id: '2', status_projeto: 'Produção' }),
      ];

      const result = engine.applyFilters(clients, { phase: 'Produção' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('should filter by status "zero" (0 completed)', () => {
      const clients = [
        createClient({ id: '1', followUps: { 0: { ocorreu: 'nao' }, 1: { ocorreu: 'nao' }, 2: { ocorreu: 'nao' }, 3: { ocorreu: 'nao' } } }),
        createClient({ id: '2', followUps: { 0: { ocorreu: 'sim' }, 1: { ocorreu: 'nao' }, 2: { ocorreu: 'nao' }, 3: { ocorreu: 'nao' } } }),
      ];

      const result = engine.applyFilters(clients, { status: 'zero' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should filter by status "pendentes" (1-3 completed)', () => {
      const clients = [
        createClient({ id: '1', followUps: { 0: { ocorreu: 'nao' }, 1: { ocorreu: 'nao' }, 2: { ocorreu: 'nao' }, 3: { ocorreu: 'nao' } } }),
        createClient({ id: '2', followUps: { 0: { ocorreu: 'sim' }, 1: { ocorreu: 'sim' }, 2: { ocorreu: 'nao' }, 3: { ocorreu: 'nao' } } }),
        createClient({ id: '3', followUps: { 0: { ocorreu: 'sim' }, 1: { ocorreu: 'sim' }, 2: { ocorreu: 'sim' }, 3: { ocorreu: 'sim' } } }),
      ];

      const result = engine.applyFilters(clients, { status: 'pendentes' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('should filter by status "completos" (4 completed)', () => {
      const clients = [
        createClient({ id: '1', followUps: { 0: { ocorreu: 'sim' }, 1: { ocorreu: 'sim' }, 2: { ocorreu: 'sim' }, 3: { ocorreu: 'sim' } } }),
        createClient({ id: '2', followUps: { 0: { ocorreu: 'sim' }, 1: { ocorreu: 'nao' }, 2: { ocorreu: 'nao' }, 3: { ocorreu: 'nao' } } }),
      ];

      const result = engine.applyFilters(clients, { status: 'completos' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should apply AND logic between different filter categories', () => {
      const clients = [
        createClient({ id: '1', lider: 'Bruno Hideo Toyama', status_projeto: 'Acompanhamento' }),
        createClient({ id: '2', lider: 'Bruno Hideo Toyama', status_projeto: 'Produção' }),
        createClient({ id: '3', lider: 'Isabela Soares', status_projeto: 'Acompanhamento' }),
      ];

      const result = engine.applyFilters(clients, {
        leader: 'Bruno Hideo Toyama',
        phase: 'Acompanhamento',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should combine filters with search', () => {
      const clients = [
        createClient({ id: '1', lider: 'Bruno Hideo Toyama', nome: 'Projeto Alpha' }),
        createClient({ id: '2', lider: 'Bruno Hideo Toyama', nome: 'Projeto Beta' }),
        createClient({ id: '3', lider: 'Isabela Soares', nome: 'Projeto Alpha' }),
      ];

      const result = engine.applyFilters(clients, {
        leader: 'Bruno Hideo Toyama',
        search: 'alpha',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should treat "todos" status as no filter', () => {
      const clients = [createClient({ id: '1' }), createClient({ id: '2' })];
      const result = engine.applyFilters(clients, { status: 'todos' });
      expect(result).toHaveLength(2);
    });

    it('should treat "todos" leader as no filter', () => {
      const clients = [
        createClient({ id: '1', lider: 'Bruno Hideo Toyama' }),
        createClient({ id: '2', lider: 'Isabela Soares' }),
      ];
      const result = engine.applyFilters(clients, { leader: 'todos' });
      expect(result).toHaveLength(2);
    });
  });

  describe('applySearch()', () => {
    const clients = [
      createClient({ id: '1', nome: 'Projeto Vortex', cliente: 'RM Participações', lider: 'Bruno Hideo Toyama', cidade: 'Porto Alegre', uf: 'RS' }),
      createClient({ id: '2', nome: 'Sistema Solar', cliente: 'Solar Energy', lider: 'Isabela Soares', cidade: 'São Paulo', uf: 'SP' }),
      createClient({ id: '3', nome: 'App Delivery', cliente: 'Fast Food Corp', lider: 'Ana Paula', cidade: 'Curitiba', uf: 'PR' }),
    ];

    it('should find by partial nome match', () => {
      const result = engine.applySearch(clients, 'vortex');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should find by partial cliente (project name) match', () => {
      const result = engine.applySearch(clients, 'solar');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('should find by lider match', () => {
      const result = engine.applySearch(clients, 'isabela');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('should find by cidade match', () => {
      const result = engine.applySearch(clients, 'curitiba');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3');
    });

    it('should find by uf (estado) match', () => {
      const result = engine.applySearch(clients, 'SP');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('should be case-insensitive', () => {
      const result = engine.applySearch(clients, 'PORTO ALEGRE');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should match partial strings (substring)', () => {
      const result = engine.applySearch(clients, 'ort');
      // Client 1 has 'Vortex' (nome) and 'Porto Alegre' (cidade) both containing 'ort'
      // but it's the same client, so only 1 result
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should return all clients for empty query', () => {
      expect(engine.applySearch(clients, '')).toHaveLength(3);
      expect(engine.applySearch(clients, '   ')).toHaveLength(3);
      expect(engine.applySearch(clients, null)).toHaveLength(3);
    });

    it('should return empty array for no matches', () => {
      const result = engine.applySearch(clients, 'xyz_nothing');
      expect(result).toHaveLength(0);
    });

    it('should return empty array for null/invalid clients', () => {
      expect(engine.applySearch(null, 'test')).toEqual([]);
      expect(engine.applySearch(undefined, 'test')).toEqual([]);
    });

    it('should handle clients with missing fields gracefully', () => {
      const clientsWithMissing = [
        { id: '1', nome: 'Test' },
        { id: '2' },
      ];
      // Should not throw
      const result = engine.applySearch(clientsWithMissing, 'test');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });
  });

  describe('combineFilters()', () => {
    it('should return empty predicates array for null filters', () => {
      const predicates = engine.combineFilters(null);
      expect(predicates).toEqual([]);
    });

    it('should return empty predicates array for empty filters', () => {
      const predicates = engine.combineFilters({});
      expect(predicates).toEqual([]);
    });

    it('should create predicate for leader filter', () => {
      const predicates = engine.combineFilters({ leader: 'Bruno Hideo Toyama' });
      expect(predicates).toHaveLength(1);

      const client = createClient({ lider: 'Bruno Hideo Toyama' });
      expect(predicates[0](client)).toBe(true);

      const otherClient = createClient({ lider: 'Isabela Soares' });
      expect(predicates[0](otherClient)).toBe(false);
    });

    it('should support OR within leader (array)', () => {
      const predicates = engine.combineFilters({ leader: ['Bruno Hideo Toyama', 'Isabela Soares'] });
      expect(predicates).toHaveLength(1);

      expect(predicates[0](createClient({ lider: 'Bruno Hideo Toyama' }))).toBe(true);
      expect(predicates[0](createClient({ lider: 'Isabela Soares' }))).toBe(true);
      expect(predicates[0](createClient({ lider: 'Ana Paula' }))).toBe(false);
    });

    it('should support OR within phase (array)', () => {
      const predicates = engine.combineFilters({ phase: ['Acompanhamento', 'Produção'] });
      expect(predicates).toHaveLength(1);

      expect(predicates[0](createClient({ status_projeto: 'Acompanhamento' }))).toBe(true);
      expect(predicates[0](createClient({ status_projeto: 'Produção' }))).toBe(true);
    });

    it('should support OR within status (array)', () => {
      const predicates = engine.combineFilters({ status: ['zero', 'completos'] });
      expect(predicates).toHaveLength(1);

      const zeroClient = createClient({ followUps: { 0: { ocorreu: 'nao' }, 1: { ocorreu: 'nao' }, 2: { ocorreu: 'nao' }, 3: { ocorreu: 'nao' } } });
      const completeClient = createClient({ followUps: { 0: { ocorreu: 'sim' }, 1: { ocorreu: 'sim' }, 2: { ocorreu: 'sim' }, 3: { ocorreu: 'sim' } } });
      const pendingClient = createClient({ followUps: { 0: { ocorreu: 'sim' }, 1: { ocorreu: 'nao' }, 2: { ocorreu: 'nao' }, 3: { ocorreu: 'nao' } } });

      expect(predicates[0](zeroClient)).toBe(true);
      expect(predicates[0](completeClient)).toBe(true);
      expect(predicates[0](pendingClient)).toBe(false);
    });

    it('should generate multiple predicates for combined categories (AND)', () => {
      const predicates = engine.combineFilters({
        leader: 'Bruno Hideo Toyama',
        phase: 'Acompanhamento',
        status: 'pendentes',
      });
      expect(predicates).toHaveLength(3);
    });

    it('should be case-insensitive for leader matching', () => {
      const predicates = engine.combineFilters({ leader: 'bruno hideo toyama' });
      const client = createClient({ lider: 'Bruno Hideo Toyama' });
      expect(predicates[0](client)).toBe(true);
    });

    it('should be case-insensitive for phase matching', () => {
      const predicates = engine.combineFilters({ phase: 'acompanhamento' });
      const client = createClient({ status_projeto: 'Acompanhamento' });
      expect(predicates[0](client)).toBe(true);
    });
  });

  describe('persistFilters() / restoreFilters()', () => {
    it('should persist and restore filters from sessionStorage', () => {
      const filters = { leader: 'Bruno Hideo Toyama', phase: 'Acompanhamento', status: 'pendentes', search: 'test' };

      engine.persistFilters(filters);
      const restored = engine.restoreFilters();

      expect(restored).toEqual(filters);
    });

    it('should return null when no filters are stored', () => {
      const restored = engine.restoreFilters();
      expect(restored).toBeNull();
    });

    it('should overwrite previous filters on persist', () => {
      engine.persistFilters({ leader: 'Bruno' });
      engine.persistFilters({ leader: 'Isabela' });

      const restored = engine.restoreFilters();
      expect(restored.leader).toBe('Isabela');
    });

    it('should handle sessionStorage errors gracefully', () => {
      // Override sessionStorage to throw
      global.sessionStorage = {
        getItem: () => { throw new Error('quota exceeded'); },
        setItem: () => { throw new Error('quota exceeded'); },
      };

      // Should not throw
      expect(() => engine.persistFilters({ leader: 'test' })).not.toThrow();
      expect(engine.restoreFilters()).toBeNull();
    });
  });

  describe('createDebouncedSearch()', () => {
    it('should call callback after 300ms delay', async () => {
      vi.useFakeTimers();
      const callback = vi.fn();
      const clients = [createClient({ id: '1', nome: 'Alpha' }), createClient({ id: '2', nome: 'Beta' })];

      const debouncedSearch = engine.createDebouncedSearch(callback, clients, {});
      debouncedSearch('alpha');

      // Should not have called yet
      expect(callback).not.toHaveBeenCalled();

      // Advance 300ms
      vi.advanceTimersByTime(300);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([clients[0]]);

      vi.useRealTimers();
    });

    it('should cancel previous timer on rapid calls', async () => {
      vi.useFakeTimers();
      const callback = vi.fn();
      const clients = [
        createClient({ id: '1', nome: 'Alpha' }),
        createClient({ id: '2', nome: 'Beta' }),
      ];

      const debouncedSearch = engine.createDebouncedSearch(callback, clients, {});
      debouncedSearch('al');
      vi.advanceTimersByTime(100);
      debouncedSearch('alp');
      vi.advanceTimersByTime(100);
      debouncedSearch('alpha');
      vi.advanceTimersByTime(300);

      // Should only have called once with final query
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([clients[0]]);

      vi.useRealTimers();
    });

    it('should apply existing filters before search', () => {
      vi.useFakeTimers();
      const callback = vi.fn();
      const clients = [
        createClient({ id: '1', nome: 'Alpha', lider: 'Bruno Hideo Toyama' }),
        createClient({ id: '2', nome: 'Alpha', lider: 'Isabela Soares' }),
      ];

      const filters = { leader: 'Bruno Hideo Toyama' };
      const debouncedSearch = engine.createDebouncedSearch(callback, clients, filters);
      debouncedSearch('alpha');
      vi.advanceTimersByTime(300);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([clients[0]]);

      vi.useRealTimers();
    });
  });

  describe('cancelDebouncedSearch()', () => {
    it('should cancel a pending debounced search', () => {
      vi.useFakeTimers();
      const callback = vi.fn();
      const clients = [createClient({ nome: 'Alpha' })];

      const debouncedSearch = engine.createDebouncedSearch(callback, clients, {});
      debouncedSearch('alpha');

      engine.cancelDebouncedSearch();
      vi.advanceTimersByTime(300);

      expect(callback).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('edge cases', () => {
    it('should handle clients with no followUps property', () => {
      const clients = [
        { id: '1', nome: 'No FollowUps', lider: 'Bruno' },
      ];

      const result = engine.applyFilters(clients, { status: 'zero' });
      expect(result).toHaveLength(1);
    });

    it('should handle clients with partial followUps', () => {
      const clients = [
        createClient({
          id: '1',
          followUps: { 0: { ocorreu: 'sim' } },
        }),
      ];

      const result = engine.applyFilters(clients, { status: 'pendentes' });
      expect(result).toHaveLength(1);
    });

    it('should not filter when all filters are "todos"', () => {
      const clients = [createClient({ id: '1' }), createClient({ id: '2' })];
      const result = engine.applyFilters(clients, { leader: 'todos', phase: 'todos', status: 'todos' });
      expect(result).toHaveLength(2);
    });
  });
});
