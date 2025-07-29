const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  validateSettings,
  validatePagination,
  validateObjectId
} = require('../middleware/validation');

// Middleware для всех админских маршрутов
router.use(authenticateToken, requireAdmin);

// @route   GET /api/admin/users
// @desc    Get all users with pagination and filters
// @access  Admin
router.get('/users',
  validatePagination,
  adminController.getAllUsers
);

// @route   GET /api/admin/users/:userId
// @desc    Get detailed user information
// @access  Admin
router.get('/users/:userId',
  validateObjectId,
  adminController.getUserDetails
);

// @route   POST /api/admin/users/:userId/reset-test
// @desc    Reset user test (emergency use)
// @access  Admin
router.post('/users/:userId/reset-test',
  validateObjectId,
  adminController.resetUserTest
);

// @route   GET /api/admin/results
// @desc    Get test results with pagination and filters
// @access  Admin
router.get('/results',
  validatePagination,
  adminController.getTestResults
);

// @route   GET /api/admin/results/export
// @desc    Export test results as CSV or JSON
// @access  Admin
router.get('/results/export',
  adminController.exportResults
);

// @route   POST /api/admin/start-test
// @desc    Start testing for all users
// @access  Admin
router.post('/start-test',
  adminController.startTesting
);

// @route   POST /api/admin/stop-test
// @desc    Stop testing and auto-complete active tests
// @access  Admin
router.post('/stop-test',
  adminController.stopTesting
);

// @route   GET /api/admin/settings
// @desc    Get current system settings
// @access  Admin
router.get('/settings',
  adminController.getSettings
);

// @route   PUT /api/admin/settings
// @desc    Update system settings
// @access  Admin
router.put('/settings',
  validateSettings,
  adminController.updateSettings
);

// @route   GET /api/admin/dashboard
// @desc    Get dashboard statistics
// @access  Admin
router.get('/dashboard',
  adminController.getDashboardStats
);

module.exports = router;