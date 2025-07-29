const csv = require('csv-parser');
const fs = require('fs');
const XLSX = require('xlsx');

/**
 * Парсит CSV файл и возвращает массив вопросов
 * @param {string} filePath - Путь к CSV файлу
 * @returns {Promise<Array>} - Массив объектов вопросов
 */
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const errors = [];
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        try {
          const question = parseQuestionRow(data);
          if (question) {
            results.push(question);
          }
        } catch (error) {
          errors.push({
            row: results.length + 1,
            error: error.message,
            data
          });
        }
      })
      .on('end', () => {
        if (errors.length > 0) {
          console.warn(`CSV parsing completed with ${errors.length} errors:`, errors);
        }
        resolve(results);
      })
      .on('error', (error) => {
        reject(new Error(`CSV parsing failed: ${error.message}`));
      });
  });
};

/**
 * Парсит Excel файл и возвращает массив вопросов
 * @param {string} filePath - Путь к Excel файлу
 * @returns {Promise<Array>} - Массив объектов вопросов
 */
const parseExcel = async (filePath) => {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Конвертируем в JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    const results = [];
    const errors = [];
    
    jsonData.forEach((row, index) => {
      try {
        const question = parseQuestionRow(row);
        if (question) {
          results.push(question);
        }
      } catch (error) {
        errors.push({
          row: index + 2, // +2 потому что индекс начинается с 0 и первая строка - заголовки
          error: error.message,
          data: row
        });
      }
    });
    
    if (errors.length > 0) {
      console.warn(`Excel parsing completed with ${errors.length} errors:`, errors);
    }
    
    return results;
    
  } catch (error) {
    throw new Error(`Excel parsing failed: ${error.message}`);
  }
};

/**
 * Парсит строку данных и преобразует в объект вопроса
 * @param {Object} row - Строка данных из CSV/Excel
 * @returns {Object} - Объект вопроса
 */
const parseQuestionRow = (row) => {
  // Нормализуем ключи (удаляем пробелы, приводим к нижнему регистру)
  const normalizedRow = {};
  Object.keys(row).forEach(key => {
    const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, '_');
    normalizedRow[normalizedKey] = row[key];
  });
  
  // Маппинг возможных названий колонок
  const fieldMappings = {
    title: ['title', 'question', 'question_title', 'вопрос', 'заголовок'],
    description: ['description', 'question_text', 'text', 'описание', 'текст_вопроса'],
    option1: ['option1', 'option_1', 'choice1', 'answer1', 'вариант1', 'вариант_1'],
    option2: ['option2', 'option_2', 'choice2', 'answer2', 'вариант2', 'вариант_2'],
    option3: ['option3', 'option_3', 'choice3', 'answer3', 'вариант3', 'вариант_3'],
    option4: ['option4', 'option_4', 'choice4', 'answer4', 'вариант4', 'вариант_4'],
    option5: ['option5', 'option_5', 'choice5', 'answer5', 'вариант5', 'вариант_5'],
    option6: ['option6', 'option_6', 'choice6', 'answer6', 'вариант6', 'вариант_6'],
    correctAnswer: ['correct_answer', 'correct', 'right_answer', 'правильный_ответ', 'верный_ответ'],
    difficulty: ['difficulty', 'level', 'сложность', 'уровень'],
    topic: ['topic', 'subject', 'category', 'тема', 'предмет', 'категория'],
    points: ['points', 'score', 'баллы', 'очки'],
    explanation: ['explanation', 'solution', 'объяснение', 'решение']
  };
  
  // Функция для поиска значения по маппингу
  const findValue = (mappings) => {
    for (const key of mappings) {
      if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') {
        return normalizedRow[key];
      }
    }
    return null;
  };
  
  // Извлекаем основные поля
  const title = findValue(fieldMappings.title);
  const description = findValue(fieldMappings.description);
  
  if (!title || !description) {
    throw new Error('Title and description are required');
  }
  
  // Собираем варианты ответов
  const options = [];
  for (let i = 1; i <= 6; i++) {
    const optionKey = `option${i}`;
    const optionValue = findValue(fieldMappings[optionKey]);
    if (optionValue && optionValue.toString().trim()) {
      options.push(optionValue.toString().trim());
    }
  }
  
  if (options.length < 2) {
    throw new Error('At least 2 options are required');
  }
  
  // Правильный ответ
  const correctAnswerValue = findValue(fieldMappings.correctAnswer);
  if (!correctAnswerValue) {
    throw new Error('Correct answer is required');
  }
  
  let correctAnswer;
  if (typeof correctAnswerValue === 'number') {
    correctAnswer = correctAnswerValue - 1; // Предполагаем, что в файле нумерация с 1
  } else {
    const correctAnswerStr = correctAnswerValue.toString().trim();
    // Пытаемся парсить как число
    const parsed = parseInt(correctAnswerStr);
    if (!isNaN(parsed)) {
      correctAnswer = parsed - 1;
    } else {
      // Ищем текст ответа среди вариантов
      correctAnswer = options.findIndex(option => 
        option.toLowerCase() === correctAnswerStr.toLowerCase()
      );
    }
  }
  
  if (correctAnswer < 0 || correctAnswer >= options.length) {
    throw new Error(`Invalid correct answer index: ${correctAnswer + 1}`);
  }
  
  // Сложность
  let difficulty = findValue(fieldMappings.difficulty) || 'medium';
  difficulty = difficulty.toString().toLowerCase().trim();
  
  const validDifficulties = ['easy', 'medium', 'hard', 'легкий', 'средний', 'сложный'];
  if (!validDifficulties.includes(difficulty)) {
    difficulty = 'medium';
  }
  
  // Маппинг русских названий сложности
  const difficultyMapping = {
    'легкий': 'easy',
    'средний': 'medium',
    'сложный': 'hard'
  };
  
  difficulty = difficultyMapping[difficulty] || difficulty;
  
  // Тема
  const topic = findValue(fieldMappings.topic) || 'General';
  
  // Баллы
  let points = findValue(fieldMappings.points);
  if (points) {
    points = parseInt(points);
    if (isNaN(points) || points < 1) {
      points = 1;
    }
  } else {
    points = 1;
  }
  
  // Объяснение
  const explanation = findValue(fieldMappings.explanation) || '';
  
  return {
    title: title.toString().trim(),
    description: description.toString().trim(),
    options,
    correctAnswer,
    difficulty,
    topic: topic.toString().trim(),
    points,
    explanation: explanation.toString().trim()
  };
};

/**
 * Валидирует структуру импортируемого файла
 * @param {string} filePath - Путь к файлу
 * @param {string} fileType - Тип файла ('csv' или 'excel')
 * @returns {Promise<Object>} - Результат валидации
 */
const validateImportFile = async (filePath, fileType) => {
  try {
    let sampleData;
    
    if (fileType === 'csv') {
      sampleData = await new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (data) => {
            results.push(data);
            if (results.length >= 3) { // Берем первые 3 строки для анализа
              resolve(results);
            }
          })
          .on('end', () => resolve(results))
          .on('error', reject);
      });
    } else {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      sampleData = XLSX.utils.sheet_to_json(worksheet).slice(0, 3);
    }
    
    if (sampleData.length === 0) {
      return {
        isValid: false,
        message: 'File is empty or has no valid data',
        suggestions: []
      };
    }
    
    // Анализируем структуру
    const firstRow = sampleData[0];
    const headers = Object.keys(firstRow);
    
    const requiredFields = ['title', 'description', 'correctAnswer'];
    const optionalFields = ['difficulty', 'topic', 'points', 'explanation'];
    
    const suggestions = [];
    const missingRequired = [];
    
    // Проверяем обязательные поля
    requiredFields.forEach(field => {
      const found = headers.some(header => 
        header.toLowerCase().includes(field.toLowerCase()) ||
        header.toLowerCase().includes(field.replace(/([A-Z])/g, '_$1').toLowerCase())
      );
      if (!found) {
        missingRequired.push(field);
      }
    });
    
    // Проверяем варианты ответов
    const optionHeaders = headers.filter(header => 
      /option|choice|answer|вариант/i.test(header)
    );
    
    if (optionHeaders.length < 2) {
      suggestions.push('At least 2 option columns are required (option1, option2, etc.)');
    }
    
    if (missingRequired.length > 0) {
      return {
        isValid: false,
        message: `Missing required columns: ${missingRequired.join(', ')}`,
        suggestions: [
          'Required columns: title, description, correctAnswer',
          'Option columns: option1, option2, option3, etc.',
          'Optional columns: difficulty, topic, points, explanation'
        ]
      };
    }
    
    return {
      isValid: true,
      message: 'File structure is valid',
      headers,
      sampleData: sampleData.slice(0, 2),
      suggestions
    };
    
  } catch (error) {
    return {
      isValid: false,
      message: `File validation failed: ${error.message}`,
      suggestions: []
    };
  }
};

/**
 * Генерирует шаблон CSV файла для импорта
 * @returns {string} - CSV шаблон
 */
const generateCSVTemplate = () => {
  const headers = [
    'title',
    'description',
    'option1',
    'option2',
    'option3',
    'option4',
    'correctAnswer',
    'difficulty',
    'topic',
    'points',
    'explanation'
  ];
  
  const sampleData = [
    {
      title: 'What is 2 + 2?',
      description: 'Calculate the sum of 2 and 2',
      option1: '3',
      option2: '4',
      option3: '5',
      option4: '6',
      correctAnswer: '2',
      difficulty: 'easy',
      topic: 'Arithmetic',
      points: '1',
      explanation: '2 + 2 equals 4'
    },
    {
      title: 'What is the derivative of x²?',
      description: 'Find the derivative of the function f(x) = x²',
      option1: 'x',
      option2: '2x',
      option3: 'x²',
      option4: '2x²',
      correctAnswer: '2',
      difficulty: 'medium',
      topic: 'Calculus',
      points: '2',
      explanation: 'The derivative of x² is 2x using the power rule'
    }
  ];
  
  const csvRows = [headers.join(',')];
  
  sampleData.forEach(row => {
    const values = headers.map(header => {
      const value = row[header] || '';
      const escaped = String(value).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  });
  
  return csvRows.join('\n');
};

module.exports = {
  parseCSV,
  parseExcel,
  parseQuestionRow,
  validateImportFile,
  generateCSVTemplate
};