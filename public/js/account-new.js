(function () {
  var form = document.getElementById('acc-form');
  if (!form) return;
  var cur = document.getElementById('acc-cur');
  var note = document.getElementById('kind-note');
  var NOTES = {
    current: 'Текущий счёт нужен для платежей, переводов и карт.',
    savings: 'Накопительный счёт нужен для откладывания денег: платежи и карты к нему не привязываются.'
  };
  form.addEventListener('change', function (e) {
    if (e.target.name === 'currency') cur.textContent = e.target.value;
    if (e.target.name === 'kind') note.textContent = NOTES[e.target.value];
  });
  var checked = form.querySelector('input[name="currency"]:checked');
  if (checked) cur.textContent = checked.value;
  var kind = form.querySelector('input[name="kind"]:checked');
  if (kind) note.textContent = NOTES[kind.value];
})();
