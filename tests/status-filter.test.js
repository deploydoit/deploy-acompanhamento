import { describe, it, expect } from 'vitest';
import { calculateMetrics } from '../js/views/dashboard.js';

// Reproduce the exact status strings that can come out of XLSX
const NFC_PRODUCAO = 'Produção';                    // ç = U+00E7, ã = U+00E3 (composed)
const NFD_PRODUCAO = 'Produc\u0327a\u0303o';        // c + combining cedilla, a + combining tilde
const NFC_ACOMP = 'Acompanhamento';
const WITH_NBSP = 'Produção\u00A0';                 // trailing non-breaking space
const UPPER = 'PRODUÇÃO';

function client(lider, status) {
  return {
    id: `${lider}_${status}`,
    lider,
    status_projeto: status,
    followUps: { 0: {}, 1: {}, 2: {}, 3: {} },
  };
}

describe('dashboard status filtering', () => {
  it('counts leaders ONLY for Acompanhamento/Produção', () => {
    const clients = [
      client('Ana Paula', NFC_ACOMP),
      client('Bruno Hideo Toyama', NFC_PRODUCAO),
      client('Nicolas Mori', 'Cancelado'),
      client('Maria Eduarda', 'Finalizado'),
      client('Emerson', 'Implantação'),
    ];
    const names = calculateMetrics(clients).distribuicaoLider.map(l => l.nome);
    expect(names).toEqual(['Ana Paula', 'Bruno Hideo Toyama']);
  });

  it('handles NFD (decomposed) accents from XLSX', () => {
    const names = calculateMetrics([client('Bruno Hideo Toyama', NFD_PRODUCAO)])
      .distribuicaoLider.map(l => l.nome);
    expect(names).toEqual(['Bruno Hideo Toyama']);
  });

  it('handles non-breaking space and uppercase', () => {
    const names = calculateMetrics([
      client('Bruno Hideo Toyama', WITH_NBSP),
      client('Isabela Soares', UPPER),
    ]).distribuicaoLider.map(l => l.nome);
    expect(names).toEqual(expect.arrayContaining(['Bruno Hideo Toyama', 'Isabela Soares']));
    expect(names).toHaveLength(2);
  });

  it('excludes nao_entrar_em_contato from leader counts but counts as completo', () => {
    const blocked = client('Bruno Hideo Toyama', NFC_PRODUCAO);
    blocked.nao_entrar_em_contato = true;
    const m = calculateMetrics([
      client('Ana Paula', NFC_ACOMP),
      blocked,
    ]);
    // Blocked client excluded from leader distribution
    const names = m.distribuicaoLider.map(l => l.nome);
    expect(names).toEqual(['Ana Paula']);
    // But included in total as completo (4 realizados)
    expect(m.total).toBe(2);
    expect(m.completos).toBe(1);
    expect(m.realizados).toBe(4);
    expect(m.atrasados).toBe(0);
  });

  it('total/atrasados also ignore non-target statuses', () => {
    const m = calculateMetrics([
      client('Ana Paula', NFC_ACOMP),
      client('Nicolas Mori', 'Cancelado'),
    ]);
    expect(m.total).toBe(1);
  });
});
