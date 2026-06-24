const https = require('https');

// Current, supported model. The previous code used 'claude-sonnet-4-20250514',
// which Anthropic retired on June 15, 2026 — that is why every analysis was
// failing, not just large documents. See:
// https://platform.claude.com/docs/en/about-claude/model-deprecations
const MODEL = 'claude-sonnet-4-6';

// ---------------------------------------------------------------------------
// The finalized Reversal AI co-parenting signal set — 8 of the 13 signals
// from the registered Detection Framework, recalibrated from fraud language
// to co-parenting communication language. Source: Reversal_AI_Detection_
// Framework (copyright case 1-15126680541) + the family-law vertical scoping
// decision. Excluded as fraud/business-specific: Unicode/Technical Spoofing,
// Phantom Mentor Architecture, Incremental Commitment, False Valuation
// Architecture, Expansion Reframed as Delusion.
// ---------------------------------------------------------------------------
const CO_PARENTING_SIGNALS = [
  {
    name: 'Authority Fabrication',
    definition: 'Falsely claiming an agreement was made, misrepresenting what a court order, attorney, or therapist actually said, or citing a prior conversation as settled fact when it was not.'
  },
  {
    name: 'Urgency Injection',
    definition: 'Manufactured time pressure around an exchange, decision, or response — arbitrary deadlines designed to force a reactive reply before the other parent can verify facts or consult their attorney.'
  },
  {
    name: 'Isolation Engineering',
    definition: 'Systematically separating the child or the other parent from people, information, or relationships that might challenge the narrative — the core mechanism of parental alienation.'
  },
  {
    name: 'Emotional Anchor Planting',
    definition: 'Constructing guilt, fear, or shame about a parenting decision and tethering compliance to that emotional state rather than to the facts (e.g. "the kids were so disappointed in you").'
  },
  {
    name: 'Exit Penalty Construction',
    definition: 'Framing consequences for asserting custody rights, filing with the court, or enforcing a boundary as if they were natural, deserved outcomes rather than retaliation.'
  },
  {
    name: 'Diminishment Framed as Concern',
    definition: 'Delivering an attack on the other parent\u2019s stability, mental health, or living situation in the language of care, so raising it looks like concern rather than a custody tactic.'
  },
  {
    name: 'Loyalty Tests Disguised as Skepticism',
    definition: 'Hard questioning of a parenting decision framed as reasonable scrutiny, but actually designed to test whether the other parent will back down under social or written pressure.'
  },
  {
    name: 'Shared History as Leverage',
    definition: 'Using past mistakes, vulnerabilities, or statements made in an unguarded moment as present-day ammunition against the other parent\u2019s fitness or credibility.'
  }
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const headers = { ...CORS, 'Content-Type': 'application/json' };

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  try {
    if (payload.mode === 'document_chunk') {
      return await handleDocumentChunk(payload, headers);
    }
    return await handleSingleMessage(payload, headers);
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Analysis failed', detail: err.message }) };
  }
};

// ---------------------------------------------------------------------------
// MODE 1: single message — existing Live Detection Engine behavior
// ---------------------------------------------------------------------------
async function handleSingleMessage(payload, headers) {
  const { text, context, relationship, personName, extraContext } = payload;
  if (!text || text.length < 10) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Text too short' }) };
  }
  const ctxLabels = { general: 'Message / Chat', email: 'Email', social: 'Social Media', workplace: 'Workplace' };
  const truncated = text.length > 8000 ? text.substring(0, 8000) + '...' : text;

  const contextParts = [];
  if (relationship) contextParts.push(`Relationship type: ${relationship}`);
  if (personName) contextParts.push(`The person sending this message is named: ${personName}`);
  if (extraContext) contextParts.push(`Additional context provided by the user: ${extraContext}`);
  const contextBlock = contextParts.length > 0 ? `\n\nContext provided by the user:\n${contextParts.join('\n')}` : '';

  const prompt = `You are the Reversal AI manipulation detection engine. Analyze this ${ctxLabels[context] || 'message'} for manipulation patterns.${contextBlock}\n\nUse the relationship type and any additional context to inform and personalize your analysis — the same message reads differently depending on the relationship dynamic. Reference the person by name if one was provided. Return ONLY valid JSON with no extra text: { "threat_level": <0-100>, "threat_category": "<LOW|MEDIUM|HIGH>", "signals": [ {"name": "<max 4 words>", "status": "<DETECTED|WARNING|CLEAR|INFO>", "description": "<one sentence>"} ], "full_analysis": "<2-3 paragraphs>", "recommendation": "<2-3 sentences>" }. Include exactly 6 signals. Message to analyze: ${truncated}`;

  const parsed = await callClaude(prompt, 2000);
  return { statusCode: 200, headers, body: JSON.stringify(parsed) };
}

// ---------------------------------------------------------------------------
// MODE 2: document chunk — extract every instance of a pattern in this chunk
// of a longer document, for client-side aggregation across the whole file.
// ---------------------------------------------------------------------------
async function handleDocumentChunk(payload, headers) {
  const { text } = payload;
  if (!text || text.length < 10) {
    return { statusCode: 200, headers, body: JSON.stringify({ instances: [] }) };
  }
  const truncated = text.length > 9000 ? text.substring(0, 9000) : text;
  const signalBlock = CO_PARENTING_SIGNALS
    .map((s, i) => `${i + 1}. ${s.name} — ${s.definition}`)
    .join('\n');

  const prompt = `You are the Reversal AI manipulation detection engine, analyzing ONE SECTION of a longer co-parenting communication export (e.g. OurFamilyWizard, email, or text history). This is one chunk among many — only report what is literally present in THIS chunk, do not summarize the whole relationship or invent context from outside it.

Each message in this chunk may be labeled like this: [MSG 1 | SENDER: Name | timestamp]. When that labeling is present, copy the SENDER and timestamp values exactly into your output for any instance found in that message — do not guess or infer who said it. If no such labels are present, leave "speaker" as null.

Scan this chunk for instances of these communication patterns:
${signalBlock}

For each instance found, extract:
- "pattern": the exact name of the matching pattern from the list above
- "quote": a short excerpt (under 30 words) copied directly from this chunk that shows the instance
- "severity": "low", "medium", or "high" based on how clear and significant the instance is
- "timestamp": the timestamp from the message's tag if present, otherwise any date/time visible near the excerpt, or null
- "speaker": the SENDER value from the message's tag if present, otherwise null

Return ONLY valid JSON with no extra text: { "instances": [ { "pattern": "...", "quote": "...", "severity": "...", "timestamp": "...", "speaker": "..." } ] }

If this chunk is routine logistics only (pickup times, scheduling confirmations) with no instances of the listed patterns, return: { "instances": [] }

Chunk to analyze:
${truncated}`;

  try {
    const parsed = await callClaude(prompt, 3500);
    if (!Array.isArray(parsed.instances)) parsed.instances = [];
    return { statusCode: 200, headers, body: JSON.stringify(parsed) };
  } catch (err) {
    // Don't fail the whole document over one bad chunk — return empty and let
    // the frontend log it as a skipped section, but include the real reason.
    return { statusCode: 200, headers, body: JSON.stringify({ instances: [], error: 'chunk_failed', detail: err.message }) };
  }
}

// ---------------------------------------------------------------------------
// Shared Claude API call
// ---------------------------------------------------------------------------
function callClaude(prompt, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    });
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode !== 200 || !json.content || !json.content[0]) {
            return reject(new Error('API error: ' + data));
          }
          let raw = json.content[0].text.trim().replace(/```json|```/g, '').trim();
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
