// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC7S95uwhAEZ8QjDr-o8xFl9enUeyONAK4",
  authDomain: "speechcase.firebaseapp.com",
  projectId: "speechcase",
  storageBucket: "speechcase.firebasestorage.app",
  messagingSenderId: "910920936070",
  appId: "1:910920936070:web:e6fe9d227741c0877dff07",
  measurementId: "G-PJV7K0Y5VB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics (only in browser environment)
let analytics = null;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

// Export the app and analytics for use throughout your app
export { app, analytics };

// You can also export other Firebase services here as you add them:
// export { getAuth } from "firebase/auth";
// export { getFirestore } from "firebase/firestore";
// export { getStorage } from "firebase/storage";

