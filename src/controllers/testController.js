const Test = require('../models/Test');
const User = require('../models/User');
const Settings = require('../models/Settings');
const Question = require('../models/Question');

// Получение теста пользователя
const getMyTest = async (req, res) => {
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
    
    // Получаем настройки
    const settings = await Settings.getCurrentSettings();
    
    // Проверяем статус тестирования
    if (!settings.testStarted) {
      return res.status(403).json({
        error: 'Test Not Started',
        message: 'Testing has not been started by administrator'
      });
    }
    
    // Базовая информация о тесте
    const testInfo = {
      id: test._id,
      questionsCount: test.questions.length,
      answeredCount: test.answers.length,
      maxScore: test.maxScore,
      isCompleted: test.isCompleted,
      startedAt: test.startedAt,
      completedAt: test.completedAt
    };
    
    // Если тест завершен, отправляем результаты
    if (test.isCompleted) {
      testInfo.score = test.score;
      testInfo.timeSpent = test.timeSpent;
      testInfo.results = test.getResults();
      
      if (settings.showCorrectAnswers) {
        testInfo.detailedResults = await test.getDetailedStats();
      }
    }
    
    res.json({
      test: testInfo,
      testConfig: settings.getClientConfig(),
      canStart: !test.isCompleted && !user.hasStartedTest,
      canContinue: user.hasStartedTest && !test.isCompleted && !user.isTestExpired(settings.testDuration)
    });
    
  } catch (error) {
    console.error('Get my test error:', error);
    res.status(500).json({
      error: 'Test Error',
      message: 'Failed to retrieve test information'
    });
  }
};

// Начало прохождения теста
const startTest = async (req, res) => {
  try {
    const user = req.user;
    const settings = req.settings; // Из middleware requireActiveTest
    
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
    
    // Проверяем, не начат ли уже тест
    if (user.hasStartedTest) {
      return res.status(400).json({
        error: 'Test Already Started',
        message: 'You have already started the test'
      });
    }
    
    // Проверяем, не завершен ли тест
    if (test.isCompleted) {
      return res.status(400).json({
        error: 'Test Already Completed',
        message: 'Test has already been completed'
      });
    }
    
    // Начинаем тест
    const now = new Date();
    
    // Обновляем пользователя
    user.hasStartedTest = true;
    user.testStartTime = now;
    await user.save();
    
    // Обновляем тест
    test.startedAt = now;
    test.ipAddress = req.ip;
    test.userAgent = req.get('User-Agent');
    await test.save();
    
    // Получаем первый вопрос
    const currentQuestion = await test.getCurrentQuestion();
    
    res.json({
      message: 'Test started successfully',
      test: {
        id: test._id,
        questionsCount: test.questions.length,
        currentQuestionIndex: 0,
        startedAt: test.startedAt,
        maxScore: test.maxScore
      },
      currentQuestion,
      timeRemaining: settings.testDuration * 60, // в секундах
      testConfig: settings.getClientConfig()
    });
    
  } catch (error) {
    console.error('Start test error:', error);
    res.status(500).json({
      error: 'Test Start Failed',
      message: 'Failed to start test'
    });
  }
};

// Получение текущего вопроса
const getCurrentQuestion = async (req, res) => {
  try {
    const user = req.user;
    
    if (!user.hasStartedTest) {
      return res.status(400).json({
        error: 'Test Not Started',
        message: 'You have not started the test yet'
      });
    }
    
    const test = await Test.findById(user.testId);
    if (!test) {
      return res.status(404).json({
        error: 'Test Not Found',
        message: 'Test not found'
      });
    }
    
    if (test.isCompleted) {
      return res.status(400).json({
        error: 'Test Completed',
        message: 'Test has already been completed'
      });
    }
    
    const currentQuestion = await test.getCurrentQuestion();
    
    if (!currentQuestion) {
      // Все вопросы отвечены, автоматически завершаем тест
      await test.completeTest();
      
      return res.json({
        message: 'All questions answered, test completed',
        isCompleted: true,
        results: test.getResults()
      });
    }
    
    // Получаем настройки для проверки времени
    const settings = await Settings.getCurrentSettings();
    const timeRemaining = Math.max(0, settings.testDuration * 60 - Math.floor((new Date() - user.testStartTime) / 1000));
    
    res.json({
      currentQuestion,
      progress: {
        current: test.answers.length + 1,
        total: test.questions.length,
        answered: test.answers.length
      },
      timeRemaining,
      score: test.score
    });
    
  } catch (error) {
    console.error('Get current question error:', error);
    res.status(500).json({
      error: 'Question Error',
      message: 'Failed to get current question'
    });
  }
};

// Отправка ответа на вопрос
const submitAnswer = async (req, res) => {
  try {
    const user = req.user;
    const { questionIndex, selectedAnswer } = req.body;
    
    if (!user.hasStartedTest) {
      return res.status(400).json({
        error: 'Test Not Started',
        message: 'You have not started the test yet'
      });
    }
    
    const test = await Test.findById(user.testId);
    if (!test) {
      return res.status(404).json({
        error: 'Test Not Found',
        message: 'Test not found'
      });
    }
    
    if (test.isCompleted) {
      return res.status(400).json({
        error: 'Test Completed',
        message: 'Test has already been completed'
      });
    }
    
    // Проверяем время
    const settings = await Settings.getCurrentSettings();
    if (user.isTestExpired(settings.testDuration)) {
      await test.completeTest();
      
      return res.status(403).json({
        error: 'Test Time Expired',
        message: 'Your test time has expired',
        results: test.getResults()
      });
    }
    
    // Отправляем ответ
    const answerResult = await test.submitAnswer(questionIndex, selectedAnswer);
    
    // Проверяем, завершен ли тест
    const nextQuestion = await test.getCurrentQuestion();
    let responseData = {
      message: 'Answer submitted successfully',
      answerResult: {
        isCorrect: answerResult.isCorrect,
        points: answerResult.points
      },
      progress: {
        current: test.answers.length,
        total: test.questions.length,
        answered: test.answers.length
      },
      score: test.score,
      isCompleted: !nextQuestion
    };
    
    // Если настроено показывать правильные ответы
    if (settings.showCorrectAnswers) {
      responseData.answerResult.correctAnswer = answerResult.correctAnswer;
      responseData.answerResult.explanation = answerResult.explanation;
    }
    
    // Если есть следующий вопрос
    if (nextQuestion) {
      responseData.nextQuestion = nextQuestion;
      
      const timeRemaining = Math.max(0, settings.testDuration * 60 - Math.floor((new Date() - user.testStartTime) / 1000));
      responseData.timeRemaining = timeRemaining;
    } else {
      // Тест завершен
      await test.completeTest();
      responseData.results = test.getResults();
      
      if (settings.showResultsImmediately) {
        responseData.detailedResults = await test.getDetailedStats();
      }
    }
    
    res.json(responseData);
    
  } catch (error) {
    console.error('Submit answer error:', error);
    
    if (error.message.includes('Invalid question sequence')) {
      return res.status(400).json({
        error: 'Invalid Sequence',
        message: 'Questions must be answered in order'
      });
    }
    
    res.status(500).json({
      error: 'Answer Submission Failed',
      message: 'Failed to submit answer'
    });
  }
};

// Принудительное завершение теста
const submitTest = async (req, res) => {
  try {
    const user = req.user;
    
    if (!user.hasStartedTest) {
      return res.status(400).json({
        error: 'Test Not Started',
        message: 'You have not started the test yet'
      });
    }
    
    const test = await Test.findById(user.testId);
    if (!test) {
      return res.status(404).json({
        error: 'Test Not Found',
        message: 'Test not found'
      });
    }
    
    if (test.isCompleted) {
      return res.status(400).json({
        error: 'Test Already Completed',
        message: 'Test has already been completed'
      });
    }
    
    // Завершаем тест
    await test.completeTest();
    
    // Получаем настройки
    const settings = await Settings.getCurrentSettings();
    
    const results = test.getResults();
    let responseData = {
      message: 'Test submitted successfully',
      results
    };
    
    // Если настроено показывать детальные результаты
    if (settings.showResultsImmediately) {
      responseData.detailedResults = await test.getDetailedStats();
    }
    
    res.json(responseData);
    
  } catch (error) {
    console.error('Submit test error:', error);
    res.status(500).json({
      error: 'Test Submission Failed',
      message: 'Failed to submit test'
    });
  }
};

// Получение результатов теста
const getTestResults = async (req, res) => {
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
        message: 'Test not found'
      });
    }
    
    if (!test.isCompleted) {
      return res.status(400).json({
        error: 'Test Not Completed',
        message: 'Test has not been completed yet'
      });
    }
    
    const settings = await Settings.getCurrentSettings();
    const results = test.getResults();
    
    let responseData = {
      results,
      isPassed: results.percentage >= settings.passingScore
    };
    
    // Если настроено показывать детальные результаты
    if (settings.showCorrectAnswers) {
      responseData.detailedResults = await test.getDetailedStats();
    }
    
    res.json(responseData);
    
  } catch (error) {
    console.error('Get test results error:', error);
    res.status(500).json({
      error: 'Results Error',
      message: 'Failed to get test results'
    });
  }
};

// Получение статуса тестирования
const getTestStatus = async (req, res) => {
  try {
    const settings = await Settings.getCurrentSettings();
    
    res.json({
      testStarted: settings.testStarted,
      testDuration: settings.testDuration,
      questionsPerTest: settings.questionsPerTest,
      testStartTime: settings.testStartTime,
      remainingTime: settings.getRemainingTime(),
      isExpired: settings.isTestExpired(),
      status: settings.testStatus,
      instructions: settings.instructions,
      welcomeMessage: settings.welcomeMessage
    });
    
  } catch (error) {
    console.error('Get test status error:', error);
    res.status(500).json({
      error: 'Status Error',
      message: 'Failed to get test status'
    });
  }
};

module.exports = {
  getMyTest,
  startTest,
  getCurrentQuestion,
  submitAnswer,
  submitTest,
  getTestResults,
  getTestStatus
};