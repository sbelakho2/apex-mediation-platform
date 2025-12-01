import { jest } from '@jest/globals';

const query = jest.fn(async () => ({ rows: [] }));
const insertMany = jest.fn(async () => {});
const connect = jest.fn(async () => ({ release: jest.fn() }));
const end = jest.fn();
const on = jest.fn();
const initializeDatabase = jest.fn(async () => {});

const mockPool = {
  query,
  insertMany,
  connect,
  end,
  on,
};

const getClient = jest.fn(() => connect());

export { query, insertMany, getClient, initializeDatabase };
export default mockPool;
