const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
  try {
    const { text, context, relationship, personName, extraContext } = JSON.parse(event.body);
    if (!text || text.length < 10) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Text too short' }) };
    const ctxLabels = { general: 'Message / Chat', email: 'Email', social: 'Social Media', workplace: 'Workplace' };
    const truncated = text.length > 8000 ? text.substring(0, 8000) + '...' : text;

    const contextParts = [];
    if (relationship) contextParts.push(`Relationship type: ${relationship}`);
    if (personName) contextParts.push(`The person sending this message is named: ${personName}`);
    if (extraContext) contextParts.push(`Additional context provided by the user: ${extraContext}`);
    const contextBlock = contextParts.length > 0 ? `\n\nContext provided by the user:\n${contextParts.join('\n')}` : '';

    const prompt = `You are the Reversal AI manipulation detection engine. Analyze this ${ctxLabels[context] || 'message'} for manipulation patterns.${contextBlock}\n\nUse the relationship type and any additional context to inform and personalize your analysis — the same message reads differently depending on the relationship dynamic. Reference the person by name if one was provided. Return ONLY valid JSON with no extra text: { "threat_level": <0-100>, "threat_category": "<LOW|MEDIUM|HIGH>", "signals": [ {"name": "<max 4 words>", "status": "<DETECTED|WARNING|CLEAR|INFO>", "description": "<one sentence>"} ], "full_analysis": "<2-3 paragraphs>", "recommendation": "<2-3 sentences>" }. Include exactly 6 signals. Message to analyze: ${truncated}`;

    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });
    const result = await new Promise((resolve, reject) => {
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
        res.on('end', () => { resolve({ status: res.statusCode, body: data }); });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    const data = JSON.parse(result.body);
    if (result.status !== 200 || !data.content?.[0]) throw new Error('API error: ' + result.body);
    let raw = data.content[0].text.trim().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    return { statusCode: 200, headers, body: JSON.stringify(parsed) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Analysis failed', detail: err.message }) };
  }
};
