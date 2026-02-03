const express = require("express");
const router = express.Router();
const {
  loginUser,
  registerUser,
  getProfile, // ✅ Import getProfile instead of getUserProfile
  updateProfile,
  updatePassword,
  resetPassword,
} = require("../controllers/authController");
const { protect, admin } = require("../middleware/authMiddleware");

router.post("/login", loginUser);
router.post("/register", registerUser);
router.get("/profile", protect, getProfile); // ✅ Use getProfile (it has reportsTo)
router.put("/profile", protect, updateProfile);
router.put("/password", protect, updatePassword);
router.post("/reset-password", protect, admin, resetPassword);

module.exports = router;