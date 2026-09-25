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
  try{
    if(firebaseConfig && firebaseConfig.apiKey && window.firebase){
      firebase.initializeApp(firebaseConfig);
      dbRef = firebase.database().ref("rankings");
    }
  }catch(e){
    dbRef = null;
  }

  var LOCAL_RANKING_KEY = "soroban-ranking-v1";

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

  // getPlayerScore(name, callback): callback(score) — busca no Firebase
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

  function renderRankingFromEntries(entries){
    entries.sort(function(a, b){ return b.score - a.score; });

    var listEl = document.getElementById("ranking-list");
    var emptyEl = document.getElementById("ranking-empty");
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
    function fallback(){
      var ranking = loadLocalRanking();
      renderRankingFromEntries(Object.keys(ranking).map(function(k){ return ranking[k]; }));
    }
    if(dbRef){
      raceWithTimeout(
        function(){ return dbRef.once("value"); },
        5000,
        function(snap){
          var data = snap.val() || {};
          renderRankingFromEntries(Object.keys(data).map(function(k){ return data[k]; }));
        },
        fallback
      );
    } else {
      fallback();
    }
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
    upperBead.style.top = (s.upper ? 1 : 0) * SLOT + "px";
    upperBead.classList.toggle("active", s.upper);
    upperBead.setAttribute("aria-pressed", s.upper ? "true" : "false");

    var lowerBeads = rod.querySelectorAll(".bead.lower");
    for(var b = 1; b <= 4; b++){
      var el = lowerBeads[b - 1];
      var active = b <= s.lower;
      var slot = active ? (b - 1) : b;
      el.style.top = slot * SLOT + "px";
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
      score += 10;
      scoreEl.textContent = score;
      savePlayerScore(currentPlayer, score);
      feedbackEl.textContent = "Isso mesmo! +10 pontos";
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
      nameHint.hidden = false;
      nameInput.focus();
      return;
    }
    nameHint.hidden = true;
    currentPlayer = name;
    var startBtn = this;
    startBtn.disabled = true;
    var originalLabel = startBtn.textContent;
    startBtn.textContent = "Carregando...";
    getPlayerScore(currentPlayer, function(existingScore){
      score = existingScore;
      scoreEl.textContent = score;
      playerTagEl.textContent = currentPlayer;
      startBtn.disabled = false;
      startBtn.textContent = originalLabel;
      showScreen("game-screen");
      buildRods();
      newOperation();
    });
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
