/**
 * router.js — Hash-based SPA router
 * Routes: #/ (list), #/kanban, #/agenda, #/dashboard
 * Compatible with GitHub Pages (no server-side routing needed)
 */

export class AppRouter {
  /**
   * @param {Object<string, Function>} routes - Map of hash routes to view callbacks
   * Example: { '#/': renderList, '#/kanban': renderKanban, ... }
   */
  constructor(routes = {}) {
    this.routes = routes;
    this.listeners = [];
    this.currentRoute = null;

    this._onHashChange = this._onHashChange.bind(this);
    window.addEventListener('hashchange', this._onHashChange);

    // Set initial route
    this._resolveRoute();
  }

  /**
   * Navigate programmatically to a given hash route.
   * @param {string} hash - The hash route (e.g., '#/kanban')
   */
  navigate(hash) {
    if (hash && hash !== window.location.hash) {
      window.location.hash = hash;
    } else if (hash === window.location.hash) {
      // Same route — still trigger view activation (useful on init)
      this._resolveRoute();
    }
  }

  /**
   * Returns the current active route hash.
   * @returns {string} Current hash route (e.g., '#/' or '#/kanban')
   */
  getCurrentRoute() {
    return this.currentRoute || this._normalizeHash(window.location.hash);
  }

  /**
   * Register a callback to be invoked whenever the route changes.
   * @param {Function} cb - Callback receiving (newRoute, previousRoute)
   * @returns {Function} Unsubscribe function
   */
  onRouteChange(cb) {
    if (typeof cb === 'function') {
      this.listeners.push(cb);
    }
    return () => {
      this.listeners = this.listeners.filter(fn => fn !== cb);
    };
  }

  /**
   * Activate the current route's view and update sidebar active state.
   * Called on hashchange and during initialization.
   */
  _resolveRoute() {
    const hash = this._normalizeHash(window.location.hash);
    const previousRoute = this.currentRoute;

    // Default to '#/' if hash is empty or not recognized
    const resolvedHash = this.routes[hash] ? hash : '#/';
    this.currentRoute = resolvedHash;

    // Ensure the browser hash matches the resolved route
    if (resolvedHash !== this._normalizeHash(window.location.hash)) {
      window.location.hash = resolvedHash;
      return; // hashchange will re-trigger _resolveRoute
    }

    // Invoke the view callback for the resolved route
    const viewCallback = this.routes[resolvedHash];
    if (typeof viewCallback === 'function') {
      viewCallback(resolvedHash);
    }

    // Update sidebar active link
    this._updateActiveLink(resolvedHash);

    // Notify listeners
    if (previousRoute !== resolvedHash) {
      this.listeners.forEach(cb => {
        try {
          cb(resolvedHash, previousRoute);
        } catch (e) {
          console.error('[Router] Listener error:', e);
        }
      });
    }
  }

  /**
   * Handler for the hashchange event.
   */
  _onHashChange() {
    this._resolveRoute();
  }

  /**
   * Normalize hash string — defaults to '#/' if empty.
   * @param {string} hash
   * @returns {string}
   */
  _normalizeHash(hash) {
    if (!hash || hash === '#' || hash === '') {
      return '#/';
    }
    return hash;
  }

  /**
   * Update the active state of sidebar navigation links.
   * Looks for elements with `data-route` attribute matching the current route.
   * @param {string} activeHash
   */
  _updateActiveLink(activeHash) {
    // Works in browser context only
    if (typeof document === 'undefined') return;

    const links = document.querySelectorAll('[data-route]');
    links.forEach(link => {
      if (link.getAttribute('data-route') === activeHash) {
        link.classList.add('sidebar__link--active');
      } else {
        link.classList.remove('sidebar__link--active');
      }
    });
  }

  /**
   * Clean up event listeners. Call when the router is no longer needed.
   */
  destroy() {
    window.removeEventListener('hashchange', this._onHashChange);
    this.listeners = [];
  }
}
