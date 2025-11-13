import { jest } from '@jest/globals';

const query = jest.fn();
const connect = jest.fn();
const end = jest.fn();
const on = jest.fn();

const mockPool = {
  query,
  connect,
  end,
  on,
};

const getClient = jest.fn(() => connect());

export { query, getClient };
export default mockPool;
