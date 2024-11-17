import {
  DiscordInteraction,
  DiscordMessage,
  MenuCallback,
  MenuOptions,
} from '#command/command.types';
import { Command } from '#command/command.class';

/**
 * MenuFeatureParams
 * @description Parameters for the menu feature
 * @author Earnest Angel (https://angel.net.my)
 */
export type MenuFeatureParams = {
  /**
   * The interaction object, either DiscordInteraction or DiscordMessage
   * @type {DiscordInteraction | DiscordMessage}
   * @see DiscordInteraction
   * @see DiscordMessage
   */
  interaction: DiscordInteraction | DiscordMessage | any;

  /**
   * The text to display in the menu
   */
  text: string;

  /**
   * The options to display in the menu
   * @type {MenuOptions}
   * @see MenuOptions
   */
  options: MenuOptions;

  /**
   * The callback function to execute when an option is selected.
   * Use .bind(this) to bind the context of the callback function.
   * @type {MenuCallback}
   * @see MenuCallback
   */
  callback: MenuCallback;

  /**
   * Custom context to pass to the callback function
   * @type {Command}
   * @see Command
   */
  context?: Command;

  /**
   * Whether to follow up with a new message or reply to the original message
   */
  followUp?: boolean;
  
  /**
   * Whether to delete the original message after an option is selected
   */
  deleteAfterSelection?: boolean;
};
