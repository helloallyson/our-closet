export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' } })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }
  try {
    const { items, occasion, person, weather, recentOutfitNames, anchorItemIds, photoDescription } = await req.json()
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
      line += ', ' + i.color
      if (i.lastWorn && i.lastWorn >= twoWeeksAgo) line += ', RECENT'
      if (anchorItemIds && anchorItemIds.includes(i.id)) line += ', MUST INCLUDE'
      line += ')'
      return line
    }).join('\n')

    let weatherContext = ''
    if (weather) {
      weatherContext = '\n\nCurrent weather in ' + weather.location + ': ' + weather.temp + ' F (feels like ' + weather.feelsLike + ' F), ' + weather.description + '. Wind: ' + weather.wind + ' mph.'
    }

    let avoidContext = ''
    if (recentOutfitNames && recentOutfitNames.length > 0) {
      avoidContext = '\n\nCRITICAL - DO NOT REPEAT: These outfits have already been created. You MUST pick DIFFERENT core items (different top, different bottom or dress, different shoes). Do not just swap one accessory and call it new. Create a genuinely fresh outfit:\n- ' + recentOutfitNames.slice(0, 15).join('\n- ') + '\n\nIf the same prompt is given twice, you should use completely different pieces from the wardrobe.'
    }

    let photoContext = ''
    if (photoDescription) {
      photoContext = '\n\nThe user uploaded a photo of an item they want to match with. Here is what the photo shows: ' + photoDescription + '\nBuild an outfit from their existing wardrobe that would complement or go well with this item in the photo.'
    }

    let anchorContext = ''
    if (anchorItemIds && anchorItemIds.length > 0) {
      const anchorNames = anchorItemIds.map(id => { const it = items.find(i => i.id === id); return it ? it.name + ' (ID: ' + id + ')' : id }).join(', ')
      anchorContext = '\n\nThe user specifically wants to wear these items: ' + anchorNames + '. ALL of these MUST be included in the outfit. Build the rest around them.'
    }

    const systemPrompt = `Personal stylist for ${person || 'the user'}. Build outfits from their wardrobe.

STYLE: Use color theory (complementary colors, monochrome). Balance proportions (fitted+relaxed). Match shoe energy to outfit vibe. Accessories only when they elevate the look. Keep style cohesive.

RULES:
1. Start with main garment (Top+Bottom or Dress), add shoes, then optional accessories.
2. Items marked MUST INCLUDE go in the outfit.
3. Avoid items marked RECENT. Prefer variety.
4. Use EXACT item names and IDs from the list.
5. If user asks for a dress/jeans/specific item, include it.

Be fashionable, specific, encouraging.`

    const userPrompt = 'Wardrobe:\n' + itemSummaries + weatherContext + photoContext + anchorContext + avoidContext + '\n\nOutfit for: ' + (occasion || 'a casual day out') + '\n\nReturn ONLY JSON (no markdown):\n{"outfitName":"...","itemIds":["..."],"reasoning":"2-3 sentences using item NAMES only. NEVER include item IDs in the reasoning or styling tips - just use the human-readable names.","stylingTips":"one actionable tip"}'

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        max_tokens: 400,
        temperature: 0.95
      })
    })
    const data = await response.json()
    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }
    const text = data.choices[0].message.content || ''
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return new Response(JSON.stringify(parsed), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  } catch (e) {
    console.error('AI outfit error:', e)
    return new Response(JSON.stringify({ error: 'Failed to generate outfit' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  }
}
export const config = { path: '/api/ai-outfit' }
