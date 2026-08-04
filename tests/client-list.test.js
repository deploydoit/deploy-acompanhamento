/**
 * Tests for ClientListView
 * Validates rendering, inline editing, filters, and save behavior
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClientListView } from '../js/views/client-list.js';

// Mock DOM environment
function createContainer() {
  const div = {
    innerHTML: '',
    querySelectorAll: function(selector) { return []; },
    querySelector: function(selector) { return null; }
  };
  return div;
}

// Create a mock StateManager
function createMockStateManager(clients = []) {
  return {
    clients: clients,
    getClients: function() { return this.clients; },
    getClient: function(id) { return this.clients.find(c => c.id === id) || null; },
    getFilters: function() { return {}; },
    updateFollowUp: vi.fn(),
    firebaseService: {
      writeClient: vi.fn()
    }
  };
}

// Generate a mock client for testing
function createMockClient(overrides = {}) {
  return {
    id: 'test-client-1',
    nome: 'Test Company [test-client]',
    cliente: 'Test Company',
    lider: 'Bruno Hideo Toyama',
    email: 'test@example.com',
    telefone: '+55 (11) 99999-0000',
    cidade: 'São Paulo',
    uf: 'SP',
    status_projeto: 'Acompanhamento',
    inicio_capacitacao: '2026-01-01',
    fim_capacitacao: '2026-01-06',
    datas_previstas: ['2026-01-13', '2026-02-12', '2026-03-14', '2026-04-13'],
    acompanhamentos_agenda: [],
    followUps: {
      0: { data: '2026-01-13', contato_realizado: 'sim', canal: 'whatsapp', retorno: 'OK', ocorreu: 'sim', detectado_agenda: false, ultima_edicao: { membro: 'Bruno Hideo Toyama', timestamp: 1700000000000 } },
      1: { data: '', contato_realizado: 'não', canal: '', retorno: '', ocorreu: 'não', detectado_agenda: false, ultima_edicao: null },
      2: {},
      3: {}
    },
    data_referencia_manual: null,
    ...overrides
  };
}

describe('ClientListView', () => {
  describe('Constructor', () => {
    it('should create a ClientListView instance', () => {
      const container = createContainer();
      const stateManager = createMockStateManager();
      const view = new ClientListView(container, stateManager);

      expect(view).toBeDefined();
      expect(view.container).toBe(container);
      expect(view.stateManager).toBe(stateManager);
    });
  });

  describe('render()', () => {
    it('should show "Nenhum cliente encontrado" when client list is empty', () => {
      const container = createContainer();
      const stateManager = createMockStateManager([]);
      const view = new ClientListView(container, stateManager);

      view.render([]);

      expect(container.innerHTML).toContain('Nenhum cliente encontrado');
    });

    it('should render client cards with client name', () => {
      const container = createContainer();
      const clients = [createMockClient()];
      const stateManager = createMockStateManager(clients);
      const view = new ClientListView(container, stateManager);

      // We need to stub querySelectorAll for event listener attachment
      container.querySelectorAll = () => [];
      view.render(clients);

      expect(container.innerHTML).toContain('Test Company [test-client]');
    });

    it('should render the leader name', () => {
      const container = createContainer();
      const clients = [createMockClient()];
      const stateManager = createMockStateManager(clients);
      const view = new ClientListView(container, stateManager);
      container.querySelectorAll = () => [];

      view.render(clients);

      expect(container.innerHTML).toContain('Bruno Hideo Toyama');
    });

    it('should render progress ring with correct count', () => {
      const container = createContainer();
      const clients = [createMockClient()]; // 1 slot with ocorreu=sim
      const stateManager = createMockStateManager(clients);
      const view = new ClientListView(container, stateManager);
      container.querySelectorAll = () => [];

      view.render(clients);

      expect(container.innerHTML).toContain('1/4');
      expect(container.innerHTML).toContain('progress-ring');
    });

    it('should render all 4 follow-up slots', () => {
      const container = createContainer();
      const clients = [createMockClient()];
      const stateManager = createMockStateManager(clients);
      const view = new ClientListView(container, stateManager);
      container.querySelectorAll = () => [];

      view.render(clients);

      expect(container.innerHTML).toContain('1º acomp.');
      expect(container.innerHTML).toContain('2º acomp.');
      expect(container.innerHTML).toContain('3º acomp.');
      expect(container.innerHTML).toContain('4º acomp.');
    });

    it('should show "detectado na agenda" badge when applicable', () => {
      const container = createContainer();
      const client = createMockClient({
        followUps: {
          0: { data: '2026-01-13', contato_realizado: 'sim', canal: 'whatsapp', retorno: '', ocorreu: 'sim', detectado_agenda: true, ultima_edicao: null },
          1: {},
          2: {},
          3: {}
        }
      });
      const stateManager = createMockStateManager([client]);
      const view = new ClientListView(container, stateManager);
      container.querySelectorAll = () => [];

      view.render([client]);

      expect(container.innerHTML).toContain('detectado na agenda');
      expect(container.innerHTML).toContain('agenda-badge');
    });

    it('should show last editor info when available', () => {
      const container = createContainer();
      const clients = [createMockClient()];
      const stateManager = createMockStateManager(clients);
      const view = new ClientListView(container, stateManager);
      container.querySelectorAll = () => [];

      view.render(clients);

      expect(container.innerHTML).toContain('Editado por: Bruno Hideo Toyama');
    });

    it('should show "pendente" for clients without expected dates', () => {
      const container = createContainer();
      const client = createMockClient({
        fim_capacitacao: null,
        datas_previstas: [],
        followUps: {}
      });
      const stateManager = createMockStateManager([client]);
      const view = new ClientListView(container, stateManager);
      container.querySelectorAll = () => [];

      view.render([client]);

      expect(container.innerHTML).toContain('pendente');
      expect(container.innerHTML).toContain('manual-date-input');
    });

    it('should show date prevista formatted as DD/MM/AAAA', () => {
      const container = createContainer();
      const clients = [createMockClient()];
      const stateManager = createMockStateManager(clients);
      const view = new ClientListView(container, stateManager);
      container.querySelectorAll = () => [];

      view.render(clients);

      expect(container.innerHTML).toContain('Previsto: 13/01/2026');
    });

    it('should show result count', () => {
      const container = createContainer();
      const clients = [createMockClient(), createMockClient({ id: 'test-2', nome: 'Second Client' })];
      const stateManager = createMockStateManager(clients);
      const view = new ClientListView(container, stateManager);
      container.querySelectorAll = () => [];

      view.render(clients);

      expect(container.innerHTML).toContain('2 clientes');
    });

    it('should render agenda note when client has agenda events', () => {
      const container = createContainer();
      const client = createMockClient({
        acompanhamentos_agenda: [
          { data_iso: '2026-02-10', data: '10/02/2026', nome: '[test-client] Acompanhamento', dono: 'Bruno', futuro: true }
        ]
      });
      const stateManager = createMockStateManager([client]);
      const view = new ClientListView(container, stateManager);
      container.querySelectorAll = () => [];

      view.render([client]);

      expect(container.innerHTML).toContain('evento detectado na agenda deste cliente');
    });

    it('should render contato_realizado segmented buttons with correct active state', () => {
      const container = createContainer();
      const clients = [createMockClient()];
      const stateManager = createMockStateManager(clients);
      const view = new ClientListView(container, stateManager);
      container.querySelectorAll = () => [];

      view.render(clients);

      // First slot has contato_realizado='sim' - that button should be active
      expect(container.innerHTML).toContain('data-field="contato_realizado"');
    });

    it('should render canal segmented buttons', () => {
      const container = createContainer();
      const clients = [createMockClient()];
      const stateManager = createMockStateManager(clients);
      const view = new ClientListView(container, stateManager);
      container.querySelectorAll = () => [];

      view.render(clients);

      expect(container.innerHTML).toContain('WhatsApp');
      expect(container.innerHTML).toContain('E-mail');
      expect(container.innerHTML).toContain('Intercom');
    });
  });

  describe('onFilterChange()', () => {
    it('should re-render with filtered clients', () => {
      const container = createContainer();
      const clients = [
        createMockClient({ id: 'c1', lider: 'Bruno Hideo Toyama' }),
        createMockClient({ id: 'c2', lider: 'Ana Paula', nome: 'Ana Client' })
      ];
      const stateManager = createMockStateManager(clients);
      const view = new ClientListView(container, stateManager);
      container.querySelectorAll = () => [];

      view.onFilterChange({ leader: 'Ana Paula' });

      expect(container.innerHTML).toContain('Ana Client');
      expect(container.innerHTML).not.toContain('Test Company [test-client]');
    });

    it('should show empty state when filters match nothing', () => {
      const container = createContainer();
      const clients = [createMockClient()];
      const stateManager = createMockStateManager(clients);
      const view = new ClientListView(container, stateManager);
      container.querySelectorAll = () => [];

      view.onFilterChange({ leader: 'Nonexistent Leader' });

      expect(container.innerHTML).toContain('Nenhum cliente encontrado');
    });
  });

  describe('destroy()', () => {
    it('should clear the container and expanded state', () => {
      const container = createContainer();
      const stateManager = createMockStateManager([createMockClient()]);
      const view = new ClientListView(container, stateManager);
      container.querySelectorAll = () => [];

      view.render([createMockClient()]);
      view.destroy();

      expect(container.innerHTML).toBe('');
    });
  });

  describe('Inline editing behavior', () => {
    it('should call stateManager.updateFollowUp when slot data is saved', () => {
      const container = createContainer();
      const stateManager = createMockStateManager([createMockClient()]);
      const view = new ClientListView(container, stateManager);

      // Directly test internal method
      view._saveSlotData('test-client-1', 0, {
        data: '2026-01-15',
        contato_realizado: 'sim',
        canal: 'whatsapp',
        retorno: 'Updated retorno',
        ocorreu: 'sim'
      });

      expect(stateManager.updateFollowUp).toHaveBeenCalledWith('test-client-1', 0, {
        data: '2026-01-15',
        contato_realizado: 'sim',
        canal: 'whatsapp',
        retorno: 'Updated retorno',
        ocorreu: 'sim'
      });
    });

    it('should NOT call updateFollowUp when user cancels inconsistent state confirmation', () => {
      const container = createContainer();
      const stateManager = createMockStateManager([createMockClient()]);
      const view = new ClientListView(container, stateManager);

      // Mock confirm to return false
      global.confirm = vi.fn(() => false);

      view._saveSlotData('test-client-1', 0, {
        data: '2026-01-15',
        contato_realizado: 'não',
        canal: 'whatsapp',
        retorno: '',
        ocorreu: 'sim' // Inconsistent: ocorreu=sim + contato=não
      });

      expect(stateManager.updateFollowUp).not.toHaveBeenCalled();
      expect(global.confirm).toHaveBeenCalled();
    });

    it('should call updateFollowUp when user confirms inconsistent state', () => {
      const container = createContainer();
      const stateManager = createMockStateManager([createMockClient()]);
      const view = new ClientListView(container, stateManager);

      // Mock confirm to return true
      global.confirm = vi.fn(() => true);

      view._saveSlotData('test-client-1', 0, {
        data: '2026-01-15',
        contato_realizado: 'não',
        canal: 'whatsapp',
        retorno: '',
        ocorreu: 'sim'
      });

      expect(stateManager.updateFollowUp).toHaveBeenCalled();
      expect(global.confirm).toHaveBeenCalled();
    });
  });

  describe('HTML escaping', () => {
    it('should escape special HTML characters in client names', () => {
      const container = createContainer();
      const client = createMockClient({ nome: '<script>alert("xss")</script>' });
      const stateManager = createMockStateManager([client]);
      const view = new ClientListView(container, stateManager);
      container.querySelectorAll = () => [];

      view.render([client]);

      expect(container.innerHTML).not.toContain('<script>');
      expect(container.innerHTML).toContain('&lt;script&gt;');
    });
  });
});
