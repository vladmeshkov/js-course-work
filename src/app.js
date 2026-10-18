import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { sessionMiddleware } from './middleware/session.js';
import { csrf } from './middleware/csrf.js';
import { loadUser, enforceStaff2fa } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

/**
 * Создаёт приложение Express. Сервер запускается отдельно в server.js.
 * Бизнес-логика доступна как JSON API по адресу /api, интерфейс (HTML, CSS, JavaScript) отдаётся как статические файлы:
 * любой другой GET-запрос получает index.html, дальше страницу выбирает клиентский маршрутизатор.
 */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        // форма выхода и т. п. отправляются только на свой адрес
        formAction: ["'self'"]
      }
    }
  }));
  app.use(express.static(publicDir, { index: false }));

  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.use(sessionMiddleware());
  api.use(csrf);
  api.use(loadUser);
  api.use(enforceStaff2fa);
  api.use(routes);
  api.use(notFound);
  app.use('/api', api);

  // страницы приложения: клиентский маршрутизатор разбирает адрес сам
  app.get(/^\/(?!api(\/|$)).*/, (req, res, next) => {
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use(errorHandler);
  return app;
}
