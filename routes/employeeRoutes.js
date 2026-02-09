const express = require('express');
const router = express.Router();
const {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  toggleEmployeeStatus, // ✅ ADD THIS
} = require('../controllers/employeeController');
const { protect, admin, hr } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, getEmployees)
  .post(protect, admin, createEmployee);

router.route('/:id')
  .get(protect, getEmployeeById)
  .put(protect, admin, updateEmployee)
  .delete(protect, admin, deleteEmployee);

// ✅ ADD THIS ROUTE
router.put('/:id/toggle-status', protect, admin, toggleEmployeeStatus);

module.exports = router;