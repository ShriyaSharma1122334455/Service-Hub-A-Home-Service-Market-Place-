import { describe, it, expect, jest } from '@jest/globals';
import { createService, updateService } from '../controllers/serviceController.js';

const buildRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('serviceController validation', () => {
  it('createService rejects negative base_price', async () => {
    const req = {
      body: {
        category_id: 1,
        name: 'Test Service',
        description: 'Test',
        base_price: -10,
        duration_minutes: 30,
      },
      user: { id: 'user-1' },
    };
    const res = buildRes();

    await createService(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'base_price must be >= 0' });
  });

  it('createService rejects duration_minutes below 15', async () => {
    const req = {
      body: {
        category_id: 1,
        name: 'Test Service',
        description: 'Test',
        base_price: 50,
        duration_minutes: 10,
      },
      user: { id: 'user-1' },
    };
    const res = buildRes();

    await createService(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'duration_minutes must be >= 15' });
  });

  it('createService rejects non-numeric base_price', async () => {
    const req = {
      body: {
        category_id: 1,
        name: 'Test Service',
        description: 'Test',
        base_price: 'abc',
        duration_minutes: '30',
      },
      user: { id: 'user-1' },
    };
    const res = buildRes();

    await createService(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'base_price and duration_minutes must be numeric' });
  });

  it('updateService rejects invalid base_price', async () => {
    const req = {
      params: { id: 'service-1' },
      body: { base_price: -5 },
    };
    const res = buildRes();

    await updateService(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'base_price must be >= 0' });
  });

  it('updateService rejects invalid duration_minutes', async () => {
    const req = {
      params: { id: 'service-1' },
      body: { duration_minutes: 10 },
    };
    const res = buildRes();

    await updateService(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'duration_minutes must be >= 15' });
  });
});
