export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' } })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }
  try {
    const { items, occasion, person, weather } = await req.json()
    if (!items || items.length < 2) {
      return new Response(JSON.stringify({ error: 'Need at least 2 items' }), { status: 400 })
    }
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), { status: 500 })
    }
    const itemSummaries = items.map(i => '[' + i.id + '] ' + i.name + ' (' + i.category + ', ' + i.color + ', ' + (i.style || 'casual') + ', seasons: ' + (i.seasons || []).join('/') + ')').join('\n')
    let weatherContext = ''
    if (weather) {
      weatherContext = '\n\nCurrent weather in ' + weather.location + ': ' + weather.temp + ' F (feels like ' + weather.feelsLike + ' F), ' + weather.description + '. Wind: ' + weather.wind + ' mph. Consider this weather when picking the outfit.'
    }
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'system',
          content: 'You are a fun, creative personal stylist for ' + (person || 'the user') + '. You help put outfits together from their existing wardrobe. Be specific about why pieces work together. Keep it conversational and encouraging.'
        }, {
          role: 'user',
          content: 'Here is my wardrobe:\n' + itemSummaries + weatherContext + '\n\nPut together an outfit for: ' + (occasion || 'a casual day out') + '.\n\nReturn ONLY a JSON object (no markdown, no backticks) with:\n- "outfitName": a fun creative name\n- "itemIds": array of item IDs (the bracketed IDs above)\n- "reasoning": 2-3 sentences about why these work together, mentioning weather if relevant\n- "stylingTips": one sentence styling tip'
        }],
        max_tokens: 500,
        temperature: 0.7
      })
    })
    const data = await response.json()
    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }
    const text = data.choices[0].message.content || ''
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return new Response(JSON.stringify(parsed), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  } catch (e) {
    console.error('AI outfit error:', e)
    return new Response(JSON.stringify({ error: 'Failed to generate outfit' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  }
}
export const config = { path: '/api/ai-outfit' }
