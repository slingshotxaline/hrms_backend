const express = require('express');
const router = express.Router();
const {
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
} = require('../controllers/employeeController');
const { protect, admin, hr } = require('../middleware/authMiddleware');

router.route('/').post(protect, hr, createEmployee).get(protect, hr, getEmployees);
router
  .route('/:id')
  .get(protect, getEmployeeById)
  .put(protect, hr, updateEmployee);

module.exports = router;
