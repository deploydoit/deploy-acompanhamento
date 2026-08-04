import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppRouter } from '../js/router.js';

// Mock browser globals for Node test environment
function setupBrowserMocks() {
  const listeners = {};

  global.window = {
    location: { hash: '' },
    addEventListener: (event, handler) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    removeEventListener: (event, handler) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(h => h !== handler);
      }
    },
  };

  global.document = {
    querySelectorAll: () => [],
  };

  return {
    triggerHashChange: () => {
      (listeners['hashchange'] || []).forEach(h => h());
    },
    listeners,
  };
}

describe('AppRouter', () => {
  let mocks;

  beforeEach(() => {
    mocks = setupBrowserMocks();
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
  });

  describe('constructor', () => {
    it('should initialize with provided routes', () => {
      const routes = { '#/': vi.fn(), '#/kanban': vi.fn() };
      const router = new AppRouter(routes);

      expect(router.routes).toBe(routes);
      router.destroy();
    });

    it('should default to empty routes if none provided', () => {
      const router = new AppRouter();
      expect(router.routes).toEqual({});
      router.destroy();
    });

    it('should resolve the initial route on construction', () => {
      const listView = vi.fn();
      window.location.hash = '#/';
      const router = new AppRouter({ '#/': listView });

      expect(listView).toHaveBeenCalledWith('#/');
      router.destroy();
    });

    it('should default to #/ if hash is empty on construction', () => {
      const listView = vi.fn();
      window.location.hash = '';
      const router = new AppRouter({ '#/': listView });

      expect(listView).toHaveBeenCalledWith('#/');
      expect(router.getCurrentRoute()).toBe('#/');
      router.destroy();
    });
  });

  describe('navigate(hash)', () => {
    it('should change window.location.hash', () => {
      const router = new AppRouter({ '#/': vi.fn(), '#/kanban': vi.fn() });
      router.navigate('#/kanban');

      expect(window.location.hash).toBe('#/kanban');
      router.destroy();
    });

    it('should not change hash if already on the target route but should still resolve', () => {
      window.location.hash = '#/kanban';
      const kanbanView = vi.fn();
      const router = new AppRouter({ '#/': vi.fn(), '#/kanban': kanbanView });

      // Reset call count after constructor resolves
      kanbanView.mockClear();

      router.navigate('#/kanban');
      expect(kanbanView).toHaveBeenCalledWith('#/kanban');
      router.destroy();
    });
  });

  describe('getCurrentRoute()', () => {
    it('should return the current active route', () => {
      window.location.hash = '#/agenda';
      const router = new AppRouter({ '#/': vi.fn(), '#/agenda': vi.fn() });

      expect(router.getCurrentRoute()).toBe('#/agenda');
      router.destroy();
    });

    it('should return #/ when hash is empty', () => {
      window.location.hash = '';
      const router = new AppRouter({ '#/': vi.fn() });

      expect(router.getCurrentRoute()).toBe('#/');
      router.destroy();
    });
  });

  describe('onRouteChange(cb)', () => {
    it('should register a listener and call it on route change', () => {
      window.location.hash = '#/';
      const router = new AppRouter({ '#/': vi.fn(), '#/kanban': vi.fn() });
      const listener = vi.fn();

      router.onRouteChange(listener);

      // Simulate navigation
      window.location.hash = '#/kanban';
      mocks.triggerHashChange();

      expect(listener).toHaveBeenCalledWith('#/kanban', '#/');
      router.destroy();
    });

    it('should return an unsubscribe function', () => {
      window.location.hash = '#/';
      const router = new AppRouter({ '#/': vi.fn(), '#/kanban': vi.fn() });
      const listener = vi.fn();

      const unsub = router.onRouteChange(listener);
      unsub();

      window.location.hash = '#/kanban';
      mocks.triggerHashChange();

      expect(listener).not.toHaveBeenCalled();
      router.destroy();
    });

    it('should not call listener if route does not change', () => {
      window.location.hash = '#/';
      const router = new AppRouter({ '#/': vi.fn() });
      const listener = vi.fn();

      router.onRouteChange(listener);

      // Trigger hashchange with same route
      mocks.triggerHashChange();

      expect(listener).not.toHaveBeenCalled();
      router.destroy();
    });

    it('should not register non-function values', () => {
      const router = new AppRouter({ '#/': vi.fn() });
      router.onRouteChange(null);
      router.onRouteChange(undefined);
      router.onRouteChange('not a function');

      expect(router.listeners).toHaveLength(0);
      router.destroy();
    });
  });

  describe('hashchange event handling', () => {
    it('should invoke the correct view callback on hashchange', () => {
      window.location.hash = '#/';
      const kanbanView = vi.fn();
      const router = new AppRouter({ '#/': vi.fn(), '#/kanban': kanbanView });

      window.location.hash = '#/kanban';
      mocks.triggerHashChange();

      expect(kanbanView).toHaveBeenCalledWith('#/kanban');
      router.destroy();
    });

    it('should fall back to #/ for unrecognized routes', () => {
      window.location.hash = '#/';
      const listView = vi.fn();
      const router = new AppRouter({ '#/': listView });

      listView.mockClear();
      window.location.hash = '#/unknown';
      mocks.triggerHashChange();

      // Should redirect to #/ since #/unknown is not a recognized route
      expect(window.location.hash).toBe('#/');
      router.destroy();
    });
  });

  describe('_updateActiveLink()', () => {
    it('should add active class to matching link and remove from others', () => {
      const links = [
        { getAttribute: () => '#/', classList: { add: vi.fn(), remove: vi.fn() } },
        { getAttribute: () => '#/kanban', classList: { add: vi.fn(), remove: vi.fn() } },
      ];
      global.document = { querySelectorAll: () => links };

      window.location.hash = '#/kanban';
      const router = new AppRouter({ '#/': vi.fn(), '#/kanban': vi.fn() });

      expect(links[0].classList.remove).toHaveBeenCalledWith('sidebar__link--active');
      expect(links[1].classList.add).toHaveBeenCalledWith('sidebar__link--active');
      router.destroy();
    });
  });

  describe('destroy()', () => {
    it('should remove hashchange listener and clear listeners array', () => {
      const router = new AppRouter({ '#/': vi.fn() });
      const listener = vi.fn();
      router.onRouteChange(listener);

      router.destroy();

      expect(router.listeners).toHaveLength(0);
      // Verify hashchange no longer triggers
      window.location.hash = '#/kanban';
      mocks.triggerHashChange();
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
