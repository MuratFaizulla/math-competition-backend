const User = require('../models/User');
const Test = require('../models/Test');
const Settings = require('../models/Settings');

// Получение профиля текущего пользователя (дублирует authController.getProfile для удобства)
const getProfile = async (req, res) => {
  try {
    const user = req.user;
    
    // Получаем настройки
    const settings = await Settings.getCurrentSettings();
    
    // Получаем информацию о тесте
    let testInfo = null;
    if (user.testId) {
      const test = await Test.findById(user.testId);
      if (test) {
        testInfo = test.getResults();
        testInfo.questionsCount = test.questions.length;
        testInfo.startedAt = test.startedAt;
        testInfo.completedAt = test.completedAt;
        
        // Если тест завершен и разрешено показывать результаты
        if (test.isCompleted && settings.showResultsImmediately) {
          testInfo.detailedResults = await test.getDetailedStats();
        }
      }
    }
    
    res.json({
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        role: user.role,
        hasStartedTest: user.hasStartedTest,
        testStartTime: user.testStartTime,
        testEndTime: user.testEndTime,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      },
      test: testInfo,
      testConfig: settings.getClientConfig()
    });
    
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      error: 'Profile Error',
      message: 'Failed to retrieve user profile'
    });
  }
};

// Обновление профиля пользователя
const updateProfile = async (req, res) => {
  try {
    const user = req.user;
    const { firstName, lastName } = req.body;
    
    // Обновляем только разрешенные поля
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    
    await user.save();
    
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('Update user profile error:', error);
    res.status(500).json({
      error: 'Update Failed',
      message: 'Failed to update user profile'
    });
  }
};

// Получение статистики пользователя
const getUserStats = async (req, res) => {
  try {
    const user = req.user;
    
    if (!user.testId) {
      return res.json({
        hasTest: false,
        message: 'No test assigned'
      });
    }
    
    const test = await Test.findById(user.testId);
    if (!test) {
      return res.json({
        hasTest: false,
        message: 'Test not found'
      });
    }
    
    const results = test.getResults();
    const settings = await Settings.getCurrentSettings();
    
    // Базовая статистика
    const stats = {
      hasTest: true,
      test: {
        ...results,
        questionsCount: test.questions.length,
        startedAt: test.startedAt,
        completedAt: test.completedAt,
        isPassed: results.percentage >= settings.passingScore
      },
      progress: {
        questionsAnswered: test.answers.length,
        questionsRemaining: test.questions.length - test.answers.length,
        progressPercentage: test.questions.length > 0 ? 
          Math.round((test.answers.length / test.questions.length) * 100) : 0
      }
    };
    
    // Если тест завершен, добавляем детальную статистику
    if (test.isCompleted) {
      // Статистика по сложности
      const difficultyStats = {};
      for (const answer of test.answers) {
        const question = await Test.findById(test._id)
          .populate({
            path: 'questions',
            match: { _id: answer.questionId },
            select: 'difficulty'
          });
        
        if (question.questions.length > 0) {
          const difficulty = question.questions[0].difficulty;
          if (!difficultyStats[difficulty]) {
            difficultyStats[difficulty] = { total: 0, correct: 0 };
          }
          difficultyStats[difficulty].total++;
          if (answer.isCorrect) {
            difficultyStats[difficulty].correct++;
          }
        }
      }
      
      // Добавляем проценты
      Object.keys(difficultyStats).forEach(difficulty => {
        const stat = difficultyStats[difficulty];
        stat.percentage = stat.total > 0 ? 
          Math.round((stat.correct / stat.total) * 100) : 0;
      });
      
      stats.detailedStats = {
        difficultyBreakdown: difficultyStats,
        averageTimePerQuestion: test.timeSpent > 0 && test.answers.length > 0 ? 
          Math.round(test.timeSpent / test.answers.length) : 0
      };
      
      // Если разрешено показывать правильные ответы
      if (settings.showCorrectAnswers) {
        stats.detailedResults = await test.getDetailedStats();
      }
    }
    
    res.json(stats);
    
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      error: 'Stats Error',
      message: 'Failed to retrieve user statistics'
    });
  }
};

// Получение прогресса теста пользователя
const getTestProgress = async (req, res) => {
  try {
    const user = req.user;
    
    if (!user.testId) {
      return res.status(404).json({
        error: 'Test Not Found',
        message: 'No test assigned to user'
      });
    }
    
    const test = await Test.findById(user.testId);
    if (!test) {
      return res.status(404).json({
        error: 'Test Not Found',
        message: 'Test not found in database'
      });
    }
    
    const settings = await Settings.getCurrentSettings();
    
    // Базовый прогресс
    const progress = {
      questionsTotal: test.questions.length,
      questionsAnswered: test.answers.length,
      questionsRemaining: test.questions.length - test.answers.length,
      currentScore: test.score,
      maxScore: test.maxScore,
      isCompleted: test.isCompleted,
      hasStarted: user.hasStartedTest,
      startedAt: test.startedAt,
      completedAt: test.completedAt
    };
    
    // Вычисляем проценты
    progress.progressPercentage = progress.questionsTotal > 0 ? 
      Math.round((progress.questionsAnswered / progress.questionsTotal) * 100) : 0;
    
    progress.scorePercentage = progress.maxScore > 0 ? 
      Math.round((progress.currentScore / progress.maxScore) * 100) : 0;
    
    // Информация о времени
    if (user.hasStartedTest && user.testStartTime) {
      const now = new Date();
      const elapsed = Math.floor((now - user.testStartTime) / 1000);
      const totalTime = settings.testDuration * 60;
      const remaining = Math.max(0, totalTime - elapsed);
      
      progress.timeInfo = {
        totalTimeSeconds: totalTime,
        elapsedTimeSeconds: elapsed,
        remainingTimeSeconds: remaining,
        isExpired: remaining === 0,
        formattedElapsed: formatTime(elapsed),
        formattedRemaining: formatTime(remaining)
      };
    }
    
    // Статус тестирования
    progress.canStart = !user.hasStartedTest && !test.isCompleted && 
                      settings.testStarted && !settings.isTestExpired();
    
    progress.canContinue = user.hasStartedTest && !test.isCompleted && 
                          !user.isTestExpired(settings.testDuration);
    
    res.json({
      progress,
      testConfig: settings.getClientConfig()
    });
    
  } catch (error) {
    console.error('Get test progress error:', error);
    res.status(500).json({
      error: 'Progress Error',
      message: 'Failed to retrieve test progress'
    });
  }
};

// Получение истории активности пользователя
const getUserActivity = async (req, res) => {
  try {
    const user = req.user;
    
    const activity = {
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        registeredAt: user.createdAt,
        lastLogin: user.lastLogin
      },
      timeline: []
    };
    
    // Добавляем событие регистрации
    activity.timeline.push({
      type: 'registration',
      timestamp: user.createdAt,
      description: 'User registered',
      details: {
        email: user.email
      }
    });
    
    // Добавляем событие последнего входа
    if (user.lastLogin && user.lastLogin.getTime() !== user.createdAt.getTime()) {
      activity.timeline.push({
        type: 'login',
        timestamp: user.lastLogin,
        description: 'Last login',
        details: {}
      });
    }
    
    // Информация о тесте
    if (user.testId) {
      const test = await Test.findById(user.testId);
      if (test) {
        // Создание теста
        activity.timeline.push({
          type: 'test_created',
          timestamp: test.createdAt,
          description: 'Test assigned',
          details: {
            questionsCount: test.questions.length,
            maxScore: test.maxScore
          }
        });
        
        // Начало теста
        if (test.startedAt) {
          activity.timeline.push({
            type: 'test_started',
            timestamp: test.startedAt,
            description: 'Test started',
            details: {
              questionsCount: test.questions.length
            }
          });
        }
        
        // Ответы на вопросы (показываем только последние 10)
        const recentAnswers = test.answers
          .sort((a, b) => new Date(b.answeredAt) - new Date(a.answeredAt))
          .slice(0, 10);
        
        recentAnswers.forEach((answer, index) => {
          activity.timeline.push({
            type: 'question_answered',
            timestamp: answer.answeredAt,
            description: `Question answered ${answer.isCorrect ? 'correctly' : 'incorrectly'}`,
            details: {
              isCorrect: answer.isCorrect,
              points: answer.points,
              questionNumber: test.answers.length - index
            }
          });
        });
        
        // Завершение теста
        if (test.completedAt) {
          activity.timeline.push({
            type: 'test_completed',
            timestamp: test.completedAt,
            description: 'Test completed',
            details: {
              score: test.score,
              maxScore: test.maxScore,
              percentage: test.maxScore > 0 ? 
                Math.round((test.score / test.maxScore) * 100) : 0,
              timeSpent: test.timeSpent
            }
          });
        }
      }
    }
    
    // Сортируем по времени (новые сначала)
    activity.timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json(activity);
    
  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({
      error: 'Activity Error',
      message: 'Failed to retrieve user activity'
    });
  }
};

// Utility функция для форматирования времени
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

module.exports = {
  getProfile,
  updateProfile,
  getUserStats,
  getTestProgress,
  getUserActivity
};