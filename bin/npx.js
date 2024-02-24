#!/usr/bin/env node

console.log("================= Welcome to Ririko AI! =================");

const { execSync } = require("child_process");

let copyCommand;
if (process.platform === "win32") {
  // User is running the script on Windows
  console.log("Running on Windows");
  copyCommand = "copy";
} else {
  // User is running the script on Linux/Unix or macOS
  console.log("Running on Linux/Unix or macOS");
  copyCommand = "cp";
}

const runCommand = (command) => {
  try {
    execSync(`${command}`, { stdio: "inherit" });
  } catch (e) {
    console.error(`Failed to execute ${command}`, e);
    return false;
  }
  return true;
};

const dirName = process.argv[2] ? process.argv[2] : "RirikoAI";
const gitCheckoutCommand = `git clone https://github.com/RirikoAI/RirikoBot ${dirName}`;
const installDepsCommands = `cd ${dirName} && npm i --include=dev`;
const buildCommands = `cd ${dirName} && ${copyCommand} config.example.ts config.ts && ${copyCommand} .env.example .env && npm run build`;

console.log(
  `\n\n================= Cloning into ${dirName}... =================`
);
const checkedOut = runCommand(gitCheckoutCommand);
if (!checkedOut) process.exit(-1);

console.log(
  `\n\n================= Installing dependencies for ${dirName}... =================`
);
const installedDeps = runCommand(installDepsCommands);
if (!installedDeps) process.exit(-1);

console.log(
  `\n\n================= Running build commands for ${dirName}... =================`
);
const buildSuccess = runCommand(buildCommands);
if (!buildSuccess) process.exit(-1);

console.log(`
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢛⣴⣶⣶⣍⠧⠶⢟⣻⣾⣟⣻⠿⣿⣿⣿⣦⡉⢀⠿⢸⡏⣧⣲⡯⠋⠈⠈⣮⣛⢿⣧⡹⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣴⣿⠟⠉⠙⠿⢏⣀⣀⡍⠻⣿⣿⣿⣶⣭⡻⣿⣿⣦⣬⡀⠅⠩⡅⠰⣦⡀⠀⢿⣿⣿⣿⣿⣎⠻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⢏⣵⣿⡿⣣⣶⣿⢋⣴⣧⠘⣿⣿⣷⣮⡻⣿⣿⣿⣿⣮⡻⣿⣿⣿⣿⣶⡈⠁⡹⢟⣀⠀⠹⣿⣿⣌⢿⣧⡘⢿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⣵⣿⣿⡟⣽⣿⣿⣣⣿⣿⣿⣧⢼⣿⣿⣿⣿⣜⢿⣿⣿⣿⣿⣮⠻⣿⣿⣿⢢⠡⢿⠐⢉⢺⣇⠖⣝⢿⣧⡻⣷⡱⡹⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⡿⢣⣾⣿⣿⡟⣼⡟⣿⢣⣿⣿⣿⣿⣿⡆⣿⣿⣿⣿⣿⣎⢿⣿⣿⣿⣿⣷⡝⣿⢣⡷⠁⣀⣲⣶⡸⠿⠗⠚⠂⢻⢧⢻⣷⡘⣜⢿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣣⣿⣿⣿⡟⣾⡿⣹⡏⣼⣿⣿⣿⣿⣿⡟⢸⣿⣿⣿⣿⣿⣎⣿⡏⣿⣿⣿⣿⣌⢻⠔⠃⡩⠭⠒⣤⡐⢄⠀⠀⡌⣷⡷⣿⣿⡌⢎⢿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⡿⣱⣿⣿⢿⡟⣸⣿⢣⣿⡇⣿⣿⣿⣿⣿⣿⣿⡇⣿⣿⣿⣿⣿⣿⡎⣿⡼⣿⣿⣿⣿⣆⢤⡀⢐⠀⠀⢈⠙⠆⠁⠀⢀⣿⣿⡜⢏⢿⡠⡊⢿⣿⣿⣿
⣿⣿⣿⣿⣿⢣⣿⣿⡟⣿⢡⣿⡟⣼⣿⡏⣿⣿⣿⣿⣿⣿⣿⡇⣿⣿⣿⣿⣿⣿⣿⡸⣧⢻⣿⣿⣿⣿⡌⠛⠦⠀⡈⢹⣷⠆⠀⠀⣿⣿⢿⣿⡌⢎⠇⣧⠐⣿⣿⣿
⣿⣿⣿⣿⢣⣿⣿⢿⢸⡏⣾⣿⡇⣿⣿⡇⣿⣿⣿⣿⣿⣿⣿⡇⡜⣿⣿⣿⣿⡿⣿⣧⢻⢸⣿⣿⣿⣿⣟⠸⣿⣖⣤⢀⢂⣾⢣⡇⠘⣿⣾⣿⣿⡜⣆⢹⡇⢹⣿⣿
⣿⣿⣿⣇⣿⣿⣿⢈⣾⢹⣿⣿⣷⣿⣿⣧⢻⡏⣿⣿⣿⣿⣿⡇⣿⡜⣿⡿⣿⣿⣽⣿⡜⡎⣿⣿⣿⣿⣿⣧⢿⢋⡵⣣⣾⡟⣼⡧⣇⢻⣇⣿⣿⣧⠘⣎⣿⠘⣿⣿
⣿⣿⢋⣾⣿⣿⣿⣿⣿⣾⣿⣿⡟⣿⣿⣿⡜⡇⢻⣿⣿⡇⣿⡇⣿⣿⣎⢷⡝⣿⣿⣉⢷⠁⣿⢹⣿⣿⣿⣇⢞⣯⣾⣿⡿⣹⣿⠣⣿⠸⣿⣿⣿⣿⡔⡸⡄⢸⣿⣿
⣿⢫⣾⣿⣿⣿⣿⣿⡇⣿⣿⣿⠁⣿⣿⣿⣿⣱⢸⣿⣿⢣⢣⡇⠿⢿⠿⠷⠝⢮⡻⣿⣷⡃⣿⢸⣿⣿⣟⣿⡘⡜⣿⡿⣱⣿⢣⢇⡏⡇⡿⣿⣿⣿⡇⢷⠹⠸⣿⣿
⣵⡿⢻⣿⣿⣿⣿⣿⡇⣿⣿⡟⠀⢻⡟⢿⣿⣿⢸⣿⡿⡸⡄⣧⣶⣾⣿⣿⣿⣷⣍⡢⣝⠷⢸⢸⡇⣿⣿⣿⣇⠱⢹⡱⣫⢣⡏⢌⣿⡇⣇⣿⣿⣿⣿⢸⠃⢃⢿⣿
⣥⣊⣾⣿⣿⣿⣿⢿⡇⣿⡇⡟⣐⡃⢇⠊⣿⣿⡎⣿⢇⡟⣏⣾⣿⠿⢛⠛⠛⠿⠛⠛⠪⠕⢸⢸⡇⣿⣿⣿⡇⡄⣧⠟⣵⠟⣜⡜⢹⡇⣇⣿⣿⣿⣿⢸⡄⣆⠜⣿
⡟⣼⡿⢻⣿⣿⣿⢸⡇⣿⠘⢥⣿⣿⣎⠘⡜⣿⣿⣌⡾⣹⣿⣿⣕⠝⠀⡀⠀⢀⠄⢀⠀⠀⢨⢰⡆⣿⡇⡿⡇⢠⣿⡀⢈⣾⡻⢱⢸⢱⡇⣿⣿⣿⣿⢹⢓⣷⢀⢿
⠸⢍⣴⢹⣿⣿⣿⡄⣇⡇⠁⣜⠻⠭⠭⠥⣺⣎⢻⣷⣱⣿⣿⣿⣯⡀⣾⡇⠐⣷⠀⣾⡆⠇⣾⢸⢸⣿⢹⡹⡧⡰⠉⡇⡜⣻⢃⡿⠸⣸⡇⣿⣿⣿⣿⡆⣿⣿⣾⢸
⣡⠏⡄⢸⡇⣿⣿⣇⠘⡀⡒⠀⢀⠀⡐⢀⣈⢙⢷⢈⡫⢽⣿⣿⣿⣿⣿⣿⣀⣛⣛⠋⣬⡇⣿⢻⢸⣿⡇⣇⡇⠇⡜⢡⠪⢁⣾⠃⢠⡿⡇⣿⣿⡙⣿⡇⢻⣿⢸⢸
⡿⢠⡁⢠⢷⢸⣿⣿⡀⠀⠀⡀⢿⣆⢡⣄⢨⠀⣿⣿⣿⣷⣶⣭⣽⣿⣿⣿⣿⣿⣿⣿⣿⢣⣟⡇⣿⡿⢇⢿⡇⠇⢃⠇⡄⣾⢧⠁⣾⢱⢸⢸⣿⡇⢻⣷⠾⢃⡞⣸
⠃⣾⡃⣿⡘⢇⢿⣿⣧⠡⠀⢹⣖⡛⣊⣋⣭⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⡜⡽⣱⣿⠳⡎⣾⠃⠘⢹⠀⢇⣿⡌⢸⣿⡏⣼⣇⣿⣿⢸⣿⢂⡞⢠⣿
⢠⣿⠃⠉⣧⠘⢫⢻⣿⡆⠔⠁⢿⣿⣿⣿⣿⣿⣇⠻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⡑⡼⢱⣿⡏⢢⢱⡟⢸⡅⡇⡇⢸⡇⢱⡿⣹⢣⣿⣿⣿⣿⡆⣿⡜⠅⣾⣿
⠠⣿⠇⣴⠩⡆⢡⠡⡹⣿⣄⣷⡌⣻⠿⣿⣿⣿⣿⣷⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠭⡒⢹⡄⣿⣻⣇⢢⣿⡇⣿⡇⡇⣇⢸⢣⣿⣷⡟⢠⢋⣿⣿⣿⣵⢹⣷⢺⣿⣿
⣇⢻⠇⣿⡁⠻⡍⡇⠹⠪⠻⣿⣷⡸⣿⣿⣿⣿⣿⣿⠿⠿⢟⣛⣛⣻⣿⣿⣿⣷⣫⣼⡿⡼⢱⣿⢏⣾⢸⢸⢿⡇⣿⡇⢎⣞⢻⣿⢳⢸⢸⣿⣿⣿⣿⡄⢿⡘⣿⣿
⣿⣧⡂⢋⡇⣧⡩⢻⢀⡗⣤⡹⢔⢬⣽⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢋⠸⢡⡟⣎⣾⠃⡜⢸⢸⣇⡿⢇⠎⣬⣿⢏⢸⣧⡎⣿⣿⣿⣿⣧⢸⣧⢈⢿
⣿⣿⡧⣸⢸⣿⣿⠈⢧⢧⣿⣿⣷⣬⣝⣷⣭⡻⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⣋⣵⢃⡟⣼⣿⠏⢰⢁⡈⣾⣿⢣⡟⣼⣿⠏⣾⡇⣿⣿⢹⣿⣷⢹⣿⡆⢻⣏⢦
⣿⣿⢡⡏⡇⣿⡏⣼⣜⢆⢻⣿⣟⣿⣿⣿⣿⣿⣷⣯⣛⢿⣿⣿⣿⣿⠿⢛⣵⣾⣿⠏⣞⣼⣿⢏⢢⠃⠾⠇⣿⢏⢞⣾⣿⢟⣾⣿⣿⡸⣿⣇⢿⣿⣧⢻⣷⠘⣟⢦
⣿⢣⣿⡇⢸⣿⡇⣼⡿⣮⢣⢻⣼⣿⣿⣿⣿⣿⣿⣿⣿⣷⣮⣛⣭⣤⢸⣿⣿⣿⡛⢈⣿⣿⢫⢆⢂⣾⣿⡆⢻⢊⣾⡿⢫⣾⣿⣿⣿⣷⡹⣿⣿⣿⣿⣧⣻⣧⢻⣌
⢋⣾⡿⢻⣸⣿⡇⣿⢱⣿⣷⡡⡻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠇⢋⠡⠂⣠⣿⣿⣡⠃⢢⣾⣿⠟⣡⣵⣿⠟⣴⣿⣿⣿⣿⣿⣿⣷⡹⣿⣿⣿⣿⣿⣿⣏⢿
⣿⡟⡡⣸⣿⣿⣇⢇⡎⢻⣿⡇⡑⠙⣿⣿⡟⣿⣿⣿⢳⣿⣿⡏⢡⠖⣃⠐⠀⠠⡿⣫⣿⠃⢠⠟⣋⣥⣾⡿⠋⠐⠛⣒⠂⠉⠻⣿⣿⣿⣿⣷⢿⣿⣿⣿⣿⣿⡽⡎
⣫⡍⡶⢸⡸⣿⢋⡾⣸⣸⣿⡇⡇⣴⣜⣿⢳⣿⣿⡟⣼⣿⣿⡇⢠⢸⠋⠄⠀⢜⣼⡿⠃⣈⣴⣿⡿⠛⠁⠀⣡⣾⣿⣿⣿⣦⡀⠈⢻⣿⣿⣿⡎⣿⣿⣿⣿⣿⣿⡜
⣿⢼⢣⡜⣧⢻⣸⢣⣿⣧⢻⡇⠇⣿⣿⡟⣸⣿⡿⣹⣿⡣⢛⠁⠈⠀⠀⡑⢠⡾⡫⢀⣴⣿⠟⠋⠒⡴⢣⣾⣿⡿⠛⡽⢩⣿⣿⣦⡀⠹⣿⣿⣿⡸⡟⣿⣿⣿⣿⣿

Ririko AI has been installed to the directory ${dirName}
To start the bot, configure the settings (config.ts and .env) and then enter "npm run start:prod"

Good luck and enjoy ^^ - Ririko
`);
