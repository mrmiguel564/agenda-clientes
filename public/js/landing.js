// Arma la landing a partir de /api/config (preset del rubro + datos de la BD).
(function () {
  const { api, esc, $, $$, icon, openSheet, DIAS } = window.App;

  function waLink(n, text) {
    return `https://wa.me/${encodeURIComponent(n)}?text=${encodeURIComponent(text || 'Hola, quiero hacer una consulta')}`;
  }

  function render(cfg) {
    const n = cfg.negocio;
    document.title = `${n.nombre} · Agenda tu hora`;
    $$('[data-bind="nombre"]').forEach((el) => (el.textContent = n.nombre));
    $$('[data-bind="razon_social"]').forEach((el) => (el.textContent = n.razon_social || n.nombre));
    $('#year').textContent = new Date().getFullYear();
    $('#footer-address').textContent = `${n.direccion} · ${n.telefono}`;

    // Hero
    $('#hero-title').textContent = cfg.hero.titulo;
    $('#hero-sub').textContent = cfg.hero.subtitulo;
    $('#hero-cta span').textContent = cfg.hero.cta;
    $('#hero-chips').innerHTML = cfg.hero.chips.map((c) => `<span class="tag">${esc(c)}</span>`).join('');
    const status = $('#agenda-status');
    if (!cfg.agenda_open) {
      status.className = 'tag tag-warn hero-status';
      status.innerHTML = `${icon('clock-pause')}Agenda en línea cerrada por ahora`;
    }
    const hoy = cfg.hoy;
    $('#hero-today').innerHTML = hoy.closed
      ? `${icon('moon')}Hoy cerrado${hoy.nota ? ' · ' + esc(hoy.nota) : ''}`
      : `${icon('clock')}Horario de hoy: ${hoy.ranges.map((r) => `${r.start}–${r.end}`).join(' y ')}`;

    // Servicios
    $('#services').innerHTML = cfg.services
      .map(
        (s) => `<button type="button" class="card service ${s.es_urgencia ? 'urgent' : ''}" data-service="${s.id}">
          <span class="icon-bubble">${icon(s.icono || 'paw')}</span>
          <span><span class="t">${esc(s.nombre)}</span><span class="d">${esc(s.descripcion || '')}</span></span>
          ${icon('chevron-right', 'go')}
        </button>`
      )
      .join('');

    // Especialidades (modales)
    $('#specs').innerHTML = cfg.modales
      .map(
        (m) => `<button type="button" class="spec ${m.id === 'urgencias' ? 'urg' : ''}" data-modal="${esc(m.id)}">
          <span class="icon-bubble">${icon(m.icono)}</span>
          <span class="t">${esc(m.titulo)}</span>
          <span class="d">${esc(m.texto.length > 90 ? m.texto.slice(0, 88) + '…' : m.texto)}</span>
          <span class="more">Ver más ${icon('arrow-right')}</span>
        </button>`
      )
      .join('');

    // Pasos
    $('#steps').innerHTML = cfg.pasos
      .map((p) => `<div class="step"><span class="icon-bubble">${icon(p.icono)}</span><div><h3>${esc(p.titulo)}</h3><p>${esc(p.texto)}</p></div></div>`)
      .join('');

    // Horarios (lunes a domingo)
    const today = new Date().getDay();
    $('#hours').innerHTML = [1, 2, 3, 4, 5, 6, 0]
      .map((wd) => {
        const r = cfg.weekly.filter((w) => Number(w.weekday) === wd);
        const txt = r.length ? r.map((x) => `${x.start_time}–${x.end_time}`).join(' · ') : '<span class="closed">Cerrado</span>';
        return `<li class="${wd === today ? 'today' : ''}"><span>${DIAS[wd]}</span><span>${txt}</span></li>`;
      })
      .join('');

    $('#contact').innerHTML = `
      <div>${icon('map-pin')}<span>${esc(n.direccion)}</span></div>
      <div>${icon('phone')}<a href="tel:${esc(n.telefono.replace(/\s/g, ''))}">${esc(n.telefono)}</a></div>
      <div>${icon('brand-whatsapp')}<a href="${waLink(n.whatsapp)}" target="_blank" rel="noopener">Escríbenos por WhatsApp</a></div>`;
    $('#map-link').href = n.mapa_url;
    $('#wa-mobile').href = waLink(n.whatsapp);
    $('#wa-fab').href = waLink(n.whatsapp);

    // FAQ
    $('#faq-list').innerHTML = cfg.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('');
  }

  function openModal(cfg, id) {
    const m = cfg.modales.find((x) => x.id === id);
    if (!m) return;
    const isUrg = m.id === 'urgencias';
    const n = cfg.negocio;
    const sheet = openSheet(
      `<div class="sheet-head"><h2>${esc(m.titulo)}</h2><button class="btn-icon" type="button" data-close aria-label="Cerrar">${icon('x')}</button></div>
       <p>${esc(m.texto)}</p>
       <ul class="modal-list">${m.puntos.map((p) => `<li>${icon('circle-check')}${esc(p)}</li>`).join('')}</ul>
       ${isUrg ? `<a class="btn btn-block btn-danger" href="tel:${esc(n.telefono.replace(/\s/g, ''))}" style="margin-bottom:10px">${icon('phone')}Llamar ahora</a>` : ''}
       <button class="btn btn-block" type="button" data-book-service="${esc(m.servicio)}">${icon('calendar-plus')}Agendar ${esc(m.titulo.toLowerCase())}</button>`,
      { label: m.titulo }
    );
    sheet.el.querySelector('[data-book-service]').addEventListener('click', (e) => {
      const name = e.currentTarget.getAttribute('data-book-service');
      const svc = cfg.services.find((s) => s.nombre === name);
      sheet.close();
      window.Booking.open({ serviceId: svc && svc.id });
    });
  }

  async function init() {
    let cfg;
    try {
      cfg = await api('/api/config');
    } catch (e) {
      App.toast('No pudimos cargar la página. Recarga en unos segundos.', true);
      return;
    }
    App.config = cfg;
    render(cfg);
    window.Booking.setConfig(cfg);

    document.addEventListener('click', (e) => {
      const book = e.target.closest('[data-book]');
      if (book) return window.Booking.open();
      const svc = e.target.closest('[data-service]');
      if (svc) return window.Booking.open({ serviceId: Number(svc.dataset.service) });
      const mod = e.target.closest('[data-modal]');
      if (mod) return openModal(cfg, mod.dataset.modal);
    });

    if (location.hash === '#agendar') window.Booking.open();
  }

  init();
})();
