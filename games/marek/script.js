// Game State
let countriesData = { easy: [], tough: [], hard: [] };
let currentCountry = null;
let currentScore = 0;
let totalPlayed = 0;

// DOM Elements
const elements = {
  difficulty: document.getElementById("difficulty"),
  levelText: document.getElementById("current-level-text"),
  flagImg: document.getElementById("flag-img"),
  optionsContainer: document.getElementById("options-container"),
  scoreCurrent: document.getElementById("score-current"),
  scoreTotal: document.getElementById("score-total"),
  feedback: document.getElementById("feedback-message"),
  feedbackIcon: document.getElementById("feedback-icon"),
  feedbackText: document.getElementById("feedback-text"),
  nextBtn: document.getElementById("next-btn"),
  mapContainer: document.getElementById("map-container"),
};

// Initialize Game
async function initGame() {
  loadScore();
  await fetchCountries();
  setupEventListeners();
  loadNewFlag();
}

// Fetch and Categorize Data
async function fetchCountries() {
  try {
    const res = await fetch(
      "https://restcountries.com/v3.1/all?fields=name,flags,population,area,latlng",
    );
    let data = await res.json();

    // Filter out incomplete data
    data = data.filter((c) => c.name && c.flags && c.population && c.area);

    /**
     * DIFFICULTY CALCULATION
     * We calculate a "Visibility Score". 
     * High Score = Large area + Large population = Easy to recognize.
     * Low Score = Small area + Small population = Hard to recognize.
     */
    data.sort((a, b) => {
      // Using log scales prevents massive countries from completely drowning out the rest
      // Having +1 makes sure that a small country doesn't give us a negative number. (Vatican has 0.44 square km)
      const scoreA = Math.log10(a.area + 1) * Math.log10(a.population + 1);
      const scoreB = Math.log10(b.area + 1) * Math.log10(b.population + 1);
      return scoreB - scoreA; // Descending: Biggest/Most Populated first
    });

    // Split into 3 difficulty tiers
    const total = data.length;
    const easyEnd = Math.floor(total * 0.30);   // Top 30% (The giants)
    const toughEnd = Math.floor(total * 0.70);  // Middle 40% 
    
    countriesData.easy = data.slice(0, easyEnd);
    countriesData.tough = data.slice(easyEnd, toughEnd);
    countriesData.hard = data.slice(toughEnd);

    console.log(`Loaded: ${countriesData.easy.length} Easy, ${countriesData.tough.length} Tough, ${countriesData.hard.length} Hard`);
  } catch (err) {
    console.error("Failed to load countries API", err);
  }
}

// Generate Options
function loadNewFlag() {
  const difficulty = elements.difficulty.value;
  elements.flagImg.style.opacity = "0";
  elements.levelText.innerText = difficulty;

  //get country pool
  const pool = countriesData[difficulty];
  if (!pool || pool.length === 0) return;

  // Reset UI state
  elements.feedback.className = "feedback hidden";
  elements.nextBtn.classList.add("hidden");
  elements.mapContainer.classList.add("hidden");
  elements.mapContainer.innerHTML = "";

  // Pick correct answer
  currentCountry = getRandomItem(pool);
  elements.flagImg.src = currentCountry.flags.svg;

  // Pick 4 wrong answers
  let options = [currentCountry];
  while (options.length < 5) {
    const randomWrong = getRandomItem(pool);
    if (!options.includes(randomWrong)) {
      options.push(randomWrong);
    }
  }

  options = shuffleArray(options);
  renderButtons(options);

  elements.flagImg.onload = () => {
    elements.flagImg.style.opacity = "1";
    toggleButtons(false)
  }
}

// Render the 5 buttons
function renderButtons(options) {
  elements.optionsContainer.innerHTML = "";
  options.forEach((country) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.innerText = country.name.common;
    btn.onclick = () => checkAnswer(btn, country);
    elements.optionsContainer.appendChild(btn);
  });
}

// Handle Guess Logic
function checkAnswer(clickedBtn, guessedCountry) {
  const isCorrect = guessedCountry.name.common === currentCountry.name.common;
  const buttons = document.querySelectorAll(".option-btn");

  // Disable all buttons
  buttons.forEach((btn) => (btn.disabled = true));

  totalPlayed++;

  if (isCorrect) {
    clickedBtn.classList.add("correct-btn");
    currentScore++;

    elements.feedback.className = "feedback success";
    elements.feedbackIcon.innerText = "✅";
    elements.feedbackText.innerText = "Nice job!";
  } else {
    clickedBtn.classList.add("wrong-btn");

    // Find and highlight correct answer
    buttons.forEach((btn) => {
      if (btn.innerText === currentCountry.name.common) {
        btn.classList.add("correct-btn");
      }
    });

    elements.feedback.className = "feedback error";
    elements.feedbackIcon.innerText = "❌";
    elements.feedbackText.innerText = `Wrong, the correct answer was ${currentCountry.name.common}.`;
  }

  saveScore();
  elements.nextBtn.classList.remove("hidden");
  showMap(currentCountry.latlng[0], currentCountry.latlng[1]);
}

// Show OpenStreetMap iframe (Requirement: World Map display)
function showMap(lat, lng) {
  if (!lat || !lng) return;
  const bbox = `${lng - 10},${lat - 10},${lng + 10},${lat + 10}`;
  elements.mapContainer.innerHTML = `
        <iframe 
            src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}"
        ></iframe>
    `;
  elements.mapContainer.classList.remove("hidden");
}

// LocalStorage Handlers
function saveScore() {
  elements.scoreCurrent.innerText = currentScore;
  elements.scoreTotal.innerText = totalPlayed;
  localStorage.setItem("flagScore", currentScore);
  localStorage.setItem("flagTotal", totalPlayed);
}

function loadScore() {
  currentScore = parseInt(localStorage.getItem("flagScore")) || 0;
  totalPlayed = parseInt(localStorage.getItem("flagTotal")) || 0;
  elements.scoreCurrent.innerText = currentScore;
  elements.scoreTotal.innerText = totalPlayed;
}

// Helpers
function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

function setupEventListeners() {
  elements.difficulty.addEventListener("change", () => {
    // Changing difficulty resets the score and total to reflect the new session type
    currentScore = 0;
    totalPlayed = 0;
    saveScore();
    loadNewFlag();
  });
  elements.nextBtn.addEventListener("click", loadNewFlag);
}

// Start
initGame();
