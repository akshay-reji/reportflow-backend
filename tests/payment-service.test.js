// tests/payment-service.test.js
const paymentService = require('../services/payment-service');
const supabase = require('../lib/supabase');
const axios = require('axios');
const axiosRetry = require('axios-retry');

// Mock external dependencies
jest.mock('axios');
jest.mock('../lib/supabase');
jest.mock('axios-retry', () => ({
  default: jest.fn()
}));

describe('Payment Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createCustomer', () => {
    it('should create a customer and persist dodo_customer_id', async () => {
      // 1. Mock successful Dodo API response
      const mockDodoResponse = {
        data: {
          id: 'cus_test123',
          email: 'test@example.com',
          name: 'Test Customer'
        }
      };
      axios.post.mockResolvedValue(mockDodoResponse);

      // 2. Mock Supabase update
      supabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        })
      });

      // 3. Test data
      const tenantId = 'tenant-uuid-123';
      const customerData = {
        email: 'test@example.com',
        name: 'Test Customer'
      };

      // 4. Execute
      const result = await paymentService.createCustomer(tenantId, customerData);

      // 5. Assertions
      expect(result.success).toBe(true);
      expect(result.customer.id).toBe('cus_test123');
      expect(axios.post).toHaveBeenCalled();
      expect(supabase.from).toHaveBeenCalledWith('tenants');
    });

    it('should handle Dodo API failure gracefully', async () => {
      // Mock API failure
      axios.post.mockRejectedValue(new Error('API timeout'));

      const result = await paymentService.createCustomer('tenant-uuid-123', {
        email: 'test@example.com',
        name: 'Test Customer'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed');
    });
  });

  describe('checkUsage middleware', () => {
    // We'll test the middleware directly
    it('should allow request when under limit', async () => {
      // This test will be expanded once we extract middleware logic
    });
  });
});