const nlpcloud = require("nlpcloud"),
  { OpenAIProvider }  = require("./OpenAIProvider");

jest.mock("openai", () => {
  return class {
      createCompletion = () => {
        return {
          data: {
            choices: [{ text: "Friend: example response" }],
          },
        };
      };
    }

});

describe("OpenAIProvider", () => {
  beforeAll(() => {});

  it("should be able to create new instance", async () => {
    const openAIProvider = new OpenAIProvider();
    expect(typeof openAIProvider.getClient()).toBe("object");
  });
});
