import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRegister } from '@/app/api/register/route';
import { handleForgotPassword } from '@/app/api/forgot-password/route';
import { handleResetPassword } from '@/app/api/reset-password/route';
import { handleUserByEmail } from '@/app/api/user-by-email/route';

describe('register', () => {
  const baseDeps = () => ({
    dbConnect: vi.fn(),
    userModel: {
      findOne: vi.fn(),
      create: vi.fn()
    },
    hashPassword: vi.fn(),
    sendEmail: vi.fn()
  });

  it('rejects missing fields', async () => {
    const result = await handleRegister({ email: '', password: '' }, baseDeps());
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/email and password/i);
  });

  it('rejects invalid email', async () => {
    const result = await handleRegister({ email: 'bad', password: 'pw' }, baseDeps());
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/invalid email/i);
  });

  it('blocks duplicate emails', async () => {
    const deps = baseDeps();
    deps.userModel.findOne.mockResolvedValueOnce({ id: 'existing' });

    const result = await handleRegister({ email: 'a@test.com', password: 'pw' }, deps);

    expect(result.status).toBe(409);
    expect(deps.userModel.create).not.toHaveBeenCalled();
  });
});

describe('forgot password', () => {
  const baseDeps = () => ({
    dbConnect: vi.fn(),
    userModel: {
      findOne: vi.fn()
    },
    resetCodeModel: {
      create: vi.fn()
    },
    sendEmail: vi.fn(),
    randomUUID: vi.fn()
  });

  beforeEach(() => {
    process.env.NEXTJS_APP_BASE_URL = 'https://example.com';
  });

  it('requires an email', async () => {
    const result = await handleForgotPassword({}, baseDeps());
    expect(result.status).toBe(400);
  });

  it('returns 404 when user is missing', async () => {
    const deps = baseDeps();
    deps.userModel.findOne.mockResolvedValueOnce(null);

    const result = await handleForgotPassword({ email: 'no@example.com' }, deps);

    expect(result.status).toBe(404);
  });

  it('creates reset code and emails link', async () => {
    const deps = baseDeps();
    deps.userModel.findOne.mockResolvedValueOnce({ id: 'user123', email: 'a@test.com', name: 'Test' });
    deps.randomUUID.mockReturnValueOnce('one').mockReturnValueOnce('two').mockReturnValueOnce('three');
    deps.resetCodeModel.create.mockResolvedValueOnce({ code: 'one-two-three' });

    const result = await handleForgotPassword({ email: 'a@test.com' }, deps);

    expect(result.status).toBe(200);
    expect(deps.resetCodeModel.create).toHaveBeenCalledWith({
      user: 'user123',
      expiresAt: expect.any(Date),
      code: 'one-two-three'
    });
    expect(deps.sendEmail).toHaveBeenCalledWith(
      'a@test.com',
      'Password reset',
      expect.stringContaining('one-two-three'),
      expect.stringContaining('one-two-three')
    );
  });
});

describe('reset password', () => {
  const baseDeps = () => ({
    dbConnect: vi.fn(),
    userModel: {
      updateOne: vi.fn()
    },
    resetCodeModel: {
      findOne: vi.fn(),
      updateOne: vi.fn()
    },
    hashPassword: vi.fn()
  });

  it('requires token and password', async () => {
    const result = await handleResetPassword({}, baseDeps());
    expect(result.status).toBe(400);
  });

  it('rejects unknown token', async () => {
    const deps = baseDeps();
    deps.resetCodeModel.findOne.mockResolvedValueOnce(null);

    const result = await handleResetPassword({ token: 'abc', newPassword: 'pw' }, deps);

    expect(result.status).toBe(400);
  });

  it('rejects expired token', async () => {
    const deps = baseDeps();
    deps.resetCodeModel.findOne.mockResolvedValueOnce({
      isUsed: false,
      code: 'abc',
      expiresAt: new Date(Date.now() - 1000)
    });

    const result = await handleResetPassword({ token: 'abc', newPassword: 'pw' }, deps);

    expect(result.status).toBe(400);
    expect(deps.userModel.updateOne).not.toHaveBeenCalled();
  });

  it('updates password and marks token used', async () => {
    const deps = baseDeps();
    deps.resetCodeModel.findOne.mockResolvedValueOnce({
      _id: 'reset123',
      user: 'user123',
      expiresAt: new Date(Date.now() + 1000),
      isUsed: false
    });
    deps.hashPassword.mockResolvedValueOnce('hashed');

    const result = await handleResetPassword({ token: 'abc', newPassword: 'pw' }, deps);

    expect(result.status).toBe(200);
    expect(deps.userModel.updateOne).toHaveBeenCalledWith(
      { _id: 'user123' },
      { $set: { passwordHash: 'hashed' } }
    );
    expect(deps.resetCodeModel.updateOne).toHaveBeenCalledWith(
      { _id: 'reset123' },
      { $set: { isUsed: true } }
    );
  });
});

describe('user by email', () => {
  const baseDeps = () => ({
    dbConnect: vi.fn(),
    userModel: { findOne: vi.fn() }
  });

  it('validates input', async () => {
    const result = await handleUserByEmail({}, baseDeps());
    expect(result.status).toBe(400);
  });

  it('returns 404 when missing', async () => {
    const deps = baseDeps();
    deps.userModel.findOne.mockReturnValueOnce({ lean: () => null });

    const result = await handleUserByEmail({ email: 'missing@test.com' }, deps);

    expect(result.status).toBe(404);
  });

  it('returns user when found', async () => {
    const deps = baseDeps();
    deps.userModel.findOne.mockReturnValueOnce({ lean: () => ({ id: '123', email: 'a@test.com' }) });

    const result = await handleUserByEmail({ email: 'a@test.com' }, deps);

    expect(result.status).toBe(200);
    expect(result.body.user).toEqual({ id: '123', email: 'a@test.com' });
  });
});
