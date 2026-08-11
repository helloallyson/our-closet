export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' } })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }
  try {
    const { imageBase64, mediaType } = await req.json()
    if (!imageBase64) { return new Response(JSON.stringify({ error: 'No image' }), { status: 400 }) }
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) { return new Response(JSON.stringify({ error: 'No API key' }), { status: 500 }) }
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: 'data:' + (mediaType || 'image/jpeg') + ';base64,' + imageBase64 } },
          { type: 'text', text: 'You are a fashion assistant. Analyze this clothing item photo and return ONLY a JSON object (no markdown, no backticks, no explanation) with these fields:\n- "name": short descriptive name (e.g. "Black V-Neck Tee", "Gold Hoop Earrings")\n- "category": one of [Tops, Bottoms, Dresses, Outerwear, Shoes, Accessories, Activewear, Swimwear, Sleepwear, Other]\n- "accessoryType": ONLY if category is Accessories, one of [Sunglasses, Necklace, Earrings, Bracelet, Ring, Watch, Hat, Belt, Bag, Scarf, Hair Accessory, Tie, Other Accessory]. Omit if not an accessory.\n- "color": primary color, one of [Black, White, Gray, Navy, Blue, Red, Pink, Green, Brown, Tan, Orange, Yellow, Purple, Gold, Silver, Rose Gold, Multi, Other]\n- "style": one of [Casual, Formal, Business, Sporty, Bohemian, Streetwear, Classic, Trendy, Vintage, Loungewear]\n- "seasons": array from [Spring, Summer, Fall, Winter, All-Season]\n- "tags": array of 3-5 tags\n- "description": one sentence describing the item\n\nReturn ONLY the JSON object.' }
        ] }],
        max_tokens: 500, temperature: 0.3
      })
    })
    const data = await response.json()
    if (data.error) { return new Response(JSON.stringify({ error: data.error.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }) }
    const text = data.choices?.[0]?.message?.content || ''
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return new Response(JSON.stringify(parsed), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  } catch (e) {
    console.error('AI tag error:', e)
    return new Response(JSON.stringify({ error: 'Failed to analyze' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  }
}
export const config = { path: '/api/ai-tag' }
