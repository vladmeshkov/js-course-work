import { query } from '../db/pool.js';
import { config } from '../config/index.js';

/*
 * Почта вместо SMS. Если в .env задан SMTP_HOST, коды подтверждения уходят письмом на адрес клиента,
 * а уведомления дублируются на почту через очередь mail_outbox: письмо ставится в очередь в той же транзакции,
 * что и событие, поэтому не уйдёт, если операция откатилась. Отправляет очередь функция processOutbox.
 * Без SMTP_HOST система работает как раньше: код показывается на странице (учебный режим), письма не отправляются.
 */

const MAX_ATTEMPTS = 5;
let transport = null;

/** Подмена транспорта (тесты). */
export function setTransport(t) { transport = t; }

export const enabled = () => Boolean(transport || config.mail.host);

/** Библиотека nodemailer подключается только при включённой почте, поэтому без SMTP_HOST она серверу не нужна. */
async function getTransport() {
  if (!transport) {
    const { default: nodemailer } = await import('nodemailer');
    transport = nodemailer.createTransport({
      host: config.mail.host, port: config.mail.port, secure: config.mail.secure,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined
    });
  }
  return transport;
}

/** Адрес для показа клиенту: a***@mail.by */
export function maskEmail(email) {
  const [name, domain] = String(email).split('@');
  return `${name.slice(0, 1)}***@${domain}`;
}

const wrap = (title, text) => `<!doctype html><html lang="ru"><body style="font-family:Arial,sans-serif;color:#151A21">
<div style="max-width:520px;margin:0 auto;padding:24px">
<div style="font-size:22px;font-weight:700;margin-bottom:16px">Талер<span style="color:#7A8088">Банк</span></div>
<h2 style="margin:0 0 12px;font-size:20px">${title}</h2>
<p style="font-size:16px;line-height:1.5;white-space:pre-line">${text}</p>
<p style="font-size:13px;color:#6D7581;margin-top:24px">Банк никогда не просит назвать код или пароль по телефону. Если это были не вы, смените пароль в разделе «Безопасность».<br>Письмо отправлено автоматически, отвечать на него не нужно.</p>
</div></body></html>`;

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function deliver({ to, subject, body }) {
  await (await getTransport()).sendMail({
    from: config.mail.from, to, subject,
    text: `${subject}\n\n${body}\n\nТалерБанк`,
    html: wrap(escapeHtml(subject), escapeHtml(body))
  });
}

/** Адрес электронной почты клиента по пользователю. */
export async function emailOf(userId, db = { query }) {
  const { rows } = await db.query('SELECT c.email FROM clients c WHERE c.user_id = ?', [userId]);
  return rows[0]?.email || null;
}

/**
 * Отправляет код подтверждения письмом немедленно (код нужен сразу).
 * @returns {Promise<string | null>} замаскированный адрес или null, если письмо не отправлено
 */
export async function sendCode(userId, code, label) {
  if (!enabled()) return null;
  const email = await emailOf(userId);
  if (!email) return null;
  try {
    await deliver({ to: email, subject: `Код подтверждения ${code}`, body: `Код для ${label}: ${code}.\nОн действует 5 минут. Никому его не сообщайте.` });
    return maskEmail(email);
  } catch (error) {
    console.error('Не удалось отправить код на почту:', error.message);
    return null;
  }
}

/** Ставит письмо-уведомление в очередь (вызывается из notify в транзакции события). */
export async function enqueue(userId, { title, body }, db = { query }) {
  if (!enabled() || !userId) return;
  const { rows } = await db.query(
    'SELECT c.email FROM users u JOIN clients c ON c.user_id = u.id WHERE u.id = ? AND u.notify_email AND c.email IS NOT NULL', [userId]);
  if (!rows[0]) return;
  await db.query('INSERT INTO mail_outbox (user_id, to_email, subject, body) VALUES (?, ?, ?, ?)', [userId, rows[0].email, title, body || title]);
}

/** Отправляет накопившиеся письма. Неудачные повторяются, после пяти попыток письмо помечается как неотправленное. */
export async function processOutbox(limit = 20) {
  if (!enabled()) return { sent: 0, failed: 0 };
  const { rows } = await query("SELECT id, to_email, subject, body, attempts FROM mail_outbox WHERE status = 'pending' ORDER BY id LIMIT ?", [limit]);
  let sent = 0;
  let failed = 0;
  for (const m of rows) {
    try {
      await deliver({ to: m.to_email, subject: m.subject, body: m.body });
      await query("UPDATE mail_outbox SET status = 'sent', sent_at = UTC_TIMESTAMP(3), attempts = attempts + 1 WHERE id = ?", [m.id]);
      sent += 1;
    } catch (error) {
      const dead = m.attempts + 1 >= MAX_ATTEMPTS;
      await query('UPDATE mail_outbox SET status = ?, attempts = attempts + 1, last_error = ? WHERE id = ?', [dead ? 'failed' : 'pending', String(error.message).slice(0, 300), m.id]);
      failed += 1;
    }
  }
  return { sent, failed };
}

/** Периодическая отправка очереди. Возвращает true, если почта настроена и рассылка запущена. */
export function scheduleOutbox(intervalSeconds = 15) {
  if (!enabled()) return false;
  const timer = setInterval(() => processOutbox().catch((e) => console.error('Очередь почты:', e.message)), intervalSeconds * 1000);
  timer.unref();
  return true;
}
