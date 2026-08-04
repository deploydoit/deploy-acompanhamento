/**
 * Property-Based Tests for Views & Import Modules
 * Tests Properties: 13, 9, 7, 8, 2, 4, 5, 6, 3, 10, 11
 *
 * Feature: deploy-client-tracking-panel
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { FilterEngine } from '../js/filters.js';
import { calculateMetrics } from '../js/views/dashboard.js';
import { countCompletedFollowUps, getColumnIndex, getUrgencyLevel } from '../js/views/kanban.js';
import { ImportService } from '../js/import.js';
import { ExportService } from '../js/export.js';

// CommonJS require for weekly-email (Cloud Function)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { analyzeClients } = require('../functions/weekly-email.js');

// ─── Generators ─────────────────────────────────────────────────────────────

const leaders = ['Bruno Hideo Toyama', 'Isabela Soares', 'Henrique Puertas Stefano', 'Ana Paula'];
const phases = ['Acompanhamento', 'Produção'];
const channels = ['whatsapp', 'email', 'intercom'];
const cities = ['São Paulo', 'Porto Alegre', 'Curitiba', 'Rio de Janeiro', 'Belo Horizonte'];
const states = ['SP', 'RS', 'PR', 'RJ', 'MG'];

const arbFollowUpSlot = fc.record({
  data: fc.option(fc.date({ min: new Date('2024-01-01'), max: new Date('2027-12-31') }).map(d => d.toISOString().slice(0, 10)), { nil: undefined }),
  contato_realizado: fc.constantFrom('sim', 'não'),
  canal: fc.constantFrom(...channels),
  retorno: fc.string({ minLength: 0, maxLength: 100 }),
  ocorreu: fc.constantFrom('sim', 'não'),
});

const arbFollowUps = fc.tuple(arbFollowUpSlot, arbFollowUpSlot, arbFollowUpSlot, arbFollowUpSlot)
  .map(([s0, s1, s2, s3]) => ({ 0: s0, 1: s1, 2: s2, 3: s3 }));

const arbClient = fc.record({
  id: fc.string({ minLength: 3, maxLength: 20 }).map(s => s.replace(/[^a-z0-9-]/gi, 'x')),
  codigo: fc.integer({ min: 1000, max: 9999 }),
  nome: fc.string({ minLength: 2, maxLength: 50 }),
  cliente: fc.string({ minLength: 2, maxLength: 50 }),
  email: fc.emailAddress(),
  telefone: fc.string({ minLength: 8, maxLength: 20 }),
  lider: fc.constantFrom(...leaders),
  cidade: fc.constantFrom(...cities),
  uf: fc.constantFrom(...states),
  contrato: fc.constant('01/01/2026'),
  status_projeto: fc.constantFrom(...phases),
  followUps: arbFollowUps,
  datas_previstas: fc.array(
    fc.date({ min: new Date('2024-01-01'), max: new Date('2027-12-31') }).map(d => d.toISOString().slice(0, 10)),
    { minLength: 4, maxLength: 4 }
  ),
});

const arbClientList = fc.array(arbClient, { minLength: 1, maxLength: 30 });

// ─── Property 13: Search partial case-insensitive matches ────────────────────

describe('Feature: deploy-client-tracking-panel, Property 13: Search returns partial case-insensitive matches', () => {
  /**
   * Validates: Requirements 7.3
   * For any client set and query, results include all and only clients where
   * nome/cliente/lider/cidade/uf contains query as case-insensitive substring.
   */
  it('search results contain exactly clients with matching fields', () => {
    const filterEngine = new FilterEngine();

    fc.assert(
      fc.property(
        arbClientList,
        fc.string({ minLength: 1, maxLength: 5 }),
        (clients, query) => {
          const results = filterEngine.applySearch(clients, query);
          const normalizedQuery = query.trim().toLowerCase();

          // Expected: all clients where at least one searchable field contains query
          const expected = clients.filter(client => {
            const fields = [
              (client.nome || '').toLowerCase(),
              (client.cliente || '').toLowerCase(),
              (client.lider || '').toLowerCase(),
              (client.cidade || '').toLowerCase(),
              (client.uf || '').toLowerCase(),
            ];
            return fields.some(f => f.includes(normalizedQuery));
          });

          expect(results.length).toBe(expected.length);
          for (const r of results) {
            expect(expected).toContainEqual(r);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 9: Dashboard metrics consistency ───────────────────────────────

describe('Feature: deploy-client-tracking-panel, Property 9: Dashboard metrics consistency', () => {
  /**
   * Validates: Requirements 4.1, 4.2, 4.3, 4.5
   * Invariants: naoIniciados + emAndamento + completos = total;
   * progresso = sum(ocorreu=sim) / (total × 4)
   */
  it('naoIniciados + emAndamento + completos = total, and progressRatio is correct', () => {
    fc.assert(
      fc.property(
        arbClientList,
        (clients) => {
          const metrics = calculateMetrics(clients);

          // Partition invariant
          expect(metrics.naoIniciados + metrics.emAndamento + metrics.completos).toBe(metrics.total);

          // Progress ratio invariant
          const expectedRealizados = clients.reduce((sum, c) => {
            const followUps = c.followUps || {};
            let count = 0;
            for (let i = 0; i < 4; i++) {
              if (followUps[i] && followUps[i].ocorreu === 'sim') count++;
            }
            return sum + count;
          }, 0);

          expect(metrics.realizados).toBe(expectedRealizados);

          const expectedRatio = metrics.totalSlots > 0 ? expectedRealizados / metrics.totalSlots : 0;
          expect(metrics.progressRatio).toBeCloseTo(expectedRatio, 10);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 7: Kanban column placement ─────────────────────────────────────

describe('Feature: deploy-client-tracking-panel, Property 7: Kanban column placement', () => {
  /**
   * Validates: Requirements 3.2, 3.3
   * Column = count of ocorreu=sim (0→0, 1→1, 2→2, 3→3, 4→4)
   */
  it('column index equals count of followUps with ocorreu=sim', () => {
    fc.assert(
      fc.property(
        arbClient,
        (client) => {
          const completed = countCompletedFollowUps(client);
          const colIdx = getColumnIndex(client);

          // Count manually
          const followUps = client.followUps || {};
          let expected = 0;
          for (let i = 0; i < 4; i++) {
            if (followUps[i] && followUps[i].ocorreu === 'sim') expected++;
          }

          expect(completed).toBe(expected);
          expect(colIdx).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 8: Urgency indicator calculation ───────────────────────────────

describe('Feature: deploy-client-tracking-panel, Property 8: Urgency indicator calculation', () => {
  /**
   * Validates: Requirements 3.4, 3.6, 8.5
   * red if days<0, yellow if 0≤days≤7, green if days>7
   */
  it('urgency level matches day thresholds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -365, max: 365 }),
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
      { numRuns: 100 }
    );
  });

  it('returns null when days is null', () => {
    expect(getUrgencyLevel(null)).toBe(null);
  });
});

// ─── Property 2: Import merge preserves follow-ups ───────────────────────────

describe('Feature: deploy-client-tracking-panel, Property 2: Import merge preserves follow-up data', () => {
  /**
   * Validates: Requirements 2.3
   * After merge, existing followUps remain unchanged.
   */
  it('existing followUps remain unchanged after merge', () => {
    const importService = new ImportService();

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.nat({ max: 999 }).map(n => `project_${1000 + n}`),
            codigo: fc.nat({ max: 999 }).map(n => 1000 + n),
            nome: fc.string({ minLength: 2, maxLength: 30 }),
            cliente: fc.string({ minLength: 2, maxLength: 30 }),
            email: fc.constant('a@b.com'),
            telefone: fc.constant('11999999999'),
            lider: fc.constantFrom(...leaders),
            cidade: fc.constantFrom(...cities),
            uf: fc.constantFrom(...states),
            contrato: fc.constant('01/01/2026'),
            status_projeto: fc.constantFrom(...phases),
            followUps: arbFollowUps,
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (existingClients) => {
          // Create imported rows from existing clients (simulating a re-import with updated metadata)
          const importedRows = existingClients.map(c => ({
            'código': c.codigo,
            'nome': c.nome + ' UPDATED',
            'cliente': c.cliente,
            'email': c.email,
            'telefone': c.telefone,
            'líder': c.lider,
            'cidade': c.cidade,
            'UF': c.uf,
            'contrato': c.contrato,
            'status_projeto': c.status_projeto,
            'inicio_capacitacao': '',
            'fim_capacitacao': '',
          }));

          const result = importService.mergeProjects(existingClients, importedRows);

          // All updated clients should preserve original followUps
          for (const updatedClient of result.updated) {
            const original = existingClients.find(c => c.codigo === updatedClient.codigo);
            if (original) {
              expect(updatedClient.followUps).toEqual(original.followUps);
            }
          }
          // Unchanged clients also preserve followUps
          for (const unchangedClient of result.unchanged) {
            const original = existingClients.find(c => c.codigo === unchangedClient.codigo);
            if (original) {
              expect(unchangedClient.followUps).toEqual(original.followUps);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 4: Import validation reports missing columns exactly ───────────

describe('Feature: deploy-client-tracking-panel, Property 4: Import validation reports missing columns exactly', () => {
  /**
   * Validates: Requirements 2.6
   * Missing columns list = exactly absent required columns.
   */
  it('reports exactly the missing columns', () => {
    const importService = new ImportService();
    const allRequiredColumns = [
      'código', 'nome', 'cliente', 'email', 'telefone', 'líder',
      'cidade', 'UF', 'contrato', 'status_projeto', 'inicio_capacitacao', 'fim_capacitacao'
    ];

    fc.assert(
      fc.property(
        fc.subarray(allRequiredColumns, { minLength: 1, maxLength: allRequiredColumns.length - 1 }),
        (presentColumns) => {
          // Build a row that only has the present columns
          const row = {};
          presentColumns.forEach(col => { row[col] = 'value'; });

          const result = importService.validateProjectsData([row]);
          const expectedMissing = allRequiredColumns.filter(col =>
            !presentColumns.map(c => c.toLowerCase()).includes(col.toLowerCase())
          );

          // missingColumns should list exactly the absent ones
          expect(result.missingColumns.sort()).toEqual(expectedMissing.sort());
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5: Import summary count invariant ──────────────────────────────

describe('Feature: deploy-client-tracking-panel, Property 5: Import summary count invariant', () => {
  /**
   * Validates: Requirements 2.7
   * added + updated + unchanged = total valid rows
   */
  it('added + updated + unchanged = total valid imported rows', () => {
    const importService = new ImportService();

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            codigo: fc.integer({ min: 1000, max: 1050 }),
            nome: fc.string({ minLength: 2, maxLength: 20 }),
            lider: fc.constantFrom(...leaders),
            followUps: arbFollowUps,
          }),
          { minLength: 0, maxLength: 10 }
        ),
        fc.array(
          fc.record({
            'código': fc.integer({ min: 1000, max: 1060 }),
            'nome': fc.string({ minLength: 2, maxLength: 20 }),
            'cliente': fc.constant('Client'),
            'email': fc.constant('a@b.com'),
            'telefone': fc.constant('11999999999'),
            'líder': fc.constantFrom(...leaders),
            'cidade': fc.constantFrom(...cities),
            'UF': fc.constantFrom(...states),
            'contrato': fc.constant('01/01/2026'),
            'status_projeto': fc.constantFrom(...phases),
            'inicio_capacitacao': fc.constant('2026-01-01'),
            'fim_capacitacao': fc.constant('2026-01-10'),
          }),
          { minLength: 1, maxLength: 15 }
        ),
        (existing, importedRows) => {
          // Validate to get valid rows
          const validation = importService.validateProjectsData(importedRows);
          const validRows = validation.valid;

          // Merge
          const result = importService.mergeProjects(existing, validRows);
          const summary = importService.generateImportSummary(result);

          expect(summary.added + summary.updated + summary.unchanged).toBe(validRows.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 6: Invalid row isolation ───────────────────────────────────────

describe('Feature: deploy-client-tracking-panel, Property 6: Invalid row isolation', () => {
  /**
   * Validates: Requirements 2.8
   * Only valid rows processed, error report has exactly invalid line numbers.
   */
  it('only valid rows are processed and error report contains exactly invalid line numbers', () => {
    const importService = new ImportService();
    const allCols = [
      'código', 'nome', 'cliente', 'email', 'telefone', 'líder',
      'cidade', 'UF', 'contrato', 'status_projeto', 'inicio_capacitacao', 'fim_capacitacao'
    ];

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            hasCode: fc.boolean(),
            hasName: fc.boolean(),
            code: fc.integer({ min: 1000, max: 9999 }),
            name: fc.string({ minLength: 2, maxLength: 20 }),
          }),
          { minLength: 1, maxLength: 15 }
        ),
        (rowSpecs) => {
          // Build rows that have all required columns in headers but some rows have empty mandatory fields
          const rows = rowSpecs.map(spec => {
            const row = {};
            allCols.forEach(col => { row[col] = 'value'; });
            row['código'] = spec.hasCode ? spec.code : '';
            row['nome'] = spec.hasName ? spec.name : '';
            return row;
          });

          const result = importService.validateProjectsData(rows);

          // Determine expected valid/invalid
          const expectedValidIndices = [];
          const expectedInvalidLines = [];
          rowSpecs.forEach((spec, idx) => {
            const lineNumber = idx + 2; // header is line 1
            if (spec.hasCode && spec.hasName) {
              expectedValidIndices.push(idx);
            } else {
              expectedInvalidLines.push(lineNumber);
            }
          });

          expect(result.valid.length).toBe(expectedValidIndices.length);
          expect(result.invalid.map(i => i.line).sort()).toEqual(expectedInvalidLines.sort());
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 3: Event-to-client matching ────────────────────────────────────

describe('Feature: deploy-client-tracking-panel, Property 3: Event-to-client matching accuracy', () => {
  /**
   * Validates: Requirements 2.4, 10.5
   * Events matched to correct client by slug pattern.
   */
  it('events are matched to the correct client by slug pattern in event name', () => {
    const importService = new ImportService();

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            slug: fc.stringMatching(/^[a-z]{3,8}(-[a-z]{2,5})?$/),
            codigo: fc.integer({ min: 1000, max: 9999 }),
            lider: fc.constantFrom(...leaders),
          }),
          { minLength: 1, maxLength: 8 }
        ),
        (clientSpecs) => {
          // Ensure unique slugs
          const seen = new Set();
          const uniqueSpecs = clientSpecs.filter(s => {
            if (seen.has(s.slug)) return false;
            seen.add(s.slug);
            return true;
          });
          if (uniqueSpecs.length === 0) return; // skip degenerate case

          // Build clients with slug in nome
          const clients = uniqueSpecs.map(spec => ({
            id: `${spec.slug}_${spec.codigo}`,
            codigo: spec.codigo,
            nome: `Company [${spec.slug}]`,
            lider: spec.lider,
            followUps: { 0: { ocorreu: 'nao' }, 1: { ocorreu: 'nao' }, 2: { ocorreu: 'nao' }, 3: { ocorreu: 'nao' } },
          }));

          // Build events referencing each client slug
          const events = uniqueSpecs.map(spec => ({
            data: '2026-08-01',
            nome_evento: `[${spec.slug}] Acompanhamento`,
            dono: spec.lider,
          }));

          const result = importService.matchEventsToClients(events, clients);

          // Each event should be matched (vinculados) to its corresponding client
          expect(result.vinculados.length).toBe(uniqueSpecs.length);
          for (const match of result.vinculados) {
            const eventSlug = match.event.nome_evento.match(/\[([^\]]+)\]/)?.[1];
            const clientSlug = match.client.nome.match(/\[([^\]]+)\]/)?.[1];
            expect(eventSlug).toBe(clientSlug);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 10: Export filtered data with all columns ──────────────────────

describe('Feature: deploy-client-tracking-panel, Property 10: Export produces filtered client data with all required columns', () => {
  /**
   * Validates: Requirements 5.2, 5.3
   * Exported data has exactly one row per filtered client with all 23 columns.
   */
  it('exported rows match filtered client count and contain all required columns', () => {
    const exportService = new ExportService();

    // Expected 23 columns: 7 base + 4 slots × 4 fields = 23
    const expectedColumns = [
      'Nome', 'Líder', 'Fase', 'Telefone', 'E-mail', 'Cidade', 'Estado',
      'Acomp. 1 - Data', 'Acomp. 1 - Canal', 'Acomp. 1 - Ocorrência', 'Acomp. 1 - Retorno',
      'Acomp. 2 - Data', 'Acomp. 2 - Canal', 'Acomp. 2 - Ocorrência', 'Acomp. 2 - Retorno',
      'Acomp. 3 - Data', 'Acomp. 3 - Canal', 'Acomp. 3 - Ocorrência', 'Acomp. 3 - Retorno',
      'Acomp. 4 - Data', 'Acomp. 4 - Canal', 'Acomp. 4 - Ocorrência', 'Acomp. 4 - Retorno',
    ];

    fc.assert(
      fc.property(
        arbClientList,
        fc.record({
          leader: fc.constantFrom(null, ...leaders),
          phase: fc.constantFrom(null, ...phases),
          status: fc.constantFrom(null, 'todos', 'zero', 'pendentes', 'completos'),
        }),
        (clients, filterOpts) => {
          const filters = {};
          if (filterOpts.leader) filters.leader = filterOpts.leader;
          if (filterOpts.phase) filters.phase = filterOpts.phase;
          if (filterOpts.status) filters.status = filterOpts.status;

          // Use formatClientRow directly to test output shape without XLSX dependency
          const filterEngine = new FilterEngine();
          const filteredClients = filterEngine.applyFilters(clients, filters);

          if (filteredClients.length === 0) return; // skip empty case

          const rows = filteredClients.map(c => exportService.formatClientRow(c));

          // One row per filtered client
          expect(rows.length).toBe(filteredClients.length);

          // Each row has all 23 columns
          for (const row of rows) {
            const keys = Object.keys(row);
            for (const col of expectedColumns) {
              expect(keys).toContain(col);
            }
            expect(keys.length).toBe(23);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 11: Email content correctness ──────────────────────────────────

describe('Feature: deploy-client-tracking-panel, Property 11: Email content correctness', () => {
  /**
   * Validates: Requirements 6.2, 6.3
   * Email data includes all overdue grouped by leader and correct progress ratio.
   */
  it('analyzeClients reports all overdue, groups by leader, and correct progress ratio', () => {
    fc.assert(
      fc.property(
        fc.record({
          numClients: fc.integer({ min: 1, max: 15 }),
          seed: fc.integer({ min: 0, max: 1000 }),
        }),
        ({ numClients, seed }) => {
          // Build client data as an object keyed by ID (Firebase RTDB format)
          const today = new Date('2026-07-15');
          const clientsData = {};
          let expectedTotalOcorreu = 0;

          for (let i = 0; i < numClients; i++) {
            const id = `client_${i}`;
            const lider = leaders[i % leaders.length];
            // Some dates before today (overdue), some after
            const datas = [
              '2026-07-10', // overdue (before 07-15)
              '2026-07-14', // overdue
              '2026-07-20', // future
              '2026-08-10', // future
            ];

            const followUps = {};
            // Based on seed, mark some as completed
            const completed = (seed + i) % 5; // 0 to 4 slots completed
            for (let j = 0; j < 4; j++) {
              followUps[String(j)] = { ocorreu: j < completed ? 'sim' : 'não' };
            }
            expectedTotalOcorreu += Math.min(completed, 4);

            clientsData[id] = {
              nome: `Client ${i}`,
              lider,
              datas_previstas: datas,
              followUps,
            };
          }

          const analysis = analyzeClients(clientsData, today);

          // Progress ratio check
          expect(analysis.totalOcorreu).toBe(expectedTotalOcorreu);
          expect(analysis.totalSlots).toBe(numClients * 4);

          // All overdue items should have daysLate > 0 and be grouped by leader
          for (const item of analysis.overdue) {
            expect(item.daysLate).toBeGreaterThan(0);
            expect(item.lider).toBeTruthy();
          }

          // Verify grouping works correctly
          if (analysis.overdue.length > 0) {
            const { groupByLider } = require('../functions/weekly-email.js');
            const grouped = groupByLider(analysis.overdue);
            const totalGrouped = Object.values(grouped).reduce((s, arr) => s + arr.length, 0);
            expect(totalGrouped).toBe(analysis.overdue.length);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
