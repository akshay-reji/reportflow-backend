// tests/payment.test.js
const request = require('supertest');
const app = require('../server');
const supabase = require('../lib/supabase');
const paymentService = require('../services/payment-service');

// Mock axios
jest.mock('axios');

describe('Payment API', () => {
  const mockTenantId = '3bce31b7-b045-4da0-981c-db138e866cfe';
  const mockCustomer = {
    email: 'test@example.com',
    name: 'Test Customer'
  };
  const mockPriceId = 'price_test_123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/payment/create-customer', () => {
    it('should return 400 if tenant_id is missing', async () => {
      const response = await request(app)
        .post('/api/payment/create-customer')
        .send({ customer: mockCustomer });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 if customer email is missing', async () => {
      const response = await request(app)
        .post('/api/payment/create-customer')
        .send({ 
          tenant_id: mockTenantId,
          customer: { name: 'Test' }
        });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    // More tests to be added when we mock Dodo API
  });

  describe('POST /api/payment/create-subscription', () => {
    it('should return 400 if price_id is missing', async () => {
      const response = await request(app)
        .post('/api/payment/create-subscription')
        .send({ 
          tenant_id: mockTenantId 
        });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    // More tests to be added
  });

  describe('POST /api/payment/webhook', () => {
    it('should accept valid webhook signature', async () => {
      // Test webhook signature verification
      // This would require proper mocking of the signature verification
    });

    it('should handle duplicate events idempotently', async () => {
      // Test idempotency logic
    });
  });
});

describe('PaymentService', () => {
  describe('checkUsageLimits', () => {
    it('should return allowed true for active subscription within limits', async () => {
      // Mock Supabase response
      const mockSubscription = {
        status: 'active',
        plans: {
          max_reports_per_month: 100,
          max_clients: 10
        }
      };

      // Mock Supabase
      supabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockSubscription, error: null })
          })
        })
      });

      const result = await paymentService.checkUsageLimits('test-tenant-id');
      
      expect(result.allowed).toBe(true);
    });

    it('should return allowed false if subscription not active', async () => {
      const mockSubscription = {
        status: 'canceled',
        plans: {
          max_reports_per_month: 100,
          max_clients: 10
        }
      };

      supabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockSubscription, error: null })
          })
        })
      });

      const result = await paymentService.checkUsageLimits('test-tenant-id');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Subscription is canceled');
    });
  });
});