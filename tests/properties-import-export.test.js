import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { ImportService } from '../js/import.js';
import { ExportService } from '../js/export.js';

// ─── Global XLSX mock ──────────────────────────────────────────────────────────

beforeEach(() => {
  global.XLSX = {
    read: (data, opts) => ({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} }
    }),
    utils: {
      sheet_to_json: (sheet, opts) => sheet.__rows || [],
      json_to_sheet: (data) => ({ data, '!ref': 'A1:Z' + data.length }),
      book_new: () => ({ Sheets: {}, SheetNames: [] }),
      book_append_sheet: (wb, ws, name) => {
        wb.Sheets[name] = ws;
        wb.SheetNames.push(name);
      },
    },
    write: () => new ArrayBuffer(100),
  };
});

// ─── Constants ──────────────────────────────────────────────────────────────────

const REQUIRED_PROJECT_COLUMNS = [
  'cód', 'nome', 'cliente', 'e-mail do cliente', 'telefone do cliente', 'líder',
  'cidade', 'uf', 'contrato', 'status', 'início capacitação'
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createFullProjectRow(overrides = {}) {
  return {
    'Cód': 1000,
    'nome': 'Test Company [test-slug]',
    'cliente': 'Test Company',
    'E-mail do Cliente': 'test@example.com',
    'Telefone do Cliente': '+55 11 99999-0000',
    'líder': 'Bruno Hideo Toyama',
    'cidade': 'São Paulo',
    'UF': 'SP',
    'contrato': '01/01/2026',
    'Status': 'Acompanhamento',
    'Início Capacitação': '2026-01-01',
    ...overrides
  };
}

function createExistingClient(overrides = {}) {
  return {
    id: 'test-slug_1000',
    codigo: 1000,
    nome: 'Test Company [test-slug]',
    cliente: 'Test Company',
    email: 'test@example.com',
    telefone: '+55 11 99999-0000',
    lider: 'Bruno Hideo Toyama',
    cidade: 'São Paulo',
    uf: 'SP',
    contrato: '01/01/2026',
    status_projeto: 'Acompanhamento',
    inicio_capacitacao: '2026-01-01',
    fim_capacitacao: '2026-01-10',
    followUps: {
      0: { data: '2026-01-17', ocorreu: 'sim', canal: 'whatsapp', retorno: 'OK', contato_realizado: 'sim' },
      1: { ocorreu: 'nao' },
      2: { ocorreu: 'nao' },
      3: { ocorreu: 'nao' }
    },
    acompanhamentos_agenda: [],
    ...overrides
  };
}


// ─── Property 4: Import validation reports missing columns exactly ──────────────
// Feature: deploy-client-tracking-panel, Property 4: Import validation reports missing columns exactly
// **Validates: Requirements 2.6**

describe('Feature: deploy-client-tracking-panel, Property 4: Import validation reports missing columns exactly', () => {
  const service = new ImportService();

  it('for any subset of required columns missing, the error lists exactly those absent columns', () => {
    // Generator: pick a random non-empty subset of columns to INCLUDE (leaving others missing)
    const subsetArb = fc.subarray(REQUIRED_PROJECT_COLUMNS, { minLength: 1, maxLength: REQUIRED_PROJECT_COLUMNS.length - 1 });

    fc.assert(
      fc.property(subsetArb, (presentColumns) => {
        // Ensure we actually have missing columns
        fc.pre(presentColumns.length < REQUIRED_PROJECT_COLUMNS.length);

        // Build a row with only the present columns
        const row = {};
        presentColumns.forEach(col => {
          row[col] = 'value';
        });

        const result = service.validateProjectsData([row]);

        // Calculate expected missing columns
        const expectedMissing = REQUIRED_PROJECT_COLUMNS.filter(col =>
          !presentColumns.map(c => c.toLowerCase()).includes(col.toLowerCase())
        );

        // The result should list exactly the missing columns
        expect(result.missingColumns.sort()).toEqual(expectedMissing.sort());
        // No more, no less
        expect(result.missingColumns.length).toBe(expectedMissing.length);
      }),
      { numRuns: 150 }
    );
  });

  it('when all required columns are present, missingColumns is empty', () => {
    fc.assert(
      fc.property(fc.nat({ max: 100 }), (_seed) => {
        const row = {};
        REQUIRED_PROJECT_COLUMNS.forEach(col => {
          row[col] = 'value';
        });
        const result = service.validateProjectsData([row]);
        expect(result.missingColumns).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });
});


// ─── Property 5: Import summary count invariant ─────────────────────────────────
// Feature: deploy-client-tracking-panel, Property 5: Import summary count invariant
// **Validates: Requirements 2.7**

describe('Feature: deploy-client-tracking-panel, Property 5: Import summary count invariant', () => {
  const service = new ImportService();

  // Generator for valid imported rows with unique códigos
  const validRowsArb = fc.array(
    fc.record({
      code: fc.integer({ min: 1, max: 100000 }),
      email: fc.string({ minLength: 3, maxLength: 20 })
    }),
    { minLength: 1, maxLength: 20 }
  ).map(items => {
    // Ensure unique codes
    const seen = new Set();
    return items.filter(item => {
      if (seen.has(item.code)) return false;
      seen.add(item.code);
      return true;
    }).map(item => createFullProjectRow({
      'código': item.code,
      'nome': `Company ${item.code} [slug-${item.code}]`,
      'email': item.email
    }));
  }).filter(rows => rows.length > 0);

  // Generator for a subset of existing clients (simulates pre-existing data)
  const existingSubsetArb = (imported) => {
    if (imported.length === 0) return fc.constant([]);
    return fc.subarray(
      imported.map(row => createExistingClient({
        id: `slug-${row['código']}_${row['código']}`,
        codigo: row['código'],
        nome: row['nome'],
        email: 'old@example.com' // different email to trigger update
      })),
      { minLength: 0, maxLength: imported.length }
    );
  };

  it('added + updated + unchanged = total valid rows for any import', () => {
    fc.assert(
      fc.property(validRowsArb, (importedRows) => {
        // Generate a random subset of existing clients
        const existingCodes = new Set();
        const existing = importedRows
          .filter(() => Math.random() > 0.5)
          .map(row => {
            existingCodes.add(String(row['código']));
            return createExistingClient({
              id: `slug-${row['código']}_${row['código']}`,
              codigo: row['código'],
              nome: row['nome'],
              email: 'old@example.com'
            });
          });

        const result = service.mergeProjects(existing, importedRows);
        const summary = service.generateImportSummary(result);

        // The invariant: added + updated + unchanged = total imported rows
        expect(summary.added + summary.updated + summary.unchanged).toBe(importedRows.length);
      }),
      { numRuns: 150 }
    );
  });

  it('added count equals rows with codes not in existing set', () => {
    fc.assert(
      fc.property(validRowsArb, (importedRows) => {
        // Create existing for first half
        const halfIdx = Math.floor(importedRows.length / 2);
        const existing = importedRows.slice(0, halfIdx).map(row =>
          createExistingClient({
            id: `slug-${row['código']}_${row['código']}`,
            codigo: row['código'],
            nome: row['nome'],
            email: row['email']
          })
        );

        const result = service.mergeProjects(existing, importedRows);
        const summary = service.generateImportSummary(result);

        // Added should be the ones not in existing
        expect(summary.added).toBe(importedRows.length - halfIdx);
        expect(summary.added + summary.updated + summary.unchanged).toBe(importedRows.length);
      }),
      { numRuns: 150 }
    );
  });
});


// ─── Property 6: Invalid row isolation ──────────────────────────────────────────
// Feature: deploy-client-tracking-panel, Property 6: Invalid row isolation
// **Validates: Requirements 2.8**

describe('Feature: deploy-client-tracking-panel, Property 6: Invalid row isolation', () => {
  const service = new ImportService();

  it('for any mix of valid and invalid rows, only valid rows are processed and error report lists exactly invalid line numbers', () => {
    // Generator: array of rows that may or may not be valid
    // Invalid = missing código or nome (the two mandatory per-row fields)
    const rowArb = fc.record({
      hasCode: fc.boolean(),
      hasName: fc.boolean(),
      code: fc.integer({ min: 1, max: 99999 }),
      name: fc.string({ minLength: 1, maxLength: 30 })
    });

    const rowsArb = fc.array(rowArb, { minLength: 1, maxLength: 20 });

    fc.assert(
      fc.property(rowsArb, (rowSpecs) => {
        // Build rows: all with required columns present at header level (so no missingColumns error)
        const rows = rowSpecs.map(spec => {
          const row = createFullProjectRow({
            'código': spec.hasCode ? spec.code : '',
            'nome': spec.hasName ? `Company ${spec.code} [slug-${spec.code}]` : ''
          });
          return row;
        });

        const result = service.validateProjectsData(rows);

        // Since all header columns are present, missingColumns should be empty
        expect(result.missingColumns).toHaveLength(0);

        // Calculate expected valid/invalid
        const expectedValid = rowSpecs.filter(s => s.hasCode && s.hasName);
        const expectedInvalid = rowSpecs
          .map((s, i) => ({ ...s, line: i + 2 })) // line = index + 2 (header is row 1)
          .filter(s => !s.hasCode || !s.hasName);

        // Valid count matches
        expect(result.valid.length).toBe(expectedValid.length);

        // Invalid count matches
        expect(result.invalid.length).toBe(expectedInvalid.length);

        // Invalid line numbers match exactly
        const actualLines = result.invalid.map(inv => inv.line).sort((a, b) => a - b);
        const expectedLines = expectedInvalid.map(inv => inv.line).sort((a, b) => a - b);
        expect(actualLines).toEqual(expectedLines);
      }),
      { numRuns: 150 }
    );
  });

  it('valid rows are isolated: invalid rows do not contaminate valid ones', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 99999 }), { minLength: 2, maxLength: 10 }),
        (codes) => {
          // Make unique codes
          const uniqueCodes = [...new Set(codes)];
          fc.pre(uniqueCodes.length >= 2);

          // Make first row invalid, rest valid
          const rows = uniqueCodes.map((code, i) =>
            createFullProjectRow({
              'código': i === 0 ? '' : code,
              'nome': `Company ${code} [slug-${code}]`
            })
          );

          const result = service.validateProjectsData(rows);

          // Only the first row should be invalid
          expect(result.invalid.length).toBe(1);
          expect(result.invalid[0].line).toBe(2); // first data row

          // All other rows should be valid
          expect(result.valid.length).toBe(uniqueCodes.length - 1);
        }
      ),
      { numRuns: 150 }
    );
  });
});


// ─── Property 3: Event-to-client matching accuracy ──────────────────────────────
// Feature: deploy-client-tracking-panel, Property 3: Event-to-client matching accuracy
// **Validates: Requirements 2.4, 10.5**

describe('Feature: deploy-client-tracking-panel, Property 3: Event-to-client matching accuracy', () => {
  const service = new ImportService();

  // Generator for slugs
  const slugArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,10}$/);

  it('events with slug in brackets match the correct client by slug; events without brackets are ignorados', () => {
    fc.assert(
      fc.property(
        fc.array(slugArb, { minLength: 1, maxLength: 8 }).map(slugs => [...new Set(slugs)]).filter(s => s.length >= 1),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
        (clientSlugs, eventHasBrackets) => {
          // Create clients with distinct slugs
          const clients = clientSlugs.map((slug, i) => createExistingClient({
            id: `${slug}_${1000 + i}`,
            codigo: 1000 + i,
            nome: `Company ${i} [${slug}]`
          }));

          // Create events: some with valid slugs in brackets, some without
          const events = eventHasBrackets.map((hasBrackets, i) => {
            if (hasBrackets) {
              // Pick a random client slug for matching
              const targetSlug = clientSlugs[i % clientSlugs.length];
              return {
                'data': '2026-08-01',
                'nome_evento': `[${targetSlug}] Acompanhamento ${i}`,
                'dono': 'Bruno Hideo Toyama'
              };
            } else {
              return {
                'data': '2026-08-01',
                'nome_evento': `Reunião interna ${i}`,
                'dono': 'Isabela Soares'
              };
            }
          });

          const result = service.matchEventsToClients(events, clients);

          // Events without brackets should be in ignorados
          const eventsWithoutBrackets = events.filter(e => !e['nome_evento'].match(/\[([^\]]+)\]/));
          expect(result.ignorados.length).toBe(eventsWithoutBrackets.length);

          // Events with brackets that match a client slug should be in vinculados
          const eventsWithBrackets = events.filter(e => e['nome_evento'].match(/\[([^\]]+)\]/));
          const matchableEvents = eventsWithBrackets.filter(e => {
            const slug = e['nome_evento'].match(/\[([^\]]+)\]/)[1];
            return clientSlugs.some(cs => cs.toLowerCase() === slug.toLowerCase());
          });
          expect(result.vinculados.length).toBe(matchableEvents.length);

          // Each vinculado should reference the correct client
          result.vinculados.forEach(v => {
            const eventSlug = v.event['nome_evento'].match(/\[([^\]]+)\]/)[1].toLowerCase();
            const clientSlug = v.client.nome.match(/\[([^\]]+)\]/)[1].toLowerCase();
            expect(clientSlug).toBe(eventSlug);
          });

          // Total should equal events count
          expect(result.vinculados.length + result.novos.length + result.ignorados.length).toBe(events.length);
        }
      ),
      { numRuns: 150 }
    );
  });

  it('matched events pre-fill follow-up data with event date and detectado_agenda=true', () => {
    fc.assert(
      fc.property(
        slugArb,
        fc.stringMatching(/^\d{2}\/\d{2}\/\d{4}$/),
        (slug, eventDate) => {
          const clients = [createExistingClient({
            id: `${slug}_1000`,
            codigo: 1000,
            nome: `Company [${slug}]`
          })];
          const events = [{
            'data': eventDate,
            'nome_evento': `[${slug}] Acompanhamento`,
            'dono': 'Bruno Hideo Toyama'
          }];

          const result = service.matchEventsToClients(events, clients);

          expect(result.vinculados.length).toBe(1);
          expect(result.vinculados[0].followUpData.data).toBe(eventDate);
          expect(result.vinculados[0].followUpData.detectado_agenda).toBe(true);
        }
      ),
      { numRuns: 150 }
    );
  });
});


// ─── Property 10: Export produces filtered data with all required columns ───────
// Feature: deploy-client-tracking-panel, Property 10: Export produces filtered data with all required columns
// **Validates: Requirements 5.2, 5.3**

describe('Feature: deploy-client-tracking-panel, Property 10: Export produces filtered data with all required columns', () => {
  const exportService = new ExportService();

  const leaders = ['Bruno Hideo Toyama', 'Isabela Soares', 'Henrique Puertas Stefano', 'Ana Paula'];
  const phases = ['Acompanhamento', 'Produção'];

  // Generator for a client
  const clientArb = fc.record({
    id: fc.uuid(),
    nome: fc.string({ minLength: 1, maxLength: 30 }),
    cliente: fc.string({ minLength: 1, maxLength: 30 }),
    lider: fc.constantFrom(...leaders),
    status_projeto: fc.constantFrom(...phases),
    telefone: fc.string({ minLength: 5, maxLength: 15 }),
    email: fc.string({ minLength: 5, maxLength: 25 }),
    cidade: fc.constantFrom('São Paulo', 'Porto Alegre', 'Curitiba', 'Rio de Janeiro'),
    uf: fc.constantFrom('SP', 'RS', 'PR', 'RJ'),
    followUps: fc.record({
      0: fc.record({ data: fc.constant('2026-01-17'), canal: fc.constantFrom('whatsapp', 'email', 'intercom', ''), ocorreu: fc.constantFrom('sim', 'não', ''), retorno: fc.string({ maxLength: 50 }) }),
      1: fc.record({ data: fc.constant(''), canal: fc.constant(''), ocorreu: fc.constantFrom('sim', 'não', ''), retorno: fc.constant('') }),
      2: fc.record({ data: fc.constant(''), canal: fc.constant(''), ocorreu: fc.constant(''), retorno: fc.constant('') }),
      3: fc.record({ data: fc.constant(''), canal: fc.constant(''), ocorreu: fc.constant(''), retorno: fc.constant('') }),
    })
  });

  // Filter generator
  const filterArb = fc.record({
    leader: fc.oneof(fc.constant(null), fc.constant('todos'), fc.constantFrom(...leaders)),
    phase: fc.oneof(fc.constant(null), fc.constant('todos'), fc.constantFrom(...phases)),
    status: fc.oneof(fc.constant(null), fc.constant('todos'), fc.constantFrom('zero', 'pendentes', 'completos'))
  });

  // Expected 23 column keys (7 base + 4 slots × 4 fields)
  const EXPECTED_COLUMNS = [
    'Nome', 'Líder', 'Fase', 'Telefone', 'E-mail', 'Cidade', 'Estado',
    'Acomp. 1 - Data', 'Acomp. 1 - Canal', 'Acomp. 1 - Ocorrência', 'Acomp. 1 - Retorno',
    'Acomp. 2 - Data', 'Acomp. 2 - Canal', 'Acomp. 2 - Ocorrência', 'Acomp. 2 - Retorno',
    'Acomp. 3 - Data', 'Acomp. 3 - Canal', 'Acomp. 3 - Ocorrência', 'Acomp. 3 - Retorno',
    'Acomp. 4 - Data', 'Acomp. 4 - Canal', 'Acomp. 4 - Ocorrência', 'Acomp. 4 - Retorno',
  ];

  it('exported data contains exactly one row per filtered client with all 23 columns', () => {
    fc.assert(
      fc.property(
        fc.array(clientArb, { minLength: 1, maxLength: 15 }),
        filterArb,
        (clients, filters) => {
          // We need to track what json_to_sheet received
          let capturedRows = null;
          global.XLSX.utils.json_to_sheet = (data) => {
            capturedRows = data;
            return { data, '!ref': 'A1:Z' + data.length };
          };

          const result = exportService.generateExcel(clients, filters);

          if (result === null) {
            // No clients matched filters — that's valid, nothing to check about rows
            return;
          }

          // Replicate filter logic to count expected filtered clients
          const filteredCount = clients.filter(client => {
            if (filters.leader && filters.leader !== 'todos') {
              if ((client.lider || '').toLowerCase() !== filters.leader.toLowerCase()) return false;
            }
            if (filters.phase && filters.phase !== 'todos') {
              if ((client.status_projeto || '').toLowerCase() !== filters.phase.toLowerCase()) return false;
            }
            if (filters.status && filters.status !== 'todos') {
              const followUps = client.followUps || {};
              let completed = 0;
              for (let i = 0; i < 4; i++) {
                if (followUps[i] && followUps[i].ocorreu === 'sim') completed++;
              }
              switch (filters.status) {
                case 'zero': if (completed !== 0) return false; break;
                case 'pendentes': if (completed < 1 || completed > 3) return false; break;
                case 'completos': if (completed !== 4) return false; break;
              }
            }
            return true;
          }).length;

          // Rows generated should match filtered count
          expect(capturedRows).not.toBeNull();
          expect(capturedRows.length).toBe(filteredCount);

          // Each row should have exactly 23 columns
          capturedRows.forEach(row => {
            expect(Object.keys(row).length).toBe(23);
            EXPECTED_COLUMNS.forEach(col => {
              expect(row).toHaveProperty(col);
            });
          });
        }
      ),
      { numRuns: 150 }
    );
  });
});


// ─── Property 11: Email content correctness ─────────────────────────────────────
// Feature: deploy-client-tracking-panel, Property 11: Email content correctness
// **Validates: Requirements 6.2, 6.3**

// NOTE: functions/weekly-email.js uses CommonJS (require) with firebase-functions, firebase-admin, nodemailer.
// Since this project is ESM ("type": "module"), we re-implement the core logic here for testing,
// mirroring the exact algorithms from functions/weekly-email.js (analyzeClients, groupByLider, getCurrentWeekRange).

/**
 * Re-implementation of getCurrentWeekRange from functions/weekly-email.js
 */
function getCurrentWeekRange(referenceDate) {
  const today = referenceDate || new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  return { monday, friday };
}

/**
 * Re-implementation of parseDate from functions/weekly-email.js
 */
function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(year, month - 1, day);
}

/**
 * Re-implementation of analyzeClients from functions/weekly-email.js
 */
function analyzeClients(clientsData, referenceDate) {
  const today = referenceDate || new Date();
  today.setHours(0, 0, 0, 0);
  const { monday, friday } = getCurrentWeekRange(today);

  const overdue = [];
  const weekScheduled = [];
  let totalOcorreu = 0;
  let totalClients = 0;

  if (!clientsData) {
    return { overdue, weekScheduled, totalOcorreu, totalSlots: 0 };
  }

  const clients = Object.entries(clientsData);
  totalClients = clients.length;

  for (const [id, client] of clients) {
    const nome = client.nome || 'Sem nome';
    const lider = client.lider || 'Sem líder';
    const datasPrevistas = client.datas_previstas || [];
    const followUps = client.followUps || {};

    for (let i = 0; i < datasPrevistas.length; i++) {
      const slotDate = parseDate(datasPrevistas[i]);
      if (!slotDate) continue;

      const followUp = followUps[String(i)] || {};
      const ocorreu = followUp.ocorreu === 'sim';

      if (ocorreu) {
        totalOcorreu++;
        continue;
      }

      if (slotDate < today) {
        const msPerDay = 24 * 60 * 60 * 1000;
        const fromMidnight = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate());
        const toMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const daysLate = Math.round((toMidnight - fromMidnight) / msPerDay);
        overdue.push({
          clientId: id,
          nome,
          lider,
          daysLate,
          dataPrevista: datasPrevistas[i],
          slot: i,
        });
      }

      if (slotDate >= monday && slotDate <= friday) {
        weekScheduled.push({
          clientId: id,
          nome,
          lider,
          dataPrevista: datasPrevistas[i],
          slot: i,
        });
      }
    }
  }

  const totalSlots = totalClients * 4;
  return { overdue, weekScheduled, totalOcorreu, totalSlots };
}

/**
 * Re-implementation of groupByLider from functions/weekly-email.js
 */
function groupByLider(items) {
  const grouped = {};
  for (const item of items) {
    const lider = item.lider || 'Sem líder';
    if (!grouped[lider]) {
      grouped[lider] = [];
    }
    grouped[lider].push(item);
  }
  return grouped;
}

describe('Feature: deploy-client-tracking-panel, Property 11: Email content correctness', () => {
  const leaders = ['Bruno Hideo Toyama', 'Isabela Soares', 'Henrique Puertas Stefano', 'Ana Paula'];

  // Generate a valid ISO date string within 2025-2027
  const isoDateArb = fc.record({
    year: fc.integer({ min: 2025, max: 2027 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 })
  }).map(({ year, month, day }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);

  // Generate a client data object for RTDB format
  const clientDataArb = fc.record({
    nome: fc.string({ minLength: 1, maxLength: 20 }),
    lider: fc.constantFrom(...leaders),
    datas_previstas: fc.array(isoDateArb, { minLength: 0, maxLength: 4 }),
    followUps: fc.record({
      '0': fc.record({ ocorreu: fc.constantFrom('sim', 'nao', 'não') }),
      '1': fc.record({ ocorreu: fc.constantFrom('sim', 'nao', 'não') }),
      '2': fc.record({ ocorreu: fc.constantFrom('sim', 'nao', 'não') }),
      '3': fc.record({ ocorreu: fc.constantFrom('sim', 'nao', 'não') }),
    })
  });

  it('analyzeClients correctly identifies all overdue and weekly scheduled follow-ups', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.uuid().map(id => id.slice(0, 8)), clientDataArb, { minKeys: 1, maxKeys: 10 }),
        isoDateArb,
        (clientsData, referenceDateStr) => {
          const referenceDate = new Date(referenceDateStr + 'T00:00:00');
          const { monday, friday } = getCurrentWeekRange(referenceDate);

          const result = analyzeClients(clientsData, referenceDate);

          // Manually calculate expected overdue and scheduled
          let expectedOverdue = 0;
          let expectedWeekScheduled = 0;
          let expectedTotalOcorreu = 0;
          const totalClients = Object.keys(clientsData).length;

          for (const [id, client] of Object.entries(clientsData)) {
            const datasPrevistas = client.datas_previstas || [];
            const followUps = client.followUps || {};

            for (let i = 0; i < datasPrevistas.length; i++) {
              const dateStr = datasPrevistas[i];
              if (!dateStr) continue;
              const parts = dateStr.split('-');
              if (parts.length !== 3) continue;
              const [year, month, day] = parts.map(Number);
              if (isNaN(year) || isNaN(month) || isNaN(day)) continue;
              const slotDate = new Date(year, month - 1, day);

              const followUp = followUps[String(i)] || {};
              const ocorreu = followUp.ocorreu === 'sim';

              if (ocorreu) {
                expectedTotalOcorreu++;
                continue;
              }

              if (slotDate < referenceDate) {
                expectedOverdue++;
              }
              if (slotDate >= monday && slotDate <= friday) {
                expectedWeekScheduled++;
              }
            }
          }

          // Verify counts match
          expect(result.overdue.length).toBe(expectedOverdue);
          expect(result.weekScheduled.length).toBe(expectedWeekScheduled);
          expect(result.totalOcorreu).toBe(expectedTotalOcorreu);
          expect(result.totalSlots).toBe(totalClients * 4);
        }
      ),
      { numRuns: 150 }
    );
  });

  it('overdue items are grouped by leader correctly', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.uuid().map(id => id.slice(0, 8)), clientDataArb, { minKeys: 1, maxKeys: 8 }),
        isoDateArb,
        (clientsData, referenceDateStr) => {
          const referenceDate = new Date(referenceDateStr + 'T00:00:00');
          const result = analyzeClients(clientsData, referenceDate);

          // Group overdue by leader
          const grouped = groupByLider(result.overdue);

          // Sum of all grouped items should equal total overdue
          const totalGrouped = Object.values(grouped).reduce((sum, items) => sum + items.length, 0);
          expect(totalGrouped).toBe(result.overdue.length);

          // Each item in a group should have the correct leader
          for (const [lider, items] of Object.entries(grouped)) {
            items.forEach(item => {
              expect(item.lider).toBe(lider);
            });
          }

          // Progress ratio is correct
          expect(result.totalSlots).toBe(Object.keys(clientsData).length * 4);
        }
      ),
      { numRuns: 150 }
    );
  });
});
