(function () {
  const { api, $$ } = window.App;
  api('/api/config')
    .then((cfg) => {
      const n = cfg.negocio;
      document.title = `Política de privacidad · ${n.nombre}`;
      $$('[data-bind]').forEach((el) => {
        const v = n[el.dataset.bind];
        if (v) el.textContent = v;
      });
      $$('[data-bind-mail]').forEach((a) => {
        a.textContent = n.email_contacto;
        a.href = `mailto:${n.email_contacto}`;
      });
    })
    .catch(() => {});
})();
