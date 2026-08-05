/**
 * views/agenda.js — Calendar View (Google Agenda style)
 * Monthly calendar with navigation, showing follow-up events per day.
 * Respects filter-bar filters (leader, search, status).
 */

import { parseDate } from '../dates.js';
import { FilterEngine } from '../filters.js';
import { isTrackedStatus } from '../status.js';

export class AgendaView {
  constructor(container, stateManager) {
    this.container = container;
    this.stateManager = stateManager;
    this.filterEngine = new FilterEngine();
    this.currentDate = new Date();
    this._currentFilters = {};
    this._unsubscribe = null;
  }

  render(clients) {
    if (!clients || !Array.isArray(clients)) {
      clients = this.stateManager ? this.stateManager.getClients() : [];
    }
    // Apply current filters (leader, search, status)
    const filtered = this.filterEngine.applyFilters(clients, this._currentFilters);
    const events = this._extractEvents(filtered);
    this.container.innerHTML = this._buildCalendar(events);
    this._attachListeners();
  }

  onFilterChange(filters) {
    this._currentFilters = filters || {};
    this.render();
  }

  destroy() {
    this.container.innerHTML = '';
  }

  _extractEvents(clients) {
    const events = [];
    for (const client of clients) {
      if (client.nao_entrar_em_contato) continue;
      const datas = client.datas_previstas || [];
      const followUps = client.followUps || {};
      for (let i = 0; i < 4; i++) {
        const slot = followUps[i] || {};
        const dataPrevista = datas[i] || null;
        const dateStr = slot.data || dataPrevista;
        if (!dateStr) continue;
        const date = this._parseDate(dateStr);
        if (!date) continue;

        const ocorreu = slot.ocorreu === 'sim';

        // Label: if occurred, show client name. If future, show "Previsão Nº Acomp."
        const label = ocorreu
          ? this._truncate(client.nome || client.cliente || '', 18)
          : `Previsão ${i + 1}º - ${this._truncate(client.nome || '', 12)}`;

        events.push({
          date,
          dateStr,
          label,
          clientName: client.nome || client.cliente || '',
          clientId: client.id,
          slot: i + 1,
          ocorreu,
          lider: client.lider || '',
          detectado: !!slot.detectado_agenda
        });
      }
    }
    return events;
  }

  _parseDate(str) {
    return parseDate(str);
  }

  _buildCalendar(events) {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    // Group events by day
    const eventsByDay = {};
    for (const ev of events) {
      if (ev.date.getFullYear() === year && ev.date.getMonth() === month) {
        const day = ev.date.getDate();
        if (!eventsByDay[day]) eventsByDay[day] = [];
        eventsByDay[day].push(ev);
      }
    }

    let html = `
      <div class="calendar">
        <div class="calendar__header">
          <button class="calendar__nav" data-dir="prev">◀</button>
          <h2 class="calendar__title">${monthNames[month]} ${year}</h2>
          <button class="calendar__nav" data-dir="next">▶</button>
        </div>
        <div class="calendar__grid">
          <div class="calendar__weekday">Dom</div>
          <div class="calendar__weekday">Seg</div>
          <div class="calendar__weekday">Ter</div>
          <div class="calendar__weekday">Qua</div>
          <div class="calendar__weekday">Qui</div>
          <div class="calendar__weekday">Sex</div>
          <div class="calendar__weekday">Sáb</div>
    `;

    for (let i = 0; i < firstDay; i++) {
      html += '<div class="calendar__cell calendar__cell--empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = (day === today.getDate() && month === today.getMonth() && year === today.getFullYear());
      const dayEvents = eventsByDay[day] || [];
      const hasEvents = dayEvents.length > 0;
      const todayClass = isToday ? ' calendar__cell--today' : '';
      const eventClass = hasEvents ? ' calendar__cell--has-events' : '';

      let eventsHtml = '';
      for (const ev of dayEvents.slice(0, 3)) {
        const statusCls = ev.ocorreu ? 'event--done' : 'event--pending';
        const icon = ev.ocorreu ? '✓' : '○';
        eventsHtml += `<div class="calendar__event ${statusCls}" title="${ev.clientName} - ${ev.slot}º Acomp. (${ev.lider})">${icon} ${ev.label}</div>`;
      }
      if (dayEvents.length > 3) {
        eventsHtml += `<div class="calendar__event-more">+${dayEvents.length - 3} mais</div>`;
      }

      html += `
        <div class="calendar__cell${todayClass}${eventClass}" data-day="${day}">
          <span class="calendar__day-number">${day}</span>
          <div class="calendar__events">${eventsHtml}</div>
        </div>
      `;
    }

    html += '</div></div>';
    return html;
  }

  _truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '…' : str;
  }

  _attachListeners() {
    const prevBtn = this.container.querySelector('[data-dir="prev"]');
    const nextBtn = this.container.querySelector('[data-dir="next"]');
    if (prevBtn) prevBtn.addEventListener('click', () => this._navigate(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => this._navigate(1));
  }

  _navigate(direction) {
    this.currentDate.setMonth(this.currentDate.getMonth() + direction);
    this.render();
  }
}
