const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  },
  selectedAnswer: {
    type: Number,
    required: true,
    min: 0
  },
  isCorrect: {
    type: Boolean,
    required: true
  },
  points: {
    type: Number,
    default: 0
  },
  answeredAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const testSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  questions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  }],
  answers: [answerSchema],
  score: {
    type: Number,
    default: 0,
    min: 0
  },
  maxScore: {
    type: Number,
    default: 30
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  startedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  timeSpent: {
    type: Number, // в секундах
    default: 0
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Индексы для оптимизации
testSchema.index({ userId: 1 }, { unique: true });
testSchema.index({ isCompleted: 1 });
testSchema.index({ score: -1 });
testSchema.index({ createdAt: -1 });

// Метод для получения вопроса по индексу
testSchema.methods.getQuestion = async function(index) {
  if (index < 0 || index >= this.questions.length) {
    throw new Error('Invalid question index');
  }
  
  const Question = require('./Question');
  const question = await Question.findById(this.questions[index]);
  
  if (!question) {
    throw new Error('Question not found');
  }
  
  return {
    id: question._id,
    title: question.title,
    description: question.description,
    options: question.options,
    difficulty: question.difficulty,
    topic: question.topic,
    points: question.points,
    image: question.image,
    index: index
  };
};

// Метод для получения текущего вопроса
testSchema.methods.getCurrentQuestion = async function() {
  const currentIndex = this.answers.length;
  
  if (currentIndex >= this.questions.length) {
    return null; // Тест завершен
  }
  
  return await this.getQuestion(currentIndex);
};

// Метод для отправки ответа
testSchema.methods.submitAnswer = async function(questionIndex, selectedAnswer) {
  if (this.isCompleted) {
    throw new Error('Test is already completed');
  }
  
  if (questionIndex !== this.answers.length) {
    throw new Error('Invalid question sequence');
  }
  
  const Question = require('./Question');
  const question = await Question.findById(this.questions[questionIndex]);
  
  if (!question) {
    throw new Error('Question not found');
  }
  
  const isCorrect = selectedAnswer === question.correctAnswer;
  const points = isCorrect ? question.points : 0;
  
  this.answers.push({
    questionId: question._id,
    selectedAnswer,
    isCorrect,
    points,
    answeredAt: new Date()
  });
  
  this.score += points;
  
  // Увеличиваем счетчик использования вопроса
  await question.incrementUsage();
  
  await this.save();
  
  return {
    isCorrect,
    points,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation
  };
};

// Метод для завершения теста
testSchema.methods.completeTest = async function() {
  if (this.isCompleted) {
    return;
  }
  
  this.isCompleted = true;
  this.completedAt = new Date();
  
  if (this.startedAt) {
    this.timeSpent = Math.floor((this.completedAt - this.startedAt) / 1000);
  }
  
  await this.save();
  
  // Обновляем статус пользователя
  const User = require('./User');
  await User.findByIdAndUpdate(this.userId, {
    testEndTime: this.completedAt
  });
};

// Метод для получения результатов теста
testSchema.methods.getResults = function() {
  const totalQuestions = this.questions.length;
  const answeredQuestions = this.answers.length;
  const correctAnswers = this.answers.filter(answer => answer.isCorrect).length;
  const percentage = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
  
  return {
    totalQuestions,
    answeredQuestions,
    correctAnswers,
    score: this.score,
    maxScore: this.maxScore,
    percentage: Math.round(percentage * 100) / 100,
    timeSpent: this.timeSpent,
    isCompleted: this.isCompleted,
    startedAt: this.startedAt,
    completedAt: this.completedAt
  };
};

// Метод для получения детальной статистики
testSchema.methods.getDetailedStats = async function() {
  const Question = require('./Question');
  
  const detailedAnswers = await Promise.all(
    this.answers.map(async (answer) => {
      const question = await Question.findById(answer.questionId);
      return {
        questionId: answer.questionId,
        questionTitle: question ? question.title : 'Unknown',
        selectedAnswer: answer.selectedAnswer,
        correctAnswer: question ? question.correctAnswer : null,
        isCorrect: answer.isCorrect,
        points: answer.points,
        difficulty: question ? question.difficulty : 'unknown',
        topic: question ? question.topic : 'unknown',
        answeredAt: answer.answeredAt
      };
    })
  );
  
  return detailedAnswers;
};

// Статический метод для получения статистики по всем тестам
testSchema.statics.getOverallStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalTests: { $sum: 1 },
        completedTests: { $sum: { $cond: ['$isCompleted', 1, 0] } },
        averageScore: { $avg: '$score' },
        maxScore: { $max: '$score' },
        minScore: { $min: '$score' },
        averageTime: { $avg: '$timeSpent' }
      }
    }
  ]);
  
  if (stats.length === 0) {
    return {
      totalTests: 0,
      completedTests: 0,
      averageScore: 0,
      maxScore: 0,
      minScore: 0,
      averageTime: 0
    };
  }
  
  return stats[0];
};

// Статический метод для получения топ результатов
testSchema.statics.getTopResults = async function(limit = 10) {
  return await this.find({ isCompleted: true })
    .populate('userId', 'firstName lastName email')
    .sort({ score: -1, timeSpent: 1 })
    .limit(limit)
    .select('userId score maxScore timeSpent completedAt');
};

module.exports = mongoose.model('Test', testSchema);