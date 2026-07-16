export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' } })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }
  try {
    const { items, occasion, person, weather, recentOutfitNames } = await req.json()
    if (!items || items.length < 2) {
      return new Response(JSON.stringify({ error: 'Need at least 2 items' }), { status: 400 })
    }
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), { status: 500 })
    }

    const today = new Date().toISOString().split('T')[0]
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const itemSummaries = items.map(i => {
      let line = '[' + i.id + '] ' + i.name + ' (' + i.category
      if (i.accessoryType) line += '/' + i.accessoryType
      line += ', ' + i.color + ', ' + (i.style || 'casual')
      line += ', seasons: ' + (i.seasons || []).join('/')
      if (i.lastWorn) {
        line += ', last worn: ' + i.lastWorn
        if (i.lastWorn >= twoWeeksAgo) line += ' [RECENTLY WORN]'
      } else {
        line += ', last worn: never'
      }
      line += ')'
      return line
    }).join('\n')

    let weatherContext = ''
    if (weather) {
      weatherContext = '\n\nCurrent weather in ' + weather.location + ': ' + weather.temp + ' F (feels like ' + weather.feelsLike + ' F), ' + weather.description + '. Wind: ' + weather.wind + ' mph. Consider this weather when picking the outfit.'
    }

    const systemPrompt = 'You are a fun, creative personal stylist for ' + (person || 'the user') + '. You put outfits together from their existing wardrobe.\n\nCRITICAL RULES:\n1. OUTFIT STRUCTURE: Every outfit MUST start with a main garment (Tops+Bottoms, or a Dress). Pick the core clothing first, then add Shoes, then optionally Accessories. Never build an outfit from only accessories and shoes.\n2. DRESS HANDLING: If the wardrobe has Dresses and the occasion suits one, or the user asks for a dress, you MUST select an item whose category is "Dresses". A dress replaces the need for a separate top+bottom.\n3. USER REQUESTS: If the user mentions a specific item, category, color, or type (e.g. "I want to wear a dress", "use my red blazer", "I want jeans"), treat that as REQUIRED. The outfit MUST include a matching item.\n4. FRESHNESS: Prefer items marked "last worn: never" or items NOT marked [RECENTLY WORN]. Use recently worn items only if no good alternative exists or the user specifically requests them.\n5. ACCESSORIES: Watches, jewelry, sunglasses, bags etc. are optional complements. They should never replace a main garment.\n6. ACCURACY: When you write your reasoning, refer to items by their EXACT name as listed in the wardrobe. Do NOT make up or alter item names. Double-check that every ID in your itemIds array matches the item you describe in reasoning. This is critical.\n\nBe specific about why pieces work together. Keep it conversational and encouraging.'

    let avoidContext = ''
    if (recentOutfitNames && recentOutfitNames.length > 0) {
      avoidContext = '\n\nIMPORTANT: You have ALREADY suggested these outfits recently, so pick DIFFERENT items and combinations this time:\n- ' + recentOutfitNames.join('\n- ') + '\n\nDo NOT reuse the same core items. Surprise me with a fresh combination!'
    }

    const userPrompt = 'Here is my wardrobe:\n' + itemSummaries + weatherContext + avoidContext + '\n\nToday is ' + today + '.\n\nPut together an outfit for: ' + (occasion || 'a casual day out') + '.\n\nReturn ONLY a JSON object (no markdown, no backticks) with:\n- "outfitName": a fun creative name\n- "itemIds": array of item IDs (the bracketed IDs above) to include\n- "reasoning": 2-3 sentences about why these pieces work together, mentioning weather if relevant and which items you chose because they haven\'t been worn recently\n- "stylingTips": one sentence with a specific styling tip'

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 600,
        temperature: 0.95
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
