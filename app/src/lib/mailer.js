const nodemailer = require('nodemailer');
const { buildIcs } = require('./ics');
const { fechaLarga, hora } = require('./util');

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mailpit',
  port: Number(process.env.SMTP_PORT || 1025),
  secure: String(process.env.SMTP_SECURE || 'false') === 'true',
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
});

const FROM = process.env.MAIL_FROM || 'Agenda <no-reply@localhost>';
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');

const escHtml = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout(negocio, title, body) {
  return `<!doctype html><html><body style="margin:0;background:#FAF7FF;font-family:Arial,Helvetica,sans-serif;color:#2E2545">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #E2D4FF">
    <tr><td style="background:#F1EAFF;border-radius:16px 16px 0 0;padding:18px 24px;font-size:18px;font-weight:bold;color:#6E54B5">${escHtml(negocio.nombre)}</td></tr>
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 12px;font-size:20px;color:#2E2545">${escHtml(title)}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:16px 24px;border-top:1px solid #F1EAFF;font-size:12px;color:#7A6F96">
      ${escHtml(negocio.direccion)} · ${escHtml(negocio.telefono)}
    </td></tr>
  </table></td></tr></table></body></html>`;
}

function row(label, value) {
  return `<tr><td style="padding:6px 0;color:#7A6F96;font-size:14px">${escHtml(label)}</td><td style="padding:6px 0;text-align:right;font-size:14px;font-weight:bold">${escHtml(value)}</td></tr>`;
}

async function send(opts) {
  try {
    await transport.sendMail({ from: FROM, ...opts });
    return true;
  } catch (err) {
    console.error('[mail] no se pudo enviar el correo:', err.message);
    return false;
  }
}

// b: {id, start_at, end_at, cancel_token, servicio, mascota, tutor_nombre, email}
function sendConfirmation(negocio, b) {
  const link = `${PUBLIC_URL}/reserva.html?t=${encodeURIComponent(b.cancel_token)}`;
  const body = `
    <p style="margin:0 0 16px;font-size:15px">Hola ${escHtml(b.tutor_nombre)}, la hora de <b>${escHtml(b.mascota)}</b> quedó agendada.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #F1EAFF;border-bottom:1px solid #F1EAFF;margin-bottom:20px">
      ${row('Servicio', b.servicio)}
      ${row('Mascota', b.mascota)}
      ${row('Fecha', fechaLarga(b.start_at))}
      ${row('Hora', hora(b.start_at))}
      ${row('Dirección', negocio.direccion)}
    </table>
    <p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#6E54B5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:bold">Ver o cancelar mi hora</a></p>
    <p style="margin:0;font-size:13px;color:#7A6F96">Adjuntamos el evento para tu calendario. Si no reservaste esta hora, usa el botón de arriba para cancelarla.</p>`;
  const ics = buildIcs({
    uid: `booking-${b.id}@agenda-horas`,
    start: b.start_at,
    end: b.end_at,
    title: `${b.servicio} · ${b.mascota} (${negocio.nombre})`,
    description: `Hora para ${b.mascota}. Ver o cancelar: ${link}`,
    location: negocio.direccion,
  });
  return send({
    to: b.email,
    subject: `Hora confirmada: ${b.mascota}, ${fechaLarga(b.start_at)} a las ${hora(b.start_at)}`,
    html: layout(negocio, 'Tu hora está confirmada', body),
    text: `Hora confirmada para ${b.mascota}: ${b.servicio}, ${fechaLarga(b.start_at)} a las ${hora(b.start_at)}. ${negocio.direccion}. Ver o cancelar: ${link}`,
    attachments: [{ filename: 'hora.ics', content: ics, contentType: 'text/calendar; charset=utf-8; method=PUBLISH' }],
  });
}

function sendCancellation(negocio, b) {
  const body = `<p style="margin:0 0 12px;font-size:15px">La hora de <b>${escHtml(b.mascota)}</b> (${escHtml(b.servicio)}) del ${escHtml(fechaLarga(b.start_at))} a las ${escHtml(hora(b.start_at))} fue cancelada.</p>
    <p style="margin:0"><a href="${PUBLIC_URL}/#agendar" style="color:#6E54B5;font-weight:bold">Agendar una nueva hora</a></p>`;
  return send({
    to: b.email,
    subject: `Hora cancelada: ${b.mascota}, ${fechaLarga(b.start_at)}`,
    html: layout(negocio, 'Hora cancelada', body),
    text: `La hora de ${b.mascota} del ${fechaLarga(b.start_at)} a las ${hora(b.start_at)} fue cancelada.`,
  });
}

function sendOtp(negocio, email, code) {
  const body = `<p style="margin:0 0 16px;font-size:15px">Usa este código para confirmar tu hora. Vence en 10 minutos.</p>
    <p style="margin:0 0 16px;font-size:32px;letter-spacing:8px;font-weight:bold;color:#6E54B5">${escHtml(code)}</p>
    <p style="margin:0;font-size:13px;color:#7A6F96">Si no intentaste agendar una hora, ignora este correo.</p>`;
  return send({
    to: email,
    subject: `Tu código: ${code}`,
    html: layout(negocio, 'Código de confirmación', body),
    text: `Tu código para confirmar la hora es ${code}. Vence en 10 minutos.`,
  });
}

module.exports = { sendConfirmation, sendCancellation, sendOtp };
