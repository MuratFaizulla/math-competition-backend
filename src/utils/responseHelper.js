/**
 * Стандартные ответы API для консистентности
 */

// Успешные ответы
const success = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

const created = (res, data, message = 'Resource created successfully') => {
  return success(res, data, message, 201);
};

// Ошибки клиента (4xx)
const badRequest = (res, message = 'Bad Request', details = null) => {
  return res.status(400).json({
    success: false,
    error: 'Bad Request',
    message,
    details,
    timestamp: new Date().toISOString()
  });
};

const unauthorized = (res, message = 'Unauthorized access') => {
  return res.status(401).json({
    success: false,
    error: 'Unauthorized',
    message,
    timestamp: new Date().toISOString()
  });
};

const forbidden = (res, message = 'Access forbidden') => {
  return res.status(403).json({
    success: false,
    error: 'Forbidden',
    message,
    timestamp: new Date().toISOString()
  });
};

const notFound = (res, message = 'Resource not found') => {
  return res.status(404).json({
    success: false,
    error: 'Not Found',
    message,
    timestamp: new Date().toISOString()
  });
};

const conflict = (res, message = 'Resource conflict') => {
  return res.status(409).json({
    success: false,
    error: 'Conflict',
    message,
    timestamp: new Date().toISOString()
  });
};

const validationError = (res, errors, message = 'Validation failed') => {
  return res.status(422).json({
    success: false,
    error: 'Validation Error',
    message,
    errors,
    timestamp: new Date().toISOString()
  });
};

// Ошибки сервера (5xx)
const internalError = (res, message = 'Internal server error', error = null) => {
  const response = {
    success: false,
    error: 'Internal Server Error',
    message,
    timestamp: new Date().toISOString()
  };
  
  // В режиме разработки добавляем детали ошибки
  if (process.env.NODE_ENV === 'development' && error) {
    response.stack = error.stack;
    response.details = error.message;
  }
  
  return res.status(500).json(response);
};

const serviceUnavailable = (res, message = 'Service temporarily unavailable') => {
  return res.status(503).json({
    success: false,
    error: 'Service Unavailable',
    message,
    timestamp: new Date().toISOString()
  });
};

// Пагинация
const paginated = (res, data, pagination, message = 'Data retrieved successfully') => {
  return res.json({
    success: true,
    message,
    data,
    pagination: {
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems,
      itemsPerPage: pagination.itemsPerPage,
      hasNext: pagination.hasNext,
      hasPrev: pagination.hasPrev
    },
    timestamp: new Date().toISOString()
  });
};

// Специфичные для приложения ответы
const testResponse = (res, testData, message = 'Test data retrieved') => {
  return res.json({
    success: true,
    message,
    test: testData.test,
    config: testData.config,
    status: testData.status,
    timestamp: new Date().toISOString()
  });
};

const questionResponse = (res, questionData, message = 'Question data retrieved') => {
  return res.json({
    success: true,
    message,
    question: questionData.question,
    progress: questionData.progress,
    timeRemaining: questionData.timeRemaining,
    timestamp: new Date().toISOString()
  });
};

const answerResponse = (res, answerData, message = 'Answer submitted') => {
  return res.json({
    success: true,
    message,
    result: answerData.result,
    nextQuestion: answerData.nextQuestion,
    progress: answerData.progress,
    score: answerData.score,
    isCompleted: answerData.isCompleted,
    timestamp: new Date().toISOString()
  });
};

const resultsResponse = (res, resultsData, message = 'Results retrieved') => {
  return res.json({
    success: true,
    message,
    results: resultsData.results,
    detailedResults: resultsData.detailedResults,
    isPassed: resultsData.isPassed,
    timestamp: new Date().toISOString()
  });
};

// Утилиты для форматирования данных
const formatUser = (user) => {
  const formatted = {
    id: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin
  };
  
  // Добавляем информацию о тесте если есть
  if (user.testId) {
    formatted.test = {
      id: user.testId,
      hasStarted: user.hasStartedTest,
      startTime: user.testStartTime,
      endTime: user.testEndTime
    };
  }
  
  return formatted;
};

const formatQuestion = (question, includeAnswer = false) => {
  const formatted = {
    id: question._id,
    title: question.title,
    description: question.description,
    options: question.options,
    difficulty: question.difficulty,
    topic: question.topic,
    points: question.points,
    image: question.image,
    isActive: question.isActive,
    createdAt: question.createdAt
  };
  
  // Добавляем правильный ответ только если разрешено
  if (includeAnswer) {
    formatted.correctAnswer = question.correctAnswer;
    formatted.explanation = question.explanation;
  }
  
  return formatted;
};

const formatTest = (test, includeDetails = false) => {
  const formatted = {
    id: test._id,
    questionsCount: test.questions.length,
    answeredCount: test.answers.length,
    score: test.score,
    maxScore: test.maxScore,
    isCompleted: test.isCompleted,
    startedAt: test.startedAt,
    completedAt: test.completedAt,
    timeSpent: test.timeSpent
  };
  
  if (includeDetails && test.isCompleted) {
    formatted.results = test.getResults();
    formatted.percentage = formatted.results.percentage;
  }
  
  return formatted;
};

// Middleware для стандартизации ответов
const standardizeResponse = (req, res, next) => {
  // Добавляем методы в объект response
  res.success = (data, message, statusCode) => success(res, data, message, statusCode);
  res.created = (data, message) => created(res, data, message);
  res.badRequest = (message, details) => badRequest(res, message, details);
  res.unauthorized = (message) => unauthorized(res, message);
  res.forbidden = (message) => forbidden(res, message);
  res.notFound = (message) => notFound(res, message);
  res.conflict = (message) => conflict(res, message);
  res.validationError = (errors, message) => validationError(res, errors, message);
  res.internalError = (message, error) => internalError(res, message, error);
  res.serviceUnavailable = (message) => serviceUnavailable(res, message);
  res.paginated = (data, pagination, message) => paginated(res, data, pagination, message);
  
  next();
};

module.exports = {
  // Основные методы ответов
  success,
  created,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  validationError,
  internalError,
  serviceUnavailable,
  paginated,
  
  // Специфичные для приложения
  testResponse,
  questionResponse,
  answerResponse,
  resultsResponse,
  
  // Утилиты форматирования
  formatUser,
  formatQuestion,
  formatTest,
  
  // Middleware
  standardizeResponse
};