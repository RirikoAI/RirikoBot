import {
  DiscordInteraction,
  DiscordMessage,
  MenuCallback,
  MenuOptions,
} from '#command/command.types';
import { Command } from '#command/command.class';

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
   * The callback function to execute when an option is selected
   * @type {MenuCallback}
   * @see MenuCallback
   */
  callback: MenuCallback;

  /**
   * The context to pass to the callback function, since we can't
   * use `this` in a callback
   * @type {Command}
   * @see Command
   */
  context?: Command;
};
