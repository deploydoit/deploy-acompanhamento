/**
 * views/dashboard.js — Dashboard View
 * Renders summary cards with metrics in the #dashboard-area element
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

/**
 * Count follow-ups where ocorreu === 'sim' for a client.
 * @param {object} client
 * @returns {number}
 */
function countOcorreu(client) {
  const followUps = client.followUps || {};
  let count = 0;
  for (let i = 0; i < 4; i++) {
    if (followUps[i] && followUps[i].ocorreu === 'sim') {
      count++;
    }
  }
  return count;
}

/**
 * Check if a client has any contato_realizado='sim' across all slots.
 * @param {object} client
 * @returns {boolean}
 */
function hasAnyContato(client) {
  const followUps = client.followUps || {};
  for (let i = 0; i < 4; i++) {
    if (followUps[i] && followUps[i].contato_realizado === 'sim') {
      return true;
    }
  }
  return false;
}

/**
 * Check if a client is "não iniciado": 0 ocorridos AND 0 contatos realizados.
 * @param {object} client
 * @returns {boolean}
 */
function isNaoIniciado(client) {
  return countOcorreu(client) === 0 && !hasAnyContato(client);
}

/**
 * Check if a client is "em andamento": at least 1 contato or acompanhamento, but < 4 ocorridos.
 * @param {object} client
 * @returns {boolean}
 */
function isEmAndamento(client) {
  const ocorridos = countOcorreu(client);
  if (ocorridos >= 4) return false;
  // At least 1 contato or at least 1 ocorreu
  return hasAnyContato(client) || ocorridos > 0;
}

/**
 * Check if a client is "completo": 4 acompanhamentos with ocorreu = sim.
 * @param {object} client
 * @returns {boolean}
 */
function isCompleto(client) {
  return countOcorreu(client) === 4;
}

/**
 * Count overdue follow-ups across all clients.
 * Atrasado: data_prevista < today AND ocorreu !== 'sim'
 * @param {Array} clients
 * @returns {number}
 */
function countAtrasados(clients) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let count = 0;

  for (const client of clients) {
    const datas = client.datas_previstas || [];
    const followUps = client.followUps || {};

    for (let i = 0; i < datas.length; i++) {
      const dataPrevista = new Date(datas[i] + 'T00:00:00');
      if (isNaN(dataPrevista.getTime())) continue;

      const slot = followUps[i];
      const ocorreu = slot && slot.ocorreu === 'sim';

      if (dataPrevista < today && !ocorreu) {
        count++;
      }
    }
  }

  return count;
}

/**
 * Calculate distribution of clients per leader.
 * @param {Array} clients
 * @returns {Array<{nome: string, count: number}>}
 */
function getDistribuicaoLider(clients) {
  const map = {};
  for (const client of clients) {
    // Only count clients with status Acompanhamento or Produção
    const status = (client.status_projeto || '').toLowerCase().trim();
    if (status !== 'acompanhamento' && status !== 'produção' && status !== 'producao') continue;
    const lider = client.lider || 'Sem líder';
    map[lider] = (map[lider] || 0) + 1;
  }
  return Object.entries(map)
    .map(([nome, count]) => ({ nome, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Calculate all dashboard metrics from client data.
 * @param {Array} clients
 * @returns {object} metrics
 */
export function calculateMetrics(clients) {
  if (!clients || !Array.isArray(clients)) {
    return {
      total: 0,
      naoIniciados: 0,
      emAndamento: 0,
      completos: 0,
      realizados: 0,
      totalSlots: 0,
      atrasados: 0,
      progressRatio: 0,
      distribuicaoLider: []
    };
  }

  // Exclude clients marked as "não entrar em contato"
  const activeClients = clients.filter(c => !c.nao_entrar_em_contato);

  const total = activeClients.length;
  const totalSlots = total * 4;
  let naoIniciados = 0;
  let emAndamento = 0;
  let completos = 0;
  let realizados = 0;

  for (const client of activeClients) {
    realizados += countOcorreu(client);

    if (isCompleto(client)) {
      completos++;
    } else if (isNaoIniciado(client)) {
      naoIniciados++;
    } else if (isEmAndamento(client)) {
      emAndamento++;
    } else {
      naoIniciados++;
    }
  }

  const progressRatio = totalSlots > 0 ? realizados / totalSlots : 0;
  const atrasados = countAtrasados(activeClients);
  const distribuicaoLider = getDistribuicaoLider(activeClients);

  return {
    total,
    naoIniciados,
    emAndamento,
    completos,
    realizados,
    totalSlots,
    atrasados,
    progressRatio,
    distribuicaoLider
  };
}

export class DashboardView {
  /**
   * @param {HTMLElement} container - The #dashboard-area element
   * @param {import('../state.js').StateManager} stateManager
   */
  constructor(container, stateManager) {
    this.container = container;
    this.stateManager = stateManager;
    this._unsubscribe = null;
  }

  /**
   * Render the dashboard cards with the provided client data.
   * Recalculates all metrics from the client list.
   * @param {Array} data - Array of client objects
   */
  render(data) {
    const metrics = calculateMetrics(data);
    const progressPercent = Math.round(metrics.progressRatio * 100);

    this.container.innerHTML = `
      <div class="dashboard">
        <div class="dashboard__cards">
          <div class="dashboard__card card">
            <span class="dashboard__card-label">Total Clientes</span>
            <span class="dashboard__card-value">${metrics.total}</span>
          </div>
          <div class="dashboard__card card">
            <span class="dashboard__card-label">Não Iniciados</span>
            <span class="dashboard__card-value">${metrics.naoIniciados}</span>
          </div>
          <div class="dashboard__card card">
            <span class="dashboard__card-label">Em Andamento</span>
            <span class="dashboard__card-value">${metrics.emAndamento}</span>
          </div>
          <div class="dashboard__card card">
            <span class="dashboard__card-label">Completos</span>
            <span class="dashboard__card-value">${metrics.completos}</span>
          </div>
          <div class="dashboard__card card">
            <span class="dashboard__card-label">Realizados</span>
            <span class="dashboard__card-value">${metrics.realizados}/${metrics.totalSlots}</span>
          </div>
        </div>

        <div class="dashboard__bottom">
          <div class="dashboard__card dashboard__card--wide card">
            <span class="dashboard__card-label">Progresso Geral</span>
            <div class="dashboard__progress">
              <div class="dashboard__progress-bar">
                <div class="dashboard__progress-fill" style="width: ${progressPercent}%"></div>
              </div>
              <span class="dashboard__progress-value">${progressPercent}%</span>
            </div>
          </div>

          <div class="dashboard__card card">
            <span class="dashboard__card-label dashboard__card-label--bad">Atrasados</span>
            <span class="dashboard__card-value dashboard__card-value--bad">${metrics.atrasados}</span>
          </div>

          <div class="dashboard__card dashboard__card--wide card">
            <span class="dashboard__card-label">Distribuição por Líder</span>
            <ul class="dashboard__leader-list">
              ${metrics.distribuicaoLider.map(l =>
                `<li class="dashboard__leader-item">
                  <span class="dashboard__leader-name">${l.nome}</span>
                  <span class="dashboard__leader-count">${l.count}</span>
                </li>`
              ).join('')}
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Start listening to state changes and auto-update the dashboard.
   * Updates within 1 second of state change (requirement 4.4).
   */
  startListening() {
    if (this._unsubscribe) return;

    const handler = (clients) => {
      this.render(clients);
    };

    this.stateManager.on('clients-updated', handler);
    this._unsubscribe = () => {
      // Remove the handler from listener array
      const listeners = this.stateManager._listeners['clients-updated'];
      if (listeners) {
        const idx = listeners.indexOf(handler);
        if (idx !== -1) listeners.splice(idx, 1);
      }
    };

    // Initial render with current data
    const clients = this.stateManager.getClients();
    this.render(clients);
  }

  /**
   * Clean up the view and remove event listeners.
   */
  destroy() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this.container.innerHTML = '';
  }

  /**
   * Handle filter changes — re-render with new filtered data if needed.
   * Note: Dashboard typically shows ALL clients regardless of filters,
   * but this can be overridden if desired.
   * @param {object} filters
   */
  onFilterChange(filters) {
    // Dashboard shows global metrics (not filtered), so we re-render with all clients
    const clients = this.stateManager.getClients();
    this.render(clients);
  }
}
