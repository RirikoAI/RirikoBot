import { readdirSync } from 'fs';
import { join } from 'path';
import { Command } from "#command/command.class";

const CommandList: Command[] = [];

export const commandsLoaderUtil = (dir: string) => {
  
  const entries = readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Recursively load commands from subdirectories
      commandsLoaderUtil(fullPath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.command.js') || entry.name.endsWith('.command.ts'))
    ) {
      // Dynamically require the command class
      const CommandClass = require(fullPath).default;
      
      // Check if the class extends the Command base class
      if (CommandClass && CommandClass.prototype instanceof Command) {
        CommandList.push(CommandClass); // Instantiate and add to the CommandList
      }
    }
  }
  
  return CommandList;
};
