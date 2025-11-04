// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDXjtK54ibwj0jQCa6vT6i57ry0cipAksI",
  authDomain: "grantnexusrit.firebaseapp.com",
  projectId: "grantnexusrit",
  appId: "1:231629766267:web:07076694bf05b2c7c4acde",
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { auth, provider };