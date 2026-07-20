# AML PEP OSINT Assistant in n8n

This workflow is called by the AML app through `N8N_AML_PEP_OSINT_WEBHOOK_URL`.

Flow:

1. Webhook receives client and beneficial owners from AML.
2. Code node creates internet search queries.
3. HTTP Request asks private SearXNG for JSON search results.
4. Code node groups search results by person.
5. OpenAI node evaluates whether public sources indicate PEP risk.
6. Code node normalizes the response.
7. Respond to Webhook returns JSON to the AML app.

## Required environment

In the app:

```env
N8N_AML_PEP_OSINT_WEBHOOK_URL=https://your-n8n-domain/webhook/aml-pep-osint
```

In n8n:

```env
OPENAI_API_KEY=...
SEARXNG_URL=http://127.0.0.1:8080
```

Use the production `/webhook/...` URL, not `/webhook-test/...`.

## Node 1: Webhook

- Method: `POST`
- Path: `aml-pep-osint`
- Response mode: `Using Respond to Webhook node`

## Node 2: Code - prepare search queries

```js
const body = $json.body || $json;
const subjects = body.subjects || [];
const clientName = body.client?.name || "";

const queryTemplates = (name, company) => [
  `"${name}" PEP`,
  `"${name}" "osoba politycznie eksponowana"`,
  `"${name}" minister poseł senator prezydent burmistrz wojewoda`,
  `"${name}" site:gov.pl`,
  `"${name}" site:sejm.gov.pl`,
  `"${name}" site:senat.gov.pl`,
  `"${name}" site:europarl.europa.eu`,
  company ? `"${name}" "${company}"` : null,
].filter(Boolean);

return subjects.flatMap((subject) => {
  const name = subject.name;
  const company = subject.companyName || clientName;
  return queryTemplates(name, company).map((query) => ({
    json: {
      client: body.client,
      subject: name,
      query,
    },
  }));
});
```

## Node 3: HTTP Request - SearXNG

- Method: `GET`
- URL: `={{ ($env.SEARXNG_URL || "http://127.0.0.1:8080") + "/search" }}`
- Query parameters:
  - `q`: `={{ $json.query }}`
  - `format`: `json`
  - `language`: `pl`
  - `safesearch`: `0`

Keep the original query item data in the node output. If your n8n version does not keep it, add `subject` and `query` back in a Set node before grouping.

## Node 4: Code - group results

```js
const items = $input.all();
const grouped = {};

for (const item of items) {
  const subject = item.json.subject || item.pairedItem?.json?.subject || "Nieznana osoba";
  const query = item.json.query || "";
  const results = Array.isArray(item.json.results) ? item.json.results : [];

  grouped[subject] ||= [];

  for (const result of results.slice(0, 5)) {
    const url = result.url || "";
    if (!url || grouped[subject].some((existing) => existing.url === url)) continue;
    grouped[subject].push({
      title: result.title || url,
      url,
      snippet: result.content || result.snippet || "",
      query,
    });
  }
}

return [{
  json: {
    subjects: Object.entries(grouped).map(([subject, sources]) => ({
      subject,
      sources: sources.slice(0, 20),
    })),
  },
}];
```

## Node 5: OpenAI

Use an OpenAI Chat Model node or AI Agent node.

Recommended model: current economical reasoning-capable model available in your n8n OpenAI integration.

System prompt:

```text
Jesteś asystentem AML do wspomagającej weryfikacji PEP.

Otrzymasz listę osób oraz wyniki wyszukiwania internetowego. Oceń wyłącznie na podstawie dostarczonych źródeł, czy istnieją przesłanki, że dana osoba jest:
- osobą politycznie eksponowaną,
- członkiem rodziny PEP,
- bliskim współpracownikiem PEP.

Nie zgaduj. Nie uznawaj osoby za PEP wyłącznie po podobieństwie imienia i nazwiska. Jeżeli źródła są niejednoznaczne, ustaw risk jako unclear albo possible_pep.

Zwróć wyłącznie poprawny JSON:
{
  "status": "ok | warning | error",
  "label": "krótki opis po polsku",
  "findings": [
    {
      "subject": "imię i nazwisko",
      "risk": "none | possible_pep | confirmed_pep | unclear",
      "summary": "krótkie uzasadnienie",
      "sources": [
        {
          "title": "tytuł",
          "url": "url",
          "snippet": "fragment"
        }
      ]
    }
  ],
  "notes": "krótka notatka metodologiczna"
}
```

User message:

```text
Dane do analizy:
{{ JSON.stringify($json.subjects) }}
```

## Node 6: Code - normalize JSON for AML app

```js
const raw = $json.output || $json.text || $json.message?.content || $json;
let parsed = raw;

if (typeof raw === "string") {
  const match = raw.match(/\{[\s\S]*\}/);
  parsed = JSON.parse(match ? match[0] : raw);
}

const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
const hasRisk = findings.some((finding) => ["possible_pep", "confirmed_pep", "unclear"].includes(finding.risk));

return [{
  json: {
    status: parsed.status || (hasRisk ? "warning" : "ok"),
    label: parsed.label || (hasRisk
      ? "PEP OSINT: znaleziono potencjalne przesłanki, wymagana analiza."
      : "PEP OSINT: brak przesłanek PEP w sprawdzonych źródłach."),
    findings,
    notes: parsed.notes || "Sprawdzenie wykonane przez n8n na podstawie SearXNG i OpenAI.",
  },
}];
```

## Node 7: Respond to Webhook

- Respond With: `JSON`
- Response Body:

```js
={{ $json }}
```

## Test from shell

```bash
curl -X POST "https://your-n8n-domain/webhook/aml-pep-osint" \
  -H "Content-Type: application/json" \
  -d '{
    "client": {"id": "test", "name": "Test Sp. z o.o.", "nip": "1234567890"},
    "subjects": [{"name": "Jan Kowalski", "companyName": "Test Sp. z o.o.", "country": "POLSKA"}]
  }'
```

The response must match:

```json
{
  "status": "ok",
  "label": "PEP OSINT: ...",
  "findings": [],
  "notes": "..."
}
```
