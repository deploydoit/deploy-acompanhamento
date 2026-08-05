import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImportService } from '../js/import.js';

// Mock XLSX global (SheetJS loaded via CDN in browser)
function createMockXLSX(sheetData) {
  return {
    read: (data, opts) => ({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: sheetData }
    }),
    utils: {
      sheet_to_json: (sheet, opts) => sheet.__rows || []
    }
  };
}

// Helper: create a mock File object
function createMockFile(name, content = new ArrayBuffer(8)) {
  return {
    name,
    arrayBuffer: () => Promise.resolve(content)
  };
}

// Helper: create a valid project row
function createProjectRow(overrides = {}) {
  return {
    'código': 1939,
    'nome': 'RM Participações [vortex-nn]',
    'cliente': 'RM Participações',
    'email': 'test@example.com',
    'telefone': '+55 51 99999-0000',
    'líder': 'Bruno Hideo Toyama',
    'cidade': 'Porto Alegre',
    'UF': 'RS',
    'contrato': '01/06/2026',
    'status_projeto': 'Acompanhamento',
    'inicio_capacitacao': '2026-07-13',
    'fim_capacitacao': '2026-07-18',
    ...overrides
  };
}

// Helper: create a valid event row
function createEventRow(overrides = {}) {
  return {
    'data': '30/07/2026',
    'nome_evento': '[vortex-nn] Acompanhamento',
    'dono': 'Bruno Hideo Toyama',
    ...overrides
  };
}

// Helper: create an existing client object
function createExistingClient(overrides = {}) {
  return {
    id: 'vortex-nn_1939',
    codigo: 1939,
    nome: 'RM Participações [vortex-nn]',
    cliente: 'RM Participações',
    email: 'old@example.com',
    telefone: '+55 51 88888-0000',
    lider: 'Bruno Hideo Toyama',
    cidade: 'Porto Alegre',
    uf: 'RS',
    contrato: '01/06/2026',
    status_projeto: 'Acompanhamento',
    inicio_capacitacao: '2026-07-13',
    fim_capacitacao: '2026-07-18',
    followUps: {
      0: { data: '2026-07-25', ocorreu: 'sim', canal: 'whatsapp', retorno: 'OK', contato_realizado: 'sim' },
      1: { ocorreu: 'nao' },
      2: { ocorreu: 'nao' },
      3: { ocorreu: 'nao' }
    },
    acompanhamentos_agenda: [],
    ...overrides
  };
}

// Setup XLSX mock globally before tests
beforeEach(() => {
  global.XLSX = createMockXLSX({});
});

describe('ImportService', () => {
  let service;

  beforeEach(() => {
    service = new ImportService();
  });

  // ─── Task 7.1: Project Import ──────────────────────────────────────────────

  describe('parseProjectsFile()', () => {
    it('should reject non-.xlsx files', async () => {
      const file = createMockFile('data.csv');
      const result = await service.parseProjectsFile(file);
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('.csv');
    });

    it('should reject null file', async () => {
      const result = await service.parseProjectsFile(null);
      expect(result.success).toBe(false);
    });

    it('should parse .xlsx file successfully', async () => {
      const rows = [createProjectRow()];
      global.XLSX = {
        read: () => ({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } }),
        utils: { sheet_to_json: () => rows }
      };

      const file = createMockFile('projects.xlsx');
      const result = await service.parseProjectsFile(file);
      expect(result.success).toBe(true);
      expect(result.rows).toEqual(rows);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle SheetJS parsing errors gracefully', async () => {
      global.XLSX = {
        read: () => { throw new Error('Corrupted file'); },
        utils: { sheet_to_json: () => [] }
      };

      const file = createMockFile('broken.xlsx');
      const result = await service.parseProjectsFile(file);
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('Corrupted file');
    });

    it('should reject .xls files (only .xlsx accepted)', async () => {
      const file = createMockFile('data.xls');
      const result = await service.parseProjectsFile(file);
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('.xls');
    });
  });

  describe('validateProjectsData()', () => {
    it('should return empty result for empty rows', () => {
      const result = service.validateProjectsData([]);
      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(0);
      expect(result.missingColumns).toHaveLength(0);
    });

    it('should detect missing columns', () => {
      // Only 'código' and 'nome' present — missing many required columns
      const rows = [{ 'código': 1, 'nome': 'Test' }];
      const result = service.validateProjectsData(rows);
      expect(result.missingColumns.length).toBeGreaterThan(0);
      // 'cliente' maps to internal 'cliente', 'e-mail do cliente' maps to 'email'
      // Since neither 'cliente' nor any alias for it is present, it should be missing
      expect(result.missingColumns).toContain('cliente');
    });

    it('should report exactly the missing columns', () => {
      const rows = [{
        'código': 1, 'nome': 'Test', 'cliente': 'C',
        'email': 'e', 'telefone': 't', 'líder': 'l',
        'cidade': 'c', 'UF': 'SP'
        // Missing: contrato, status, início capacitação
      }];
      const result = service.validateProjectsData(rows);
      expect(result.missingColumns).toHaveLength(3);
      expect(result.missingColumns).toContain('contrato');
      expect(result.missingColumns).toContain('status');
      expect(result.missingColumns).toContain('início capacitação');
    });

    it('should validate rows and separate valid from invalid', () => {
      const rows = [
        createProjectRow({ 'código': 1001 }),
        createProjectRow({ 'código': '', 'nome': 'Missing Code' }),
        createProjectRow({ 'código': 1002, 'nome': '' }),
      ];
      const result = service.validateProjectsData(rows);
      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toHaveLength(2);
      expect(result.missingColumns).toHaveLength(0);
    });

    it('should report line numbers for invalid rows (header=row1, data starts row2)', () => {
      const rows = [
        createProjectRow({ 'código': '' }), // row 2
        createProjectRow({ 'código': 1001 }), // row 3
      ];
      const result = service.validateProjectsData(rows);
      expect(result.invalid[0].line).toBe(2);
    });

    it('should accept código=0 as valid', () => {
      const rows = [createProjectRow({ 'código': 0 })];
      const result = service.validateProjectsData(rows);
      expect(result.valid).toHaveLength(1);
    });
  });

  describe('mergeProjects()', () => {
    it('should add new clients when no existing match', () => {
      const existing = [];
      const imported = [createProjectRow({ 'código': 2000, 'nome': 'New Client [new-slug]' })];

      const result = service.mergeProjects(existing, imported);
      expect(result.added).toHaveLength(1);
      expect(result.updated).toHaveLength(0);
      expect(result.unchanged).toHaveLength(0);
      expect(result.added[0].codigo).toBe(2000);
    });

    it('should update existing clients metadata', () => {
      const existing = [createExistingClient()];
      const imported = [createProjectRow({ 'código': 1939, 'email': 'new@example.com' })];

      const result = service.mergeProjects(existing, imported);
      expect(result.updated).toHaveLength(1);
      expect(result.updated[0].email).toBe('new@example.com');
    });

    it('should NEVER overwrite followUps of existing clients', () => {
      const existing = [createExistingClient()];
      const imported = [createProjectRow({ 'código': 1939, 'email': 'new@example.com' })];

      const result = service.mergeProjects(existing, imported);
      expect(result.updated[0].followUps).toEqual(existing[0].followUps);
      expect(result.updated[0].followUps[0].ocorreu).toBe('sim');
    });

    it('should mark unchanged when metadata is the same', () => {
      const existing = [createExistingClient({
        email: 'test@example.com',
        telefone: '+55 51 99999-0000'
      })];
      const imported = [createProjectRow({ 'código': 1939 })];

      const result = service.mergeProjects(existing, imported);
      expect(result.unchanged).toHaveLength(1);
      expect(result.added).toHaveLength(0);
      expect(result.updated).toHaveLength(0);
    });

    it('should handle null existing clients array', () => {
      const imported = [createProjectRow({ 'código': 2000 })];
      const result = service.mergeProjects(null, imported);
      expect(result.added).toHaveLength(1);
    });

    it('should create proper client ID from slug and código', () => {
      const imported = [createProjectRow({ 'código': 2000, 'nome': 'Company [my-slug]' })];
      const result = service.mergeProjects([], imported);
      expect(result.added[0].id).toBe('my-slug_2000');
    });

    it('should initialize followUps for new clients', () => {
      const imported = [createProjectRow({ 'código': 3000 })];
      const result = service.mergeProjects([], imported);
      expect(result.added[0].followUps).toBeDefined();
      expect(result.added[0].followUps[0].ocorreu).toBe('nao');
      expect(result.added[0].followUps[3].ocorreu).toBe('nao');
    });
  });

  describe('generateImportSummary()', () => {
    it('should return correct counts', () => {
      const result = {
        added: [{ id: '1' }, { id: '2' }],
        updated: [{ id: '3' }],
        unchanged: [{ id: '4' }, { id: '5' }, { id: '6' }],
        errors: [{ line: 5, reason: 'bad data' }]
      };
      const summary = service.generateImportSummary(result);
      expect(summary.added).toBe(2);
      expect(summary.updated).toBe(1);
      expect(summary.unchanged).toBe(3);
      expect(summary.errors).toHaveLength(1);
    });

    it('should handle missing arrays gracefully', () => {
      const summary = service.generateImportSummary({});
      expect(summary.added).toBe(0);
      expect(summary.updated).toBe(0);
      expect(summary.unchanged).toBe(0);
      expect(summary.errors).toHaveLength(0);
    });
  });

  // ─── Task 7.6: Event Import ────────────────────────────────────────────────

  describe('parseEventsFile()', () => {
    it('should reject non-.xlsx files', async () => {
      const file = createMockFile('events.csv');
      const result = await service.parseEventsFile(file);
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('.csv');
    });

    it('should reject null file', async () => {
      const result = await service.parseEventsFile(null);
      expect(result.success).toBe(false);
    });

    it('should parse .xlsx event file successfully', async () => {
      const rows = [createEventRow()];
      global.XLSX = {
        read: () => ({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } }),
        utils: { sheet_to_json: () => rows }
      };

      const file = createMockFile('events.xlsx');
      const result = await service.parseEventsFile(file);
      expect(result.success).toBe(true);
      expect(result.rows).toEqual(rows);
    });

    it('should handle parse errors gracefully', async () => {
      global.XLSX = {
        read: () => { throw new Error('Bad format'); },
        utils: { sheet_to_json: () => [] }
      };
      const file = createMockFile('broken.xlsx');
      const result = await service.parseEventsFile(file);
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('Bad format');
    });
  });

  describe('validateEventsData()', () => {
    it('should return empty result for empty rows', () => {
      const result = service.validateEventsData([]);
      expect(result.valid).toHaveLength(0);
      expect(result.missingColumns).toHaveLength(0);
    });

    it('should detect missing event columns', () => {
      const rows = [{ 'data': '30/07/2026' }]; // missing nome_evento
      const result = service.validateEventsData(rows);
      expect(result.missingColumns).toContain('nome_evento');
    });

    it('should validate rows with valid data', () => {
      const rows = [
        createEventRow(),
        createEventRow({ 'data': '' }), // invalid - no date
      ];
      const result = service.validateEventsData(rows);
      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].line).toBe(3); // row index 1 + 2
    });

    it('should reject rows with empty nome_evento', () => {
      const rows = [createEventRow({ 'nome_evento': '' })];
      const result = service.validateEventsData(rows);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].reason).toContain('nome_evento');
    });
  });

  describe('matchEventsToClients()', () => {
    it('should match events to clients by slug in event name', () => {
      const events = [createEventRow({ 'nome_evento': '[vortex-nn] Acompanhamento' })];
      const clients = [createExistingClient()];

      const result = service.matchEventsToClients(events, clients);
      expect(result.vinculados).toHaveLength(1);
      expect(result.vinculados[0].client.id).toBe('vortex-nn_1939');
      expect(result.novos).toHaveLength(0);
      expect(result.ignorados).toHaveLength(0);
    });

    it('should mark events as "novos" when slug not found in clients', () => {
      const events = [createEventRow({ 'nome_evento': '[unknown-project] Acompanhamento' })];
      const clients = [createExistingClient()];

      const result = service.matchEventsToClients(events, clients);
      expect(result.vinculados).toHaveLength(0);
      expect(result.novos).toHaveLength(1);
    });

    it('should mark events as "ignorados" when no slug in event name', () => {
      const events = [createEventRow({ 'nome_evento': 'Reunião interna' })];
      const clients = [createExistingClient()];

      const result = service.matchEventsToClients(events, clients);
      expect(result.ignorados).toHaveLength(1);
      expect(result.vinculados).toHaveLength(0);
    });

    it('should pre-fill follow-up data with event date', () => {
      const events = [createEventRow({ 'data': '15/08/2026' })];
      const clients = [createExistingClient()];

      const result = service.matchEventsToClients(events, clients);
      // Stored as ISO: <input type="date"> renders blank for any other format.
      expect(result.vinculados[0].followUpData.data).toBe('2026-08-15');
      expect(result.vinculados[0].followUpData.detectado_agenda).toBe(true);
    });

    it('should infer channel from event name containing "whatsapp"', () => {
      const events = [createEventRow({ 'nome_evento': '[vortex-nn] Acompanhamento WhatsApp' })];
      const clients = [createExistingClient()];

      const result = service.matchEventsToClients(events, clients);
      expect(result.vinculados[0].followUpData.canal).toBe('whatsapp');
    });

    it('should infer channel from event name containing "email"', () => {
      const events = [createEventRow({ 'nome_evento': '[vortex-nn] Acompanhamento Email' })];
      const clients = [createExistingClient()];

      const result = service.matchEventsToClients(events, clients);
      expect(result.vinculados[0].followUpData.canal).toBe('email');
    });

    it('should set canal to null when no channel indicator in event name', () => {
      const events = [createEventRow({ 'nome_evento': '[vortex-nn] Acompanhamento' })];
      const clients = [createExistingClient()];

      const result = service.matchEventsToClients(events, clients);
      expect(result.vinculados[0].followUpData.canal).toBeNull();
    });

    it('should find next available slot for pre-filling', () => {
      // Slot 0 is already filled in our mock client
      const events = [createEventRow()];
      const clients = [createExistingClient()];

      const result = service.matchEventsToClients(events, clients);
      expect(result.vinculados[0].slotIndex).toBe(1); // slot 0 is taken
    });

    it('should handle null events or clients arrays', () => {
      expect(service.matchEventsToClients(null, null)).toEqual({
        vinculados: [], novos: [], ignorados: []
      });
      expect(service.matchEventsToClients([], null)).toEqual({
        vinculados: [], novos: [], ignorados: []
      });
    });

    it('should be case-insensitive when matching slugs', () => {
      const events = [createEventRow({ 'nome_evento': '[VORTEX-NN] Acompanhamento' })];
      const clients = [createExistingClient()];

      const result = service.matchEventsToClients(events, clients);
      expect(result.vinculados).toHaveLength(1);
    });

    it('should show correct summary counts', () => {
      const events = [
        createEventRow({ 'nome_evento': '[vortex-nn] Acompanhamento' }),
        createEventRow({ 'nome_evento': '[unknown] Acompanhamento' }),
        createEventRow({ 'nome_evento': 'No brackets here' }),
      ];
      const clients = [createExistingClient()];

      const result = service.matchEventsToClients(events, clients);
      expect(result.vinculados).toHaveLength(1);
      expect(result.novos).toHaveLength(1);
      expect(result.ignorados).toHaveLength(1);
    });
  });
});
