const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config();

// ✅ Define User schema directly in the script to avoid pre-save hooks
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  employeeId: mongoose.Schema.Types.ObjectId,
  reportsTo: mongoose.Schema.Types.ObjectId,
  manages: [mongoose.Schema.Types.ObjectId],
  isActive: Boolean,
}, { timestamps: true });

const hashExistingPasswords = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // ✅ Create User model from schema (without pre-save hooks)
    const User = mongoose.model('User', userSchema);

    const users = await User.find({});
    console.log(`👥 Found ${users.length} users`);

    if (users.length === 0) {
      console.log('⚠️ No users found in database');
      process.exit(0);
    }

    let updatedCount = 0;
    let alreadyHashedCount = 0;

    for (const user of users) {
      // Check if password is already hashed (bcrypt hashes start with $2a$ or $2b$)
      if (user.password && !user.password.startsWith('$2')) {
        console.log(`🔒 Hashing password for ${user.name} (${user.email})...`);
        console.log(`   Current password: ${user.password.substring(0, 20)}...`);
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(user.password, salt);
        
        // Update directly in database
        await User.updateOne(
          { _id: user._id },
          { $set: { password: hashedPassword } }
        );
        
        updatedCount++;
        console.log(`✅ Password hashed for ${user.name}`);
      } else if (user.password && user.password.startsWith('$2')) {
        alreadyHashedCount++;
        console.log(`⏭️ Password already hashed for ${user.name}`);
      } else {
        console.log(`⚠️ No password found for ${user.name}`);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Hashed: ${updatedCount}`);
    console.log(`   ⏭️ Already hashed: ${alreadyHashedCount}`);
    console.log(`   📝 Total users: ${users.length}`);
    
    // Disconnect
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

hashExistingPasswords();