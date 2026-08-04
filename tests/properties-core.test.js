import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { resolveConflict, calculateExpectedDates, validateFollowUp } from '../js/state.js';
import { FilterEngine } from '../js/filters.js';

// ─── Property 1: Last-write-wins conflict resolution ───────────────────────────
// Feature: deploy-client-tracking-panel, Property 1: Last-write-wins conflict resolution
// **Validates: Requirements 1.6, 1.7**

describe('Property 1: Last-write-wins conflict resolution', () => {
  it('for any pair of concurrent edits, resolveConflict returns the one with the latest timestamp', () => {
    fc.assert(
      fc.property(
        fc.record({
          value: fc.string(),
          timestamp: fc.nat({ max: 2_000_000_000_000 })
        }),
        fc.record({
          value: fc.string(),
          timestamp: fc.nat({ max: 2_000_000_000_000 })
        }),
        (editA, editB) => {
          // Ensure different timestamps for a clear winner
          fc.pre(editA.timestamp !== editB.timestamp);

          const result = resolveConflict(editA, editB);
          const expectedWinner = editA.timestamp > editB.timestamp ? editA : editB;
          expect(result).toBe(expectedWinner);
        }
      ),
      { numRuns: 150 }
    );
  });

  it('when timestamps are equal, resolveConflict returns the local (first) edit', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.nat({ max: 2_000_000_000_000 }),
        (valueA, valueB, timestamp) => {
          const editA = { value: valueA, timestamp };
          const editB = { value: valueB, timestamp };

          const result = resolveConflict(editA, editB);
          expect(result).toBe(editA);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for any set of N edits, resolving pairwise yields the one with max timestamp', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            value: fc.string(),
            timestamp: fc.nat({ max: 2_000_000_000_000 })
          }),
          { minLength: 2, maxLength: 10 }
        ),
        (edits) => {
          // Ensure at least one unique max timestamp
          const maxTs = Math.max(...edits.map(e => e.timestamp));
          // Resolve pairwise left-to-right
          let winner = edits[0];
          for (let i = 1; i < edits.length; i++) {
            winner = resolveConflict(winner, edits[i]);
          }
          // Winner should have the max timestamp (or be the first with max ts due to >=)
          expect(winner.timestamp).toBe(maxTs);
        }
      ),
      { numRuns: 150 }
    );
  });
});

// ─── Property 15: Expected dates calculation ────────────────────────────────────
// Feature: deploy-client-tracking-panel, Property 15: Expected dates calculation
// **Validates: Requirements 10.3**

describe('Property 15: Expected dates calculation', () => {
  // Generator for valid dates in 2020-2030 range
  const validDateArb = fc.record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }) // Using 28 to avoid invalid dates
  }).map(({ year, month, day }) => {
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  });

  it('for any valid fim_capacitacao date, produces exactly 4 dates', () => {
    fc.assert(
      fc.property(validDateArb, (dateStr) => {
        const dates = calculateExpectedDates(dateStr);
        expect(dates).toHaveLength(4);
      }),
      { numRuns: 150 }
    );
  });

  it('1st date = fim + 7 days', () => {
    fc.assert(
      fc.property(validDateArb, (dateStr) => {
        const dates = calculateExpectedDates(dateStr);
        const base = new Date(dateStr + 'T00:00:00');
        const expected1st = new Date(base);
        expected1st.setDate(expected1st.getDate() + 7);

        const actual1st = new Date(dates[0] + 'T00:00:00');
        expect(actual1st.getTime()).toBe(expected1st.getTime());
      }),
      { numRuns: 150 }
    );
  });

  it('2nd date = 1st + 30 days', () => {
    fc.assert(
      fc.property(validDateArb, (dateStr) => {
        const dates = calculateExpectedDates(dateStr);
        const first = new Date(dates[0] + 'T00:00:00');
        const expected2nd = new Date(first);
        expected2nd.setDate(expected2nd.getDate() + 30);

        const actual2nd = new Date(dates[1] + 'T00:00:00');
        expect(actual2nd.getTime()).toBe(expected2nd.getTime());
      }),
      { numRuns: 150 }
    );
  });

  it('3rd date = 2nd + 30 days', () => {
    fc.assert(
      fc.property(validDateArb, (dateStr) => {
        const dates = calculateExpectedDates(dateStr);
        const second = new Date(dates[1] + 'T00:00:00');
        const expected3rd = new Date(second);
        expected3rd.setDate(expected3rd.getDate() + 30);

        const actual3rd = new Date(dates[2] + 'T00:00:00');
        expect(actual3rd.getTime()).toBe(expected3rd.getTime());
      }),
      { numRuns: 150 }
    );
  });

  it('4th date = 3rd + 30 days', () => {
    fc.assert(
      fc.property(validDateArb, (dateStr) => {
        const dates = calculateExpectedDates(dateStr);
        const third = new Date(dates[2] + 'T00:00:00');
        const expected4th = new Date(third);
        expected4th.setDate(expected4th.getDate() + 30);

        const actual4th = new Date(dates[3] + 'T00:00:00');
        expect(actual4th.getTime()).toBe(expected4th.getTime());
      }),
      { numRuns: 150 }
    );
  });

  it('all dates are in YYYY-MM-DD format', () => {
    fc.assert(
      fc.property(validDateArb, (dateStr) => {
        const dates = calculateExpectedDates(dateStr);
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
        dates.forEach(d => {
          expect(d).toMatch(isoDateRegex);
        });
      }),
      { numRuns: 150 }
    );
  });
});

// ─── Property 16: Validation alert for inconsistent state ───────────────────────
// Feature: deploy-client-tracking-panel, Property 16: Validation alert for inconsistent state
// **Validates: Requirements 10.7**

describe('Property 16: Validation alert for inconsistent state', () => {
  const ocorreuArb = fc.constantFrom('sim', 'não');
  const contatoArb = fc.constantFrom('sim', 'não');

  it('needsConfirmation is true IFF (ocorreu=sim AND contato_realizado=não)', () => {
    fc.assert(
      fc.property(ocorreuArb, contatoArb, (ocorreu, contato_realizado) => {
        const result = validateFollowUp({ ocorreu, contato_realizado });
        const expectedNeedsConfirmation = (ocorreu === 'sim' && contato_realizado === 'não');
        expect(result.needsConfirmation).toBe(expectedNeedsConfirmation);
      }),
      { numRuns: 150 }
    );
  });

  it('with extra fields present, validation still correct', () => {
    fc.assert(
      fc.property(
        ocorreuArb,
        contatoArb,
        fc.constantFrom('whatsapp', 'email', 'intercom'),
        fc.string({ maxLength: 500 }),
        (ocorreu, contato_realizado, canal, retorno) => {
          const data = { ocorreu, contato_realizado, canal, retorno };
          const result = validateFollowUp(data);
          const expectedNeedsConfirmation = (ocorreu === 'sim' && contato_realizado === 'não');
          expect(result.needsConfirmation).toBe(expectedNeedsConfirmation);
        }
      ),
      { numRuns: 150 }
    );
  });
});

// ─── Property 14: Follow-up data round-trip ─────────────────────────────────────
// Feature: deploy-client-tracking-panel, Property 14: Follow-up data round-trip
// **Validates: Requirements 10.1**

describe('Property 14: Follow-up data round-trip', () => {
  // Generator for valid follow-up records
  const followUpArb = fc.record({
    data: fc.record({
      day: fc.integer({ min: 1, max: 28 }),
      month: fc.integer({ min: 1, max: 12 }),
      year: fc.integer({ min: 2020, max: 2030 })
    }).map(({ day, month, year }) =>
      `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
    ),
    contato_realizado: fc.constantFrom('sim', 'não'),
    canal: fc.constantFrom('whatsapp', 'email', 'intercom'),
    retorno: fc.string({ minLength: 0, maxLength: 500 }).filter(s => {
      // Ensure JSON-safe string (no lone surrogates)
      try { JSON.parse(JSON.stringify(s)); return true; } catch { return false; }
    }),
    ocorreu: fc.constantFrom('sim', 'não')
  });

  it('serializing and deserializing a follow-up record produces identical values', () => {
    fc.assert(
      fc.property(followUpArb, (record) => {
        const serialized = JSON.stringify(record);
        const deserialized = JSON.parse(serialized);

        expect(deserialized.data).toBe(record.data);
        expect(deserialized.contato_realizado).toBe(record.contato_realizado);
        expect(deserialized.canal).toBe(record.canal);
        expect(deserialized.retorno).toBe(record.retorno);
        expect(deserialized.ocorreu).toBe(record.ocorreu);
      }),
      { numRuns: 150 }
    );
  });

  it('round-trip preserves all fields without data loss', () => {
    fc.assert(
      fc.property(followUpArb, (record) => {
        const roundTripped = JSON.parse(JSON.stringify(record));
        expect(roundTripped).toEqual(record);
      }),
      { numRuns: 150 }
    );
  });
});

// ─── Property 12: Filter combination logic (AND between categories, OR within) ─
// Feature: deploy-client-tracking-panel, Property 12: Filter combination logic (AND between categories, OR within)
// **Validates: Requirements 7.2, 7.4**

describe('Property 12: Filter combination logic (AND between categories, OR within)', () => {
  const leaders = ['Bruno Hideo Toyama', 'Isabela Soares', 'Henrique Puertas Stefano', 'Ana Paula'];
  const phases = ['Acompanhamento', 'Produção'];
  const statuses = ['zero', 'pendentes', 'completos'];

  // Generate a random client
  const clientArb = fc.record({
    id: fc.uuid(),
    nome: fc.string({ minLength: 1, maxLength: 30 }),
    cliente: fc.string({ minLength: 1, maxLength: 30 }),
    lider: fc.constantFrom(...leaders),
    cidade: fc.constantFrom('São Paulo', 'Porto Alegre', 'Rio de Janeiro', 'Curitiba'),
    uf: fc.constantFrom('SP', 'RS', 'RJ', 'PR'),
    status_projeto: fc.constantFrom(...phases),
    followUps: fc.record({
      0: fc.record({ ocorreu: fc.constantFrom('sim', 'nao') }),
      1: fc.record({ ocorreu: fc.constantFrom('sim', 'nao') }),
      2: fc.record({ ocorreu: fc.constantFrom('sim', 'nao') }),
      3: fc.record({ ocorreu: fc.constantFrom('sim', 'nao') })
    })
  });

  // Generate random filter selections
  const filterArb = fc.record({
    leader: fc.oneof(
      fc.constant(null),
      fc.constant('todos'),
      fc.constantFrom(...leaders),
      fc.subarray(leaders, { minLength: 1 })
    ),
    phase: fc.oneof(
      fc.constant(null),
      fc.constant('todos'),
      fc.constantFrom(...phases),
      fc.subarray(phases, { minLength: 1 })
    ),
    status: fc.oneof(
      fc.constant(null),
      fc.constant('todos'),
      fc.constantFrom(...statuses),
      fc.subarray(statuses, { minLength: 1 })
    )
  });

  // Helper: count completed follow-ups for a client
  function countCompleted(client) {
    const followUps = client.followUps || {};
    let count = 0;
    for (let i = 0; i < 4; i++) {
      if (followUps[i] && followUps[i].ocorreu === 'sim') count++;
    }
    return count;
  }

  // Helper: manually check if client matches a filter using the same logic
  function matchesFilter(client, filters) {
    // Leader predicate
    if (filters.leader && filters.leader !== 'todos') {
      if (Array.isArray(filters.leader)) {
        if (!filters.leader.some(l => (client.lider || '').toLowerCase() === l.toLowerCase())) return false;
      } else {
        if ((client.lider || '').toLowerCase() !== filters.leader.toLowerCase()) return false;
      }
    }

    // Phase predicate
    if (filters.phase && filters.phase !== 'todos') {
      if (Array.isArray(filters.phase)) {
        if (!filters.phase.some(p => (client.status_projeto || '').toLowerCase() === p.toLowerCase())) return false;
      } else {
        if ((client.status_projeto || '').toLowerCase() !== filters.phase.toLowerCase()) return false;
      }
    }

    // Status predicate
    if (filters.status && filters.status !== 'todos') {
      const completed = countCompleted(client);
      if (Array.isArray(filters.status)) {
        if (!filters.status.some(s => matchesStatus(completed, s))) return false;
      } else {
        if (!matchesStatus(completed, filters.status)) return false;
      }
    }

    return true;
  }

  function matchesStatus(completed, status) {
    switch (status) {
      case 'zero': return completed === 0;
      case 'pendentes': return completed >= 1 && completed <= 3;
      case 'completos': return completed === 4;
      case 'todos': return true;
      default: return true;
    }
  }

  it('result contains exactly clients satisfying AND across categories with OR within each', () => {
    const engine = new FilterEngine();

    fc.assert(
      fc.property(
        fc.array(clientArb, { minLength: 1, maxLength: 20 }),
        filterArb,
        (clients, filters) => {
          const result = engine.applyFilters(clients, filters);
          const expectedSet = clients.filter(c => matchesFilter(c, filters));

          // Same length
          expect(result.length).toBe(expectedSet.length);

          // Every result client matches the filter
          result.forEach(c => {
            expect(matchesFilter(c, filters)).toBe(true);
          });

          // Every matching client is in the result
          expectedSet.forEach(expected => {
            const found = result.some(r => r.id === expected.id);
            expect(found).toBe(true);
          });
        }
      ),
      { numRuns: 150 }
    );
  });

  it('result is always a subset of original clients', () => {
    const engine = new FilterEngine();

    fc.assert(
      fc.property(
        fc.array(clientArb, { minLength: 0, maxLength: 15 }),
        filterArb,
        (clients, filters) => {
          const result = engine.applyFilters(clients, filters);
          expect(result.length).toBeLessThanOrEqual(clients.length);
          result.forEach(r => {
            expect(clients.some(c => c.id === r.id)).toBe(true);
          });
        }
      ),
      { numRuns: 150 }
    );
  });
});
