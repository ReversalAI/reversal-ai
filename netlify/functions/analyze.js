exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
  try {
    const { text, context } = JSON.parse(event.body);
    if (!text || text.length < 10) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Text too short' }) };
    const ctxLabels = { general: 'Message / Chat', email: 'Email', social: 'Social Media', workplace: 'Workplace' };
    const prompt = `You are the Reversal AI manipulation detection engine. Analyze this ${ctxLabels[context] || 'message'} for manipulation patterns and fraud signals. Return ONLY a JSON object: { "threat_level": <0-100>, "threat_category": "<LOW|MEDIUM|HIGH>", "signals": [ {"name": "<max 4 words>", "status": "<DETECTED|WARNING|CLEAR|INFO>", "description": "<one sentence>"} ], "full_analysis": "<2-3 paragraphs>", "recommendation": "<2-3 sentences>" }. Include exactly 6 signals. ONLY JSON. Message: ${text}`;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    if (!response.ok || !data.content?.[0]) throw new Error('API error');
    let raw = data.content[0].text.trim().replace(/```json|```/g, '').trim();
    return { statusCode: 200, headers, body: JSON.stringify(JSON.parse(raw)) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Analysis failed' }) };
  }
};
