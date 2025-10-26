import { Logger } from '../Logger';
import { IConfiguration } from '../../interfaces/IConfiguration';

describe('Logger', () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleDebug: typeof console.debug;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset singleton instance before each test
    Logger.resetInstance();
    
    // Mock console methods
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
    originalConsoleDebug = console.debug;
    
    logSpy = jest.spyOn(console, 'log').mockImplementation();
    errorSpy = jest.spyOn(console, 'error').mockImplementation();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    debugSpy = jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    // Restore original console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    console.debug = originalConsoleDebug;
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when getInstance is called multiple times', () => {
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance();
      
      expect(logger1).toBe(logger2);
    });

    it('should create component-specific logger instances', () => {
      const componentLogger = Logger.createComponentLogger('TestComponent');
      const globalLogger = Logger.getInstance();
      
      expect(componentLogger).not.toBe(globalLogger);
    });
  });

  describe('Log Levels and Formatting', () => {
    describe('Text Format (default)', () => {
      it('should log error messages using console.error', () => {
        const logger = Logger.getInstance();
        logger.error('Test error message');
        
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[ERROR\] Test error message/)
        );
      });

      it('should log warning messages using console.warn', () => {
        const logger = Logger.getInstance();
        logger.warn('Test warning message');
        
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[WARN\] Test warning message/)
        );
      });

      it('should log info messages using console.log', () => {
        const logger = Logger.getInstance();
        logger.info('Test info message');
        
        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] Test info message/)
        );
      });

      it('should log debug messages using console.debug when debug level is enabled', () => {
        const config: IConfiguration['logging'] = { level: 'debug', format: 'text' };
        const logger = Logger.getInstance(config);
        logger.debug('Test debug message');
        
        expect(debugSpy).toHaveBeenCalledTimes(1);
        expect(debugSpy).toHaveBeenCalledWith(
          expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[DEBUG\] Test debug message/)
        );
      });

      it('should not log debug messages when info level is set', () => {
        const config: IConfiguration['logging'] = { level: 'info', format: 'text' };
        const logger = Logger.getInstance(config);
        logger.debug('Test debug message');
        
        expect(debugSpy).not.toHaveBeenCalled();
        expect(logSpy).not.toHaveBeenCalled();
      });

      it('should respect log level hierarchy (error only)', () => {
        const config: IConfiguration['logging'] = { level: 'error', format: 'text' };
        const logger = Logger.getInstance(config);
        
        logger.error('Error message');
        logger.warn('Warning message');
        logger.info('Info message');
        logger.debug('Debug message');
        
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).not.toHaveBeenCalled();
        expect(logSpy).not.toHaveBeenCalled();
        expect(debugSpy).not.toHaveBeenCalled();
      });
    });

    describe('JSON Format', () => {
      it('should log messages in JSON format when configured', () => {
        const config: IConfiguration['logging'] = { level: 'info', format: 'json' };
        const logger = Logger.getInstance(config);
        logger.info('Test JSON message');
        
        expect(logSpy).toHaveBeenCalledTimes(1);
        const loggedMessage = logSpy.mock.calls[0][0];
        const parsedLog = JSON.parse(loggedMessage);
        
        expect(parsedLog).toMatchObject({
          level: 'INFO',
          message: 'Test JSON message',
          timestamp: expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/)
        });
      });

      it('should include context in JSON format', () => {
        const config: IConfiguration['logging'] = { level: 'info', format: 'json' };
        const logger = Logger.getInstance(config);
        const context = { userId: 123, operation: 'test' };
        logger.info('Test message with context', context);
        
        expect(logSpy).toHaveBeenCalledTimes(1);
        const loggedMessage = logSpy.mock.calls[0][0];
        const parsedLog = JSON.parse(loggedMessage);
        
        expect(parsedLog).toMatchObject({
          level: 'INFO',
          message: 'Test message with context',
          context: { userId: 123, operation: 'test' },
          timestamp: expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/)
        });
      });

      it('should include component name in JSON format', () => {
        const config: IConfiguration['logging'] = { level: 'info', format: 'json' };
        const logger = Logger.createComponentLogger('TestComponent', config);
        logger.info('Component message');
        
        expect(logSpy).toHaveBeenCalledTimes(1);
        const loggedMessage = logSpy.mock.calls[0][0];
        const parsedLog = JSON.parse(loggedMessage);
        
        expect(parsedLog).toMatchObject({
          level: 'INFO',
          message: 'Component message',
          component: 'TestComponent',
          timestamp: expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/)
        });
      });
    });
  });

  describe('Contextual Logging with Metadata', () => {
    it('should log messages with context in text format', () => {
      const logger = Logger.getInstance();
      const context = { userId: 123, sessionId: 'abc-123' };
      logger.info('User action performed', context);
      
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('User action performed | Context: {"userId":123,"sessionId":"abc-123"}')
      );
    });

    it('should log operation with context using logOperation method', () => {
      const logger = Logger.getInstance();
      const context = { messageId: 'msg-123', exchange: 'test-exchange' };
      logger.logOperation('publish', 'Message published successfully', context);
      
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Message published successfully | Context: {"operation":"publish","messageId":"msg-123","exchange":"test-exchange"}')
      );
    });

    it('should log errors with stack trace using logError method', () => {
      const logger = Logger.getInstance();
      const error = new Error('Test error');
      const context = { operation: 'connect' };
      logger.logError('Connection failed', error, context);
      
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const loggedMessage = errorSpy.mock.calls[0][0];
      
      expect(loggedMessage).toContain('Connection failed');
      expect(loggedMessage).toContain('"error":{"name":"Error","message":"Test error","stack":');
      expect(loggedMessage).toContain('"operation":"connect"');
    });

    it('should log connection state changes with context', () => {
      const logger = Logger.getInstance();
      const context = { url: 'amqp://localhost:5672', attempt: 1 };
      logger.logConnectionState('connected', context);
      
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Connection state changed to: connected | Context: {"connectionState":"connected","url":"amqp://localhost:5672","attempt":1}')
      );
    });

    it('should handle complex nested context objects', () => {
      const config: IConfiguration['logging'] = { level: 'info', format: 'json' };
      const logger = Logger.getInstance(config);
      const complexContext = {
        user: { id: 123, name: 'John Doe' },
        request: { method: 'POST', url: '/api/messages' },
        metadata: { timestamp: Date.now(), version: '1.0.0' }
      };
      
      logger.info('Complex operation completed', complexContext);
      
      expect(logSpy).toHaveBeenCalledTimes(1);
      const loggedMessage = logSpy.mock.calls[0][0];
      const parsedLog = JSON.parse(loggedMessage);
      
      expect(parsedLog.context).toEqual(complexContext);
    });
  });

  describe('Component Integration', () => {
    it('should create component-specific loggers with proper component names', () => {
      const config: IConfiguration['logging'] = { level: 'info', format: 'text' };
      const connectionLogger = Logger.createComponentLogger('ConnectionManager', config);
      const publisherLogger = Logger.createComponentLogger('MessagePublisher', config);
      
      connectionLogger.info('Connection established');
      publisherLogger.info('Message published');
      
      expect(logSpy).toHaveBeenCalledTimes(2);
      expect(logSpy).toHaveBeenNthCalledWith(1, 
        expect.stringContaining('[ConnectionManager] Connection established')
      );
      expect(logSpy).toHaveBeenNthCalledWith(2, 
        expect.stringContaining('[MessagePublisher] Message published')
      );
    });

    it('should maintain separate configurations for component loggers', () => {
      const debugConfig: IConfiguration['logging'] = { level: 'debug', format: 'json' };
      const errorConfig: IConfiguration['logging'] = { level: 'error', format: 'text' };
      
      const debugLogger = Logger.createComponentLogger('DebugComponent', debugConfig);
      const errorLogger = Logger.createComponentLogger('ErrorComponent', errorConfig);
      
      debugLogger.debug('Debug message');
      debugLogger.info('Info message');
      errorLogger.debug('Debug message - should not appear');
      errorLogger.error('Error message');
      
      // Debug logger should log both messages in JSON format (all JSON logs use console.log)
      expect(logSpy).toHaveBeenCalledTimes(2); // Both debug and info messages from debugLogger
      
      // Error logger should only log error message in text format
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ErrorComponent] Error message')
      );
    });

    it('should update configuration dynamically', () => {
      const logger = Logger.getInstance({ level: 'info', format: 'text' });
      
      // Initially debug should not log
      logger.debug('Debug message 1');
      expect(debugSpy).not.toHaveBeenCalled();
      
      // Update to debug level
      logger.updateConfig({ level: 'debug', format: 'json' });
      logger.debug('Debug message 2');
      
      expect(logSpy).toHaveBeenCalledTimes(1);
      const loggedMessage = logSpy.mock.calls[0][0];
      const parsedLog = JSON.parse(loggedMessage);
      expect(parsedLog.level).toBe('DEBUG');
      expect(parsedLog.message).toBe('Debug message 2');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle undefined context gracefully', () => {
      const logger = Logger.getInstance();
      logger.info('Message without context', undefined);
      
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[INFO\] Message without context$/)
      );
    });

    it('should handle null context gracefully', () => {
      const logger = Logger.getInstance();
      logger.info('Message with null context', null);
      
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[INFO\] Message with null context$/)
      );
    });

    it('should handle circular references in context', () => {
      const logger = Logger.getInstance();
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;
      
      // Should not throw an error
      expect(() => {
        logger.info('Message with circular context', circularObj);
      }).not.toThrow();
      
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Message with circular context | Context: [Circular Reference]')
      );
    });

    it('should parse invalid log levels to default info level', () => {
      const config: IConfiguration['logging'] = { level: 'invalid' as any, format: 'text' };
      const logger = Logger.getInstance(config);
      
      // Should default to info level, so debug should not log
      logger.debug('Debug message');
      logger.info('Info message');
      
      expect(debugSpy).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledTimes(1);
    });
  });
});