const express = require('express');
const router = express.Router();
const {
  getAllUsersWithHierarchy,
  getHierarchyTree,
  updateUserRole,
  assignManager,
  removeManager,
  getMyTeam,
  bulkAssignToManager
} = require('../controllers/roleController');
const { protect, admin, hr } = require('../middleware/authMiddleware');

// Get all users with hierarchy
router.get('/', protect, hr, getAllUsersWithHierarchy);

// Get organization hierarchy tree
router.get('/hierarchy', protect, hr, getHierarchyTree);

// Get my team
router.get('/my-team', protect, getMyTeam);

// Update user role (Admin only)
router.put('/:userId/role', protect, admin, updateUserRole);

// Assign/Remove manager
router.put('/:userId/assign-manager', protect, hr, assignManager);
router.delete('/:userId/remove-manager', protect, hr, removeManager);

// Bulk assign
router.post('/bulk-assign', protect, hr, bulkAssignToManager);

module.exports = router;