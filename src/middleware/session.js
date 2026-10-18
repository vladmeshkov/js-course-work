import session from 'express-session';
import { config } from '../config/index.js';
import { pool } from '../db/pool.js';

const MAX_AGE_MS = 1000 * 60 * 60 * 8;

/** Хранилище сессий express-session в таблице sessions базы данных. */
class MysqlStore extends session.Store {
  constructor(pruneSeconds) {
    super();
    if (pruneSeconds) {
      const timer = setInterval(() => this.prune().catch(() => {}), pruneSeconds * 1000);
      timer.unref();
    }
  }

  get(sid, callback) {
    pool.query('SELECT sess FROM sessions WHERE sid = ? AND expires_at > UTC_TIMESTAMP(3)', [sid])
      .then(({ rows }) => callback(null, rows[0] ? (typeof rows[0].sess === 'string' ? JSON.parse(rows[0].sess) : rows[0].sess) : null))
      .catch(callback);
  }

  set(sid, data, callback) {
    const expires = data.cookie?.expires ? new Date(data.cookie.expires) : new Date(Date.now() + MAX_AGE_MS);
    pool.query(
      'INSERT INTO sessions (sid, sess, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE sess = VALUES(sess), expires_at = VALUES(expires_at)',
      [sid, JSON.stringify(data), expires]
    ).then(() => callback?.()).catch((e) => callback?.(e));
  }

  destroy(sid, callback) {
    pool.query('DELETE FROM sessions WHERE sid = ?', [sid]).then(() => callback?.()).catch((e) => callback?.(e));
  }

  touch(sid, data, callback) {
    const expires = data.cookie?.expires ? new Date(data.cookie.expires) : new Date(Date.now() + MAX_AGE_MS);
    pool.query('UPDATE sessions SET expires_at = ? WHERE sid = ?', [expires, sid]).then(() => callback?.()).catch((e) => callback?.(e));
  }

  prune() {
    return pool.query('DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP(3)');
  }
}

export function sessionMiddleware() {
  return session({
    store: new MysqlStore(config.isTest ? 0 : 60 * 15),
    name: 'sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: MAX_AGE_MS }
  });
}
