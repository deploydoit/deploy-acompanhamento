/**
 * import.js — Excel Import Module (SheetJS)
 * Handles import of Planilha_Projetos and Planilha_Eventos
 */

// Required columns for project import
const REQUIRED_PROJECT_COLUMNS = [
  'código', 'nome', 'cliente', 'email', 'telefone', 'líder',
  'cidade', 'UF', 'contrato', 'status_projeto', 'inicio_capacitacao', 'fim_capacitacao'
];

// Required columns for event import
const REQUIRED_EVENT_COLUMNS = ['data', 'nome_evento', 'dono'];

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

    // Check for missing columns using the first row's keys
    const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim());
    const missingColumns = REQUIRED_PROJECT_COLUMNS.filter(col =>
      !headers.includes(col.toLowerCase())
    );

    if (missingColumns.length > 0) {
      return { valid: [], invalid: [], missingColumns };
    }

    const valid = [];
    const invalid = [];

    rows.forEach((row, index) => {
      const lineNumber = index + 2; // +2 because row 1 is header, data starts at row 2
      const normalizedRow = this._normalizeRowKeys(row);

      // Check required fields - código and nome are mandatory for a valid row
      if (!normalizedRow['código'] && normalizedRow['código'] !== 0) {
        invalid.push({ line: lineNumber, reason: 'Campo "código" está vazio' });
        return;
      }
      if (!normalizedRow['nome']) {
        invalid.push({ line: lineNumber, reason: 'Campo "nome" está vazio' });
        return;
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

    // Check for missing columns using the first row's keys
    const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim());
    const missingColumns = REQUIRED_EVENT_COLUMNS.filter(col =>
      !headers.includes(col.toLowerCase())
    );

    if (missingColumns.length > 0) {
      return { valid: [], invalid: [], missingColumns };
    }

    const valid = [];
    const invalid = [];

    rows.forEach((row, index) => {
      const lineNumber = index + 2; // +2: row 1 is header
      const normalizedRow = this._normalizeRowKeys(row);

      // Validate required fields
      if (!normalizedRow['data']) {
        invalid.push({ line: lineNumber, reason: 'Campo "data" está vazio' });
        return;
      }
      if (!normalizedRow['nome_evento']) {
        invalid.push({ line: lineNumber, reason: 'Campo "nome_evento" está vazio' });
        return;
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
      const slug = this._extractSlugFromEventName(eventName);

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
   * Extract project slug from event name.
   * Event format: "[project_slug] Acompanhamento" or "[slug] ..."
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

    return {
      data: data,
      contato_realizado: 'nao',
      canal: canal,
      retorno: '',
      ocorreu: 'nao',
      detectado_agenda: true,
      dono: dono
    };
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
