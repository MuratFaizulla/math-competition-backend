const Question = require('../models/Question');
const { parseCSV, parseExcel } = require('../utils/csvParser');
const path = require('path');
const fs = require('fs').promises;

// Получение всех вопросов (только для админа)
const getAllQuestions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sort = '-createdAt',
      difficulty,
      topic,
      search,
      isActive
    } = req.query;
    
    // Построение фильтра
    const filter = {};
    
    if (difficulty) {
      filter.difficulty = difficulty;
    }
    
    if (topic) {
      filter.topic = new RegExp(topic, 'i');
    }
    
    if (search) {
      filter.$or = [
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }
    
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    
    // Подсчет общего количества
    const total = await Question.countDocuments(filter);
    
    // Получение вопросов с пагинацией
    const questions = await Question.find(filter)
      .populate('createdBy', 'firstName lastName email')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();
    
    // Получение статистики для каждого вопроса
    const questionsWithStats = await Promise.all(
      questions.map(async (question) => {
        const stats = await Question.findById(question._id).then(q => q.getStats());
        return {
          ...question,
          stats
        };
      })
    );
    
    res.json({
      questions: questionsWithStats,
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
    console.error('Get all questions error:', error);
    res.status(500).json({
      error: 'Import Failed',
      message: 'Failed to import questions from file'
    });
  }
};

// Получение статистики по вопросам
const getQuestionsStats = async (req, res) => {
  try {
    const stats = await Question.aggregate([
      {
        $group: {
          _id: null,
          totalQuestions: { $sum: 1 },
          activeQuestions: { $sum: { $cond: ['$isActive', 1, 0] } },
          inactiveQuestions: { $sum: { $cond: ['$isActive', 0, 1] } },
          byDifficulty: {
            $push: {
              difficulty: '$difficulty',
              isActive: '$isActive'
            }
          },
          byTopic: {
            $push: {
              topic: '$topic',
              isActive: '$isActive'
            }
          }
        }
      }
    ]);
    
    if (stats.length === 0) {
      return res.json({
        totalQuestions: 0,
        activeQuestions: 0,
        inactiveQuestions: 0,
        difficultyDistribution: {},
        topicDistribution: {}
      });
    }
    
    const baseStats = stats[0];
    
    // Группировка по сложности
    const difficultyGroups = {};
    baseStats.byDifficulty.forEach(item => {
      if (!difficultyGroups[item.difficulty]) {
        difficultyGroups[item.difficulty] = { total: 0, active: 0 };
      }
      difficultyGroups[item.difficulty].total++;
      if (item.isActive) {
        difficultyGroups[item.difficulty].active++;
      }
    });
    
    // Группировка по темам
    const topicGroups = {};
    baseStats.byTopic.forEach(item => {
      if (!topicGroups[item.topic]) {
        topicGroups[item.topic] = { total: 0, active: 0 };
      }
      topicGroups[item.topic].total++;
      if (item.isActive) {
        topicGroups[item.topic].active++;
      }
    });
    
    // Получаем топ-10 тем
    const topTopics = Object.entries(topicGroups)
      .sort(([,a], [,b]) => b.active - a.active)
      .slice(0, 10)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});
    
    res.json({
      totalQuestions: baseStats.totalQuestions,
      activeQuestions: baseStats.activeQuestions,
      inactiveQuestions: baseStats.inactiveQuestions,
      difficultyDistribution: difficultyGroups,
      topicDistribution: topTopics,
      canGenerateTests: baseStats.activeQuestions >= 30
    });
    
  } catch (error) {
    console.error('Get questions stats error:', error);
    res.status(500).json({
      error: 'Stats Error',
      message: 'Failed to get questions statistics'
    });
  }
};

// Экспорт вопросов в CSV
const exportQuestions = async (req, res) => {
  try {
    const { difficulty, topic, isActive } = req.query;
    
    // Построение фильтра
    const filter = {};
    if (difficulty) filter.difficulty = difficulty;
    if (topic) filter.topic = new RegExp(topic, 'i');
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    
    const questions = await Question.find(filter)
      .populate('createdBy', 'firstName lastName')
      .lean();
    
    if (questions.length === 0) {
      return res.status(404).json({
        error: 'No Questions Found',
        message: 'No questions match the specified criteria'
      });
    }
    
    // Подготавливаем данные для CSV
    const csvData = questions.map(q => ({
      ID: q._id,
      Title: q.title,
      Description: q.description,
      'Option 1': q.options[0] || '',
      'Option 2': q.options[1] || '',
      'Option 3': q.options[2] || '',
      'Option 4': q.options[3] || '',
      'Option 5': q.options[4] || '',
      'Option 6': q.options[5] || '',
      'Correct Answer': q.correctAnswer + 1, // +1 для человеко-читаемого формата
      Difficulty: q.difficulty,
      Topic: q.topic,
      Points: q.points,
      Explanation: q.explanation || '',
      'Is Active': q.isActive ? 'Yes' : 'No',
      'Created By': q.createdBy ? `${q.createdBy.firstName} ${q.createdBy.lastName}` : '',
      'Created At': new Date(q.createdAt).toISOString().split('T')[0],
      'Usage Count': q.usageCount,
      'Success Rate': `${q.successRate}%`
    }));
    
    // Генерируем CSV
    const csv = convertToCSV(csvData);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="questions_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
    
  } catch (error) {
    console.error('Export questions error:', error);
    res.status(500).json({
      error: 'Export Failed',
      message: 'Failed to export questions'
    });
  }
};

// Поиск вопросов
const searchQuestions = async (req, res) => {
  try {
    const {
      q: searchTerm,
      difficulty,
      topic,
      limit = 10
    } = req.query;
    
    if (!searchTerm || searchTerm.trim().length < 2) {
      return res.status(400).json({
        error: 'Invalid Search',
        message: 'Search term must be at least 2 characters long'
      });
    }
    
    const filter = {
      isActive: true,
      $or: [
        { title: new RegExp(searchTerm, 'i') },
        { description: new RegExp(searchTerm, 'i') },
        { topic: new RegExp(searchTerm, 'i') }
      ]
    };
    
    if (difficulty) filter.difficulty = difficulty;
    if (topic) filter.topic = new RegExp(topic, 'i');
    
    const questions = await Question.find(filter)
      .select('title description difficulty topic points usageCount successRate')
      .limit(parseInt(limit))
      .lean();
    
    res.json({
      searchTerm,
      results: questions.length,
      questions
    });
    
  } catch (error) {
    console.error('Search questions error:', error);
    res.status(500).json({
      error: 'Search Failed',
      message: 'Failed to search questions'
    });
  }
};

// Активация/деактивация вопроса
const toggleQuestionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const question = await Question.findById(id);
    if (!question) {
      return res.status(404).json({
        error: 'Question Not Found',
        message: 'Question with this ID does not exist'
      });
    }
    
    question.isActive = !question.isActive;
    await question.save();
    
    res.json({
      message: `Question ${question.isActive ? 'activated' : 'deactivated'} successfully`,
      question: {
        id: question._id,
        title: question.title,
        isActive: question.isActive
      }
    });
    
  } catch (error) {
    console.error('Toggle question status error:', error);
    res.status(500).json({
      error: 'Status Toggle Failed',
      message: 'Failed to toggle question status'
    });
  }
};

// Utility функция для конвертации в CSV
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


// Получение вопроса по ID
const getQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    
    const question = await Question.findById(id)
      .populate('createdBy', 'firstName lastName email');
    
    if (!question) {
      return res.status(404).json({
        error: 'Question Not Found',
        message: 'Question with this ID does not exist'
      });
    }
    
    // Получаем статистику
    const stats = await question.getStats();
    
    res.json({
      question: {
        ...question.toObject(),
        stats
      }
    });
    
  } catch (error) {
    console.error('Get question error:', error);
    res.status(500).json({
      error: 'Question Retrieval Failed',
      message: 'Failed to retrieve question'
    });
  }
};

// Создание нового вопроса
const createQuestion = async (req, res) => {
  try {
    const {
      title,
      description,
      options,
      correctAnswer,
      difficulty,
      topic,
      points = 1,
      explanation
    } = req.body;
    
    const question = new Question({
      title,
      description,
      options,
      correctAnswer,
      difficulty,
      topic,
      points,
      explanation,
      createdBy: req.user._id
    });
    
    await question.save();
    
    // Заполняем информацию о создателе
    await question.populate('createdBy', 'firstName lastName email');
    
    res.status(201).json({
      message: 'Question created successfully',
      question
    });
    
  } catch (error) {
    console.error('Create question error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your input data',
        details: Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }
    
    res.status(500).json({
      error: 'Question Creation Failed',
      message: 'Failed to create question'
    });
  }
};

// Обновление вопроса
const updateQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Список разрешенных для обновления полей
    const allowedUpdates = [
      'title',
      'description',
      'options',
      'correctAnswer',
      'difficulty',
      'topic',
      'points',
      'explanation',
      'isActive'
    ];
    
    // Фильтруем только разрешенные поля
    const filteredUpdates = {};
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });
    
    const question = await Question.findByIdAndUpdate(
      id,
      filteredUpdates,
      { new: true, runValidators: true }
    ).populate('createdBy', 'firstName lastName email');
    
    if (!question) {
      return res.status(404).json({
        error: 'Question Not Found',
        message: 'Question with this ID does not exist'
      });
    }
    
    res.json({
      message: 'Question updated successfully',
      question
    });
    
  } catch (error) {
    console.error('Update question error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your input data',
        details: Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }
    
    res.status(500).json({
      error: 'Question Update Failed',
      message: 'Failed to update question'
    });
  }
};

// Удаление вопроса (мягкое удаление)
const deleteQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const { permanent = false } = req.query;
    
    if (permanent === 'true') {
      // Жесткое удаление
      const question = await Question.findByIdAndDelete(id);
      
      if (!question) {
        return res.status(404).json({
          error: 'Question Not Found',
          message: 'Question with this ID does not exist'
        });
      }
      
      res.json({
        message: 'Question permanently deleted'
      });
    } else {
      // Мягкое удаление (деактивация)
      const question = await Question.findByIdAndUpdate(
        id,
        { isActive: false },
        { new: true }
      );
      
      if (!question) {
        return res.status(404).json({
          error: 'Question Not Found',
          message: 'Question with this ID does not exist'
        });
      }
      
      res.json({
        message: 'Question deactivated successfully',
        question
      });
    }
    
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({
      error: 'Question Deletion Failed',
      message: 'Failed to delete question'
    });
  }
};

// Массовое создание вопросов
const createBulkQuestions = async (req, res) => {
  try {
    const { questions } = req.body;
    
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        error: 'Invalid Data',
        message: 'Questions array is required'
      });
    }
    
    const createdQuestions = [];
    const errors = [];
    
    for (let i = 0; i < questions.length; i++) {
      try {
        const questionData = {
          ...questions[i],
          createdBy: req.user._id
        };
        
        const question = new Question(questionData);
        await question.save();
        
        createdQuestions.push(question);
      } catch (error) {
        errors.push({
          index: i,
          question: questions[i].title || `Question ${i + 1}`,
          error: error.message
        });
      }
    }
    
    res.status(201).json({
      message: `Bulk creation completed. ${createdQuestions.length} questions created, ${errors.length} errors`,
      created: createdQuestions.length,
      errors: errors.length,
      questions: createdQuestions,
      errorDetails: errors
    });
    
  } catch (error) {
    console.error('Bulk create questions error:', error);
    res.status(500).json({
      error: 'Bulk Creation Failed',
      message: 'Failed to create questions in bulk'
    });
  }
};

// Импорт вопросов из CSV/Excel файла
const importQuestions = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'File Required',
        message: 'Please upload a CSV or Excel file'
      });
    }
    
    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    let questionsData;
    
    try {
      if (fileExtension === '.csv') {
        questionsData = await parseCSV(filePath);
      } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
        questionsData = await parseExcel(filePath);
      } else {
        return res.status(400).json({
          error: 'Invalid File Type',
          message: 'Only CSV and Excel files are supported'
        });
      }
    } finally {
      // Удаляем загруженный файл
      try {
        await fs.unlink(filePath);
      } catch (unlinkError) {
        console.warn('Failed to delete uploaded file:', unlinkError);
      }
    }
    
    if (!questionsData || questionsData.length === 0) {
      return res.status(400).json({
        error: 'Empty File',
        message: 'No valid questions found in the file'
      });
    }
    
    const createdQuestions = [];
    const errors = [];
    
    for (let i = 0; i < questionsData.length; i++) {
      try {
        const questionData = {
          ...questionsData[i],
          createdBy: req.user._id
        };
        
        const question = new Question(questionData);
        await question.save();
        
        createdQuestions.push(question);
      } catch (error) {
        errors.push({
          row: i + 2, // +2 потому что первая строка - заголовки, и индекс начинается с 0
          title: questionsData[i].title || `Row ${i + 2}`,
          error: error.message
        });
      }
    }
    
    res.status(201).json({
      message: `Import completed. ${createdQuestions.length} questions imported, ${errors.length} errors`,
      imported: createdQuestions.length,
      errors: errors.length,
      questions: createdQuestions.map(q => ({
        id: q._id,
        title: q.title,
        difficulty: q.difficulty,
        topic: q.topic
      })),
      errorDetails: errors
    });
    
  } catch (error) {
    console.error('Import questions error:', error);
    
    // Пытаемся удалить файл в случае ошибки
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.warn('Failed to delete uploaded file after error:', unlinkError);
      }
    }
    
    res.status(500).json({
      error: 'Import Failed',
      message: 'Failed to import questions'
    });
  }
};


module.exports = {
  getAllQuestions,
  getQuestion,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  createBulkQuestions,
  importQuestions,
  getQuestionsStats,
  exportQuestions,
  searchQuestions,
  toggleQuestionStatus
};