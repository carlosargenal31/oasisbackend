/**
 * Database connection
 * MySQL and MongoDB connections for OASIS application
 */
import mysql from 'mysql2/promise';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// MySQL connection pool
export const mysqlPool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'oasis',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// MongoDB connection
export const connectMongoDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oasis';
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Test MySQL connection
export const testMySQLConnection = async () => {
  try {
    const connection = await mysqlPool.getConnection();
    console.log('MySQL connection established successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('MySQL connection error:', error);
    return false;
  }
};

export default {
  mysqlPool,
  connectMongoDB,
  testMySQLConnection
};