/** Одноразовые сообщения между запросами: req.flash('success', 'Готово'). */
export function flash(req, res, next) {
  req.flash = (type, message) => {
    req.session.flash = { type, message };
  };
  res.locals.flash = req.session.flash ?? null;
  delete req.session.flash;
  next();
}
