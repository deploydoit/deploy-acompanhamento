import { describe, it, expect, beforeEach } from 'vitest';
import { AgendaView } from '../js/views/agenda.js';
import { toISODate } from '../js/dates.js';

/**
 * The calendar only needs innerHTML plus querySelector for its two nav buttons,
 * so a light stub is enough and keeps these tests fast.
 */
function createContainer() {
  return {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

function createStateManager(clients) {
  return { getClients: () => clients };
}

function client(overrides = {}) {
  return {
    id: 'acme_1',
    nome: 'ACME Arquitetura [acme]',
    lider: 'Bruno Hideo Toyama',
    status_projeto: 'Produção',
    datas_previstas: [],
    followUps: {},
    ...overrides,
  };
}

describe('AgendaView calendar', () => {
  let container;

  beforeEach(() => {
    container = createContainer();
  });

  it('renders the current month and year in the header', () => {
    const view = new AgendaView(container, createStateManager([]));
    view.currentDate = new Date(2026, 7, 15); // August 2026
    view.render();
    expect(container.innerHTML).toContain('Agosto 2026');
  });

  it('renders all seven weekday headers', () => {
    const view = new AgendaView(container, createStateManager([]));
    view.render();
    for (const day of ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']) {
      expect(container.innerHTML).toContain(day);
    }
  });

  it('renders the correct number of days for the month', () => {
    const view = new AgendaView(container, createStateManager([]));
    view.currentDate = new Date(2026, 1, 10); // February 2026 -> 28 days
    view.render();
    const cells = container.innerHTML.match(/data-day="\d+"/g) || [];
    expect(cells).toHaveLength(28);
  });

  it('handles a leap year February', () => {
    const view = new AgendaView(container, createStateManager([]));
    view.currentDate = new Date(2028, 1, 10); // February 2028 -> 29 days
    view.render();
    const cells = container.innerHTML.match(/data-day="\d+"/g) || [];
    expect(cells).toHaveLength(29);
  });

  it('navigates to the previous and next month', () => {
    const view = new AgendaView(container, createStateManager([]));
    view.currentDate = new Date(2026, 0, 15); // January 2026

    view._navigate(-1);
    expect(container.innerHTML).toContain('Dezembro 2025');

    view._navigate(1);
    expect(container.innerHTML).toContain('Janeiro 2026');
  });

  it('places an event on its exact day', () => {
    const c = client({
      followUps: { 0: { data: '2026-08-20', ocorreu: 'sim' } },
    });
    const view = new AgendaView(container, createStateManager([c]));
    view.currentDate = new Date(2026, 7, 1);
    view.render();

    // The day-20 cell must carry the event; day 19 must not.
    const day20 = container.innerHTML.split('data-day="20"')[1].split('data-day=')[0];
    expect(day20).toContain('ACME');
  });

  it('does not shift an ISO date to the previous day', () => {
    // A UTC-parsed "2026-08-20" can render as the 19th in negative offsets.
    const c = client({ followUps: { 0: { data: '2026-08-20', ocorreu: 'sim' } } });
    const view = new AgendaView(container, createStateManager([c]));
    view.currentDate = new Date(2026, 7, 1);
    view.render();

    const day19 = container.innerHTML.split('data-day="19"')[1].split('data-day=')[0];
    expect(day19).not.toContain('ACME');
  });

  it('marks an occurred follow-up as done and a pending one as pending', () => {
    const done = client({
      id: 'done_1',
      nome: 'Feito [feito]',
      followUps: { 0: { data: '2026-08-10', ocorreu: 'sim' } },
    });
    const pending = client({
      id: 'pend_1',
      nome: 'Pendente [pend]',
      followUps: { 0: { data: '2026-08-11', ocorreu: 'nao' } },
    });
    const view = new AgendaView(container, createStateManager([done, pending]));
    view.currentDate = new Date(2026, 7, 1);
    view.render();

    expect(container.innerHTML).toContain('event--done');
    expect(container.innerHTML).toContain('event--pending');
  });

  it('falls back to the forecast date when no contact date exists', () => {
    const c = client({ datas_previstas: ['2026-08-25', '', '', ''] });
    const view = new AgendaView(container, createStateManager([c]));
    view.currentDate = new Date(2026, 7, 1);
    view.render();

    const day25 = container.innerHTML.split('data-day="25"')[1].split('data-day=')[0];
    expect(day25).toContain('ACME');
  });

  it('omits clients flagged as "não entrar em contato"', () => {
    const c = client({
      nao_entrar_em_contato: true,
      followUps: { 0: { data: '2026-08-20', ocorreu: 'sim' } },
    });
    const view = new AgendaView(container, createStateManager([c]));
    view.currentDate = new Date(2026, 7, 1);
    view.render();
    expect(container.innerHTML).not.toContain('ACME');
  });

  it('shows only events belonging to the visible month', () => {
    const c = client({ followUps: { 0: { data: '2026-09-20', ocorreu: 'sim' } } });
    const view = new AgendaView(container, createStateManager([c]));

    view.currentDate = new Date(2026, 7, 1); // August
    view.render();
    expect(container.innerHTML).not.toContain('ACME');

    view.currentDate = new Date(2026, 8, 1); // September
    view.render();
    expect(container.innerHTML).toContain('ACME');
  });

  it('highlights today', () => {
    const view = new AgendaView(container, createStateManager([]));
    view.currentDate = new Date();
    view.render();
    expect(container.innerHTML).toContain('calendar__cell--today');
  });

  it('collapses a busy day into a "+N mais" summary', () => {
    const clients = [1, 2, 3, 4, 5].map(n =>
      client({
        id: `c${n}`,
        nome: `Cliente ${n} [c${n}]`,
        followUps: { 0: { data: '2026-08-20', ocorreu: 'sim' } },
      })
    );
    const view = new AgendaView(container, createStateManager(clients));
    view.currentDate = new Date(2026, 7, 1);
    view.render();
    expect(container.innerHTML).toContain('+2 mais'); // 5 events, 3 shown
  });

  it('renders an empty calendar without throwing', () => {
    const view = new AgendaView(container, createStateManager([]));
    expect(() => view.render()).not.toThrow();
    expect(container.innerHTML).toContain('calendar__grid');
  });

  it('ignores unparseable dates instead of crashing', () => {
    const c = client({ followUps: { 0: { data: 'not a date', ocorreu: 'sim' } } });
    const view = new AgendaView(container, createStateManager([c]));
    expect(() => view.render()).not.toThrow();
  });

  it('accepts Brazilian DD/MM/YYYY dates as well as ISO', () => {
    const c = client({ followUps: { 0: { data: '20/08/2026', ocorreu: 'sim' } } });
    const view = new AgendaView(container, createStateManager([c]));
    view.currentDate = new Date(2026, 7, 1);
    view.render();

    const day20 = container.innerHTML.split('data-day="20"')[1].split('data-day=')[0];
    expect(day20).toContain('ACME');
  });

  it('clears the container on destroy', () => {
    const view = new AgendaView(container, createStateManager([]));
    view.render();
    view.destroy();
    expect(container.innerHTML).toBe('');
  });

  it('escapes nothing it cannot parse and survives a missing followUps map', () => {
    const c = client({ followUps: undefined, datas_previstas: undefined });
    const view = new AgendaView(container, createStateManager([c]));
    expect(() => view.render()).not.toThrow();
  });
});
