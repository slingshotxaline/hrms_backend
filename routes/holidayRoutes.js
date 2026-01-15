const express = require('express');
const router = express.Router();
const { addHoliday, getHolidays } = require('../controllers/holidayController');
const { protect, hr } = require('../middleware/authMiddleware');

router.route('/').get(getHolidays).post(protect, hr, addHoliday);

module.exports = router;
