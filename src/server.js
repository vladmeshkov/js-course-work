import { createApp } from './app.js';
import { config } from './config/index.js';
import { scheduleBackups } from './services/backupService.js';
import { scheduleOutbox } from './services/mailService.js';

createApp().listen(config.port, () => {
  console.log(`ТалерБанк запущен: http://localhost:${config.port}`);
  if (scheduleOutbox()) console.log('Почта: уведомления и коды отправляются на email клиентов');
  else console.log('Почта не настроена (SMTP_HOST): коды подтверждения показываются на странице');
  if (scheduleBackups()) console.log(`Резервное копирование каждые ${config.backup.intervalHours} ч`);
});
