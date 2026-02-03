const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Employee = require('../models/Employee');

dotenv.config();

const initializeLeaveBalances = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('📦 Connected to MongoDB');

    // Find all employees
    const employees = await Employee.find({});
    console.log(`👥 Found ${employees.length} employees`);

    let updatedCount = 0;

    for (const employee of employees) {
      let needsUpdate = false;

      // Initialize leave balance if not exists or is undefined
      if (!employee.leaveBalance) {
        employee.leaveBalance = {
          casual: 12,
          sick: 12,
          earned: 15,
          unpaid: 0,
        };
        needsUpdate = true;
      } else {
        // Check and update individual leave types if they're undefined
        if (employee.leaveBalance.casual === undefined || employee.leaveBalance.casual === null) {
          employee.leaveBalance.casual = 12;
          needsUpdate = true;
        }
        if (employee.leaveBalance.sick === undefined || employee.leaveBalance.sick === null) {
          employee.leaveBalance.sick = 12;
          needsUpdate = true;
        }
        if (employee.leaveBalance.earned === undefined || employee.leaveBalance.earned === null) {
          employee.leaveBalance.earned = 15;
          needsUpdate = true;
        }
        if (employee.leaveBalance.unpaid === undefined || employee.leaveBalance.unpaid === null) {
          employee.leaveBalance.unpaid = 0;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        await employee.save();
        updatedCount++;
        console.log(`✅ Updated leave balance for ${employee.firstName} ${employee.lastName} (${employee.employeeCode})`);
        console.log(`   Casual: ${employee.leaveBalance.casual}, Sick: ${employee.leaveBalance.sick}, Earned: ${employee.leaveBalance.earned}`);
      }
    }

    console.log(`\n✅ Successfully updated ${updatedCount} employees`);
    console.log('🎉 Leave balance initialization complete!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing leave balances:', error);
    process.exit(1);
  }
};

initializeLeaveBalances();