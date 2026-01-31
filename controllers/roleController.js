const User = require('../models/User');
const Employee = require('../models/Employee');

// @desc    Get all users with their hierarchy
// @route   GET /api/roles
// @access  Private/Admin/HR
const getAllUsersWithHierarchy = async (req, res) => {
  try {
    console.log('=== GET ALL USERS REQUEST ===');
    console.log('User making request:', req.user.email, req.user.role);

    const users = await User.find({ isActive: true })
      .populate('employeeId', 'firstName lastName employeeCode department designation')
      .populate('reportsTo', 'name email role')
      .populate('manages', 'name email role')
      .select('-password')
      .sort({ role: 1, name: 1 });

    console.log(`Found ${users.length} users`);

    res.json(users);
  } catch (error) {
    console.error('Error in getAllUsersWithHierarchy:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get organization hierarchy tree
// @route   GET /api/roles/hierarchy
// @access  Private/Admin/HR
const getHierarchyTree = async (req, res) => {
  try {
    console.log('=== GET HIERARCHY REQUEST ===');

    // Get all active users
    const users = await User.find({ isActive: true })
      .populate('employeeId', 'firstName lastName employeeCode department designation')
      .select('-password');

    console.log(`Building hierarchy from ${users.length} users`);

    // Build hierarchy tree
    const buildTree = (userId) => {
      const user = users.find(u => u._id.toString() === userId?.toString());
      if (!user) return null;

      const subordinates = users.filter(u => 
        u.reportsTo?.toString() === userId?.toString()
      );

      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        subordinates: subordinates.map(sub => buildTree(sub._id.toString())).filter(Boolean)
      };
    };

    // Start with users who don't report to anyone (typically Admins)
    const topLevelUsers = users.filter(u => !u.reportsTo);
    console.log(`Found ${topLevelUsers.length} top-level users`);

    const hierarchy = topLevelUsers.map(user => buildTree(user._id.toString())).filter(Boolean);

    res.json(hierarchy);
  } catch (error) {
    console.error('Error in getHierarchyTree:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user role
// @route   PUT /api/roles/:userId/role
// @access  Private/Admin
const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    console.log(`=== UPDATE ROLE: ${userId} to ${role} ===`);

    const validRoles = ['Admin', 'HR', 'Business Lead', 'Team Lead', 'Employee'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const oldRole = user.role;
    user.role = role;

    // If demoting from leadership role, remove all subordinates
    if (['Team Lead', 'Business Lead', 'HR'].includes(oldRole) && 
        !['Team Lead', 'Business Lead', 'HR', 'Admin'].includes(role)) {
      console.log('Removing subordinates due to demotion');
      await User.updateMany(
        { reportsTo: user._id },
        { $unset: { reportsTo: 1 } }
      );
      user.manages = [];
    }

    await user.save();

    const updatedUser = await User.findById(userId)
      .populate('employeeId', 'firstName lastName employeeCode')
      .select('-password');

    console.log(`Role updated successfully: ${oldRole} -> ${role}`);

    res.json({
      message: `User role updated from ${oldRole} to ${role}`,
      user: updatedUser
    });
  } catch (error) {
    console.error('Error in updateUserRole:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Assign employee to manager
// @route   PUT /api/roles/:userId/assign-manager
// @access  Private/Admin/HR
const assignManager = async (req, res) => {
  try {
    const { userId } = req.params;
    const { managerId } = req.body;

    console.log(`=== ASSIGN MANAGER: ${userId} to ${managerId} ===`);

    const user = await User.findById(userId);
    const manager = await User.findById(managerId);

    if (!user || !manager) {
      return res.status(404).json({ message: 'User or Manager not found' });
    }

    // Validate manager role
    const validManagerRoles = ['Admin', 'HR', 'Business Lead', 'Team Lead'];
    if (!validManagerRoles.includes(manager.role)) {
      return res.status(400).json({ 
        message: 'Manager must be Admin, HR, Business Lead, or Team Lead' 
      });
    }

    // Prevent circular reporting
    if (userId === managerId) {
      return res.status(400).json({ message: 'User cannot report to themselves' });
    }

    // Remove from previous manager if exists
    if (user.reportsTo) {
      console.log(`Removing from previous manager: ${user.reportsTo}`);
      await User.findByIdAndUpdate(
        user.reportsTo,
        { $pull: { manages: user._id } }
      );
    }

    // Assign new manager
    user.reportsTo = manager._id;
    await user.save();

    // Add to manager's manages array
    if (!manager.manages) {
      manager.manages = [];
    }
    if (!manager.manages.includes(user._id)) {
      manager.manages.push(user._id);
      await manager.save();
    }

    const updatedUser = await User.findById(userId)
      .populate('employeeId', 'firstName lastName employeeCode')
      .populate('reportsTo', 'name email role')
      .select('-password');

    console.log(`Successfully assigned ${user.name} to ${manager.name}`);

    res.json({
      message: `${user.name} now reports to ${manager.name}`,
      user: updatedUser
    });
  } catch (error) {
    console.error('Error in assignManager:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Remove manager assignment
// @route   DELETE /api/roles/:userId/remove-manager
// @access  Private/Admin/HR
const removeManager = async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`=== REMOVE MANAGER: ${userId} ===`);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.reportsTo) {
      return res.status(400).json({ message: 'User has no manager assigned' });
    }

    // Remove from manager's manages array
    await User.findByIdAndUpdate(
      user.reportsTo,
      { $pull: { manages: user._id } }
    );

    user.reportsTo = undefined;
    await user.save();

    console.log('Manager assignment removed successfully');

    res.json({ message: 'Manager assignment removed successfully' });
  } catch (error) {
    console.error('Error in removeManager:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get my team
// @route   GET /api/roles/my-team
// @access  Private
const getMyTeam = async (req, res) => {
  try {
    console.log(`=== GET MY TEAM: ${req.user.email} ===`);

    const user = await User.findById(req.user._id)
      .populate({
        path: 'manages',
        populate: {
          path: 'employeeId',
          select: 'firstName lastName employeeCode department designation'
        },
        select: '-password'
      });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log(`User has ${user.manages?.length || 0} team members`);

    res.json({
      role: user.role,
      teamSize: user.manages?.length || 0,
      team: user.manages || []
    });
  } catch (error) {
    console.error('Error in getMyTeam:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Bulk assign employees to manager
// @route   POST /api/roles/bulk-assign
// @access  Private/Admin/HR
const bulkAssignToManager = async (req, res) => {
  try {
    const { managerId, employeeIds } = req.body;

    console.log(`=== BULK ASSIGN: ${employeeIds.length} employees to ${managerId} ===`);

    const manager = await User.findById(managerId);
    if (!manager) {
      return res.status(404).json({ message: 'Manager not found' });
    }

    const validManagerRoles = ['Admin', 'HR', 'Business Lead', 'Team Lead'];
    if (!validManagerRoles.includes(manager.role)) {
      return res.status(400).json({ message: 'Invalid manager role' });
    }

    const results = [];
    for (const employeeId of employeeIds) {
      const user = await User.findById(employeeId);
      if (!user) {
        console.log(`User ${employeeId} not found, skipping`);
        continue;
      }

      // Remove from previous manager
      if (user.reportsTo) {
        await User.findByIdAndUpdate(
          user.reportsTo,
          { $pull: { manages: user._id } }
        );
      }

      // Assign new manager
      user.reportsTo = manager._id;
      await user.save();

      // Add to manager's manages array
      if (!manager.manages) {
        manager.manages = [];
      }
      if (!manager.manages.includes(user._id)) {
        manager.manages.push(user._id);
      }

      results.push(user.name);
    }

    await manager.save();

    console.log(`Successfully assigned ${results.length} employees`);

    res.json({
      message: `Successfully assigned ${results.length} employees to ${manager.name}`,
      assignedEmployees: results
    });
  } catch (error) {
    console.error('Error in bulkAssignToManager:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAllUsersWithHierarchy,
  getHierarchyTree,
  updateUserRole,
  assignManager,
  removeManager,
  getMyTeam,
  bulkAssignToManager
};