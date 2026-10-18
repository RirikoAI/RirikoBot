import type { Command } from '@ririko/discord';
import type { BotServices } from '../../services.js';
import {
  createImagineCommand,
  handleImagineButtonInteraction,
  parseImaginePrefixArgs,
  IMAGINE_COMMAND_NAME,
  IMAGINE_ALIASES,
} from './imagine.command.js';
import {
  createSdModelCommand,
  createSetupSdApiCommand,
  SD_MODEL_COMMAND_NAME,
  SETUP_SD_API_COMMAND_NAME,
} from './config.command.js';

export {
  createImagineCommand,
  handleImagineButtonInteraction,
  parseImaginePrefixArgs,
  createSdModelCommand,
  createSetupSdApiCommand,
  IMAGINE_COMMAND_NAME,
  IMAGINE_ALIASES,
  SD_MODEL_COMMAND_NAME,
  SETUP_SD_API_COMMAND_NAME,
};

/**
 * Returns all dual-dispatch image generation commands for registration into CommandRouter.
 */
export function createImageCommands(services: BotServices): Command[] {
  return [
    createImagineCommand(services),
    createSdModelCommand(services),
    createSetupSdApiCommand(),
  ];
}
