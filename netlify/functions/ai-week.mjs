export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' } })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }
  try {
    const { items, person, weather, weekDates, context, existingDays } = await req.json()
    if (!items || items.length < 3) {
      return new Response(JSON.stringify({ error: 'Need at least 3 items to plan a week' }), { status: 400 })
    }
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), { status: 500 })
    }

    const today = new Date().toISOString().split('T')[0]
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const itemSummaries = items.map(i => {
      let line = '[' + i.id + '] ' + i.name + ' (' + i.category
      if (i.accessoryType) line += '/' + i.accessoryType
      line += ', ' + i.color + ', ' + (i.style || 'Casual')
      if (i.seasons && i.seasons.length > 0) line += ', seasons: ' + i.seasons.join('/')
      if (i.dateAdded && i.dateAdded >= oneMonthAgo) line += ', NEW ADDITION'
      if (i.lastWorn && i.lastWorn >= twoWeeksAgo) line += ', RECENTLY WORN'
      line += ')'
      return line
    }).join('\n')

    let weatherContext = ''
    if (weather && weather.length > 0) {
      weatherContext = '\n\nWeather forecast for the week:\n' + weather.map(w =>
        w.day + ' (' + w.date + '): High ' + w.high + 'F, Low ' + w.low + 'F - ' + w.description
      ).join('\n')
    }

    let existingContext = ''
    if (existingDays && existingDays.length > 0) {
      existingContext = '\n\nIMPORTANT - These days already have outfits assigned. Do NOT generate outfits for them, skip them entirely:\n'
      existingDays.forEach(d => {
        existingContext += '- ' + d.day + ': ' + d.outfitName + ' (items: ' + d.itemNames.join(', ') + ')\n'
      })
      existingContext += '\nAlso try to avoid repeating the same core pieces used in those existing outfits.'
    }

    let userContext = ''
    if (context) {
      userContext = '\n\nUser context for this week: ' + context
    }

    // Figure out which days need outfits
    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const existingDayNames = (existingDays || []).map(d => d.day)
    const daysToFill = daysOfWeek.filter(d => !existingDayNames.includes(d))

    if (daysToFill.length === 0) {
      return new Response(JSON.stringify({ error: 'All days already have outfits' }), { status: 400 })
    }

    const systemPrompt = `You are a talented personal stylist planning ${person || 'the user'}'s outfits for the week. You create complete, coordinated outfits that work together as a weekly wardrobe.

OUTFIT COMPLETENESS (NON-NEGOTIABLE for each day):
- Every outfit MUST have: (1) a Top + Bottom, OR a Dress, (2) Shoes. No exceptions.
- Accessories are optional extras, never substitutes for core pieces.
- NEVER suggest an outfit missing shoes, or a top without bottoms.

LAYERING RULES (VERY IMPORTANT):
- Cardigans, sweaters, jackets, blazers, and any open-front or layering piece from Outerwear MUST be paired with a base layer top underneath (a t-shirt, tank, cami, blouse, etc. from the Tops category).
- NEVER suggest a cardigan or sweater as the ONLY top. Always include something to wear under it.
- If the wardrobe has a suitable undershirt, tee, or tank, include it in the outfit alongside the layering piece.
- The only exception is a thick, closed crewneck/turtleneck sweater that is clearly worn alone as a top.

NEW ADDITIONS:
- Items marked NEW ADDITION were recently added to the wardrobe. Actively work them into the weekly plan! The user added them because they want to wear them.
- Try to feature new items at least once during the week.

PATTERN AND COLOR MATCHING (VERY IMPORTANT):
- NEVER pair two busy patterns together (polka dots + stripes, floral + plaid, etc.). One pattern max per outfit, with solids that complement it.
- If a piece has a bold pattern, pair it with SOLID pieces in a color pulled from the pattern.
- NO red + pink, orange + red, red + bright green, or neon + neon combos.
- Safe formula: 1 statement/patterned piece + neutrals, OR 2 complementary colors + 1 neutral.
- When in doubt, pair bold colors with neutrals (black, white, cream, gray, navy, tan, denim).

WEEKLY PLANNING INTELLIGENCE:
- VARIETY IS KEY: Don't repeat the same top, bottom, or shoes on consecutive days. Spread items across the week.
- COLOR STORY: Create a cohesive weekly palette. Mix statement pieces with basics. Not every day needs to pop. Each outfit should be color-coordinated on its own.
- LIFESTYLE FIT: Weekdays can lean more polished/practical. Weekends can be more relaxed or fun.
- WEATHER AWARE: Match layers and fabrics to the daily forecast. Heavier outfits for cold days, lighter for warm.
- SEASON AWARE: If items have season tags, prefer items that match the current season.
- RECENTLY WORN: Items marked RECENTLY WORN should be deprioritized unless the wardrobe is small.
- USE THE FULL WARDROBE: Don't just pick favorites. Dig into underused pieces.

FINAL CHECKLIST (DO THIS FOR EVERY DAY BEFORE RESPONDING):
Before outputting each day's outfit, verify:
1. Does it have a Top (from Tops category)? If not, ADD ONE.
2. Does it have a Bottom (from Bottoms category) OR a Dress? If not, ADD ONE.
3. Does it have Shoes? If not, ADD SHOES.
4. If there's a cardigan/sweater/jacket, is there ALSO a base layer top? If not, ADD ONE.
5. Any clashing patterns (two busy prints)? SWAP one for a solid.
6. Any clashing colors (red+pink, orange+red)? SWAP one piece.
An outfit missing bottoms or shoes is NEVER acceptable. Fix before responding.

ACCURACY:
- Use exact item names and IDs from the wardrobe. Never invent items.
- Double-check every itemIds array matches the items you describe.`

    const userPrompt = `Here is the full wardrobe:\n${itemSummaries}${weatherContext}${existingContext}${userContext}

Plan COMPLETE outfits for these days: ${daysToFill.join(', ')}

${weekDates ? 'Week of: ' + weekDates : ''}

Return ONLY a JSON array (no markdown, no backticks). Each element:
{"day":"Monday","outfitName":"creative name","itemIds":["id1","id2","id3"],"reasoning":"1-2 sentences on why this works for the day. Use item NAMES, not IDs."}

Return the array for ${daysToFill.length} day${daysToFill.length > 1 ? 's' : ''} only. Remember every outfit needs top+bottom (or dress) AND shoes.`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        max_tokens: 2000,
        temperature: 0.9
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
    console.error('AI week plan error:', e)
    return new Response(JSON.stringify({ error: 'Failed to plan week: ' + e.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  }
}
export const config = { path: '/api/ai-week' }
