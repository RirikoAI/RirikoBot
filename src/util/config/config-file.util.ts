import * as fs from 'fs';
import * as path from 'path';

/**
 * ConfigFileUtil
 * @description Utility class to manage configuration files
 */
const ConfigFileUtil = {
  /**
   * Generate configuration files in the /config directory based on the configuration types.
   * Uses example files from the /default directory if present.
   */
  generateConfigFiles: (): void => {
    const configDir = path.join(process.cwd(), 'config');
    const defaultDir = path.join(process.cwd(), 'src', 'config', 'default');

    // Create config directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const configFiles = [
      'app.config.ts',
      'database.config.ts',
      'discord.config.ts',
      'auth.config.ts',
      'mail.config.ts',
      'ai.config.ts',
    ];

    configFiles.forEach((filename) => {
      const targetPath = path.join(configDir, filename);
      const defaultPath = path.join(defaultDir, filename);

      if (!fs.existsSync(targetPath)) {
        if (fs.existsSync(defaultPath)) {
          // Copy the file from default directory
          fs.copyFileSync(defaultPath, targetPath);
        } else {
          // Optionally handle missing defaults (leave blank or create an empty placeholder)
          fs.writeFileSync(targetPath, '');
        }
      }
    });
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
      // Use Node.js's require to load the TypeScript file
      // First, ensure TypeScript is registered
      try {
        require('ts-node/register');
      } catch (e) {
        console.warn(
          'ts-node/register not available, falling back to manual parsing',
        );
      }

      try {
        const config = require(configPath).default;
        return config || {};
      } catch (requireError) {
        console.warn(
          `Could not require ${category} config file directly:`,
          requireError,
        );

        const fileContent = fs.readFileSync(configPath, 'utf8');
        const match = fileContent.match(/export\s+default\s+({[\s\S]*});/);
        if (match && match[1]) {
          const objStr = match[1].trim();
          const evalFn = new Function(`return ${objStr}`);
          return evalFn() || {};
        }
      }
    } catch (error) {
      console.error(`Error loading ${category} config file:`, error);
    }

    return {};
  },
};

export default ConfigFileUtil;
