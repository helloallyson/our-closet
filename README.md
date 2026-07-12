# OUR CLOSET 👗

A personal wardrobe manager for Ally & Gerry with AI-powered clothing tagging and outfit suggestions.

**Stack:** React + Vite, Firebase (Firestore + Storage), OpenAI GPT-4o, Netlify Functions

---

## SETUP GUIDE

### Step 1: OpenAI API Key

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign in (or create account)
3. Go to **API Keys** in the left sidebar
4. Click **Create new secret key**
5. Copy it and save it somewhere safe (you'll need it for Netlify)
6. Add a payment method under **Billing** (it's pay-as-you-go, each photo analysis costs ~$0.01-0.03)

### Step 2: Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** (or use an existing one)
3. Name it something like `our-closet`
4. Once created, click the **web icon** (</>) to add a web app
5. Register it (name doesn't matter), and you'll see a config block like:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "our-closet-xxxxx.firebaseapp.com",
  projectId: "our-closet-xxxxx",
  storageBucket: "our-closet-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

6. Copy these values, you'll need them.

**Enable Firestore:**
- In Firebase console, go to **Build > Firestore Database**
- Click **Create database**
- Choose **Start in test mode** (we can lock it down later)
- Pick a region (us-central1 is fine)

**Enable Storage:**
- Go to **Build > Storage**
- Click **Get started**
- Choose **Start in test mode**
- Same region as Firestore

**Create Firestore Indexes:**
The app uses two compound queries that need indexes. Go to **Firestore > Indexes** and add:

| Collection       | Fields                              |
|-----------------|-------------------------------------|
| closet-items    | person (Asc), dateAdded (Desc)      |
| closet-outfits  | person (Asc), dateCreated (Desc)    |

Or just run the app and click the error link in the console. Firebase will auto-generate the index creation link for you.

### Step 3: Configure the App

**Option A: Hardcode Firebase config** (easiest for a personal app)

Open `src/firebase.js` and replace the placeholder values with your real Firebase config:

```js
const firebaseConfig = {
  apiKey: "YOUR_REAL_KEY",
  authDomain: "your-project.firebaseapp.com",
  // etc...
}
```

**Option B: Use environment variables** (if you want to keep them out of code)

Set these in Netlify dashboard (Step 4):
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_ID`
- `VITE_FIREBASE_APP_ID`

### Step 4: Deploy to Netlify

**Option A: GitHub + Netlify (recommended)**

1. Push this project to GitHub:
```bash
cd our-closet
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/helloallyson/our-closet.git
git push -u origin main
```

2. Go to [app.netlify.com](https://app.netlify.com)
3. Click **Add new site > Import an existing project**
4. Connect to GitHub and select `our-closet`
5. Build settings should auto-detect from netlify.toml:
   - Build command: `npm run build`
   - Publish directory: `dist`
6. Before deploying, go to **Site settings > Environment variables** and add:
   - `OPENAI_API_KEY` = your OpenAI key
   - (Plus the VITE_FIREBASE_* vars if you went with Option B above)
7. Deploy!

**Option B: Netlify CLI**

```bash
npm install
npm run build
npx netlify-cli deploy --prod
```

(You'll still need to set environment variables in the Netlify dashboard)

### Step 5: Custom Domain (optional)

In Netlify dashboard:
1. Go to **Domain settings**
2. Add custom domain: `closet.himynameisally.net`
3. Add a CNAME record in your DNS pointing to the Netlify URL

---

## HOW IT WORKS

- **Add Tab:** Upload a photo of a clothing item. GPT-4o analyzes the image and auto-fills the name, category, color, style, season, and tags. Review and tweak before saving.

- **Closet Tab:** Browse all your items in a grid. Filter by category or search by name/tag. Delete items from the three-dot menu.

- **Outfits Tab:** Type an occasion (date night, work meeting, brunch) and hit "Style Me" to get an AI-generated outfit from your actual wardrobe. Or manually pick items. Save outfits for future reference.

- **Person Switcher:** Toggle between Ally's closet and Gerry's closet at the top. Each person has their own items and outfits.

---

## COST ESTIMATES

- **OpenAI:** ~$0.01-0.03 per photo analysis, ~$0.005 per outfit suggestion. For a personal app you'd spend maybe $1-2/month tops.
- **Firebase:** Free tier covers this easily (1GB storage, 50K reads/day)
- **Netlify:** Free tier is plenty (100GB bandwidth, 125K function calls/month)

---

## FUTURE IDEAS

- Weather-based outfit suggestions ("what should I wear today?")
- Outfit calendar / wear tracking
- Wardrobe stats (most worn, color breakdown, style distribution)
- Laundry mode (mark items as dirty/clean)
- Packing list generator for trips
- Share outfits between Ally and Gerry
