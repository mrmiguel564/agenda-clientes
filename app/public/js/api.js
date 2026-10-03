// Utilidades compartidas del frontend (sin dependencias).
(function () {
  async function api(url, opts = {}) {
    const init = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      throw Object.assign(new Error('Sin conexión. Revisa tu internet e intenta de nuevo.'), { status: 0 });
    }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : null;
    if (!res.ok) throw Object.assign(new Error((data && data.error) || 'Ocurrió un error.'), { status: res.status, data });
    return data;
  }

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const icon = (name, extra = '') => `<i class="ti ti-${esc(name)} ${extra}" aria-hidden="true"></i>`;

  let toastTimer;
  function toast(msg, isError = false) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.className = 'toast' + (isError ? ' is-error' : '');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3500);
  }

  // Modal accesible: hoja inferior en móvil, diálogo centrado en escritorio.
  function openSheet(html, { onClose, label } = {}) {
    const back = document.createElement('div');
    back.className = 'sheet-backdrop';
    back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label || 'Ventana')}">${html}</div>`;
    const prevFocus = document.activeElement;
    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';
    const sheet = back.firstElementChild;
    function close() {
      back.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      if (onClose) onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    back.addEventListener('click', (e) => {
      if (e.target === back || e.target.closest('[data-close]')) close();
    });
    document.addEventListener('keydown', onKey);
    const focusable = sheet.querySelector('button, [href], input, select, textarea');
    if (focusable) focusable.focus();
    return { el: sheet, close };
  }

  const ESPECIE_ICON = { perro: 'dog', gato: 'cat', exotico: 'feather', otro: 'paw' };
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function fmtDate(str) {
    const d = parseDate(str);
    return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES_CORTO[d.getMonth()]}`;
  }
  function fmtDateTime(iso) {
    const d = new Date(iso);
    return {
      fecha: `${DIAS_CORTO[d.getDay()]} ${d.getDate()} ${MESES_CORTO[d.getMonth()]}`,
      hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    };
  }

  window.App = { api, esc, $, $$, icon, toast, openSheet, ESPECIE_ICON, DIAS, DIAS_CORTO, MESES_CORTO, parseDate, todayStr, fmtDate, fmtDateTime };
})();
