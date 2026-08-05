import { describe, it, expect } from 'vitest';
import { parseDate, toISODate, toBRDate, isPastOrToday, addDays } from '../js/dates.js';
import { ImportService } from '../js/import.js';

describe('date normalization', () => {
  it('parses Brazilian DD/MM/YYYY', () => {
    expect(toISODate('14/06/2022')).toBe('2022-06-14');
  });

  it('parses ISO unchanged', () => {
    expect(toISODate('2022-06-14')).toBe('2022-06-14');
  });

  it('parses 2-digit years as 20xx', () => {
    expect(toISODate('9/6/25')).toBe('2025-06-09');
  });

  it('returns empty string for junk instead of throwing', () => {
    expect(toISODate('')).toBe('');
    expect(toISODate(null)).toBe('');
    expect(toISODate('not a date')).toBe('');
  });

  it('round-trips BR -> ISO -> BR', () => {
    expect(toBRDate(toISODate('01/02/2026'))).toBe('01/02/2026');
  });

  it('does not shift the day across timezones', () => {
    // A naive `new Date("2022-06-14")` is UTC midnight and can render as the 13th.
    const d = parseDate('2022-06-14');
    expect(d.getDate()).toBe(14);
    expect(d.getMonth()).toBe(5);
  });

  it('detects past and future dates', () => {
    expect(isPastOrToday('01/01/2020')).toBe(true);
    expect(isPastOrToday('01/01/2099')).toBe(false);
  });

  it('treats today as already occurred', () => {
    const today = new Date();
    expect(isPastOrToday(toISODate(today))).toBe(true);
  });

  it('adds days across a month boundary', () => {
    expect(addDays('28/02/2026', 5)).toBe('05/03/2026');
  });
});

describe('event import writes displayable dates', () => {
  const service = new ImportService();

  it('stores ISO so <input type="date"> can render it', () => {
    const followUp = service._eventToFollowUpData({
      data: '14/06/2022',
      nome_evento: '[4dprojetos] Acompanhamento',
      dono: 'Bruno',
    });
    // ISO is mandatory: a date input silently blanks anything else.
    expect(followUp.data).toBe('2022-06-14');
  });

  it('marks a past agenda event as occurred', () => {
    const followUp = service._eventToFollowUpData({
      data: '14/06/2022',
      nome_evento: '[4dprojetos] Acompanhamento',
    });
    expect(followUp.ocorreu).toBe('sim');
    expect(followUp.contato_realizado).toBe('sim');
    expect(followUp.detectado_agenda).toBe(true);
  });

  it('leaves a future agenda event pending', () => {
    const followUp = service._eventToFollowUpData({
      data: '14/06/2099',
      nome_evento: '[4dprojetos] Acompanhamento',
    });
    expect(followUp.ocorreu).toBe('nao');
    expect(followUp.contato_realizado).toBe('nao');
  });

  it('never emits a date the input would reject', () => {
    for (const raw of ['14/06/2022', '2022-06-14', '9/6/25', 45000]) {
      const { data } = service._eventToFollowUpData({ data: raw, nome_evento: 'x' });
      expect(data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
