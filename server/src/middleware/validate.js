const { validationResult } = require('express-validator');

// Runs the given express-validator chains, then rejects with field-level details.
function validate(chains) {
  return [
    ...chains,
    (req, res, next) => {
      const errors = validationResult(req);
      if (errors.isEmpty()) return next();
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
    },
  ];
}

module.exports = validate;
