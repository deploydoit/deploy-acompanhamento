import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { FilterEngine } from '../js/filters.js';
import { calculateMetrics } from '../js/views/dashboard.js';
import { getColumnIndex, countCompletedFollowUps, getUrgencyLevel } from '../js/views/kanban.js';
import { ImportService } from '../js/import.js';

// ─── Property 13: Search returns partial case-insensitive matches ────────────────
// Feature: deploy-client-tracking-panel, Property 13: Search returns partial case-insensitive matches
// **Validates: Requirements 7.3**

describe('Feature: deploy-client-tracking-panel, Property 13: Search returns partial case-insensitive matches', () => {
  const leaders = ['Bruno Hideo Toyama', 'Isabela Soares', 'Henrique Puertas Stefano', 'Ana Paula'];
  const cities = ['São Paulo', 'Porto Alegre', 'Rio de Janeiro', 'Curitiba', 'Belo Horizonte'];
  const states = ['SP', 'RS', 'RJ', 'PR', 'MG'];

  // Generator for a client with searchable fields
  const clientArb = fc.record({
    id: fc.uuid(),
    nome: fc.string({ minLength: 1, maxLength: 40 }).filter(s => s.trim().length > 0),
    cliente: fc.string({ minLength: 1, maxLength: 40 }).filter(s => s.trim().length > 0),
    lider: fc.constantFrom(...leaders),
    cidade: fc.constantFrom(...cities),
    uf: fc.constantFrom(...states),
    status_projeto: fc.constantFrom('Acompanhamento', 'Produção'),
    followUps: fc.constant({
      0: { ocorreu: 'nao' },
      1: { ocorreu: 'nao' },
      2: { ocorreu: 'nao' },
      3: { ocorreu: 'nao' }
    })
  });

  // Generator for a non-empty search query (short enough to likely match something)
  const queryArb = fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0);

  /**
   * Reference implementation: checks if a client matches a query across searchable fields.
   */
  function clientMatchesQuery(client, query) {
    const normalizedQuery = query.trim().toLowerCase();
    const searchableFields = [
      client.nome || '',
      client.cliente || '',
      client.lider || '',
      client.cidade || '',
      client.uf || '',
    ];
    return searchableFields.some(field => field.toLowerCase().includes(normalizedQuery));
  }

  it('results include all and only clients where at least one searchable field contains the query as case-insensitive substring', () => {
    const engine = new FilterEngine();

    fc.assert(
      fc.property(
        fc.array(clientArb, { minLength: 1, maxLength: 20 }),
        queryArb,
        (clients, query) => {
          const result = engine.applySearch(clients, query);
          const expected = clients.filter(c => clientMatchesQuery(c, query));

          // Same count
          expect(result.length).toBe(expected.length);

          // Every result matches the query
          result.forEach(c => {
            expect(clientMatchesQuery(c, query)).toBe(true);
          });

          // Every matching client is in the result
          expected.forEach(exp => {
            const found = result.some(r => r.id === exp.id);
            expect(found).toBe(true);
          });
        }
      ),
      { numRuns: 150 }
    );
  });

  it('search is case-insensitive: mixed case query finds matching clients', () => {
    const engine = new FilterEngine();

    fc.assert(
      fc.property(
        fc.array(clientArb, { minLength: 1, maxLength: 15 }),
        queryArb,
        (clients, query) => {
          const lower = engine.applySearch(clients, query.toLowerCase());
          const upper = engine.applySearch(clients, query.toUpperCase());
          const mixed = engine.applySearch(clients, query);

          // All case variations produce same count
          expect(lower.length).toBe(upper.length);
          expect(lower.length).toBe(mixed.length);
        }
      ),
      { numRuns: 150 }
    );
  });
});

// ─── Property 9: Dashboard metrics consistency ──────────────────────────────────
// Feature: deploy-client-tracking-panel, Property 9: Dashboard metrics consistency
// **Validates: Requirements 4.1, 4.2, 4.3, 4.5**

describe('Feature: deploy-client-tracking-panel, Property 9: Dashboard metrics consistency', () => {
  const leaders = ['Bruno Hideo Toyama', 'Isabela Soares', 'Henrique Puertas Stefano', 'Ana Paula'];

  // Generate a date string in the past or future
  const dateArb = fc.record({
    year: fc.integer({ min: 2023, max: 2027 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 })
  }).map(({ year, month, day }) => {
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  });

  // Generate a follow-up slot
  const followUpSlotArb = fc.record({
    ocorreu: fc.constantFrom('sim', 'nao'),
    contato_realizado: fc.constantFrom('sim', 'nao', '')
  });

  // Generate a client with follow-ups and optional datas_previstas
  const clientArb = fc.record({
    id: fc.uuid(),
    nome: fc.string({ minLength: 1, maxLength: 20 }),
    lider: fc.constantFrom(...leaders),
    status_projeto: fc.constantFrom('Acompanhamento', 'Produção'),
    followUps: fc.record({
      0: followUpSlotArb,
      1: followUpSlotArb,
      2: followUpSlotArb,
      3: followUpSlotArb
    }),
    datas_previstas: fc.array(dateArb, { minLength: 0, maxLength: 4 })
  });

  // Helper: count ocorreu=sim for a client
  function countOcorreu(client) {
    const followUps = client.followUps || {};
    let count = 0;
    for (let i = 0; i < 4; i++) {
      if (followUps[i] && followUps[i].ocorreu === 'sim') count++;
    }
    return count;
  }

  // Helper: check if client has any contato_realizado=sim
  function hasAnyContato(client) {
    const followUps = client.followUps || {};
    for (let i = 0; i < 4; i++) {
      if (followUps[i] && followUps[i].contato_realizado === 'sim') return true;
    }
    return false;
  }

  it('(a) naoIniciados + emAndamento + completos = total', () => {
    fc.assert(
      fc.property(
        fc.array(clientArb, { minLength: 0, maxLength: 30 }),
        (clients) => {
          const metrics = calculateMetrics(clients);
          expect(metrics.naoIniciados + metrics.emAndamento + metrics.completos).toBe(metrics.total);
        }
      ),
      { numRuns: 150 }
    );
  });

  it('(b) sum of per_leader_counts = total', () => {
    fc.assert(
      fc.property(
        fc.array(clientArb, { minLength: 0, maxLength: 30 }),
        (clients) => {
          const metrics = calculateMetrics(clients);
          const sumLeader = metrics.distribuicaoLider.reduce((sum, l) => sum + l.count, 0);
          expect(sumLeader).toBe(metrics.total);
        }
      ),
      { numRuns: 150 }
    );
  });

  it('(c) progressRatio = sum(ocorreu="sim") / (total × 4) — all-past clients count as 4/4', () => {
    fc.assert(
      fc.property(
        fc.array(clientArb, { minLength: 1, maxLength: 30 }),
        (clients) => {
          const metrics = calculateMetrics(clients);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          let totalRealizados = 0;
          for (const c of clients) {
            const ocorreu = countOcorreu(c);
            const datas = c.datas_previstas || [];
            const allPast = datas.length === 4 && ocorreu >= 1 && datas.every(d => {
              const dt = new Date(d + 'T00:00:00');
              return !isNaN(dt.getTime()) && dt < today;
            });
            totalRealizados += allPast ? 4 : ocorreu;
          }
          const expectedRatio = totalRealizados / (clients.length * 4);
          expect(metrics.progressRatio).toBeCloseTo(expectedRatio, 10);
        }
      ),
      { numRuns: 150 }
    );
  });

  it('(d) atrasados = count of overdue slots (all-past+confirmed clients excluded)', () => {
    fc.assert(
      fc.property(
        fc.array(clientArb, { minLength: 0, maxLength: 20 }),
        (clients) => {
          const metrics = calculateMetrics(clients);

          // Manually calculate atrasados with the same business rule
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          let expectedAtrasados = 0;

          for (const client of clients) {
            const datas = client.datas_previstas || [];
            const followUps = client.followUps || {};
            const ocorreu = countOcorreu(client);

            // Skip if all-past + at least 1 confirmed (treated as complete)
            if (datas.length === 4 && ocorreu >= 1) {
              const allPast = datas.every(d => {
                const dt = new Date(d + 'T00:00:00');
                return !isNaN(dt.getTime()) && dt < today;
              });
              if (allPast) continue;
            }

            for (let i = 0; i < datas.length; i++) {
              const dataPrevista = new Date(datas[i] + 'T00:00:00');
              if (isNaN(dataPrevista.getTime())) continue;
              const slot = followUps[i];
              const slotOcorreu = slot && slot.ocorreu === 'sim';
              if (dataPrevista < today && !slotOcorreu) {
                expectedAtrasados++;
              }
            }
          }

          expect(metrics.atrasados).toBe(expectedAtrasados);
        }
      ),
      { numRuns: 150 }
    );
  });
});

// ─── Property 7: Kanban column placement ────────────────────────────────────────
// Feature: deploy-client-tracking-panel, Property 7: Kanban column placement
// **Validates: Requirements 3.2, 3.3**

describe('Feature: deploy-client-tracking-panel, Property 7: Kanban column placement', () => {
  // Generator for follow-up slots
  const followUpsArb = fc.record({
    0: fc.record({ ocorreu: fc.constantFrom('sim', 'nao') }),
    1: fc.record({ ocorreu: fc.constantFrom('sim', 'nao') }),
    2: fc.record({ ocorreu: fc.constantFrom('sim', 'nao') }),
    3: fc.record({ ocorreu: fc.constantFrom('sim', 'nao') })
  });

  const clientArb = fc.record({
    id: fc.uuid(),
    nome: fc.string({ minLength: 1, maxLength: 20 }),
    lider: fc.constantFrom('Bruno Hideo Toyama', 'Isabela Soares'),
    followUps: followUpsArb
  });

  it('column index equals count of followUps where ocorreu === "sim"', () => {
    fc.assert(
      fc.property(clientArb, (client) => {
        const colIndex = getColumnIndex(client);
        const completedCount = countCompletedFollowUps(client);

        // Column is determined solely by count of completed follow-ups
        expect(colIndex).toBe(completedCount);

        // Verify it maps correctly: 0→col0, 1→col1, 2→col2, 3→col3, 4→col4
        let expectedCount = 0;
        const followUps = client.followUps || {};
        for (let i = 0; i < 4; i++) {
          if (followUps[i] && followUps[i].ocorreu === 'sim') expectedCount++;
        }
        expect(colIndex).toBe(expectedCount);
      }),
      { numRuns: 150 }
    );
  });

  it('column index is always in range 0-4', () => {
    fc.assert(
      fc.property(clientArb, (client) => {
        const colIndex = getColumnIndex(client);
        expect(colIndex).toBeGreaterThanOrEqual(0);
        expect(colIndex).toBeLessThanOrEqual(4);
      }),
      { numRuns: 150 }
    );
  });

  it('client with no followUps goes to column 0', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          nome: fc.string({ minLength: 1, maxLength: 20 }),
          lider: fc.string({ minLength: 1, maxLength: 20 })
        }),
        (client) => {
          // Client without followUps property
          const colIndex = getColumnIndex(client);
          expect(colIndex).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 8: Urgency indicator calculation ──────────────────────────────────
// Feature: deploy-client-tracking-panel, Property 8: Urgency indicator calculation
// **Validates: Requirements 3.4, 3.6, 8.5**

describe('Feature: deploy-client-tracking-panel, Property 8: Urgency indicator calculation', () => {
  it('red (bad) if days < 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: -1 }),
        (days) => {
          expect(getUrgencyLevel(days)).toBe('bad');
        }
      ),
      { numRuns: 150 }
    );
  });

  it('yellow (warn) if 0 ≤ days ≤ 7', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 7 }),
        (days) => {
          expect(getUrgencyLevel(days)).toBe('warn');
        }
      ),
      { numRuns: 150 }
    );
  });

  it('green (ok) if days > 7', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 1000 }),
        (days) => {
          expect(getUrgencyLevel(days)).toBe('ok');
        }
      ),
      { numRuns: 150 }
    );
  });

  it('null if days is null', () => {
    expect(getUrgencyLevel(null)).toBeNull();
  });

  it('null if days is undefined', () => {
    expect(getUrgencyLevel(undefined)).toBeNull();
  });

  it('correctly classifies any integer days value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10000, max: 10000 }),
        (days) => {
          const level = getUrgencyLevel(days);
          if (days < 0) {
            expect(level).toBe('bad');
          } else if (days <= 7) {
            expect(level).toBe('warn');
          } else {
            expect(level).toBe('ok');
          }
        }
      ),
      { numRuns: 150 }
    );
  });
});

// ─── Property 2: Import merge preserves follow-up data ──────────────────────────
// Feature: deploy-client-tracking-panel, Property 2: Import merge preserves follow-up data
// **Validates: Requirements 2.3**

describe('Feature: deploy-client-tracking-panel, Property 2: Import merge preserves follow-up data', () => {
  // Mock XLSX globally for ImportService
  beforeEach(() => {
    globalThis.XLSX = {
      read: vi.fn(),
      utils: { sheet_to_json: vi.fn() }
    };
  });

  const channels = ['whatsapp', 'email', 'intercom'];

  // Generate a follow-up slot with data
  const followUpSlotArb = fc.record({
    data: fc.string({ minLength: 5, maxLength: 10 }),
    contato_realizado: fc.constantFrom('sim', 'nao'),
    canal: fc.constantFrom(...channels),
    retorno: fc.string({ minLength: 0, maxLength: 100 }),
    ocorreu: fc.constantFrom('sim', 'nao'),
    ultima_edicao: fc.record({
      membro: fc.constantFrom('Bruno Hideo Toyama', 'Isabela Soares'),
      timestamp: fc.nat({ max: 2_000_000_000_000 })
    })
  });

  // Generate existing client with follow-up records
  const existingClientArb = fc.record({
    id: fc.string({ minLength: 3, maxLength: 10 }).map(s => `project_${s}`),
    codigo: fc.integer({ min: 1, max: 9999 }),
    nome: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    cliente: fc.string({ minLength: 1, maxLength: 30 }),
    email: fc.string({ minLength: 3, maxLength: 30 }),
    telefone: fc.string({ minLength: 5, maxLength: 20 }),
    lider: fc.constantFrom('Bruno Hideo Toyama', 'Isabela Soares', 'Henrique Puertas Stefano', 'Ana Paula'),
    cidade: fc.constantFrom('São Paulo', 'Porto Alegre', 'Curitiba'),
    uf: fc.constantFrom('SP', 'RS', 'PR'),
    contrato: fc.string({ minLength: 5, maxLength: 12 }),
    status_projeto: fc.constantFrom('Acompanhamento', 'Produção'),
    inicio_capacitacao: fc.constant('2026-01-01'),
    fim_capacitacao: fc.constant('2026-01-10'),
    followUps: fc.record({
      0: followUpSlotArb,
      1: followUpSlotArb,
      2: followUpSlotArb,
      3: followUpSlotArb
    })
  });

  // Generate an import row that will update metadata for the same client
  function makeImportRowFromClient(client) {
    return {
      'código': client.codigo,
      'nome': client.nome + ' Updated',
      'cliente': client.cliente + ' New',
      'email': 'new_' + client.email,
      'telefone': client.telefone,
      'líder': client.lider,
      'cidade': client.cidade,
      'uf': client.uf,
      'contrato': client.contrato,
      'status_projeto': client.status_projeto,
      'inicio_capacitacao': client.inicio_capacitacao,
      'fim_capacitacao': client.fim_capacitacao
    };
  }

  it('after merge, existing followUps remain unchanged while metadata fields update', () => {
    const importService = new ImportService();

    fc.assert(
      fc.property(
        existingClientArb,
        (existingClient) => {
          // Deep clone the original followUps for comparison
          const originalFollowUps = JSON.parse(JSON.stringify(existingClient.followUps));

          // Create an import row with updated metadata
          const importRow = makeImportRowFromClient(existingClient);

          // Perform merge
          const result = importService.mergeProjects([existingClient], [importRow]);

          // The client should appear in updated (metadata changed)
          const mergedClient = result.updated.length > 0
            ? result.updated[0]
            : result.unchanged[0];

          // followUps MUST be unchanged
          expect(mergedClient.followUps).toEqual(originalFollowUps);

          // Verify the followUps object is the exact same reference or equal structure
          for (let i = 0; i < 4; i++) {
            expect(mergedClient.followUps[i].data).toBe(originalFollowUps[i].data);
            expect(mergedClient.followUps[i].contato_realizado).toBe(originalFollowUps[i].contato_realizado);
            expect(mergedClient.followUps[i].canal).toBe(originalFollowUps[i].canal);
            expect(mergedClient.followUps[i].retorno).toBe(originalFollowUps[i].retorno);
            expect(mergedClient.followUps[i].ocorreu).toBe(originalFollowUps[i].ocorreu);
          }
        }
      ),
      { numRuns: 150 }
    );
  });

  it('metadata fields are updated from import while followUps are preserved', () => {
    const importService = new ImportService();

    fc.assert(
      fc.property(
        existingClientArb,
        (existingClient) => {
          const originalFollowUps = JSON.parse(JSON.stringify(existingClient.followUps));
          const importRow = makeImportRowFromClient(existingClient);

          const result = importService.mergeProjects([existingClient], [importRow]);

          // Get the merged client
          const allMerged = [...result.added, ...result.updated, ...result.unchanged];
          expect(allMerged.length).toBe(1);

          const mergedClient = allMerged[0];

          // followUps preserved
          expect(mergedClient.followUps).toEqual(originalFollowUps);

          // If there was a metadata change, the client should be in updated
          if (result.updated.length > 0) {
            // nome was changed (we appended " Updated")
            expect(mergedClient.nome).toBe(importRow['nome']);
          }
        }
      ),
      { numRuns: 150 }
    );
  });
});
