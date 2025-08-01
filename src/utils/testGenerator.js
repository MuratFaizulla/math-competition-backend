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
    console.log(`Starting test generation for user: ${userId}`);
    
    // Получаем настройки
    const settings = await Settings.getCurrentSettings();
    if (!settings) {
      throw new Error('Test settings not found');
    }
    
    const questionsPerTest = settings.questionsPerTest || 30; // fallback значение
    console.log(`Questions per test: ${questionsPerTest}`);
    
    // Проверяем, есть ли уже тест у пользователя
    const existingTest = await Test.findOne({ userId });
    if (existingTest) {
      console.log(`Existing test found for user ${userId}: ${existingTest._id}`);
      return existingTest;
    }
    
    // Получаем общее количество активных вопросов
    const totalQuestions = await Question.countDocuments({ isActive: true });
    console.log(`Total active questions available: ${totalQuestions}`);
    
    if (totalQuestions === 0) {
      throw new Error('No active questions found in database');
    }
    
    if (totalQuestions < questionsPerTest) {
      console.warn(`Not enough questions available. Need ${questionsPerTest}, but only ${totalQuestions} found. Using all available questions.`);
    }
    
    const actualQuestionsCount = Math.min(questionsPerTest, totalQuestions);
    
    // Получаем случайные вопросы
    let randomQuestions;
    
    try {
      if (settings.randomizeQuestions) {
        // Если настроена рандомизация, используем сбалансированную выборку
        console.log('Using balanced random question selection');
        randomQuestions = await getBalancedRandomQuestions(actualQuestionsCount);
      } else {
        // Простая случайная выборка
        console.log('Using simple random question selection');
        randomQuestions = await getSimpleRandomQuestions(actualQuestionsCount);
      }
    } catch (questionError) {
      console.error('Error getting random questions:', questionError);
      // Fallback к простой выборке
      randomQuestions = await getSimpleRandomQuestions(actualQuestionsCount);
    }
    
    if (!randomQuestions || randomQuestions.length === 0) {
      throw new Error('Could not retrieve any questions for test generation');
    }
    
    console.log(`Selected ${randomQuestions.length} questions for test`);
    
    // Создаем тест
    const test = new Test({
      userId,
      questions: randomQuestions.map(q => q._id),
      answers: [],
      isCompleted: false,
      score: 0,
      maxScore: randomQuestions.reduce((sum, q) => sum + (q.points || 1), 0),
      startedAt: null,
      completedAt: null,
      timeSpent: 0
    });
    
    await test.save();
    
    console.log(`✅ Generated unique test ${test._id} for user ${userId} with ${randomQuestions.length} questions`);
    
    return test;
    
  } catch (error) {
    console.error('Error generating unique test:', error);
    throw new Error(`Failed to generate test: ${error.message}`);
  }
};

/**
 * Простая случайная выборка вопросов
 * @param {number} count - Количество вопросов
 * @returns {Array} - Массив вопросов
 */
const getSimpleRandomQuestions = async (count) => {
  try {
    // Используем aggregate с $sample для случайной выборки
    const questions = await Question.aggregate([
      { $match: { isActive: true } },
      { $sample: { size: count } }
    ]);
    
    console.log(`Retrieved ${questions.length} questions using simple random selection`);
    return questions;
    
  } catch (error) {
    console.error('Error in simple random question selection:', error);
    
    // Fallback - получаем все вопросы и перемешиваем
    try {
      const allQuestions = await Question.find({ isActive: true }).limit(count * 2);
      const shuffled = shuffleArray(allQuestions);
      return shuffled.slice(0, count);
    } catch (fallbackError) {
      console.error('Fallback question selection also failed:', fallbackError);
      throw new Error('Unable to retrieve questions');
    }
  }
};

/**
 * Генерирует сбалансированную выборку вопросов по сложности
 * @param {number} totalQuestions - Общее количество вопросов
 * @returns {Array} - Массив вопросов
 */
const getBalancedRandomQuestions = async (totalQuestions) => {
  try {
    console.log(`Generating balanced question set for ${totalQuestions} questions`);
    
    // Определяем распределение по сложности (40% easy, 40% medium, 20% hard)
    const easyCount = Math.floor(totalQuestions * 0.4);
    const mediumCount = Math.floor(totalQuestions * 0.4);
    const hardCount = totalQuestions - easyCount - mediumCount;
    
    console.log(`Target distribution - Easy: ${easyCount}, Medium: ${mediumCount}, Hard: ${hardCount}`);
    
    // Получаем вопросы по каждой категории сложности
    const [easyQuestions, mediumQuestions, hardQuestions] = await Promise.all([
      getQuestionsByDifficulty('easy', easyCount),
      getQuestionsByDifficulty('medium', mediumCount),
      getQuestionsByDifficulty('hard', hardCount)
    ]);
    
    console.log(`Retrieved - Easy: ${easyQuestions.length}, Medium: ${mediumQuestions.length}, Hard: ${hardQuestions.length}`);
    
    // Объединяем и перемешиваем
    const allQuestions = [...easyQuestions, ...mediumQuestions, ...hardQuestions];
    
    // Если не хватает вопросов, дополняем любыми доступными
    if (allQuestions.length < totalQuestions) {
      const usedIds = allQuestions.map(q => q._id);
      const additionalCount = totalQuestions - allQuestions.length;
      
      const additionalQuestions = await Question.aggregate([
        { 
          $match: { 
            isActive: true,
            _id: { $nin: usedIds }
          }
        },
        { $sample: { size: additionalCount } }
      ]);
      
      allQuestions.push(...additionalQuestions);
      console.log(`Added ${additionalQuestions.length} additional questions`);
    }
    
    return shuffleArray(allQuestions);
    
  } catch (error) {
    console.error('Error generating balanced questions:', error);
    // Fallback к простой случайной выборке
    console.log('Falling back to simple random selection');
    return await getSimpleRandomQuestions(totalQuestions);
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
    if (count <= 0) return [];
    
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
      canGenerateTests: totalQuestions >= 10 // Минимум 10 вопросов для генерации
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

// ВАЖНО: Экспорт всех функций
module.exports = {
  generateUniqueTest,
  getBalancedRandomQuestions,
  getQuestionsByDifficulty,
  getSimpleRandomQuestions,
  shuffleArray,
  generateMultipleTests,
  regenerateTest,
  getTestGenerationStats
};