export function home(req, res) {
  if (req.user) return res.redirect(req.user.role_code === 'client' ? '/cabinet' : '/workplace');
  res.render('pages/home', { title: 'ТалерБанк' });
}
