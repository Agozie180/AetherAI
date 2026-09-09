import { describe, expect, it, afterEach } from "vitest";
import { llmAvailable, llmConfig } from "./provider";

const saved = { provider: process.env.LLM_PROVIDER, model: process.env.LLM_MODEL, openai: process.env.OPENAI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY };

afterEach(() => {
  process.env.LLM_PROVIDER = saved.provider;
  process.env.LLM_MODEL = saved.model;
  process.env.OPENAI_API_KEY = saved.openai;
  process.env.ANTHROPIC_API_KEY = saved.anthropic;
});

describe("llm provider configuration", () => {
  it("supports OpenAI without exposing provider-specific clients", () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.LLM_MODEL = "gpt-test";
    process.env.OPENAI_API_KEY = "key";
    expect(llmConfig()).toEqual({ provider: "openai", model: "gpt-test" });
    expect(llmAvailable()).toBe(true);
  });

  it("supports Anthropic and rejects missing credentials", () => {
    process.env.LLM_PROVIDER = "anthropic";
    process.env.LLM_MODEL = "claude-test";
    process.env.ANTHROPIC_API_KEY = "";
    expect(llmConfig()).toEqual({ provider: "anthropic", model: "claude-test" });
    expect(llmAvailable()).toBe(false);
  });

  it("defaults to no provider instead of silently selecting a paid model", () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(llmConfig().provider).toBe("none");
    expect(llmAvailable()).toBe(false);
  });
});
