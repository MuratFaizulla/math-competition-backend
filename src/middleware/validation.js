const { body, param, query, validationResult } = require('express-validator');

// Обработчик результатов валидации
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Please check your input data',
      details: errors.array()
    });
  }
  
  next();
};

// Валидация регистрации пользователя
const validateRegister = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email address'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters')
    .matches(/^[a-zA-Zа-яА-Я\s]+$/)
    .withMessage('First name can only contain letters and spaces'),
  
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters')
    .matches(/^[a-zA-Zа-яА-Я\s]+$/)
    .withMessage('Last name can only contain letters and spaces'),
  
  handleValidationErrors
];

// Валидация входа пользователя
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email address'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  handleValidationErrors
];

// Валидация создания вопроса
const validateQuestion = [
  body('title')
    .trim()
    .isLength({ min: 10, max: 200 })
    .withMessage('Question title must be between 10 and 200 characters'),
  
  body('description')
    .trim()
    .isLength({ min: 20, max: 2000 })
    .withMessage('Question description must be between 20 and 2000 characters'),
  
  body('options')
    .isArray({ min: 2, max: 6 })
    .withMessage('Question must have between 2 and 6 options'),
  
  body('options.*')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Each option must be between 1 and 500 characters'),
  
  body('correctAnswer')
    .isInt({ min: 0 })
    .withMessage('Correct answer must be a valid option index'),
  
  body('difficulty')
    .isIn(['easy', 'medium', 'hard'])
    .withMessage('Difficulty must be easy, medium, or hard'),
  
  body('topic')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Topic must be between 2 and 100 characters'),
  
  body('points')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Points must be between 1 and 10'),
  
  body('explanation')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Explanation cannot exceed 1000 characters'),
  
  handleValidationErrors
];

// Валидация отправки ответа
const validateAnswer = [
  body('questionIndex')
    .isInt({ min: 0 })
    .withMessage('Question index must be a valid number'),
  
  body('selectedAnswer')
    .isInt({ min: 0 })
    .withMessage('Selected answer must be a valid option index'),
  
  handleValidationErrors
];

// Валидация настроек
const validateSettings = [
  body('testDuration')
    .optional()
    .isInt({ min: 1, max: 300 })
    .withMessage('Test duration must be between 1 and 300 minutes'),
  
  body('questionsPerTest')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Questions per test must be between 1 and 100'),
  
  body('allowLateSubmission')
    .optional()
    .isBoolean()
    .withMessage('Allow late submission must be a boolean'),
  
  body('showResultsImmediately')
    .optional()
    .isBoolean()
    .withMessage('Show results immediately must be a boolean'),
  
  body('showCorrectAnswers')
    .optional()
    .isBoolean()
    .withMessage('Show correct answers must be a boolean'),
  
  body('passingScore')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Passing score must be between 0 and 100'),
  
  body('instructions')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Instructions cannot exceed 2000 characters'),
  
  body('welcomeMessage')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Welcome message cannot exceed 500 characters'),
  
  handleValidationErrors
];

// Валидация ID параметров
const validateObjectId = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format'),
  
  handleValidationErrors
];

// Валидация запросов с пагинацией
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('sort')
    .optional()
    .isIn(['createdAt', '-createdAt', 'score', '-score', 'firstName', '-firstName'])
    .withMessage('Invalid sort parameter'),
  
  handleValidationErrors
];

// Валидация поиска вопросов
const validateQuestionSearch = [
  query('difficulty')
    .optional()
    .isIn(['easy', 'medium', 'hard'])
    .withMessage('Difficulty must be easy, medium, or hard'),
  
  query('topic')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Topic must be between 1 and 100 characters'),
  
  query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search term must be between 1 and 200 characters'),
  
  handleValidationErrors
];

// Валидация массового импорта вопросов
const validateBulkImport = [
  body('questions')
    .isArray({ min: 1, max: 1000 })
    .withMessage('Must provide between 1 and 1000 questions'),
  
  body('questions.*.title')
    .trim()
    .isLength({ min: 10, max: 200 })
    .withMessage('Each question title must be between 10 and 200 characters'),
  
  body('questions.*.description')
    .trim()
    .isLength({ min: 20, max: 2000 })
    .withMessage('Each question description must be between 20 and 2000 characters'),
  
  body('questions.*.options')
    .isArray({ min: 2, max: 6 })
    .withMessage('Each question must have between 2 and 6 options'),
  
  body('questions.*.correctAnswer')
    .isInt({ min: 0 })
    .withMessage('Each correct answer must be a valid option index'),
  
  body('questions.*.difficulty')
    .isIn(['easy', 'medium', 'hard'])
    .withMessage('Each difficulty must be easy, medium, or hard'),
  
  body('questions.*.topic')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Each topic must be between 2 and 100 characters'),
  
  handleValidationErrors
];

// Валидация обновления профиля пользователя
const validateProfileUpdate = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters')
    .matches(/^[a-zA-Zа-яА-Я\s]+$/)
    .withMessage('First name can only contain letters and spaces'),
  
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters')
    .matches(/^[a-zA-Zа-яА-Я\s]+$/)
    .withMessage('Last name can only contain letters and spaces'),
  
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email address'),
  
  handleValidationErrors
];

// Валидация смены пароля
const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number'),
  
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match new password');
      }
      return true;
    }),
  
  handleValidationErrors
];

// Кастомная валидация для проверки корректности correctAnswer
const validateCorrectAnswer = (req, res, next) => {
  const { options, correctAnswer } = req.body;
  
  if (options && correctAnswer !== undefined) {
    if (correctAnswer >= options.length) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Correct answer index is out of range',
        details: [{
          field: 'correctAnswer',
          message: `Correct answer index must be less than ${options.length}`
        }]
      });
    }
  }
  
  next();
};

// Кастомная валидация для файлов
const validateFileUpload = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'No file uploaded'
    });
  }
  
  const allowedTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
  
  if (!allowedTypes.includes(req.file.mimetype)) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid file type. Only CSV and Excel files are allowed.'
    });
  }
  
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (req.file.size > maxSize) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'File size too large. Maximum size is 10MB.'
    });
  }
  
  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateQuestion,
  validateAnswer,
  validateSettings,
  validateObjectId,
  validatePagination,
  validateQuestionSearch,
  validateBulkImport,
  validateProfileUpdate,
  validatePasswordChange,
  validateCorrectAnswer,
  validateFileUpload,
  handleValidationErrors
};