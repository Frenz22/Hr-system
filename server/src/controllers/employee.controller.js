const employeeService = require('../services/employee.service');

async function createAccount(req, res, next) {
  try {
    const user = await employeeService.createEmployeeAccount(req.body, req.user.role);
    res.status(201).json({ message: 'Employee account and profile created successfully', user });
  } catch (err) {
    next(err);
  }
}

async function updateRole(req, res, next) {
  try {
    const user = await employeeService.updateRole(req.user.id, req.params.userId, req.body.role);
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = { createAccount, updateRole };
