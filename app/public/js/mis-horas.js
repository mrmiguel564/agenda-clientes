(function () {
  const { api, esc, icon, toast, ESPECIE_ICON, fmtDateTime } = window.App;
  const app = document.getElementById('app');

  const ESTADO = {
    agendada: ['Agendada', 'tag-info'],
    atendida: ['Atendida', 'tag-ok'],
    no_asistio: ['No asistió', 'tag-warn'],
    cancelada: ['Cancelada', 'tag-danger'],
  };

  async function load() {
    let me;
    try {
      me = await api('/api/me');
    } catch (e) {
      app.innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
      return;
    }
    if (!me.linked) {
      app.innerHTML = `<div class="empty">${icon('calendar-user')}
        <h1>Mis horas</h1>
        <p>Aquí verás tus horas y mascotas cuando agendes desde este dispositivo.</p>
        <p class="small">¿Agendaste desde otro dispositivo? Abre el link del correo de confirmación aquí y quedará vinculado.</p>
        <a class="btn" href="/#agendar">${icon('calendar-plus')}Agendar una hora</a></div>`;
      return;
    }

    const proximas = me.proximas.length
      ? me.proximas
          .map(
            (b) => `<div class="card row">
              <span class="icon-bubble">${icon(ESPECIE_ICON[b.especie] || 'paw')}</span>
              <div class="grow"><div class="title">${esc(b.mascota)} · ${esc(b.servicio)}</div><div class="muted small">${esc(b.fecha)} · ${esc(b.hora)}</div></div>
              <button class="btn btn-danger btn-sm" type="button" data-cancel="${b.id}">Cancelar</button>
            </div>`
          )
          .join('')
      : `<div class="card empty" style="padding:20px">${icon('calendar')}No tienes horas próximas.</div>`;

    const mascotas = me.mascotas
      .map((m) => {
        const visitas = m.visitas.slice(0, 5)
          .map((v) => {
            const d = fmtDateTime(v.fecha);
            const [label, cls] = ESTADO[v.estado] || [v.estado, ''];
            return `<li><span>${esc(d.fecha)} · ${esc(v.servicio)}</span><span class="tag ${cls}">${esc(label)}</span></li>`;
          })
          .join('');
        return `<div class="card pet-card">
          <div class="row"><span class="icon-bubble">${icon(ESPECIE_ICON[m.especie] || 'paw')}</span>
            <div class="grow"><div class="title">${esc(m.nombre)}</div><div class="muted small">${m.visitas.length} visita(s)</div></div></div>
          ${visitas ? `<ul class="visits">${visitas}</ul>` : ''}
        </div>`;
      })
      .join('');

    app.innerHTML = `<h1>Hola, ${esc(me.tutor.nombre.split(' ')[0])}</h1>
      <h2>Próximas horas</h2><div class="list">${proximas}</div>
      <h2>Mis mascotas</h2><div class="list">${mascotas || '<p class="muted">Aún no hay mascotas registradas.</p>'}</div>`;
  }

  app.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-cancel]');
    if (!btn) return;
    if (!confirm('¿Cancelar esta hora? Te enviaremos un correo de aviso.')) return;
    btn.disabled = true;
    try {
      await api(`/api/me/bookings/${btn.dataset.cancel}/cancel`, { method: 'POST' });
      toast('Hora cancelada');
      load();
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
    }
  });

  load();
})();
