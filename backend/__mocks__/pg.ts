import { jest } from '@jest/globals';

type Listener = (...args: unknown[]) => void;

type MockedClient = {
  query: jest.Mock;
  release: jest.Mock;
};

const createClient = (): MockedClient => ({
  query: jest.fn(),
  release: jest.fn(),
});

const defaultClient = createClient();

class MockPool {
  public query = jest.fn();
  public connect = jest.fn(async () => defaultClient);
  public end = jest.fn();
  public on = jest.fn((_event: string, _listener: Listener) => this);
}

class MockClient {
  public connect = jest.fn(async () => undefined);
  public query = jest.fn(async () => ({ rows: [], rowCount: 1 }));
  public end = jest.fn(async () => undefined);
}

const Pool = jest.fn(() => new MockPool());
const Client = jest.fn(() => new MockClient());

export { Pool, Client };
export type { MockedClient };
