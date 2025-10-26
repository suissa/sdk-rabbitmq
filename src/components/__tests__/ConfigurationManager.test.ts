import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationManager } from '../ConfigurationManager';
import { ConfigurationError } from '../../interfaces/IErrors';
import { IConfiguration } from '../../interfaces/IConfiguration';

// Mock fs module
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('ConfigurationManager', () => {
  let configManager: ConfigurationManager;
  const mockConfigPath = path.join(process.cwd(), 'config.json');

  beforeEach(() => {
    // Reset singleton instance before each test
    (ConfigurationManager as any).instance = null;
    configManager = ConfigurationManager.getInstance();
    configManager.clearCache();
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Singleton Behavior', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = ConfigurationManager.getInstance();
      const instance2 = ConfigurationManager.getInstance();
      const instance3 = ConfigurationManager.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
      expect(instance1).toBe(instance3);
    });
  });

  describe('Valid Configuration Loading', () => {
    it('should load valid configuration successfully', () => {
      const validConfig: IConfiguration = {
        url: 'amqp://localhost:5672',
        dlq: {
          active: true,
          ttl: 300000,
          maxRetries: 3,
          retryDelay: 5000,
        },
        logging: {
          level: 'info',
          format: 'json',
        },
      };

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));

      const result = configManager.loadConfig();

      expect(mockedFs.existsSync).toHaveBeenCalledWith(mockConfigPath);
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(mockConfigPath, 'utf-8');
      expect(result).toEqual(validConfig);
    });

    it('should load minimal valid configuration', () => {
      const minimalConfig: IConfiguration = {
        url: 'amqp://localhost:5672',
        dlq: {
          active: false,
        },
      };

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(minimalConfig));

      const result = configManager.loadConfig();

      expect(result).toEqual(minimalConfig);
    });

    it('should return cached configuration on subsequent calls', () => {
      const validConfig: IConfiguration = {
        url: 'amqp://localhost:5672',
        dlq: {
          active: true,
        },
      };

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));

      // First call
      const result1 = configManager.loadConfig();
      // Second call
      const result2 = configManager.loadConfig();

      expect(mockedFs.readFileSync).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
      expect(result1).toBe(result2); // Should be the same object reference
    });

    it('should load configuration with optional logging properties', () => {
      const configWithLogging: IConfiguration = {
        url: 'amqp://test:5672',
        dlq: {
          active: true,
          ttl: 600000,
          maxRetries: 5,
          retryDelay: 10000,
        },
        logging: {
          level: 'debug',
          format: 'text',
        },
      };

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(configWithLogging));

      const result = configManager.loadConfig();

      expect(result).toEqual(configWithLogging);
    });
  });

  describe('Missing File Error Handling', () => {
    it('should throw ConfigurationError when config file does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      expect(() => configManager.loadConfig()).toThrow(ConfigurationError);
      expect(() => configManager.loadConfig()).toThrow(
        `Configuration file not found at ${mockConfigPath}. Please create a config.json file in your project root.`
      );
    });

    it('should include config path in error context when file is missing', () => {
      mockedFs.existsSync.mockReturnValue(false);

      try {
        configManager.loadConfig();
        throw new Error('Expected ConfigurationError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).context).toEqual({
          configPath: mockConfigPath,
        });
      }
    });

    it('should throw ConfigurationError when file read fails', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => configManager.loadConfig()).toThrow(ConfigurationError);
      expect(() => configManager.loadConfig()).toThrow('Failed to load configuration: Permission denied');
    });

    it('should throw ConfigurationError when JSON parsing fails', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue('{ invalid json }');

      expect(() => configManager.loadConfig()).toThrow(ConfigurationError);
      expect(() => configManager.loadConfig()).toThrow(/Invalid JSON in configuration file/);
    });
  });

  describe('Invalid Schema Validation', () => {
    beforeEach(() => {
      mockedFs.existsSync.mockReturnValue(true);
    });

    it('should throw ConfigurationError when config is not an object', () => {
      mockedFs.readFileSync.mockReturnValue('"not an object"');

      expect(() => configManager.loadConfig()).toThrow(ConfigurationError);
      expect(() => configManager.loadConfig()).toThrow('Configuration must be a valid object');
    });

    it('should throw ConfigurationError when url is missing', () => {
      const invalidConfig = {
        dlq: { active: true },
      };
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => configManager.loadConfig()).toThrow(ConfigurationError);
      expect(() => configManager.loadConfig()).toThrow('Configuration must include a valid "url" string property');
    });

    it('should throw ConfigurationError when url is not a string', () => {
      const invalidConfig = {
        url: 12345,
        dlq: { active: true },
      };
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => configManager.loadConfig()).toThrow(ConfigurationError);
      expect(() => configManager.loadConfig()).toThrow('Configuration must include a valid "url" string property');
    });

    it('should throw ConfigurationError when dlq is missing', () => {
      const invalidConfig = {
        url: 'amqp://localhost:5672',
      };
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => configManager.loadConfig()).toThrow(ConfigurationError);
      expect(() => configManager.loadConfig()).toThrow('Configuration must include a valid "dlq" object property');
    });

    it('should throw ConfigurationError when dlq is not an object', () => {
      const invalidConfig = {
        url: 'amqp://localhost:5672',
        dlq: 'not an object',
      };
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => configManager.loadConfig()).toThrow(ConfigurationError);
      expect(() => configManager.loadConfig()).toThrow('Configuration must include a valid "dlq" object property');
    });

    it('should throw ConfigurationError when dlq.active is missing', () => {
      const invalidConfig = {
        url: 'amqp://localhost:5672',
        dlq: {},
      };
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => configManager.loadConfig()).toThrow(ConfigurationError);
      expect(() => configManager.loadConfig()).toThrow('Configuration dlq.active must be a boolean value');
    });

    it('should throw ConfigurationError when dlq.active is not a boolean', () => {
      const invalidConfig = {
        url: 'amqp://localhost:5672',
        dlq: { active: 'yes' },
      };
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => configManager.loadConfig()).toThrow(ConfigurationError);
      expect(() => configManager.loadConfig()).toThrow('Configuration dlq.active must be a boolean value');
    });

    it('should throw ConfigurationError when dlq.ttl is negative', () => {
      const invalidConfig = {
        url: 'amqp://localhost:5672',
        dlq: { active: true, ttl: -1000 },
      };
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => configManager.loadConfig()).toThrow(ConfigurationError);
      expect(() => configManager.loadConfig()).toThrow('Configuration dlq.ttl must be a positive number');
    });

    it('should throw ConfigurationError when dlq.maxRetries is negative', () => {
      const invalidConfig = {
        url: 'amqp://localhost:5672',
        dlq: { active: true, maxRetries: -5 },
      };
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => configManager.loadConfig()).toThrow(ConfigurationError);
      expect(() => configManager.loadConfig()).toThrow('Configuration dlq.maxRetries must be a positive number');
    });

    it('should throw ConfigurationError when dlq.retryDelay is negative', () => {
      const invalidConfig = {
        url: 'amqp://localhost:5672',
        dlq: { active: true, retryDelay: -2000 },
      };
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => configManager.loadConfig()).toThrow(ConfigurationError);
      expect(() => configManager.loadConfig()).toThrow('Configuration dlq.retryDelay must be a positive number');
    });

    it('should throw ConfigurationError when logging is not an object', () => {
      const invalidConfig = {
        url: 'amqp://localhost:5672',
        dlq: { active: true },
        logging: 'invalid',
      };
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => configManager.loadConfig()).toThrow(ConfigurationError);
      expect(() => configManager.loadConfig()).toThrow('Configuration logging must be an object');
    });

    it('should throw ConfigurationError when logging.level is invalid', () => {
      const invalidConfig = {
        url: 'amqp://localhost:5672',
        dlq: { active: true },
        logging: { level: 'invalid' },
      };
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => configManager.loadConfig()).toThrow(ConfigurationError);
      expect(() => configManager.loadConfig()).toThrow('Configuration logging.level must be one of: error, warn, info, debug');
    });

    it('should throw ConfigurationError when logging.format is invalid', () => {
      const invalidConfig = {
        url: 'amqp://localhost:5672',
        dlq: { active: true },
        logging: { format: 'invalid' },
      };
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => configManager.loadConfig()).toThrow(ConfigurationError);
      expect(() => configManager.loadConfig()).toThrow('Configuration logging.format must be one of: json, text');
    });
  });

  describe('Utility Methods', () => {
    it('should return correct config path', () => {
      const configPath = configManager.getConfigPath();
      expect(configPath).toBe(mockConfigPath);
    });

    it('should clear cache properly', () => {
      const validConfig: IConfiguration = {
        url: 'amqp://localhost:5672',
        dlq: { active: true },
      };

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));

      // Load config to cache it
      configManager.loadConfig();
      expect(mockedFs.readFileSync).toHaveBeenCalledTimes(1);

      // Clear cache and load again
      configManager.clearCache();
      configManager.loadConfig();
      expect(mockedFs.readFileSync).toHaveBeenCalledTimes(2);
    });

    it('should validate config directly without loading from file', () => {
      const validConfig: IConfiguration = {
        url: 'amqp://localhost:5672',
        dlq: { active: true },
      };

      expect(() => configManager.validateConfig(validConfig)).not.toThrow();

      const invalidConfig = {
        url: 'amqp://localhost:5672',
        // missing dlq
      };

      expect(() => configManager.validateConfig(invalidConfig)).toThrow(ConfigurationError);
    });
  });
});