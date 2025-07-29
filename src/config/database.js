const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Создаем индексы для оптимизации
    await createIndexes();
    
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

const createIndexes = async () => {
  try {
    const User = require('../models/User');
    const Question = require('../models/Question');
    const Test = require('../models/Test');
    
    // Индексы для User
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await User.collection.createIndex({ role: 1 });
    await User.collection.createIndex({ testId: 1 });
    
    // Индексы для Question
    await Question.collection.createIndex({ difficulty: 1 });
    await Question.collection.createIndex({ topic: 1 });
    await Question.collection.createIndex({ createdAt: -1 });
    
    // Индексы для Test
    await Test.collection.createIndex({ userId: 1 }, { unique: true });
    await Test.collection.createIndex({ isCompleted: 1 });
    await Test.collection.createIndex({ createdAt: -1 });
    
    console.log('✅ Database indexes created');
  } catch (error) {
    console.warn('⚠️  Index creation warning:', error.message);
  }
};

// Обработка отключения
mongoose.connection.on('disconnected', () => {
  console.log('❌ MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err);
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('📴 MongoDB connection closed through app termination');
  process.exit(0);
});

module.exports = connectDB;