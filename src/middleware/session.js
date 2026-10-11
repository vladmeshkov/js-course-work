import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { config } from '../config/index.js';
import { pool } from '../db/pool.js';

const PgStore = connectPgSimple(session);

export function sessionMiddleware() {
  return session({
    store: new PgStore({ pool, tableName: 'session', pruneSessionInterval: config.isTest ? false : 60 * 15 }),
    name: 'sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 1000 * 60 * 60 * 8 }
  });
}
