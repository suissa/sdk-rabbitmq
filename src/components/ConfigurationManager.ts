import * as fs from 'fs';
import * as path from 'path';
import { IConfiguration, IConfigurationManager } from '../interfaces/IConfiguration';
import { ConfigurationError } from '../interfaces/IErrors';
import { validateConfigurationSchema } from '../utils/configSchema';

/**
 * Configuration manager that handles loading and validating configuration from config.json
 */
export class ConfigurationManager implements IConfigurationManager {
  private static instance: ConfigurationManager;
  private cachedConfig: IConfiguration | null = null;
  private readonly configPath: string;

  private constructor() {
    // Config file should be at project root
    this.configPath = path.join(process.cwd(), 'config.json');
  }

  /**
   * Get singleton instance of ConfigurationManager
   */
  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Load configuration from config.json file
   * @returns Validated configuration object
   * @throws ConfigurationError if file doesn't exist or is invalid
   */
  public loadConfig(): IConfiguration {
    // Return cached config if available
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    try {
      // Check if config file exists
      if (!fs.existsSync(this.configPath)) {
        throw new ConfigurationError(
          `Configuration file not found at ${this.configPath}. Please create a config.json file in your project root.`,
          { configPath: this.configPath }
        );
      }

      // Read and parse config file
      const configContent = fs.readFileSync(this.configPath, 'utf-8');
      let parsedConfig: any;

      try {
        parsedConfig = JSON.parse(configContent);
      } catch (parseError) {
        throw new ConfigurationError(
          `Invalid JSON in configuration file: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`,
          { configPath: this.configPath, parseError }
        );
      }

      // Validate configuration schema
      this.validateConfig(parsedConfig);

      // Cache the validated configuration
      this.cachedConfig = parsedConfig as IConfiguration;
      
      return this.cachedConfig;
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error;
      }
      
      throw new ConfigurationError(
        `Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { configPath: this.configPath, originalError: error }
      );
    }
  }

  /**
   * Validate configuration schema
   * @param config - Configuration object to validate
   * @throws ConfigurationError if validation fails
   */
  public validateConfig(config: any): void {
    validateConfigurationSchema(config);
  }

  /**
   * Clear cached configuration (useful for testing)
   */
  public clearCache(): void {
    this.cachedConfig = null;
  }

  /**
   * Get the configuration file path
   */
  public getConfigPath(): string {
    return this.configPath;
  }
}