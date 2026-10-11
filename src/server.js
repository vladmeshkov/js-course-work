import { createApp } from './app.js';
import { config } from './config/index.js';

createApp().listen(config.port, () => {
  console.log(`ТалерБанк запущен: http://localhost:${config.port}`);
});
