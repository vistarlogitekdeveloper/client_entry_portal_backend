const roleMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(403).json({ success: false, message: 'Forbidden: missing user role' });
      }

      if (!allowedRoles.includes(req.user.role.toUpperCase())) {
        return res.status(403).json({ success: false, message: 'Forbidden: insufficient permissions' });
      }

      next();
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error verifying role' });
    }
  };
};

module.exports = roleMiddleware;
