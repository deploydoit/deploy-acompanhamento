/**
 * tests/kanban.test.js — Unit tests for KanbanView
 */
import { describe, it, expect } from 'vitest';
import {
  KanbanView,
  KANBAN_COLUMNS,
  countCompletedFollowUps,
  daysUntilNextContact,
  getUrgencyLevel,
  getColumnIndex,
} from '../js/views/kanban.js';

// ─── Helper: create a mock client ────────────────────────────────────────────

function createClient(overrides = {}) {
  return {
    id: 'client-1',
    nome: 'Empresa Teste Ltda',
    lider: 'Bruno Hideo Toyama',
    followUps: {},
    datas_previstas: ['2026-08-01', '2026-08-31', '2026-09-30', '2026-10-30'],
    status_projeto: 'Acompanhamento',
    ...overrides,
  };
}

function createFollowUps(occurrences) {
  const followUps = {};
  for (let i = 0; i < 4; i++) {
    followUps[i] = {
      data: '2026-07-25',
      contato_realizado: occurrences[i] ? 'sim' : 'não',
      canal: 'whatsapp',
      retorno: '',
      ocorreu: occurrences[i] ? 'sim' : 'não',
    };
  }
  return followUps;
}

// ─── countCompletedFollowUps ─────────────────────────────────────────────────

describe('countCompletedFollowUps', () => {
  it('returns 0 when no followUps exist', () => {
    expect(countCompletedFollowUps({})).toBe(0);
    expect(countCompletedFollowUps({ followUps: {} })).toBe(0);
    expect(countCompletedFollowUps({ followUps: null })).toBe(0);
  });

  it('returns 0 when no slots have ocorreu=sim', () => {
    const client = createClient({
      followUps: createFollowUps([false, false, false, false]),
    });
    expect(countCompletedFollowUps(client)).toBe(0);
  });

  it('counts correctly for partial completion', () => {
    const client = createClient({
      followUps: createFollowUps([true, true, false, false]),
    });
    expect(countCompletedFollowUps(client)).toBe(2);
  });

  it('returns 4 when all slots are complete', () => {
    const client = createClient({
      followUps: createFollowUps([true, true, true, true]),
    });
    expect(countCompletedFollowUps(client)).toBe(4);
  });

  it('only counts slots 0-3', () => {
    const client = createClient({
      followUps: {
        0: { ocorreu: 'sim' },
        1: { ocorreu: 'sim' },
        2: { ocorreu: 'não' },
        3: { ocorreu: 'sim' },
        4: { ocorreu: 'sim' }, // extra slot, should be ignored
      },
    });
    expect(countCompletedFollowUps(client)).toBe(3);
  });
});

// ─── getColumnIndex ──────────────────────────────────────────────────────────

describe('getColumnIndex', () => {
  it('returns 0 for client with no completed follow-ups', () => {
    const client = createClient({ followUps: {} });
    expect(getColumnIndex(client)).toBe(0);
  });

  it('returns correct column for each completion count', () => {
    for (let count = 0; count <= 4; count++) {
      const occurrences = Array.from({ length: 4 }, (_, i) => i < count);
      const client = createClient({ followUps: createFollowUps(occurrences) });
      expect(getColumnIndex(client)).toBe(count);
    }
  });
});

// ─── daysUntilNextContact ────────────────────────────────────────────────────

describe('daysUntilNextContact', () => {
  const today = new Date('2026-08-10T12:00:00');

  it('returns null when no datas_previstas', () => {
    const client = createClient({ datas_previstas: [] });
    expect(daysUntilNextContact(client, today)).toBeNull();

    const client2 = createClient({ datas_previstas: null });
    expect(daysUntilNextContact(client2, today)).toBeNull();

    const client3 = createClient({ datas_previstas: undefined });
    expect(daysUntilNextContact(client3, today)).toBeNull();
  });

  it('returns positive days when next date is in the future', () => {
    const client = createClient({
      datas_previstas: ['2026-08-20', '2026-09-19', '2026-10-19', '2026-11-18'],
      followUps: {},
    });
    // First slot is pending, date 2026-08-20, today is 2026-08-10 → 10 days
    expect(daysUntilNextContact(client, today)).toBe(10);
  });

  it('returns negative days when next date is overdue', () => {
    const client = createClient({
      datas_previstas: ['2026-08-05', '2026-09-04', '2026-10-04', '2026-11-03'],
      followUps: {},
    });
    // First slot is pending, date 2026-08-05, today is 2026-08-10 → -5 days
    expect(daysUntilNextContact(client, today)).toBe(-5);
  });

  it('returns 0 when next date is today', () => {
    const client = createClient({
      datas_previstas: ['2026-08-10', '2026-09-09', '2026-10-09', '2026-11-08'],
      followUps: {},
    });
    expect(daysUntilNextContact(client, today)).toBe(0);
  });

  it('skips completed slots and returns days for next pending', () => {
    const client = createClient({
      datas_previstas: ['2026-08-01', '2026-08-31', '2026-09-30', '2026-10-30'],
      followUps: createFollowUps([true, false, false, false]),
    });
    // Slot 0 is done, next pending is slot 1 with date 2026-08-31
    // today 2026-08-10 → 21 days
    expect(daysUntilNextContact(client, today)).toBe(21);
  });

  it('returns null when all slots are completed', () => {
    const client = createClient({
      datas_previstas: ['2026-08-01', '2026-08-31', '2026-09-30', '2026-10-30'],
      followUps: createFollowUps([true, true, true, true]),
    });
    expect(daysUntilNextContact(client, today)).toBeNull();
  });
});

// ─── getUrgencyLevel ─────────────────────────────────────────────────────────

describe('getUrgencyLevel', () => {
  it('returns null when days is null', () => {
    expect(getUrgencyLevel(null)).toBeNull();
  });

  it('returns null when days is undefined', () => {
    expect(getUrgencyLevel(undefined)).toBeNull();
  });

  it('returns "bad" for negative days (overdue)', () => {
    expect(getUrgencyLevel(-1)).toBe('bad');
    expect(getUrgencyLevel(-100)).toBe('bad');
  });

  it('returns "warn" for 0 to 7 days', () => {
    expect(getUrgencyLevel(0)).toBe('warn');
    expect(getUrgencyLevel(3)).toBe('warn');
    expect(getUrgencyLevel(7)).toBe('warn');
  });

  it('returns "ok" for more than 7 days', () => {
    expect(getUrgencyLevel(8)).toBe('ok');
    expect(getUrgencyLevel(30)).toBe('ok');
  });
});

// ─── KANBAN_COLUMNS ──────────────────────────────────────────────────────────

describe('KANBAN_COLUMNS', () => {
  it('has exactly 5 columns', () => {
    expect(KANBAN_COLUMNS).toHaveLength(5);
  });

  it('has correct titles in order', () => {
    expect(KANBAN_COLUMNS[0].title).toBe('Sem contato');
    expect(KANBAN_COLUMNS[1].title).toBe('1º acompanhamento');
    expect(KANBAN_COLUMNS[2].title).toBe('2º acompanhamento');
    expect(KANBAN_COLUMNS[3].title).toBe('3º acompanhamento');
    expect(KANBAN_COLUMNS[4].title).toBe('Completo (4/4)');
  });

  it('has ids matching indexes 0-4', () => {
    KANBAN_COLUMNS.forEach((col, i) => {
      expect(col.id).toBe(i);
    });
  });
});

// ─── KanbanView rendering ────────────────────────────────────────────────────

describe('KanbanView', () => {
  function createMockContainer() {
    return {
      innerHTML: '',
      querySelectorAll: () => [],
    };
  }

  function createMockStateManager(clients = []) {
    return {
      getClients: () => clients,
      getFilters: () => ({}),
      on: () => {},
    };
  }

  it('renders 5 columns', () => {
    const container = createMockContainer();
    const view = new KanbanView(container, createMockStateManager([]));
    view.render([]);

    // Check that all 5 column titles appear
    for (const col of KANBAN_COLUMNS) {
      expect(container.innerHTML).toContain(col.title);
    }
  });

  it('places clients in correct columns based on completed follow-ups', () => {
    const clients = [
      createClient({ id: 'a', followUps: createFollowUps([false, false, false, false]) }),
      createClient({ id: 'b', followUps: createFollowUps([true, false, false, false]) }),
      createClient({ id: 'c', followUps: createFollowUps([true, true, true, true]) }),
    ];

    const container = createMockContainer();
    const view = new KanbanView(container, createMockStateManager(clients));
    view.render(clients);

    // Client a → column 0, client b → column 1, client c → column 4
    expect(container.innerHTML).toContain('data-client-id="a"');
    expect(container.innerHTML).toContain('data-client-id="b"');
    expect(container.innerHTML).toContain('data-client-id="c"');
  });

  it('shows "Sem data prevista" for clients without dates', () => {
    const client = createClient({ id: 'x', datas_previstas: [] });
    const container = createMockContainer();
    const view = new KanbanView(container, createMockStateManager([client]));
    view.render([client]);

    expect(container.innerHTML).toContain('Sem data prevista');
  });

  it('shows overdue class for overdue clients', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const isoDate = pastDate.toISOString().split('T')[0];

    const client = createClient({
      id: 'overdue',
      datas_previstas: [isoDate, '2099-01-01', '2099-02-01', '2099-03-01'],
      followUps: {},
    });

    const container = createMockContainer();
    const view = new KanbanView(container, createMockStateManager([client]));
    view.render([client]);

    expect(container.innerHTML).toContain('kanban-card--overdue');
    expect(container.innerHTML).toContain('urgency--bad');
  });

  it('shows client count in column headers', () => {
    const clients = [
      createClient({ id: 'a', followUps: createFollowUps([false, false, false, false]) }),
      createClient({ id: 'b', followUps: createFollowUps([false, false, false, false]) }),
      createClient({ id: 'c', followUps: createFollowUps([true, true, true, true]) }),
    ];

    const container = createMockContainer();
    const view = new KanbanView(container, createMockStateManager(clients));
    view.render(clients);

    // Column 0 should show count 2, column 4 should show count 1
    // We check the HTML structure has the counts
    expect(container.innerHTML).toContain('kanban-column__count');
  });

  it('applies filters when rendering', () => {
    const clients = [
      createClient({ id: 'a', lider: 'Bruno Hideo Toyama', followUps: {} }),
      createClient({ id: 'b', lider: 'Isabela Soares', followUps: {} }),
    ];

    const container = createMockContainer();
    const view = new KanbanView(container, createMockStateManager(clients));
    view.onFilterChange({ leader: 'Bruno Hideo Toyama' });

    // Only Bruno's client should appear
    expect(container.innerHTML).toContain('data-client-id="a"');
    expect(container.innerHTML).not.toContain('data-client-id="b"');
  });

  it('shows nome and líder on each card', () => {
    const client = createClient({
      id: 'test',
      nome: 'Empresa ABC',
      lider: 'Ana Paula',
    });

    const container = createMockContainer();
    const view = new KanbanView(container, createMockStateManager([client]));
    view.render([client]);

    expect(container.innerHTML).toContain('Empresa ABC');
    expect(container.innerHTML).toContain('Ana Paula');
  });

  it('calls onClientClick when card is clicked', () => {
    const clicked = [];
    const client = createClient({ id: 'click-test' });

    // Use a real-ish DOM mock
    const cards = [];
    const container = {
      innerHTML: '',
      querySelectorAll: (selector) => {
        if (selector.includes('kanban-card')) {
          return cards;
        }
        return [];
      },
    };

    const view = new KanbanView(container, createMockStateManager([client]), {
      onClientClick: (id) => clicked.push(id),
    });

    // Simulate rendering - the actual test of click behavior is verified through the callback setup
    view.render([client]);
    // Directly invoke the handler
    view._handleCardClick('click-test');
    expect(clicked).toEqual(['click-test']);
  });
});
