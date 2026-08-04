# Implementation Plan: Deploy Client Tracking Panel

## Overview

Implementação do Painel de Acompanhamento de Clientes como uma SPA em Vanilla JS publicada no GitHub Pages, com Firebase Realtime Database como backend compartilhado. A implementação segue uma abordagem incremental: estrutura do projeto → módulos core → views → features → notificações → layout responsivo → deploy.

## Tasks

- [x] 1. Set up project structure, dependencies, and Firebase configuration
  - [x] 1.1 Create directory structure and entry point files
    - Create `index.html` with CDN links (Firebase SDK, SheetJS, localForage)
    - Create `404.html` for GitHub Pages SPA routing fallback
    - Create `css/styles.css` with CSS variables (--forest, --clay, --gold, --bad, --warn, --ok)
    - Create empty JS module files: `js/app.js`, `js/router.js`, `js/state.js`, `js/firebase-service.js`, `js/filters.js`, `js/import.js`, `js/export.js`
    - Create view files: `js/views/client-list.js`, `js/views/kanban.js`, `js/views/agenda.js`, `js/views/dashboard.js`
    - _Requirements: 9.1, 9.2_

  - [x] 1.2 Configure Firebase project and security rules
    - Create `firebase.json` with Realtime Database rules configuration
    - Create `.firebaserc` with project alias
    - Set security rules: open read/write for `clients` and `metadata` paths
    - Initialize Firebase anonymous auth in `js/firebase-service.js` constructor
    - _Requirements: 1.1, 9.2_

  - [x] 1.3 Set up GitHub Actions workflow for automatic deploy
    - Create `.github/workflows/deploy.yml` that deploys static files to GitHub Pages on push to main
    - Configure workflow to copy all frontend files (index.html, 404.html, css/, js/) to deployment
    - _Requirements: 9.1, 9.4_

  - [x] 1.4 Set up testing framework (Vitest + fast-check)
    - Create `package.json` with devDependencies: vitest, fast-check, @vitest/coverage-v8
    - Create `vitest.config.js` with appropriate configuration for Vanilla JS modules
    - Create `tests/` directory with initial test file structure
    - _Requirements: (testing infrastructure)_

- [x] 2. Implement core modules (Router, Firebase Service, State Manager)
  - [x] 2.1 Implement Hash Router (`js/router.js`)
    - Implement `AppRouter` class with routes map (`#/`, `#/kanban`, `#/agenda`, `#/dashboard`)
    - Implement `navigate(hash)` for programmatic navigation
    - Implement `getCurrentRoute()` and `onRouteChange(cb)` listener
    - Listen to `hashchange` event and invoke registered view callbacks
    - _Requirements: 9.2_

  - [x] 2.2 Implement Firebase Service (`js/firebase-service.js`)
    - Implement `FirebaseService` class with Firebase RTDB initialization
    - Implement `readClients()` returning Promise<Client[]>
    - Implement `writeFollowUp(clientId, slot, data)` with timestamp metadata
    - Implement `writeClient(client)` for full client writes
    - Implement `subscribeToChanges(path, callback)` returning unsubscribe function
    - Implement `getLastImportDate(type)` and `setLastImportDate(type, date)`
    - Implement `enablePersistence()` for Firebase offline cache
    - _Requirements: 1.1, 1.2, 1.4, 1.5_

  - [x] 2.3 Implement State Manager (`js/state.js`)
    - Implement `StateManager` class with Firebase sync via `startSync()` / `stopSync()`
    - Implement `getClients()`, `getClient(id)`, `getFilters()`
    - Implement `updateFollowUp(clientId, slotIndex, data)` with 2-second debounce and timestamp
    - Implement `setFilters(filters)` to apply and persist filter state
    - Implement `getConnectionStatus()` returning 'online' | 'offline' | 'syncing'
    - Implement event system `on(event, callback)` for 'clients-updated', 'connection-change', 'conflict'
    - Implement offline queue storage via localForage (IndexedDB)
    - Implement auto-sync on reconnection with last-write-wins conflict resolution
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 10.4_

  - [x]* 2.4 Write property test for last-write-wins conflict resolution
    - **Property 1: Last-write-wins conflict resolution**
    - Test that for any set of concurrent edits to the same follow-up field, the final value is the one with the latest timestamp
    - **Validates: Requirements 1.6, 1.7**

  - [x]* 2.5 Write property test for expected dates calculation
    - **Property 15: Expected dates calculation**
    - Test that for any valid `fim_capacitacao` date, 4 expected dates are computed as +7d, +37d, +67d, +97d
    - **Validates: Requirements 10.3**

  - [x]* 2.6 Write property test for validation alert on inconsistent state
    - **Property 16: Validation alert for inconsistent state**
    - Test that alert triggers only when `ocorreu = "sim"` AND `contato_realizado = "não"`
    - **Validates: Requirements 10.7**

  - [x]* 2.7 Write property test for follow-up data round-trip
    - **Property 14: Follow-up data round-trip**
    - Test that saving and reading back any valid follow-up record produces identical values
    - **Validates: Requirements 10.1**

- [x] 3. Checkpoint - Core modules validated
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Filter Engine and Search
  - [x] 4.1 Implement Filter Engine (`js/filters.js`)
    - Implement `FilterEngine` class with `applyFilters(clients, filters)` using AND between categories, OR within
    - Implement `applySearch(clients, query)` with partial case-insensitive matching on nome, projeto, líder, cidade, estado
    - Implement `combineFilters(filters)` combining all active filter predicates
    - Implement `persistFilters(filters)` / `restoreFilters()` using sessionStorage
    - Implement debounced search (300ms) for real-time results
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x]* 4.2 Write property test for filter combination logic
    - **Property 12: Filter combination logic (AND between categories, OR within)**
    - Test that filtered set contains exactly clients satisfying AND across categories with OR within each
    - **Validates: Requirements 7.2, 7.4**

  - [x]* 4.3 Write property test for search partial case-insensitive matches
    - **Property 13: Search returns partial case-insensitive matches**
    - Test that results include all and only clients where searchable fields contain the query as case-insensitive substring
    - **Validates: Requirements 7.3**

- [x] 5. Implement Views (Client List, Kanban, Agenda, Dashboard)
  - [x] 5.1 Implement Dashboard view (`js/views/dashboard.js`)
    - Implement `DashboardView` extending `BaseView`
    - Render cards: total clientes, não iniciados, em andamento, completos, realizados (X/Y)
    - Render distribuição por líder card
    - Render atrasados card
    - Render progress bar/indicator with numeric value
    - Implement `render(data)` recalculating all metrics from client data
    - Listen to state changes and auto-update within 1 second
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x]* 5.2 Write property test for dashboard metrics consistency
    - **Property 9: Dashboard metrics consistency**
    - Test invariants: não_iniciados + em_andamento + completos = total, sum(per_leader) = total, progresso formula, atrasados count
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.5**

  - [x] 5.3 Implement Client List view (`js/views/client-list.js`)
    - Implement `ClientListView` extending `BaseView`
    - Render expandable client cards with all follow-up slots
    - Each slot shows: data prevista, data do contato, contato_realizado, canal, retorno, ocorreu
    - Implement inline editing with 2-second debounce auto-save
    - Show "Salvo ✓" indicator after successful save
    - Show last editor info (membro name) per follow-up
    - Show "detectado na agenda" badge when applicable
    - Show "pendente" for missing data prevista with manual date input option
    - Implement confirmation alert for inconsistent state (ocorreu=sim + contato=não)
    - Integrate filters: render only matching clients, show "Nenhum cliente encontrado" when empty
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 1.4, 7.6_

  - [x] 5.4 Implement Kanban view (`js/views/kanban.js`)
    - Implement `KanbanView` extending `BaseView`
    - Render 5 columns: "Sem contato", "1º acompanhamento", "2º acompanhamento", "3º acompanhamento", "Completo (4/4)"
    - Show client count in each column header
    - Place clients in columns based on count of `ocorreu === "sim"` slots
    - Each card shows: nome, líder, dias até próximo contato, urgency indicator (red/yellow/green)
    - Highlight overdue cards with red border
    - Show "Sem data prevista" when client has no expected dates
    - On card click, open client details
    - Integrate with FilterEngine for consistent filtered view
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x]* 5.5 Write property test for Kanban column placement
    - **Property 7: Kanban column placement**
    - Test that column is determined solely by count of `ocorreu === "sim"` follow-ups
    - **Validates: Requirements 3.2, 3.3**

  - [x]* 5.6 Write property test for urgency indicator calculation
    - **Property 8: Urgency indicator calculation**
    - Test: red if days < 0, yellow if 0 ≤ days ≤ 7, green if days > 7
    - **Validates: Requirements 3.4, 3.6, 8.5**

  - [x] 5.7 Implement Agenda view (`js/views/agenda.js`)
    - Implement `AgendaView` extending `BaseView`
    - Render timeline of upcoming follow-ups sorted by date
    - Show overdue items at the top with red urgency indicator
    - Show client name, líder, date, and days relative to today
    - Integrate with FilterEngine
    - _Requirements: 3.4, 7.4_

- [x] 6. Checkpoint - Views operational
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Import Module
  - [x] 7.1 Implement project import (`js/import.js` — parseProjectsFile, validateProjectsData, mergeProjects)
    - Implement `parseProjectsFile(file)` using SheetJS to parse .xlsx
    - Implement `validateProjectsData(rows)` checking required columns (código, nome, cliente, email, telefone, líder, cidade, UF, contrato, status_projeto, inicio_capacitacao, fim_capacitacao)
    - Implement `mergeProjects(existing, imported)` that adds new clients, updates existing metadata, preserves followUps
    - Implement `generateImportSummary(result)` returning added/updated/unchanged counts
    - Validate file extension is .xlsx before parsing
    - Report missing columns in error message
    - Skip invalid rows but include line numbers in error report
    - _Requirements: 2.1, 2.3, 2.6, 2.7, 2.8_

  - [x]* 7.2 Write property test for import merge preserves follow-up data
    - **Property 2: Import merge preserves follow-up data**
    - Test that after merge, existing followUps remain unchanged while metadata updates
    - **Validates: Requirements 2.3**

  - [x]* 7.3 Write property test for import validation reports missing columns
    - **Property 4: Import validation reports missing columns exactly**
    - Test that error message lists exactly the absent columns — no more, no less
    - **Validates: Requirements 2.6**

  - [x]* 7.4 Write property test for import summary count invariant
    - **Property 5: Import summary count invariant**
    - Test that added + updated + unchanged = total valid rows
    - **Validates: Requirements 2.7**

  - [x]* 7.5 Write property test for invalid row isolation
    - **Property 6: Invalid row isolation**
    - Test that only valid rows are processed and error report contains exactly the invalid line numbers
    - **Validates: Requirements 2.8**

  - [x] 7.6 Implement event import (`js/import.js` — parseEventsFile, validateEventsData, matchEventsToClients)
    - Implement `parseEventsFile(file)` using SheetJS to parse .xlsx
    - Implement `validateEventsData(rows)` checking required columns (data, nome_evento, dono)
    - Implement `matchEventsToClients(events, clients)` matching by project identifier pattern in event name
    - Pre-fill follow-up slots with event date and inferred channel
    - Show summary: eventos vinculados, novos, ignorados
    - _Requirements: 2.2, 2.4_

  - [x]* 7.7 Write property test for event-to-client matching accuracy
    - **Property 3: Event-to-client matching accuracy**
    - Test that events are matched to correct clients and pre-fill corresponding slots
    - **Validates: Requirements 2.4, 10.5**

  - [x] 7.8 Wire import UI into the application
    - Add "Importar Projetos" and "Importar Eventos" buttons to the interface
    - Show import summary modal after each import
    - Display last import date/time for each type (DD/MM/AAAA HH:mm)
    - Show error modal when file is invalid with column list
    - Register import dates in Firebase metadata
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 2.7_

- [x] 8. Implement Export Module
  - [x] 8.1 Implement Excel export (`js/export.js`)
    - Implement `ExportService` class with `generateExcel(clients, filters)`
    - Generate .xlsx with SheetJS: header row + one row per visible client
    - Columns: nome, líder, fase, telefone, e-mail, cidade, estado, and for each of 4 slots: data, canal, ocorrência, retorno
    - Implement `getFileName()` returning "acompanhamento_YYYY-MM-DD.xlsx"
    - Respect active filters (export only filtered clients)
    - Show "Não há dados para exportar" if filter results are empty
    - Handle SheetJS errors with toast notification
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x]* 8.2 Write property test for export produces filtered data with all columns
    - **Property 10: Export produces filtered client data with all required columns**
    - Test that exported data contains exactly one row per filtered client with all specified columns
    - **Validates: Requirements 5.2, 5.3**

  - [x] 8.3 Wire export UI into the application
    - Add "Exportar para Excel" button to the client list actions area
    - Trigger download of generated .xlsx file
    - Show error toast on failure
    - _Requirements: 5.1, 5.6_

- [x] 9. Checkpoint - Import/Export functional
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Notification Service (Cloud Function)
  - [x] 10.1 Create Firebase Cloud Function for weekly email
    - Create `functions/package.json` with dependencies (firebase-functions, firebase-admin, nodemailer)
    - Create `functions/index.js` entry point
    - Implement `functions/weekly-email.js` with cron schedule `0 8 * * 1` (Monday 08:00 America/Sao_Paulo)
    - Read client data from RTDB
    - Calculate overdue follow-ups and follow-ups scheduled for current week (Mon-Fri)
    - Group by líder
    - Send email to implantacao@doit.com.br via Nodemailer
    - Include: overdue list (client, líder, days late), weekly schedule, progress ratio (X/Y)
    - Handle "no pending" case with confirmation email
    - Implement 3 retries with 10-minute intervals on failure
    - Log failures to Firebase console
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x]* 10.2 Write property test for email content correctness
    - **Property 11: Email content correctness**
    - Test that email lists all overdue clients grouped by leader, all weekly scheduled, and correct progress ratio
    - **Validates: Requirements 6.2, 6.3**

- [x] 11. Implement responsive layout and visual polish
  - [x] 11.1 Implement responsive layout and navigation (`css/styles.css`, `index.html`)
    - Implement sidebar navigation for screens > 1024px
    - Implement hamburger menu for screens ≤ 1024px
    - Implement horizontal scroll Kanban for screens ≤ 768px (one column at a time)
    - Ensure minimum 44x44px touch targets on mobile
    - Apply card shadows (max 4px blur) and padding (min 16px)
    - Apply consistent urgency colors: --bad (red), --warn (yellow), --ok (green)
    - Maintain --forest, --clay, --gold editorial palette
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 11.2 Implement connection status indicators and loading states
    - Show loading indicator while initial Firebase data loads
    - Show offline banner (yellow) after 5s without connection: "Modo offline — alterações serão sincronizadas"
    - Show green flash "Sincronizado" on reconnection
    - Show toast on conflict: "Sua alteração foi sobrescrita por [nome]"
    - Show CDN/SDK failure fallback banner
    - _Requirements: 1.3, 1.5, 1.6, 1.7, 9.5_

- [x] 12. Wire everything together in app.js
  - [x] 12.1 Implement application bootstrap (`js/app.js`)
    - Initialize FirebaseService with project config
    - Initialize StateManager with Firebase reference
    - Initialize AppRouter with route-to-view mapping
    - Initialize FilterEngine and restore session filters
    - Initialize DashboardView in header area
    - Start Firebase sync and connection monitoring
    - Register navigation tabs: "Por cliente", "Kanban", "Agenda de contatos"
    - Wire filter UI controls to FilterEngine and views
    - Handle initial route and render appropriate view
    - _Requirements: 1.1, 1.3, 3.1, 7.5, 9.2_

- [x] 13. Final checkpoint - Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses Vanilla JS with no build step — all modules loaded via `<script type="module">`
- Firebase SDK, SheetJS, and localForage loaded via CDN in index.html
- Cloud Functions (task 10) require separate deploy via `firebase deploy --only functions`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.2"] },
    { "id": 3, "tasks": ["2.3", "4.1"] },
    { "id": 4, "tasks": ["2.4", "2.5", "2.6", "2.7", "4.2", "4.3"] },
    { "id": 5, "tasks": ["5.1", "5.3", "5.4", "5.7"] },
    { "id": 6, "tasks": ["5.2", "5.5", "5.6", "7.1", "7.6"] },
    { "id": 7, "tasks": ["7.2", "7.3", "7.4", "7.5", "7.7", "7.8"] },
    { "id": 8, "tasks": ["8.1"] },
    { "id": 9, "tasks": ["8.2", "8.3", "10.1"] },
    { "id": 10, "tasks": ["10.2", "11.1", "11.2"] },
    { "id": 11, "tasks": ["12.1"] }
  ]
}
```
