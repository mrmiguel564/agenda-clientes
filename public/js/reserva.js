// Página del link del correo: ver y cancelar la hora. Abrirla vincula este dispositivo.
(function () {
  const { api, esc, icon, toast, ESPECIE_ICON } = window.App;
  const app = document.getElementById('app');
  const token = new URLSearchParams(location.search).get('t') || '';

  const STATUS = {
    confirmed: ['Confirmada', 'tag-ok'],
    pending: ['Pendiente de confirmar', 'tag-warn'],
    cancelled: ['Cancelada', 'tag-danger'],
    done: ['Atendida', 'tag-ok'],
    no_show: ['No asistió', 'tag-warn'],
    expired: ['Vencida', 'tag-danger'],
  };

  async function load() {
    let r;
    try {
      r = await api(`/api/r/${encodeURIComponent(token)}`);
    } catch (e) {
      app.innerHTML = `<div class="empty">${icon('calendar-off')}<p>${esc(e.message)}</p><a class="btn" href="/#agendar">Agendar una hora</a></div>`;
      return;
    }
    const b = r.booking;
    document.getElementById('brand').textContent = r.negocio.nombre;
    const [label, cls] = STATUS[b.status] || [b.status, ''];
    app.innerHTML = `<h1>Tu hora</h1>
      <div class="card">
        <div class="row"><span class="icon-bubble">${icon(ESPECIE_ICON[b.especie] || 'paw')}</span>
          <div class="grow"><div class="title">${esc(b.mascota)} · ${esc(b.servicio)}</div><div class="muted">${esc(b.fecha)} · ${esc(b.hora)}</div></div>
          <span class="tag ${cls}">${esc(label)}</span></div>
        <p class="muted small" style="margin:14px 0 0">${icon('map-pin')} ${esc(r.negocio.direccion)}</p>
      </div>
      ${b.cancelable ? `<button class="btn btn-danger btn-block" type="button" id="cancel" style="margin-top:16px">${icon('x')}Cancelar esta hora</button>` : ''}
      <a class="btn btn-ghost btn-block" href="/mis-horas" style="margin-top:10px">${icon('calendar-user')}Ver todas mis horas</a>`;
    const c = document.getElementById('cancel');
    if (c) {
      c.addEventListener('click', async () => {
        if (!confirm('¿Seguro que quieres cancelar esta hora?')) return;
        c.disabled = true;
        try {
          await api(`/api/r/${encodeURIComponent(token)}/cancel`, { method: 'POST' });
          toast('Hora cancelada');
          load();
        } catch (e) {
          toast(e.message, true);
          c.disabled = false;
        }
      });
    }
  }

  load();
})();
