import { describe, it, expect, beforeEach } from 'vitest';
import { AgendaView, extractPendingFollowUps, groupEntries } from '../js/views/agenda.js';

// Helper: Create a client with follow-up data
function createClient(overrides = {}) {
  return {
    id: overrides.id || 'client-1',
    nome: overrides.nome || 'Projeto Vortex [vortex-nn]',
    cliente: overrides.cliente || 'RM Participações',
    lider: overrides.lider || 'Bruno Hideo Toyama',
    cidade: overrides.cidade || 'Porto Alegre',
    uf: overrides.uf || 'RS',
    status_projeto: overrides.status_projeto || 'Acompanhamento',
    datas_previstas: overrides.datas_previstas || ['2026-07-25', '2026-08-24', '2026-09-23', '2026-10-23'],
    followUps: overrides.followUps || {
      0: { ocorreu: 'nao' },
      1: { ocorreu: 'nao' },
      2: { ocorreu: 'nao' },
      3: { ocorreu: 'nao' },
    },
    ...overrides,
  };
}

// Minimal DOM container mock
function createContainer() {
  const listeners = [];
  const children = [];
  return {
    innerHTML: '',
    querySelectorAll: function (selector) {
      // Parse innerHTML to simulate DOM elements for events
      // Return empty for test simplicity
      return [];
    },
    dispatchEvent: function () {},
    addEventListener: function (event, handler) {
      listeners.push({ event, handler });
    },
  };
}

describe('AgendaView — extractPendingFollowUps', () => {
  const today = new Date('2026-08-01T12:00:00');

  it('should extract pending follow-ups with correct days calculation', () => {
    const clients = [createClient({
      id: 'c1',
      datas_previstas: ['2026-07-25', '2026-08-24', '2026-09-23', '2026-10-23'],
      followUps: {
        0: { ocorreu: 'nao' },
        1: { ocorreu: 'nao' },
        2: { ocorreu: 'nao' },
        3: { ocorreu: 'nao' },
      },
    })];

    const entries = extractPendingFollowUps(clients, today);
    expect(entries).toHaveLength(4);

    // First entry: 2026-07-25 is 7 days before Aug 1 → days = -7
    expect(entries[0].days).toBe(-7);
    expect(entries[0].urgencyClass).toBe('urgency--bad');

    // Second entry: 2026-08-24 is 23 days after Aug 1 → days = 23
    expect(entries[1].days).toBe(23);
    expect(entries[1].urgencyClass).toBe('urgency--ok');
  });

  it('should skip completed follow-ups (ocorreu === "sim")', () => {
    const clients = [createClient({
      id: 'c1',
      datas_previstas: ['2026-07-25', '2026-08-24', '2026-09-23', '2026-10-23'],
      followUps: {
        0: { ocorreu: 'sim' },
        1: { ocorreu: 'sim' },
        2: { ocorreu: 'nao' },
        3: { ocorreu: 'nao' },
      },
    })];

    const entries = extractPendingFollowUps(clients, today);
    expect(entries).toHaveLength(2);
    expect(entries[0].slotIndex).toBe(2);
    expect(entries[1].slotIndex).toBe(3);
  });

  it('should skip slots without a scheduled date', () => {
    const clients = [createClient({
      id: 'c1',
      datas_previstas: ['2026-07-25'], // Only 1 date
      followUps: {
        0: { ocorreu: 'nao' },
        1: { ocorreu: 'nao' },
        2: { ocorreu: 'nao' },
        3: { ocorreu: 'nao' },
      },
    })];

    const entries = extractPendingFollowUps(clients, today);
    expect(entries).toHaveLength(1);
    expect(entries[0].dateISO).toBe('2026-07-25');
  });

  it('should handle clients with no datas_previstas', () => {
    const clients = [createClient({
      id: 'c1',
      datas_previstas: undefined,
      followUps: { 0: { ocorreu: 'nao' } },
    })];

    const entries = extractPendingFollowUps(clients, today);
    expect(entries).toHaveLength(0);
  });

  it('should handle clients with empty followUps', () => {
    const clients = [createClient({
      id: 'c1',
      datas_previstas: ['2026-07-25', '2026-08-24'],
      followUps: {},
    })];

    const entries = extractPendingFollowUps(clients, today);
    // No followUps means none are "ocorreu=sim", so all dates with valid dates are pending
    expect(entries).toHaveLength(2);
  });

  it('should return correct urgency classes', () => {
    const clients = [createClient({
      id: 'c1',
      datas_previstas: [
        '2026-07-30', // 2 days ago → bad
        '2026-08-01', // today → warn
        '2026-08-05', // 4 days → warn
        '2026-08-20', // 19 days → ok
      ],
      followUps: {
        0: { ocorreu: 'nao' },
        1: { ocorreu: 'nao' },
        2: { ocorreu: 'nao' },
        3: { ocorreu: 'nao' },
      },
    })];

    const entries = extractPendingFollowUps(clients, today);
    expect(entries[0].urgencyClass).toBe('urgency--bad');  // -2 days
    expect(entries[1].urgencyClass).toBe('urgency--warn'); // 0 days
    expect(entries[2].urgencyClass).toBe('urgency--warn'); // 4 days
    expect(entries[3].urgencyClass).toBe('urgency--ok');   // 19 days
  });

  it('should include client name and líder in entries', () => {
    const clients = [createClient({
      id: 'c1',
      nome: 'Projeto Alpha',
      lider: 'Isabela Soares',
      datas_previstas: ['2026-08-05'],
      followUps: { 0: { ocorreu: 'nao' } },
    })];

    const entries = extractPendingFollowUps(clients, today);
    expect(entries[0].clientName).toBe('Projeto Alpha');
    expect(entries[0].lider).toBe('Isabela Soares');
  });

  it('should handle multiple clients', () => {
    const clients = [
      createClient({
        id: 'c1',
        nome: 'Alpha',
        datas_previstas: ['2026-08-05'],
        followUps: { 0: { ocorreu: 'nao' } },
      }),
      createClient({
        id: 'c2',
        nome: 'Beta',
        datas_previstas: ['2026-07-28'],
        followUps: { 0: { ocorreu: 'nao' } },
      }),
    ];

    const entries = extractPendingFollowUps(clients, today);
    expect(entries).toHaveLength(2);
    expect(entries.find(e => e.clientId === 'c1')).toBeDefined();
    expect(entries.find(e => e.clientId === 'c2')).toBeDefined();
  });
});

describe('AgendaView — groupEntries', () => {
  // Aug 1, 2026 is a Saturday. The week (Mon-Sun) would be Jul 27 - Aug 2.
  const today = new Date('2026-08-01T12:00:00');

  it('should group overdue entries into atrasados', () => {
    const entries = [
      { days: -5, date: new Date('2026-07-27T00:00:00'), clientName: 'A' },
      { days: -1, date: new Date('2026-07-31T00:00:00'), clientName: 'B' },
    ];

    const groups = groupEntries(entries, today);
    expect(groups.atrasados).toHaveLength(2);
    expect(groups.estaSemana).toHaveLength(0);
    expect(groups.proximasSemanas).toHaveLength(0);
  });

  it('should group entries in the current week into estaSemana', () => {
    // Today is Aug 1 (Saturday). Week is Jul 27 - Aug 2.
    // Aug 2 is Sunday (same week)
    const entries = [
      { days: 1, date: new Date('2026-08-02T00:00:00'), clientName: 'C' },
    ];

    const groups = groupEntries(entries, today);
    expect(groups.estaSemana).toHaveLength(1);
  });

  it('should group future entries into proximasSemanas', () => {
    const entries = [
      { days: 10, date: new Date('2026-08-11T00:00:00'), clientName: 'D' },
      { days: 30, date: new Date('2026-08-31T00:00:00'), clientName: 'E' },
    ];

    const groups = groupEntries(entries, today);
    expect(groups.proximasSemanas).toHaveLength(2);
  });

  it('should sort atrasados by most overdue first', () => {
    const entries = [
      { days: -1, date: new Date('2026-07-31T00:00:00'), clientName: 'B' },
      { days: -10, date: new Date('2026-07-22T00:00:00'), clientName: 'A' },
      { days: -3, date: new Date('2026-07-29T00:00:00'), clientName: 'C' },
    ];

    const groups = groupEntries(entries, today);
    expect(groups.atrasados[0].days).toBe(-10);
    expect(groups.atrasados[1].days).toBe(-3);
    expect(groups.atrasados[2].days).toBe(-1);
  });

  it('should sort estaSemana by date ascending', () => {
    // Week is Jul 27 - Aug 2 (today is Aug 1 Saturday)
    const entries = [
      { days: 1, date: new Date('2026-08-02T00:00:00'), clientName: 'Later' },
      { days: 0, date: new Date('2026-08-01T00:00:00'), clientName: 'Today' },
    ];

    const groups = groupEntries(entries, today);
    expect(groups.estaSemana[0].days).toBe(0);
    expect(groups.estaSemana[1].days).toBe(1);
  });

  it('should sort proximasSemanas by date ascending', () => {
    const entries = [
      { days: 30, date: new Date('2026-08-31T00:00:00'), clientName: 'Later' },
      { days: 10, date: new Date('2026-08-11T00:00:00'), clientName: 'Sooner' },
    ];

    const groups = groupEntries(entries, today);
    expect(groups.proximasSemanas[0].days).toBe(10);
    expect(groups.proximasSemanas[1].days).toBe(30);
  });

  it('should handle empty entries', () => {
    const groups = groupEntries([], today);
    expect(groups.atrasados).toHaveLength(0);
    expect(groups.estaSemana).toHaveLength(0);
    expect(groups.proximasSemanas).toHaveLength(0);
  });

  it('should handle today entries as estaSemana (days = 0)', () => {
    const entries = [
      { days: 0, date: new Date('2026-08-01T00:00:00'), clientName: 'Today' },
    ];

    const groups = groupEntries(entries, today);
    // days=0 means NOT overdue, and today is within this week
    expect(groups.atrasados).toHaveLength(0);
    expect(groups.estaSemana).toHaveLength(1);
  });
});

describe('AgendaView — render integration', () => {
  let container;
  let view;

  beforeEach(() => {
    container = {
      innerHTML: '',
      querySelectorAll: () => [],
      dispatchEvent: () => {},
    };
    view = new AgendaView(container, null);
  });

  it('should render empty message when no pending follow-ups', () => {
    const clients = [createClient({
      datas_previstas: ['2026-07-25'],
      followUps: { 0: { ocorreu: 'sim' } },
    })];

    view.render(clients, new Date('2026-08-01'));
    expect(container.innerHTML).toContain('Nenhum acompanhamento pendente');
  });

  it('should render overdue group when overdue entries exist', () => {
    const clients = [createClient({
      id: 'c1',
      nome: 'Projeto Alpha',
      lider: 'Bruno Hideo Toyama',
      datas_previstas: ['2026-07-20'],
      followUps: { 0: { ocorreu: 'nao' } },
    })];

    view.render(clients, new Date('2026-08-01'));
    expect(container.innerHTML).toContain('Atrasados');
    expect(container.innerHTML).toContain('Projeto Alpha');
    expect(container.innerHTML).toContain('Bruno Hideo Toyama');
    expect(container.innerHTML).toContain('urgency--bad');
  });

  it('should render date in DD/MM/AAAA format', () => {
    const clients = [createClient({
      id: 'c1',
      datas_previstas: ['2026-08-15'],
      followUps: { 0: { ocorreu: 'nao' } },
    })];

    view.render(clients, new Date('2026-08-01'));
    expect(container.innerHTML).toContain('15/08/2026');
  });

  it('should render relative days text', () => {
    const clients = [createClient({
      id: 'c1',
      datas_previstas: ['2026-08-06'],
      followUps: { 0: { ocorreu: 'nao' } },
    })];

    // Use explicit local time to avoid timezone issues
    view.render(clients, new Date(2026, 7, 1, 12, 0, 0)); // Aug 1, 2026 noon local
    expect(container.innerHTML).toContain('em 5 dias');
  });

  it('should render "Esta semana" group for current week entries', () => {
    // Aug 3, 2026 is a Monday. Week is Aug 3-9.
    const today = new Date('2026-08-03T12:00:00');
    const clients = [createClient({
      id: 'c1',
      datas_previstas: ['2026-08-05'],
      followUps: { 0: { ocorreu: 'nao' } },
    })];

    view.render(clients, today);
    expect(container.innerHTML).toContain('Esta semana');
  });

  it('should render "Próximas semanas" group for future entries', () => {
    const today = new Date('2026-08-01T12:00:00');
    const clients = [createClient({
      id: 'c1',
      datas_previstas: ['2026-08-20'],
      followUps: { 0: { ocorreu: 'nao' } },
    })];

    view.render(clients, today);
    expect(container.innerHTML).toContain('Próximas semanas');
  });

  it('should apply filters before rendering', () => {
    const clients = [
      createClient({
        id: 'c1',
        nome: 'Alpha',
        lider: 'Bruno Hideo Toyama',
        datas_previstas: ['2026-08-10'],
        followUps: { 0: { ocorreu: 'nao' } },
      }),
      createClient({
        id: 'c2',
        nome: 'Beta',
        lider: 'Isabela Soares',
        datas_previstas: ['2026-08-12'],
        followUps: { 0: { ocorreu: 'nao' } },
      }),
    ];

    // Filter by leader
    view.onFilterChange({ leader: 'Isabela Soares' });
    view.render(clients, new Date('2026-08-01'));

    expect(container.innerHTML).toContain('Beta');
    expect(container.innerHTML).not.toContain('Alpha');
  });

  it('should handle null data gracefully', () => {
    view.render(null, new Date('2026-08-01'));
    expect(container.innerHTML).toContain('Nenhum acompanhamento pendente');
  });

  it('should handle empty array', () => {
    view.render([], new Date('2026-08-01'));
    expect(container.innerHTML).toContain('Nenhum acompanhamento pendente');
  });
});

describe('AgendaView — destroy', () => {
  it('should clear container innerHTML', () => {
    const container = {
      innerHTML: '<div>content</div>',
      querySelectorAll: () => [],
    };
    const view = new AgendaView(container, null);
    view.destroy();
    expect(container.innerHTML).toBe('');
  });
});
