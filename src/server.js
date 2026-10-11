import { createApp } from './app.js';
import { config } from './config/index.js';
import { scheduleBackups } from './services/backupService.js';

createApp().listen(config.port, () => {
  console.log(`ТалерБанк запущен: http://localhost:${config.port}`);
  if (scheduleBackups()) console.log(`Резервное копирование каждые ${config.backup.intervalHours} ч`);
});
