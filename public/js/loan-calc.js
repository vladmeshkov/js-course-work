// График платежей на странице заявки: данные приходят с сервера, формула одна на всю систему.
(function () {
  var form = document.getElementById('loan-form');
  if (!form) return;
  var table = document.getElementById('loan-table');
  var body = table.querySelector('tbody');
  var summary = document.getElementById('loan-summary');
  var hint = document.getElementById('loan-hint');
  var timer;
  var f0 = form.elements;
  var amountRange = document.getElementById('amount-range');
  var termRange = document.getElementById('term-range');
  var more = document.getElementById('loan-more');
  var showAll = false;
  var last = null;
  function num(v) { return parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); }
  function byId(id) { return document.getElementById(id); }

  function money(minor) {
    var whole = Math.trunc(minor / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return whole + ',' + String(minor % 100).padStart(2, '0');
  }

  function cell(tr, text, bold) {
    var td = document.createElement('td');
    td.textContent = text;
    if (bold) td.className = 'strong';
    tr.appendChild(td);
  }

  function fact(label, value) {
    var wrap = document.createElement('div');
    var dt = document.createElement('dt');
    var dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    wrap.appendChild(dt);
    wrap.appendChild(dd);
    return wrap;
  }

  function render(data) {
    body.textContent = '';
    summary.textContent = '';
    if (!data.ok) {
      table.hidden = true;
      more.hidden = true;
      byId('loan-pmt').textContent = '—';
      hint.hidden = false;
      return;
    }
    hint.hidden = true;
    table.hidden = false;
    last = data;
    var shown = showAll ? data.rows : data.rows.slice(0, 6);
    shown.forEach(function (r) {
      var tr = document.createElement('tr');
      cell(tr, r.no);
      cell(tr, String(r.dueDate).slice(0, 10).split('-').reverse().join('.'));
      cell(tr, money(r.principal));
      cell(tr, money(r.interest));
      cell(tr, money(r.total), true);
      cell(tr, money(r.balanceAfter));
      body.appendChild(tr);
    });
    more.hidden = data.rows.length <= 6;
    more.textContent = showAll ? 'Свернуть' : 'Показать весь график';
    byId('loan-count').textContent = (showAll ? 'все ' : 'первые ' + Math.min(6, data.rows.length) + ' из ') + data.rows.length;
    var first = data.rows[0].total;
    byId('loan-pmt').textContent = money(first);
    byId('loan-pmt-label').textContent = f0.scheduleType.value === 'annuity' ? 'Платёж в месяц' : 'Первый платёж, дальше меньше';
    byId('loan-over').textContent = money(data.overpay) + ' BYN';
    byId('loan-total').textContent = money(data.total) + ' BYN';
    var inc = num(f0.income.value);
    var ratio = byId('loan-ratio');
    if (inc > 0) {
      var share = Math.round(first / 100 / inc * 100);
      ratio.textContent = share + '% дохода уйдёт на платёж. ' + (share <= 40 ? 'Это в пределах нормы банка.' : 'Банк одобряет, если не больше 40%.');
      ratio.className = 'talon__ratio ' + (share <= 40 ? 'is-ok' : 'is-bad');
    } else { ratio.textContent = 'Укажите доход, чтобы оценить нагрузку.'; ratio.className = 'talon__ratio'; }
    summary.hidden = false;
    summary.appendChild(fact('Первый платёж', money(data.rows[0].total) + ' BYN'));
    summary.appendChild(fact('Всего выплат', money(data.total) + ' BYN'));
    summary.appendChild(fact('Переплата', money(data.overpay) + ' BYN'));
  }

  function update() {
    table.classList.add('is-pending');
    summary.classList.add('is-pending');
    var f = form.elements;
    var url = '/loans/calc?product=' + encodeURIComponent(form.dataset.product) + '&amount=' + encodeURIComponent(f.amount.value) +
      '&term=' + encodeURIComponent(f.termMonths.value) + '&type=' + encodeURIComponent(f.scheduleType.value);
    fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(render).catch(function () {})
      .then(function () { table.classList.remove('is-pending'); summary.classList.remove('is-pending'); });
  }

  function sync() {
    var a = num(f0.amount.value);
    if (amountRange && isFinite(a)) amountRange.value = a;
    if (termRange && isFinite(num(f0.termMonths.value))) termRange.value = num(f0.termMonths.value);
  }
  amountRange.addEventListener('input', function () { f0.amount.value = amountRange.value + ',00'; clearTimeout(timer); timer = setTimeout(update, 150); });
  termRange.addEventListener('input', function () { f0.termMonths.value = termRange.value; clearTimeout(timer); timer = setTimeout(update, 150); });
  more.addEventListener('click', function () { showAll = !showAll; if (last) render(last); });
  f0.income.addEventListener('input', function () { if (last) render(last); });
  sync();
  form.addEventListener('change', function (e) { if (e.target.name === 'scheduleType') { clearTimeout(timer); update(); } });
  ['amount', 'termMonths'].forEach(function (name) {
    form.elements[name].addEventListener('input', function () {
      sync();
      clearTimeout(timer);
      timer = setTimeout(update, 250);
    });
  });
  update();
})();
