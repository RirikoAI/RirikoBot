const readline = require("readline");
const colors = require("colors");
const NODE_ENV = process.env.NODE_ENV || "development";

let initialized = false;
let showPrompt = false; // Flag to control prompt display

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false, // Disable default behavior of echoing input
});

// Override console.log
const originalConsoleLog = console.log;
console.log = function (...args) {
  originalConsoleLog(...args);
  scrollToBottom();
  rl.prompt();
};

rl.setPrompt("Ririko > ");

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

function scrollToBottom() {
  // Scroll output to the bottom
  process.stdout.write("\x1B[1B\x1B[9999D");
}

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
  let helpText = "";
  commands.forEach((value, key) => {
    helpText += `${key}: ${value.description}\n`;
  });
  console.log("Available commands:\n" + helpText);
}

rl.on("line", (input) => {
  if (showPrompt) {
    const args = input.trim().split(" ");
    const command = args[0];

    const commandHandler = commands.get(command);
    if (commandHandler) {
      const commandArgs = args.slice(1);
      commandHandler.handler(...commandArgs);
    } else {
      console.log("Unknown command");
    }

    scrollToBottom();
    rl.prompt();
  }
});

rl.on("close", () => {
  console.log("Custom terminal closed");
  process.exit(0);
});

// Function to toggle prompt display
function togglePrompt() {
  showPrompt = !showPrompt;
}

// function to enable prompt display
function enablePrompt() {
  showPrompt = true;
  rl.prompt();
}

function logWithCallback(message, callback) {
  console.log(message);
  process.nextTick(callback);
}

function logWithPromise(message) {
  return new Promise((resolve) => {
    console.log(message);
    process.nextTick(resolve);
  });
}

module.exports = {
  rl: rl,
  log: originalConsoleLog,
  togglePrompt: togglePrompt,
  enablePrompt: enablePrompt,
};
