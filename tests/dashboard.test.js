import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardView, calculateMetrics } from '../js/views/dashboard.js';

// ─── Minimal DOM mock for Node environment ─────────────────────────────────────

function createMockElement(tag = 'div') {
  let innerHTML = '';
  const el = {
    tagName: tag.toUpperCase(),
    id: '',
    get innerHTML() { return innerHTML; },
    set innerHTML(val) { innerHTML = val; el._parsed = parseHTML(val); },
    querySelector(sel) { return queryFromParsed(el._parsed, sel); },
    querySelectorAll(sel) { return queryAllFromParsed(el._parsed, sel); },
    _parsed: null
  };
  return el;
}

/**
 * Very simple HTML parser for testing — extracts classes, text content, and style.
 * Not a full DOM, but sufficient for our card-based tests.
 */
function parseHTML(html) {
  const elements = [];
  // Match opening tags with their content
  const tagRegex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const [, tag, attrs, content] = match;
    const classMatch = attrs.match(/class="([^"]*)"/);
    const styleMatch = attrs.match(/style="([^"]*)"/);
    const el = {
      tag,
      className: classMatch ? classMatch[1] : '',
      style: parseStyle(styleMatch ? styleMatch[1] : ''),
      textContent: content.replace(/<[^>]*>/g, '').trim(),
      innerHTML: content,
      children: parseHTML(content)
    };
    elements.push(el);
  }
  return elements;
}

function parseStyle(styleStr) {
  const obj = {};
  if (!styleStr) return obj;
  styleStr.split(';').forEach(part => {
    const [key, val] = part.split(':').map(s => s.trim());
    if (key && val) {
      // Convert CSS property to camelCase
      const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      obj[camelKey] = val;
    }
  });
  return obj;
}

function queryFromParsed(elements, selector) {
  const all = queryAllFromParsed(elements, selector);
  return all.length > 0 ? all[0] : null;
}

function queryAllFromParsed(elements, selector) {
  if (!elements) return [];
  const results = [];
  const className = selector.startsWith('.') ? selector.slice(1) : null;

  function walk(nodes) {
    for (const node of nodes) {
      if (className && node.className && node.className.split(' ').includes(className)) {
        results.push(node);
      }
      if (node.children) walk(node.children);
    }
  }
  walk(elements);
  return results;
}

// ─── Test data helpers ─────────────────────────────────────────────────────────

function createClient(overrides = {}) {
  return {
    id: 'c1',
    nome: 'Cliente Teste',
    lider: 'Ana Paula',
    followUps: {},
    datas_previstas: [],
    ...overrides
  };
}

function createMockStateManager(clients = []) {
  const listeners = {};
  return {
    _listeners: listeners,
    getClients: vi.fn(() => clients),
    on: vi.fn((event, cb) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    _emit(event, data) {
      (listeners[event] || []).forEach(cb => cb(data));
    }
  };
}

// ─── calculateMetrics tests ────────────────────────────────────────────────────

describe('calculateMetrics()', () => {
  it('should return zero metrics for empty array', () => {
    const metrics = calculateMetrics([]);
    expect(metrics.total).toBe(0);
    expect(metrics.naoIniciados).toBe(0);
    expect(metrics.emAndamento).toBe(0);
    expect(metrics.completos).toBe(0);
    expect(metrics.realizados).toBe(0);
    expect(metrics.totalSlots).toBe(0);
    expect(metrics.atrasados).toBe(0);
    expect(metrics.progressRatio).toBe(0);
    expect(metrics.distribuicaoLider).toEqual([]);
  });

  it('should return zero metrics for null/undefined input', () => {
    expect(calculateMetrics(null).total).toBe(0);
    expect(calculateMetrics(undefined).total).toBe(0);
  });

  it('should count total clients', () => {
    const clients = [createClient(), createClient({ id: 'c2' }), createClient({ id: 'c3' })];
    const metrics = calculateMetrics(clients);
    expect(metrics.total).toBe(3);
    expect(metrics.totalSlots).toBe(12);
  });

  it('should classify clients with no followUps as não iniciados', () => {
    const clients = [
      createClient({ followUps: {} }),
      createClient({ id: 'c2', followUps: {} })
    ];
    const metrics = calculateMetrics(clients);
    expect(metrics.naoIniciados).toBe(2);
    expect(metrics.emAndamento).toBe(0);
    expect(metrics.completos).toBe(0);
  });

  it('should classify client with 4 ocorreu=sim as completo', () => {
    const client = createClient({
      followUps: {
        0: { ocorreu: 'sim', contato_realizado: 'sim' },
        1: { ocorreu: 'sim', contato_realizado: 'sim' },
        2: { ocorreu: 'sim', contato_realizado: 'sim' },
        3: { ocorreu: 'sim', contato_realizado: 'sim' }
      }
    });
    const metrics = calculateMetrics([client]);
    expect(metrics.completos).toBe(1);
    expect(metrics.naoIniciados).toBe(0);
    expect(metrics.emAndamento).toBe(0);
    expect(metrics.realizados).toBe(4);
  });

  it('should classify client with some progress as em andamento', () => {
    const client = createClient({
      followUps: {
        0: { ocorreu: 'sim', contato_realizado: 'sim' },
        1: { ocorreu: 'não', contato_realizado: 'sim' }
      }
    });
    const metrics = calculateMetrics([client]);
    expect(metrics.emAndamento).toBe(1);
    expect(metrics.naoIniciados).toBe(0);
    expect(metrics.completos).toBe(0);
  });

  it('should classify client with only contato (no ocorreu) as em andamento', () => {
    const client = createClient({
      followUps: {
        0: { ocorreu: 'não', contato_realizado: 'sim' }
      }
    });
    const metrics = calculateMetrics([client]);
    expect(metrics.emAndamento).toBe(1);
    expect(metrics.naoIniciados).toBe(0);
  });

  it('should calculate realizados as sum of all ocorreu=sim', () => {
    const clients = [
      createClient({
        followUps: { 0: { ocorreu: 'sim' }, 1: { ocorreu: 'sim' } }
      }),
      createClient({
        id: 'c2',
        followUps: { 0: { ocorreu: 'sim' } }
      })
    ];
    const metrics = calculateMetrics(clients);
    expect(metrics.realizados).toBe(3);
    expect(metrics.totalSlots).toBe(8);
  });

  it('should calculate progress ratio correctly', () => {
    const clients = [
      createClient({
        followUps: { 0: { ocorreu: 'sim' }, 1: { ocorreu: 'sim' } }
      })
    ];
    const metrics = calculateMetrics(clients);
    // 2 realized / (1 client * 4 slots) = 0.5
    expect(metrics.progressRatio).toBe(0.5);
  });

  it('should count atrasados correctly', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayISO = yesterday.toISOString().split('T')[0];

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = tomorrow.toISOString().split('T')[0];

    const client = createClient({
      datas_previstas: [yesterdayISO, yesterdayISO, tomorrowISO, tomorrowISO],
      followUps: {
        0: { ocorreu: 'não' },
        1: { ocorreu: 'sim' },  // This one won't count as atrasado
        2: { ocorreu: 'não' },  // Future, not atrasado
        3: { ocorreu: 'não' }   // Future, not atrasado
      }
    });
    const metrics = calculateMetrics([client]);
    // Only slot 0 is atrasado (past date + not ocorreu)
    // Slot 1 is past but ocorreu=sim so not atrasado
    expect(metrics.atrasados).toBe(1);
  });

  it('should calculate distribuição por líder', () => {
    const clients = [
      createClient({ lider: 'Ana Paula' }),
      createClient({ id: 'c2', lider: 'Ana Paula' }),
      createClient({ id: 'c3', lider: 'Bruno Hideo Toyama' })
    ];
    const metrics = calculateMetrics(clients);
    expect(metrics.distribuicaoLider).toHaveLength(2);
    expect(metrics.distribuicaoLider[0]).toEqual({ nome: 'Ana Paula', count: 2 });
    expect(metrics.distribuicaoLider[1]).toEqual({ nome: 'Bruno Hideo Toyama', count: 1 });
  });

  it('should ensure naoIniciados + emAndamento + completos = total', () => {
    const clients = [
      createClient({ followUps: {} }),
      createClient({ id: 'c2', followUps: { 0: { ocorreu: 'sim', contato_realizado: 'sim' } } }),
      createClient({
        id: 'c3',
        followUps: {
          0: { ocorreu: 'sim' }, 1: { ocorreu: 'sim' },
          2: { ocorreu: 'sim' }, 3: { ocorreu: 'sim' }
        }
      }),
      createClient({ id: 'c4', followUps: { 0: { contato_realizado: 'sim', ocorreu: 'não' } } })
    ];
    const metrics = calculateMetrics(clients);
    expect(metrics.naoIniciados + metrics.emAndamento + metrics.completos).toBe(metrics.total);
  });
});

// ─── DashboardView tests ───────────────────────────────────────────────────────

describe('DashboardView', () => {
  let container;
  let stateManager;

  beforeEach(() => {
    container = createMockElement('div');
    container.id = 'dashboard-area';
    stateManager = createMockStateManager([]);
  });

  it('should render dashboard cards into container', () => {
    const view = new DashboardView(container, stateManager);
    view.render([]);
    // Verify the HTML contains the expected structure
    expect(container.innerHTML).toContain('dashboard');
    expect(container.innerHTML).toContain('dashboard__cards');
    expect(container.innerHTML).toContain('Total Clientes');
    expect(container.innerHTML).toContain('Não Iniciados');
    expect(container.innerHTML).toContain('Em Andamento');
    expect(container.innerHTML).toContain('Completos');
    expect(container.innerHTML).toContain('Realizados');
  });

  it('should display total clients value', () => {
    const clients = [createClient(), createClient({ id: 'c2' })];
    const view = new DashboardView(container, stateManager);
    view.render(clients);

    const values = container.querySelectorAll('.dashboard__card-value');
    // First card is "Total Clientes"
    expect(values[0].textContent).toBe('2');
  });

  it('should display realizados as X/Y format', () => {
    const clients = [
      createClient({ followUps: { 0: { ocorreu: 'sim' } } })
    ];
    const view = new DashboardView(container, stateManager);
    view.render(clients);

    const values = container.querySelectorAll('.dashboard__card-value');
    // 5th card is "Realizados" → 1/4
    expect(values[4].textContent).toBe('1/4');
  });

  it('should display progress bar with percentage', () => {
    const clients = [
      createClient({
        followUps: {
          0: { ocorreu: 'sim' }, 1: { ocorreu: 'sim' }
        }
      })
    ];
    const view = new DashboardView(container, stateManager);
    view.render(clients);

    // Check that progress bar HTML is rendered with correct value
    expect(container.innerHTML).toContain('width: 50%');

    const progressValue = container.querySelector('.dashboard__progress-value');
    expect(progressValue).not.toBeNull();
    expect(progressValue.textContent).toBe('50%');
  });

  it('should display atrasados count', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayISO = yesterday.toISOString().split('T')[0];

    const client = createClient({
      datas_previstas: [yesterdayISO, yesterdayISO],
      followUps: { 0: { ocorreu: 'não' }, 1: { ocorreu: 'não' } }
    });
    const view = new DashboardView(container, stateManager);
    view.render([client]);

    const badValue = container.querySelector('.dashboard__card-value--bad');
    expect(badValue.textContent).toBe('2');
  });

  it('should display leader distribution', () => {
    const clients = [
      createClient({ lider: 'Ana Paula' }),
      createClient({ id: 'c2', lider: 'Bruno Hideo Toyama' })
    ];
    const view = new DashboardView(container, stateManager);
    view.render(clients);

    const leaderItems = container.querySelectorAll('.dashboard__leader-item');
    expect(leaderItems.length).toBe(2);
  });

  it('should auto-update when state emits clients-updated', () => {
    const clients = [createClient()];
    stateManager = createMockStateManager(clients);
    const view = new DashboardView(container, stateManager);
    view.startListening();

    // Verify initial render
    let values = container.querySelectorAll('.dashboard__card-value');
    expect(values[0].textContent).toBe('1');

    // Simulate state update with new data
    const updatedClients = [createClient(), createClient({ id: 'c2' })];
    stateManager._emit('clients-updated', updatedClients);

    // Verify re-render
    values = container.querySelectorAll('.dashboard__card-value');
    expect(values[0].textContent).toBe('2');
  });

  it('should clean up on destroy', () => {
    const view = new DashboardView(container, stateManager);
    view.startListening();
    view.destroy();

    expect(container.innerHTML).toBe('');
    // Listener should be removed
    expect(stateManager._listeners['clients-updated']).toHaveLength(0);
  });
});
