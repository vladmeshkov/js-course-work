// Движение интерфейса. Каждый эффект что-то сообщает пользователю:
// появление блоков задаёт порядок чтения, счётчик привлекает внимание к итогу,
// полоса загрузки и состояние кнопки показывают, что запрос принят (и защищают от двойного нажатия).
// Всё отключается, если в системе включено «уменьшить движение».
(function () {
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Появление блоков при прокрутке (IntersectionObserver, без обработчиков scroll) ---
  var CONTAINERS = '.tiles, .quad, .metrics, .card-row, .split, .row, .overview';
  var targets = [];
  document.querySelectorAll('.page > *:not(.crumbs):not(.alert), .tiles > *, .quad > *, .metrics > *, .card-row > *, .split > *').forEach(function (el) {
    if (el.matches(CONTAINERS) && el.children.length) return; // контейнер не прячем: появятся его дети
    targets.push(el);
  });

  function reveal(el) { el.classList.add('is-in'); }

  if (calm || !('IntersectionObserver' in window)) {
    targets.forEach(reveal);
  } else {
    targets.forEach(function (el) {
      var siblings = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      el.classList.add('reveal');
      el.style.setProperty('--d', Math.min(siblings * 0.06, 0.36) + 's');
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
    targets.forEach(function (el) { io.observe(el); });
  }

  // --- Счётчик итоговой суммы ---
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var end = Number(el.dataset.count);
    if (calm || !isFinite(end) || end < 1) return;
    var start = null;
    el.textContent = '0';
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min((ts - start) / 900, 1);
      el.textContent = fmt(end * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });

  // --- Индикаторы прогресса: ширина растёт от нуля ---
  document.querySelectorAll('[data-progress]').forEach(function (el) {
    var value = Math.max(0, Math.min(100, Number(el.dataset.progress)));
    if (calm) { el.style.width = value + '%'; return; }
    el.style.width = '0%';
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.style.width = value + '%'; }); });
  });

  // --- Полоса загрузки страницы и защита форм от двойного нажатия ---
  var bar = document.createElement('div');
  bar.className = 'navbar-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  // Экран загрузки: появляется, только если ответ идёт дольше 350 мс, чтобы быстрые переходы не мигали
  var loader = document.createElement('div');
  loader.className = 'loader';
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');
  loader.innerHTML = '<div class="loader__ring"><img src="/img/emblem.png" alt="" width="64" height="64"></div><span class="loader__text">Загрузка</span>';
  document.body.appendChild(loader);
  var loaderTimer = 0;
  function busy() {
    bar.classList.remove('is-active'); void bar.offsetWidth; bar.classList.add('is-active');
    clearTimeout(loaderTimer);
    loaderTimer = setTimeout(function () { loader.classList.add('is-on'); }, 350);
  }
  window.addEventListener('pageshow', function () {
    bar.classList.remove('is-active');
    clearTimeout(loaderTimer);
    loader.classList.remove('is-on');
    document.querySelectorAll('form[data-sending]').forEach(function (f) {
      delete f.dataset.sending;
      f.querySelectorAll('.is-loading').forEach(function (b) { b.classList.remove('is-loading'); });
    });
  });

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var href = a.getAttribute('href');
    if (a.target || /^(#|mailto:|tel:|https?:)/.test(href) || a.hasAttribute('download') || /\.pdf($|\?)/.test(href)) return;
    busy();
  });

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form.method && form.method.toLowerCase() === 'get') { busy(); return; }
    if (form.dataset.sending) { e.preventDefault(); return; } // повторное нажатие не создаст второй платёж
    form.dataset.sending = '1';
    var button = e.submitter || form.querySelector('button[type="submit"], button:not([type])');
    if (button) button.classList.add('is-loading');
    busy();
  });

  // --- Лёгкий наклон банковской карты за указателем ---
  if (!calm && window.matchMedia && window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.bank-card:not(.bank-card--new)').forEach(function (card) {
      var frame = 0;
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(function () {
          card.style.transform = 'perspective(700px) rotateY(' + (x * 9).toFixed(2) + 'deg) rotateX(' + (-y * 9).toFixed(2) + 'deg)';
        });
      });
      card.addEventListener('pointerleave', function () {
        cancelAnimationFrame(frame);
        card.style.transform = '';
      });
    });
  }
})();
