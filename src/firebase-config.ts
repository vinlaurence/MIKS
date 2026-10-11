// Paste your Firebase project's Web config here.
// Get it free at https://console.firebase.google.com → Project settings → Your apps → Web app.
// This config is PUBLIC by design (not a secret) — Firebase security rules protect your data,
// not hiding this object. Safe to ship in client-side code.

export const firebaseConfig = {
  apiKey: "AIzaSyA102YFPfcnrvE9wtpA4up3okZVwftOI1U",
  authDomain: "miks-510e5.firebaseapp.com",
  projectId: "miks-510e5",
  storageBucket: "miks-510e5.firebasestorage.app",
  messagingSenderId: "327074056043",
  appId: "1:327074056043:web:77fec7138883978f84ee2e",
};

export const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY" && !!firebaseConfig.apiKey;
