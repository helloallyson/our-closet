import { useState, useEffect, useRef } from 'react'
import { removeBackground } from '@imgly/background-removal'
import {
  loadItems as fbLoadItems, saveItem as fbSaveItem, deleteItem as fbDeleteItem,
  loadOutfits as fbLoadOutfits, saveOutfit as fbSaveOutfit, deleteOutfit as fbDeleteOutfit
} from './firebase'

const CATEGORIES = ['All','Tops','Bottoms','Dresses','Outerwear','Shoes','Accessories','Activewear','Swimwear','Sleepwear','Other']
const ACCESSORY_TYPES = ['Sunglasses','Necklace','Earrings','Bracelet','Ring','Watch','Hat','Belt','Bag','Scarf','Hair Accessory','Tie','Other Accessory']
const COLORS = ['Black','White','Gray','Navy','Blue','Red','Pink','Green','Brown','Tan','Orange','Yellow','Purple','Gold','Silver','Rose Gold','Multi','Other']
const SEASONS = ['Spring','Summer','Fall','Winter','All-Season']
const STYLES = ['Casual','Formal','Business','Sporty','Bohemian','Streetwear','Classic','Trendy','Vintage','Loungewear']
const WEATHER_CODES = {0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Foggy',48:'Icy fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',80:'Light showers',81:'Showers',82:'Heavy showers',95:'Thunderstorm',96:'Thunderstorm with hail'}

function getWeatherIcon(c){if(c===0)return'\u2600\uFE0F';if(c<=2)return'\u26C5';if(c===3)return'\u2601\uFE0F';if(c<=48)return'\uD83C\uDF2B\uFE0F';if(c<=67)return'\uD83C\uDF27\uFE0F';if(c<=77)return'\u2744\uFE0F';if(c<=82)return'\uD83C\uDF26\uFE0F';return'\u26C8\uFE0F'}
function genId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}

function compressImage(dataUrl,maxW=500){return new Promise(r=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas');const ratio=Math.min(maxW/img.width,maxW/img.height,1);c.width=img.width*ratio;c.height=img.height*ratio;c.getContext('2d').drawImage(img,0,0,c.width,c.height);r(c.toDataURL('image/jpeg',0.75))};img.src=dataUrl})}

async function removeBg(d){try{const b=await removeBackground(d);return new Promise(r=>{const rd=new FileReader();rd.onload=()=>r(rd.result);rd.readAsDataURL(b)})}catch(e){return d}}

async function fetchWeather(lat,lon){try{const r=await fetch('https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m&temperature_unit=fahrenheit&windspeed_unit=mph');const d=await r.json();const c=d.current;return{temp:Math.round(c.temperature_2m),feelsLike:Math.round(c.apparent_temperature),code:c.weathercode,description:WEATHER_CODES[c.weathercode]||'Unknown',icon:getWeatherIcon(c.weathercode),wind:Math.round(c.windspeed_10m)}}catch(e){return null}}

async function searchCity(q){try{const r=await fetch('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(q)+'&count=5&language=en&format=json');const d=await r.json();return(d.results||[]).map(r=>({name:r.name+', '+(r.admin1||'')+', '+r.country,lat:r.latitude,lon:r.longitude}))}catch(e){return[]}}

async function aiTagClothing(img){try{const b=img.split(',')[1];const m=img.includes('image/png')?'image/png':'image/jpeg';const r=await fetch('/api/ai-tag',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageBase64:b,mediaType:m})});if(!r.ok)throw new Error('fail');return await r.json()}catch(e){return null}}

async function aiSuggestOutfit(items,occasion,person,weather,recentNames,anchorItemIds,photoDescription){
  try{
    // Large wardrobe: send max 40 items to prevent Netlify timeout
    var itemsToSend = items.slice()
    var anchors = anchorItemIds ? itemsToSend.filter(i => anchorItemIds.includes(i.id)) : []
    var rest = itemsToSend.filter(i => !anchorItemIds || !anchorItemIds.includes(i.id))
    // Sort: never worn first, then oldest lastWorn
    rest.sort(function(a, b) {
      if (!a.lastWorn && b.lastWorn) return -1
      if (a.lastWorn && !b.lastWorn) return 1
      return (a.lastWorn || '').localeCompare(b.lastWorn || '')
    })
    itemsToSend = anchors.concat(rest.slice(0, 40 - anchors.length))
    // Keep item descriptions short to save tokens
    const r=await fetch('/api/ai-outfit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      items:itemsToSend.map(i=>({id:i.id,name:i.name,category:i.category,color:i.color,style:i.style||'',accessoryType:i.accessoryType||'',lastWorn:i.lastWorn||''})),
      occasion:occasion||'',person:person||'',weather:weather||null,recentOutfitNames:(recentNames||[]).slice(0,5),anchorItemIds:anchorItemIds||[],photoDescription:photoDescription||null
    })})
    if(!r.ok){console.error('AI outfit response:',r.status);var errText=await r.text().catch(()=>'');return{error:'API returned '+r.status+': '+errText}}
    var data=await r.json()
    if(data.error){console.error('AI outfit error:',data.error);return{error:data.error}}
    return data
  }catch(e){console.error('AI outfit fetch error:',e);return{error:e.message}}
}

// ── Small Components ──
function Toast({message,onDone}){useEffect(()=>{const t=setTimeout(onDone,2500);return()=>clearTimeout(t)},[onDone]);return<div className="toast">{message}</div>}

function PersonSwitcher({person,setPerson}){
  return(<div style={{display:'flex',gap:4,background:'#f0eee9',borderRadius:10,padding:3}}>
    {['ally','gerry'].map(p=>(<button key={p} onClick={()=>setPerson(p)} style={{flex:1,padding:'8px 16px',border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,fontSize:13,letterSpacing:.5,textTransform:'uppercase',background:person===p?'#2d2926':'transparent',color:person===p?'#fff':'#8a857e'}}>{p==='ally'?"Ally's Closet":"Gerry's Closet"}</button>))}
  </div>)
}

function NavTabs({tab,setTab,itemCount,outfitCount}){
  const tabs=[{id:'closet',label:'Closet',icon:'\uD83D\uDC57',count:itemCount},{id:'add',label:'Add',icon:'\uD83D\uDCF8'},{id:'style',label:'Style',icon:'\u2728'},{id:'outfits',label:'Outfits',icon:'\uD83D\uDC5A',count:outfitCount}]
  return(<div style={{display:'flex',gap:2,borderBottom:'2px solid #f0eee9',marginBottom:16}}>
    {tabs.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:'10px 4px',border:'none',borderBottom:tab===t.id?'2px solid #2d2926':'2px solid transparent',background:'none',cursor:'pointer',fontSize:12,fontWeight:tab===t.id?700:400,color:tab===t.id?'#2d2926':'#a09a93',marginBottom:-2}}>{t.icon} {t.label}{t.count!=null?' ('+t.count+')':''}</button>))}
  </div>)
}

function CategoryFilter({selected,onSelect,subFilter,onSubFilter}){
  return(<div>
    <div style={{display:'flex',flexWrap:'wrap',gap:6,paddingBottom:8,marginBottom:selected==='Accessories'?6:12}}>
      {CATEGORIES.map(c=>(<button key={c} onClick={()=>{onSelect(c);if(onSubFilter)onSubFilter('All')}} style={{padding:'6px 14px',border:'1px solid '+(selected===c?'#2d2926':'#e0ddd7'),borderRadius:20,background:selected===c?'#2d2926':'#fff',color:selected===c?'#fff':'#6b665f',fontSize:12,fontWeight:500,cursor:'pointer',whiteSpace:'nowrap'}}>{c}</button>))}
    </div>
    {selected==='Accessories'&&onSubFilter&&(<div style={{display:'flex',flexWrap:'wrap',gap:5,paddingBottom:8,marginBottom:12}}>
      {['All'].concat(ACCESSORY_TYPES).map(at=>(<button key={at} onClick={()=>onSubFilter(at)} style={{padding:'4px 10px',border:'1px solid '+((subFilter||'All')===at?'#8B6914':'#e8e2d4'),borderRadius:16,background:(subFilter||'All')===at?'#8B6914':'#faf8f4',color:(subFilter||'All')===at?'#fff':'#8a857e',fontSize:11,fontWeight:500,cursor:'pointer',whiteSpace:'nowrap'}}>{at}</button>))}
    </div>)}
  </div>)
}

function ItemForm({form,setForm,tagInput,setTagInput,addTag}){
  const ls={fontSize:12,fontWeight:600,color:'#6b665f',marginBottom:4,display:'block',textTransform:'uppercase',letterSpacing:.5}
  const is={width:'100%',padding:'10px 12px',border:'1px solid #e0ddd7',borderRadius:8,fontSize:14,color:'#2d2926',background:'#faf9f7',boxSizing:'border-box'}
  const ss={...is,appearance:'none'}
  const toggleSeason=s=>{setForm(f=>({...f,seasons:f.seasons.includes(s)?f.seasons.filter(x=>x!==s):[...f.seasons,s]}))}
  return(<div style={{display:'flex',flexDirection:'column',gap:14}}>
    <div><label style={ls}>Name</label><input style={is} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Black V-Neck Tee"/></div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
      <div><label style={ls}>Category</label><select style={ss} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{CATEGORIES.filter(c=>c!=='All').map(c=><option key={c}>{c}</option>)}</select></div>
      <div><label style={ls}>Color</label><select style={ss} value={form.color} onChange={e=>setForm(f=>({...f,color:e.target.value}))}>{COLORS.map(c=><option key={c}>{c}</option>)}</select></div>
    </div>
    {form.category==='Accessories'&&(<div><label style={ls}>Accessory Type</label><div style={{display:'flex',flexWrap:'wrap',gap:6}}>{ACCESSORY_TYPES.map(at=>(<button key={at} onClick={()=>setForm(f=>({...f,accessoryType:at}))} style={{padding:'6px 12px',border:'1px solid '+(form.accessoryType===at?'#2d2926':'#e0ddd7'),borderRadius:20,background:form.accessoryType===at?'#2d2926':'#fff',color:form.accessoryType===at?'#fff':'#6b665f',fontSize:11,cursor:'pointer'}}>{at}</button>))}</div></div>)}
    <div><label style={ls}>Style</label><select style={ss} value={form.style} onChange={e=>setForm(f=>({...f,style:e.target.value}))}>{STYLES.map(s=><option key={s}>{s}</option>)}</select></div>
    <div><label style={ls}>Seasons</label><div style={{display:'flex',flexWrap:'wrap',gap:6}}>{SEASONS.map(s=>(<button key={s} onClick={()=>toggleSeason(s)} style={{padding:'6px 14px',border:'1px solid '+(form.seasons.includes(s)?'#2d2926':'#e0ddd7'),borderRadius:20,background:form.seasons.includes(s)?'#2d2926':'#fff',color:form.seasons.includes(s)?'#fff':'#6b665f',fontSize:12,cursor:'pointer'}}>{s}</button>))}</div></div>
    <div><label style={ls}>Tags</label><div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>{form.tags.map((t,i)=>(<span key={i} onClick={()=>setForm(f=>({...f,tags:f.tags.filter((_,j)=>j!==i)}))} style={{fontSize:12,padding:'4px 10px',borderRadius:12,background:'#f0eee9',color:'#2d2926',cursor:'pointer'}}>{t} x</span>))}</div><div style={{display:'flex',gap:8}}><input style={{...is,flex:1}} value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addTag()} placeholder="Add a tag..."/><button onClick={addTag} style={{padding:'10px 16px',border:'none',borderRadius:8,background:'#e0ddd7',color:'#2d2926',fontWeight:600,cursor:'pointer',fontSize:13}}>+</button></div></div>
    <div><label style={ls}>Notes</label><input style={is} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Optional notes..."/></div>
    <div><label style={ls}>Last Worn</label><input type="date" style={is} value={form.lastWorn||''} onChange={e=>setForm(f=>({...f,lastWorn:e.target.value}))}/></div>
  </div>)
}

function ClothingCard({item,onTap,onDelete,selectable,selected,onSelect}){
  const [showMenu,setShowMenu]=useState(false)
  var handleClick=()=>{if(selectable&&onSelect)onSelect(item);else if(onTap)onTap(item)}
  return(<div onClick={handleClick} style={{borderRadius:12,overflow:'hidden',cursor:'pointer',position:'relative',border:selected?'2px solid #2d2926':'2px solid #f0eee9',background:'#faf9f7'}}>
    {selected&&<div style={{position:'absolute',top:8,right:8,width:24,height:24,borderRadius:12,background:'#2d2926',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,zIndex:2}}>{'\u2713'}</div>}
    {onDelete&&!selectable&&(<div style={{position:'absolute',top:8,left:8,zIndex:2}}>
      <button onClick={e=>{e.stopPropagation();setShowMenu(!showMenu)}} style={{width:26,height:26,borderRadius:13,background:'rgba(255,255,255,.85)',border:'none',cursor:'pointer',fontSize:12,color:'#6b665f'}}>...</button>
      {showMenu&&<div style={{position:'absolute',top:30,left:0,background:'#fff',borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,.12)',overflow:'hidden',zIndex:10}}><button onClick={e=>{e.stopPropagation();onDelete(item.id);setShowMenu(false)}} style={{display:'block',padding:'10px 20px',border:'none',background:'none',color:'#c44',fontSize:13,cursor:'pointer',whiteSpace:'nowrap'}}>Delete</button></div>}
    </div>)}
    {onTap&&!selectable&&<div style={{position:'absolute',top:8,right:8,zIndex:2}}><div style={{background:'rgba(255,255,255,.85)',borderRadius:10,padding:'3px 8px',fontSize:10,color:'#6b665f',fontWeight:500}}>Tap to edit</div></div>}
    <div style={{width:'100%',aspectRatio:'3/4',overflow:'hidden',background:'#eeedea'}}>
      {item.image?<img src={item.image} alt={item.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
      :<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:40}}>{'\uD83D\uDC55'}</div>}
    </div>
    <div style={{padding:'10px 12px'}}>
      <div style={{fontSize:13,fontWeight:600,color:'#2d2926',marginBottom:2,lineHeight:1.3}}>{item.name}</div>
      <div style={{fontSize:11,color:'#a09a93'}}>{item.category==='Accessories'&&item.accessoryType?item.accessoryType:item.category} {'\u00B7'} {item.color}</div>
      {item.lastWorn&&<div style={{fontSize:10,color:'#b0aaa3',marginTop:2}}>Last worn: {new Date(item.lastWorn+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>}
      {item.tags&&item.tags.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:6}}>{item.tags.slice(0,3).map((t,i)=><span key={i} style={{fontSize:10,padding:'2px 8px',borderRadius:10,background:'#f0eee9',color:'#6b665f'}}>{t}</span>)}</div>}
    </div>
  </div>)
}

// ── Edit Item View ──
function EditItemView({item,person,onSave,onCancel,onDelete}){
  const [image,setImage]=useState(item.image||null)
  const [saving,setSaving]=useState(false)
  const [retagging,setRetagging]=useState(false)
  const [form,setForm]=useState({name:item.name||'',category:item.category||'Other',color:item.color||'Other',style:item.style||'Casual',seasons:item.seasons||['All-Season'],tags:item.tags||[],description:item.description||'',accessoryType:item.accessoryType||'',lastWorn:item.lastWorn||''})
  const [tagInput,setTagInput]=useState('')
  const fileRef=useRef()
  const addTag=()=>{if(tagInput.trim()&&!form.tags.includes(tagInput.trim())){setForm(f=>({...f,tags:[...f.tags,tagInput.trim()]}));setTagInput('')}}
  const handleNewPhoto=async e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=async()=>{setImage(await compressImage(r.result))};r.readAsDataURL(f)}
  const handleRetag=async()=>{if(!image)return;setRetagging(true);const t=await aiTagClothing(image);if(t&&!t.error){setForm({name:t.name||form.name,category:t.category||form.category,color:t.color||form.color,style:t.style||form.style,seasons:t.seasons||form.seasons,tags:t.tags||form.tags,description:t.description||form.description,accessoryType:t.accessoryType||form.accessoryType,lastWorn:form.lastWorn})}setRetagging(false)}
  const handleSave=async()=>{if(!form.name||saving)return;setSaving(true);try{await onSave({...item,...form,image,person,dateAdded:item.dateAdded})}finally{setSaving(false)}}
  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
      <button onClick={onCancel} style={{border:'none',background:'none',fontSize:14,color:'#6b665f',cursor:'pointer',fontWeight:600}}>{'\u2190'} Back</button>
      <div style={{fontSize:16,fontWeight:700,color:'#2d2926'}}>Edit Item</div>
      <button onClick={()=>onDelete(item.id)} style={{border:'none',background:'none',fontSize:13,color:'#c44',cursor:'pointer',fontWeight:600}}>Delete</button>
    </div>
    <div style={{borderRadius:16,overflow:'hidden',marginBottom:16,background:'#f5f5f5',position:'relative'}}>
      {image?<img src={image} alt={form.name} style={{width:'100%',maxHeight:280,objectFit:'contain'}}/>:<div style={{height:200,display:'flex',alignItems:'center',justifyContent:'center',fontSize:48}}>{'\uD83D\uDC55'}</div>}
      {retagging&&<div style={{position:'absolute',bottom:0,left:0,right:0,padding:'12px',background:'rgba(45,41,38,.85)',color:'#fff',fontSize:13,textAlign:'center'}}><span className="spinner"/>Re-analyzing...</div>}
    </div>
    <div style={{display:'flex',gap:8,marginBottom:16}}>
      <button onClick={()=>fileRef.current&&fileRef.current.click()} style={{flex:1,padding:'10px',border:'1px solid #e0ddd7',borderRadius:8,background:'#fff',fontSize:13,fontWeight:600,color:'#2d2926',cursor:'pointer'}}>{'\uD83D\uDCF8'} New Photo</button>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleNewPhoto} style={{display:'none'}}/>
      <button onClick={handleRetag} disabled={!image||retagging} style={{flex:1,padding:'10px',border:'1px solid #e0ddd7',borderRadius:8,background:'#fff',fontSize:13,fontWeight:600,color:!image||retagging?'#a09a93':'#2d2926',cursor:'pointer'}}>{'\u2728'} Re-tag AI</button>
    </div>
    <ItemForm form={form} setForm={setForm} tagInput={tagInput} setTagInput={setTagInput} addTag={addTag}/>
    <button onClick={handleSave} disabled={!form.name||saving} style={{width:'100%',padding:'14px',border:'none',borderRadius:10,fontWeight:700,fontSize:15,cursor:form.name&&!saving?'pointer':'default',marginTop:16,background:form.name&&!saving?'#2d2926':'#e0ddd7',color:form.name&&!saving?'#fff':'#a09a93'}}>{saving?'Saving...':'Save Changes'}</button>
  </div>)
}

// ── Add Item View ──
function AddItemView({person,onAdd}){
  const [image,setImage]=useState(null)
  const [loading,setLoading]=useState(false)
  const [saving,setSaving]=useState(false)
  const [removeBgEnabled,setRemoveBgEnabled]=useState(true)
  const [statusMsg,setStatusMsg]=useState('')
  const [form,setForm]=useState({name:'',category:'Tops',color:'Black',style:'Casual',seasons:['All-Season'],tags:[],description:'',accessoryType:'',lastWorn:''})
  const [tagInput,setTagInput]=useState('')
  const [aiDone,setAiDone]=useState(false)
  const fileRef=useRef()
  const addTag=()=>{if(tagInput.trim()&&!form.tags.includes(tagInput.trim())){setForm(f=>({...f,tags:[...f.tags,tagInput.trim()]}));setTagInput('')}}
  const handleFile=async e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=async()=>{setLoading(true);setAiDone(false);setStatusMsg('Compressing...');let p=await compressImage(r.result);setImage(p);if(removeBgEnabled){setStatusMsg('Removing background...');p=await removeBg(p);setImage(p)}setStatusMsg('AI analyzing...');const t=await aiTagClothing(p);if(t&&!t.error){setForm({name:t.name||'',category:t.category||'Other',color:t.color||'Other',style:t.style||'Casual',seasons:t.seasons||['All-Season'],tags:t.tags||[],description:t.description||'',accessoryType:t.accessoryType||'',lastWorn:''});setAiDone(true)}setStatusMsg('');setLoading(false)};r.readAsDataURL(f)}
  const handleSave=async()=>{if(!form.name||saving)return;setSaving(true);try{await onAdd({id:genId(),...form,image,person,dateAdded:new Date().toISOString()});setImage(null);setForm({name:'',category:'Tops',color:'Black',style:'Casual',seasons:['All-Season'],tags:[],description:'',accessoryType:'',lastWorn:''});setAiDone(false);if(fileRef.current)fileRef.current.value=''}finally{setSaving(false)}}
  return(<div>
    <div onClick={()=>setRemoveBgEnabled(!removeBgEnabled)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:removeBgEnabled?'#f0f7f0':'#f5f5f5',borderRadius:10,marginBottom:14,cursor:'pointer',border:'1px solid '+(removeBgEnabled?'#c8e6c9':'#e0ddd7')}}>
      <div style={{width:40,height:22,borderRadius:11,padding:2,background:removeBgEnabled?'#4caf50':'#ccc'}}><div style={{width:18,height:18,borderRadius:9,background:'#fff',transform:removeBgEnabled?'translateX(18px)':'translateX(0)',transition:'all .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/></div>
      <div><div style={{fontSize:13,fontWeight:600,color:'#2d2926'}}>Auto-remove background</div><div style={{fontSize:11,color:'#a09a93'}}>Clean cutout of your clothing item</div></div>
    </div>
    <div onClick={()=>fileRef.current&&fileRef.current.click()} style={{border:'2px dashed #d5d0c9',borderRadius:16,padding:image?0:40,textAlign:'center',cursor:'pointer',background:image?'#f5f5f5':'#faf9f7',overflow:'hidden',marginBottom:20,position:'relative'}}>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{display:'none'}}/>
      {image?(<div style={{position:'relative'}}><img src={image} alt="Preview" style={{width:'100%',maxHeight:300,objectFit:'contain'}}/>{loading&&<div style={{position:'absolute',bottom:0,left:0,right:0,padding:'12px',background:'rgba(45,41,38,.85)',color:'#fff',fontSize:13,textAlign:'center'}}><span className="spinner"/>{statusMsg}</div>}{aiDone&&!loading&&<div style={{position:'absolute',bottom:0,left:0,right:0,padding:'12px',background:'rgba(45,120,80,.9)',color:'#fff',fontSize:13,textAlign:'center'}}>{'\u2713'} Auto-tagged!</div>}</div>)
      :(<div><div style={{fontSize:36,marginBottom:8}}>{'\uD83D\uDCF8'}</div><div style={{fontSize:15,fontWeight:600,color:'#2d2926'}}>Tap to upload or take a photo</div><div style={{fontSize:12,color:'#a09a93',marginTop:4}}>Pick from camera roll or snap a new one</div></div>)}
    </div>
    <ItemForm form={form} setForm={setForm} tagInput={tagInput} setTagInput={setTagInput} addTag={addTag}/>
    <button onClick={handleSave} disabled={!form.name||saving} style={{width:'100%',padding:'14px',border:'none',borderRadius:10,fontWeight:700,fontSize:15,cursor:form.name&&!saving?'pointer':'default',marginTop:16,background:form.name&&!saving?'#2d2926':'#e0ddd7',color:form.name&&!saving?'#fff':'#a09a93'}}>{saving?'Saving...':'Add to '+(person==='ally'?"Ally's":"Gerry's")+' Closet'}</button>
  </div>)
}

// ── Weather Card ──
function WeatherCard({weather,location,onChangeLocation}){
  const [editing,setEditing]=useState(false)
  const [citySearch,setCitySearch]=useState('')
  const [results,setResults]=useState([])
  const [searching,setSearching]=useState(false)
  const handleSearch=async()=>{if(!citySearch.trim())return;setSearching(true);setResults(await searchCity(citySearch));setSearching(false)}
  const selectCity=c=>{onChangeLocation(c);setEditing(false);setCitySearch('');setResults([])}
  if(!weather&&!editing)return null
  return(<div style={{background:'linear-gradient(135deg,#4a90d9,#67b8e3)',borderRadius:14,padding:16,marginBottom:16,color:'#fff'}}>
    {editing?(<div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><div style={{fontSize:14,fontWeight:700}}>{'\uD83D\uDCCD'} Change Location</div><button onClick={()=>{setEditing(false);setResults([])}} style={{border:'none',background:'rgba(255,255,255,.2)',color:'#fff',borderRadius:6,padding:'4px 10px',fontSize:12,cursor:'pointer'}}>Cancel</button></div>
      <div style={{display:'flex',gap:8,marginBottom:8}}><input value={citySearch} onChange={e=>setCitySearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSearch()} placeholder="Search city..." style={{flex:1,padding:'8px 12px',border:'1px solid rgba(255,255,255,.3)',borderRadius:8,background:'rgba(255,255,255,.15)',color:'#fff',fontSize:14,outline:'none'}}/><button onClick={handleSearch} disabled={searching} style={{padding:'8px 14px',border:'none',borderRadius:8,background:'rgba(255,255,255,.9)',color:'#4a90d9',fontWeight:700,fontSize:13,cursor:'pointer'}}>{searching?'...':'Search'}</button></div>
      {results.map((r,i)=><button key={i} onClick={()=>selectCity(r)} style={{display:'block',width:'100%',padding:'8px 12px',border:'none',background:'rgba(255,255,255,.1)',borderRadius:8,color:'#fff',fontSize:13,cursor:'pointer',marginBottom:4,textAlign:'left'}}>{r.name}</button>)}
    </div>)
    :(<div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div style={{display:'flex',alignItems:'center',gap:12}}><div style={{fontSize:32}}>{weather&&weather.icon}</div><div><div style={{fontSize:22,fontWeight:800}}>{weather&&weather.temp}{'\u00B0'}F</div><div style={{fontSize:12,opacity:.85}}>Feels like {weather&&weather.feelsLike}{'\u00B0'}F {'\u00B7'} {weather&&weather.description}</div></div></div>
      <div style={{textAlign:'right'}}><button onClick={()=>setEditing(true)} style={{border:'none',background:'rgba(255,255,255,.2)',color:'#fff',borderRadius:8,padding:'4px 10px',fontSize:11,cursor:'pointer',marginBottom:4,display:'block'}}>{'\uD83D\uDCCD'} {location&&location.name?location.name.split(',')[0]:'Des Moines'}</button><div style={{fontSize:10,opacity:.7}}>Wind: {weather&&weather.wind} mph</div></div>
    </div>)}
  </div>)
}

// ── Style View (AI Outfit Builder with 3 modes) ──
function StyleView({items,person,outfits,onSaveOutfit,weather,location,onChangeLocation,onShowToast}){
  const [mode,setMode]=useState('describe') // describe | pick | photo
  const [selected,setSelected]=useState([])
  const [anchorItems,setAnchorItems]=useState([])
  const [occasion,setOccasion]=useState('')
  const [loading,setLoading]=useState(false)
  const [suggestion,setSuggestion]=useState(null)
  const [filter,setFilter]=useState('All')
  const [recentSuggestions,setRecentSuggestions]=useState([])
  const [photoUploading,setPhotoUploading]=useState(false)
  const [photoDescription,setPhotoDescription]=useState(null)
  const [photoPreview,setPhotoPreview]=useState(null)
  const photoRef=useRef()

  const toggleAnchor=(item)=>{
    setAnchorItems(prev=>prev.find(a=>a.id===item.id)?prev.filter(a=>a.id!==item.id):[...prev,item])
  }

  const handlePhotoUpload=async e=>{
    const f=e.target.files[0];if(!f)return
    const r=new FileReader();r.onload=async()=>{
      setPhotoUploading(true);const compressed=await compressImage(r.result);setPhotoPreview(compressed)
      const tags=await aiTagClothing(compressed)
      if(tags&&!tags.error){setPhotoDescription(tags.name+' - '+tags.description+' ('+tags.category+', '+tags.color+', '+tags.style+')')}
      setPhotoUploading(false)
    };r.readAsDataURL(f)
  }

  const handleAiSuggest=async()=>{
    if(items.length<2)return;setLoading(true);setSuggestion(null)
    try{
      var wd=null;if(weather){wd={location:location&&location.name?location.name.split(',')[0]:'Des Moines',temp:weather.temp,feelsLike:weather.feelsLike,description:weather.description,wind:weather.wind}}
      // Build avoid list safely
      var rn=[]
      recentSuggestions.forEach(function(s){try{rn.push(s.name+' (items: '+(s.itemIds||[]).join(', ')+')')}catch(e){}})
      outfits.slice(0,8).forEach(function(o){try{if(o.itemIds)rn.push(o.name+' (items: '+o.itemIds.join(', ')+')')}catch(e){}})
      var anchorIds=anchorItems.map(a=>a.id)
      console.log('Sending to AI:', {occasion, anchorIds, photoDescription: !!photoDescription, itemCount: items.length})
      const result=await aiSuggestOutfit(items,occasion,person==='ally'?'Ally':'Gerry',wd,rn,anchorIds,photoDescription)
      console.log('AI result:', result)
      if(result&&!result.error){
        setSuggestion(result)
        setRecentSuggestions(prev=>[{name:result.outfitName,itemIds:result.itemIds||[]},...prev].slice(0,10))
        var matched=[];if(result.itemIds){for(var i=0;i<result.itemIds.length;i++){var found=items.find(it=>it.id===result.itemIds[i]);if(found)matched.push(found)}};setSelected(matched)
      } else {
        console.error('AI error:', result)
        onShowToast(result&&result.error?result.error:'AI had trouble. Try again!')
      }
    }catch(e){
      console.error('Style error:',e)
      onShowToast('Something went wrong: '+e.message)
    }
    setLoading(false)
  }

  const handleSave=async()=>{
    if(selected.length<2)return
    await onSaveOutfit({id:genId(),name:suggestion?suggestion.outfitName||'Outfit':'Outfit',itemIds:selected.map(i=>i.id),occasion,notes:suggestion?suggestion.reasoning||'':'',person,dateCreated:new Date().toISOString(),photos:[],outfitNotes:'',lastWorn:''})
    setSelected([]);setSuggestion(null);setOccasion('');setAnchorItems([]);setPhotoDescription(null);setPhotoPreview(null)
  }

  const modeBtn=(id,icon,label)=>(<button onClick={()=>{setMode(id);setSuggestion(null);setSelected([]);setAnchorItems([]);setPhotoDescription(null);setPhotoPreview(null)}} style={{flex:1,padding:'10px 8px',border:mode===id?'2px solid #2d2926':'2px solid #e0ddd7',borderRadius:10,background:mode===id?'#2d2926':'#fff',color:mode===id?'#fff':'#6b665f',fontSize:12,fontWeight:600,cursor:'pointer',textAlign:'center'}}>{icon}<br/>{label}</button>)

  var weatherMsg='Tell me the vibe'
  if(weather)weatherMsg=weather.temp+'\u00B0F, '+weather.description.toLowerCase()

  return(<div>
    <WeatherCard weather={weather} location={location} onChangeLocation={onChangeLocation}/>

    {/* Mode Selector */}
    <div style={{display:'flex',gap:8,marginBottom:16}}>
      {modeBtn('describe','\u270D\uFE0F','Describe It')}
      {modeBtn('pick','\uD83D\uDC49','Pick an Item')}
      {modeBtn('photo','\uD83D\uDCF7','Upload Photo')}
    </div>

    {/* Describe Mode */}
    {mode==='describe'&&(<div style={{background:'linear-gradient(135deg,#2d2926,#4a443d)',borderRadius:14,padding:20,marginBottom:20,color:'#fff'}}>
      <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>{'\u2728'} What are you dressing for?</div>
      <div style={{fontSize:12,opacity:.7,marginBottom:14}}>{weatherMsg}</div>
      <div style={{display:'flex',gap:8}}>
        <input value={occasion} onChange={e=>setOccasion(e.target.value)} placeholder="e.g. date night, casual brunch, I want to wear a dress..." onKeyDown={e=>e.key==='Enter'&&handleAiSuggest()} style={{flex:1,padding:'10px 14px',border:'1px solid rgba(255,255,255,.2)',borderRadius:8,background:'rgba(255,255,255,.1)',color:'#fff',fontSize:14,outline:'none'}}/>
        <button onClick={handleAiSuggest} disabled={loading||items.length<2} style={{padding:'10px 18px',border:'none',borderRadius:8,fontWeight:700,fontSize:13,cursor:loading?'default':'pointer',background:loading?'#6b665f':'#fff',color:'#2d2926'}}>{loading?'Styling...':'Style Me'}</button>
      </div>
    </div>)}

    {/* Pick Mode */}
    {mode==='pick'&&(<div style={{marginBottom:20}}>
      <div style={{background:'#f7f6f3',borderRadius:14,padding:16,marginBottom:12,border:'1px solid #e0ddd7'}}>
        {anchorItems.length>0?(<div>
          <div style={{fontSize:14,fontWeight:700,color:'#2d2926',marginBottom:8}}>Styling around {anchorItems.length} item{anchorItems.length>1?'s':''}:</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
            {anchorItems.map(ai=>(<div key={ai.id} style={{display:'flex',alignItems:'center',gap:6,background:'#eeedea',borderRadius:8,padding:'4px 8px'}}>
              <div style={{width:36,height:36,borderRadius:6,overflow:'hidden',background:'#ddd',flexShrink:0}}>{ai.image?<img src={ai.image} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:null}</div>
              <div style={{fontSize:12,fontWeight:600,color:'#2d2926'}}>{ai.name}</div>
              <button onClick={()=>toggleAnchor(ai)} style={{border:'none',background:'none',color:'#c44',fontSize:14,cursor:'pointer',padding:'0 2px'}}>x</button>
            </div>))}
          </div>
          <input value={occasion} onChange={e=>setOccasion(e.target.value)} placeholder="What's the occasion? (optional)" style={{width:'100%',padding:'8px 12px',border:'1px solid #e0ddd7',borderRadius:8,fontSize:14,color:'#2d2926',background:'#fff',boxSizing:'border-box',marginBottom:10}}/>
          <div style={{display:'flex',gap:8}}>
            <button onClick={handleAiSuggest} disabled={loading} style={{flex:1,padding:'10px',border:'none',borderRadius:8,background:'#2d2926',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>{loading?'Styling...':'\u2728 Build Outfit'}</button>
            <button onClick={()=>setAnchorItems([])} style={{padding:'10px 16px',border:'1px solid #e0ddd7',borderRadius:8,background:'#fff',color:'#6b665f',fontSize:13,cursor:'pointer'}}>Clear All</button>
          </div>
        </div>)
        :(<div style={{textAlign:'center'}}><div style={{fontSize:14,fontWeight:600,color:'#2d2926',marginBottom:4}}>Tap items you want to wear</div><div style={{fontSize:12,color:'#a09a93'}}>Pick one or more pieces and the AI will build an outfit around them</div></div>)}
      </div>

      {/* Suggestion shows here in pick mode */}
      {suggestion&&(<div style={{background:'#f7f6f3',borderRadius:12,padding:16,marginBottom:12,border:'1px solid #e0ddd7'}}>
        <div style={{fontSize:15,fontWeight:700,color:'#2d2926',marginBottom:4}}>{'\u2728'} {suggestion.outfitName}</div>
        {selected.length>0&&<div style={{fontSize:12,color:'#2d2926',marginBottom:8,padding:'8px 10px',background:'#eeedea',borderRadius:8}}><span style={{fontWeight:600}}>Picked: </span>{selected.map(function(s,i){return(i>0?', ':'')+s.name})}</div>}
        <div style={{display:'flex',gap:6,marginBottom:10,overflowX:'auto'}}>{selected.map(s=><div key={s.id} style={{width:60,height:60,borderRadius:8,overflow:'hidden',background:'#eeedea',flexShrink:0}}>{s.image?<img src={s.image} alt={s.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{'\uD83D\uDC55'}</div>}</div>)}</div>
        <div style={{fontSize:13,color:'#6b665f',lineHeight:1.5,marginBottom:8}}>{suggestion.reasoning}</div>
        {suggestion.stylingTips&&<div style={{fontSize:12,color:'#a09a93',fontStyle:'italic'}}>{'\uD83D\uDCA1'} {suggestion.stylingTips}</div>}
        {selected.length>=2&&<button onClick={handleSave} style={{width:'100%',padding:'12px',border:'none',borderRadius:10,fontWeight:700,fontSize:14,cursor:'pointer',background:'#2d2926',color:'#fff',marginTop:12}}>Save This Outfit</button>}
      </div>)}

      <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:8}}>
        {items.map(item=><ClothingCard key={item.id} item={item} selectable selected={!!anchorItems.find(a=>a.id===item.id)} onSelect={toggleAnchor}/>)}
      </div>
    </div>)}

    {/* Photo Mode */}
    {mode==='photo'&&(<div style={{marginBottom:20}}>
      <div style={{background:'#f7f6f3',borderRadius:14,padding:16,marginBottom:12,border:'1px solid #e0ddd7'}}>
        <div style={{fontSize:14,fontWeight:700,color:'#2d2926',marginBottom:4}}>{'\uD83D\uDCF7'} Match with a photo</div>
        <div style={{fontSize:12,color:'#a09a93',marginBottom:12}}>Upload a photo of something you want to wear, and the AI will find matching items from your closet</div>
        {photoPreview?(<div>
          <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:10}}>
            <div style={{width:80,height:80,borderRadius:10,overflow:'hidden',background:'#eeedea',flexShrink:0}}><img src={photoPreview} alt="Uploaded" style={{width:'100%',height:'100%',objectFit:'cover'}}/></div>
            <div style={{flex:1}}>{photoDescription?<div style={{fontSize:13,color:'#2d2926',fontWeight:500}}>{photoDescription}</div>:<div style={{fontSize:12,color:'#a09a93'}}>Analyzing...</div>}</div>
          </div>
          <input value={occasion} onChange={e=>setOccasion(e.target.value)} placeholder="What's the occasion? (optional)" style={{width:'100%',padding:'8px 12px',border:'1px solid #e0ddd7',borderRadius:8,fontSize:14,color:'#2d2926',background:'#fff',boxSizing:'border-box',marginBottom:10}}/>
          <div style={{display:'flex',gap:8}}>
            <button onClick={handleAiSuggest} disabled={loading||!photoDescription} style={{flex:1,padding:'10px',border:'none',borderRadius:8,background:'#2d2926',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>{loading?'Styling...':'\u2728 Find Matches'}</button>
            <button onClick={()=>{setPhotoPreview(null);setPhotoDescription(null)}} style={{padding:'10px 16px',border:'1px solid #e0ddd7',borderRadius:8,background:'#fff',color:'#6b665f',fontSize:13,cursor:'pointer'}}>Clear</button>
          </div>
        </div>)
        :(<button onClick={()=>photoRef.current&&photoRef.current.click()} disabled={photoUploading} style={{width:'100%',padding:'20px',border:'2px dashed #d5d0c9',borderRadius:12,background:'#faf9f7',cursor:'pointer',fontSize:14,fontWeight:600,color:'#2d2926'}}>{photoUploading?'Analyzing photo...':'\uD83D\uDCF8 Tap to upload a photo'}</button>)}
        <input ref={photoRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{display:'none'}}/>
      </div>
    </div>)}

    {/* Suggestion Result */}
    {suggestion&&(<div style={{background:'#f7f6f3',borderRadius:12,padding:16,marginBottom:20,border:'1px solid #e0ddd7'}}>
      <div style={{fontSize:15,fontWeight:700,color:'#2d2926',marginBottom:4}}>{'\u2728'} {suggestion.outfitName}</div>
      {selected.length>0&&<div style={{fontSize:12,color:'#2d2926',marginBottom:8,padding:'8px 10px',background:'#eeedea',borderRadius:8}}><span style={{fontWeight:600}}>Picked: </span>{selected.map((s,i)=>(i>0?', ':'')+s.name)}</div>}
      <div style={{display:'flex',gap:6,marginBottom:10,overflowX:'auto'}}>{selected.map(s=><div key={s.id} style={{width:60,height:60,borderRadius:8,overflow:'hidden',background:'#eeedea',flexShrink:0}}>{s.image?<img src={s.image} alt={s.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{'\uD83D\uDC55'}</div>}</div>)}</div>
      <div style={{fontSize:13,color:'#6b665f',lineHeight:1.5,marginBottom:8}}>{suggestion.reasoning}</div>
      {suggestion.stylingTips&&<div style={{fontSize:12,color:'#a09a93',fontStyle:'italic'}}>{'\uD83D\uDCA1'} {suggestion.stylingTips}</div>}
      {selected.length>=2&&<button onClick={handleSave} style={{width:'100%',padding:'12px',border:'none',borderRadius:10,fontWeight:700,fontSize:14,cursor:'pointer',background:'#2d2926',color:'#fff',marginTop:12}}>Save This Outfit</button>}
    </div>)}
  </div>)
}

// ── My Outfits View ──
function MyOutfitsView({items,outfits,onUpdateOutfit,onDeleteOutfit}){
  const [editingId,setEditingId]=useState(null)
  const photoRef=useRef()
  const [uploadingId,setUploadingId]=useState(null)

  const handlePhotoUpload=async(outfitId,e)=>{
    const f=e.target.files[0];if(!f)return;setUploadingId(outfitId)
    const r=new FileReader();r.onload=async()=>{
      const compressed=await compressImage(r.result,400)
      const outfit=outfits.find(o=>o.id===outfitId);if(!outfit)return
      const updated={...outfit,photos:(outfit.photos||[]).concat([compressed])}
      await onUpdateOutfit(updated);setUploadingId(null)
    };r.readAsDataURL(f)
  }

  if(outfits.length===0)return(<div style={{textAlign:'center',padding:'40px 20px'}}><div style={{fontSize:48,marginBottom:12}}>{'\uD83D\uDC5A'}</div><div style={{fontSize:16,fontWeight:600,color:'#2d2926',marginBottom:4}}>No saved outfits yet</div><div style={{fontSize:13,color:'#a09a93'}}>Go to the Style tab to create your first outfit!</div></div>)

  return(<div>
    <div style={{fontSize:16,fontWeight:700,color:'#2d2926',marginBottom:16}}>Saved Outfits ({outfits.length})</div>
    {outfits.map(outfit=>{
      var outfitItems=outfit.itemIds.map(id=>items.find(i=>i.id===id)).filter(Boolean)
      var isEditing=editingId===outfit.id
      return(<div key={outfit.id} style={{background:'#faf9f7',borderRadius:12,padding:16,marginBottom:12,border:'1px solid #f0eee9'}}>
        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:700,color:'#2d2926'}}>{outfit.name}</div>
            {outfit.occasion&&<div style={{fontSize:12,color:'#a09a93',marginTop:2}}>{outfit.occasion}</div>}
            {outfit.lastWorn&&<div style={{fontSize:11,color:'#8B6914',marginTop:2}}>Last worn: {new Date(outfit.lastWorn+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>}
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setEditingId(isEditing?null:outfit.id)} style={{border:'none',background:'none',color:'#6b665f',fontSize:12,cursor:'pointer',fontWeight:600}}>{isEditing?'Done':'Edit'}</button>
            <button onClick={()=>onDeleteOutfit(outfit.id)} style={{border:'none',background:'none',color:'#c44',fontSize:12,cursor:'pointer'}}>Remove</button>
          </div>
        </div>

        {/* Item thumbnails */}
        <div style={{display:'flex',gap:6,overflowX:'auto',marginBottom:10}}>
          {outfitItems.map(oi=>(<div key={oi.id} style={{width:56,height:56,borderRadius:8,overflow:'hidden',background:'#eeedea',flexShrink:0}}>{oi.image?<img src={oi.image} alt={oi.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>{'\uD83D\uDC55'}</div>}</div>))}
        </div>

        {/* Notes display */}
        {outfit.notes&&!isEditing&&<div style={{fontSize:12,color:'#6b665f',lineHeight:1.4,marginBottom:8}}>{outfit.notes}</div>}
        {outfit.outfitNotes&&!isEditing&&<div style={{fontSize:12,color:'#2d2926',lineHeight:1.4,padding:'8px 10px',background:'#f0eee9',borderRadius:8,marginBottom:8}}>{'\uD83D\uDCDD'} {outfit.outfitNotes}</div>}

        {/* Edit Mode */}
        {isEditing&&(<div style={{borderTop:'1px solid #e0ddd7',paddingTop:12,marginTop:8}}>
          <div style={{marginBottom:10}}>
            <label style={{fontSize:11,fontWeight:600,color:'#6b665f',textTransform:'uppercase',letterSpacing:.5,display:'block',marginBottom:4}}>Personal Notes</label>
            <textarea value={outfit.outfitNotes||''} onChange={e=>{const v=e.target.value;onUpdateOutfit({...outfit,outfitNotes:v})}} placeholder="How did it look? Any thoughts..." style={{width:'100%',padding:'10px 12px',border:'1px solid #e0ddd7',borderRadius:8,fontSize:14,color:'#2d2926',background:'#fff',boxSizing:'border-box',resize:'vertical',minHeight:60,fontFamily:'inherit'}}/>
          </div>
          <div style={{marginBottom:10}}>
            <label style={{fontSize:11,fontWeight:600,color:'#6b665f',textTransform:'uppercase',letterSpacing:.5,display:'block',marginBottom:4}}>Last Worn</label>
            <input type="date" value={outfit.lastWorn||''} onChange={e=>{onUpdateOutfit({...outfit,lastWorn:e.target.value})}} style={{width:'100%',padding:'10px 12px',border:'1px solid #e0ddd7',borderRadius:8,fontSize:14,color:'#2d2926',background:'#fff',boxSizing:'border-box'}}/>
          </div>
        </div>)}

        {/* Outfit photos */}
        {outfit.photos&&outfit.photos.length>0&&(<div style={{display:'flex',gap:8,overflowX:'auto',marginTop:8}}>
          {outfit.photos.map((photo,idx)=>(<div key={idx} style={{width:72,height:90,borderRadius:8,overflow:'hidden',flexShrink:0,border:'1px solid #e0ddd7'}}><img src={photo} alt={'Look '+(idx+1)} style={{width:'100%',height:'100%',objectFit:'cover'}}/></div>))}
        </div>)}

        {/* Add photo button */}
        <div style={{marginTop:8}}>
          <input type="file" accept="image/*" onChange={e=>handlePhotoUpload(outfit.id,e)} style={{display:'none'}} id={'photo-'+outfit.id}/>
          <button onClick={()=>document.getElementById('photo-'+outfit.id).click()} disabled={uploadingId===outfit.id} style={{padding:'6px 12px',border:'1px solid #e0ddd7',borderRadius:8,background:'#fff',fontSize:11,fontWeight:600,color:'#2d2926',cursor:'pointer'}}>
            {uploadingId===outfit.id?'Uploading...':'\uD83D\uDCF8 '+(outfit.photos&&outfit.photos.length>0?'Add Another Photo':'Add Outfit Photo')}
          </button>
        </div>
      </div>)
    })}
  </div>)
}

// ── Main App ──
export default function App(){
  const [person,setPerson]=useState('ally')
  const [tab,setTab]=useState('closet')
  const [items,setItems]=useState([])
  const [outfits,setOutfits]=useState([])
  const [filter,setFilter]=useState('All')
  const [subFilter,setSubFilter]=useState('All')
  const [searchTerm,setSearchTerm]=useState('')
  const [loading,setLoading]=useState(true)
  const [toast,setToast]=useState('')
  const [editingItem,setEditingItem]=useState(null)
  const [weather,setWeather]=useState(null)
  const [weatherLocation,setWeatherLocation]=useState({name:'Des Moines, Iowa, US',lat:41.5868,lon:-93.6250})

  useEffect(()=>{setLoading(true);Promise.all([fbLoadItems(person),fbLoadOutfits(person)]).then(([i,o])=>{setItems(i);setOutfits(o);setLoading(false)}).catch(()=>setLoading(false))},[person])
  useEffect(()=>{fetchWeather(weatherLocation.lat,weatherLocation.lon).then(w=>{if(w)setWeather(w)})},[weatherLocation])

  var showToast=msg=>setToast(msg)
  var addItem=async item=>{try{await fbSaveItem(item);setItems(p=>[item,...p]);setTab('closet');showToast('Item added!')}catch(e){showToast('Failed to save')}}
  var updateItem=async item=>{try{await fbSaveItem(item);setItems(p=>p.map(i=>i.id===item.id?item:i));setEditingItem(null);showToast('Updated!')}catch(e){showToast('Failed')}}
  var handleDeleteItem=async id=>{try{await fbDeleteItem(id);setItems(p=>p.filter(i=>i.id!==id));setEditingItem(null);showToast('Removed')}catch(e){showToast('Failed')}}
  var handleSaveOutfit=async o=>{try{await fbSaveOutfit(o);setOutfits(p=>[o,...p]);showToast('Outfit saved!')}catch(e){showToast('Failed')}}
  var handleUpdateOutfit=async o=>{try{await fbSaveOutfit(o);setOutfits(p=>p.map(x=>x.id===o.id?o:x));showToast('Updated!')}catch(e){showToast('Failed')}}
  var handleDeleteOutfit=async id=>{try{await fbDeleteOutfit(id);setOutfits(p=>p.filter(o=>o.id!==id));showToast('Removed')}catch(e){showToast('Failed')}}

  var filtered=items.filter(i=>{
    var catMatch=filter==='All'||i.category===filter
    var subMatch=filter!=='Accessories'||subFilter==='All'||i.accessoryType===subFilter
    var searchMatch=!searchTerm||(i.name&&i.name.toLowerCase().indexOf(searchTerm.toLowerCase())>=0)||(i.tags&&i.tags.some(t=>t.toLowerCase().indexOf(searchTerm.toLowerCase())>=0))
    return catMatch&&subMatch&&searchMatch
  })

  return(<div style={{maxWidth:480,margin:'0 auto',padding:'16px 16px 80px',minHeight:'100vh'}}>
    <div style={{textAlign:'center',marginBottom:16}}><div style={{fontSize:22,fontWeight:800,color:'#2d2926',letterSpacing:-.5}}>OUR CLOSET</div><div style={{fontSize:11,color:'#a09a93',letterSpacing:2,textTransform:'uppercase'}}>wardrobe manager</div></div>
    {!editingItem&&<div><PersonSwitcher person={person} setPerson={p=>{setPerson(p);setFilter('All');setSubFilter('All');setSearchTerm('')}}/><div style={{marginTop:16}}><NavTabs tab={tab} setTab={setTab} itemCount={items.length} outfitCount={outfits.length}/></div></div>}

    {loading?(<div style={{textAlign:'center',padding:40,color:'#a09a93'}}><span className="spinner" style={{borderColor:'rgba(160,154,147,.3)',borderTopColor:'#a09a93'}}/><div style={{marginTop:12}}>Loading closet...</div></div>)
    :editingItem?<EditItemView item={editingItem} person={person} onSave={updateItem} onCancel={()=>setEditingItem(null)} onDelete={handleDeleteItem}/>
    :(<div>
      {tab==='closet'&&(<div>{items.length===0?(<div style={{textAlign:'center',padding:'40px 20px'}}><div style={{fontSize:48,marginBottom:12}}>{'\uD83D\uDC57'}</div><div style={{fontSize:16,fontWeight:600,color:'#2d2926',marginBottom:4}}>{person==='ally'?"Ally's":"Gerry's"} closet is empty</div><div style={{fontSize:13,color:'#a09a93',marginBottom:16}}>Start adding clothes!</div><button onClick={()=>setTab('add')} style={{padding:'12px 24px',border:'none',borderRadius:10,background:'#2d2926',color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer'}}>Add First Item</button></div>)
      :(<div><div style={{marginBottom:12}}><input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Search items..." style={{width:'100%',padding:'10px 14px',border:'1px solid #e0ddd7',borderRadius:10,fontSize:14,color:'#2d2926',background:'#faf9f7',boxSizing:'border-box'}}/></div>
        <CategoryFilter selected={filter} onSelect={setFilter} subFilter={subFilter} onSubFilter={setSubFilter}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:12}}>{filtered.map(item=><ClothingCard key={item.id} item={item} onTap={setEditingItem} onDelete={handleDeleteItem}/>)}</div>
        {filtered.length===0&&<div style={{textAlign:'center',padding:30,color:'#a09a93',fontSize:13}}>No items match</div>}
      </div>)}</div>)}

      {tab==='add'&&<AddItemView person={person} onAdd={addItem}/>}
      {tab==='style'&&<StyleView items={items} person={person} outfits={outfits} onSaveOutfit={handleSaveOutfit} weather={weather} location={weatherLocation} onChangeLocation={loc=>{setWeatherLocation(loc);setWeather(null)}} onShowToast={showToast}/>}
      {tab==='outfits'&&<MyOutfitsView items={items} outfits={outfits} onUpdateOutfit={handleUpdateOutfit} onDeleteOutfit={handleDeleteOutfit}/>}
    </div>)}
    {toast&&<Toast message={toast} onDone={()=>setToast('')}/>}
  </div>)
}
