const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

mongoose.connect(process.env.MONGO_URI);

const Employee = require('../models/Employee');

async function migrateEmployees() {
  try {
    console.log('🔄 Starting employee migration...');
    
    const employees = await Employee.find({ salary: { $exists: true } });
    console.log(`Found ${employees.length} employees to migrate`);
    
    for (const emp of employees) {
      if (!emp.basicSalary && emp.salary) {
        emp.basicSalary = emp.salary;
      }
      if (!emp.grossSalary && emp.salary) {
        emp.grossSalary = emp.salary;
      }
      emp.salary = undefined; // Remove old field
      await emp.save();
      console.log(`✅ Migrated: ${emp.employeeCode}`);
    }
    
    console.log('✅ Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateEmployees();