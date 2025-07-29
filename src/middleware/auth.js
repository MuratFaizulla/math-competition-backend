const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware для проверки JWT токена
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({
        error: 'Access Denied',
        message: 'No token provided'
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        error: 'Access Denied',
        message: 'User not found'
      });
    }
    
    if (!user.isActive) {
      return res.status(401).json({
        error: 'Access Denied',
        message: 'User account is deactivated'
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Access Denied',
        message: 'Token expired'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Access Denied',
        message: 'Invalid token'
      });
    }
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Token verification failed'
    });
  }
};

// Middleware для проверки роли администратора
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Access Denied',
      message: 'User not authenticated'
    });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access Denied',
      message: 'Admin access required'
    });
  }
  
  next();
};

// Middleware для проверки роли пользователя
const requireUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Access Denied',
      message: 'User not authenticated'
    });
  }
  
  if (req.user.role !== 'user') {
    return res.status(403).json({
      error: 'Access Denied',
      message: 'User access required'
    });
  }
  
  next();
};

// Middleware для проверки владельца ресурса
const requireOwnerOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Access Denied',
      message: 'User not authenticated'
    });
  }
  
  const userId = req.params.userId || req.body.userId;
  
  if (req.user.role === 'admin' || req.user._id.toString() === userId) {
    next();
  } else {
    return res.status(403).json({
      error: 'Access Denied',
      message: 'Access to this resource is denied'
    });
  }
};

// Middleware для проверки активности тестирования
const requireActiveTest = async (req, res, next) => {
  try {
    const Settings = require('../models/Settings');
    const settings = await Settings.getCurrentSettings();
    
    if (!settings.testStarted) {
      return res.status(403).json({
        error: 'Test Not Started',
        message: 'Testing is not currently active'
      });
    }
    
    if (settings.isTestExpired()) {
      return res.status(403).json({
        error: 'Test Expired',
        message: 'Testing time has expired'
      });
    }
    
    req.settings = settings;
    next();
  } catch (error) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check test status'
    });
  }
};

// Middleware для проверки попытки прохождения теста
const checkTestAttempt = async (req, res, next) => {
  try {
    const user = req.user;
    
    if (user.hasStartedTest) {
      const Test = require('../models/Test');
      const test = await Test.findById(user.testId);
      
      if (test && test.isCompleted) {
        return res.status(403).json({
          error: 'Test Already Completed',
          message: 'You have already completed the test'
        });
      }
    }
    
    next();
  } catch (error) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check test attempt'
    });
  }
};

// Middleware для проверки времени теста пользователя
const checkUserTestTime = async (req, res, next) => {
  try {
    const user = req.user;
    
    if (!user.hasStartedTest || !user.testStartTime) {
      return res.status(400).json({
        error: 'Test Not Started',
        message: 'You have not started the test yet'
      });
    }
    
    const Settings = require('../models/Settings');
    const settings = await Settings.getCurrentSettings();
    
    if (user.isTestExpired(settings.testDuration)) {
      // Автоматически завершаем тест если время истекло
      const Test = require('../models/Test');
      const test = await Test.findById(user.testId);
      
      if (test && !test.isCompleted) {
        await test.completeTest();
      }
      
      return res.status(403).json({
        error: 'Test Time Expired',
        message: 'Your test time has expired'
      });
    }
    
    next();
  } catch (error) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check user test time'
    });
  }
};

// Utility функция для генерации JWT токена
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id,
      email: user.email,
      role: user.role 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// Utility функция для проверки токена без middleware
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireUser,
  requireOwnerOrAdmin,
  requireActiveTest,
  checkTestAttempt,
  checkUserTestTime,
  generateToken,
  verifyToken
};