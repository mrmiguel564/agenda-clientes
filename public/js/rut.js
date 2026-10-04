// Validador de RUT chileno (módulo 11). Funciona en el navegador (window.Rut) y en Node (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rut = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function clean(value) {
    return String(value == null ? '' : value).replace(/[^0-9kK]/g, '').toUpperCase();
  }

  function computeDv(body) {
    let sum = 0;
    let mul = 2;
    for (let i = body.length - 1; i >= 0; i--) {
      sum += Number(body[i]) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    const r = 11 - (sum % 11);
    if (r === 11) return '0';
    if (r === 10) return 'K';
    return String(r);
  }

  function validate(value) {
    const c = clean(value);
    if (c.length < 8 || c.length > 9) return false;
    const body = c.slice(0, -1);
    const dv = c.slice(-1);
    if (!/^\d+$/.test(body)) return false;
    if (/^(\d)\1+$/.test(body)) return false; // 11.111.111-1 y similares
    return computeDv(body) === dv;
  }

  // "12.345.678-5" -> "12345678-5"
  function normalize(value) {
    const c = clean(value);
    if (c.length < 2) return c;
    return c.slice(0, -1) + '-' + c.slice(-1);
  }

  // Formato para mostrar mientras se escribe: "12.345.678-5"
  function format(value) {
    const c = clean(value).slice(0, 9);
    if (c.length < 2) return c;
    const body = c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return body + '-' + c.slice(-1);
  }

  return { clean: clean, computeDv: computeDv, validate: validate, normalize: normalize, format: format };
});
