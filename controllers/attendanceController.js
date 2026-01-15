const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');

// @desc    Mark attendance (Mock for development)
// @route   POST /api/attendance/mark
// @access  Public (or secured with API Key for device)
const markAttendance = async (req, res) => {
  const { employeeCode, timestamp, type } = req.body; // type: 'IN' or 'OUT'

  try {
    const employee = await Employee.findOne({ employeeCode });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0); // Normalize to midnight for query

    let attendance = await Attendance.findOne({
      employee: employee._id,
      date: date,
    });

    if (!attendance) {
      attendance = new Attendance({
        employee: employee._id,
        date: date,
      });
    }

    if (type === 'IN') {
      if (!attendance.inTime || new Date(timestamp) < attendance.inTime) {
          attendance.inTime = timestamp;
      }
    } else if (type === 'OUT') {
        attendance.outTime = timestamp;
    }

    // Basic Status Logic (Refine later)
    if (attendance.inTime) {
        attendance.status = 'Present';
    }

    // Calculate Late/Overtime (Basic Placeholder)
    // Real logic needs shift info from employee

    await attendance.save();

    res.status(200).json({ message: 'Attendance marked successfully', attendance });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get attendance records
// @route   GET /api/attendance
// @access  Private
const getAttendance = async (req, res) => {
  try {
    const { startDate, endDate, employeeId } = req.query;
    const query = {};

    if (startDate && endDate) {
      query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    if (employeeId) {
      query.employee = employeeId;
    }

    const attendance = await Attendance.find(query).populate('employee', 'firstName lastName employeeCode');
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Manual Attendance Update (Audit Log)
// @route   PUT /api/attendance/:id
// @access  Private/Admin/HR
const manualAttendance = async (req, res) => {
    try {
        const { inTime, outTime, status, reason } = req.body;
        const attendance = await Attendance.findById(req.params.id);

        if (!attendance) {
            return res.status(404).json({ message: 'Attendance record not found' });
        }

        if (attendance.isLocked) {
            return res.status(400).json({ message: 'Attendance is locked for payroll' });
        }

        const previousValue = {
            inTime: attendance.inTime,
            outTime: attendance.outTime,
            status: attendance.status
        };

        attendance.inTime = inTime || attendance.inTime;
        attendance.outTime = outTime || attendance.outTime;
        attendance.status = status || attendance.status;
        attendance.isEdited = true;

        attendance.auditLog.push({
            modifiedBy: req.user._id,
            previousValue,
            reason
        });

        await attendance.save();
        res.json(attendance);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports = { markAttendance, getAttendance, manualAttendance };
