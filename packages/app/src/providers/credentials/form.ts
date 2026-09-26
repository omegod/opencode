const PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/
const OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible"
const OPENAI_RESPONSES = "@ai-sdk/openai"
const TOKEN_COUNT = /^\d+$/

// Mirrors the generated client's Config.Patch provider value type.
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export type Protocol = "compatible" | "response"

type Translator = (key: string, vars?: Record<string, string | number | boolean>) => string

export type PropertyErr = {
  key?: string
  value?: string
}

export type PropertyRow = {
  row: string
  key: string
  value: string
  err: PropertyErr
}

export type ModelErr = {
  id?: string
  name?: string
  context?: string
  output?: string
}

export type ModelRow = {
  row: string
  id: string
  name: string
  context: string
  output: string
  expanded: boolean
  properties: PropertyRow[]
  err: ModelErr
}

export type HeaderErr = {
  key?: string
  value?: string
}

export type HeaderRow = {
  row: string
  key: string
  value: string
  err: HeaderErr
}

export type FormState = {
  providerID: string
  name: string
  baseURL: string
  apiKey: string
  protocol: Protocol
  models: ModelRow[]
  headers: HeaderRow[]
  err: {
    providerID?: string
    name?: string
    baseURL?: string
  }
}

type ValidateArgs = {
  form: FormState
  t: Translator
  disabledProviders: string[]
  existingProviderIDs: Set<string>
}

export function validateCustomProvider(input: ValidateArgs) {
  const providerID = input.form.providerID.trim()
  const name = input.form.name.trim()
  const baseURL = input.form.baseURL.trim()
  const apiKey = input.form.apiKey.trim()

  const env = apiKey.match(/^\{env:([^}]+)\}$/)?.[1]?.trim()
  const key = apiKey && !env ? apiKey : undefined

  const idError = !providerID
    ? input.t("provider.custom.error.providerID.required")
    : !PROVIDER_ID.test(providerID)
      ? input.t("provider.custom.error.providerID.format")
      : undefined

  const nameError = !name ? input.t("provider.custom.error.name.required") : undefined
  const urlError = !baseURL
    ? input.t("provider.custom.error.baseURL.required")
    : !/^https?:\/\//.test(baseURL)
      ? input.t("provider.custom.error.baseURL.format")
      : undefined

  const disabled = input.disabledProviders.includes(providerID)
  const existsError = idError
    ? undefined
    : input.existingProviderIDs.has(providerID) && !disabled
      ? input.t("provider.custom.error.providerID.exists")
      : undefined

  let modelsValid = true
  const seenModels = new Set<string>()
  const modelConfig: Record<string, Record<string, JsonValue>> = {}
  const models = input.form.models.map((m) => {
    const id = m.id.trim()
    const idError = !id
      ? input.t("provider.custom.error.required")
      : seenModels.has(id)
        ? input.t("provider.custom.error.duplicate")
        : (() => {
            seenModels.add(id)
            return undefined
          })()
    const nameError = !m.name.trim() ? input.t("provider.custom.error.required") : undefined
    const contextError = validateTokenCount(m.context, input.t)
    const outputError = validateTokenCount(m.output, input.t)
    const properties = validateProperties(m.properties, input.t)
    const valid = !idError && !nameError && !contextError && !outputError && properties.valid
    if (!valid) {
      modelsValid = false
    } else {
      modelConfig[id] = {
        name: m.name.trim(),
        limit: { context: Number(m.context.trim()), output: Number(m.output.trim()) },
        // Property rows write as top-level model config entries (options, modalities, variants, ...).
        ...properties.values,
      }
    }
    return { id: idError, name: nameError, context: contextError, output: outputError, properties: properties.err }
  })

  const seenHeaders = new Set<string>()
  const headers = input.form.headers.map((h) => {
    const key = h.key.trim()
    const value = h.value.trim()

    if (!key && !value) return {}
    const keyError = !key
      ? input.t("provider.custom.error.required")
      : seenHeaders.has(key.toLowerCase())
        ? input.t("provider.custom.error.duplicate")
        : (() => {
            seenHeaders.add(key.toLowerCase())
            return undefined
          })()
    const valueError = !value ? input.t("provider.custom.error.required") : undefined
    return { key: keyError, value: valueError }
  })
  const headersValid = headers.every((h) => !h.key && !h.value)
  const headerConfig = Object.fromEntries(
    input.form.headers
      .map((h) => ({ key: h.key.trim(), value: h.value.trim() }))
      .filter((h) => !!h.key && !!h.value)
      .map((h) => [h.key, h.value]),
  )

  const err = {
    providerID: idError ?? existsError,
    name: nameError,
    baseURL: urlError,
  }

  const ok = !idError && !existsError && !nameError && !urlError && modelsValid && headersValid
  if (!ok) return { err, models, headers }

  return {
    err,
    models,
    headers,
    result: {
      providerID,
      name,
      config: {
        npm: input.form.protocol === "response" ? OPENAI_RESPONSES : OPENAI_COMPATIBLE,
        name,
        ...(env ? { env: [env] } : {}),
        options: {
          baseURL,
          ...(key ? { apiKey: key } : {}),
          ...(Object.keys(headerConfig).length ? { headers: headerConfig } : {}),
        },
        models: modelConfig,
      },
    },
  }
}

function validateTokenCount(value: string, t: Translator) {
  const text = value.trim()
  if (!text) return t("provider.custom.error.required")
  if (!TOKEN_COUNT.test(text) || Number(text) <= 0) return t("provider.custom.error.number")
  return undefined
}

function parseJsonValue(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) }
  } catch {
    return { ok: false }
  }
}

// Property rows become top-level model config entries: blank rows are ignored, keys must be
// unique, and every value must parse as JSON.
function validateProperties(rows: PropertyRow[], t: Translator) {
  const seen = new Set<string>()
  let valid = true
  const values: Record<string, JsonValue> = {}
  const err = rows.map((property) => {
    const key = property.key.trim()
    const value = property.value.trim()
    if (!key && !value) return {}
    const keyError = !key
      ? t("provider.custom.error.required")
      : seen.has(key)
        ? t("provider.custom.error.duplicate")
        : (() => {
            seen.add(key)
            return undefined
          })()
    let valueError: string | undefined
    if (!value) valueError = t("provider.custom.error.required")
    else {
      const json = parseJsonValue(value)
      if (!json.ok) valueError = t("provider.custom.error.json")
      else if (!keyError) values[key] = json.value as JsonValue
    }
    if (keyError || valueError) valid = false
    return { key: keyError, value: valueError }
  })
  return { err, valid, values }
}

export type ExistingModel = {
  name?: string
  limit?: { context?: number; output?: number }
  settings?: Record<string, unknown>
  capabilities?: { input?: string[]; output?: string[] }
  variants?: Array<{ id: string; settings?: Record<string, unknown> }>
}

export type ExistingProvider = {
  name?: string
  env?: string[]
  package?: string
  settings?: Record<string, unknown>
  headers?: Record<string, string>
  models?: Record<string, ExistingModel>
}

// Rebuilds form state from the normalized provider config entry so the edit dialog starts
// from what the config file actually contains.
export function prefillCustomProvider(providerID: string, provider: ExistingProvider): FormState {
  const pkg = (provider.package ?? "").replace(/^aisdk:/, "")
  const protocol: Protocol = pkg.includes("openai-compatible")
    ? "compatible"
    : pkg.includes("openai")
      ? "response"
      : "compatible"
  const settings = provider.settings ?? {}
  const headers = Object.entries(provider.headers ?? {}).map(([key, value]) => headerRow(key, String(value)))
  const models = Object.entries(provider.models ?? {}).map(([id, model]) => modelFromConfig(id, model))
  return {
    providerID,
    name: provider.name ?? "",
    baseURL: typeof settings.baseURL === "string" ? settings.baseURL : "",
    apiKey: provider.env?.length
      ? `{env:${provider.env[0]}}`
      : typeof settings.apiKey === "string"
        ? settings.apiKey
        : "",
    protocol,
    models: models.length ? models : [modelRow()],
    headers: headers.length ? headers : [headerRow()],
    err: {},
  }
}

function modelFromConfig(id: string, model: ExistingModel): ModelRow {
  const row = modelRow()
  row.id = id
  row.name = model.name ?? ""
  row.context = String(model.limit?.context ?? 200_000)
  row.output = String(model.limit?.output ?? 16_000)
  row.properties = [
    propertyRow("options", JSON.stringify(model.settings ?? { reasoningEffort: "high" })),
    propertyRow(
      "modalities",
      JSON.stringify({
        input: model.capabilities?.input ?? ["text"],
        output: model.capabilities?.output ?? ["text"],
      }),
    ),
    propertyRow(
      "variants",
      JSON.stringify(
        model.variants?.length
          ? Object.fromEntries(model.variants.map((variant) => [variant.id, variant.settings ?? {}]))
          : { high: { reasoningEffort: "high" } },
      ),
    ),
  ]
  return row
}

let row = 0

const nextRow = () => `row-${row++}`

export const propertyRow = (key = "", value = ""): PropertyRow => ({ row: nextRow(), key, value, err: {} })

const defaultProperties = (): PropertyRow[] => [
  propertyRow("options", JSON.stringify({ reasoningEffort: "high" })),
  propertyRow("modalities", JSON.stringify({ input: ["text"], output: ["text"] })),
  propertyRow("variants", JSON.stringify({ high: { reasoningEffort: "high" } })),
]

export const modelRow = (): ModelRow => ({
  row: nextRow(),
  id: "",
  name: "",
  context: "200000",
  output: "16000",
  expanded: false,
  properties: defaultProperties(),
  err: {},
})

export const headerRow = (key = "", value = ""): HeaderRow => ({ row: nextRow(), key, value, err: {} })
