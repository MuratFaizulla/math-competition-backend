const express = require('express');
const router = express.Router();

const testController = require('../controllers/testController');
const {
  authenticateToken,
  requireUser,
  requireActiveTest,
  checkTestAttempt,
  checkUserTestTime
} = require('../middleware/auth');
const {
  validateAnswer
} = require('../middleware/validation');

// Middleware для всех маршрутов тестов
router.use(authenticateToken, requireUser);

// @route   GET /api/tests/status
// @desc    Get current testing status
// @access  User
router.get('/status', testController.getTestStatus);

// @route   GET /api/tests/my-test
// @desc    Get user's assigned test information
// @access  User
router.get('/my-test', testController.getMyTest);

// @route   POST /api/tests/start
// @desc    Start the test for the user
// @access  User
router.post('/start',
  requireActiveTest,
  checkTestAttempt,
  testController.startTest
);

// @route   GET /api/tests/current-question
// @desc    Get the current question for the user
// @access  User
router.get('/current-question',
  checkUserTestTime,
  testController.getCurrentQuestion
);

// @route   POST /api/tests/answer
// @desc    Submit answer for current question
// @access  User
router.post('/answer',
  checkUserTestTime,
  validateAnswer,
  testController.submitAnswer
);

// @route   POST /api/tests/submit
// @desc    Submit/finish the test
// @access  User
router.post('/submit',
  testController.submitTest
);

// @route   GET /api/tests/results
// @desc    Get test results (only after completion)
// @access  User
router.get('/results', testController.getTestResults);

module.exports = router;