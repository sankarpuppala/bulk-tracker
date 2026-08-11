# FUEL & FORGE — Bulk Tracker

A cross-device gym & nutrition tracker built with vanilla HTML/CSS/JS and Firebase.

## Features
- 🔥 **Firebase Firestore** — real-time sync across phone & laptop
- 🔐 **Email/Password auth** — only you can access your data
- 📊 **Macro tracking** — calories, protein, carbs with visual progress bars
- 🏋️ **Gym plan** — Push/Pull/Legs with exercise check-offs
- 📅 **Weekly C-Mess menu** — pre-loaded with your hostel meals
- 🏆 **Streak tracking** — 28-day calendar + consecutive day counter
- 📱 **PWA** — install on your phone home screen
- 🌙 **Offline support** — Firestore persistence for spotty wifi

## Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Firestore Database** (production mode)
3. Enable **Email/Password** auth and add your user
4. Register a **web app** and copy the `firebaseConfig`
5. Paste your config into `index.html` (replace the placeholder)
6. Copy rules from `firestore.rules` into Firestore → Rules → Publish
7. Push to GitHub and enable GitHub Pages

## Tech
- Vanilla HTML/CSS/JS (zero build tools)
- Firebase v10 compat SDK (CDN)
- Firestore for data, Auth for login
- PWA manifest for mobile install
