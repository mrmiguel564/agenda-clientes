// Panel admin: agenda, horario (por defecto + días especiales), mascotas y ajustes.
(function () {
  const { api, esc, $, $$, icon, toast, openSheet, ESPECIE_ICON, DIAS, MESES_CORTO, parseDate, todayStr, fmtDate, fmtDateTime } = window.App;
  const Rut = window.Rut;
  const view = $('#view');

  const STATUS = {
    pending: ['Pendiente', 'tag-warn'],
    confirmed: ['Confirmada', 'tag-info'],
    done: ['Atendida', 'tag-ok'],
    no_show: ['No asistió', 'tag-danger'],
    cancelled: ['Cancelada', 'tag-danger'],
    expired: ['Vencida', 'tag-danger'],
  };
  const VESTADO = {
    agendada: ['Agendada', 'tag-info'],
    atendida: ['Atendida', 'tag-ok'],
    no_asistio: ['No asistió', 'tag-danger'],
    cancelada: ['Cancelada', 'tag-danger'],
  };
  const SETTINGS_LABELS = [
    ['max_days_ahead', 'Días hacia adelante para reservar'],
    ['min_notice_min', 'Anticipación mínima (minutos)'],
    ['slot_step_min', 'Intervalo entre horas (min, 0 = duración)'],
    ['max_future_per_rut', 'Máx. horas futuras por RUT'],
    ['max_per_day_per_rut', 'Máx. horas por día por RUT'],
    ['max_future_per_device', 'Máx. horas futuras por dispositivo'],
    ['strikes_to_block', 'Inasistencias para bloquear'],
  ];

  const S = { tab: 'agenda', date: todayStr(), mode: 'day', tutorId: null, q: '', weekly: null };
  const tag = (map, k) => {
    const [l, c] = map[k] || [k, ''];
    return `<span class="tag ${c}">${esc(l)}</span>`;
  };
  const toStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (str, n) => {
    const d = parseDate(str);
    d.setDate(d.getDate() + n);
    return toStr(d);
  };
  const mondayOf = (str) => addDays(str, -((parseDate(str).getDay() + 6) % 7));
  const loading = () => '<div class="bk-loading"><span class="spinner"></span>Cargando…</div>';
  const fmtRut = (r) => (r && !r.startsWith('ANON') ? Rut.format(r) : r);

  async function A(url, opts) {
    try {
      return await api(url, opts);
    } catch (e) {
      if (e.status === 401) showLogin();
      throw e;
    }
  }

  // ---------- Sesión ----------
  async function boot() {
    let s;
    try {
      s = await api('/api/admin/session');
    } catch (e) {
      toast(e.message, true);
      return;
    }
    $('#login-name').textContent = s.negocio.nombre;
    $('#side-name').textContent = s.negocio.nombre;
    document.title = `Panel · ${s.negocio.nombre}`;
    if (s.admin) showShell();
    else showLogin();
  }

  function showLogin() {
    $('#shell').classList.add('hidden');
    $('#login').classList.remove('hidden');
    $('#l-email').focus();
  }

  function showShell() {
    $('#login').classList.add('hidden');
    $('#shell').classList.remove('hidden');
    const t = location.hash.replace('#', '');
    setTab(['agenda', 'horario', 'mascotas', 'ajustes'].includes(t) ? t : 'agenda');
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    err.textContent = '';
    try {
      await api('/api/admin/login', { method: 'POST', body: { email: $('#l-email').value, password: $('#l-pass').value } });
      $('#l-pass').value = '';
      showShell();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  $$('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  window.addEventListener('hashchange', () => {
    const t = location.hash.replace('#', '');
    if (t !== S.tab && ['agenda', 'horario', 'mascotas', 'ajustes'].includes(t) && !$('#shell').classList.contains('hidden')) setTab(t);
  });

  function setTab(t) {
    S.tab = t;
    history.replaceState(null, '', '#' + t);
    $$('.tabs [data-tab]').forEach((b) => (b.dataset.tab === t ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    view.onclick = null;
    view.oninput = null;
    window.scrollTo(0, 0);
    ({ agenda: renderAgenda, horario: renderHorario, mascotas: renderMascotas, ajustes: renderAjustes })[t]();
  }

  // ---------- Agenda ----------
  async function renderAgenda() {
    const from = S.mode === 'day' ? S.date : mondayOf(S.date);
    const to = S.mode === 'day' ? S.date : addDays(from, 6);
    const label = S.mode === 'day' ? fmtDate(S.date) : `${fmtDate(from)} – ${fmtDate(to)}`;
    view.innerHTML = `<div class="view-head"><h1>Agenda</h1><span id="ag-status"></span></div>
      <div class="toolbar">
        <button class="btn-icon" type="button" data-act="prev" aria-label="Anterior">${icon('chevron-left')}</button>
        <span class="date-label">${esc(label)}</span>
        <button class="btn-icon" type="button" data-act="next" aria-label="Siguiente">${icon('chevron-right')}</button>
        <button class="btn btn-soft btn-sm" type="button" data-act="today">Hoy</button>
        <div class="seg" role="group" aria-label="Vista">
          <button type="button" data-mode="day" aria-pressed="${S.mode === 'day'}">Día</button>
          <button type="button" data-mode="week" aria-pressed="${S.mode === 'week'}">Semana</button>
        </div>
      </div>
      <div id="ag-list">${loading()}</div>`;

    view.onclick = async (e) => {
      const act = e.target.closest('[data-act]');
      const mode = e.target.closest('[data-mode]');
      const item = e.target.closest('[data-booking]');
      if (mode) {
        S.mode = mode.dataset.mode;
        return renderAgenda();
      }
      if (item) return bookingSheet(Number(item.dataset.booking));
      if (!act) return;
      const step = S.mode === 'day' ? 1 : 7;
      if (act.dataset.act === 'prev') S.date = addDays(S.date, -step);
      if (act.dataset.act === 'next') S.date = addDays(S.date, step);
      if (act.dataset.act === 'today') S.date = todayStr();
      if (act.dataset.act === 'toggle-agenda') return toggleAgenda();
      renderAgenda();
    };

    let settings;
    let data;
    try {
      [settings, data] = await Promise.all([A('/api/admin/settings'), A(`/api/admin/bookings?from=${from}&to=${to}`)]);
    } catch (e) {
      $('#ag-list').innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
      return;
    }
    S.bookings = data.bookings;
    $('#ag-status').innerHTML = `<button type="button" class="tag ${settings.agenda_open ? 'tag-ok' : 'tag-danger'}" data-act="toggle-agenda" style="border:0;cursor:pointer">
      ${icon(settings.agenda_open ? 'lock-open' : 'lock')}${settings.agenda_open ? 'Agenda abierta' : 'Agenda cerrada'}</button>`;

    const active = data.bookings.filter((b) => b.status !== 'cancelled');
    const days = S.mode === 'day' ? [from] : Array.from({ length: 7 }, (_, i) => addDays(from, i));
    const html = days
      .map((d) => {
        const list = data.bookings.filter((b) => toStr(new Date(b.start_at)) === d);
        const items = list.length
          ? `<div class="items">${list.map(itemHtml).join('')}</div>`
          : S.mode === 'day'
            ? `<div class="empty">${icon('calendar-smile')}Sin horas agendadas este día.</div>`
            : '<p class="muted small">Sin horas.</p>';
        return (S.mode === 'week' ? `<div class="day-title">${esc(fmtDate(d))}</div>` : '') + items;
      })
      .join('');
    $('#ag-list').innerHTML = `<p class="muted small">${active.length} hora(s) activas · ${active.filter((b) => b.status === 'done').length} atendida(s)</p>${html}`;
  }

  function itemHtml(b) {
    const t = fmtDateTime(b.start_at);
    const off = ['cancelled', 'no_show'].includes(b.status);
    return `<button type="button" class="item ${off ? 'is-off' : ''}" data-booking="${b.id}">
      <span class="time">${esc(t.hora)}</span>
      <span class="grow"><span class="title">${icon(ESPECIE_ICON[b.especie] || 'paw')} ${esc(b.mascota)} · ${esc(b.servicio)}</span><span class="sub" style="display:block">${esc(b.tutor)} · ${esc(b.telefono || b.email)}</span></span>
      ${tag(STATUS, b.status)}
    </button>`;
  }

  async function toggleAgenda() {
    try {
      const s = await A('/api/admin/settings');
      const open = !s.agenda_open;
      if (!open && !confirm('¿Cerrar la agenda en línea? Nadie podrá reservar hasta que la abras.')) return;
      await A('/api/admin/settings', { method: 'PUT', body: { agenda_open: open } });
      toast(open ? 'Agenda abierta' : 'Agenda cerrada');
      renderAgenda();
    } catch (e) {
      toast(e.message, true);
    }
  }

  function bookingSheet(id) {
    const b = S.bookings.find((x) => x.id === id);
    if (!b) return;
    const t = fmtDateTime(b.start_at);
    const activa = ['pending', 'confirmed'].includes(b.status);
    const canVisit = activa || b.status === 'done';
    const tel = (b.telefono || '').replace(/[^\d+]/g, '');
    const sheet = openSheet(
      `<div class="sheet-head"><h2>${esc(t.hora)} · ${esc(b.mascota)}</h2><button class="btn-icon" type="button" data-close aria-label="Cerrar">${icon('x')}</button></div>
      <dl class="kv">
        <dt>Fecha</dt><dd>${esc(t.fecha)}</dd>
        <dt>Servicio</dt><dd>${esc(b.servicio)}</dd>
        <dt>Estado</dt><dd>${tag(STATUS, b.status)}</dd>
        <dt>Tutor</dt><dd>${esc(b.tutor)}${b.blocked ? ' <span class="tag tag-danger">Bloqueado</span>' : ''}</dd>
        <dt>RUT</dt><dd>${esc(fmtRut(b.rut))}</dd>
        <dt>Teléfono</dt><dd>${tel ? `<a href="tel:${esc(tel)}">${esc(b.telefono)}</a> · <a href="https://wa.me/${esc(tel.replace('+', ''))}" target="_blank" rel="noopener">WhatsApp</a>` : '—'}</dd>
        <dt>Correo</dt><dd>${esc(b.email)}</dd>
        ${b.motivo ? `<dt>Motivo</dt><dd>${esc(b.motivo)}</dd>` : ''}
        ${b.strikes ? `<dt>Inasistencias</dt><dd>${b.strikes}</dd>` : ''}
      </dl>
      ${
        canVisit
          ? `<div class="panel" style="padding:12px">
              <div class="field"><label for="v-peso">Peso (kg)</label><input id="v-peso" inputmode="decimal" placeholder="Ej: 12,4" value="${esc(b.peso_kg || '')}"></div>
              <div class="field"><label for="v-obs">Observaciones</label><textarea id="v-obs" maxlength="2000" placeholder="Diagnóstico, indicaciones, próximos controles…">${esc(b.observaciones || '')}</textarea></div>
              <button class="btn btn-block" type="button" data-do="done">${icon('check')}${b.status === 'done' ? 'Guardar cambios' : 'Guardar y marcar atendida'}</button>
            </div>`
          : ''
      }
      <div class="actions-col">
        ${b.status === 'pending' ? `<button class="btn btn-soft" type="button" data-do="confirmed">${icon('circle-check')}Confirmar</button>` : ''}
        ${activa ? `<button class="btn btn-soft" type="button" data-do="no_show">${icon('user-x')}No asistió</button>` : ''}
        ${activa ? `<button class="btn btn-danger" type="button" data-do="cancelled">${icon('x')}Cancelar hora (avisa al tutor)</button>` : ''}
        <button class="btn btn-ghost" type="button" data-do="ficha">${icon('paw')}Ver ficha de ${esc(b.mascota)}</button>
      </div>`,
      { label: 'Detalle de la hora' }
    );
    sheet.el.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-do]');
      if (!btn) return;
      const action = btn.dataset.do;
      if (action === 'ficha') {
        sheet.close();
        S.tutorId = b.tutor_id;
        return setTab('mascotas');
      }
      if (action === 'cancelled' && !confirm('¿Cancelar esta hora? Se enviará un correo al tutor.')) return;
      if (action === 'no_show' && !confirm('¿Marcar como inasistencia? Suma una inasistencia al tutor.')) return;
      const body = { status: action };
      if (action === 'done') {
        body.peso_kg = $('#v-peso', sheet.el).value.trim();
        body.observaciones = $('#v-obs', sheet.el).value;
      }
      btn.disabled = true;
      try {
        if (action === 'done' && b.status === 'done' && b.visita_id) {
          await A(`/api/admin/visitas/${b.visita_id}`, { method: 'PATCH', body: { peso_kg: body.peso_kg, observaciones: body.observaciones } });
        } else {
          await A(`/api/admin/bookings/${b.id}`, { method: 'PATCH', body });
        }
        sheet.close();
        toast('Guardado');
        renderAgenda();
      } catch (ex) {
        toast(ex.message, true);
        btn.disabled = false;
      }
    });
  }

  // ---------- Horario ----------
  async function renderHorario() {
    view.innerHTML = `<div class="view-head"><h1>Horario</h1></div>
      <div class="panel"><h2>Horario por defecto <button class="btn btn-sm" type="button" data-act="save-weekly">${icon('device-floppy')}Guardar</button></h2>
        <p class="muted small">Se repite cada semana. Un día sin rangos queda cerrado.</p><div id="weekly">${loading()}</div></div>
      <div class="panel"><h2>Días especiales <button class="btn btn-sm" type="button" data-act="new-override">${icon('plus')}Día especial</button></h2>
        <p class="muted small">Cambian el horario solo en esas fechas: cerrar un día o salir más temprano.</p><div id="overrides">${loading()}</div></div>`;

    view.onclick = async (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const wd = Number(a.dataset.wd);
      if (a.dataset.act === 'add-range') {
        const last = S.weekly[wd][S.weekly[wd].length - 1];
        S.weekly[wd].push(last ? { start: last.end, end: last.end < '18:00' ? '18:00' : '20:00' } : { start: '09:00', end: '18:00' });
        renderWeekly();
      }
      if (a.dataset.act === 'del-range') {
        S.weekly[wd].splice(Number(a.dataset.i), 1);
        renderWeekly();
      }
      if (a.dataset.act === 'save-weekly') saveWeekly(a);
      if (a.dataset.act === 'new-override') overrideSheet();
      if (a.dataset.act === 'del-override') {
        if (!confirm('¿Eliminar este día especial? Vuelve a regir el horario por defecto.')) return;
        try {
          await A(`/api/admin/overrides/${a.dataset.id}`, { method: 'DELETE' });
          toast('Día especial eliminado');
          loadOverrides();
        } catch (ex) {
          toast(ex.message, true);
        }
      }
    };
    view.oninput = (e) => {
      const el = e.target;
      if (el.dataset.k) S.weekly[Number(el.dataset.wd)][Number(el.dataset.i)][el.dataset.k] = el.value;
    };

    try {
      const { items } = await A('/api/admin/schedule');
      S.weekly = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
      items.forEach((it) => S.weekly[it.weekday].push({ start: it.start, end: it.end }));
      renderWeekly();
    } catch (e) {
      $('#weekly').innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
    }
    loadOverrides();
  }

  function renderWeekly() {
    $('#weekly').innerHTML = [1, 2, 3, 4, 5, 6, 0]
      .map((wd) => {
        const ranges = S.weekly[wd]
          .map(
            (r, i) => `<div class="range">
              <input type="time" step="900" value="${esc(r.start)}" data-wd="${wd}" data-i="${i}" data-k="start" aria-label="Desde">
              <span class="sep">a</span>
              <input type="time" step="900" value="${esc(r.end)}" data-wd="${wd}" data-i="${i}" data-k="end" aria-label="Hasta">
              <button class="btn-icon" type="button" data-act="del-range" data-wd="${wd}" data-i="${i}" aria-label="Quitar rango">${icon('trash')}</button>
            </div>`
          )
          .join('');
        return `<div class="week-row"><div class="wd">${DIAS[wd]}</div><div class="ranges">
          ${ranges || '<span class="muted" style="padding-top:10px">Cerrado</span>'}
          <div><button class="btn btn-soft btn-sm" type="button" data-act="add-range" data-wd="${wd}">${icon('plus')}Rango</button></div>
        </div></div>`;
      })
      .join('');
  }

  async function saveWeekly(btn) {
    const items = [];
    for (const wd of Object.keys(S.weekly)) {
      for (const r of S.weekly[wd]) {
        if (!r.start || !r.end || r.end <= r.start) return toast(`Revisa el horario del ${DIAS[wd]}: la hora de término debe ser mayor.`, true);
        items.push({ weekday: Number(wd), start: r.start, end: r.end });
      }
    }
    btn.disabled = true;
    try {
      await A('/api/admin/schedule', { method: 'PUT', body: { items } });
      toast('Horario guardado');
    } catch (e) {
      toast(e.message, true);
    }
    btn.disabled = false;
  }

  async function loadOverrides() {
    try {
      const { items } = await A('/api/admin/overrides');
      $('#overrides').innerHTML = items.length
        ? `<div class="items">${items
            .map((o) => {
              const when = o.date_from === o.date_to ? fmtDate(o.date_from) : `${fmtDate(o.date_from)} → ${fmtDate(o.date_to)}`;
              const what = o.closed ? '<span class="tag tag-danger">Cerrado</span>' : `<span class="tag">${o.ranges.map((r) => `${r.start}–${r.end}`).join(' · ')}</span>`;
              return `<div class="item" style="cursor:default"><span class="grow"><span class="title">${esc(when)}</span>${o.nota ? `<span class="sub" style="display:block">${esc(o.nota)}</span>` : ''}</span>${what}
                <button class="btn-icon" type="button" data-act="del-override" data-id="${o.id}" aria-label="Eliminar">${icon('trash')}</button></div>`;
            })
            .join('')}</div>`
        : `<div class="empty">${icon('calendar-event')}No hay días especiales próximos.</div>`;
    } catch (e) {
      $('#overrides').innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
    }
  }

  function overrideSheet() {
    const today = todayStr();
    const sheet = openSheet(
      `<div class="sheet-head"><h2>Día especial</h2><button class="btn-icon" type="button" data-close aria-label="Cerrar">${icon('x')}</button></div>
      <div class="grid-2">
        <div class="field"><label for="o-from">Desde</label><input id="o-from" type="date" min="${today}" value="${today}"></div>
        <div class="field"><label for="o-to">Hasta</label><input id="o-to" type="date" min="${today}" value="${today}"></div>
      </div>
      <div class="field"><label>Ese día</label><div class="seg" role="group">
        <button type="button" data-kind="closed" aria-pressed="false">Cerrado</button>
        <button type="button" data-kind="custom" aria-pressed="true">Horario propio</button></div></div>
      <div id="o-ranges">
        <div class="range" style="margin-bottom:8px"><input type="time" step="900" id="o-s1" value="08:00" aria-label="Desde"><span class="sep">a</span><input type="time" step="900" id="o-e1" value="14:00" aria-label="Hasta"></div>
        <details class="more"><summary>Agregar un segundo rango</summary>
          <div class="range"><input type="time" step="900" id="o-s2" aria-label="Desde"><span class="sep">a</span><input type="time" step="900" id="o-e2" aria-label="Hasta"></div>
        </details>
      </div>
      <div class="field"><label for="o-nota">Nota (opcional)</label><input id="o-nota" maxlength="200" placeholder="Ej: salgo temprano, feriado"></div>
      <p class="form-error" id="o-err" role="alert"></p>
      <button class="btn btn-block" type="button" data-save>${icon('device-floppy')}Guardar</button>`,
      { label: 'Nuevo día especial' }
    );
    let closed = false;
    const el = sheet.el;
    $('#o-from', el).addEventListener('change', () => {
      if ($('#o-to', el).value < $('#o-from', el).value) $('#o-to', el).value = $('#o-from', el).value;
    });
    el.addEventListener('click', async (e) => {
      const k = e.target.closest('[data-kind]');
      if (k) {
        closed = k.dataset.kind === 'closed';
        $$('[data-kind]', el).forEach((b) => b.setAttribute('aria-pressed', String(b === k)));
        $('#o-ranges', el).classList.toggle('hidden', closed);
        return;
      }
      if (!e.target.closest('[data-save]')) return;
      const ranges = [];
      if (!closed) {
        ranges.push({ start: $('#o-s1', el).value, end: $('#o-e1', el).value });
        if ($('#o-s2', el).value && $('#o-e2', el).value) ranges.push({ start: $('#o-s2', el).value, end: $('#o-e2', el).value });
      }
      try {
        const r = await A('/api/admin/overrides', {
          method: 'POST',
          body: { date_from: $('#o-from', el).value, date_to: $('#o-to', el).value, closed, ranges, nota: $('#o-nota', el).value },
        });
        sheet.close();
        loadOverrides();
        if (r.affected.length) affectedSheet(r.affected);
        else toast('Día especial guardado');
      } catch (ex) {
        $('#o-err', el).textContent = ex.message;
      }
    });
  }

  function affectedSheet(list) {
    openSheet(
      `<div class="sheet-head"><h2>Revisa estas horas</h2><button class="btn-icon" type="button" data-close aria-label="Cerrar">${icon('x')}</button></div>
      <div class="warn-box">${icon('alert-triangle')} El día especial se guardó, pero ${list.length} hora(s) ya agendada(s) quedan fuera del nuevo horario. Avisa al tutor o cancélalas desde la agenda.</div>
      <div class="items">${list
        .map((b) => {
          const t = fmtDateTime(b.start_at);
          return `<div class="item" style="cursor:default"><span class="time">${esc(t.hora)}</span><span class="grow"><span class="title">${esc(b.mascota)}</span><span class="sub" style="display:block">${esc(t.fecha)} · ${esc(b.tutor)}</span></span></div>`;
        })
        .join('')}</div>`,
      { label: 'Horas afectadas' }
    );
  }

  // ---------- Mascotas ----------
  let searchTimer;
  function renderMascotas() {
    if (S.tutorId) return renderFicha(S.tutorId);
    view.innerHTML = `<div class="view-head"><h1>Tutores y mascotas</h1></div>
      <div class="search">${icon('search')}<input class="input" id="q" type="search" placeholder="RUT, nombre del tutor o de la mascota" value="${esc(S.q)}" autocomplete="off"></div>
      <div id="results"></div>`;
    const q = $('#q');
    q.focus();
    view.oninput = (e) => {
      if (e.target !== q) return;
      S.q = q.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(search, 300);
    };
    view.onclick = (e) => {
      const t = e.target.closest('[data-tutor]');
      if (t) {
        S.tutorId = Number(t.dataset.tutor);
        renderFicha(S.tutorId);
      }
    };
    search();
  }

  async function search() {
    const box = $('#results');
    if (!box) return;
    if (S.q.trim().length < 2) {
      box.innerHTML = `<div class="empty">${icon('paw')}Busca por RUT, nombre del tutor o nombre de la mascota.</div>`;
      return;
    }
    box.innerHTML = loading();
    try {
      const { items } = await A(`/api/admin/tutores?q=${encodeURIComponent(S.q.trim())}`);
      box.innerHTML = items.length
        ? `<div class="items">${items
            .map(
              (t) => `<button type="button" class="item" data-tutor="${t.id}"><span class="grow"><span class="title">${esc(t.nombre)}${t.blocked ? ' <span class="tag tag-danger">Bloqueado</span>' : ''}</span>
                <span class="sub" style="display:block">${esc(fmtRut(t.rut))} · ${t.mascotas.map((m) => esc(m.nombre)).join(', ') || 'sin mascotas'}</span></span>${icon('chevron-right')}</button>`
            )
            .join('')}</div>`
        : `<div class="empty">${icon('mood-empty')}Sin resultados.</div>`;
    } catch (e) {
      box.innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
    }
  }

  async function renderFicha(id) {
    view.innerHTML = loading();
    let data;
    try {
      data = await A(`/api/admin/tutores/${id}`);
    } catch (e) {
      S.tutorId = null;
      view.innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
      return;
    }
    const t = data.tutor;
    const pets = data.mascotas
      .map((m) => {
        const visitas = m.visitas.length
          ? m.visitas
              .map((v) => {
                const d = fmtDateTime(v.fecha);
                return `<button type="button" class="visit" data-visita="${v.id}" data-mascota="${m.id}"><span><strong>${esc(d.fecha)} · ${esc(v.servicio)}</strong>
                  <span class="sub" style="display:block">${v.peso_kg ? esc(String(v.peso_kg).replace('.', ',')) + ' kg · ' : ''}${esc(v.observaciones || 'Sin observaciones')}</span></span>${tag(VESTADO, v.estado)}</button>`;
              })
              .join('')
          : '<p class="muted small">Sin visitas registradas.</p>';
        const extra = [m.raza, m.edad_aprox, m.sexo].filter(Boolean).map(esc).join(' · ');
        return `<div class="panel">
          <h2><span>${icon(ESPECIE_ICON[m.especie] || 'paw')} ${esc(m.nombre)} ${m.activo ? '' : '<span class="tag tag-warn">Inactiva</span>'}</span>
            <button class="btn btn-soft btn-sm" type="button" data-edit-pet="${m.id}">${icon('edit')}Editar</button></h2>
          <p class="muted small">${esc(m.especie)}${extra ? ' · ' + extra : ''}${m.notas ? ' · ' + esc(m.notas) : ''}</p>
          <div class="day-title" style="margin-top:4px">Registro de visitas</div>${visitas}
        </div>`;
      })
      .join('');

    view.innerHTML = `<div class="view-head"><button class="btn btn-ghost btn-sm" type="button" data-act="back">${icon('arrow-left')}Buscar</button></div>
      <div class="view-head"><h1>${esc(t.nombre)}</h1>${t.blocked ? '<span class="tag tag-danger">Bloqueado</span>' : ''}</div>
      <div class="panel">
        <dl class="kv">
          <dt>RUT</dt><dd>${esc(fmtRut(t.rut))}</dd>
          <dt>Correo</dt><dd>${esc(t.email || '—')}</dd>
          <dt>Teléfono</dt><dd>${esc(t.telefono || '—')}</dd>
          <dt>Inasistencias</dt><dd>${t.strikes}</dd>
          <dt>Consentimiento</dt><dd>${t.consent_at ? esc(fmtDateTime(t.consent_at).fecha) : '—'}</dd>
        </dl>
        <div class="actions">
          <button class="btn btn-soft btn-sm" type="button" data-act="edit-tutor">${icon('edit')}Editar contacto</button>
          ${t.blocked || t.strikes ? `<button class="btn btn-soft btn-sm" type="button" data-act="unblock">${icon('lock-open')}Desbloquear y reiniciar</button>` : `<button class="btn btn-soft btn-sm" type="button" data-act="block">${icon('lock')}Bloquear</button>`}
          <a class="btn btn-soft btn-sm" href="/api/admin/tutores/${t.id}/export" download>${icon('download')}Exportar datos</a>
          <button class="btn btn-danger btn-sm" type="button" data-act="anonymize">${icon('user-off')}Anonimizar</button>
          <button class="btn btn-danger btn-sm" type="button" data-act="delete">${icon('trash')}Eliminar</button>
        </div>
      </div>
      ${pets || '<p class="muted">Sin mascotas.</p>'}`;

    view.oninput = null;
    view.onclick = async (e) => {
      const a = e.target.closest('[data-act]');
      const v = e.target.closest('[data-visita]');
      const p = e.target.closest('[data-edit-pet]');
      if (v) {
        const m = data.mascotas.find((x) => x.id === Number(v.dataset.mascota));
        return visitaSheet(m.visitas.find((x) => x.id === Number(v.dataset.visita)), () => renderFicha(id));
      }
      if (p) return petSheet(data.mascotas.find((x) => x.id === Number(p.dataset.editPet)), () => renderFicha(id));
      if (!a) return;
      const act = a.dataset.act;
      try {
        if (act === 'back') {
          S.tutorId = null;
          return renderMascotas();
        }
        if (act === 'edit-tutor') return tutorSheet(t, () => renderFicha(id));
        if (act === 'unblock') await A(`/api/admin/tutores/${id}`, { method: 'PATCH', body: { blocked: false, strikes: 0 } });
        if (act === 'block') await A(`/api/admin/tutores/${id}`, { method: 'PATCH', body: { blocked: true } });
        if (act === 'anonymize') {
          if (!confirm('¿Anonimizar a este tutor? Se borran sus datos de contacto, se cancelan sus horas futuras y se conserva el historial de las mascotas. No se puede deshacer.')) return;
          await A(`/api/admin/tutores/${id}/anonymize`, { method: 'POST' });
          toast('Tutor anonimizado');
          S.tutorId = null;
          return renderMascotas();
        }
        if (act === 'delete') {
          if (!confirm('¿Eliminar al tutor, sus mascotas, horas y visitas? No se puede deshacer.')) return;
          await A(`/api/admin/tutores/${id}`, { method: 'DELETE' });
          toast('Tutor eliminado');
          S.tutorId = null;
          return renderMascotas();
        }
        toast('Guardado');
        renderFicha(id);
      } catch (ex) {
        toast(ex.message, true);
      }
    };
  }

  function formSheet(title, fieldsHtml, onSave) {
    const sheet = openSheet(
      `<div class="sheet-head"><h2>${esc(title)}</h2><button class="btn-icon" type="button" data-close aria-label="Cerrar">${icon('x')}</button></div>
      ${fieldsHtml}<p class="form-error" data-err role="alert"></p>
      <button class="btn btn-block" type="button" data-save>${icon('device-floppy')}Guardar</button>`,
      { label: title }
    );
    const btn = sheet.el.querySelector('[data-save]');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await onSave(sheet.el);
        sheet.close();
        toast('Guardado');
      } catch (ex) {
        sheet.el.querySelector('[data-err]').textContent = ex.message;
        btn.disabled = false;
      }
    });
    return sheet;
  }

  const val = (el, id) => $(id, el).value;

  function visitaSheet(v, done) {
    formSheet(
      `Visita · ${fmtDateTime(v.fecha).fecha}`,
      `<p class="muted">${esc(v.servicio)} · ${tag(VESTADO, v.estado)}</p>
       <div class="field"><label for="f-peso">Peso (kg)</label><input id="f-peso" inputmode="decimal" value="${esc(v.peso_kg ? String(v.peso_kg).replace('.', ',') : '')}"></div>
       <div class="field"><label for="f-obs">Observaciones</label><textarea id="f-obs" maxlength="2000">${esc(v.observaciones || '')}</textarea></div>`,
      async (el) => {
        await A(`/api/admin/visitas/${v.id}`, { method: 'PATCH', body: { peso_kg: val(el, '#f-peso'), observaciones: val(el, '#f-obs') } });
        done();
      }
    );
  }

  function petSheet(m, done) {
    const opts = (App.especies || [
      ['perro', 'Perro'],
      ['gato', 'Gato'],
      ['exotico', 'Exótico'],
      ['otro', 'Otro'],
    ])
      .map(([id, l]) => `<option value="${id}" ${m.especie === id ? 'selected' : ''}>${l}</option>`)
      .join('');
    formSheet(
      `Editar ${m.nombre}`,
      `<div class="field"><label for="p-nombre">Nombre</label><input id="p-nombre" maxlength="40" value="${esc(m.nombre)}"></div>
       <div class="grid-2">
         <div class="field"><label for="p-especie">Especie</label><select id="p-especie">${opts}</select></div>
         <div class="field"><label for="p-raza">Raza</label><input id="p-raza" maxlength="40" value="${esc(m.raza || '')}"></div>
         <div class="field"><label for="p-sexo">Sexo</label><input id="p-sexo" maxlength="40" value="${esc(m.sexo || '')}"></div>
         <div class="field"><label for="p-edad">Edad aprox.</label><input id="p-edad" maxlength="20" value="${esc(m.edad_aprox || '')}"></div>
       </div>
       <div class="field"><label for="p-notas">Notas (alergias, carácter…)</label><textarea id="p-notas" maxlength="1000">${esc(m.notas || '')}</textarea></div>
       <label class="check"><input type="checkbox" id="p-activo" ${m.activo ? 'checked' : ''}><span>Activa (aparece al agendar)</span></label>`,
      async (el) => {
        await A(`/api/admin/mascotas/${m.id}`, {
          method: 'PATCH',
          body: {
            nombre: val(el, '#p-nombre'),
            especie: val(el, '#p-especie'),
            raza: val(el, '#p-raza'),
            sexo: val(el, '#p-sexo'),
            edad_aprox: val(el, '#p-edad'),
            notas: val(el, '#p-notas'),
            activo: $('#p-activo', el).checked,
          },
        });
        done();
      }
    );
  }

  function tutorSheet(t, done) {
    formSheet(
      'Editar contacto',
      `<div class="field"><label for="t-nombre">Nombre</label><input id="t-nombre" maxlength="80" value="${esc(t.nombre)}"></div>
       <div class="field"><label for="t-email">Correo</label><input id="t-email" type="email" inputmode="email" value="${esc(t.email)}"></div>
       <div class="field"><label for="t-tel">Teléfono</label><input id="t-tel" type="tel" inputmode="tel" value="${esc(t.telefono || '')}"></div>`,
      async (el) => {
        await A(`/api/admin/tutores/${t.id}`, { method: 'PATCH', body: { nombre: val(el, '#t-nombre'), email: val(el, '#t-email'), telefono: val(el, '#t-tel') } });
        done();
      }
    );
  }

  // ---------- Ajustes ----------
  async function renderAjustes() {
    view.innerHTML = loading();
    let settings;
    let services;
    try {
      [settings, { items: services }] = await Promise.all([A('/api/admin/settings'), A('/api/admin/services')]);
    } catch (e) {
      view.innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
      return;
    }
    const today = todayStr();
    view.innerHTML = `<div class="view-head"><h1>Ajustes</h1></div>
      <div class="panel"><div class="switch-row">
        <div><strong>Recibir reservas en línea</strong><div class="muted small">Si la apagas, la página muestra la agenda como cerrada.</div></div>
        <label class="switch"><input type="checkbox" id="s-open" ${settings.agenda_open ? 'checked' : ''} aria-label="Agenda abierta"><span></span></label>
      </div></div>
      <div class="panel"><h2>Reglas de la agenda</h2><div class="grid-2">
        ${SETTINGS_LABELS.map(([k, l]) => `<div class="field"><label for="s-${k}">${esc(l)}</label><input id="s-${k}" data-setting="${k}" type="number" inputmode="numeric" min="0" value="${esc(settings[k])}"></div>`).join('')}
      </div><button class="btn" type="button" data-act="save-settings">${icon('device-floppy')}Guardar reglas</button></div>
      <div class="panel"><h2>Servicios <button class="btn btn-sm" type="button" data-act="new-service">${icon('plus')}Servicio</button></h2>
        <div class="items">${services
          .map(
            (s) => `<button type="button" class="item ${s.activo ? '' : 'is-off'}" data-service="${s.id}"><span class="icon-bubble">${icon(s.icono || 'paw')}</span>
            <span class="grow"><span class="title">${esc(s.nombre)}</span><span class="sub" style="display:block">${s.duracion_min} min${s.buffer_min ? ` + ${s.buffer_min} min de margen` : ''}</span></span>
            ${s.activo ? '' : '<span class="tag tag-warn">Oculto</span>'}</button>`
          )
          .join('')}</div></div>
      <div class="panel"><h2>Exportar visitas (CSV)</h2><div class="grid-2">
        <div class="field"><label for="x-from">Desde</label><input id="x-from" type="date" value="${addDays(today, -30)}"></div>
        <div class="field"><label for="x-to">Hasta</label><input id="x-to" type="date" value="${today}"></div>
      </div><a class="btn btn-soft" id="x-link" href="#" download>${icon('download')}Descargar CSV</a></div>
      <div class="panel"><button class="btn btn-ghost" type="button" data-act="logout">${icon('logout')}Cerrar sesión</button></div>`;

    const updLink = () => ($('#x-link').href = `/api/admin/visitas.csv?from=${val(view, '#x-from')}&to=${val(view, '#x-to')}`);
    updLink();
    view.oninput = (e) => {
      if (e.target.id === 'x-from' || e.target.id === 'x-to') updLink();
    };
    $('#s-open').addEventListener('change', async (e) => {
      try {
        await A('/api/admin/settings', { method: 'PUT', body: { agenda_open: e.target.checked } });
        toast(e.target.checked ? 'Agenda abierta' : 'Agenda cerrada');
      } catch (ex) {
        toast(ex.message, true);
        e.target.checked = !e.target.checked;
      }
    });
    view.onclick = async (e) => {
      const svc = e.target.closest('[data-service]');
      if (svc) return serviceSheet(services.find((s) => s.id === Number(svc.dataset.service)));
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'new-service') return serviceSheet(null);
      if (a.dataset.act === 'logout') {
        await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
        return showLogin();
      }
      if (a.dataset.act === 'save-settings') {
        const body = {};
        $$('[data-setting]', view).forEach((i) => (body[i.dataset.setting] = Number(i.value)));
        try {
          await A('/api/admin/settings', { method: 'PUT', body });
          toast('Reglas guardadas');
        } catch (ex) {
          toast(ex.message, true);
        }
      }
    };
  }

  function serviceSheet(s) {
    const isNew = !s;
    s = s || { nombre: '', descripcion: '', icono: 'stethoscope', duracion_min: 30, buffer_min: 0, es_urgencia: false, activo: true };
    formSheet(
      isNew ? 'Nuevo servicio' : 'Editar servicio',
      `<div class="field"><label for="v-nombre">Nombre</label><input id="v-nombre" maxlength="80" value="${esc(s.nombre)}"></div>
       <div class="field"><label for="v-desc">Descripción</label><input id="v-desc" maxlength="200" value="${esc(s.descripcion || '')}"></div>
       <div class="grid-2">
         <div class="field"><label for="v-dur">Duración (min)</label><input id="v-dur" type="number" inputmode="numeric" min="5" value="${s.duracion_min}"></div>
         <div class="field"><label for="v-buf">Margen después (min)</label><input id="v-buf" type="number" inputmode="numeric" min="0" value="${s.buffer_min}"></div>
       </div>
       <div class="field"><label for="v-icono">Ícono</label><input id="v-icono" maxlength="40" value="${esc(s.icono || '')}"><span class="hint">Nombre de un ícono de tabler.io/icons (ej: vaccine, scissors).</span></div>
       <label class="check" style="margin-bottom:10px"><input type="checkbox" id="v-urg" ${s.es_urgencia ? 'checked' : ''}><span>Es urgencia</span></label>
       <label class="check"><input type="checkbox" id="v-act" ${s.activo ? 'checked' : ''}><span>Visible para agendar</span></label>`,
      async (el) => {
        const body = {
          nombre: val(el, '#v-nombre'),
          descripcion: val(el, '#v-desc'),
          icono: val(el, '#v-icono'),
          duracion_min: Number(val(el, '#v-dur')),
          buffer_min: Number(val(el, '#v-buf')),
          es_urgencia: $('#v-urg', el).checked,
          activo: $('#v-act', el).checked,
        };
        if (isNew) await A('/api/admin/services', { method: 'POST', body });
        else await A(`/api/admin/services/${s.id}`, { method: 'PATCH', body });
        renderAjustes();
      }
    );
  }

  boot();
})();
