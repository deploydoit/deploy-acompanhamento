/**
 * import.js — Excel Import Module (SheetJS)
 * Handles import of Planilha_Projetos and Planilha_Eventos
 */

// Required columns for project import (mapped from DOit spreadsheet)
// The spreadsheet uses different column names than our internal format.
// We map them flexibly using COLUMN_ALIASES below.
// "data realizado" is OPTIONAL — if absent, fim_capacitacao = inicio_capacitacao + 5 days
const REQUIRED_PROJECT_COLUMNS = [
  'cód', 'nome', 'cliente', 'e-mail do cliente', 'telefone do cliente', 'líder',
  'cidade', 'uf', 'contrato', 'status', 'início capacitação'
];

// Maps spreadsheet column names (lowercase) → internal field names
const COLUMN_ALIASES = {
  'cód': 'código',
  'cod': 'código',
  'código': 'código',
  'nome': 'nome',
  'cliente': 'cliente',
  'e-mail do cliente': 'email',
  'email do cliente': 'email',
  'email': 'email',
  'telefone do cliente': 'telefone',
  'telefone': 'telefone',
  'líder': 'líder',
  'lider': 'líder',
  'cidade': 'cidade',
  'uf': 'uf',
  'contrato': 'contrato',
  'status': 'status_projeto',
  'status_projeto': 'status_projeto',
  'início capacitação': 'inicio_capacitacao',
  'inicio capacitação': 'inicio_capacitacao',
  'inicio_capacitacao': 'inicio_capacitacao',
  'data realizado': 'fim_capacitacao',
  'fim_capacitacao': 'fim_capacitacao',
  'fim capacitação': 'fim_capacitacao',
  'app (url)': 'app_url',
  'modalidade': 'modalidade',
};

// Required columns for event import
// Only require "De" (date) + "Nome" (event name). "Dono" is optional.
// The DOit agenda export uses: De, Hora, Até, Hora, Agendas, Nome, Dono, Descrição, Contatos, Projeto, Etapa 1...
const REQUIRED_EVENT_COLUMNS = ['data', 'nome_evento'];

// Maps spreadsheet event column names (lowercase) → internal field names
// Supports: DOit Agenda export, Google Calendar export, Outlook export, and custom formats
const EVENT_COLUMN_ALIASES = {
  // Data (date) - "De" is the DOit agenda export column
  'de': 'data',
  'data': 'data',
  'date': 'data',
  'data do evento': 'data',
  'data evento': 'data',
  'start date': 'data',
  'data de início': 'data',
  'data início': 'data',
  'data inicio': 'data',
  'início': 'data',
  'inicio': 'data',
  // Nome do evento (event name/subject) - "Nome" is the DOit agenda export column
  'nome': 'nome_evento',
  'nome_evento': 'nome_evento',
  'nome evento': 'nome_evento',
  'nome do evento': 'nome_evento',
  'evento': 'nome_evento',
  'title': 'nome_evento',
  'título': 'nome_evento',
  'titulo': 'nome_evento',
  'assunto': 'nome_evento',
  'summary': 'nome_evento',
  'subject': 'nome_evento',
  // Dono (owner/organizer) - "Dono" is the DOit agenda export column
  'dono': 'dono',
  'responsável': 'dono',
  'responsavel': 'dono',
  'owner': 'dono',
  'organizador': 'dono',
  'organizer': 'dono',
  'criado por': 'dono',
  'created by': 'dono',
  // Extra fields from DOit agenda export (optional, preserved if present)
  'descrição': 'descricao',
  'descricao': 'descricao',
  'description': 'descricao',
  'contatos': 'contatos',
  'projeto': 'projeto',
  'agendas': 'agendas',
  'até': 'data_fim',
  'end date': 'data_fim',
  'data fim': 'data_fim',
  'data de término': 'data_fim',
  'hora': 'hora_inicio',
  'hora_1': 'hora_fim',
  'start time': 'hora_inicio',
  'horário': 'hora_inicio',
  'location': 'local',
  'local': 'local',
  'etapa 1': 'etapa1',
  'etapa 1.1': 'etapa1_1',
  'etapa 1.1.1': 'etapa1_1_1',
};

export class ImportService {

  // ─── Projects ───────────────────────────────────────────────────────────────

  /**
   * Parse a .xlsx file containing project data using SheetJS.
   * @param {File} file - The uploaded file object
   * @returns {Promise<{success: boolean, rows: object[], errors: {line: number, message: string}[], fileName: string}>}
   */
  async parseProjectsFile(file) {
    // Validate file extension
    if (!file || !file.name) {
      return { success: false, rows: [], errors: [{ line: 0, message: 'Nenhum arquivo fornecido' }], fileName: '' };
    }

    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'xlsx') {
      return {
        success: false,
        rows: [],
        errors: [{ line: 0, message: `Formato inválido: .${ext}. Apenas arquivos .xlsx são aceitos.` }],
        fileName: file.name
      };
    }

    try {
      const data = await this._readFileAsArrayBuffer(file);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '' });

      return { success: true, rows, errors: [], fileName: file.name };
    } catch (err) {
      return {
        success: false,
        rows: [],
        errors: [{ line: 0, message: `Erro ao processar arquivo: ${err.message}` }],
        fileName: file.name
      };
    }
  }

  /**
   * Validate that parsed rows contain all required columns and valid data.
   * @param {object[]} rows - Parsed rows from SheetJS
   * @returns {{valid: object[], invalid: {line: number, reason: string}[], missingColumns: string[]}}
   */
  validateProjectsData(rows) {
    if (!rows || rows.length === 0) {
      return { valid: [], invalid: [], missingColumns: [] };
    }

    // Check for missing columns using flexible alias matching
    const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim());
    const missingColumns = REQUIRED_PROJECT_COLUMNS.filter(col => {
      const colLower = col.toLowerCase();
      // Direct match
      if (headers.includes(colLower)) return false;
      // Check if any header maps to the same internal name as this required column
      const requiredInternal = COLUMN_ALIASES[colLower] || colLower;
      return !headers.some(h => (COLUMN_ALIASES[h] || h) === requiredInternal);
    });

    if (missingColumns.length > 0) {
      return { valid: [], invalid: [], missingColumns };
    }

    const valid = [];
    const invalid = [];

    rows.forEach((row, index) => {
      const lineNumber = index + 2; // +2 because row 1 is header, data starts at row 2
      const normalizedRow = this._mapRowToInternal(row);

      // Check required fields - código and nome are mandatory for a valid row
      if (!normalizedRow['código'] && normalizedRow['código'] !== 0) {
        invalid.push({ line: lineNumber, reason: 'Campo "Cód" está vazio' });
        return;
      }
      if (!normalizedRow['nome']) {
        invalid.push({ line: lineNumber, reason: 'Campo "Nome" está vazio' });
        return;
      }

      // Only import clients with status "Acompanhamento" or "Produção"
      const status = (normalizedRow['status_projeto'] || '').toLowerCase().trim();
      if (status !== 'acompanhamento' && status !== 'produção' && status !== 'producao' && status !== 'producao') {
        return; // Skip silently — not an error, just not relevant
      }

      valid.push(normalizedRow);
    });

    return { valid, invalid, missingColumns: [] };
  }

  /**
   * Merge imported project data with existing client data.
   * Adds new clients, updates existing metadata, preserves followUps.
   * @param {object[]} existing - Existing clients array
   * @param {object[]} imported - Validated imported rows
   * @returns {{added: object[], updated: object[], unchanged: object[]}}
   */
  mergeProjects(existing, imported) {
    const existingMap = new Map();
    (existing || []).forEach(client => {
      const codigo = this._extractCodigo(client);
      if (codigo !== null) {
        existingMap.set(String(codigo), client);
      }
    });

    const added = [];
    const updated = [];
    const unchanged = [];

    imported.forEach(row => {
      const codigo = String(row['código']);
      const existingClient = existingMap.get(codigo);

      if (!existingClient) {
        // New client - add it
        const newClient = this._rowToClient(row);
        added.push(newClient);
      } else {
        // Existing client - check if metadata changed
        const updatedClient = this._updateClientMetadata(existingClient, row);
        if (updatedClient._changed) {
          delete updatedClient._changed;
          updated.push(updatedClient);
        } else {
          delete updatedClient._changed;
          unchanged.push(updatedClient);
        }
      }
    });

    return { added, updated, unchanged };
  }

  /**
   * Generate a summary of the import operation.
   * @param {{added: object[], updated: object[], unchanged: object[], errors?: {line: number, reason: string}[]}} result
   * @returns {{added: number, updated: number, unchanged: number, errors: {line: number, reason: string}[]}}
   */
  generateImportSummary(result) {
    return {
      added: (result.added || []).length,
      updated: (result.updated || []).length,
      unchanged: (result.unchanged || []).length,
      errors: result.errors || []
    };
  }

  // ─── Events ─────────────────────────────────────────────────────────────────

  /**
   * Parse a .xlsx file containing event data using SheetJS.
   * @param {File} file - The uploaded file object
   * @returns {Promise<{success: boolean, rows: object[], errors: {line: number, message: string}[], fileName: string}>}
   */
  async parseEventsFile(file) {
    // Validate file extension
    if (!file || !file.name) {
      return { success: false, rows: [], errors: [{ line: 0, message: 'Nenhum arquivo fornecido' }], fileName: '' };
    }

    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'xlsx') {
      return {
        success: false,
        rows: [],
        errors: [{ line: 0, message: `Formato inválido: .${ext}. Apenas arquivos .xlsx são aceitos.` }],
        fileName: file.name
      };
    }

    try {
      const data = await this._readFileAsArrayBuffer(file);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '' });

      return { success: true, rows, errors: [], fileName: file.name };
    } catch (err) {
      return {
        success: false,
        rows: [],
        errors: [{ line: 0, message: `Erro ao processar arquivo: ${err.message}` }],
        fileName: file.name
      };
    }
  }

  /**
   * Validate that parsed event rows contain all required columns and valid data.
   * @param {object[]} rows - Parsed rows from SheetJS
   * @returns {{valid: object[], invalid: {line: number, reason: string}[], missingColumns: string[]}}
   */
  validateEventsData(rows) {
    if (!rows || rows.length === 0) {
      return { valid: [], invalid: [], missingColumns: [] };
    }

    // Check for missing columns using flexible alias matching
    const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim());
    const missingColumns = REQUIRED_EVENT_COLUMNS.filter(col => {
      const colLower = col.toLowerCase();
      // Direct match
      if (headers.includes(colLower)) return false;
      // Check if any header maps to the same internal name
      const requiredInternal = EVENT_COLUMN_ALIASES[colLower] || colLower;
      return !headers.some(h => (EVENT_COLUMN_ALIASES[h] || h) === requiredInternal);
    });

    if (missingColumns.length > 0) {
      return { valid: [], invalid: [], missingColumns };
    }

    const valid = [];
    const invalid = [];

    rows.forEach((row, index) => {
      const lineNumber = index + 2; // +2: row 1 is header
      const normalizedRow = this._mapEventRowToInternal(row);

      // Validate required fields
      if (!normalizedRow['data']) {
        invalid.push({ line: lineNumber, reason: 'Campo "data" está vazio' });
        return;
      }
      if (!normalizedRow['nome_evento']) {
        invalid.push({ line: lineNumber, reason: 'Campo "nome_evento" está vazio' });
        return;
      }

      // Default "dono" to empty if not present
      if (!normalizedRow['dono']) {
        normalizedRow['dono'] = '';
      }

      // Normalize date format if it's a Google Calendar style date (MM/DD/YYYY → DD/MM/YYYY)
      if (normalizedRow['data']) {
        normalizedRow['data'] = this._normalizeDateFormat(normalizedRow['data']);
      }

      valid.push(normalizedRow);
    });

    return { valid, invalid, missingColumns: [] };
  }

  /**
   * Match imported events to existing clients by project slug pattern in event name.
   * Event name format: "[project_slug] Acompanhamento" or similar.
   * Client ID format: "slug_codigo" (e.g., "vortex-nn_1939.0").
   * @param {object[]} events - Validated event rows
   * @param {object[]} clients - Existing clients
   * @returns {{vinculados: object[], novos: object[], ignorados: object[]}}
   */
  matchEventsToClients(events, clients) {
    const vinculados = [];
    const novos = [];
    const ignorados = [];

    // Build a map of slug → client for matching
    const slugToClient = new Map();
    (clients || []).forEach(client => {
      const slug = this._extractSlug(client);
      if (slug) {
        slugToClient.set(slug.toLowerCase(), client);
      }
    });

    (events || []).forEach(event => {
      const eventName = event['nome_evento'] || '';
      const projeto = event['projeto'] || '';
      // Try extracting slug from event name first, then from projeto field
      let slug = this._extractSlugFromEventName(eventName);
      if (!slug && projeto) {
        slug = this._extractSlugFromEventName(projeto);
      }

      if (!slug) {
        ignorados.push(event);
        return;
      }

      const matchedClient = slugToClient.get(slug.toLowerCase());
      if (!matchedClient) {
        novos.push(event);
        return;
      }

      // Pre-fill a follow-up slot with event data
      const eventData = this._eventToFollowUpData(event);
      const slotIndex = this._findNextAvailableSlot(matchedClient);

      vinculados.push({
        event,
        client: matchedClient,
        slotIndex,
        followUpData: eventData
      });
    });

    return { vinculados, novos, ignorados };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Normalize date format. Handles MM/DD/YYYY (US) → DD/MM/YYYY (BR) conversion
   * and also passes through DD/MM/YYYY as-is.
   * The DOit export uses M/D/YY or M/D/YYYY format (US style).
   * @param {string|number} dateValue
   * @returns {string} Date in DD/MM/YYYY format
   */
  _normalizeDateFormat(dateValue) {
    if (!dateValue) return '';
    if (typeof dateValue === 'number') {
      // Excel serial date
      const date = new Date((dateValue - 25569) * 86400 * 1000);
      if (isNaN(date.getTime())) return '';
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = date.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
    const str = String(dateValue).trim();
    // The DOit agenda export uses M/D/YY or M/D/YYYY (US format)
    const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slashMatch) {
      let [, part1, part2, yearPart] = slashMatch;
      let year = Number(yearPart);
      if (year < 100) year += 2000; // 26 → 2026
      // Determine if it's MM/DD/YYYY (US) or DD/MM/YYYY (BR)
      // Heuristic: if part1 > 12, it must be DD/MM/YYYY (day first)
      // If part2 > 12, it must be MM/DD/YYYY (month first → US)
      // Otherwise assume US format (M/D/YYYY) since DOit exports in US format
      const p1 = Number(part1);
      const p2 = Number(part2);
      if (p1 > 12) {
        // Already DD/MM/YYYY
        return `${String(p1).padStart(2, '0')}/${String(p2).padStart(2, '0')}/${year}`;
      } else if (p2 > 12) {
        // MM/DD/YYYY → convert to DD/MM/YYYY
        return `${String(p2).padStart(2, '0')}/${String(p1).padStart(2, '0')}/${year}`;
      } else {
        // Ambiguous — assume US format (MM/DD/YYYY) since the DOit export uses it
        return `${String(p2).padStart(2, '0')}/${String(p1).padStart(2, '0')}/${year}`;
      }
    }
    // Try ISO format
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    }
    return str;
  }

  /**
   * Read a File as ArrayBuffer (works in browser).
   * @param {File} file
   * @returns {Promise<ArrayBuffer>}
   */
  _readFileAsArrayBuffer(file) {
    // Support passing ArrayBuffer directly (for testing)
    if (file.arrayBuffer && typeof file.arrayBuffer === 'function') {
      return file.arrayBuffer();
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Erro ao ler arquivo'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Normalize row keys to lowercase for consistent access.
   * @param {object} row
   * @returns {object}
   */
  _normalizeRowKeys(row) {
    const normalized = {};
    Object.entries(row).forEach(([key, value]) => {
      normalized[key.toLowerCase().trim()] = value;
    });
    return normalized;
  }

  /**
   * Map an event spreadsheet row to internal field names using EVENT_COLUMN_ALIASES.
   * @param {object} row - Raw row from SheetJS
   * @returns {object} Row with internal field names
   */
  _mapEventRowToInternal(row) {
    const mapped = {};
    Object.entries(row).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase().trim();
      const internalName = EVENT_COLUMN_ALIASES[lowerKey] || lowerKey;
      mapped[internalName] = value;
    });
    return mapped;
  }

  /**
   * Map a spreadsheet row to internal field names using COLUMN_ALIASES.
   * This handles the DOit spreadsheet column names like "Cód", "E-mail do Cliente", etc.
   * If fim_capacitacao is missing, calculates it as inicio_capacitacao + 5 days.
   * @param {object} row - Raw row from SheetJS
   * @returns {object} Row with internal field names
   */
  _mapRowToInternal(row) {
    const mapped = {};
    Object.entries(row).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase().trim();
      const internalName = COLUMN_ALIASES[lowerKey] || lowerKey;
      mapped[internalName] = value;
    });

    // Normalize date fields to DD/MM/YYYY
    if (mapped['inicio_capacitacao']) {
      mapped['inicio_capacitacao'] = this._normalizeDateFormat(mapped['inicio_capacitacao']);
    }
    if (mapped['fim_capacitacao']) {
      mapped['fim_capacitacao'] = this._normalizeDateFormat(mapped['fim_capacitacao']);
    }

    // If fim_capacitacao is empty/absent, calculate as inicio_capacitacao + 5 days
    if (!mapped['fim_capacitacao'] && mapped['inicio_capacitacao']) {
      mapped['fim_capacitacao'] = this._addDays(mapped['inicio_capacitacao'], 5);
    }

    return mapped;
  }

  /**
   * Add days to a date string. Supports formats: DD/MM/YYYY, YYYY-MM-DD, or Excel serial number.
   * @param {string|number} dateValue - The date to add days to
   * @param {number} days - Number of days to add
   * @returns {string} Resulting date in DD/MM/YYYY format, or empty string if invalid
   */
  _addDays(dateValue, days) {
    if (!dateValue) return '';
    let date;

    if (typeof dateValue === 'number') {
      // Excel serial date number (days since 1900-01-01, with Excel's 1900 leap year bug)
      date = new Date((dateValue - 25569) * 86400 * 1000);
    } else {
      const str = String(dateValue).trim();
      // Try DD/MM/YYYY
      const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (brMatch) {
        date = new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
      } else {
        // Try ISO or other parseable format
        date = new Date(str);
      }
    }

    if (!date || isNaN(date.getTime())) return '';

    date.setDate(date.getDate() + days);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  /**
   * Extract the código (numeric) from a client object.
   * @param {object} client
   * @returns {string|null}
   */
  _extractCodigo(client) {
    if (client.codigo !== undefined && client.codigo !== null) {
      return String(client.codigo);
    }
    // Try to extract from ID (format: "slug_codigo")
    if (client.id) {
      const parts = client.id.split('_');
      if (parts.length >= 2) {
        return parts[parts.length - 1];
      }
    }
    return null;
  }

  /**
   * Extract the project slug from a client object.
   * The slug is either in the ID ("slug_codigo") or in the nome ("[slug]").
   * @param {object} client
   * @returns {string|null}
   */
  _extractSlug(client) {
    // Try extracting from nome field: "Company Name [slug]"
    if (client.nome) {
      const match = client.nome.match(/\[([^\]]+)\]/);
      if (match) return match[1];
    }
    // Try extracting from ID: "slug_codigo"
    if (client.id) {
      const parts = client.id.split('_');
      if (parts.length >= 2) {
        return parts.slice(0, -1).join('_');
      }
    }
    return null;
  }

  /**
   * Extract project slug from event name or project field.
   * DOit agenda format: "[project_slug] Acompanhamento" or Nome: "[slug] ..."
   * Also checks the 'projeto' field which contains "Company Name [slug]"
   * @param {string} eventName
   * @returns {string|null}
   */
  _extractSlugFromEventName(eventName) {
    if (!eventName) return null;
    const match = eventName.match(/\[([^\]]+)\]/);
    return match ? match[1] : null;
  }

  /**
   * Convert an imported row to a client object.
   * @param {object} row - Normalized row from spreadsheet
   * @returns {object}
   */
  _rowToClient(row) {
    const codigo = row['código'];
    const nome = row['nome'] || '';
    const slug = this._extractSlugFromNome(nome);
    const id = slug ? `${slug}_${codigo}` : `project_${codigo}`;

    return {
      id,
      codigo: Number(codigo) || codigo,
      nome: nome,
      cliente: row['cliente'] || '',
      email: row['email'] || '',
      telefone: row['telefone'] || '',
      lider: row['líder'] || '',
      cidade: row['cidade'] || '',
      uf: row['uf'] || '',
      contrato: row['contrato'] || '',
      status_projeto: row['status_projeto'] || '',
      inicio_capacitacao: row['inicio_capacitacao'] || '',
      fim_capacitacao: row['fim_capacitacao'] || '',
      followUps: {
        0: { ocorreu: 'nao' },
        1: { ocorreu: 'nao' },
        2: { ocorreu: 'nao' },
        3: { ocorreu: 'nao' }
      },
      acompanhamentos_agenda: []
    };
  }

  /**
   * Extract slug from a nome field that contains "[slug]".
   * @param {string} nome
   * @returns {string|null}
   */
  _extractSlugFromNome(nome) {
    if (!nome) return null;
    const match = nome.match(/\[([^\]]+)\]/);
    return match ? match[1] : null;
  }

  /**
   * Update existing client metadata from imported row without touching followUps.
   * @param {object} existingClient
   * @param {object} row - Normalized imported row
   * @returns {object} Updated client with _changed flag
   */
  _updateClientMetadata(existingClient, row) {
    const updatedClient = { ...existingClient };
    let changed = false;

    const metadataFields = [
      { src: 'nome', dst: 'nome' },
      { src: 'cliente', dst: 'cliente' },
      { src: 'email', dst: 'email' },
      { src: 'telefone', dst: 'telefone' },
      { src: 'líder', dst: 'lider' },
      { src: 'cidade', dst: 'cidade' },
      { src: 'uf', dst: 'uf' },
      { src: 'contrato', dst: 'contrato' },
      { src: 'status_projeto', dst: 'status_projeto' },
      { src: 'inicio_capacitacao', dst: 'inicio_capacitacao' },
      { src: 'fim_capacitacao', dst: 'fim_capacitacao' }
    ];

    metadataFields.forEach(({ src, dst }) => {
      const newValue = row[src];
      if (newValue !== undefined && newValue !== '' && String(newValue) !== String(existingClient[dst] || '')) {
        updatedClient[dst] = newValue;
        changed = true;
      }
    });

    // NEVER overwrite followUps
    updatedClient.followUps = existingClient.followUps;
    updatedClient._changed = changed;

    return updatedClient;
  }

  /**
   * Convert an event row to follow-up data for pre-filling.
   * @param {object} event - Normalized event row
   * @returns {object}
   */
  _eventToFollowUpData(event) {
    const data = event['data'] || '';
    const dono = event['dono'] || '';
    const eventName = event['nome_evento'] || '';

    // Infer channel from event name or default to null
    const canal = this._inferChannel(eventName);

    // Check if event date is in the past → mark as already done
    const isPast = this._isDateInPast(data);

    return {
      data: data,
      contato_realizado: isPast ? 'sim' : 'nao',
      canal: canal,
      retorno: '',
      ocorreu: isPast ? 'sim' : 'nao',
      detectado_agenda: true,
      dono: dono
    };
  }

  /**
   * Check if a date string (DD/MM/YYYY) is in the past (before today).
   * @param {string} dateStr - Date in DD/MM/YYYY format
   * @returns {boolean}
   */
  _isDateInPast(dateStr) {
    if (!dateStr) return false;
    const str = String(dateStr).trim();
    const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return false;
    const eventDate = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return eventDate <= today;
  }

  /**
   * Infer channel from event name or metadata.
   * @param {string} eventName
   * @returns {string|null}
   */
  _inferChannel(eventName) {
    const lower = (eventName || '').toLowerCase();
    if (lower.includes('whatsapp')) return 'whatsapp';
    if (lower.includes('email') || lower.includes('e-mail')) return 'email';
    if (lower.includes('intercom')) return 'intercom';
    return null;
  }

  /**
   * Find the next available (empty) follow-up slot for a client.
   * @param {object} client
   * @returns {number} Slot index (0-3), or -1 if all filled
   */
  _findNextAvailableSlot(client) {
    const followUps = client.followUps || {};
    for (let i = 0; i < 4; i++) {
      const slot = followUps[i];
      if (!slot || (!slot.data && slot.ocorreu !== 'sim' && !slot.detectado_agenda)) {
        return i;
      }
    }
    return -1;
  }
}
