const User = require('../models/User');
const Test = require('../models/Test');
const Question = require('../models/Question');
const Settings = require('../models/Settings');
const { validateTestGeneration } = require('../utils/testGenerator');

// Получение всех пользователей
const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sort = '-createdAt',
      role,
      hasStartedTest,
      search
    } = req.query;
    
    // Построение фильтра
    const filter = {};
    
    if (role) {
      filter.role = role;
    }
    
    if (hasStartedTest !== undefined) {
      filter.hasStartedTest = hasStartedTest === 'true';
    }
    
    if (search) {
      filter.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') }
      ];
    }
    
    // Подсчет общего количества
    const total = await User.countDocuments(filter);
    
    // Получение пользователей с пагинацией
    const users = await User.find(filter)
      .populate('testId', 'isCompleted score maxScore startedAt completedAt')
      .select('-password')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();
    
    // Добавляем статистику по тестам
    const usersWithStats = users.map(user => ({
      ...user,
      testStatus: user.testId ? {
        isCompleted: user.testId.isCompleted,
        score: user.testId.score,
        maxScore: user.testId.maxScore,
        percentage: user.testId.maxScore > 0 ? 
          Math.round((user.testId.score / user.testId.maxScore) * 100) : 0,
        startedAt: user.testId.startedAt,
        completedAt: user.testId.completedAt
      } : null
    }));
    
    res.json({
      users: usersWithStats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
    
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      error: 'Users Retrieval Failed',
      message: 'Failed to retrieve users'
    });
  }
};

// Получение результатов тестирования
const getTestResults = async (req, res) => {
  try {{
    const {
      page = 1,
      limit = 20,
      sort = '-completedAt',
      completed,
      minScore,
      maxScore
    } = req.query;
    
    // Построение фильтра
    const filter = {};
    
    if (completed !== undefined) {
      filter.isCompleted = completed === 'true';
    }
    
    if (minScore !== undefined) {
      filter.score = { ...filter.score, $gte: parseInt(minScore) };
    }
    
    if (maxScore !== undefined) {
      filter.score = { ...filter.score, $lte: parseInt(maxScore) };
    }
    
    // Подсчет общего количества
    const total = await Test.countDocuments(filter);
    
    // Получение тестов с пагинацией
    const tests = await Test.find(filter)
      .populate('userId', 'firstName lastName email')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();
    
    // Добавляем вычисляемые поля
    const testsWithStats = tests.map(test => ({
      ...test,
      percentage: test.maxScore > 0 ? 
        Math.round((test.score / test.maxScore) * 100) : 0,
      userName: test.userId ? 
        `${test.userId.firstName} ${test.userId.lastName}` : 'Unknown User',
      userEmail: test.userId?.email || 'unknown@email.com'
    }));
    
    // Получаем общую статистику
    const overallStats = await Test.getOverallStats();
    
    res.json({
      tests: testsWithStats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      overallStats
    });
  }} catch (error) {
    console.error('Get test results error:', error);
    res.status(500).json({
      error: 'Test Results Retrieval Failed',
      message: 'Failed to retrieve test results'
    });
  }
};

// Запуск тестирования
const startTesting = async (req, res) => {
  try {
    const { duration, questionsPerTest } = req.body;
    
    // Получаем текущие настройки
    let settings = await Settings.getCurrentSettings();
    
    // Проверяем, не запущено ли уже тестирование
    if (settings.testStarted) {
      return res.status(400).json({
        error: 'Test Already Started',
        message: 'Testing is already in progress'
      });
    }
    
    // Валидируем возможность генерации тестов
    const validation = await validateTestGeneration(questionsPerTest || settings.questionsPerTest);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Insufficient Questions',
        message: validation.message,
        details: validation
      });
    }
    
    // Обновляем настройки если переданы новые значения
    if (duration) settings.testDuration = duration;
    if (questionsPerTest) settings.questionsPerTest = questionsPerTest;
    settings.lastModifiedBy = req.user._id;
    
    // Запускаем тестирование
    await settings.startTest();
    
    // Запускаем тестирование
    await settings.startTest();
    
    // Получаем статистику по пользователям
    const totalUsers = await User.countDocuments({ role: 'user' });
    const usersWithTests = await User.countDocuments({ role: 'user', testId: { $ne: null } });
    
    res.json({
      message: 'Testing started successfully',
      settings: settings.getClientConfig(),
      stats: {
        totalUsers,
        usersWithTests,
        questionsAvailable: validation.totalQuestions,
        questionsPerTest: settings.questionsPerTest
      }
    });
    
  } catch (error) {
    console.error('Start testing error:', error);
    res.status(500).json({
      error: 'Start Testing Failed',
      message: 'Failed to start testing'
    });
  }
};

// Остановка тестирования
const stopTesting = async (req, res) => {
  try {
    const settings = await Settings.getCurrentSettings();
    
    if (!settings.testStarted) {
      return res.status(400).json({
        error: 'Test Not Started',
        message: 'Testing is not currently active'
      });
    }
    
    // Останавливаем тестирование
    await settings.stopTest();
    
    // Автоматически завершаем все незавершенные тесты
    const activeTests = await Test.find({ isCompleted: false });
    let completedCount = 0;
    
    for (const test of activeTests) {
      await test.completeTest();
      completedCount++;
    }
    
    res.json({
      message: 'Testing stopped successfully',
      settings: settings.getClientConfig(),
      completedTests: completedCount
    });
    
  } catch (error) {
    console.error('Stop testing error:', error);
    res.status(500).json({
      error: 'Stop Testing Failed',
      message: 'Failed to stop testing'
    });
  }
};

// Обновление настроек
const updateSettings = async (req, res) => {
  try {
    const settings = await Settings.getCurrentSettings();
    
    // Если тестирование активно, разрешаем изменять только определенные настройки
    if (settings.testStarted) {
      const allowedDuringTest = ['instructions', 'welcomeMessage', 'showResultsImmediately'];
      const updates = {};
      
      Object.keys(req.body).forEach(key => {
        if (allowedDuringTest.includes(key)) {
          updates[key] = req.body[key];
        }
      });
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          error: 'Settings Update Failed',
          message: 'Cannot modify these settings while testing is active',
          allowedDuringTest
        });
      }
      
      await settings.updateSettings(updates, req.user._id);
    } else {
      // Если тестирование не активно, разрешаем изменять все настройки
      await settings.updateSettings(req.body, req.user._id);
    }
    
    res.json({
      message: 'Settings updated successfully',
      settings: settings.getClientConfig()
    });
    
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      error: 'Settings Update Failed',
      message: 'Failed to update settings'
    });
  }
};

// Получение настроек
const getSettings = async (req, res) => {
  try {
    const settings = await Settings.getCurrentSettings();
    
    res.json({
      settings: settings.getClientConfig(),
      fullSettings: {
        ...settings.toObject(),
        testStatus: settings.testStatus,
        remainingTime: settings.getRemainingTime(),
        formattedDuration: settings.formattedDuration
      }
    });
    
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      error: 'Settings Retrieval Failed',
      message: 'Failed to retrieve settings'
    });
  }
};

// Получение подробной статистики
const getDashboardStats = async (req, res) => {
  try {
    // Статистика пользователей
    const userStats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const usersByRole = {};
    userStats.forEach(stat => {
      usersByRole[stat._id] = stat.count;
    });
    
    // Статистика тестов
    const testStats = await Test.aggregate([
      {
        $group: {
          _id: null,
          totalTests: { $sum: 1 },
          completedTests: { $sum: { $cond: ['$isCompleted', 1, 0] } },
          averageScore: { $avg: '$score' },
          maxScore: { $max: '$score' },
          averageTime: { $avg: '$timeSpent' }
        }
      }
    ]);
    
    // Статистика вопросов
    const questionStats = await Question.aggregate([
      {
        $group: {
          _id: '$difficulty',
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } }
        }
      }
    ]);
    
    const questionsByDifficulty = {};
    questionStats.forEach(stat => {
      questionsByDifficulty[stat._id] = stat;
    });
    
    // Топ результаты
    const topResults = await Test.getTopResults(10);
    
    // Активность по времени (последние 30 дней)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const activityStats = await Test.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          isCompleted: true
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$completedAt' }
          },
          completedTests: { $sum: 1 },
          averageScore: { $avg: '$score' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);
    
    // Текущие настройки
    const settings = await Settings.getCurrentSettings();
    
    res.json({
      users: {
        total: Object.values(usersByRole).reduce((sum, count) => sum + count, 0),
        byRole: usersByRole,
        regular: usersByRole.user || 0,
        admins: usersByRole.admin || 0
      },
      tests: testStats[0] || {
        totalTests: 0,
        completedTests: 0,
        averageScore: 0,
        maxScore: 0,
        averageTime: 0
      },
      questions: {
        total: Object.values(questionsByDifficulty).reduce((sum, stat) => sum + stat.total, 0),
        active: Object.values(questionsByDifficulty).reduce((sum, stat) => sum + stat.active, 0),
        byDifficulty: questionsByDifficulty
      },
      topResults,
      activityStats,
      currentSettings: settings.getClientConfig(),
      systemStatus: {
        testingActive: settings.testStarted,
        remainingTime: settings.getRemainingTime(),
        canStartTesting: !settings.testStarted,
        canStopTesting: settings.testStarted
      }
    });
    
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      error: 'Stats Retrieval Failed',
      message: 'Failed to retrieve dashboard statistics'
    });
  }
};

// Получение детальной информации о пользователе
const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .populate('testId')
      .select('-password');
    
    if (!user) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User with this ID does not exist'
      });
    }
    
    let testDetails = null;
    if (user.testId) {
      testDetails = user.testId.toObject();
      testDetails.results = user.testId.getResults();
      
      if (user.testId.isCompleted) {
        testDetails.detailedResults = await user.testId.getDetailedStats();
      }
    }
    
    res.json({
      user: user.toObject(),
      test: testDetails
    });
    
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({
      error: 'User Details Retrieval Failed',
      message: 'Failed to retrieve user details'
    });
  }
};

// Экспорт результатов тестирования
const exportResults = async (req, res) => {
  try {
    const { format = 'csv', completed } = req.query;
    
    const filter = {};
    if (completed !== undefined) {
      filter.isCompleted = completed === 'true';
    }
    
    const tests = await Test.find(filter)
      .populate('userId', 'firstName lastName email')
      .sort('-completedAt')
      .lean();
    
    if (tests.length === 0) {
      return res.status(404).json({
        error: 'No Results Found',
        message: 'No test results match the specified criteria'
      });
    }
    
    // Подготавливаем данные для экспорта
    const exportData = tests.map(test => ({
      'User ID': test.userId?._id || 'Unknown',
      'User Name': test.userId ? `${test.userId.firstName} ${test.userId.lastName}` : 'Unknown User',
      'Email': test.userId?.email || 'unknown@email.com',
      'Test ID': test._id,
      'Score': test.score,
      'Max Score': test.maxScore,
      'Percentage': test.maxScore > 0 ? Math.round((test.score / test.maxScore) * 100) : 0,
      'Questions Total': test.questions.length,
      'Questions Answered': test.answers.length,
      'Is Completed': test.isCompleted ? 'Yes' : 'No',
      'Started At': test.startedAt ? new Date(test.startedAt).toISOString() : '',
      'Completed At': test.completedAt ? new Date(test.completedAt).toISOString() : '',
      'Time Spent (seconds)': test.timeSpent || 0,
      'Time Spent (formatted)': formatTime(test.timeSpent || 0),
      'Created At': new Date(test.createdAt).toISOString()
    }));
    
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="test_results_${new Date().toISOString().split('T')[0]}.json"`);
      res.send(JSON.stringify(exportData, null, 2));
    } else {
      // CSV export
      const csv = convertToCSV(exportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="test_results_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    }
    
  } catch (error) {
    console.error('Export results error:', error);
    res.status(500).json({
      error: 'Export Failed',
      message: 'Failed to export test results'
    });
  }
};

// Сброс теста пользователя (только для экстренных случаев)
const resetUserTest = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User with this ID does not exist'
      });
    }
    
    if (!user.testId) {
      return res.status(400).json({
        error: 'No Test Found',
        message: 'User has no test to reset'
      });
    }
    
    const test = await Test.findById(user.testId);
    if (test && test.isCompleted) {
      return res.status(400).json({
        error: 'Test Completed',
        message: 'Cannot reset a completed test'
      });
    }
    
    // Сбрасываем статус пользователя
    user.hasStartedTest = false;
    user.testStartTime = null;
    user.testEndTime = null;
    await user.save();
    
    // Сбрасываем тест
    if (test) {
      test.answers = [];
      test.score = 0;
      test.startedAt = null;
      test.isCompleted = false;
      await test.save();
    }
    
    // Логируем действие
    console.log(`Admin ${req.user.email} reset test for user ${user.email}. Reason: ${reason || 'Not specified'}`);
    
    res.json({
      message: 'User test reset successfully',
      user: {
        id: user._id,
        email: user.email,
        hasStartedTest: user.hasStartedTest
      }
    });
    
  } catch (error) {
    console.error('Reset user test error:', error);
    res.status(500).json({
      error: 'Test Reset Failed',
      message: 'Failed to reset user test'
    });
  }
};

// Utility функции
const formatTime = (seconds) => {
  if (!seconds) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const convertToCSV = (data) => {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      const escaped = String(value).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
};

module.exports = {
  getAllUsers,
  getTestResults,
  startTesting,
  stopTesting,
  updateSettings,
  getSettings,
  getDashboardStats,
  getUserDetails,
  exportResults,
  resetUserTest
};