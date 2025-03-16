// tests/favorites.test.js
import request from 'supertest';
import app from '../src/server.js';
import { mysqlPool } from '../src/config/database.js';

let authToken;
let userId;
let propertyId;

beforeAll(async () => {
  // Login to get auth token
  const response = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'test@example.com',
      password: 'password123'
    });
  
  authToken = response.body.data.token;
  userId = response.body.data.user.id;
  
  // Create a test property
  const propertyResponse = await request(app)
    .post('/api/properties')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      title: 'Test Property',
      description: 'A property for testing favorites',
      address: '123 Test St',
      city: 'Test City',
      state: 'Test State',
      price: 100000,
      property_type: 'house'
    });
  
  propertyId = propertyResponse.body.data.propertyId;
});

afterAll(async () => {
  // Clean up - delete test property
  await request(app)
    .delete(`/api/properties/${propertyId}`)
    .set('Authorization', `Bearer ${authToken}`);
  
  // Close database connection
  await mysqlPool.end();
});

describe('Favorites API', () => {
  test('Add property to favorites', async () => {
    const response = await request(app)
      .post(`/api/users/favorites/${propertyId}`)
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
  
  test('Get user favorites', async () => {
    const response = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.some(p => p.id === propertyId)).toBe(true);
  });
  
  test('Remove property from favorites', async () => {
    const response = await request(app)
      .delete(`/api/users/favorites/${propertyId}`)
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    
    // Verify it's removed
    const checkResponse = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(checkResponse.body.data.some(p => p.id === propertyId)).toBe(false);
  });
});