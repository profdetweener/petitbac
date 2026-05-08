/**
 * Vue "scoring" : affichage des scores de la manche + classement cumule.
 *
 * Tableau inverse comme view-validating : lignes = joueurs, colonnes = categories.
 * Couleurs des cellules selon le type de score (alone/unique/duplicate/invalid).
 *
 * Boutons host :
 *   - "Manche suivante" (ou "Voir le classement final" sur la derniere manche)
 *   - "Terminer la partie maintenant" (avec confirmation)
 */

export function initScoringView(state, conn) {
  const tableEl = document.getElementById("round-scores-table");
  const rankingEl = document.getElementById("cumulative-ranking");
  const roundNumberEl = document.getElementById("sc-round-number");
  const roundTotalEl = document.getElementById("sc-round-total");
  const letterValueEl = document.getElementById("sc-letter-value");
  const hostActionsEl = document.getElementById("scoring-host-actions");
  const waitingEl = document.getElementById("scoring-waiting");
  const nextBtn = document.getElementById("btn-next-round");
  const endGameBtn = document.getElementById("btn-end-game-scoring");

  // On garde en cache pour pouvoir mettre a jour le bouton "next" si l'etat host change
  let lastTotalRounds = 0;
  let lastResult = null;

  state.renderScoring = function (msg) {
    const result = msg.result;
    const players = msg.players;
    lastResult = result;
    lastTotalRounds = msg.totalRounds ?? state.config?.totalRounds ?? 0;

    roundNumberEl.textContent = result.roundNumber;
    if (lastTotalRounds > 0) {
      roundTotalEl.textContent = `/ ${lastTotalRounds}`;
    } else {
      roundTotalEl.textContent = "";
    }
    letterValueEl.textContent = result.letter;

    const categories = msg.categories ?? state.config?.categories ?? [];
    const pseudos = Object.keys(result.scoreByPlayer);
    const scoring = state.config?.scoring ?? {
      aloneInCategory: 15,
      uniqueAnswer: 10,
      duplicateAnswer: 5,
      invalidOrEmpty: 0,
    };

    // === Tableau scores manche : lignes = joueurs, colonnes = categories ===
    tableEl.innerHTML = "";

    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");
    const thPseudo = document.createElement("th");
    thPseudo.className = "col-category";
    thPseudo.textContent = "Joueur";
    trHead.appendChild(thPseudo);
    for (const category of categories) {
      const th = document.createElement("th");
      th.textContent = category;
      trHead.appendChild(th);
    }
    const thTotal = document.createElement("th");
    thTotal.textContent = "Total";
    trHead.appendChild(thTotal);
    thead.appendChild(trHead);
    tableEl.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const pseudo of pseudos) {
      const tr = document.createElement("tr");
      const tdPseudo = document.createElement("td");
      tdPseudo.className = "col-category";
      tdPseudo.textContent = pseudo + (pseudo === state.myPseudo ? " (toi)" : "");
      tr.appendChild(tdPseudo);

      for (const category of categories) {
        const td = document.createElement("td");
        const score = result.cellScores[pseudo]?.[category] ?? 0;
        const answer = result.answers[pseudo]?.[category] ?? "";
        td.classList.add("score-cell");
        if (score === scoring.aloneInCategory && answer.trim()) {
          td.classList.add("alone");
        } else if (score === scoring.uniqueAnswer && answer.trim()) {
          td.classList.add("unique");
        } else if (score === scoring.duplicateAnswer && answer.trim()) {
          td.classList.add("duplicate");
        } else {
          td.classList.add("invalid");
        }
        const scoreEl = document.createElement("div");
        scoreEl.style.fontWeight = "700";
        scoreEl.textContent = score;
        const answerEl = document.createElement("div");
        answerEl.style.fontSize = "11px";
        answerEl.style.color = "#5a5a5a";
        answerEl.style.fontStyle = "italic";
        answerEl.textContent = answer.trim() ? answer : "—";
        td.appendChild(scoreEl);
        td.appendChild(answerEl);
        tr.appendChild(td);
      }

      // Cellule total ligne
      const tdTotal = document.createElement("td");
      tdTotal.style.fontWeight = "700";
      tdTotal.style.background = "var(--bleu-nuit-clair)";
      tdTotal.style.color = "var(--beige)";
      tdTotal.textContent = result.scoreByPlayer[pseudo] ?? 0;
      tr.appendChild(tdTotal);

      tbody.appendChild(tr);
    }
    tableEl.appendChild(tbody);

    // === Classement cumule ===
    rankingEl.innerHTML = "";
    const sorted = [...players].sort((a, b) => b.totalScore - a.totalScore);
    for (const p of sorted) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "rank-pseudo";
      name.textContent = p.pseudo;
      const score = document.createElement("span");
      score.className = "rank-score";
      score.textContent = `${p.totalScore} pts`;
      li.appendChild(name);
      li.appendChild(score);
      rankingEl.appendChild(li);
    }

    updateHostActions();
  };

  state.refreshScoringHostState = function () {
    updateHostActions();
  };

  function updateHostActions() {
    if (state.isHost) {
      hostActionsEl.style.display = "block";
      waitingEl.style.display = "none";
      // Adapter le label selon manche restante
      if (lastTotalRounds > 0 && state.currentRound >= lastTotalRounds) {
        nextBtn.textContent = "Voir le classement final →";
      } else {
        nextBtn.textContent = "Manche suivante →";
      }
    } else {
      hostActionsEl.style.display = "none";
      waitingEl.style.display = "block";
    }
  }

  nextBtn.addEventListener("click", () => {
    conn.send({ type: "next_round" });
  });

  endGameBtn.addEventListener("click", () => {
    if (confirm("Es-tu sur ? Cela mettra fin a la partie maintenant et passera directement au classement final.")) {
      conn.send({ type: "end_game" });
    }
  });
}
