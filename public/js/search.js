(function () {
  var toggle = document.getElementById('search-toggle');
  var panel = document.getElementById('search-panel');
  var input = document.getElementById('search-q');
  var catsBox = document.getElementById('search-cats');
  var results = document.getElementById('search-results');
  if (!toggle || !panel) return;
  var index = null;
  var cat = 'Все';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function render() {
    var q = input.value.trim().toLowerCase();
    var list = (index || []).filter(function (it) {
      if (cat !== 'Все' && it.cat !== cat) return false;
      return !q || (it.title + ' ' + it.sub + ' ' + it.group).toLowerCase().indexOf(q) !== -1;
    });
    catsBox.textContent = '';
    ['Все'].concat((index || []).map(function (i) { return i.cat; }).filter(function (c, i, a) { return a.indexOf(c) === i; })).forEach(function (c) {
      var b = el('button', 'chip', c);
      b.type = 'button';
      b.setAttribute('aria-selected', String(c === cat));
      b.addEventListener('click', function () { cat = c; render(); });
      catsBox.appendChild(b);
    });
    results.textContent = '';
    if (!list.length) { results.appendChild(el('div', 'search-empty', 'Ничего не нашли. Попробуйте «перевод», «вклад» или «счёт».')); return; }
    var groups = {};
    list.slice(0, 40).forEach(function (it) { (groups[it.group] = groups[it.group] || []).push(it); });
    Object.keys(groups).forEach(function (g) {
      var box = el('div', 'search-group');
      box.appendChild(el('div', 'search-group__title', g));
      groups[g].forEach(function (it) {
        var a = el('a', 'search-item');
        a.href = it.href;
        a.appendChild(el('span', 'search-item__mark', it.mark));
        var t = el('span', 'search-item__txt');
        t.appendChild(el('b', '', it.title));
        if (it.sub) t.appendChild(el('small', '', it.sub));
        a.appendChild(t);
        a.appendChild(el('span', 'search-item__hint', it.hint));
        box.appendChild(a);
      });
      results.appendChild(box);
    });
  }

  function open() {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    input.focus();
    if (!index) {
      fetch('/search/index', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); })
        .then(function (data) { index = data; render(); }).catch(function () { index = []; render(); });
    } else render();
  }
  function close() { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }

  toggle.addEventListener('click', function () { panel.hidden ? open() : close(); });
  document.getElementById('search-close').addEventListener('click', close);
  input.addEventListener('input', render);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) close();
    var tag = (e.target && e.target.tagName) || '';
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(tag) && panel.hidden) { e.preventDefault(); open(); }
  });
})();
