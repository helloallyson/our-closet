import { initializeApp } from 'firebase/app'
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc, query, where, orderBy } from 'firebase/firestore'
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage'

// ── Your Firebase config (replace with your project values) ──
const firebaseConfig = {
  apiKey: "AIzaSyCvstTKnaoIwOV9JnYwTsYBr43e6KXH9Lw",
  authDomain: "our-closet-d03da.firebaseapp.com",
  projectId: "our-closet-d03da",
  storageBucket: "our-closet-d03da.firebasestorage.app",
  messagingSenderId: "906528990994",
  appId: "1:906528990994:web:697b87b59aa9495c3bb5cb"
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)
const storage = getStorage(app)

// ── Clothing Items ──

export async function loadItems(person) {
  try {
    const q = query(
      collection(db, 'closet-items'),
      where('person', '==', person),
      orderBy('dateAdded', 'desc')
    )
    const snapshot = await getDocs(q)
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.error('Load items failed:', e)
    return []
  }
}

export async function saveItem(item) {
  try {
    // Upload image to Firebase Storage if it's a data URL
    let imageUrl = item.image
    if (item.image && item.image.startsWith('data:')) {
      const imageRef = ref(storage, `closet-images/${item.person}/${item.id}.jpg`)
      await uploadString(imageRef, item.image, 'data_url')
      imageUrl = await getDownloadURL(imageRef)
    }
    
    await setDoc(doc(db, 'closet-items', item.id), {
      ...item,
      image: imageUrl
    })
    return imageUrl
  } catch (e) {
    console.error('Save item failed:', e)
    throw e
  }
}

export async function deleteItem(itemId, person) {
  try {
    await deleteDoc(doc(db, 'closet-items', itemId))
    // Try to delete image too
    try {
      const imageRef = ref(storage, `closet-images/${person}/${itemId}.jpg`)
      await deleteObject(imageRef)
    } catch (e) {
      // Image might not exist, that's fine
    }
  } catch (e) {
    console.error('Delete item failed:', e)
    throw e
  }
}

// ── Outfits ──

export async function loadOutfits(person) {
  try {
    const q = query(
      collection(db, 'closet-outfits'),
      where('person', '==', person),
      orderBy('dateCreated', 'desc')
    )
    const snapshot = await getDocs(q)
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.error('Load outfits failed:', e)
    return []
  }
}

export async function saveOutfit(outfit) {
  try {
    await setDoc(doc(db, 'closet-outfits', outfit.id), outfit)
  } catch (e) {
    console.error('Save outfit failed:', e)
    throw e
  }
}

export async function deleteOutfit(outfitId) {
  try {
    await deleteDoc(doc(db, 'closet-outfits', outfitId))
  } catch (e) {
    console.error('Delete outfit failed:', e)
    throw e
  }
}
