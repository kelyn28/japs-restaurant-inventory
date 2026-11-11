export function requireAuth(req, res, next) {
  if (!req.session.user) {
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ error: "Please sign in to continue." });
    }
    return res.redirect("/login");
  }
  res.locals.user = req.session.user;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please sign in to continue." });
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: "You do not have permission to perform this action." });
    }
    next();
  };
}
