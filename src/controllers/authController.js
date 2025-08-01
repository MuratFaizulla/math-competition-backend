const User = require('../models/User');
const Test = require('../models/Test');
const Question = require('../models/Question');
const Settings = require('../models/Settings');
const { generateToken } = require('../middleware/auth');

// Импорт с проверкой
let generateUniqueTest;
try {
  const testGeneratorModule = require('../utils/testGenerator');
  console.log('testGenerator module imported:', typeof testGeneratorModule);
  console.log('Available functions:', Object.keys(testGeneratorModule));
  
  generateUniqueTest = testGeneratorModule.generateUniqueTest;
  
  if (typeof generateUniqueTest !== 'function') {
    console.error('❌ generateUniqueTest is not a function!');
    console.error('Type:', typeof generateUniqueTest);
    console.error('Value:', generateUniqueTest);
  } else {
    console.log('✅ generateUniqueTest imported successfully');
  }
} catch (importError) {
  console.error('❌ Error importing testGenerator:', importError);
  // Создаем fallback функцию
  generateUniqueTest = async (userId) => {
    throw new Error('Test generator not available - import failed');
  };
}

// Утилитарная функция для валидации email
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Утилитарная функция для валидации пароля
const validatePassword = (password) => {
  return password && password.length >= 6;
};

// Утилитарная функция для валидации имен
const validateName = (name) => {
  return name && name.trim().length >= 2 && name.trim().length <= 50;
};

// Общая функция для получения информации о тесте
const getTestInfo = async (testId, includeResults = false) => {
  if (!testId) return null;
  
  try {
    const test = await Test.findById(testId);
    if (!test) return null;
    
    const testInfo = {
      questionsCount: test.questions.length,
      answeredCount: test.answers.length,
      isCompleted: test.isCompleted,
      score: test.score,
      maxScore: test.maxScore,
      startedAt: test.startedAt,
      completedAt: test.completedAt,
      timeSpent: test.timeSpent
    };
    
    // Если тест завершен и запрошены результаты
    if (includeResults && test.isCompleted && typeof test.getResults === 'function') {
      testInfo.results = test.getResults();
    }
    
    return testInfo;
  } catch (error) {
    console.error('Error getting test info:', error);
    return null;
  }
};

// Общая функция для формирования ответа пользователя
const getUserResponse = (user, includeExtendedInfo = false) => {
  const baseUser = {
    id: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    testId: user.testId,
    hasStartedTest: user.hasStartedTest
  };
  
  if (includeExtendedInfo) {
    return {
      ...baseUser,
      fullName: user.fullName,
      testStartTime: user.testStartTime,
      testEndTime: user.testEndTime,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt
    };
  }
  
  return baseUser;
};

// Регистрация пользователя
const register = async (req, res) => {
  let createdUser = null;
  
  try {
    const { email, password, firstName, lastName } = req.body;
    
    console.log(`Registration attempt for email: ${email}`);
    
    // Валидация входных данных
    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Valid email is required'
      });
    }
    
    if (!validatePassword(password)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Password must be at least 6 characters long'
      });
    }
    
    if (!validateName(firstName)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'First name must be between 2 and 50 characters'
      });
    }
    
    if (!validateName(lastName)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Last name must be between 2 and 50 characters'
      });
    }
    
    // Проверяем импорт функции generateUniqueTest
    if (typeof generateUniqueTest !== 'function') {
      console.error('generateUniqueTest is not a function. Import issue detected.');
      console.error('Type of generateUniqueTest:', typeof generateUniqueTest);
      return res.status(500).json({
        error: 'Server Configuration Error',
        message: 'Test generation system is not properly configured'
      });
    }
    
    // Проверяем, существует ли пользователь с таким email
    const existingUser = await User.findByEmail(email.toLowerCase().trim());
    if (existingUser) {
      console.log(`Registration failed: User with email ${email} already exists`);
      return res.status(409).json({
        error: 'Registration Failed',
        message: 'User with this email already exists'
      });
    }
    
    // Проверяем наличие активных вопросов перед созданием пользователя
    const activeQuestionsCount = await Question.countDocuments({ isActive: true });
    if (activeQuestionsCount === 0) {
      console.error('No active questions found in database');
      return res.status(500).json({
        error: 'System Error',
        message: 'No questions available for test generation. Please contact administrator.'
      });
    }
    
    console.log(`Found ${activeQuestionsCount} active questions for test generation`);
    
    // Создаем нового пользователя
    const user = new User({
      email: email.toLowerCase().trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim()
    });
    
    // Сохраняем пользователя
    await user.save();
    createdUser = user; // Сохраняем ссылку для возможной очистки
    
    console.log(`✅ User created successfully: ${user._id}, email: ${user.email}`);
    
    // Генерируем уникальный тест для пользователя
    let test;
    try {
      console.log(`Starting test generation for user: ${user._id}`);
      test = await generateUniqueTest(user._id);
      
      if (!test || !test._id) {
        throw new Error('Test generation returned invalid result');
      }
      
      console.log(`✅ Test created successfully: ${test._id} for user: ${user._id}`);
      
    } catch (testError) {
      console.error('Error creating test for user:', testError);
      
      // Пытаемся создать простой тест как fallback
      try {
        console.log('Attempting to create fallback test...');
        
        // Получаем несколько случайных вопросов для fallback теста
        const fallbackQuestions = await Question.find({ isActive: true }).limit(10);
        
        if (fallbackQuestions.length === 0) {
          throw new Error('No questions available even for fallback');
        }
        
        test = new Test({
          userId: user._id,
          questions: fallbackQuestions.map(q => q._id),
          answers: [],
          isCompleted: false,
          score: 0,
          maxScore: fallbackQuestions.length,
          startedAt: null,
          completedAt: null,
          timeSpent: 0
        });
        
        await test.save();
        console.log(`✅ Fallback test created successfully: ${test._id}`);
        
      } catch (fallbackError) {
        console.error('Fallback test creation also failed:', fallbackError);
        throw new Error(`Failed to create test: ${testError.message}`);
      }
    }
    
    // Обновляем пользователя с ID теста
    user.testId = test._id;
    await user.save();
    
    console.log(`✅ User ${user._id} updated with testId: ${test._id}`);
    
    // Генерируем JWT токен
    const token = generateToken(user);
    
    // Получаем настройки для отправки клиенту
    let testConfig = null;
    try {
      const settings = await Settings.getCurrentSettings();
      testConfig = settings ? settings.getClientConfig() : null;
    } catch (settingsError) {
      console.error('Error getting settings:', settingsError);
      // Продолжаем без настроек
    }
    
    console.log(`✅ Registration completed successfully for user: ${user._id}`);
    
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: getUserResponse(user),
      testConfig
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    console.error('Error stack:', error.stack);
    
    // Если пользователь был создан, но произошла ошибка после этого
    if (createdUser && createdUser._id) {
      try {
        console.log(`Attempting cleanup: deleting user ${createdUser._id}`);
        
        // Удаляем связанный тест если он был создан
        if (createdUser.testId) {
          await Test.findByIdAndDelete(createdUser.testId);
          console.log(`Deleted test ${createdUser.testId} during cleanup`);
        }
        
        // Удаляем пользователя
        await User.findByIdAndDelete(createdUser._id);
        console.log(`✅ User ${createdUser._id} deleted during cleanup`);
        
      } catch (deleteError) {
        console.error(`❌ Failed to cleanup user ${createdUser._id}:`, deleteError);
        // Критическая ошибка - логируем для мониторинга
        console.error(`🚨 MANUAL CLEANUP REQUIRED: Orphaned user ${createdUser._id} with email ${createdUser.email}`);
      }
    }
    
    // Обработка специфичных ошибок
    if (error.code === 11000) {
      // Дублирование email на уровне базы данных
      return res.status(409).json({
        error: 'Registration Failed',
        message: 'User with this email already exists'
      });
    }
    
    if (error.name === 'ValidationError') {
      // Ошибки валидации mongoose
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Validation Error',
        message: messages.join(', ')
      });
    }
    
    if (error.message.includes('questions') || error.message.includes('test')) {
      // Ошибки связанные с тестированием
      return res.status(500).json({
        error: 'Registration Failed',
        message: 'Unable to prepare test for user. Please try again or contact support.'
      });
    }
    
    if (error.message.includes('Configuration')) {
      // Ошибки конфигурации системы
      return res.status(500).json({
        error: 'System Error',
        message: 'System configuration issue. Please contact administrator.'
      });
    }
    
    // Общая ошибка сервера
    res.status(500).json({
      error: 'Registration Failed',
      message: 'Internal server error during registration. Please try again.'
    });
  }
};

// Авторизация пользователя
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log(`Login attempt for email: ${email}`);
    
    // Валидация входных данных
    if (!email || !password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email and password are required'
      });
    }
    
    // Находим пользователя по email
    const user = await User.findByEmail(email.toLowerCase().trim());
    if (!user) {
      console.log(`Login failed: User not found for email ${email}`);
      return res.status(401).json({
        error: 'Login Failed',
        message: 'Invalid email or password'
      });
    }
    
    // Проверяем пароль
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      console.log(`Login failed: Invalid password for user ${user._id}`);
      return res.status(401).json({
        error: 'Login Failed',
        message: 'Invalid email or password'
      });
    }
    
    // Проверяем активность аккаунта
    if (!user.isActive) {
      console.log(`Login failed: Account deactivated for user ${user._id}`);
      return res.status(401).json({
        error: 'Login Failed',
        message: 'Account is deactivated'
      });
    }
    
    let needsSave = false;
    
    // Если у пользователя нет теста, создаем новый (для старых пользователей)
    if (!user.testId) {
      try {
        console.log(`Creating test for existing user: ${user._id}`);
        const test = await generateUniqueTest(user._id);
        if (test) {
          user.testId = test._id;
          needsSave = true;
          console.log(`✅ Test created for existing user: ${test._id}`);
        }
      } catch (testError) {
        console.error('Error creating test for existing user:', testError);
        // Продолжаем без создания теста, но логируем ошибку
      }
    }
    
    // Обновляем время последнего входа
    user.lastLogin = new Date();
    needsSave = true;
    
    if (needsSave) {
      await user.save();
    }
    
    // Генерируем JWT токен
    const token = generateToken(user);
    
    // Получаем настройки для отправки клиенту
    let testConfig = null;
    try {
      const settings = await Settings.getCurrentSettings();
      testConfig = settings ? settings.getClientConfig() : null;
    } catch (settingsError) {
      console.error('Error getting settings during login:', settingsError);
      // Продолжаем без настроек
    }
    
    // Получаем информацию о тесте пользователя
    const testInfo = await getTestInfo(user.testId);
    
    console.log(`✅ Login successful for user: ${user._id}`);
    
    res.json({
      message: 'Login successful',
      token,
      user: getUserResponse(user, true),
      test: testInfo,
      testConfig
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login Failed',
      message: 'Internal server error during login'
    });
  }
};

// Получение профиля пользователя
const getProfile = async (req, res) => {
  try {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found'
      });
    }
    
    console.log(`Profile request for user: ${user._id}`);
    
    // Получаем настройки
    let testConfig = null;
    try {
      const settings = await Settings.getCurrentSettings();
      testConfig = settings ? settings.getClientConfig() : null;
    } catch (settingsError) {
      console.error('Error getting settings for profile:', settingsError);
      // Продолжаем без настроек
    }
    
    // Получаем информацию о тесте с результатами если тест завершен
    const testInfo = await getTestInfo(user.testId, true);
    
    res.json({
      user: getUserResponse(user, true),
      test: testInfo,
      testConfig
    });
    
  } catch (error) {
    console.error('Get profile error:', error);
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
    const { firstName, lastName, email } = req.body;
    
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found'
      });
    }
    
    console.log(`Profile update request for user: ${user._id}`);
    
    // Валидация данных
    if (firstName !== undefined && !validateName(firstName)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'First name must be between 2 and 50 characters'
      });
    }
    
    if (lastName !== undefined && !validateName(lastName)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Last name must be between 2 and 50 characters'
      });
    }
    
    if (email !== undefined && !validateEmail(email)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Valid email is required'
      });
    }
    
    // Если email изменился, проверяем уникальность
    if (email && email.toLowerCase().trim() !== user.email.toLowerCase()) {
      const existingUser = await User.findByEmail(email.toLowerCase().trim());
      if (existingUser) {
        return res.status(409).json({
          error: 'Update Failed',
          message: 'User with this email already exists'
        });
      }
      user.email = email.toLowerCase().trim();
    }
    
    // Обновляем остальные поля
    if (firstName !== undefined) user.firstName = firstName.trim();
    if (lastName !== undefined) user.lastName = lastName.trim();
    
    await user.save();
    
    console.log(`✅ Profile updated for user: ${user._id}`);
    
    res.json({
      message: 'Profile updated successfully',
      user: getUserResponse(user, true)
    });
    
  } catch (error) {
    console.error('Update profile error:', error);
    
    // Обработка ошибки дублирования email
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Update Failed',
        message: 'User with this email already exists'
      });
    }
    
    // Обработка ошибок валидации mongoose
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Validation Error',
        message: messages.join(', ')
      });
    }
    
    res.status(500).json({
      error: 'Update Failed',
      message: 'Failed to update user profile'
    });
  }
};

// Смена пароля
const changePassword = async (req, res) => {
  try {
    const user = req.user;
    const { currentPassword, newPassword } = req.body;
    
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found'
      });
    }
    
    console.log(`Password change request for user: ${user._id}`);
    
    // Валидация входных данных
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Current password and new password are required'
      });
    }
    
    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'New password must be at least 6 characters long'
      });
    }
    
    // Проверяем текущий пароль
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      console.log(`Password change failed: Invalid current password for user ${user._id}`);
      return res.status(401).json({
        error: 'Password Change Failed',
        message: 'Current password is incorrect'
      });
    }
    
    // Проверяем, что новый пароль отличается от текущего
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        error: 'Password Change Failed',
        message: 'New password must be different from current password'
      });
    }
    
    // Обновляем пароль
    user.password = newPassword;
    await user.save();
    
    console.log(`✅ Password changed for user: ${user._id}`);
    
    res.json({
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      error: 'Password Change Failed',
      message: 'Failed to change password'
    });
  }
};

// Выход из системы
const logout = async (req, res) => {
  try {
    // В случае с JWT, выход происходит на стороне клиента
    // Здесь можно добавить логику для ведения blacklist токенов при необходимости
    // или обновить время последнего выхода в базе данных
    
    const user = req.user;
    if (user) {
      try {
        user.lastLogout = new Date();
        await user.save();
        console.log(`✅ Logout recorded for user: ${user._id}`);
      } catch (saveError) {
        console.error('Error updating logout time:', saveError);
        // Не прерываем выход из-за ошибки сохранения
      }
    }
    
    res.json({
      message: 'Logout successful'
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout Failed',
      message: 'Failed to logout'
    });
  }
};

// Проверка доступности тестирования
const checkTestAvailability = async (req, res) => {
  try {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found'
      });
    }
    
    console.log(`Test availability check for user: ${user._id}`);
    
    const settings = await Settings.getCurrentSettings();
    if (!settings) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Test settings not found'
      });
    }
    
    // Проверяем общие настройки тестирования
    const testStatus = {
      isTestStarted: settings.testStarted,
      isTestExpired: typeof settings.isTestExpired === 'function' ? settings.isTestExpired() : false,
      testDuration: settings.testDuration,
      remainingTime: typeof settings.getRemainingTime === 'function' ? settings.getRemainingTime() : null,
      testStatus: settings.testStatus
    };
    
    // Проверяем статус пользователя
    const userStatus = {
      hasTest: !!user.testId,
      hasStartedTest: user.hasStartedTest,
      testStartTime: user.testStartTime,
      testEndTime: user.testEndTime
    };
    
    // Проверяем статус теста пользователя
    let testInfo = null;
    if (user.testId) {
      const test = await Test.findById(user.testId);
      if (test) {
        const isUserTestExpired = user.testStartTime && settings.testDuration ? 
          (new Date() - new Date(user.testStartTime)) > (settings.testDuration * 60 * 1000) : false;
        
        testInfo = {
          questionsCount: test.questions.length,
          answeredCount: test.answers.length,
          isCompleted: test.isCompleted,
          canStart: !test.isCompleted && settings.testStarted && !testStatus.isTestExpired,
          canContinue: user.hasStartedTest && !test.isCompleted && !isUserTestExpired
        };
      }
    }
    
    // Определяем сообщение о статусе
    let message = 'Test status checked';
    if (testInfo?.canStart) {
      message = 'Test is available to start';
    } else if (testInfo?.canContinue) {
      message = 'Test can be continued';
    } else if (testInfo?.isCompleted) {
      message = 'Test already completed';
    } else if (!settings.testStarted) {
      message = 'Test has not been started by admin';
    } else if (testStatus.isTestExpired) {
      message = 'Test time has expired';
    } else {
      message = 'Test is not available';
    }
    
    res.json({
      testStatus,
      userStatus,
      testInfo,
      message
    });
    
  } catch (error) {
    console.error('Check test availability error:', error);
    res.status(500).json({
      error: 'Check Failed',
      message: 'Failed to check test availability'
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  logout,
  checkTestAvailability
};