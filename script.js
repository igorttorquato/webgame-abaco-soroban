(function(){
  "use strict";

  var SLOT = 38;
  var PLACES_BASIC = [
    { label: "centena", short: "C", value: 100 },
    { label: "dezena", short: "D", value: 10 },
    { label: "unidade", short: "U", value: 1 }
  ];
  var PLACES_ADVANCED = [
    { label: "centena de milhar", short: "CM", value: 100000 },
    { label: "dezena de milhar", short: "DM", value: 10000 },
    { label: "milhar", short: "M", value: 1000 },
    { label: "centena", short: "C", value: 100 },
    { label: "dezena", short: "D", value: 10 },
    { label: "unidade", short: "U", value: 1 }
  ];

  var difficulty = "basic";
  var PLACES = PLACES_BASIC;
  var state = PLACES.map(function(){ return { upper:false, lower:0 }; });
  var score = 0;
  var dailyScore = 0;
  var currentAnswer = 0;
  var awaitingNext = false;
  var currentPlayer = "";

  var rodsEl = document.getElementById("rods");
  var operationEl = document.getElementById("operation-text");
  var scoreEl = document.getElementById("score-value");
  var feedbackEl = document.getElementById("feedback");
  var checkBtn = document.getElementById("check-btn");
  var playerTagEl = document.getElementById("player-tag");

  // ---------------------------------------------------------------
  // Configuração do Firebase: vem do arquivo config.js (não versionado
  // no git — veja config.example.js e o README para instruções).
  // Sem esse arquivo, o jogo funciona normalmente, só que cada
  // aparelho guarda seu próprio ranking local em vez de compartilhado.
  // ---------------------------------------------------------------
  var firebaseConfig = window.FIREBASE_CONFIG || null;

  var dbRef = null;
  var activeRef = null;
  var dailyRef = null;
  try{
    if(firebaseConfig && firebaseConfig.apiKey && window.firebase){
      firebase.initializeApp(firebaseConfig);
      dbRef = firebase.database().ref("rankings");
      activeRef = firebase.database().ref("active_players");
      dailyRef = firebase.database().ref("daily_rankings");
    }
  }catch(e){
    dbRef = null;
    activeRef = null;
    dailyRef = null;
  }

  var currentLockKey = null; // usuário travado por esta aba, se houver

  var LOCAL_RANKING_KEY = "soroban-ranking-v1";
  var LOCAL_DAILY_PREFIX = "soroban-daily-ranking-v1-";

  // todayKey(): data local do aparelho no formato AAAA-MM-DD. O ranking
  // diário vale até 23:59 no fuso horário de quem está jogando.
  function todayKey(){
    var d = new Date();
    var pad = function(n){ return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function sanitizeKey(name){
    return name.trim().toLowerCase().replace(/[.#$\[\]\/]/g, "_");
  }

  function loadLocalRanking(){
    try{
      var raw = localStorage.getItem(LOCAL_RANKING_KEY);
      return raw ? JSON.parse(raw) : {};
    }catch(e){
      return {};
    }
  }

  function saveLocalRanking(ranking){
    try{
      localStorage.setItem(LOCAL_RANKING_KEY, JSON.stringify(ranking));
    }catch(e){
      // localStorage indisponível — o jogo segue funcionando só sem
      // guardar pontos entre sessões.
    }
  }

  function loadLocalDailyRanking(){
    try{
      var raw = localStorage.getItem(LOCAL_DAILY_PREFIX + todayKey());
      return raw ? JSON.parse(raw) : {};
    }catch(e){
      return {};
    }
  }

  function saveLocalDailyRanking(ranking){
    try{
      localStorage.setItem(LOCAL_DAILY_PREFIX + todayKey(), JSON.stringify(ranking));
    }catch(e){
      // idem — sem localStorage, só não persiste entre sessões.
    }
  }

  // raceWithTimeout: chama promiseFn(); se ela responder antes de "ms"
  // milissegundos, usa onResult; senão (ou se der erro), usa onFallback.
  // Garante que a tela nunca fique "carregando" para sempre.
  function raceWithTimeout(promiseFn, ms, onResult, onFallback){
    var settled = false;
    var timer = setTimeout(function(){
      if(settled) return;
      settled = true;
      onFallback();
    }, ms);
    promiseFn().then(function(value){
      if(settled) return;
      settled = true;
      clearTimeout(timer);
      onResult(value);
    }).catch(function(){
      if(settled) return;
      settled = true;
      clearTimeout(timer);
      onFallback();
    });
  }

  // acquireNameLock(name, callback): callback("ok" | "taken").
  // Usa uma transação do Firebase para reservar o nome de forma segura
  // mesmo se duas pessoas clicarem "Iniciar" ao mesmo tempo. Se o
  // Firebase não estiver configurado, ou não responder em 5s, deixa
  // jogar mesmo assim (não dá pra checar sem conexão compartilhada).
  function acquireNameLock(name, callback){
    if(!activeRef){
      callback("ok");
      return;
    }
    var key = sanitizeKey(name);
    raceWithTimeout(
      function(){
        return activeRef.child(key).transaction(function(current){
          if(current === true){
            return; // já em uso — aborta a transação
          }
          return true;
        });
      },
      5000,
      function(result){
        if(result && result.committed){
          currentLockKey = key;
          activeRef.child(key).onDisconnect().remove();
          callback("ok");
        } else {
          callback("taken");
        }
      },
      function(){ callback("ok"); }
    );
  }

  // releaseNameLock(): libera o nome travado por esta aba (ex.: ao
  // clicar em "Sair"). O onDisconnect cuida do caso da aba ser
  // fechada sem avisar.
  function releaseNameLock(){
    if(activeRef && currentLockKey){
      activeRef.child(currentLockKey).onDisconnect().cancel();
      activeRef.child(currentLockKey).remove();
      currentLockKey = null;
    }
  }
  // quando configurado; cai para o armazenamento local caso contrário,
  // se a rede falhar, ou se não responder em 5 segundos.
  function getPlayerScore(name, callback){
    var key = sanitizeKey(name);
    function fallback(){
      var ranking = loadLocalRanking();
      callback(ranking[key] ? ranking[key].score : 0);
    }
    if(dbRef){
      raceWithTimeout(
        function(){ return dbRef.child(key).once("value"); },
        5000,
        function(snap){ var data = snap.val(); callback(data ? data.score : 0); },
        fallback
      );
    } else {
      fallback();
    }
  }

  function savePlayerScore(name, newScore){
    var key = sanitizeKey(name);
    var entry = { name: name.trim(), score: newScore };
    if(dbRef){
      dbRef.child(key).set(entry).catch(function(){ /* sem rede — tenta de novo na próxima jogada */ });
    }
    var ranking = loadLocalRanking();
    ranking[key] = entry;
    saveLocalRanking(ranking);
  }

  // getDailyScore/saveDailyScore: mesma lógica do ranking geral, só
  // que guardadas debaixo da data de hoje (daily_rankings/AAAA-MM-DD),
  // então cada novo dia começa zerado sozinho.
  function getDailyScore(name, callback){
    var key = sanitizeKey(name);
    function fallback(){
      var ranking = loadLocalDailyRanking();
      callback(ranking[key] ? ranking[key].score : 0);
    }
    if(dailyRef){
      raceWithTimeout(
        function(){ return dailyRef.child(todayKey()).child(key).once("value"); },
        5000,
        function(snap){ var data = snap.val(); callback(data ? data.score : 0); },
        fallback
      );
    } else {
      fallback();
    }
  }

  function saveDailyScore(name, newScore){
    var key = sanitizeKey(name);
    var entry = { name: name.trim(), score: newScore };
    if(dailyRef){
      dailyRef.child(todayKey()).child(key).set(entry).catch(function(){ /* tenta de novo na próxima jogada */ });
    }
    var ranking = loadLocalDailyRanking();
    ranking[key] = entry;
    saveLocalDailyRanking(ranking);
  }

  function renderRankingFromEntries(entries, listElId, emptyElId){
    entries.sort(function(a, b){ return b.score - a.score; });

    var listEl = document.getElementById(listElId);
    var emptyEl = document.getElementById(emptyElId);
    listEl.innerHTML = "";

    if(entries.length === 0){
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    entries.forEach(function(entry, i){
      var li = document.createElement("li");
      if(currentPlayer && entry.name.trim().toLowerCase() === currentPlayer.trim().toLowerCase()){
        li.classList.add("is-you");
      }
      var pos = document.createElement("span");
      pos.className = "rank-pos";
      pos.textContent = (i + 1) + ".";
      var name = document.createElement("span");
      name.className = "rank-name";
      name.textContent = entry.name;
      var pts = document.createElement("span");
      pts.className = "rank-score";
      pts.textContent = entry.score;
      li.appendChild(pos);
      li.appendChild(name);
      li.appendChild(pts);
      listEl.appendChild(li);
    });
  }

  function renderRanking(){
    // Ranking geral
    (function(){
      function fallback(){
        var ranking = loadLocalRanking();
        renderRankingFromEntries(Object.keys(ranking).map(function(k){ return ranking[k]; }), "ranking-list-global", "ranking-empty-global");
      }
      if(dbRef){
        raceWithTimeout(
          function(){ return dbRef.once("value"); },
          5000,
          function(snap){
            var data = snap.val() || {};
            renderRankingFromEntries(Object.keys(data).map(function(k){ return data[k]; }), "ranking-list-global", "ranking-empty-global");
          },
          fallback
        );
      } else {
        fallback();
      }
    })();

    // Ranking de hoje
    (function(){
      function fallback(){
        var ranking = loadLocalDailyRanking();
        renderRankingFromEntries(Object.keys(ranking).map(function(k){ return ranking[k]; }), "ranking-list-daily", "ranking-empty-daily");
      }
      if(dailyRef){
        raceWithTimeout(
          function(){ return dailyRef.child(todayKey()).once("value"); },
          5000,
          function(snap){
            var data = snap.val() || {};
            renderRankingFromEntries(Object.keys(data).map(function(k){ return data[k]; }), "ranking-list-daily", "ranking-empty-daily");
          },
          fallback
        );
      } else {
        fallback();
      }
    })();
  }

  function showScreen(id){
    ["start-screen", "game-screen", "ranking-screen"].forEach(function(s){
      document.getElementById(s).hidden = (s !== id);
    });
  }

  function fitSoroban(){
    var wrap = document.querySelector(".soroban-wrap");
    if(!wrap || wrap.clientWidth === 0) return;
    var count = PLACES.length;
    var gap = 8;
    var available = wrap.clientWidth - 28 - gap * (count - 1); // frame's own horizontal padding + gaps
    var slot = Math.floor(available / count);
    slot = Math.max(24, Math.min(slot, 38));
    var bead = Math.max(16, slot - 8);
    SLOT = slot;
    document.documentElement.style.setProperty("--rod-width", slot + "px");
    document.documentElement.style.setProperty("--bead-size", bead + "px");
    document.documentElement.style.setProperty("--slot", slot + "px");
    if(rodsEl.children.length){ renderAll(); }
  }

  function buildRods(){
    rodsEl.innerHTML = "";
    state = PLACES.map(function(){ return { upper:false, lower:0 }; });
    PLACES.forEach(function(place, i){
      var rod = document.createElement("div");
      rod.className = "rod";

      var rail = document.createElement("div");
      rail.className = "rail";
      rod.appendChild(rail);

      var upperTrack = document.createElement("div");
      upperTrack.className = "upper-track";
      var upperBead = document.createElement("div");
      upperBead.className = "bead upper";
      upperBead.tabIndex = 0;
      upperBead.setAttribute("role", "button");
      upperBead.setAttribute("aria-label", "Conta de valor 5, haste da " + place.label);
      upperBead.addEventListener("click", function(){ toggleUpper(i); });
      upperBead.addEventListener("keydown", function(e){
        if(e.key === "Enter" || e.key === " "){ e.preventDefault(); toggleUpper(i); }
      });
      upperTrack.appendChild(upperBead);
      rod.appendChild(upperTrack);

      var beam = document.createElement("div");
      beam.className = "beam";
      if(place.value === 1){
        var mark = document.createElement("div");
        mark.className = "unit-mark";
        beam.appendChild(mark);
      }
      rod.appendChild(beam);

      var lowerTrack = document.createElement("div");
      lowerTrack.className = "lower-track";
      for(var b = 1; b <= 4; b++){
        var lowerBead = document.createElement("div");
        lowerBead.className = "bead lower";
        lowerBead.tabIndex = 0;
        lowerBead.setAttribute("role", "button");
        lowerBead.setAttribute("aria-label", "Conta de valor 1, posição " + b + ", haste da " + place.label);
        (function(idx){
          lowerBead.addEventListener("click", function(){ setLower(i, idx); });
          lowerBead.addEventListener("keydown", function(e){
            if(e.key === "Enter" || e.key === " "){ e.preventDefault(); setLower(i, idx); }
          });
        })(b);
        lowerTrack.appendChild(lowerBead);
      }
      rod.appendChild(lowerTrack);

      rodsEl.appendChild(rod);
    });
    buildCaptions();
    fitSoroban();
  }

  function buildCaptions(){
    var captionsEl = document.getElementById("captions");
    captionsEl.innerHTML = "";
    PLACES.forEach(function(place){
      var item = document.createElement("span");
      item.className = "caption-item";
      item.textContent = place.short;
      item.setAttribute("aria-hidden", "true");
      captionsEl.appendChild(item);
    });
  }

  function toggleUpper(rodIndex){
    state[rodIndex].upper = !state[rodIndex].upper;
    render(rodIndex);
  }

  function setLower(rodIndex, clickedBeadNumber){
    var current = state[rodIndex].lower;
    state[rodIndex].lower = (clickedBeadNumber <= current) ? clickedBeadNumber - 1 : clickedBeadNumber;
    render(rodIndex);
  }

  function render(rodIndex){
    var rod = rodsEl.children[rodIndex];
    var s = state[rodIndex];

    var upperBead = rod.querySelector(".bead.upper");
    upperBead.style.transform = "translate(-50%, " + ((s.upper ? 1 : 0) * SLOT) + "px) rotate(45deg)";
    upperBead.classList.toggle("active", s.upper);
    upperBead.setAttribute("aria-pressed", s.upper ? "true" : "false");

    var lowerBeads = rod.querySelectorAll(".bead.lower");
    for(var b = 1; b <= 4; b++){
      var el = lowerBeads[b - 1];
      var active = b <= s.lower;
      var slot = active ? (b - 1) : b;
      el.style.transform = "translate(-50%, " + (slot * SLOT) + "px) rotate(45deg)";
      el.classList.toggle("active", active);
      el.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function renderAll(){
    PLACES.forEach(function(_, i){ render(i); });
  }

  function currentTotal(){
    return state.reduce(function(sum, s, i){
      var digit = (s.upper ? 5 : 0) + s.lower;
      return sum + digit * PLACES[i].value;
    }, 0);
  }

  function resetBeads(){
    state = PLACES.map(function(){ return { upper:false, lower:0 }; });
    renderAll();
  }

  function randInt(min, max){
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function newOperation(){
    var a, b, op;
    if(difficulty === "advanced"){
      if(Math.random() < 0.5){
        op = "+";
        a = randInt(1000, 45000);
        b = randInt(1000, 45000);
        currentAnswer = a + b;
      } else {
        op = "\u2212";
        a = randInt(10000, 98000);
        b = randInt(1000, a - 1);
        currentAnswer = a - b;
      }
    } else {
      if(Math.random() < 0.5){
        op = "+";
        a = randInt(5, 89);
        b = randInt(5, 89);
        currentAnswer = a + b;
      } else {
        op = "\u2212";
        a = randInt(20, 98);
        b = randInt(1, a - 1);
        currentAnswer = a - b;
      }
    }
    operationEl.textContent = a + " " + op + " " + b + " = ?";
    feedbackEl.textContent = "";
    feedbackEl.className = "feedback";
    resetBeads();
  }

  function setDifficulty(mode){
    difficulty = mode;
    PLACES = mode === "advanced" ? PLACES_ADVANCED : PLACES_BASIC;
    document.getElementById("label-basic").classList.toggle("active", mode === "basic");
    document.getElementById("label-advanced").classList.toggle("active", mode === "advanced");
    buildRods();
    newOperation();
  }

  function checkAnswer(){
    if(awaitingNext) return;
    if(currentTotal() === currentAnswer){
      var pointsEarned = (difficulty === "advanced") ? 35 : 10;
      score += pointsEarned;
      dailyScore += pointsEarned;
      scoreEl.textContent = score;
      savePlayerScore(currentPlayer, score);
      saveDailyScore(currentPlayer, dailyScore);
      feedbackEl.textContent = "Isso mesmo! +" + pointsEarned + " pontos";
      feedbackEl.className = "feedback correct";
      awaitingNext = true;
      operationEl.classList.add("fading");
      setTimeout(function(){
        newOperation();
        operationEl.classList.remove("fading");
        awaitingNext = false;
      }, 1100);
    } else {
      feedbackEl.textContent = "Ainda não — ajuste as contas e tente de novo.";
      feedbackEl.className = "feedback wrong";
    }
  }

  var nameInput = document.getElementById("player-name");
  var nameHint = document.getElementById("name-hint");
  nameInput.addEventListener("input", function(){
    if(!nameHint.hidden){ nameHint.hidden = true; }
  });
  nameInput.addEventListener("keydown", function(e){
    if(e.key === "Enter"){
      e.preventDefault();
      document.getElementById("start-btn").click();
    }
  });

  document.getElementById("start-btn").addEventListener("click", function(){
    var name = nameInput.value.trim();
    if(!name){
      nameHint.textContent = "Digite um usuário para começar.";
      nameHint.hidden = false;
      nameInput.focus();
      return;
    }
    nameHint.hidden = true;
    var startBtn = this;
    startBtn.disabled = true;
    var originalLabel = startBtn.textContent;
    startBtn.textContent = "Carregando...";

    acquireNameLock(name, function(lockResult){
      if(lockResult === "taken"){
        startBtn.disabled = false;
        startBtn.textContent = originalLabel;
        nameHint.textContent = "Esse usuário já está jogando agora. Escolha outro nome.";
        nameHint.hidden = false;
        nameInput.focus();
        return;
      }
      currentPlayer = name;
      getPlayerScore(currentPlayer, function(existingScore){
        score = existingScore;
        scoreEl.textContent = score;
        getDailyScore(currentPlayer, function(existingDaily){
          dailyScore = existingDaily;
          playerTagEl.textContent = currentPlayer;
          startBtn.disabled = false;
          startBtn.textContent = originalLabel;
          showScreen("game-screen");
          buildRods();
          newOperation();
        });
      });
    });
  });

  document.getElementById("exit-btn").addEventListener("click", function(){
    releaseNameLock();
    currentPlayer = "";
    awaitingNext = false;
    showScreen("start-screen");
  });

  document.getElementById("ranking-btn").addEventListener("click", function(){
    renderRanking();
    showScreen("ranking-screen");
  });

  document.getElementById("ranking-back-btn").addEventListener("click", function(){
    showScreen("start-screen");
  });

  document.getElementById("difficulty-switch").addEventListener("change", function(){
    setDifficulty(this.checked ? "advanced" : "basic");
  });

  var howtoToggle = document.getElementById("howto-toggle");
  var howtoPanel = document.getElementById("howto-panel");
  howtoToggle.addEventListener("click", function(){
    var isHidden = howtoPanel.hidden;
    howtoPanel.hidden = !isHidden;
    howtoToggle.setAttribute("aria-expanded", isHidden ? "true" : "false");
  });

  checkBtn.addEventListener("click", checkAnswer);

  var resizeTimer = null;
  window.addEventListener("resize", function(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitSoroban, 120);
  });
})();
