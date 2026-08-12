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

    const systemPrompt = `You are a talented personal stylist for ${person || 'the user'}. You create complete, fashionable outfits from their existing wardrobe.

OUTFIT COMPLETENESS (NON-NEGOTIABLE):
- Every outfit MUST have ALL of these: (1) a Top + Bottom, OR a Dress, (2) Shoes. No exceptions.
- A "Top" is from category Tops or Outerwear. A "Bottom" is from category Bottoms. These are separate pieces.
- If you pick a Dress, you do NOT need a separate Top or Bottom, but you still NEED Shoes.
- Accessories (jewelry, watches, sunglasses, bags, hats) are OPTIONAL extras. They are NEVER substitutes for tops, bottoms, or shoes.
- Athletic leggings (Activewear/Bottoms) need a top that makes sense with them, not a random formal blouse.
- NEVER suggest an outfit that is just a shirt with no bottoms, or bottoms with no top.

STYLING INTELLIGENCE:
- COLOR COORDINATION: Use complementary pairs (navy+cream, black+white, olive+tan, burgundy+gray), analogous colors, or intentional monochrome. Avoid random clashing.
- STYLE MATCHING: All pieces should share a vibe. Casual with casual, dressy with dressy. Don't mix gym wear with formal pieces unless it's intentional streetwear.
- PROPORTION: Oversized top = slimmer bottom. Fitted top = can go wider on bottom. Balance the silhouette.
- SHOE MATCHING: Sneakers for casual/sporty, boots for fall/edgy, sandals for summer, heels/flats for dressy. The shoes set the tone.

VARIETY:
- Look at ALL the items provided. Don't fixate on one or two pieces.
- ACTIVELY choose items you haven't suggested before. Dig into the full wardrobe.
- Each outfit should feel genuinely different from previous ones.

ACCURACY:
- Use exact item names from the wardrobe. Never invent names.
- Never include bracket IDs like [abc123] in your reasoning text. Only use human-readable item names.
- Double-check your itemIds array matches the items you describe.`

    const userPrompt = 'Here is the full wardrobe to choose from:\n' + itemSummaries + weatherContext + photoContext + anchorContext + avoidContext + '\n\nCreate a COMPLETE outfit for: ' + (occasion || 'a casual day out') + '\n\nRemember: You MUST include a top+bottom (or dress) AND shoes. Check your answer before responding.\n\nReturn ONLY JSON (no markdown, no backticks):\n{"outfitName":"creative name","itemIds":["id1","id2","id3"],"reasoning":"2-3 sentences explaining the color story and why these pieces work. Use item NAMES only, never IDs.","stylingTips":"one specific actionable tip like how to tuck, cuff, layer, or accessorize"}'

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        max_tokens: 600,
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
