import { expect } from "chai";
import {
  detectIntent,
  generateResponse,
  isCrisis,
  SAFETY_RESPONSE,
} from "../../src/chat/assistant";

describe("chat assistant intent and prompt handling", () => {
  it("prioritizes crisis detection over other intents", () => {
    expect(detectIntent("I feel anxious and want to end my life")).to.equal("CRISIS");
    expect(detectIntent("I want to die")).to.equal("CRISIS");
  });

  it("detects the supported non-crisis intents", () => {
    expect(detectIntent("I want to start exercising")).to.equal("GOAL_SETTING");
    expect(detectIntent("Please stop plan")).to.equal("PLAN_MANAGEMENT");
    expect(detectIntent("Can you recommend a video about stress?")).to.equal("RESOURCE_REQUEST");
    expect(detectIntent("I feel overwhelmed about exams")).to.equal("EMOTIONAL_SUPPORT");
  });

  it("returns the local safety response without constructing an AI prompt", () => {
    expect(isCrisis("I might kill myself")).to.equal(true);
    expect(SAFETY_RESPONSE).to.contain("0800-800-2000");
  });

  it("fills the supplied resource template with the user message and library", () => {
    const response = generateResponse(
      "Recommend something for exam stress",
      "Student role",
      "No active plan",
      "Title: Exam stress guide\nURL: https://example.org"
    );

    expect(response).to.contain("Recommend something for exam stress");
    expect(response).to.contain("Title: Exam stress guide");
    expect(response).to.contain("Never make up resources");
  });

  it("fills the supplied plan template with the active plan", () => {
    const response = generateResponse(
      "Please stop plan",
      "",
      "Study routine: Review notes"
    );

    expect(response).to.contain("Study routine: Review notes");
    expect(response).to.contain("If user wants to change/stop plan");
  });

  it("fills the supplied check-in template with the latest check-in", () => {
    const response = generateResponse(
      "I did my breathing exercise",
      "",
      "No active plan",
      "No resources",
      "Mood 2: Worried about exams"
    );

    expect(response).to.contain("Mood 2: Worried about exams");
    expect(response).to.contain("Encourage progress, don't shame missed days");
  });
});
