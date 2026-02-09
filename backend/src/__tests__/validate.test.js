/**
 * Tests for the Zod validation schemas.
 * Ensures input validation catches malformed data before it reaches route handlers.
 */
import { describe, it, expect } from 'vitest';
import { schemas } from '../middleware/validate.js';

describe('Auth schemas', () => {
  describe('register', () => {
    it('should accept valid registration data', () => {
      const result = schemas.register.safeParse({
        email: 'Test@Example.com',
        password: 'SecurePass123',
        firstName: 'John',
        lastName: 'Doe',
        firmName: 'Doe Legal LLC',
      });
      expect(result.success).toBe(true);
      // Email should be lowercased and trimmed
      expect(result.data.email).toBe('test@example.com');
    });

    it('should reject missing email', () => {
      const result = schemas.register.safeParse({
        password: 'SecurePass123',
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid email', () => {
      const result = schemas.register.safeParse({
        email: 'not-an-email',
        password: 'SecurePass123',
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toContain('email');
    });

    it('should reject password shorter than 8 chars', () => {
      const result = schemas.register.safeParse({
        email: 'test@example.com',
        password: 'short',
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toContain('password');
    });

    it('should reject empty firstName', () => {
      const result = schemas.register.safeParse({
        email: 'test@example.com',
        password: 'SecurePass123',
        firstName: '',
        lastName: 'Doe',
      });
      expect(result.success).toBe(false);
    });

    it('should allow optional firmName', () => {
      const result = schemas.register.safeParse({
        email: 'test@example.com',
        password: 'SecurePass123',
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(result.success).toBe(true);
      expect(result.data.firmName).toBeUndefined();
    });
  });

  describe('login', () => {
    it('should accept valid login', () => {
      const result = schemas.login.safeParse({
        email: 'test@example.com',
        password: 'any-password',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty email', () => {
      const result = schemas.login.safeParse({
        email: '',
        password: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty password', () => {
      const result = schemas.login.safeParse({
        email: 'test@example.com',
        password: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updatePassword', () => {
    it('should accept valid password update', () => {
      const result = schemas.updatePassword.safeParse({
        currentPassword: 'old-password',
        newPassword: 'NewSecurePassword123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject new password under 8 chars', () => {
      const result = schemas.updatePassword.safeParse({
        currentPassword: 'old',
        newPassword: 'short',
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toContain('newPassword');
    });
  });

  describe('resetPassword', () => {
    it('should accept valid reset', () => {
      const result = schemas.resetPassword.safeParse({
        token: 'abc123def456',
        newPassword: 'NewSecurePassword123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty token', () => {
      const result = schemas.resetPassword.safeParse({
        token: '',
        newPassword: 'NewSecurePassword123',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Client schema', () => {
  it('should accept valid client', () => {
    const result = schemas.createClient.safeParse({
      displayName: 'Acme Corp',
      type: 'company',
    });
    expect(result.success).toBe(true);
    expect(result.data.contactType).toBe('client'); // default
  });

  it('should reject empty displayName', () => {
    const result = schemas.createClient.safeParse({
      displayName: '',
      type: 'person',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid type', () => {
    const result = schemas.createClient.safeParse({
      displayName: 'Test',
      type: 'alien',
    });
    expect(result.success).toBe(false);
  });

  it('should allow extra fields with passthrough', () => {
    const result = schemas.createClient.safeParse({
      displayName: 'Test Client',
      type: 'person',
      someExtraField: 'should pass through',
    });
    expect(result.success).toBe(true);
    expect(result.data.someExtraField).toBe('should pass through');
  });
});

describe('Matter schema', () => {
  it('should accept valid matter with defaults', () => {
    const result = schemas.createMatter.safeParse({
      name: 'Smith v. Jones',
    });
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('active');
    expect(result.data.priority).toBe('medium');
    expect(result.data.billingType).toBe('hourly');
  });

  it('should reject empty matter name', () => {
    const result = schemas.createMatter.safeParse({
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid status', () => {
    const result = schemas.createMatter.safeParse({
      name: 'Test Matter',
      status: 'invalid_status',
    });
    expect(result.success).toBe(false);
  });
});

describe('Time entry schema', () => {
  it('should accept valid time entry', () => {
    const result = schemas.createTimeEntry.safeParse({
      matterId: '550e8400-e29b-41d4-a716-446655440000',
      date: '2025-01-15',
      hours: 2.5,
      description: 'Research case law',
      rate: 350,
    });
    expect(result.success).toBe(true);
    expect(result.data.billable).toBe(true); // default
  });

  it('should reject hours over 24', () => {
    const result = schemas.createTimeEntry.safeParse({
      matterId: '550e8400-e29b-41d4-a716-446655440000',
      date: '2025-01-15',
      hours: 25,
      description: 'Too many hours',
      rate: 350,
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid UUID for matterId', () => {
    const result = schemas.createTimeEntry.safeParse({
      matterId: 'not-a-uuid',
      date: '2025-01-15',
      hours: 1,
      description: 'Test',
      rate: 100,
    });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toContain('matterId');
  });

  it('should reject empty description', () => {
    const result = schemas.createTimeEntry.safeParse({
      matterId: '550e8400-e29b-41d4-a716-446655440000',
      date: '2025-01-15',
      hours: 1,
      description: '',
      rate: 100,
    });
    expect(result.success).toBe(false);
  });
});
