// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyACfKJ3y9rtNlsyqCW7zttNiFSa1iS6Rx8",
  authDomain: "casediver.firebaseapp.com",
  projectId: "casediver",
  storageBucket: "casediver.firebasestorage.app",
  messagingSenderId: "745534418798",
  appId: "1:745534418798:web:4bb6f1dfc8d8644c57db7f",
  measurementId: "G-QTWR031NVJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Import Auth, Firestore, Functions, and Storage
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

// Initialize Auth, Firestore, Functions, and Storage
export const auth = getAuth(app);
export const db = getFirestore(app);
// Connect to us-central1 region to match Cloud Functions deployment
export const functions = getFunctions(app, 'us-central1');
export const storage = getStorage(app);

// Export the app and analytics for use throughout your app
export { app, analytics };

