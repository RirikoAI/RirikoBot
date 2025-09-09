import * as fs from 'fs';
import * as path from 'path';

/**
 * ConfigFileUtil
 * @description Utility class to manage configuration files
 */
const ConfigFileUtil = {
  /**
   * Generate configuration files in the /config directory based on the configuration types
   * @param configDir The directory where configuration files will be stored
   */
  generateConfigFiles: (): void => {
    const configDir = path.join(process.cwd(), 'config');

    // Create config directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Generate app config file
    const appConfigPath = path.join(configDir, 'app.config.ts');
    if (!fs.existsSync(appConfigPath)) {
      const appConfig = `export default {
  name: 'Ririko',
  nodeEnv: 'development',
  port: 3000,
  backendURL: 'http://localhost:3000',
  frontendURL: 'http://localhost:8100',
  fallbackLanguage: 'en',
  headerLanguage: 'x-custom-lang',
};
`;
      fs.writeFileSync(appConfigPath, appConfig);
    }

    // Generate database config file
    const databaseConfigPath = path.join(configDir, 'database.config.ts');
    if (!fs.existsSync(databaseConfigPath)) {
      const databaseConfig = `export default {
  logging: false,
  url: '',
  path: '',
  type: 'sqlite',
  host: 'localhost',
  port: 5432,
  password: '',
  name: 'ririko',
  username: 'postgres',
  synchronize: true,
  maxConnections: 100,
  sslEnabled: false,
  rejectUnauthorized: false,
  ca: '',
  key: '',
  cert: '',
};
`;
      fs.writeFileSync(databaseConfigPath, databaseConfig);
    }

    // Generate discord config file
    const discordConfigPath = path.join(configDir, 'discord.config.ts');
    if (!fs.existsSync(discordConfigPath)) {
      const discordConfig = `export default {
  discordBotToken: '',
  discordApplicationId: '',
  defaultPrefix: '!',
  discordRedirectUri: '',
  discordOauth2ClientSecret: '',
};
`;
      fs.writeFileSync(discordConfigPath, discordConfig);
    }

    // Generate auth config file
    const authConfigPath = path.join(configDir, 'auth.config.ts');
    if (!fs.existsSync(authConfigPath)) {
      const authConfig = `export default {
  secret: 'secret-key',
  expires: '1d',
  refreshSecret: 'refresh-secret-key',
  refreshExpires: '7d',
};
`;
      fs.writeFileSync(authConfigPath, authConfig);
    }

    // Generate mail config file
    const mailConfigPath = path.join(configDir, 'mail.config.ts');
    if (!fs.existsSync(mailConfigPath)) {
      const mailConfig = `export default {
  port: 587,
  host: '',
  user: '',
  password: '',
  defaultEmail: '',
  defaultName: '',
  ignoreTLS: false,
  secure: false,
  requireTLS: true,
};
`;
      fs.writeFileSync(mailConfigPath, mailConfig);
    }
  },

  /**
   * Load configuration from a file
   * @param category The configuration category (e.g., 'app', 'database', 'discord')
   * @returns Configuration object loaded from file or empty object if file doesn't exist
   */
  loadConfigFile: (category: string): Record<string, any> => {
    const configDir = path.join(process.cwd(), 'config');
    const configPath = path.join(configDir, `${category}.config.ts`);

    if (!fs.existsSync(configPath)) {
      return {};
    }

    try {
      // In a real application, we would use dynamic import or require
      // return require(configPath).default;

      // For this implementation, we'll read the file and parse it manually
      const fileContent = fs.readFileSync(configPath, 'utf8');
      // Extract the object between curly braces
      const match = fileContent.match(/export\s+default\s+({[\s\S]*});/);
      if (match && match[1]) {
        // Convert the object string to a JavaScript object
        // This is a simplified approach and may not work for complex objects
        const objStr = match[1].replace(
          /(['"])?([a-zA-Z0-9_]+)(['"])?:/g,
          '"$2":',
        );
        return JSON.parse(objStr);
      }
    } catch (error) {
      console.error(`Error loading ${category} config file:`, error);
    }

    return {};
  },
};

export default ConfigFileUtil;
