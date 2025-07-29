const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Question title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Question description is required'],
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  options: [{
    type: String,
    required: true,
    trim: true,
    maxlength: [500, 'Option cannot exceed 500 characters']
  }],
  correctAnswer: {
    type: Number,
    required: [true, 'Correct answer index is required'],
    min: [0, 'Correct answer index must be at least 0'],
    validate: {
      validator: function(value) {
        return value < this.options.length;
      },
      message: 'Correct answer index must be less than options length'
    }
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  topic: {
    type: String,
    required: [true, 'Topic is required'],
    trim: true,
    maxlength: [100, 'Topic cannot exceed 100 characters']
  },
  points: {
    type: Number,
    default: 1,
    min: [1, 'Points must be at least 1']
  },
  explanation: {
    type: String,
    trim: true,
    maxlength: [1000, 'Explanation cannot exceed 1000 characters']
  },
  image: {
    type: String,
    default: null
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
  usageCount: {
    type: Number,
    default: 0
  },
  successRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
}, {
  timestamps: true
});

// Валидация количества вариантов ответов
questionSchema.pre('validate', function(next) {
  if (this.options.length < 2) {
    next(new Error('Question must have at least 2 options'));
  } else if (this.options.length > 6) {
    next(new Error('Question cannot have more than 6 options'));
  } else {
    next();
  }
});

// Индексы для оптимизации поиска
questionSchema.index({ difficulty: 1, topic: 1 });
questionSchema.index({ isActive: 1 });
questionSchema.index({ createdAt: -1 });

// Статический метод для получения случайных вопросов
questionSchema.statics.getRandomQuestions = async function(count = 30) {
  try {
    const questions = await this.aggregate([
      { $match: { isActive: true } },
      { $sample: { size: count } }
    ]);
    
    return questions;
  } catch (error) {
    throw new Error('Error fetching random questions');
  }
};

// Статический метод для получения вопросов по сложности
questionSchema.statics.getQuestionsByDifficulty = async function(difficulty, count) {
  try {
    const questions = await this.aggregate([
      { $match: { isActive: true, difficulty: difficulty } },
      { $sample: { size: count } }
    ]);
    
    return questions;
  } catch (error) {
    throw new Error(`Error fetching ${difficulty} questions`);
  }
};

// Метод для получения статистики по вопросу
questionSchema.methods.getStats = async function() {
  const Test = require('./Test');
  
  const stats = await Test.aggregate([
    { $unwind: '$answers' },
    { $match: { 'answers.questionId': this._id } },
    {
      $group: {
        _id: null,
        totalAnswers: { $sum: 1 },
        correctAnswers: { $sum: { $cond: ['$answers.isCorrect', 1, 0] } }
      }
    }
  ]);
  
  if (stats.length === 0) {
    return { totalAnswers: 0, correctAnswers: 0, successRate: 0 };
  }
  
  const { totalAnswers, correctAnswers } = stats[0];
  const successRate = totalAnswers > 0 ? (correctAnswers / totalAnswers) * 100 : 0;
  
  return { totalAnswers, correctAnswers, successRate };
};

// Метод для увеличения счетчика использования
questionSchema.methods.incrementUsage = async function() {
  this.usageCount += 1;
  await this.save();
};

// Виртуальное поле для отображения краткой информации
questionSchema.virtual('shortInfo').get(function() {
  return {
    id: this._id,
    title: this.title,
    difficulty: this.difficulty,
    topic: this.topic,
    points: this.points
  };
});

module.exports = mongoose.model('Question', questionSchema);