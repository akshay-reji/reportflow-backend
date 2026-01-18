// tests/payment-service.test.js - FIXED VERSION
const paymentService = require('../services/payment-service');

// Mock the entire axios module to prevent real HTTP calls
jest.mock('axios', () => {
  const mockAxiosInstance = {
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() }
    },
    request: jest.fn(), // This is the key - tryEndpoints calls axiosInstance(config)
    post: jest.fn(),
    get: jest.fn()
  };
  
  // axios.create returns a function that can be called directly
  const mockInstance = jest.fn((config) => mockAxiosInstance.request(config));
  Object.assign(mockInstance, mockAxiosInstance);
  
  return {
    create: jest.fn(() => mockInstance),
    ...mockAxiosInstance
  };
});

// Mock axios-retry to do nothing
jest.mock('axios-retry', () => ({
  default: jest.fn()
}));

// Mock supabase with chainable methods
jest.mock('../lib/supabase', () => {
  const mockSupabase = {
    from: jest.fn(() => mockSupabase),
    update: jest.fn(() => mockSupabase),
    insert: jest.fn(() => mockSupabase),
    select: jest.fn(() => mockSupabase),
    eq: jest.fn(() => mockSupabase),
    single: jest.fn(() => Promise.resolve({ data: null, error: null })),
    rpc: jest.fn(() => Promise.resolve({ error: null }))
  };
  return mockSupabase;
});

describe('Payment Service - Critical Functions', () => {
  let axios;
  let supabase;

  beforeEach(() => {
    jest.clearAllMocks();
    axios = require('axios');
    supabase = require('../lib/supabase');
    
    // Mock successful axios request by default
    const mockInstance = axios.create();
    mockInstance.request.mockResolvedValue({
      data: { id: 'cus_test123', email: 'test@example.com' },
      status: 200
    });
  });

  describe('createCustomer', () => {
    it('should return success when axios request succeeds', async () => {
      const tenantId = 'tenant-uuid-123';
      const customerData = {
        email: 'test@example.com',
        name: 'Test Customer'
      };

      // Mock Supabase update to succeed
      supabase.from().update().eq.mockResolvedValue({ error: null });

      const result = await paymentService.createCustomer(tenantId, customerData);

      expect(result.success).toBe(true);
      expect(result.customer.id).toBe('cus_test123');
    });

    it('should return failure when axios request fails', async () => {
      const mockInstance = axios.create();
      mockInstance.request.mockRejectedValue(new Error('Network error'));

      const result = await paymentService.createCustomer('tenant-uuid-123', {
        email: 'test@example.com',
        name: 'Test Customer'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});