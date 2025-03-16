import express from 'express';
import cors from 'cors';
import { mysqlPool } from './config/database.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Test route
app.get('/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

// Test database connection
mysqlPool.getConnection()
  .then(connection => {
    console.log('Database connected successfully');
    connection.release();
  })
  .catch(error => {
    console.error('Error connecting to database:', error);
  });

export default app;