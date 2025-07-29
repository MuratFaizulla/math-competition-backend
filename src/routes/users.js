const express = require('express');
const router = express.Router();

const userController = require('../controllers/userController');
const { authenticateToken, requireUser } = require('../middleware/auth');
const { validateProfileUpdate } = require('../middleware/validation');

// Middleware для всех пользовательских маршрутов
router.use(authenticateToken, requireUser);

// @route   GET /api/users/profile
// @desc    Get current user profile
// @access  User
router.get('/profile', userController.getProfile);

// @route   PUT /api/users/profile
// @desc    Update user profile (firstName, lastName only)
// @access  User
router.put('/profile',
  validateProfileUpdate,
  userController.updateProfile
);

// @route   GET /api/users/stats
// @desc    Get user's test statistics
// @access  User
router.get('/stats', userController.getUserStats);

// @route   GET /api/users/progress
// @desc    Get user's test progress
// @access  User
router.get('/progress', userController.getTestProgress);

// @route   GET /api/users/activity
// @desc    Get user's activity timeline
// @access  User
router.get('/activity', userController.getUserActivity);

module.exports = router;