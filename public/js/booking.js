// Flujo de reserva en 3 pasos: ¿qué y cuándo? -> datos y mascota -> resumen -> listo.
(function () {
  const { api, esc, icon, toast, fmtDate, todayStr, parseDate, ESPECIE_ICON, DIAS_CORTO, MESES_CORTO } = window.App;
  const Rut = window.Rut;

  let cfg = null;
  let root = null;
  let st = null;
  let lookupSeq = 0;

  const TITLES = { 1: '¿Qué y cuándo?', 2: 'Tus datos y mascota', 3: 'Revisa y confirma', otp: 'Revisa tu correo', done: 'Listo' };
  const PROGRESS = { 1: 33, 2: 66, 3: 100, otp: 100, done: 100 };
  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
  const $r = (sel) => root && root.querySelector(sel);

  function freshState() {
    return {
      step: 1,
      serviceId: null,
      days: null,
      date: null,
      slots: null,
      slot: null,
      rut: '',
      rutValid: false,
      lookup: null, // {loading} | {error} | respuesta de /api/tutor/lookup
      petId: null, // id de mascota existente o 'new'
      newPet: { nombre: '', especie: '', raza: '', edad_aprox: '' },
      tutor: { nombre: '', email: '', telefono: '' },
      motivo: '',
      consent: false,
      website: '',
      step2At: null,
      error: '',
      submitting: false,
      result: null,
      code: '',
    };
  }

  const service = () => cfg.services.find((s) => s.id === st.serviceId) || null;
  const especieLabel = (id) => (cfg.especies.find((e) => e.id === id) || {}).label || id;

  function selectedPet() {
    if (st.petId === 'new') return st.newPet.nombre ? { nombre: st.newPet.nombre, especie: st.newPet.especie } : null;
    if (st.petId && st.lookup && st.lookup.mascotas) return st.lookup.mascotas.find((m) => m.id === st.petId) || null;
    return null;
  }

  function dayLabel(date) {
    const t = parseDate(todayStr());
    const d = parseDate(date);
    const tomorrow = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
    if (d.getTime() === t.getTime()) return 'Hoy';
    if (d.getTime() === tomorrow.getTime()) return 'Mañana';
    return DIAS_CORTO[d.getDay()];
  }

  // ---------- Estructura ----------
  function build() {
    root = document.createElement('div');
    root.className = 'booking';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'bk-title');
    root.innerHTML = `<div class="bk-panel">
      <div class="bk-head">
        <button class="btn-icon" type="button" data-act="back" aria-label="Volver">${icon('arrow-left')}</button>
        <div class="bk-titles"><div class="bk-stepn" id="bk-stepn"></div><h2 id="bk-title"></h2></div>
        <button class="btn-icon" type="button" data-act="close" aria-label="Cerrar">${icon('x')}</button>
        <div class="bk-progress"><div id="bk-prog"></div></div>
      </div>
      <div class="bk-body" id="bk-body"></div>
      <aside class="bk-aside" id="bk-aside" aria-label="Resumen de tu reserva"></aside>
      <div class="bk-foot" id="bk-foot"></div>
    </div>`;
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape' && root && !document.querySelector('.sheet-backdrop')) close();
  }

  function open(opts = {}) {
    if (!cfg) return;
    if (root) close(true);
    st = freshState();
    build();
    history.pushState({ booking: true }, '');
    if (opts.serviceId && cfg.services.some((s) => s.id === opts.serviceId)) {
      st.serviceId = opts.serviceId;
      loadDays();
    }
    render();
  }

  function close(silent) {
    if (!root) return;
    root.remove();
    root = null;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    if (!silent && history.state && history.state.booking) history.back();
  }

  window.addEventListener('popstate', () => {
    if (root) close(true);
  });

  // ---------- Render ----------
  function render() {
    const s = st.step;
    $r('#bk-title').textContent = TITLES[s];
    $r('#bk-stepn').textContent = typeof s === 'number' ? `Paso ${s} de 3` : '';
    $r('#bk-prog').style.width = PROGRESS[s] + '%';
    $r('[data-act="back"]').style.visibility = s === 'done' ? 'hidden' : 'visible';
    const body = $r('#bk-body');
    if (s === 1) body.innerHTML = step1Html();
    if (s === 2) body.innerHTML = step2Html();
    if (s === 3) body.innerHTML = step3Html();
    if (s === 'otp') body.innerHTML = otpHtml();
    if (s === 'done') body.innerHTML = doneHtml();
    body.scrollTop = 0;
    if (s === 2) {
      if (st.rutValid && !st.lookup) doLookup();
      renderWho();
      const rut = $r('#bk-rut');
      if (rut && !st.rutValid) rut.focus();
    }
    if (s === 'otp') $r('#bk-code').focus();
    renderAside();
    renderFoot();
  }

  function renderFoot() {
    const foot = $r('#bk-foot');
    const err = st.error ? `<div class="form-error" role="alert">${esc(st.error)}</div>` : '';
    const busy = st.submitting ? '<span class="spinner" style="border-top-color:#fff;border-color:rgba(255,255,255,.35)"></span>' : '';
    let btn = '';
    if (st.step === 1) btn = `<button class="btn btn-block" type="button" data-act="next">Continuar ${icon('arrow-right')}</button>`;
    if (st.step === 2) btn = `<button class="btn btn-block" type="button" data-act="next">Ver resumen ${icon('arrow-right')}</button>`;
    if (st.step === 3) btn = `<button class="btn btn-block" type="button" data-act="confirm" ${st.submitting ? 'disabled' : ''}>${busy || icon('check')} Confirmar hora</button>`;
    if (st.step === 'otp') btn = `<button class="btn btn-block" type="button" data-act="verify" ${st.submitting ? 'disabled' : ''}>${busy || icon('check')} Confirmar código</button>`;
    if (st.step === 'done') btn = `<button class="btn btn-ghost btn-block" type="button" data-act="close">Cerrar</button>`;
    foot.innerHTML = err + btn;
  }

  function renderAside() {
    const svc = service();
    const pet = selectedPet();
    const item = (ic, label, v) =>
      `<div class="aside-item">${icon(ic)}<div><div class="small muted">${label}</div><div class="v ${v ? '' : 'empty'}">${v ? esc(v) : 'Por elegir'}</div></div></div>`;
    $r('#bk-aside').innerHTML = `<div class="aside-title">Tu reserva</div>
      ${item('stethoscope', 'Servicio', svc && svc.nombre)}
      ${item('calendar', 'Día', st.date && fmtDate(st.date))}
      ${item('clock', 'Hora', st.slot && st.slot.time)}
      ${item(pet ? ESPECIE_ICON[pet.especie] || 'paw' : 'paw', 'Mascota', pet && pet.nombre)}
      <p class="small muted" style="margin-top:16px">${icon('lock')} Tus datos se usan solo para gestionar tu hora. <a href="/privacidad" target="_blank" rel="noopener">Privacidad</a></p>`;
  }

  // ---------- Paso 1 ----------
  function step1Html() {
    if (!cfg.agenda_open) {
      return `<div class="empty">${icon('clock-pause')}<p><strong>La agenda en línea está cerrada por ahora.</strong></p>
        <p>Escríbenos por WhatsApp o llámanos al ${esc(cfg.negocio.telefono)}.</p></div>`;
    }
    const chips = cfg.services
      .map((s) => `<button type="button" class="chip" data-svc="${s.id}" aria-pressed="${s.id === st.serviceId}">${esc(s.nombre)} <small>${s.duracion_min}′</small></button>`)
      .join('');
    return `<div class="bk-block"><div class="bk-label">¿Qué necesita tu mascota?</div><div class="svc-chips">${chips}</div></div>
      <div class="bk-block" id="bk-days">${daysHtml()}</div>
      <div class="bk-block" id="bk-slots">${slotsHtml()}</div>`;
  }

  function daysHtml() {
    if (!st.serviceId) return '';
    if (st.days === 'loading') return `<div class="bk-label">Día</div><div class="bk-loading"><span class="spinner"></span>Buscando días con horas…</div>`;
    if (st.days && st.days.error) return `<div class="form-error">${esc(st.days.error)}</div>`;
    if (!st.days) return '';
    if (!st.days.length) {
      return `<div class="empty">${icon('calendar-off')}<p>No quedan horas para este servicio en los próximos días.</p>
        <a class="btn btn-ghost btn-sm" href="https://wa.me/${esc(cfg.negocio.whatsapp)}" target="_blank" rel="noopener">${icon('brand-whatsapp')}Consultar por WhatsApp</a></div>`;
    }
    const days = st.days
      .map((d) => {
        const dt = parseDate(d.date);
        return `<button type="button" class="day ${d.date === st.date ? 'is-active' : ''}" data-day="${d.date}" aria-pressed="${d.date === st.date}">
          <span class="dw">${dayLabel(d.date)}</span><span class="dn">${dt.getDate()}</span><span class="dm">${MESES_CORTO[dt.getMonth()]}</span></button>`;
      })
      .join('');
    return `<div class="bk-label">Día</div><div class="days">${days}</div>`;
  }

  function slotsHtml() {
    if (!st.date) return '';
    if (st.slots === 'loading') return `<div class="bk-loading"><span class="spinner"></span>Cargando horas…</div>`;
    if (st.slots && st.slots.error) return `<div class="form-error">${esc(st.slots.error)}</div>`;
    if (!st.slots || !st.slots.length) return `<p class="muted">Ya no quedan horas este día. Elige otro.</p>`;
    const btns = st.slots
      .map((s) => `<button type="button" class="slot ${st.slot && st.slot.start === s.start ? 'is-active' : ''}" data-slot="${esc(s.start)}">${esc(s.time)}</button>`)
      .join('');
    return `<div class="bk-label">Horas libres · ${esc(fmtDate(st.date))}</div><div class="slots">${btns}</div>`;
  }

  async function loadDays() {
    st.days = 'loading';
    st.date = null;
    st.slots = null;
    st.slot = null;
    refresh1();
    const sid = st.serviceId;
    try {
      const r = await api(`/api/availability/days?service_id=${sid}`);
      if (!root || st.serviceId !== sid) return;
      st.days = r.days;
      if (r.days.length) {
        st.date = r.days[0].date;
        loadSlots();
      }
    } catch (e) {
      if (!root || st.serviceId !== sid) return;
      st.days = { error: e.message };
    }
    refresh1();
  }

  async function loadSlots() {
    st.slots = 'loading';
    st.slot = null;
    refresh1();
    const { serviceId, date } = st;
    try {
      const r = await api(`/api/availability?service_id=${serviceId}&date=${date}`);
      if (!root || st.date !== date || st.serviceId !== serviceId) return;
      st.slots = r.slots;
    } catch (e) {
      if (!root || st.date !== date) return;
      st.slots = { error: e.message };
    }
    refresh1();
  }

  function refresh1() {
    if (!root || st.step !== 1) return;
    const d = $r('#bk-days');
    const s = $r('#bk-slots');
    if (d) {
      const scroll = d.querySelector('.days') ? d.querySelector('.days').scrollLeft : 0;
      d.innerHTML = daysHtml();
      if (d.querySelector('.days')) d.querySelector('.days').scrollLeft = scroll;
    }
    if (s) s.innerHTML = slotsHtml();
    renderAside();
  }

  // ---------- Paso 2 ----------
  function step2Html() {
    return `<div class="field" id="f-rut">
        <label for="bk-rut">RUT del tutor</label>
        <div class="input-wrap">
          <input id="bk-rut" name="rut" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="12.345.678-5" value="${esc(st.rut)}" maxlength="12">
          <span id="bk-rut-ic"></span>
        </div>
        <span class="hint">Si ya viniste antes, recuperamos a tus mascotas.</span>
      </div>
      <div id="bk-who"></div>
      <div class="hp" aria-hidden="true"><label>No llenar <input name="website" tabindex="-1" autocomplete="off"></label></div>`;
  }

  function rutIcon() {
    const ic = $r('#bk-rut-ic');
    const f = $r('#f-rut');
    if (!ic || !f) return;
    const clean = Rut.clean(st.rut);
    f.classList.toggle('is-valid', st.rutValid);
    f.classList.toggle('is-invalid', !st.rutValid && clean.length >= 8);
    ic.innerHTML = st.rutValid
      ? `<i class="ti ti-circle-check" style="color:var(--ok)" aria-label="RUT válido"></i>`
      : clean.length >= 8
        ? `<i class="ti ti-alert-circle" style="color:var(--danger)" aria-label="RUT inválido"></i>`
        : '';
  }

  function renderWho() {
    const box = $r('#bk-who');
    if (!box) return;
    rutIcon();
    const L = st.lookup;
    if (!st.rutValid) {
      box.innerHTML = Rut.clean(st.rut).length >= 8 ? '<p class="form-error">Revisa el RUT: el dígito verificador no coincide.</p>' : '';
      return;
    }
    if (!L || L.loading) {
      box.innerHTML = '<div class="bk-loading"><span class="spinner"></span>Buscando…</div>';
      return;
    }
    if (L.error) {
      box.innerHTML = `<p class="form-error">${esc(L.error)}</p>`;
      return;
    }
    if (L.exists && L.blocked) {
      box.innerHTML = `<div class="who is-warn"><span class="icon-bubble">${icon('lock')}</span><p><strong>Este RUT no puede agendar en línea.</strong>Contáctanos al ${esc(cfg.negocio.telefono)} o por WhatsApp.</p></div>`;
      return;
    }

    let who = '';
    let contact = '';
    if (!L.exists) {
      who = `<div class="who"><span class="icon-bubble">${icon('sparkles')}</span><p><strong>Te damos la bienvenida</strong>Es tu primera vez: completa tus datos y los de tu mascota.</p></div>`;
      contact = contactFields();
    } else if (L.known) {
      who = `<div class="who"><span class="icon-bubble">${icon('hand-stop')}</span><p><strong>Hola, ${esc(L.tutor.nombre.split(' ')[0])}</strong>¿Para cuál de tus mascotas es la hora?</p></div>`;
      contact = `<details class="more"><summary>Mis datos de contacto</summary>${contactFields()}</details>`;
    } else {
      who = `<div class="who"><span class="icon-bubble">${icon('user-check')}</span><p><strong>Ya estás registrado</strong>Te enviaremos la confirmación a ${esc(L.tutor.email_masked)}</p></div>`;
    }

    const pets = (L.mascotas || [])
      .map(
        (m) => `<button type="button" class="chip" data-pet="${m.id}" aria-pressed="${st.petId === m.id}">${icon(ESPECIE_ICON[m.especie] || 'paw')}${esc(m.nombre)} · ${esc(especieLabel(m.especie).toLowerCase())}</button>`
      )
      .join('');
    const hasPets = L.mascotas && L.mascotas.length;
    const petBlock = `<div class="bk-label">${hasPets ? 'Mascota' : 'Tu mascota'}</div>
      ${hasPets ? `<div class="pets">${pets}<button type="button" class="chip" data-pet="new" aria-pressed="${st.petId === 'new'}">${icon('plus')}Nueva</button></div>` : ''}
      <div id="bk-newpet">${st.petId === 'new' ? newPetHtml() : ''}</div>`;

    box.innerHTML = `${who}${petBlock}${contact}
      <div class="field"><label for="bk-motivo">Motivo (opcional)</label><input id="bk-motivo" name="motivo" maxlength="200" placeholder="Ej: vómitos desde ayer, control anual" value="${esc(st.motivo)}"></div>
      <label class="check"><input type="checkbox" name="consent" ${st.consent ? 'checked' : ''}><span>Acepto el uso de mis datos para gestionar la hora según la <a href="/privacidad" target="_blank" rel="noopener">política de privacidad</a>.</span></label>`;
  }

  function contactFields() {
    const t = st.tutor;
    return `<div class="field"><label for="bk-nombre">Tu nombre</label><input id="bk-nombre" name="nombre" autocomplete="name" maxlength="80" placeholder="Nombre y apellido" value="${esc(t.nombre)}"></div>
      <div class="field"><label for="bk-email">Correo</label><input id="bk-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="120" placeholder="nombre@correo.cl" value="${esc(t.email)}"><span class="hint">Aquí te llega la confirmación.</span></div>
      <div class="field"><label for="bk-tel">Teléfono</label><input id="bk-tel" name="telefono" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" placeholder="+56 9 1234 5678" value="${esc(t.telefono)}"></div>`;
  }

  function newPetHtml() {
    const p = st.newPet;
    const species = cfg.especies
      .map((e) => `<button type="button" class="chip" data-especie="${e.id}" aria-pressed="${p.especie === e.id}">${icon(e.icono)}${esc(e.label)}</button>`)
      .join('');
    return `<div class="field"><label for="bk-pnombre">Nombre de tu mascota</label><input id="bk-pnombre" name="pet_nombre" maxlength="40" placeholder="Ej: Luna" value="${esc(p.nombre)}"></div>
      <div class="field"><label>Especie</label><div class="species">${species}</div></div>
      <details class="more"><summary>Más datos (opcional)</summary>
        <div class="field"><label for="bk-praza">Raza</label><input id="bk-praza" name="pet_raza" maxlength="40" placeholder="Ej: mestizo" value="${esc(p.raza)}"></div>
        <div class="field"><label for="bk-pedad">Edad aproximada</label><input id="bk-pedad" name="pet_edad" maxlength="20" placeholder="Ej: 3 años" value="${esc(p.edad_aprox)}"></div>
      </details>`;
  }

  async function doLookup() {
    const seq = ++lookupSeq;
    const rut = Rut.normalize(st.rut);
    st.lookup = { loading: true };
    st.petId = null;
    renderWho();
    try {
      const r = await api('/api/tutor/lookup', { method: 'POST', body: { rut } });
      if (!root || seq !== lookupSeq) return;
      st.lookup = r;
      if (!r.exists || !r.mascotas.length) st.petId = 'new';
      else if (r.mascotas.length === 1) st.petId = r.mascotas[0].id;
      if (r.known && r.tutor) st.tutor = { nombre: r.tutor.nombre || '', email: r.tutor.email || '', telefono: r.tutor.telefono || '' };
    } catch (e) {
      if (!root || seq !== lookupSeq) return;
      st.lookup = { error: e.message };
    }
    renderWho();
    renderAside();
  }

  function validateStep2() {
    const L = st.lookup;
    if (!st.rutValid) return 'Ingresa un RUT válido.';
    if (!L || L.loading) return 'Espera un momento, estamos buscando tu RUT.';
    if (L.error) return L.error;
    if (L.blocked) return 'Este RUT no puede agendar en línea.';
    if (!L.exists || L.known) {
      if (!st.tutor.nombre.trim()) return 'Ingresa tu nombre.';
      if (!isEmail(st.tutor.email)) return 'Ingresa un correo válido.';
    }
    if (!st.petId) return 'Elige una mascota o registra una nueva.';
    if (st.petId === 'new') {
      if (!st.newPet.nombre.trim()) return 'Ingresa el nombre de tu mascota.';
      if (!st.newPet.especie) return 'Elige la especie de tu mascota.';
    }
    if (!st.consent) return 'Debes aceptar la política de privacidad.';
    return '';
  }

  // ---------- Paso 3 ----------
  function step3Html() {
    const svc = service();
    const pet = selectedPet();
    const L = st.lookup;
    const tutor = L.exists && !L.known ? L.tutor.email_masked : `${st.tutor.nombre}`;
    const email = L.exists && !L.known ? L.tutor.email_masked : st.tutor.email;
    return `<ul class="summary">
        <li><span>Servicio</span><span>${esc(svc.nombre)}</span></li>
        <li><span>Fecha</span><span>${esc(fmtDate(st.date))}</span></li>
        <li><span>Hora</span><span>${esc(st.slot.time)}</span></li>
        <li><span>Mascota</span><span>${esc(pet.nombre)} · ${esc(especieLabel(pet.especie).toLowerCase())}</span></li>
        <li><span>Tutor</span><span>${esc(tutor)}</span></li>
      </ul>
      <p class="muted">${icon('mail')} Te enviaremos la confirmación a <strong>${esc(email)}</strong>${cfg.otp_enabled ? ' junto con un código para confirmar.' : '.'}</p>
      <div class="edit-links">
        <button type="button" class="btn btn-soft btn-sm" data-act="goto1">${icon('calendar')}Cambiar hora</button>
        <button type="button" class="btn btn-soft btn-sm" data-act="goto2">${icon('edit')}Cambiar datos</button>
      </div>`;
  }

  async function submit() {
    if (st.submitting) return;
    st.submitting = true;
    st.error = '';
    renderFoot();
    const body = {
      service_id: st.serviceId,
      start: st.slot.start,
      rut: Rut.normalize(st.rut),
      nombre: st.tutor.nombre,
      email: st.tutor.email,
      telefono: st.tutor.telefono,
      motivo: st.motivo,
      consent: st.consent,
      website: st.website,
      elapsed_ms: st.step2At ? Date.now() - st.step2At : null,
    };
    if (st.petId === 'new') body.mascota = { ...st.newPet };
    else body.mascota_id = st.petId;
    try {
      const r = await api('/api/bookings', { method: 'POST', body });
      st.result = r;
      st.step = r.otp_required ? 'otp' : 'done';
    } catch (e) {
      if (e.status === 409) {
        toast(e.message, true);
        st.step = 1;
        loadDays();
      } else {
        st.error = e.message;
      }
    }
    st.submitting = false;
    if (root) render();
  }

  // ---------- Código (OTP) ----------
  function otpHtml() {
    return `<div class="done" style="padding-top:0">
        <div class="big" style="background:var(--lila-50);color:var(--primary)">${icon('mail')}</div>
        <p>Enviamos un código de 6 dígitos a <strong>${esc(st.result.resumen.email_masked)}</strong>.<br>Tu hora queda reservada por 10 minutos.</p>
      </div>
      <div class="field"><label for="bk-code">Código</label>
        <input id="bk-code" name="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" value="${esc(st.code)}">
      </div>`;
  }

  async function verify() {
    if (st.submitting) return;
    if (!/^\d{6}$/.test(st.code)) {
      st.error = 'Ingresa los 6 dígitos del código.';
      return renderFoot();
    }
    st.submitting = true;
    st.error = '';
    renderFoot();
    try {
      await api(`/api/bookings/${st.result.id}/verify`, { method: 'POST', body: { code: st.code } });
      st.step = 'done';
    } catch (e) {
      st.error = e.message;
    }
    st.submitting = false;
    if (root) render();
  }

  // ---------- Listo ----------
  function doneHtml() {
    const r = st.result.resumen;
    return `<div class="done">
      <div class="big">${icon('circle-check')}</div>
      <h2>Hora agendada</h2>
      <div class="when">${esc(r.mascota)} · ${esc(r.fecha)} · ${esc(r.hora)}</div>
      <p class="muted">${esc(r.servicio)}</p>
      <p>${icon('mail')} Te enviamos la confirmación a <strong>${esc(r.email_masked)}</strong>, con un link para cancelar si lo necesitas.</p>
      <div class="actions">
        <a class="btn" href="/mis-horas">${icon('calendar-user')}Ver mis horas</a>
        <button class="btn btn-soft" type="button" data-act="again">${icon('plus')}Agendar otra hora</button>
      </div>
    </div>`;
  }

  // ---------- Eventos ----------
  function onClick(e) {
    const t = e.target;
    const act = t.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'close') return close();
      if (a === 'back') return back();
      if (a === 'next') return next();
      if (a === 'confirm') return submit();
      if (a === 'verify') return verify();
      if (a === 'goto1') return go(1);
      if (a === 'goto2') return go(2);
      if (a === 'again') {
        const keep = { rut: st.rut, rutValid: st.rutValid, tutor: st.tutor, consent: st.consent };
        st = Object.assign(freshState(), keep);
        return render();
      }
    }
    const svc = t.closest('[data-svc]');
    if (svc) {
      st.serviceId = Number(svc.dataset.svc);
      st.error = '';
      root.querySelectorAll('[data-svc]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.svc) === st.serviceId)));
      loadDays();
      renderFoot();
      return;
    }
    const day = t.closest('[data-day]');
    if (day) {
      st.date = day.dataset.day;
      st.error = '';
      loadSlots();
      renderFoot();
      return;
    }
    const slot = t.closest('[data-slot]');
    if (slot) {
      st.slot = st.slots.find((s) => s.start === slot.dataset.slot);
      st.error = '';
      refresh1();
      renderFoot();
      if (window.matchMedia('(max-width: 899px)').matches) {
        const btn = $r('[data-act="next"]');
        if (btn) btn.focus({ preventScroll: true });
      }
      return;
    }
    const pet = t.closest('[data-pet]');
    if (pet) {
      st.petId = pet.dataset.pet === 'new' ? 'new' : Number(pet.dataset.pet);
      st.error = '';
      root.querySelectorAll('[data-pet]').forEach((b) => b.setAttribute('aria-pressed', String(b === pet)));
      $r('#bk-newpet').innerHTML = st.petId === 'new' ? newPetHtml() : '';
      if (st.petId === 'new') $r('#bk-pnombre').focus();
      renderAside();
      renderFoot();
      return;
    }
    const esp = t.closest('[data-especie]');
    if (esp) {
      st.newPet.especie = esp.dataset.especie;
      root.querySelectorAll('[data-especie]').forEach((b) => b.setAttribute('aria-pressed', String(b === esp)));
      renderAside();
    }
  }

  function onInput(e) {
    const el = e.target;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    switch (el.name) {
      case 'rut': {
        const formatted = Rut.format(v);
        if (formatted !== el.value) el.value = formatted;
        const prev = st.rutValid ? Rut.normalize(st.rut) : null;
        st.rut = formatted;
        st.rutValid = Rut.validate(formatted);
        if (st.rutValid && Rut.normalize(formatted) !== prev) doLookup();
        else if (!st.rutValid) {
          st.lookup = null;
          renderWho();
        }
        break;
      }
      case 'nombre': st.tutor.nombre = v; break;
      case 'email': st.tutor.email = v; break;
      case 'telefono': st.tutor.telefono = v; break;
      case 'pet_nombre': st.newPet.nombre = v; renderAside(); break;
      case 'pet_raza': st.newPet.raza = v; break;
      case 'pet_edad': st.newPet.edad_aprox = v; break;
      case 'motivo': st.motivo = v; break;
      case 'consent': st.consent = v; break;
      case 'website': st.website = v; break;
      case 'code': {
        const digits = String(v).replace(/\D/g, '').slice(0, 6);
        if (digits !== el.value) el.value = digits;
        st.code = digits;
        if (digits.length === 6 && e.type === 'input') verify();
        break;
      }
      default: return;
    }
    if (st.error) {
      st.error = '';
      renderFoot();
    }
  }

  function go(step) {
    st.step = step;
    st.error = '';
    if (step === 2 && !st.step2At) st.step2At = Date.now();
    render();
  }

  function next() {
    if (st.step === 1) {
      if (!cfg.agenda_open) return close();
      if (!st.serviceId) st.error = 'Elige un servicio.';
      else if (!st.slot) st.error = 'Elige un día y una hora.';
      if (st.error) return renderFoot();
      return go(2);
    }
    if (st.step === 2) {
      st.error = validateStep2();
      if (st.error) return renderFoot();
      return go(3);
    }
  }

  function back() {
    if (st.step === 1 || st.step === 'done') return close();
    if (st.step === 'otp') return close();
    go(st.step - 1);
  }

  window.Booking = {
    setConfig(c) {
      cfg = c;
    },
    open,
  };
})();
