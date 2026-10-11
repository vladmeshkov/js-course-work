// График платежей на странице заявки: данные приходят с сервера, формула одна на всю систему.
(function () {
  var form = document.getElementById('loan-form');
  if (!form) return;
  var table = document.getElementById('loan-table');
  var body = table.querySelector('tbody');
  var summary = document.getElementById('loan-summary');
  var hint = document.getElementById('loan-hint');
  var timer;

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
      hint.hidden = false;
      return;
    }
    hint.hidden = true;
    table.hidden = false;
    data.rows.forEach(function (r) {
      var tr = document.createElement('tr');
      cell(tr, r.no);
      cell(tr, r.dueDate);
      cell(tr, money(r.principal));
      cell(tr, money(r.interest));
      cell(tr, money(r.total), true);
      cell(tr, money(r.balanceAfter));
      body.appendChild(tr);
    });
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

  ['amount', 'termMonths', 'scheduleType'].forEach(function (name) {
    form.elements[name].addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(update, 250);
    });
  });
  update();
})();
