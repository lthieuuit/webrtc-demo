import firebase from "firebase/compat/app";

const firebaseConfig = {
  apiKey: "AIzaSyD2z3kpO_nHyaJ5GX_OhKzTU1GTaCthD8I",
  authDomain: "testwebrtc-2c35d.firebaseapp.com",
  databaseURL:
    "https://testwebrtc-2c35d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "testwebrtc-2c35d",
  storageBucket: "testwebrtc-2c35d.appspot.com",
  messagingSenderId: "940670506962",
  appId: "1:940670506962:web:a5fca37018ca1db9d81a0b",
};

const firebaseApp = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

export default db;
