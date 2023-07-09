/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
const express = require("express");
const app = express();
const colors = require("colors");

const { join } = require("path");
const fs = require("fs");

const { parentPort } = require("worker_threads");
const bodyParser = require("body-parser");

const { validateMongoDBConnection } = require("./helpers/mongoUtils.js");
const path = require("path");

const configFileExists = fs.existsSync("./config.js");

console.info("0------------------| Ririko Express (Web Server):".brightCyan);

let Hostname, Port;

app.use(bodyParser.json());

if (configFileExists) {
  const { hostname, port } = require("./helpers/getconfig");
  Hostname = hostname();
  Port = port();
} else {
  Hostname = "localhost";
  Port = 3000;
}

// Endpoint to handle incoming webhook notifications. !todo: implement webhook call back function

/**
 * Alternative method to checking streamers every minute !todo: will implement later
 */
app.post("/webhook/twitch/notification/:twitchId", async (req, res) => {
  const twitchId = req.params.twitchId;

  // Verify the request using the secret (if you set one)
  // Implement your own verification logic here

  // Extract the relevant information from the request body
  const { event, data } = req.body;

  // Process the event data and send notifications
  if (event === "stream.online") {
    const streamerName = data[0].user_name;
    console.info(`${streamerName} started streaming!`);
  }

  res.sendStatus(200);
});

// Start the server
app.listen(Port, Hostname, () => {
  console.info("[Ririko Express] Ready to serve the world.".yellow);
  console.info(`[Ririko Express] Server listening on port ${Port} \n`.yellow);

  parentPort.postMessage({
    ready: true,
  });

  if (!configFileExists) {
    console.info(
      `You can now install Ririko Ai by visiting: http://${Hostname}:${Port}`
        .brightYellow
    );
  }
});

/**
 * If config.js does not exist, then we will run the installer
 */
if (!configFileExists) {
  app.use("/assets", express.static("installer/assets"));

  app.get("/", function (req, res) {
    res.sendFile(join(__dirname, "/../installer/index.html"));
  });
}

app.get("/terms-and-conditions", function (req, res) {
  res.sendFile(join(__dirname, "/../installer/terms-and-conditions.html"));
});

app.get("/privacy-policy", function (req, res) {
  res.sendFile(join(__dirname, "/../installer/privacy-policy.html"));
});

// Define a route to handle the POST request
app.post("/test_mongodb", bodyParser.json(), (req, res) => {
  // Access the posted data from the request body
  const mongoURI = req.body.mongodb_uri;

  try {
    // Call the validation function
    validateMongoDBConnection(mongoURI).then((r) => {
      if (r) {
        // Send a response back to the client
        res.sendStatus(200);
      } else {
        res.sendStatus(500);
      }
    });
  } catch (e) {
    res.sendStatus(500);
  }
});

app.post("/submit_install", bodyParser.json(), async (req, res) => {
  if (req?.body[0]?.name) {
    const filesToCopy = [
      { source: "../config.example.js", destination: "../config.js" },
    ];

    const copySuccess = await copyConfigFiles(filesToCopy);

    if (copySuccess) {
      // Wait 3 seconds before writing to the config file
      setTimeout(async () => {
        await writeConfigFile(req.body);
      }, 3000);
    }
  }

  res.sendStatus(200);
});

async function writeConfigFile(payloads) {
  const filePath = path.resolve(__dirname, "../config.js");

  // Read the contents of the file
  const content = fs.readFileSync(filePath, "utf-8");

  console.log(payloads);

  // Define regular expressions to find and replace the values
  const portRegex = integerRegex("PORT");
  const languageRegex = stringRegex("LANGUAGE");

  // Define the new values you want to set
  const newPort = 8080;
  const newLanguage = "fr";

  // Replace the values while preserving the data type and comments
  const modifiedContent = content
    .replace(portRegex, newPort)
    .replace(languageRegex, newLanguage);

  // Write the modified contents back to the file
  fs.writeFileSync(filePath, modifiedContent);

  console.log("Config file updated successfully!");
}

function integerRegex(integerKey) {
  return new RegExp(`(?<=${integerKey}:\\s)[0-9]+`);
}

function stringRegex(stringKey) {
  return new RegExp(`(?<=${stringKey}:\\s")[a-z]+(?=")`);
}

async function copyConfigFiles(files) {
  for (const file of files) {
    const sourceFile = file.source;
    const destinationFile = file.destination;

    const sourceFilePath = path.resolve(__dirname, sourceFile);
    const destinationFilePath = path.resolve(__dirname, destinationFile);

    if (!fs.existsSync(destinationFilePath)) {
      await fs.copyFile(sourceFilePath, destinationFilePath, (err) => {
        if (err) {
          console.error(`An error occurred while copying ${sourceFile}:`, err);
        } else {
          console.log(`${sourceFile} copied successfully!`);
        }
      });

      return true;
    } else {
      console.log(`${sourceFile} already exists at the destination.`);
      return false;
    }
  }
}

function getValueFromKey(key, payload) {
  return payload.find((item) => item.name === key);
}
