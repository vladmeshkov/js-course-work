// Тема оформления. Скрипт подключается в <head> без отложенной загрузки, чтобы класс выставился до первой отрисовки
// и страница не мигала светлым фоном. Выбор пользователя хранится в localStorage, по умолчанию берётся тема системы.
(function () {
  var root = document.documentElement;
  // признак «JavaScript работает»: только тогда прячем блоки до появления на экране
  root.classList.add('js');
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) { /* хранилище недоступно: останется тема системы */ }
  var dark = saved ? saved === 'dark' : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.classList.toggle('dark', dark);

  function sync() {
    var isDark = root.classList.contains('dark');
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(isDark));
      var label = btn.querySelector('[data-theme-label]');
      if (label) label.textContent = isDark ? 'Светлая тема' : 'Тёмная тема';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    sync();
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = !root.classList.contains('dark');
        root.classList.toggle('dark', next);
        try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch (e) { /* без сохранения */ }
        sync();
      });
    });
    // включаем плавные переходы только после первой отрисовки
    requestAnimationFrame(function () { root.classList.add('theme-ready'); });
  });
})();
