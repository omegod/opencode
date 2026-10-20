import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { enterpriseSpamProbability, ENTERPRISE_SPAM_MODEL } from "./enterprise-spam"
import { enterpriseEmailContent, handleEnterpriseRequest } from "./enterprise"

const submission = {
  name: "Fake Visitor",
  role: "Engineering lead",
  company: "Example Test Company",
  email: "fake-visitor@example.test",
  message: "We need SSO for 200 developers.",
}

afterEach(() => mock.restore())

const score = (probability: unknown) =>
  Response.json({ model: ENTERPRISE_SPAM_MODEL, answers: { spam: { type: "noul", noul: probability } } })

test("scores a submission through the System One gateway", async () => {
  const requests: Request[] = []
  // The form handler passes the whole submission, phone included; the classifier must not receive it.
  const withPhone = { ...submission, phone: "+1 555 0100" }
  const probability = await enterpriseSpamProbability(withPhone, {
    inferenceUrl: "https://opencode.test/inference",
    apiKey: "test-key",
    fetch: async (request) => {
      requests.push(request)
      return score(0.97)
    },
  })

  expect(probability).toBe(0.97)
  expect(requests).toHaveLength(1)
  expect(requests[0].url).toBe("https://opencode.test/inference/systemone/v1/systemone")
  expect(requests[0].headers.get("authorization")).toBe("Bearer test-key")
  const body = await requests[0].json()
  expect(body.model).toBe(ENTERPRISE_SPAM_MODEL)
  expect(body.state.submission).toMatchObject({ email: submission.email, message: submission.message })
  expect(body.state.submission).not.toHaveProperty("phone")
  expect(body.questions.spam.type).toBe("noul")
})

test("returns no score when the gateway fails, times out, or answers without a probability", async () => {
  const options = { inferenceUrl: "https://opencode.test/inference", apiKey: "test-key" }
  const failures = [
    async () => new Response("nope", { status: 401 }),
    async () => {
      throw new Error("network")
    },
    async () => score("high"),
    async () => score(1.5),
    async () => Response.json({ answers: {} }),
    (request: Request) =>
      new Promise<Response>((_, reject) =>
        request.signal.addEventListener("abort", () => reject(request.signal.reason)),
      ),
  ]
  for (const fetch of failures) {
    expect(await enterpriseSpamProbability(submission, { ...options, timeoutMs: 20, fetch })).toBeUndefined()
  }
})

test("returns no score without logging an error when the gateway is not configured", async () => {
  const error = spyOn(console, "error").mockImplementation(() => {})
  expect(await enterpriseSpamProbability(submission, { inferenceUrl: "", apiKey: "test-key" })).toBeUndefined()
  expect(error).not.toHaveBeenCalled()
})

const submit = async (fetch: (request: Request) => Promise<Response>) => {
  const leads: Record<string, unknown>[] = []
  const response = await handleEnterpriseRequest(
    new Request("http://localhost/api/enterprise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...submission, alias: "" }),
    }),
    {
      spam: { inferenceUrl: "https://opencode.test/inference", apiKey: "test-key", fetch },
      salesforceSubmit: async (payload) => {
        leads.push(payload)
        return true
      },
      notifications: false,
      accountLookup: async () => null,
    },
  )
  return { status: response.status, body: await response.json(), leads }
}

test("confident spam gets the normal success response, never reaches Salesforce, and is logged", async () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {})
  const result = await submit(async () => score(0.95))
  expect(result.status).toBe(200)
  expect(result.body).toMatchObject({ success: true })
  expect(result.leads).toHaveLength(0)
  expect(warn).toHaveBeenCalledWith("Enterprise inquiry dropped as spam", {
    email: submission.email,
    probability: 0.95,
  })
})

test("uncertain, missing, or failed scores still create the lead", async () => {
  spyOn(console, "error").mockImplementation(() => {})
  for (const fetch of [
    async () => score(0.6),
    async () => Response.json({ answers: {} }),
    async () => {
      throw new Error("classifier down")
    },
  ]) {
    const result = await submit(fetch)
    expect(result.status).toBe(200)
    expect(result.leads).toHaveLength(1)
  }
})

test("the sales inbox email escapes submitted HTML", () => {
  const content = enterpriseEmailContent({
    name: "<b>Name</b>",
    role: "Role",
    email: "fake-visitor@example.test",
    message: `<script>alert("x")</script> & <img src=x onerror=alert(1)>`,
    alias: "",
  })
  expect(content.html).not.toContain("<script>")
  expect(content.html).not.toContain("<img")
  expect(content.html).not.toContain("<b>")
  expect(content.html).toContain(
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;img src=x onerror=alert(1)&gt;",
  )
  expect(content.html).toContain("&lt;b&gt;Name&lt;/b&gt;<br>")
})

test("the sales inbox plain-text email is not HTML-escaped", () => {
  const content = enterpriseEmailContent(
    { ...submission, name: "Ada <CTO>", message: "Pricing & SSO?", phone: "+1 555 0100", alias: "" },
    "$10k+",
  )
  expect(content.text).not.toContain("<br>")
  expect(content.text).not.toContain("&lt;")
  expect(content.text).not.toContain("&amp;")
  expect(content.text).toBe(
    [
      "Pricing & SSO?",
      "",
      "Current monthly inference spend: $10k+",
      "",
      "--",
      "Ada <CTO>",
      submission.role,
      submission.company,
      submission.email,
      "+1 555 0100",
    ].join("\n"),
  )
})
