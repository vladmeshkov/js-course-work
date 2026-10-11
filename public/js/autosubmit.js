(function () {
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.matches && el.matches('[data-autosubmit]') && el.form) el.form.submit();
  });
})();
