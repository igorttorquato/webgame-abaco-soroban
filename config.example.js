// Modelo de configuração do Firebase.
// Copie este arquivo para "config.js" e preencha com os dados do SEU
// projeto (Console do Firebase > Configurações do projeto > Seus apps
// > SDK). O arquivo config.js não é versionado no git (veja
// .gitignore) e precisa ser criado manualmente em cada ambiente/deploy.
//
// Sem o config.js, o jogo funciona normalmente, só que cada
// dispositivo guarda seu próprio ranking localmente, em vez de um
// ranking compartilhado entre todo mundo.
window.FIREBASE_CONFIG = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU-PROJETO.firebaseapp.com",
  databaseURL: "https://SEU-PROJETO-default-rtdb.firebaseio.com",
  projectId: "SEU-PROJETO",
  storageBucket: "SEU-PROJETO.firebasestorage.app",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
};
