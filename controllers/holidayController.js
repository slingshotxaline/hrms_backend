const Holiday = require('../models/Holiday');

// @desc    Add a holiday
// @route   POST /api/holidays
// @access  Private/Admin/HR
const addHoliday = async (req, res) => {
  try {
    const { name, date, type, isPaid, description } = req.body;

    const holiday = await Holiday.create({
      name,
      date,
      type,
      isPaid,
      description,
    });

    res.status(201).json(holiday);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all holidays
// @route   GET /api/holidays
// @access  Public
const getHolidays = async (req, res) => {
  try {
    const holidays = await Holiday.find({}).sort({ date: 1 });
    res.json(holidays);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { addHoliday, getHolidays };
