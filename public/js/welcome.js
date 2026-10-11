(function () {
  var facts = [
    'Первые талеры чеканили с 1518 года в чешском городе Яхимов. От слова «талер» произошло название доллара.',
    'Слово «банк» пришло из итальянского banco, так называли скамью, за которой менялы вели дела.',
    'Белорусские рубли 1992 года называли «зайчиками»: на купюре в один рубль был изображён заяц.',
    'Слово «касса» произошло от латинского capsa, что значит «ящик».'
  ];
  var i = 0;
  var text = document.getElementById('fact-text');
  var btn = document.getElementById('fact-next');
  if (!text || !btn) return;
  btn.addEventListener('click', function () {
    i = (i + 1) % facts.length;
    text.textContent = facts[i];
  });
})();
