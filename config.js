// Réglages de l'app Jeudi Sherboy.
// Ce fichier est public sur GitHub : n'y mets jamais de mot de passe.
// Les clés Firebase ci-dessous sont faites pour être publiques.
self.JS_CONFIG = {
  // 1. Colle ici la configuration de ton app web Firebase
  //    (Console Firebase > Paramètres du projet > Vos applications > Config).
  firebase: {
    apiKey: "AIzaSyClTSBuCGOH5jfVS1zuQZAhOlWJumRjjac",
    authDomain: "jeudi---sherboys.firebaseapp.com",
    projectId: "jeudi---sherboys",
    storageBucket: "jeudi---sherboys.firebasestorage.app",
    messagingSenderId: "1020451259777",
    appId: "1:1020451259777:web:6e0a90f95f6486a9ba9480"
  },

  // 2. Colle ici la « clé de paire » Web Push
  //    (Console Firebase > Paramètres du projet > Cloud Messaging > Certificats Web Push).
  vapidKey: "BBuhpgRYlIrgp6X6Z9O3PU0kSn6w4lGTOyK25c2ON7rGNuivYLydK3Xvn3GDjCTeBaBY3cbwG1PBbHBhuW44y6M",

  // 3. L'adresse de l'app une fois en ligne, par exemple https://tonnom.github.io/jeudi-sherboy/
  siteUrl: "https://garagelegeneral-180.github.io/jeudi-sherboy/",

  // La gang. L'ordre sert aussi à la rotation du capitaine.
  members: [
    { id: "alex", name: "Alex", color: "#2b45d8" },
    { id: "charles", name: "Charles-Olivier", color: "#d0592a" },
    { id: "dav", name: "Dav", color: "#1f9d63" },
    { id: "francois", name: "François", color: "#8a3fc7" },
    { id: "fros", name: "Fros", color: "#c2397a" },
    { id: "jean", name: "Jean", color: "#0f8a9a" },
    { id: "jonathan", name: "Jonathan", color: "#b06a00" },
    { id: "mathieu", name: "Mathieu", color: "#5a6b1a" }
  ],

  // Nombre de présents pour que le jeudi « lève ».
  quorum: 4
};
