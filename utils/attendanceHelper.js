const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');
const Employee = require('../models/Employee');

// Function to mark holidays for all employees
const markHolidaysForAllEmployees = async (holidayDate) => {
  try {
    const employees = await Employee.find({ isActive: true });
    const holiday = await Holiday.findOne({ date: holidayDate });

    if (!holiday) return;

    const date = new Date(holidayDate);
    date.setHours(0, 0, 0, 0);

    for (const employee of employees) {
      // Check if attendance already exists
      const existingAttendance = await Attendance.findOne({
        employee: employee._id,
        date: date
      });

      if (!existingAttendance) {
        await Attendance.create({
          employee: employee._id,
          date: date,
          status: 'Holiday',
          inTime: null,
          outTime: null,
        });
      } else if (existingAttendance.status === 'Absent') {
        // Update absent to holiday
        existingAttendance.status = 'Holiday';
        await existingAttendance.save();
      }
    }

    console.log(`Holiday marked for all employees on ${holidayDate}`);
  } catch (error) {
    console.error('Error marking holiday:', error);
  }
};

module.exports = { markHolidaysForAllEmployees };