const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  testDuration: {
    type: Number,
    required: true,
    default: 45, // в минутах
    min: [1, 'Test duration must be at least 1 minute'],
    max: [300, 'Test duration cannot exceed 300 minutes']
  },
  testStarted: {
    type: Boolean,
    default: false
  },
  questionsPerTest: {
    type: Number,
    default: 30,
    min: [1, 'Must have at least 1 question per test'],
    max: [100, 'Cannot have more than 100 questions per test']
  },
  testStartTime: {
    type: Date,
    default: null
  },
  testEndTime: {
    type: Date,
    default: null
  },
  allowLateSubmission: {
    type: Boolean,
    default: false
  },
  showResultsImmediately: {
    type: Boolean,
    default: false
  },
  showCorrectAnswers: {
    type: Boolean,
    default: true
  },
  randomizeQuestions: {
    type: Boolean,
    default: true
  },
  randomizeOptions: {
    type: Boolean,
    default: true
  },
  maxAttempts: {
    type: Number,
    default: 1,
    min: [1, 'Must allow at least 1 attempt']
  },
  passingScore: {
    type: Number,
    default: 50,
    min: [0, 'Passing score cannot be negative'],
    max: [100, 'Passing score cannot exceed 100']
  },
  instructions: {
    type: String,
    default: 'Внимательно прочитайте каждый вопрос и выберите правильный ответ. У вас есть одна попытка для прохождения теста.',
    maxlength: [2000, 'Instructions cannot exceed 2000 characters']
  },
  welcomeMessage: {
    type: String,
    default: 'Добро пожаловать на олимпиаду по математике!',
    maxlength: [500, 'Welcome message cannot exceed 500 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Индекс для быстрого поиска активных настроек
settingsSchema.index({ isActive: 1 });

// Статический метод для получения текущих настроек
settingsSchema.statics.getCurrentSettings = async function() {
  let settings = await this.findOne({ isActive: true });
  
  if (!settings) {
    // Создаем настройки по умолчанию, если их нет
    settings = new this({
      testDuration: 45,
      testStarted: false,
      questionsPerTest: 30,
      createdBy: new mongoose.Types.ObjectId(), // Временный ID
      lastModifiedBy: new mongoose.Types.ObjectId()
    });
    await settings.save();
  }
  
  return settings;
};

// Метод для запуска тестирования
settingsSchema.methods.startTest = async function() {
  this.testStarted = true;
  this.testStartTime = new Date();
  await this.save();
};

// Метод для остановки тестирования
settingsSchema.methods.stopTest = async function() {
  this.testStarted = false;
  this.testEndTime = new Date();
  await this.save();
};

// Метод для проверки, активно ли тестирование
settingsSchema.methods.isTestActive = function() {
  return this.testStarted;
};

// Метод для получения оставшегося времени тестирования
settingsSchema.methods.getRemainingTime = function() {
  if (!this.testStarted || !this.testStartTime) {
    return 0;
  }
  
  const now = new Date();
  const testEndTime = new Date(this.testStartTime.getTime() + this.testDuration * 60 * 1000);
  const remainingTime = testEndTime.getTime() - now.getTime();
  
  return Math.max(0, Math.floor(remainingTime / 1000)); // в секундах
};

// Метод для проверки, истекло ли время тестирования
settingsSchema.methods.isTestExpired = function() {
  if (!this.testStarted || !this.testStartTime) {
    return false;
  }
  
  const now = new Date();
  const testEndTime = new Date(this.testStartTime.getTime() + this.testDuration * 60 * 1000);
  
  return now > testEndTime;
};

// Метод для обновления настроек
settingsSchema.methods.updateSettings = async function(updates, userId) {
  const allowedUpdates = [
    'testDuration',
    'questionsPerTest',
    'allowLateSubmission',
    'showResultsImmediately',
    'showCorrectAnswers',
    'randomizeQuestions',
    'randomizeOptions',
    'maxAttempts',
    'passingScore',
    'instructions',
    'welcomeMessage'
  ];
  
  Object.keys(updates).forEach(key => {
    if (allowedUpdates.includes(key)) {
      this[key] = updates[key];
    }
  });
  
  this.lastModifiedBy = userId;
  await this.save();
  
  return this;
};

// Виртуальное поле для получения статуса тестирования
settingsSchema.virtual('testStatus').get(function() {
  if (!this.testStarted) {
    return 'NOT_STARTED';
  }
  
  if (this.isTestExpired()) {
    return 'EXPIRED';
  }
  
  return 'ACTIVE';
});

// Виртуальное поле для получения времени в удобном формате
settingsSchema.virtual('formattedDuration').get(function() {
  const hours = Math.floor(this.testDuration / 60);
  const minutes = this.testDuration % 60;
  
  if (hours > 0) {
    return `${hours}ч ${minutes}мин`;
  }
  
  return `${minutes}мин`;
});

// Метод для получения конфигурации для клиента
settingsSchema.methods.getClientConfig = function() {
  return {
    testDuration: this.testDuration,
    testStarted: this.testStarted,
    questionsPerTest: this.questionsPerTest,
    testStartTime: this.testStartTime,
    showResultsImmediately: this.showResultsImmediately,
    showCorrectAnswers: this.showCorrectAnswers,
    instructions: this.instructions,
    welcomeMessage: this.welcomeMessage,
    passingScore: this.passingScore,
    remainingTime: this.getRemainingTime(),
    testStatus: this.testStatus,
    formattedDuration: this.formattedDuration
  };
};

module.exports = mongoose.model('Settings', settingsSchema);