import { useState, useEffect, useRef } from 'react'
import { removeBackground } from '@imgly/background-removal'
import {
  loadItems as fbLoadItems,
  saveItem as fbSaveItem,
  deleteItem as fbDeleteItem,
  loadOutfits as fbLoadOutfits,
  saveOutfit as fbSaveOutfit,
  deleteOutfit as fbDeleteOutfit
} from './firebase'

const CATEGORIES = ['All', 'Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes', 'Accessories', 'Activewear', 'Swimwear', 'Sleepwear', 'Other']
const COLORS = ['Black', 'White', 'Gray', 'Navy', 'Blue', 'Red', 'Pink', 'Green', 'Brown', 'Tan', 'Orange', 'Yellow', 'Purple', 'Multi', 'Other']
const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter', 'All-Season']
const STYLES = ['Casual', 'Formal', 'Business', 'Sporty', 'Bohemian', 'Streetwear', 'Classic', 'Trendy', 'Vintage', 'Loungewear']

function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }

function compressImage(dataUrl, maxWidth = 500) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1)
      canvas.width = img.width * ratio
      canvas.height = img.height * ratio
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.src = dataUrl
  })
}

async function removeBg(dataUrl) {
  try {
    const blob = await removeBackground(dataUrl)
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
  } catch (e) { console.error('Background removal failed:', e); return dataUrl }
}

async function aiTagClothing(imageBase64) {
  try {
    const base64Data = imageBase64.split(',')[1]
    const mediaType = imageBase64.includes('image/png') ? 'image/png' : 'image/jpeg'
    const res = await fetch('/api/ai-tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64Data, mediaType })
    })
    if (!res.ok) throw new Error('AI tag request failed')
    return await res.json()
  } catch (e) { console.error('AI tag error:', e); return null }
}

async function aiSuggestOutfit(items, occasion, person) {
  try {
    const res = await fetch('/api/ai-outfit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(i => ({ id: i.id, name: i.name, category: i.category, color: i.color, style: i.style })),
        occasion, person
      })
    })
    if (!res.ok) throw new Error('AI outfit request failed')
    return await res.json()
  } catch (e) { console.error('AI outfit error:', e); return null }
}

function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t) }, [onDone])
  return <div className="toast">{message}</div>
}

function PersonSwitcher({ person, setPerson }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: '#f0eee9', borderRadius: 10, padding: 3 }}>
      {['ally', 'gerry'].map(p => (
        <button key={p} onClick={() => setPerson(p)} style={{
          flex: 1, padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer',
          fontWeight: 600, fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase',
          background: person === p ? '#2d2926' : 'transparent',
          color: person === p ? '#fff' : '#8a857e', transition: 'all 0.2s'
        }}>{p === 'ally' ? "Ally's Closet" : "Gerry's Closet"}</button>
      ))}
    </div>
  )
}

function NavTabs({ tab, setTab, itemCount }) {
  const tabs = [
    { id: 'closet', label: 'Closet', icon: '\u{1F457}' },
    { id: 'add', label: 'Add', icon: '\u{1F4F8}' },
    { id: 'outfits', label: 'Outfits', icon: '\u2728' },
  ]
  return (
    <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #f0eee9', marginBottom: 16 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          flex: 1, padding: '12px 8px', border: 'none',
          borderBottom: tab === t.id ? '2px solid #2d2926' : '2px solid transparent',
          background: 'none', cursor: 'pointer', fontSize: 14,
          fontWeight: tab === t.id ? 700 : 400,
          color: tab === t.id ? '#2d2926' : '#a09a93',
          marginBottom: -2, transition: 'all 0.15s'
        }}>{t.icon} {t.label}{t.id === 'closet' ? ` (${itemCount})` : ''}</button>
      ))}
    </div>
  )
}

function CategoryFilter({ selected, onSelect }) {
  return (
    <div className="filter-strip" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 12 }}>
      {CATEGORIES.map(c => (
        <button key={c} onClick={() => onSelect(c)} style={{
          padding: '6px 14px', border: '1px solid ' + (selected === c ? '#2d2926' : '#e0ddd7'),
          borderRadius: 20, background: selected === c ? '#2d2926' : '#fff',
          color: selected === c ? '#fff' : '#6b665f', fontSize: 12, fontWeight: 500,
          cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s'
        }}>{c}</button>
      ))}
    </div>
  )
}

// ── Shared form fields component ──
function ItemForm({ form, setForm, tagInput, setTagInput, addTag, ls, is, ss }) {
  const toggleSeason = (s) => {
    setForm(f => ({ ...f, seasons: f.seasons.includes(s) ? f.seasons.filter(x => x !== s) : [...f.seasons, s] }))
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={ls}>Name</label>
        <input style={is} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Black V-Neck Tee" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={ls}>Category</label>
          <select style={ss} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={ls}>Color</label>
          <select style={ss} value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}>
            {COLORS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label style={ls}>Style</label>
        <select style={ss} value={form.style} onChange={e => setForm(f => ({ ...f, style: e.target.value }))}>
          {STYLES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label style={ls}>Seasons</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SEASONS.map(s => (
            <button key={s} onClick={() => toggleSeason(s)} style={{
              padding: '6px 14px', border: '1px solid ' + (form.seasons.includes(s) ? '#2d2926' : '#e0ddd7'),
              borderRadius: 20, background: form.seasons.includes(s) ? '#2d2926' : '#fff',
              color: form.seasons.includes(s) ? '#fff' : '#6b665f', fontSize: 12, cursor: 'pointer'
            }}>{s}</button>
          ))}
        </div>
      </div>
      <div>
        <label style={ls}>Tags</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {form.tags.map((t, i) => (
            <span key={i} onClick={() => setForm(f => ({ ...f, tags: f.tags.filter((_, j) => j !== i) }))}
              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12, background: '#f0eee9', color: '#2d2926', cursor: 'pointer' }}>
              {t} x
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...is, flex: 1 }} value={tagInput} onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="Add a tag..." />
          <button onClick={addTag} style={{
            padding: '10px 16px', border: 'none', borderRadius: 8, background: '#e0ddd7',
            color: '#2d2926', fontWeight: 600, cursor: 'pointer', fontSize: 13
          }}>+</button>
        </div>
      </div>
      <div>
        <label style={ls}>Notes</label>
        <input style={is} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional notes..." />
      </div>
    </div>
  )
}

function ClothingCard({ item, onTap, onDelete }) {
  const [showMenu, setShowMenu] = useState(false)
  return (
    <div onClick={() => onTap?.(item)} style={{
      borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
      position: 'relative', border: '2px solid #f0eee9',
      background: '#faf9f7', transition: 'all 0.15s'
    }}>
      {onDelete && (
        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2 }}>
          <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }} style={{
            width: 26, height: 26, borderRadius: 13, background: 'rgba(255,255,255,0.85)',
            border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b665f'
          }}>...</button>
          {showMenu && (
            <div style={{ position: 'absolute', top: 30, left: 0, background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden', zIndex: 10 }}>
              <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); setShowMenu(false) }} style={{
                display: 'block', padding: '10px 20px', border: 'none', background: 'none',
                color: '#c44', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap'
              }}>Delete Item</button>
            </div>
          )}
        </div>
      )}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
        <div style={{
          background: 'rgba(255,255,255,0.85)', borderRadius: 10, padding: '3px 8px',
          fontSize: 10, color: '#6b665f', fontWeight: 500
        }}>Tap to edit</div>
      </div>
      <div style={{ width: '100%', aspectRatio: '3/4', overflow: 'hidden', background: '#eeedea' }}>
        {item.image ? (
          <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>👕</div>
        )}
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#2d2926', marginBottom: 2, lineHeight: 1.3 }}>{item.name}</div>
        <div style={{ fontSize: 11, color: '#a09a93' }}>{item.category} · {item.color}</div>
        {item.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {item.tags.slice(0, 3).map((t, i) => (
              <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#f0eee9', color: '#6b665f' }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Edit Item View ──
function EditItemView({ item, person, onSave, onCancel, onDelete }) {
  const [image, setImage] = useState(item.image || null)
  const [saving, setSaving] = useState(false)
  const [retagging, setRetagging] = useState(false)
  const [form, setForm] = useState({
    name: item.name || '', category: item.category || 'Other', color: item.color || 'Other',
    style: item.style || 'Casual', seasons: item.seasons || ['All-Season'],
    tags: item.tags || [], description: item.description || ''
  })
  const [tagInput, setTagInput] = useState('')
  const fileRef = useRef()

  const addTag = () => {
    if (tagInput.trim() && !form.tags.includes(tagInput.trim())) {
      setForm(f => ({ ...f, tags: [...f.tags, tagInput.trim()] }))
      setTagInput('')
    }
  }

  const handleNewPhoto = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const compressed = await compressImage(reader.result)
      setImage(compressed)
    }
    reader.readAsDataURL(file)
  }

  const handleRetag = async () => {
    if (!image) return
    setRetagging(true)
    const tags = await aiTagClothing(image)
    if (tags && !tags.error) {
      setForm({
        name: tags.name || form.name,
        category: tags.category || form.category,
        color: tags.color || form.color,
        style: tags.style || form.style,
        seasons: tags.seasons || form.seasons,
        tags: tags.tags || form.tags,
        description: tags.description || form.description
      })
    }
    setRetagging(false)
  }

  const handleSave = async () => {
    if (!form.name || saving) return
    setSaving(true)
    try {
      const updated = { ...item, ...form, image, person, dateAdded: item.dateAdded }
      await onSave(updated)
    } finally { setSaving(false) }
  }

  const ls = { fontSize: 12, fontWeight: 600, color: '#6b665f', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }
  const is = { width: '100%', padding: '10px 12px', border: '1px solid #e0ddd7', borderRadius: 8, fontSize: 14, color: '#2d2926', background: '#faf9f7', boxSizing: 'border-box' }
  const ss = { ...is, appearance: 'none' }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={onCancel} style={{
          border: 'none', background: 'none', fontSize: 14, color: '#6b665f',
          cursor: 'pointer', fontWeight: 600, padding: '4px 0'
        }}>← Back</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#2d2926' }}>Edit Item</div>
        <button onClick={() => onDelete(item.id)} style={{
          border: 'none', background: 'none', fontSize: 13, color: '#c44',
          cursor: 'pointer', fontWeight: 600
        }}>Delete</button>
      </div>

      {/* Image */}
      <div style={{
        borderRadius: 16, overflow: 'hidden', marginBottom: 16, background: '#f5f5f5',
        position: 'relative'
      }}>
        {image ? (
          <img src={image} alt={form.name} style={{ width: '100%', maxHeight: 280, objectFit: 'contain' }} />
        ) : (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>👕</div>
        )}
        {retagging && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px',
            background: 'rgba(45,41,38,0.85)', color: '#fff', fontSize: 13, textAlign: 'center'
          }}><span className="spinner" /> Re-analyzing with AI...</div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => fileRef.current?.click()} style={{
          flex: 1, padding: '10px', border: '1px solid #e0ddd7', borderRadius: 8,
          background: '#fff', fontSize: 13, fontWeight: 600, color: '#2d2926', cursor: 'pointer'
        }}>📸 New Photo</button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleNewPhoto} style={{ display: 'none' }} />
        <button onClick={handleRetag} disabled={!image || retagging} style={{
          flex: 1, padding: '10px', border: '1px solid #e0ddd7', borderRadius: 8,
          background: '#fff', fontSize: 13, fontWeight: 600,
          color: !image || retagging ? '#a09a93' : '#2d2926', cursor: 'pointer'
        }}>✨ Re-tag with AI</button>
      </div>

      {/* Form */}
      <ItemForm form={form} setForm={setForm} tagInput={tagInput} setTagInput={setTagInput} addTag={addTag} ls={ls} is={is} ss={ss} />

      {/* Save */}
      <button onClick={handleSave} disabled={!form.name || saving} style={{
        width: '100%', padding: '14px 24px', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15,
        cursor: form.name && !saving ? 'pointer' : 'default', marginTop: 16,
        background: form.name && !saving ? '#2d2926' : '#e0ddd7',
        color: form.name && !saving ? '#fff' : '#a09a93', transition: 'all 0.2s'
      }}>{saving ? 'Saving...' : 'Save Changes'}</button>
    </div>
  )
}

// ── Add Item View ──
function AddItemView({ person, onAdd }) {
  const [image, setImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removeBgEnabled, setRemoveBgEnabled] = useState(true)
  const [statusMsg, setStatusMsg] = useState('')
  const [form, setForm] = useState({
    name: '', category: 'Tops', color: 'Black', style: 'Casual',
    seasons: ['All-Season'], tags: [], description: ''
  })
  const [tagInput, setTagInput] = useState('')
  const [aiDone, setAiDone] = useState(false)
  const fileRef = useRef()

  const addTag = () => {
    if (tagInput.trim() && !form.tags.includes(tagInput.trim())) {
      setForm(f => ({ ...f, tags: [...f.tags, tagInput.trim()] }))
      setTagInput('')
    }
  }

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      setLoading(true); setAiDone(false)
      setStatusMsg('Compressing image...')
      let processed = await compressImage(reader.result)
      setImage(processed)
      if (removeBgEnabled) {
        setStatusMsg('Removing background...')
        processed = await removeBg(processed)
        setImage(processed)
      }
      setStatusMsg('AI is analyzing your clothing...')
      const tags = await aiTagClothing(processed)
      if (tags && !tags.error) {
        setForm({
          name: tags.name || '', category: tags.category || 'Other', color: tags.color || 'Other',
          style: tags.style || 'Casual', seasons: tags.seasons || ['All-Season'],
          tags: tags.tags || [], description: tags.description || ''
        })
        setAiDone(true)
      }
      setStatusMsg(''); setLoading(false)
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!form.name || saving) return
    setSaving(true)
    try {
      await onAdd({ id: generateId(), ...form, image, person, dateAdded: new Date().toISOString() })
      setImage(null)
      setForm({ name: '', category: 'Tops', color: 'Black', style: 'Casual', seasons: ['All-Season'], tags: [], description: '' })
      setAiDone(false)
      if (fileRef.current) fileRef.current.value = ''
    } finally { setSaving(false) }
  }

  const ls = { fontSize: 12, fontWeight: 600, color: '#6b665f', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }
  const is = { width: '100%', padding: '10px 12px', border: '1px solid #e0ddd7', borderRadius: 8, fontSize: 14, color: '#2d2926', background: '#faf9f7', boxSizing: 'border-box' }
  const ss = { ...is, appearance: 'none' }

  return (
    <div>
      {/* Remove BG Toggle */}
      <div onClick={() => setRemoveBgEnabled(!removeBgEnabled)} style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        background: removeBgEnabled ? '#f0f7f0' : '#f5f5f5', borderRadius: 10,
        marginBottom: 14, cursor: 'pointer', border: '1px solid ' + (removeBgEnabled ? '#c8e6c9' : '#e0ddd7')
      }}>
        <div style={{
          width: 40, height: 22, borderRadius: 11, padding: 2,
          background: removeBgEnabled ? '#4caf50' : '#ccc', transition: 'all 0.2s'
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: 9, background: '#fff',
            transform: removeBgEnabled ? 'translateX(18px)' : 'translateX(0)',
            transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
          }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#2d2926' }}>Auto-remove background</div>
          <div style={{ fontSize: 11, color: '#a09a93' }}>Clean cutout of your clothing item</div>
        </div>
      </div>

      {/* Upload Zone */}
      <div onClick={() => fileRef.current?.click()} style={{
        border: '2px dashed #d5d0c9', borderRadius: 16, padding: image ? 0 : 40,
        textAlign: 'center', cursor: 'pointer', background: image ? '#f5f5f5' : '#faf9f7',
        overflow: 'hidden', marginBottom: 20, position: 'relative'
      }}>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
        {image ? (
          <div style={{ position: 'relative' }}>
            <img src={image} alt="Preview" style={{ width: '100%', maxHeight: 300, objectFit: 'contain' }} />
            {loading && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px',
                background: 'rgba(45,41,38,0.85)', color: '#fff', fontSize: 13, textAlign: 'center'
              }}><span className="spinner" /> {statusMsg}</div>
            )}
            {aiDone && !loading && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px',
                background: 'rgba(45,120,80,0.9)', color: '#fff', fontSize: 13, textAlign: 'center'
              }}>✓ Auto-tagged! Review the details below.</div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📸</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#2d2926' }}>Tap to snap or upload</div>
            <div style={{ fontSize: 12, color: '#a09a93', marginTop: 4 }}>AI will auto-tag your item</div>
          </div>
        )}
      </div>

      {/* Form */}
      <ItemForm form={form} setForm={setForm} tagInput={tagInput} setTagInput={setTagInput} addTag={addTag} ls={ls} is={is} ss={ss} />

      <button onClick={handleSave} disabled={!form.name || saving} style={{
        width: '100%', padding: '14px 24px', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15,
        cursor: form.name && !saving ? 'pointer' : 'default', marginTop: 16,
        background: form.name && !saving ? '#2d2926' : '#e0ddd7',
        color: form.name && !saving ? '#fff' : '#a09a93', transition: 'all 0.2s'
      }}>{saving ? 'Saving...' : `Add to ${person === 'ally' ? "Ally's" : "Gerry's"} Closet`}</button>
    </div>
  )
}

// ── Outfit View ──
function OutfitView({ items, person, outfits, onSaveOutfit, onDeleteOutfit }) {
  const [selected, setSelected] = useState([])
  const [occasion, setOccasion] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestion, setSuggestion] = useState(null)
  const [filter, setFilter] = useState('All')

  const toggleItem = (item) => {
    setSelected(s => s.find(i => i.id === item.id) ? s.filter(i => i.id !== item.id) : [...s, item])
  }

  const handleAiSuggest = async () => {
    if (items.length < 2) return
    setLoading(true); setSuggestion(null)
    const result = await aiSuggestOutfit(items, occasion, person === 'ally' ? 'Ally' : 'Gerry')
    if (result && !result.error) {
      setSuggestion(result)
      setSelected(result.itemIds?.map(id => items.find(i => i.id === id)).filter(Boolean) || [])
    }
    setLoading(false)
  }

  const handleSave = async () => {
    if (selected.length < 2) return
    await onSaveOutfit({
      id: generateId(), name: suggestion?.outfitName || `Outfit ${outfits.length + 1}`,
      itemIds: selected.map(i => i.id), occasion, notes: suggestion?.reasoning || '',
      person, dateCreated: new Date().toISOString()
    })
    setSelected([]); setSuggestion(null); setOccasion('')
  }

  const filtered = filter === 'All' ? items : items.filter(i => i.category === filter)

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #2d2926 0%, #4a443d 100%)', borderRadius: 14,
        padding: 20, marginBottom: 20, color: '#fff'
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>✨ AI Outfit Builder</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 14 }}>Tell me the vibe and I'll pull an outfit together</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={occasion} onChange={e => setOccasion(e.target.value)}
            placeholder="e.g. date night, casual brunch..."
            onKeyDown={e => e.key === 'Enter' && handleAiSuggest()}
            style={{
              flex: 1, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8, background: 'rgba(255,255,255,0.1)', color: '#fff',
              fontSize: 14, outline: 'none'
            }} />
          <button onClick={handleAiSuggest} disabled={loading || items.length < 2} style={{
            padding: '10px 18px', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13,
            cursor: loading ? 'default' : 'pointer',
            background: loading ? '#6b665f' : '#fff', color: '#2d2926'
          }}>{loading ? 'Styling...' : 'Style Me'}</button>
        </div>
        {items.length < 2 && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>Add at least 2 items first!</div>}
      </div>

      {suggestion && (
        <div style={{ background: '#f7f6f3', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid #e0ddd7' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#2d2926', marginBottom: 4 }}>✨ {suggestion.outfitName}</div>
          <div style={{ fontSize: 13, color: '#6b665f', lineHeight: 1.5, marginBottom: 8 }}>{suggestion.reasoning}</div>
          {suggestion.stylingTips && <div style={{ fontSize: 12, color: '#a09a93', fontStyle: 'italic' }}>💡 {suggestion.stylingTips}</div>}
        </div>
      )}

      <div style={{ fontSize: 14, fontWeight: 700, color: '#2d2926', marginBottom: 10 }}>
        {selected.length > 0 ? `Selected: ${selected.length} items` : 'Or pick items manually:'}
      </div>
      <CategoryFilter selected={filter} onSelect={setFilter} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {filtered.map(item => (
          <div key={item.id} onClick={() => toggleItem(item)} style={{
            borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
            border: selected.find(s => s.id === item.id) ? '2px solid #2d2926' : '2px solid #f0eee9',
            position: 'relative'
          }}>
            {selected.find(s => s.id === item.id) && (
              <div style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, background: '#2d2926', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, zIndex: 2 }}>✓</div>
            )}
            <div style={{ aspectRatio: '1', overflow: 'hidden', background: '#eeedea' }}>
              {item.image ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>👕</div>}
            </div>
            <div style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, color: '#2d2926', lineHeight: 1.2 }}>{item.name}</div>
          </div>
        ))}
      </div>

      {selected.length >= 2 && (
        <button onClick={handleSave} style={{
          width: '100%', padding: '14px', border: 'none', borderRadius: 10, fontWeight: 700,
          fontSize: 14, cursor: 'pointer', background: '#2d2926', color: '#fff', marginBottom: 20
        }}>Save This Outfit</button>
      )}

      {outfits.length > 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#2d2926', marginBottom: 12, borderTop: '2px solid #f0eee9', paddingTop: 16 }}>Saved Outfits</div>
          {outfits.map(outfit => {
            const outfitItems = outfit.itemIds.map(id => items.find(i => i.id === id)).filter(Boolean)
            return (
              <div key={outfit.id} style={{ background: '#faf9f7', borderRadius: 12, padding: 14, marginBottom: 10, border: '1px solid #f0eee9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#2d2926' }}>{outfit.name}</div>
                    {outfit.occasion && <div style={{ fontSize: 11, color: '#a09a93' }}>{outfit.occasion}</div>}
                  </div>
                  <button onClick={() => onDeleteOutfit(outfit.id)} style={{ border: 'none', background: 'none', color: '#c44', fontSize: 12, cursor: 'pointer' }}>Remove</button>
                </div>
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                  {outfitItems.map(item => (
                    <div key={item.id} style={{ width: 60, height: 60, borderRadius: 8, overflow: 'hidden', background: '#eeedea', flexShrink: 0 }}>
                      {item.image ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>👕</div>}
                    </div>
                  ))}
                </div>
                {outfit.notes && <div style={{ fontSize: 12, color: '#6b665f', marginTop: 8, lineHeight: 1.4 }}>{outfit.notes}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main App ──
export default function App() {
  const [person, setPerson] = useState('ally')
  const [tab, setTab] = useState('closet')
  const [items, setItems] = useState([])
  const [outfits, setOutfits] = useState([])
  const [filter, setFilter] = useState('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [editingItem, setEditingItem] = useState(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([fbLoadItems(person), fbLoadOutfits(person)])
      .then(([i, o]) => { setItems(i); setOutfits(o); setLoading(false) })
      .catch(() => setLoading(false))
  }, [person])

  const showToast = (msg) => setToast(msg)

  const addItem = async (item) => {
    try { await fbSaveItem(item); setItems(prev => [item, ...prev]); setTab('closet'); showToast('Item added!') }
    catch (e) { showToast('Failed to save item') }
  }

  const updateItem = async (item) => {
    try {
      await fbSaveItem(item)
      setItems(prev => prev.map(i => i.id === item.id ? item : i))
      setEditingItem(null)
      showToast('Item updated!')
    } catch (e) { showToast('Failed to update item') }
  }

  const handleDeleteItem = async (id) => {
    try { await fbDeleteItem(id, person); setItems(prev => prev.filter(i => i.id !== id)); setEditingItem(null); showToast('Item removed') }
    catch (e) { showToast('Failed to delete') }
  }

  const handleSaveOutfit = async (outfit) => {
    try { await fbSaveOutfit(outfit); setOutfits(prev => [outfit, ...prev]); showToast('Outfit saved!') }
    catch (e) { showToast('Failed to save outfit') }
  }

  const handleDeleteOutfit = async (id) => {
    try { await fbDeleteOutfit(id); setOutfits(prev => prev.filter(o => o.id !== id)); showToast('Outfit removed') }
    catch (e) { showToast('Failed to delete') }
  }

  const filtered = items.filter(i => {
    const catMatch = filter === 'All' || i.category === filter
    const searchMatch = !searchTerm || i.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.tags?.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
    return catMatch && searchMatch
  })

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 80px', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#2d2926', letterSpacing: -0.5 }}>OUR CLOSET</div>
        <div style={{ fontSize: 11, color: '#a09a93', letterSpacing: 2, textTransform: 'uppercase' }}>wardrobe manager</div>
      </div>

      {!editingItem && (
        <>
          <PersonSwitcher person={person} setPerson={(p) => { setPerson(p); setFilter('All'); setSearchTerm('') }} />
          <div style={{ marginTop: 16 }}><NavTabs tab={tab} setTab={setTab} itemCount={items.length} /></div>
        </>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#a09a93' }}>
          <span className="spinner" style={{ borderColor: 'rgba(160,154,147,0.3)', borderTopColor: '#a09a93' }} />
          <div style={{ marginTop: 12 }}>Loading closet...</div>
        </div>
      ) : editingItem ? (
        <EditItemView
          item={editingItem}
          person={person}
          onSave={updateItem}
          onCancel={() => setEditingItem(null)}
          onDelete={handleDeleteItem}
        />
      ) : (
        <>
          {tab === 'closet' && (
            <div>
              {items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>👗</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#2d2926', marginBottom: 4 }}>
                    {person === 'ally' ? "Ally's" : "Gerry's"} closet is empty
                  </div>
                  <div style={{ fontSize: 13, color: '#a09a93', marginBottom: 16 }}>Start adding clothes to build the wardrobe</div>
                  <button onClick={() => setTab('add')} style={{
                    padding: '12px 24px', border: 'none', borderRadius: 10, background: '#2d2926',
                    color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer'
                  }}>Add First Item</button>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search items..."
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid #e0ddd7', borderRadius: 10, fontSize: 14, color: '#2d2926', background: '#faf9f7', boxSizing: 'border-box' }} />
                  </div>
                  <CategoryFilter selected={filter} onSelect={setFilter} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    {filtered.map(item => <ClothingCard key={item.id} item={item} onTap={setEditingItem} onDelete={handleDeleteItem} />)}
                  </div>
                  {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#a09a93', fontSize: 13 }}>No items match that filter</div>}
                </>
              )}
            </div>
          )}
          {tab === 'add' && <AddItemView person={person} onAdd={addItem} />}
          {tab === 'outfits' && <OutfitView items={items} person={person} outfits={outfits} onSaveOutfit={handleSaveOutfit} onDeleteOutfit={handleDeleteOutfit} />}
        </>
      )}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  )
}
