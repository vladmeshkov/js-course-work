// Движение интерфейса. Каждый эффект что-то сообщает пользователю:
// появление блоков задаёт порядок чтения, счётчик привлекает внимание к итогу,
// полоса загрузки и состояние кнопки показывают, что запрос принят (и защищают от двойного нажатия).
// Всё отключается, если в системе включено «уменьшить движение».

const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const CONTAINERS = '.tiles, .quad, .metrics, .card-row, .split, .row, .overview';
let observer = null;
let bar = null;
let loader = null;
let loaderTimer = 0;
let pending = 0;

function format(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Создаёт полосу загрузки и экран загрузки (один раз). */
export function setup() {
  if (bar) return;
  bar = document.createElement('div');
  bar.className = 'navbar-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  // Экран загрузки появляется, только если ответ идёт дольше 350 мс, чтобы быстрые переходы не мигали
  loader = document.createElement('div');
  loader.className = 'loader';
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');
  loader.innerHTML = '<div class="loader__ring"><img src="/img/emblem.png" alt="" width="64" height="64"></div><span class="loader__text">Загрузка</span>';
  document.body.appendChild(loader);
}

/** Запрос начался: показываем полосу, а при долгом ожидании и экран загрузки. */
export function busy() {
  setup();
  pending += 1;
  bar.classList.remove('is-active');
  void bar.offsetWidth;
  bar.classList.add('is-active');
  clearTimeout(loaderTimer);
  loaderTimer = setTimeout(() => loader.classList.add('is-on'), 350);
}

/** Запрос закончился. */
export function done() {
  pending = Math.max(0, pending - 1);
  if (pending) return;
  bar?.classList.remove('is-active');
  clearTimeout(loaderTimer);
  loader?.classList.remove('is-on');
}

/** Включает эффекты для вновь показанной страницы (root — контейнер страницы). */
export function init(root) {
  observer?.disconnect();
  const targets = [];
  root.querySelectorAll(':scope > *:not(.crumbs):not(.alert), .tiles > *, .quad > *, .metrics > *, .card-row > *, .split > *').forEach((el) => {
    if (el.matches(CONTAINERS) && el.children.length) return; // контейнер не прячем: появятся его дети
    targets.push(el);
  });
  const reveal = (el) => el.classList.add('is-in');
  if (calm || !('IntersectionObserver' in window)) {
    targets.forEach(reveal);
  } else {
    targets.forEach((el) => {
      const index = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      el.classList.add('reveal');
      el.style.setProperty('--d', `${Math.min(index * 0.06, 0.36)}s`);
    });
    observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { reveal(e.target); observer.unobserve(e.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
    targets.forEach((el) => observer.observe(el));
  }

  // счётчик итоговой суммы
  root.querySelectorAll('[data-count]').forEach((el) => {
    const end = Number(el.dataset.count);
    if (calm || !Number.isFinite(end) || end < 1) return;
    let start = null;
    el.textContent = '0';
    const step = (ts) => {
      if (start === null) start = ts;
      const t = Math.min((ts - start) / 900, 1);
      el.textContent = format(end * (1 - (1 - t) ** 3));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  // индикаторы прогресса: ширина растёт от нуля
  root.querySelectorAll('[data-progress]').forEach((el) => {
    const value = Math.max(0, Math.min(100, Number(el.dataset.progress)));
    if (calm) { el.style.width = `${value}%`; return; }
    el.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.width = `${value}%`; }));
  });

  // лёгкий наклон банковской карты за указателем
  if (!calm && window.matchMedia?.('(hover: hover)').matches) {
    root.querySelectorAll('.bank-card:not(.bank-card--new)').forEach((card) => {
      let frame = 0;
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          card.style.transform = `perspective(700px) rotateY(${(x * 9).toFixed(2)}deg) rotateX(${(-y * 9).toFixed(2)}deg)`;
        });
      });
      card.addEventListener('pointerleave', () => { cancelAnimationFrame(frame); card.style.transform = ''; });
    });
  }
}

export const reducedMotion = calm;
