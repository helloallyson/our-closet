import { initializeApp } from 'firebase/app'
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc, query, where } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

export async function loadItems(person) {
  try {
    const q = query(collection(db, 'closet-items'), where('person', '==', person))
    const snapshot = await getDocs(q)
    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    return items.sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''))
  } catch (e) { console.error('Load items failed:', e); return [] }
}

export async function saveItem(item) {
  try {
    await setDoc(doc(db, 'closet-items', item.id), item)
    return item.image
  } catch (e) { console.error('Save item failed:', e); throw e }
}

export async function deleteItem(itemId, person) {
  try { await deleteDoc(doc(db, 'closet-items', itemId)) }
  catch (e) { console.error('Delete item failed:', e); throw e }
}

export async function loadOutfits(person) {
  try {
    const q = query(collection(db, 'closet-outfits'), where('person', '==', person))
    const snapshot = await getDocs(q)
    const outfits = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    return outfits.sort((a, b) => (b.dateCreated || '').localeCompare(a.dateCreated || ''))
  } catch (e) { console.error('Load outfits failed:', e); return [] }
}

export async function saveOutfit(outfit) {
  try { await setDoc(doc(db, 'closet-outfits', outfit.id), outfit) }
  catch (e) { console.error('Save outfit failed:', e); throw e }
}

export async function deleteOutfit(outfitId) {
  try { await deleteDoc(doc(db, 'closet-outfits', outfitId)) }
  catch (e) { console.error('Delete outfit failed:', e); throw e }
}
