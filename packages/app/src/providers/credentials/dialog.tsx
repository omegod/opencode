import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Spinner } from "@opencode/ui/spinner"
import { TextField } from "@opencode/ui/text-field"
import { useMutation } from "@tanstack/solid-query"
import { showToast } from "@/shell/notifications/toast"
import { batch, createEffect, createResource, For, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { ExternalLink } from "@/runtime/platform/external-link"
import { useData } from "@/runtime/server/current"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import {
  type FormState,
  headerRow,
  modelRow,
  prefillCustomProvider,
  propertyRow,
  validateCustomProvider,
  type ExistingProvider,
  type Protocol,
} from "./form"
import { CustomManagedProviderIcon } from "@/providers/models/provider-group"
import { FormSelect } from "./form-select"

export function CustomProviderForm(props: { autofocus?: boolean; edit?: string } = {}) {
  const dialog = useDialog()
  const data = useData()
  const language = useLanguage()
  const serverSdk = useServerSDK()

  const [form, setForm] = createStore<FormState>({
    providerID: "",
    name: "",
    baseURL: "",
    apiKey: "",
    protocol: "compatible",
    models: [modelRow()],
    headers: [headerRow()],
    err: {},
  })

  // Config-defined providers feed both the duplicate-ID check and the edit prefill.
  const [configProviders] = createResource(async () => {
    const entries = await serverSdk.api.config.get().catch(() => [])
    const providers = new Map<string, ExistingProvider>()
    for (const entry of entries) {
      if (entry.type !== "document") continue
      for (const [id, info] of Object.entries(entry.info.providers ?? {})) providers.set(id, info)
    }
    return providers
  })

  createEffect(() => {
    const providerID = props.edit
    if (!providerID) return
    const provider = configProviders()?.get(providerID)
    if (!provider) return
    batch(() => {
      setForm(prefillCustomProvider(providerID, provider))
      setForm("err", {})
    })
  })

  // Edit mode waits for the config entry so the form never flashes empty fields first.
  const ready = () => !props.edit || configProviders.state === "ready" || !!configProviders.error

  const addModel = () => {
    setForm(
      "models",
      produce((rows) => {
        rows.push(modelRow())
      }),
    )
  }

  const removeModel = (index: number) => {
    if (form.models.length <= 1) return
    setForm(
      "models",
      produce((rows) => {
        rows.splice(index, 1)
      }),
    )
  }

  const addProperty = (index: number) => {
    setForm("models", index, "properties", produce((rows) => {
      rows.push(propertyRow())
    }))
  }

  const removeProperty = (index: number, propertyIndex: number) => {
    setForm("models", index, "properties", produce((rows) => {
      rows.splice(propertyIndex, 1)
    }))
  }

  const setProperty = (index: number, propertyIndex: number, key: "key" | "value", value: string) => {
    batch(() => {
      setForm("models", index, "properties", propertyIndex, key, value)
      setForm("models", index, "properties", propertyIndex, "err", key, undefined)
    })
  }

  const addHeader = () => {
    setForm(
      "headers",
      produce((rows) => {
        rows.push(headerRow())
      }),
    )
  }

  const removeHeader = (index: number) => {
    if (form.headers.length <= 1) return
    setForm(
      "headers",
      produce((rows) => {
        rows.splice(index, 1)
      }),
    )
  }

  const setField = (key: "name" | "baseURL" | "apiKey", value: string) => {
    setForm(key, value)
    if (key === "apiKey") return
    setForm("err", key, undefined)
  }

  const setModel = (index: number, key: "id" | "name" | "context" | "output", value: string) => {
    batch(() => {
      setForm("models", index, key, value)
      setForm("models", index, "err", key, undefined)
    })
  }

  const setHeader = (index: number, key: "key" | "value", value: string) => {
    batch(() => {
      setForm("headers", index, key, value)
      setForm("headers", index, "err", key, undefined)
    })
  }

  const validate = () => {
    const existingProviderIDs = new Set([
      ...(data.location.provider.list() ?? []).map((provider) => provider.id),
      ...(configProviders.latest?.keys() ?? []),
    ])
    if (props.edit) existingProviderIDs.delete(props.edit)
    const output = validateCustomProvider({
      form,
      t: language.t,
      // TODO: Restore disabled-provider validation when V2 exposes config reads.
      disabledProviders: [],
      existingProviderIDs,
    })
    batch(() => {
      setForm("err", output.err)
      output.models.forEach((model, index) => {
        setForm("models", index, "err", {
          id: model.id,
          name: model.name,
          context: model.context,
          output: model.output,
        })
        model.properties.forEach((property, propertyIndex) =>
          setForm("models", index, "properties", propertyIndex, "err", property),
        )
      })
      output.headers.forEach((err, index) => setForm("headers", index, "err", err))
    })
    return output.result
  }

  const saveMutation = useMutation(() => ({
    mutationFn: async (result: NonNullable<ReturnType<typeof validate>>): Promise<typeof result> => {
      await serverSdk.api.config.update({ provider: { [result.providerID]: result.config } })
      return result
    },
    onSuccess: (result) => {
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.custom.toast.saved.title"),
        description: language.t("provider.custom.toast.saved.description", { provider: result.name }),
      })
      // The server reloads the config file asynchronously; give the reload a beat before
      // refetching so the provider list reflects the saved entry.
      setTimeout(() => {
        data.location.provider.invalidate()
        data.location.model.invalidate()
        void Promise.all([data.location.provider.sync(), data.location.model.sync()]).catch(() => undefined)
      }, 500)
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    },
  }))

  const save = (e: SubmitEvent) => {
    e.preventDefault()
    if (saveMutation.isPending) return

    const result = validate()
    if (!result) return
    saveMutation.mutate(result)
  }

  return (
    <Show when={ready()} fallback={<div class="flex justify-center p-10"><Spinner /></div>}>
      <div class="flex flex-col gap-6 px-2.5 pb-3 overflow-y-auto max-h-[60vh]">
        <div class="px-2.5 flex gap-4 items-center">
          <CustomManagedProviderIcon class="size-5 shrink-0" />
          <div class="text-16-medium text-text-strong">{language.t("provider.custom.title")}</div>
        </div>

        <form onSubmit={save} class="px-2.5 pb-6 flex flex-col gap-6">
          <p class="text-14-regular text-text-base">
            {language.t("provider.custom.description.prefix")}
            <ExternalLink href="https://opencode.ai/docs/providers/#custom-provider" tabIndex={-1}>
              {language.t("provider.custom.description.link")}
            </ExternalLink>
            {language.t("provider.custom.description.suffix")}
          </p>

          <div class="flex flex-col gap-4">
            <TextField
              autofocus={props.autofocus ?? true}
              label={language.t("provider.custom.field.providerID.label")}
              placeholder={language.t("provider.custom.field.providerID.placeholder")}
              description={language.t("provider.custom.field.providerID.description")}
              value={form.providerID}
              onChange={(v) => setForm("providerID", v)}
              validationState={form.err.providerID ? "invalid" : undefined}
              error={form.err.providerID}
              disabled={!!props.edit}
            />
            <TextField
              label={language.t("provider.custom.field.name.label")}
              placeholder={language.t("provider.custom.field.name.placeholder")}
              value={form.name}
              onChange={(v) => setField("name", v)}
              validationState={form.err.name ? "invalid" : undefined}
              error={form.err.name}
            />
            <TextField
              label={language.t("provider.custom.field.baseURL.label")}
              placeholder={language.t("provider.custom.field.baseURL.placeholder")}
              value={form.baseURL}
              onChange={(v) => setField("baseURL", v)}
              validationState={form.err.baseURL ? "invalid" : undefined}
              error={form.err.baseURL}
            />
            <TextField
              label={language.t("provider.custom.field.apiKey.label")}
              placeholder={language.t("provider.custom.field.apiKey.placeholder")}
              description={language.t("provider.custom.field.apiKey.description")}
              value={form.apiKey}
              onChange={(v) => setField("apiKey", v)}
            />
            <div class="flex flex-col gap-2">
              <label class="text-12-medium text-text-weak">{language.t("provider.custom.protocol.label")}</label>
              <FormSelect
                label={language.t("provider.custom.protocol.label")}
                current={form.protocol}
                onSelect={(value) => setForm("protocol", value as Protocol)}
                options={[
                  { value: "compatible", label: language.t("provider.custom.protocol.compatible") },
                  { value: "response", label: language.t("provider.custom.protocol.response") },
                ]}
              />
            </div>
          </div>

          <div class="flex flex-col gap-3">
            <label class="text-12-medium text-text-weak">{language.t("provider.custom.models.label")}</label>
            <For each={form.models}>
              {(m, i) => (
                <div class="flex gap-2 items-start" data-row={m.row}>
                  <button
                    type="button"
                    class="mt-1.5 flex size-7 shrink-0 items-center justify-center rounded-sm text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
                    onClick={() => setForm("models", i(), "expanded", (value) => !value)}
                    aria-expanded={m.expanded}
                    aria-label={language.t("provider.custom.models.toggle")}
                  >
                    <Icon name="chevron-right" size="small" classList={{ "rotate-90 transition-transform": m.expanded }} />
                  </button>
                  {/* Id/name and the expanded config share one column so the block's edges
                      align with the id input's start and the name input's end. */}
                  <div class="flex min-w-0 flex-1 flex-col gap-2">
                    <div class="flex gap-2 items-start">
                      <div class="flex-1">
                        <TextField
                          label={language.t("provider.custom.models.id.label")}
                          hideLabel
                          placeholder={language.t("provider.custom.models.id.placeholder")}
                          value={m.id}
                          onChange={(v) => setModel(i(), "id", v)}
                          validationState={m.err.id ? "invalid" : undefined}
                          error={m.err.id}
                        />
                      </div>
                      <div class="flex-1">
                        <TextField
                          label={language.t("provider.custom.models.name.label")}
                          hideLabel
                          placeholder={language.t("provider.custom.models.name.placeholder")}
                          value={m.name}
                          onChange={(v) => setModel(i(), "name", v)}
                          validationState={m.err.name ? "invalid" : undefined}
                          error={m.err.name}
                        />
                      </div>
                    </div>
                    <Show when={m.expanded}>
                      <div class="flex flex-col gap-4 rounded-md border border-v2-border-border-muted p-3">
                        <div class="flex flex-col gap-2">
                          <label class="text-12-medium text-text-weak">
                            {language.t("provider.custom.models.limits.title")}
                          </label>
                          <div class="flex gap-2">
                            <div class="flex-1">
                              <TextField
                                label={language.t("provider.custom.models.limits.context")}
                                hideLabel
                                type="number"
                                min={1}
                                value={m.context}
                                onChange={(v) => setModel(i(), "context", v)}
                                validationState={m.err.context ? "invalid" : undefined}
                                error={m.err.context}
                              />
                            </div>
                            <div class="flex-1">
                              <TextField
                                label={language.t("provider.custom.models.limits.output")}
                                hideLabel
                                type="number"
                                min={1}
                                value={m.output}
                                onChange={(v) => setModel(i(), "output", v)}
                                validationState={m.err.output ? "invalid" : undefined}
                                error={m.err.output}
                              />
                            </div>
                          </div>
                        </div>
                        <div class="flex flex-col gap-2">
                          <label class="text-12-medium text-text-weak">
                            {language.t("provider.custom.models.properties.title")}
                          </label>
                          <For each={m.properties}>
                            {(property, j) => (
                              <div class="flex gap-2 items-start" data-row={property.row}>
                                <div class="flex-1">
                                  <TextField
                                    label={language.t("provider.custom.models.properties.key.placeholder")}
                                    hideLabel
                                    placeholder={language.t("provider.custom.models.properties.key.placeholder")}
                                    value={property.key}
                                    onChange={(v) => setProperty(i(), j(), "key", v)}
                                    validationState={property.err.key ? "invalid" : undefined}
                                    error={property.err.key}
                                  />
                                </div>
                                <div class="flex-[2]">
                                  <TextField
                                    label={language.t("provider.custom.models.properties.value.placeholder")}
                                    hideLabel
                                    placeholder={language.t("provider.custom.models.properties.value.placeholder")}
                                    value={property.value}
                                    onChange={(v) => setProperty(i(), j(), "value", v)}
                                    // Invalid JSON only marks the field: the message text would crowd the narrow input.
                                    validationState={property.err.value ? "invalid" : undefined}
                                  />
                                </div>
                                <IconButton
                                  type="button"
                                  icon={<Icon name="trash" />}
                                  variant="ghost"
                                  class="mt-1.5"
                                  onClick={() => removeProperty(i(), j())}
                                  aria-label={language.t("provider.custom.models.properties.remove")}
                                />
                              </div>
                            )}
                          </For>
                          <Button
                            type="button"
                            size="small"
                            variant="ghost"
                            icon="plus-small"
                            onClick={() => addProperty(i())}
                            class="self-start"
                          >
                            {language.t("provider.custom.models.properties.add")}
                          </Button>
                        </div>
                      </div>
                    </Show>
                  </div>
                  <IconButton
                    type="button"
                    icon={<Icon name="trash" />}
                    variant="ghost"
                    class="mt-1.5"
                    onClick={() => removeModel(i())}
                    disabled={form.models.length <= 1}
                    aria-label={language.t("provider.custom.models.remove")}
                  />
                </div>
              )}
            </For>
            <Button type="button" size="small" variant="ghost" icon="plus-small" onClick={addModel} class="self-start">
              {language.t("provider.custom.models.add")}
            </Button>
          </div>

          <div class="flex flex-col gap-3">
            <label class="text-12-medium text-text-weak">{language.t("provider.custom.headers.label")}</label>
            <For each={form.headers}>
              {(h, i) => (
                <div class="flex gap-2 items-start" data-row={h.row}>
                  <div class="flex-1">
                    <TextField
                      label={language.t("provider.custom.headers.key.label")}
                      hideLabel
                      placeholder={language.t("provider.custom.headers.key.placeholder")}
                      value={h.key}
                      onChange={(v) => setHeader(i(), "key", v)}
                      validationState={h.err.key ? "invalid" : undefined}
                      error={h.err.key}
                    />
                  </div>
                  <div class="flex-1">
                    <TextField
                      label={language.t("provider.custom.headers.value.label")}
                      hideLabel
                      placeholder={language.t("provider.custom.headers.value.placeholder")}
                      value={h.value}
                      onChange={(v) => setHeader(i(), "value", v)}
                      validationState={h.err.value ? "invalid" : undefined}
                      error={h.err.value}
                    />
                  </div>
                  <IconButton
                    type="button"
                    icon={<Icon name="trash" />}
                    variant="ghost"
                    class="mt-1.5"
                    onClick={() => removeHeader(i())}
                    disabled={form.headers.length <= 1}
                    aria-label={language.t("provider.custom.headers.remove")}
                  />
                </div>
              )}
            </For>
            <Button type="button" size="small" variant="ghost" icon="plus-small" onClick={addHeader} class="self-start">
              {language.t("provider.custom.headers.add")}
            </Button>
          </div>

          <Button
            class="w-auto self-start"
            type="submit"
            size="large"
            variant="contrast"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? language.t("common.saving") : language.t("common.submit")}
          </Button>
        </form>
      </div>
    </Show>
  )
}
