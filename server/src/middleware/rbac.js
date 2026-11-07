const { ApiError } = require('./errorHandler');

// Usage: router.get('/', auth, rbac('admin'), handler)
function rbac(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action'));
    }
    return next();
  };
}

module.exports = rbac;
