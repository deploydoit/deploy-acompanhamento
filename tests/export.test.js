/**
 * Tests for ExportService (js/export.js)
 * Unit tests covering Excel export functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExportService } from '../js/export.js';

// Mock the global XLSX object (SheetJS loaded via CDN)
const mockXLSX = {
  utils: {
    json_to_sheet: vi.fn((data) => ({ data, '!ref': 'A1:Z' + data.length })),
    book_new: vi.fn(() => ({ Sheets: {}, SheetNames: [] })),
    book_append_sheet: vi.fn((wb, ws, name) => {
      wb.Sheets[name] = ws;
      wb.SheetNames.push(name);
    }),
  },
  write: vi.fn(() => new ArrayBuffer(100)),
};

// Attach XLSX to global scope (simulating CDN load)
globalThis.XLSX = mockXLSX;

/**
 * Creates a sample client object for testing.
 */
function createClient(overrides = {}) {
  return {
    id: 'client-1',
    nome: 'Empresa ABC [projeto-x]',
    cliente: 'Empresa ABC',
    lider: 'Bruno Hideo Toyama',
    status_projeto: 'Acompanhamento',
    telefone: '+55 (11) 99999-0000',
    email: 'contato@empresa.com',
    cidade: 'São Paulo',
    uf: 'SP',
    followUps: {
      0: { data: '2026-07-25', canal: 'whatsapp', ocorreu: 'sim', retorno: 'Tudo certo' },
      1: { data: '2026-08-24', canal: 'email', ocorreu: 'não', retorno: '' },
      2: {},
      3: {},
    },
    ...overrides,
  };
}

describe('ExportService', () => {
  let exportService;

  beforeEach(() => {
    exportService = new ExportService();
    vi.clearAllMocks();
  });

  describe('getFileName()', () => {
    it('should return file name in format acompanhamento_YYYY-MM-DD.xlsx', () => {
      const fileName = exportService.getFileName();
      const pattern = /^acompanhamento_\d{4}-\d{2}-\d{2}\.xlsx$/;
      expect(fileName).toMatch(pattern);
    });

    it('should use current date', () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');

      const fileName = exportService.getFileName();
      expect(fileName).toBe(`acompanhamento_${year}-${month}-${day}.xlsx`);
    });
  });

  describe('formatClientRow()', () => {
    it('should format a client into a flat row with all required columns', () => {
      const client = createClient();
      const row = exportService.formatClientRow(client);

      // Base columns
      expect(row['Nome']).toBe('Empresa ABC [projeto-x]');
      expect(row['Líder']).toBe('Bruno Hideo Toyama');
      expect(row['Fase']).toBe('Acompanhamento');
      expect(row['Telefone']).toBe('+55 (11) 99999-0000');
      expect(row['E-mail']).toBe('contato@empresa.com');
      expect(row['Cidade']).toBe('São Paulo');
      expect(row['Estado']).toBe('SP');
    });

    it('should include 4 follow-up slot columns', () => {
      const client = createClient();
      const row = exportService.formatClientRow(client);

      // Slot 1
      expect(row['Acomp. 1 - Data']).toBe('2026-07-25');
      expect(row['Acomp. 1 - Canal']).toBe('whatsapp');
      expect(row['Acomp. 1 - Ocorrência']).toBe('Sim');
      expect(row['Acomp. 1 - Retorno']).toBe('Tudo certo');

      // Slot 2
      expect(row['Acomp. 2 - Data']).toBe('2026-08-24');
      expect(row['Acomp. 2 - Canal']).toBe('email');
      expect(row['Acomp. 2 - Ocorrência']).toBe('Não');
      expect(row['Acomp. 2 - Retorno']).toBe('');

      // Slot 3 (empty)
      expect(row['Acomp. 3 - Data']).toBe('');
      expect(row['Acomp. 3 - Canal']).toBe('');
      expect(row['Acomp. 3 - Ocorrência']).toBe('');
      expect(row['Acomp. 3 - Retorno']).toBe('');

      // Slot 4 (empty)
      expect(row['Acomp. 4 - Data']).toBe('');
      expect(row['Acomp. 4 - Canal']).toBe('');
      expect(row['Acomp. 4 - Ocorrência']).toBe('');
      expect(row['Acomp. 4 - Retorno']).toBe('');
    });

    it('should handle client with no followUps gracefully', () => {
      const client = createClient({ followUps: undefined });
      const row = exportService.formatClientRow(client);

      expect(row['Nome']).toBe('Empresa ABC [projeto-x]');
      expect(row['Acomp. 1 - Data']).toBe('');
      expect(row['Acomp. 1 - Ocorrência']).toBe('');
    });

    it('should handle client with missing fields gracefully', () => {
      const client = { id: 'empty-client' };
      const row = exportService.formatClientRow(client);

      expect(row['Nome']).toBe('');
      expect(row['Líder']).toBe('');
      expect(row['Fase']).toBe('');
      expect(row['Telefone']).toBe('');
      expect(row['E-mail']).toBe('');
      expect(row['Cidade']).toBe('');
      expect(row['Estado']).toBe('');
    });

    it('should have exactly 23 columns (7 base + 4 slots × 4 fields)', () => {
      const client = createClient();
      const row = exportService.formatClientRow(client);
      expect(Object.keys(row).length).toBe(23);
    });
  });

  describe('generateExcel()', () => {
    it('should return null when no clients match filters', () => {
      const clients = [
        createClient({ lider: 'Bruno Hideo Toyama' }),
      ];
      const filters = { leader: 'Isabela Soares' };

      const result = exportService.generateExcel(clients, filters);
      expect(result).toBeNull();
    });

    it('should return null for empty client array', () => {
      const result = exportService.generateExcel([], {});
      expect(result).toBeNull();
    });

    it('should return null for null/undefined clients', () => {
      const result = exportService.generateExcel(null, {});
      expect(result).toBeNull();
    });

    it('should generate Uint8Array when clients match filters', () => {
      const clients = [createClient()];
      const filters = {}; // No filters = all clients

      const result = exportService.generateExcel(clients, filters);
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it('should call XLSX.utils.json_to_sheet with formatted rows', () => {
      const clients = [createClient(), createClient({ nome: 'Empresa XYZ' })];
      const filters = {};

      exportService.generateExcel(clients, filters);

      expect(mockXLSX.utils.json_to_sheet).toHaveBeenCalledOnce();
      const rows = mockXLSX.utils.json_to_sheet.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows[0]['Nome']).toBe('Empresa ABC [projeto-x]');
      expect(rows[1]['Nome']).toBe('Empresa XYZ');
    });

    it('should create workbook with sheet named Acompanhamento', () => {
      const clients = [createClient()];

      exportService.generateExcel(clients, {});

      expect(mockXLSX.utils.book_append_sheet).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        'Acompanhamento'
      );
    });

    it('should respect active filters and export only matching clients', () => {
      const clients = [
        createClient({ lider: 'Bruno Hideo Toyama', nome: 'Bruno Client' }),
        createClient({ lider: 'Isabela Soares', nome: 'Isa Client' }),
        createClient({ lider: 'Bruno Hideo Toyama', nome: 'Bruno Client 2' }),
      ];
      const filters = { leader: 'Bruno Hideo Toyama' };

      exportService.generateExcel(clients, filters);

      const rows = mockXLSX.utils.json_to_sheet.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows.every(r => r['Líder'] === 'Bruno Hideo Toyama')).toBe(true);
    });

    it('should throw error with descriptive message when XLSX fails', () => {
      mockXLSX.utils.json_to_sheet.mockImplementationOnce(() => {
        throw new Error('Sheet generation failed');
      });

      const clients = [createClient()];

      expect(() => exportService.generateExcel(clients, {})).toThrow(
        'Falha ao gerar arquivo Excel: Sheet generation failed'
      );
    });

    it('should throw error when XLSX.write fails', () => {
      mockXLSX.write.mockImplementationOnce(() => {
        throw new Error('Write failed');
      });

      const clients = [createClient()];

      expect(() => exportService.generateExcel(clients, {})).toThrow(
        'Falha ao gerar arquivo Excel: Write failed'
      );
    });
  });
});
