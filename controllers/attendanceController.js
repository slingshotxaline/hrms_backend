const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');

// Helper function to parse time string (HH:mm) and create today's date with that time
const parseShiftTime = (timeString) => {
  const [hours, minutes] = timeString.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
};

// Helper function to calculate minutes difference
const getMinutesDifference = (time1, time2) => {
  return Math.floor((time1 - time2) / (1000 * 60));
};

// @desc    Mark attendance
// @route   POST /api/attendance/mark
// @access  Public (or secured with API Key for device)
const markAttendance = async (req, res) => {
  const { employeeCode, timestamp, type } = req.body;

  try {
    const employee = await Employee.findOne({ employeeCode });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const punchTime = new Date(timestamp);
    const date = new Date(punchTime);
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
      if (!attendance.inTime || punchTime < attendance.inTime) {
        attendance.inTime = punchTime;
        
        // Calculate shift-based status
        const shiftStartTime = parseShiftTime(employee.shiftStart || '09:00');
        const gracePeriodEnd = new Date(shiftStartTime.getTime() + 30 * 60000); // 30 minutes grace
        const halfDayTime = parseShiftTime('12:00'); // Half day after 12 PM
        
        const minutesBeforeShift = getMinutesDifference(shiftStartTime, punchTime);
        const minutesAfterShift = getMinutesDifference(punchTime, shiftStartTime);
        
        // Determine attendance status and timing
        if (punchTime < shiftStartTime) {
          // Punched before shift time - EARLY
          attendance.status = 'Present';
          attendance.lateMinutes = 0;
          attendance.isEarly = true;
          attendance.earlyMinutes = minutesBeforeShift;
          attendance.timingStatus = 'Early';
        } else if (punchTime <= gracePeriodEnd) {
          // Within grace period (0-30 mins after shift)
          attendance.status = 'Present';
          attendance.lateMinutes = minutesAfterShift;
          attendance.usedGracePeriod = true;
          attendance.timingStatus = minutesAfterShift === 0 ? 'On Time' : 'On Time (Grace)';
        } else if (punchTime > gracePeriodEnd && punchTime < halfDayTime) {
          // Late but before 12 PM
          attendance.status = 'Present';
          attendance.lateMinutes = minutesAfterShift;
          attendance.timingStatus = 'Late';
        } else if (punchTime >= halfDayTime) {
          // After 12 PM - Half Day
          attendance.status = 'Present';
          attendance.lateMinutes = minutesAfterShift;
          attendance.isHalfDay = true;
          attendance.timingStatus = 'Half Day';
        }
      }
    } else if (type === 'OUT') {
      attendance.outTime = punchTime;
    }

    // Set status to Present if inTime exists
    if (attendance.inTime && !attendance.status) {
      attendance.status = 'Present';
    }

    await attendance.save();

    res.status(200).json({ 
      message: 'Attendance marked successfully', 
      attendance,
      timingStatus: attendance.timingStatus,
      lateMinutes: attendance.lateMinutes,
      usedGracePeriod: attendance.usedGracePeriod,
      isEarly: attendance.isEarly,
      earlyMinutes: attendance.earlyMinutes,
      isHalfDay: attendance.isHalfDay
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
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

    const attendance = await Attendance.find(query)
      .populate('employee', 'firstName lastName employeeCode shiftStart shiftEnd')
      .sort({ date: -1 });
    
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
};

module.exports = { markAttendance, getAttendance, manualAttendance };