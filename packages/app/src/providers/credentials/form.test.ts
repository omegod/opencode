import { describe, expect, test } from "bun:test"
import { validateCustomProvider } from "./form"

const t = (key: string) => key

describe("validateCustomProvider", () => {
  test("builds trimmed config payload with model config", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: " Custom Provider ",
        baseURL: "https://api.example.com ",
        apiKey: " {env: CUSTOM_PROVIDER_KEY} ",
        protocol: "compatible",
        models: [
          {
            row: "m0",
            id: " model-a ",
            name: " Model A ",
            context: " 250000 ",
            output: " 60000 ",
            expanded: true,
            properties: [
              { row: "p0", key: " options ", value: ' {"reasoningEffort": "high"} ', err: {} },
              { row: "p1", key: "", value: "", err: {} },
            ],
            err: {},
          },
        ],
        headers: [
          { row: "h0", key: " X-Test ", value: " enabled ", err: {} },
          { row: "h1", key: "", value: "", err: {} },
        ],
        err: {},
      },
      t,
      disabledProviders: [],
      existingProviderIDs: new Set(),
    })

    expect(result.result).toEqual({
      providerID: "custom-provider",
      name: "Custom Provider",
      config: {
        npm: "@ai-sdk/openai-compatible",
        name: "Custom Provider",
        env: ["CUSTOM_PROVIDER_KEY"],
        options: {
          baseURL: "https://api.example.com",
          headers: {
            "X-Test": "enabled",
          },
        },
        models: {
          "model-a": {
            name: "Model A",
            limit: { context: 250000, output: 60000 },
            options: { reasoningEffort: "high" },
          },
        },
      },
    })
  })

  test("maps the response protocol and stores inline API keys", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: "Provider",
        baseURL: "https://api.example.com",
        apiKey: "secret",
        protocol: "response",
        models: [
          {
            row: "m0",
            id: "model-a",
            name: "Model A",
            context: "200000",
            output: "16000",
            expanded: false,
            properties: [{ row: "p0", key: "options", value: "{}", err: {} }],
            err: {},
          },
        ],
        headers: [{ row: "h0", key: "", value: "", err: {} }],
        err: {},
      },
      t,
      disabledProviders: [],
      existingProviderIDs: new Set(),
    })

    expect(result.result?.config.npm).toBe("@ai-sdk/openai")
    expect(result.result?.config.options).toEqual({ baseURL: "https://api.example.com", apiKey: "secret" })
  })

  test("rejects an existing provider ID", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: "Provider",
        baseURL: "https://api.example.com",
        apiKey: "",
        protocol: "compatible",
        models: [
          {
            row: "m0",
            id: "model-a",
            name: "Model A",
            context: "200000",
            output: "16000",
            expanded: false,
            properties: [{ row: "p0", key: "options", value: "{}", err: {} }],
            err: {},
          },
        ],
        headers: [{ row: "h0", key: "", value: "", err: {} }],
        err: {},
      },
      t,
      disabledProviders: [],
      existingProviderIDs: new Set(["custom-provider"]),
    })

    expect(result.result).toBeUndefined()
    expect(result.err.providerID).toBe("provider.custom.error.providerID.exists")
  })

  test("flags duplicate rows and invalid JSON values", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: "Provider",
        baseURL: "https://api.example.com",
        apiKey: "",
        protocol: "compatible",
        models: [
          {
            row: "m0",
            id: "model-a",
            name: "Model A",
            context: "200000",
            output: "16000",
            expanded: true,
            properties: [{ row: "p0", key: "options", value: "{invalid", err: {} }],
            err: {},
          },
          {
            row: "m1",
            id: "model-a",
            name: "Model A 2",
            context: "200000",
            output: "16000",
            expanded: false,
            properties: [{ row: "p1", key: "options", value: "{}", err: {} }],
            err: {},
          },
        ],
        headers: [
          { row: "h0", key: "Authorization", value: "one", err: {} },
          { row: "h1", key: "authorization", value: "two", err: {} },
        ],
        err: {},
      },
      t,
      disabledProviders: ["custom-provider"],
      existingProviderIDs: new Set(["custom-provider"]),
    })

    expect(result.result).toBeUndefined()
    expect(result.err.providerID).toBeUndefined()
    expect(result.models[0].properties).toEqual([{ key: undefined, value: "provider.custom.error.json" }])
    expect(result.models[1]).toEqual({
      id: "provider.custom.error.duplicate",
      name: undefined,
      context: undefined,
      output: undefined,
      properties: [{ key: undefined, value: undefined }],
    })
    expect(result.headers[1]).toEqual({
      key: "provider.custom.error.duplicate",
      value: undefined,
    })
  })
})
