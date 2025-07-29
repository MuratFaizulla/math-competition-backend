const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

const questionController = require('../controllers/questionController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  validateQuestion,
  validateObjectId,
  validatePagination,
  validateQuestionSearch,
  validateBulkImport,
  validateCorrectAnswer,
  validateFileUpload
} = require('../middleware/validation');

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'questions-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
    }
  }
});

// Middleware для всех маршрутов вопросов (только админы)
router.use(authenticateToken, requireAdmin);

// @route   GET /api/questions
// @desc    Get all questions with pagination, search and filters
// @access  Admin
router.get('/',
  validatePagination,
  validateQuestionSearch,
  questionController.getAllQuestions
);

// @route   GET /api/questions/stats
// @desc    Get questions statistics
// @access  Admin
router.get('/stats',
  questionController.getQuestionsStats
);

// @route   GET /api/questions/search
// @desc    Search questions
// @access  Admin
router.get('/search',
  questionController.searchQuestions
);

// @route   GET /api/questions/export
// @desc    Export questions to CSV
// @access  Admin
router.get('/export',
  questionController.exportQuestions
);

// @route   POST /api/questions
// @desc    Create a new question
// @access  Admin
router.post('/',
  validateQuestion,
  validateCorrectAnswer,
  questionController.createQuestion
);

// @route   POST /api/questions/bulk
// @desc    Create multiple questions at once
// @access  Admin
router.post('/bulk',
  validateBulkImport,
  questionController.createBulkQuestions
);

// @route   POST /api/questions/import
// @desc    Import questions from CSV/Excel file
// @access  Admin
router.post('/import',
  upload.single('file'),
  validateFileUpload,
  questionController.importQuestions
);

// @route   GET /api/questions/:id
// @desc    Get a specific question by ID
// @access  Admin
router.get('/:id',
  validateObjectId,
  questionController.getQuestion
);

// @route   PUT /api/questions/:id
// @desc    Update a question
// @access  Admin
router.put('/:id',
  validateObjectId,
  validateQuestion,
  validateCorrectAnswer,
  questionController.updateQuestion
);

// @route   DELETE /api/questions/:id
// @desc    Delete a question (soft delete by default)
// @access  Admin
router.delete('/:id',
  validateObjectId,
  questionController.deleteQuestion
);

// @route   PATCH /api/questions/:id/toggle-status
// @desc    Toggle question active/inactive status
// @access  Admin
router.patch('/:id/toggle-status',
  validateObjectId,
  questionController.toggleQuestionStatus
);

// Обработка ошибок загрузки файлов
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File Too Large',
        message: 'File size exceeds the maximum limit of 10MB'
      });
    }
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      error: 'Invalid File Type',
      message: error.message
    });
  }
  
  next(error);
});

module.exports = router;