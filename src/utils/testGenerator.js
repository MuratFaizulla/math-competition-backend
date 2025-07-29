const Question = require('../models/Question');
const Test = require('../models/Test');
const Settings = require('../models/Settings');

/**
 * Генерирует уникальный тест для пользователя из случайных вопросов
 * @param {ObjectId} userId - ID пользователя
 * @returns {Test} - Созданный тест
 */
const generateUniqueTest = async (userId) => {
  try {
    // Получаем настройки
    const settings = await Settings.getCurrentSettings();
    const questionsPerTest = settings.questionsPerTest;
    
    // Проверяем, есть ли уже тест у пользователя
    const existingTest = await Test.findOne({ userId });
    if (existingTest) {
      return existingTest;
    }
    
    // Получаем общее количество активных вопросов
    const totalQuestions = await Question.countDocuments({ isActive: true });
    
    if (totalQuestions < questionsPerTest) {
      throw new Error(`Not enough questions available. Need ${questionsPerTest}, but only ${totalQuestions} found.`);
    }
    
    // Получаем случайные вопросы
    let randomQuestions;
    
    if (settings.randomizeQuestions) {
      // Если настроена рандомизация, используем сбалансированную выборку
      randomQuestions = await getBalancedRandomQuestions(questionsPerTest);
    } else {
      // Простая случайная выборка
      randomQuestions = await Question.getRandomQuestions(questionsPerTest);
    }
    
    if (randomQuestions.length < questionsPerTest) {
      throw new Error(`Could not generate enough unique questions. Generated ${randomQuestions.length}, needed ${questionsPerTest}.`);
    }
    
    // Создаем тест
    const test = new Test({
      userId,
      questions: randomQuestions.map(q => q._id),
      maxScore: randomQuestions.reduce((sum, q) => sum + (q.points || 1), 0)
    });
    
    await test.save();
    
    console.log(`✅ Generated unique test for user ${userId} with ${randomQuestions.length} questions`);
    
    return test;
    
  } catch (error) {
    console.error('Error generating unique test:', error);
    throw new Error(`Failed to generate test: ${error.message}`);
  }
};

/**
 * Генерирует сбалансированную выборку вопросов по сложности
 * @param {number} totalQuestions - Общее количество вопросов
 * @returns {Array} - Массив вопросов
 */
const getBalancedRandomQuestions = async (totalQuestions) => {
  try {
    // Определяем распределение по сложности (40% easy, 40% medium, 20% hard)
    const easyCount = Math.floor(totalQuestions * 0.4);
    const mediumCount = Math.floor(totalQuestions * 0.4);
    const hardCount = totalQuestions - easyCount - mediumCount;
    
    // Получаем вопросы по каждой категории сложности
    const [easyQuestions, mediumQuestions, hardQuestions] = await Promise.all([
      getQuestionsByDifficulty('easy', easyCount),
      getQuestionsByDifficulty('medium', mediumCount),
      getQuestionsByDifficulty('hard', hardCount)
    ]);
    
    // Объединяем и перемешиваем
    const allQuestions = [...easyQuestions, ...mediumQuestions, ...hardQuestions];
    
    return shuffleArray(allQuestions);
    
  } catch (error) {
    console.error('Error generating balanced questions:', error);
    // Fallback к простой случайной выборке
    return await Question.getRandomQuestions(totalQuestions);
  }
};

/**
 * Получает случайные вопросы определенной сложности
 * @param {string} difficulty - Уровень сложности
 * @param {number} count - Количество вопросов
 * @returns {Array} - Массив вопросов
 */
const getQuestionsByDifficulty = async (difficulty, count) => {
  try {
    const questions = await Question.aggregate([
      { $match: { isActive: true, difficulty } },
      { $sample: { size: count } }
    ]);
    
    // Если не хватает вопросов определенной сложности, дополняем любыми доступными
    if (questions.length < count) {
      const additionalCount = count - questions.length;
      const usedIds = questions.map(q => q._id);
      
      const additionalQuestions = await Question.aggregate([
        { 
          $match: { 
            isActive: true,
            _id: { $nin: usedIds }
          }
        },
        { $sample: { size: additionalCount } }
      ]);
      
      questions.push(...additionalQuestions);
    }
    
    return questions;
    
  } catch (error) {
    console.error(`Error getting ${difficulty} questions:`, error);
    return [];
  }
};

/**
 * Перемешивает массив (Fisher-Yates shuffle)
 * @param {Array} array - Массив для перемешивания
 * @returns {Array} - Перемешанный массив
 */
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Генерирует тесты для нескольких пользователей (массовая генерация)
 * @param {Array} userIds - Массив ID пользователей
 * @returns {Array} - Массив созданных тестов
 */
const generateMultipleTests = async (userIds) => {
  try {
    const tests = [];
    const errors = [];
    
    for (const userId of userIds) {
      try {
        const test = await generateUniqueTest(userId);
        tests.push(test);
      } catch (error) {
        errors.push({ userId, error: error.message });
      }
    }
    
    return { tests, errors };
    
  } catch (error) {
    console.error('Error generating multiple tests:', error);
    throw new Error(`Failed to generate multiple tests: ${error.message}`);
  }
};

/**
 * Регенерирует тест для пользователя (если нужно создать новый)
 * @param {ObjectId} userId - ID пользователя
 * @param {boolean} forceRegenerate - Принудительная регенерация
 * @returns {Test} - Обновленный тест
 */
const regenerateTest = async (userId, forceRegenerate = false) => {
  try {
    const existingTest = await Test.findOne({ userId });
    
    // Если тест уже начат или завершен, не регенерируем без принуждения
    if (existingTest && !forceRegenerate) {
      if (existingTest.startedAt || existingTest.isCompleted) {
        throw new Error('Cannot regenerate test that has been started or completed');
      }
    }
    
    // Удаляем существующий тест
    if (existingTest) {
      await Test.findByIdAndDelete(existingTest._id);
    }
    
    // Создаем новый тест
    const newTest = await generateUniqueTest(userId);
    
    console.log(`✅ Regenerated test for user ${userId}`);
    
    return newTest;
    
  } catch (error) {
    console.error('Error regenerating test:', error);
    throw new Error(`Failed to regenerate test: ${error.message}`);
  }
};

/**
 * Получает статистику по генерации тестов
 * @returns {Object} - Статистика
 */
const getTestGenerationStats = async () => {
  try {
    const [totalTests, totalQuestions, questionsByDifficulty] = await Promise.all([
      Test.countDocuments(),
      Question.countDocuments({ isActive: true }),
      Question.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$difficulty', count: { $sum: 1 } } }
      ])
    ]);
    
    const difficultyStats = {};
    questionsByDifficulty.forEach(item => {
      difficultyStats[item._id] = item.count;
    });
    
    return {
      totalTests,
      totalQuestions,
      difficultyDistribution: difficultyStats,
      canGenerateTests: totalQuestions >= 30
    };
    
  } catch (error) {
    console.error('Error getting test generation stats:', error);
    return {
      totalTests: 0,
      totalQuestions: 0,
      difficultyDistribution: {},
      canGenerateTests: false
    };
  }
};