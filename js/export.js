/**
 * export.js — Excel Export Module (SheetJS)
 * Generates .xlsx files with filtered client data
 */

import { FilterEngine } from './filters.js';

export class ExportService {
  constructor() {
    this._filterEngine = new FilterEngine();
  }

  /**
   * Generates an Excel workbook buffer from filtered client data.
   * @param {Array} clients - Array of all client objects
   * @param {object} filters - Active filters to apply before export
   * @returns {Uint8Array|null} The .xlsx file as a Uint8Array, or null if no data to export
   * @throws {Error} If SheetJS (XLSX) fails during generation
   */
  generateExcel(clients, filters) {
    // Apply filters to get only visible clients
    const filteredClients = this._filterEngine.applyFilters(clients, filters);

    // If no clients match, return null (caller shows "Não há dados para exportar")
    if (!filteredClients || filteredClients.length === 0) {
      return null;
    }

    try {
      // Format all client rows
      const rows = filteredClients.map(client => this.formatClientRow(client));

      // Create worksheet from rows
      const worksheet = XLSX.utils.json_to_sheet(rows);

      // Create workbook and append worksheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Acompanhamento');

      // Generate .xlsx binary
      const xlsxData = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

      return new Uint8Array(xlsxData);
    } catch (error) {
      throw new Error(`Falha ao gerar arquivo Excel: ${error.message}`);
    }
  }

  /**
   * Returns the export file name with current date in YYYY-MM-DD format.
   * @returns {string} File name in format "acompanhamento_YYYY-MM-DD.xlsx"
   */
  getFileName() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `acompanhamento_${year}-${month}-${day}.xlsx`;
  }

  /**
   * Formats a single client object into a flat row for Excel export.
   * Columns: nome, líder, fase, telefone, e-mail, cidade, estado,
   * and for each of 4 slots: data, canal, ocorrência (sim/não), retorno
   * @param {object} client - Client object with followUps
   * @returns {object} Flat row object with all columns
   */
  formatClientRow(client) {
    const row = {
      'Nome': client.nome || '',
      'Líder': client.lider || '',
      'Fase': client.status_projeto || '',
      'Telefone': client.telefone || '',
      'E-mail': client.email || '',
      'Cidade': client.cidade || '',
      'Estado': client.uf || '',
    };

    const followUps = client.followUps || {};

    for (let i = 0; i < 4; i++) {
      const slot = followUps[i] || {};
      const slotNum = i + 1;

      row[`Acomp. ${slotNum} - Data`] = slot.data || '';
      row[`Acomp. ${slotNum} - Canal`] = slot.canal || '';
      row[`Acomp. ${slotNum} - Ocorrência`] = slot.ocorreu === 'sim' ? 'Sim' : slot.ocorreu === 'não' ? 'Não' : '';
      row[`Acomp. ${slotNum} - Retorno`] = slot.retorno || '';
    }

    return row;
  }
}
