const { NLPCloudProvider } = require("app/Providers/AI/NLPCloudProvider");
jest.mock(NLPCloudProvider, () => ({}));

const { RirikoAINLP } = require("./RirikoAI-NLP");

// Mock the imported functions
jest.mock("./Schemas/ChatHistory", () => ({
  findChatHistory: () => {
    return "";
  },
  addChatHistory: () => {
    return {
      chat_history: "Human: Hello",
    };
  },
  updateChatHistory: () => {
    return {
      chat_history: "Human: Hello\nRobot: Answer",
    };
  },
  deleteChatHistory: () => {
    return true;
  },
}));

let ririkoAiNlp, personality;

const mockMessage = {
  content: ".Hello",
  channelId: "123123123123",
  channel: {
    sendTyping: jest.fn(),
  },
  guildId: "",
  author: {
    id: "723178923",
  },
  reply: jest.fn(),
};

class MockedRirikoAI extends RirikoAINLP {
  async ask() {
    return "Robot: Answer";
  }

  getCurrentTime() {
    return new Date();
  }

  getChatHistory() {
    return [{ message: "Hello" }];
  }

  chatHistory = [{ message: "Hello" }];
}

describe("RirikoAI-NLP", () => {
  beforeAll(() => {
    ririkoAiNlp = MockedRirikoAI.getInstance();
  });

  it("should be able to create new instance", async () => {
    expect(ririkoAiNlp.isInitialized).toBe(true);
  });

  it("should be able to get the personality", async () => {
    personality = ririkoAiNlp.getPersonalitiesAndAbilities();
    expect(personality.length).toBeGreaterThan(0);
  });

  it("should be able to get the time", async () => {
    const time = ririkoAiNlp.getCurrentTime().toString();
    expect(time.length).toBeGreaterThan(0);
  });

  it("should be able to calculate token", async () => {
    const token = ririkoAiNlp.calculateToken(personality);
    expect(token).toBeGreaterThan(0);
  });

  it("should be able to set the prompt", async () => {
    await ririkoAiNlp.setPromptAndChatHistory("Hello", mockMessage);
  });

  it("should be able to get the chat history", async () => {
    const history = ririkoAiNlp.getChatHistory(mockMessage);

    console.log(history);

    expect(history[0].message).toContain("Hello");
  });

  it("should be able to handle the message", async () => {
    await ririkoAiNlp.handleMessage(mockMessage);
  });

  it("should be able to process the answer", async () => {
    ririkoAiNlp.processAnswer("answer");
  });
});
