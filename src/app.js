import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { sessionMiddleware } from './middleware/session.js';
import { csrf } from './middleware/csrf.js';
import { flash } from './middleware/flash.js';
import { loadUser } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { formatAmount } from './lib/money.js';
import { formatIban } from './lib/iban.js';
import routes from './routes/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Создаёт приложение Express. Сервер запускается отдельно в server.js. */
export function createApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(root, 'src/views'));
  app.set('trust proxy', 1);
  app.locals.formatAmount = formatAmount;
  app.locals.formatIban = formatIban;
  app.locals.esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        // форма выхода и т. п. отправляются только на свой адрес
        formAction: ["'self'"]
      }
    }
  }));
  app.use(express.static(path.join(root, 'public')));
  app.use(express.urlencoded({ extended: false }));
  app.use(sessionMiddleware());
  app.use(flash);
  app.use(csrf);
  app.use(loadUser);

  app.use(routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
