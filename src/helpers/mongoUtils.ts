const { MongoClient } = require("mongodb");

const validateMongoDBConnection = async (mongoURI) => {
  let client;
  try {
    // Attempt to connect to the MongoDB instance
    client = await MongoClient.connect(mongoURI);
    const db = client.db(); // Get the MongoDB database instance
    const adminDb = db.admin();

    // Check the connection status
    await adminDb.ping();

    return true;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    return false;
  } finally {
  }
};

module.exports = { validateMongoDBConnection };
