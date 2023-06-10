const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false, // Disable default behavior of echoing input
});

rl.setPrompt("Ririko > ");
rl.prompt();

const commands = new Map();

// Register commands
registerCommand({
  name: "exit",
  description: "Exit the terminal",
  handler: exitCommand,
});

registerCommand({
  name: "command0",
  description: "Execute command0 without arguments",
  handler: command0Handler,
});

registerCommand({
  name: "command1",
  description: "Execute command1 with 1 argument",
  handler: command1Handler,
});

registerCommand({
  name: "command2",
  description: "Execute command2 with 2 arguments",
  handler: command2Handler,
});

registerCommand({
  name: "help",
  description: "Display available commands",
  handler: helpCommand,
});

rl.on("line", (input) => {
  const args = input.trim().split(" ");
  const command = args[0];

  const commandHandler = commands.get(command);
  if (commandHandler) {
    const commandArgs = args.slice(1);
    commandHandler.handler(...commandArgs);
  } else {
    console.log("Unknown command");
  }

  rl.prompt();
});

rl.on("close", () => {
  console.log("Custom terminal closed");
  process.exit(0);
});

function registerCommand(command) {
  const { name, description, handler } = command;
  commands.set(name, {
    description,
    handler,
  });
}

function exitCommand() {
  rl.close();
}

function command0Handler() {
  console.log("Executing command0");
  // Handle command with 0 arguments
}

function command1Handler(arg1) {
  console.log(`Executing command1 with argument: ${arg1}`);
  // Handle command with 1 argument
}

function command2Handler(arg1, arg2) {
  console.log(`Executing command2 with arguments: ${arg1}, ${arg2}`);
  // Handle command with 2 arguments
}

function helpCommand() {
  console.log("Available commands:");
  commands.forEach((value, key) => {
    console.log(`${key}: ${value.description}`);
  });
}
