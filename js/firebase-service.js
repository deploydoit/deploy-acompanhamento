/**
 * firebase-service.js — Firebase Realtime Database wrapper
 * Handles CRUD operations, real-time subscriptions, and offline persistence
 */

/**
 * Firebase project configuration.
 * ⚠️ REPLACE the placeholder values below with your actual Firebase project credentials.
 * You can find these in the Firebase Console → Project Settings → Your apps → Web app.
 */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCz34oVdZdm2OHxwulgQktzfMK0h3Gx_D4',
  authDomain: 'deploy-acompanhamento.firebaseapp.com',
  databaseURL: 'https://deploy-acompanhamento-default-rtdb.firebaseio.com',
  projectId: 'deploy-acompanhamento',
  storageBucket: 'deploy-acompanhamento.firebasestorage.app',
  messagingSenderId: '979941410984',
  appId: '1:979941410984:web:ebcea766dacaf667059a9d'
};

export class FirebaseService {
  /**
   * @param {object} [config] - Firebase config object. Falls back to FIREBASE_CONFIG if not provided.
   */
  constructor(config) {
    this.config = config || FIREBASE_CONFIG;
    this.db = null;
    this.auth = null;
    this.app = null;
    this.currentUser = null;

    this._initialize();
  }

  /**
   * Initialize Firebase app, Realtime Database, and sign in anonymously.
   * Anonymous auth is used solely for session identification among team members.
   */
  _initialize() {
    // Avoid re-initializing if Firebase app already exists
    if (firebase.apps.length === 0) {
      this.app = firebase.initializeApp(this.config);
    } else {
      this.app = firebase.apps[0];
    }

    this.db = firebase.database();
    this.auth = firebase.auth();

    // Sign in anonymously for session identification
    this.auth.signInAnonymously().catch((error) => {
      console.error('[FirebaseService] Anonymous auth failed:', error.code, error.message);
    });

    // Track current user
    this.auth.onAuthStateChanged((user) => {
      this.currentUser = user;
    });
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  /**
   * Read all clients from Firebase RTDB.
   * Returns data as an array of client objects (each with its key as `id`).
   * @returns {Promise<object[]>} Array of client objects
   */
  readClients() {
    return this.db.ref('clients').once('value').then((snapshot) => {
      const data = snapshot.val();
      if (!data) return [];
      return Object.entries(data).map(([id, client]) => ({ id, ...client }));
    });
  }

  /**
   * Write/update a follow-up slot for a given client.
   * Adds `ultima_edicao` metadata with member name and timestamp.
   * @param {string} clientId - The client key in RTDB
   * @param {number|string} slot - Follow-up slot index (0-3)
   * @param {object} data - Follow-up data (data, contato_realizado, canal, retorno, ocorreu, etc.)
   * @returns {Promise<void>}
   */
  writeFollowUp(clientId, slot, data) {
    const membro = this._getCurrentMember();
    const followUpData = {
      ...data,
      ultima_edicao: {
        membro,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      }
    };
    return this.db.ref(`clients/${clientId}/followUps/${slot}`).set(followUpData);
  }

  /**
   * Write/update a full client record.
   * If the client object has an `id` field, it is used as key and removed from the stored value.
   * @param {object} client - Full client object
   * @returns {Promise<void>}
   */
  writeClient(client) {
    const { id, ...clientData } = client;
    const key = id || this.db.ref('clients').push().key;
    return this.db.ref(`clients/${key}`).set(clientData);
  }

  // ─── Real-time ─────────────────────────────────────────────────────────────────

  /**
   * Subscribe to real-time value changes on a given RTDB path.
   * @param {string} path - RTDB path to listen on (e.g., 'clients' or 'clients/abc123')
   * @param {function} callback - Called with snapshot value on each change
   * @returns {function} Unsubscribe function — call to stop listening
   */
  subscribeToChanges(path, callback) {
    const ref = this.db.ref(path);
    const listener = ref.on('value', (snapshot) => {
      callback(snapshot.val());
    });
    // Return unsubscribe function
    return () => {
      ref.off('value', listener);
    };
  }

  // ─── Metadata ──────────────────────────────────────────────────────────────────

  /**
   * Get the last import date for a given type (e.g., 'projetos' or 'eventos').
   * @param {string} type - Import type key
   * @returns {Promise<string|null>} Date string or null if not set
   */
  getLastImportDate(type) {
    return this.db.ref(`metadata/lastImport/${type}/date`).once('value').then((snapshot) => {
      return snapshot.val() || null;
    });
  }

  /**
   * Set the last import date for a given type with the current member as author.
   * @param {string} type - Import type key ('projetos' or 'eventos')
   * @param {string} date - Formatted date string (DD/MM/AAAA HH:mm)
   * @returns {Promise<void>}
   */
  setLastImportDate(type, date) {
    const membro = this._getCurrentMember();
    return this.db.ref(`metadata/lastImport/${type}`).set({
      date,
      by: membro
    });
  }

  // ─── Offline ───────────────────────────────────────────────────────────────────

  /**
   * Enable Firebase offline persistence/cache.
   * Firebase RTDB compat SDK enables disk persistence by calling goOnline()
   * and leveraging built-in local caching.
   */
  enablePersistence() {
    if (this.db) {
      // Firebase RTDB has built-in offline support:
      // When enabled, data is cached locally and synced when back online.
      this.db.goOnline();
    }
  }

  /**
   * Get any pending offline changes (placeholder — actual offline queue is
   * managed via localForage in the StateManager).
   * @returns {Promise<object[]>}
   */
  getOfflineQueue() {
    // The offline queue is managed externally via localForage in state.js
    // Firebase RTDB SDK also has its own internal queue for pending writes
    return Promise.resolve([]);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────────

  /**
   * Get the current team member name from localStorage.
   * Team members: Bruno Hideo Toyama, Isabela Soares, Henrique Puertas Stefano, Ana Paula
   * @returns {string} Member name or 'Desconhecido'
   */
  _getCurrentMember() {
    return (typeof localStorage !== 'undefined' && localStorage.getItem('membro')) || 'Desconhecido';
  }
}
