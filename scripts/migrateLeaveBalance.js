require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('../models/Employee');

const migrateLeaveBalances = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const employees = await Employee.find({});
    console.log(`👥 Found ${employees.length} employees`);

    let updatedCount = 0;

    for (const employee of employees) {
      let needsUpdate = false;

      // ✅ Migrate old 'earned' to 'annual'
      if (employee.leaveBalance.earned !== undefined && employee.leaveBalance.annual === undefined) {
        employee.leaveBalance.annual = employee.leaveBalance.earned;
        employee.leaveBalance.earned = undefined;
        needsUpdate = true;
      }

      // ✅ Set default values if missing
      if (employee.leaveBalance.sick === undefined) {
        employee.leaveBalance.sick = 10;
        needsUpdate = true;
      }

      if (employee.leaveBalance.annual === undefined) {
        employee.leaveBalance.annual = 10;
        needsUpdate = true;
      }

      if (employee.leaveBalance.casual === undefined) {
        employee.leaveBalance.casual = 10;
        needsUpdate = true;
      }

      // ✅ Initialize monthly usage tracking
      if (!employee.monthlyLeaveUsage) {
        employee.monthlyLeaveUsage = new Map();
        needsUpdate = true;
      }

      if (needsUpdate) {
        await Employee.updateOne(
          { _id: employee._id },
          {
            $set: {
              'leaveBalance.sick': employee.leaveBalance.sick || 10,
              'leaveBalance.annual': employee.leaveBalance.annual || 10,
              'leaveBalance.casual': employee.leaveBalance.casual || 10,
              'leaveBalance.unpaid': employee.leaveBalance.unpaid || 0,
              monthlyLeaveUsage: employee.monthlyLeaveUsage || new Map(),
            },
            $unset: {
              'leaveBalance.earned': 1, // Remove old field
            }
          }
        );
        
        updatedCount++;
        console.log(`✅ Updated ${employee.firstName} ${employee.lastName}`);
      }
    }

    console.log(`\n✅ Migration complete! Updated ${updatedCount} employees`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

migrateLeaveBalances();