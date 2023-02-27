const { NLPCloudProvider } = require("app/Providers/AI/NLPCloudProvider");
jest.mock(NLPCloudProvider, () => ({}));

const { RirikoAINLP } = require("./RirikoAI-NLP");

let ririkoAiNlp, personality;

const mockMessage = {
  content: ".Hello there",
  channel: {
    sendTyping: jest.fn(),
  },
  reply: jest.fn(),
};

class MockedRirikoAI extends RirikoAINLP {
  async ask() {
    return "Robot: Answer";
  }
}

describe("RirikoAI-NLP", () => {
  beforeAll(() => {
    ririkoAiNlp = MockedRirikoAI.getInstance();
  });

  it("should be able to create new instance", async () => {
    expect(ririkoAiNlp.isInitialized).toBe(true);
  });

  it("should be able to get the personality", async () => {
    personality = ririkoAiNlp.getPersonality();
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
    ririkoAiNlp.setPrompt("Hello");
  });

  it("should be able to get the prompt", async () => {
    const prompt = ririkoAiNlp.getPrompt();
    expect(prompt).toContain("Human: Hello");
  });

  it("should be able to handle the message", async () => {
    await ririkoAiNlp.handleMessage(mockMessage);
  });

  it("should be able to process the answer", async () => {
    ririkoAiNlp.processAnswer("answer");
  });
});
