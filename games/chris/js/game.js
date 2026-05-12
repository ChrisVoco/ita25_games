/* ── STORAGE ─────────────────────────────────────────────
   Save / load player progress via localStorage.
   Falls back to defaults if no save exists.
──────────────────────────────────────────────────────── */
const SAVE_KEY = 'bj_save_v2';
const DEFAULTS = {
  balance:     1000,
  wins:        0,
  losses:      0,
  streak:      0,
  bestBalance: 1000,
  history:     []
};

function loadSave() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SAVE_KEY)) }; }
  catch { return { ...DEFAULTS }; }
}

function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    balance, wins, losses, streak, bestBalance, history
  }));
}

/* ── STATE ───────────────────────────────────────────────
   All mutable game state lives here.
──────────────────────────────────────────────────────── */
let { balance, wins, losses, streak, bestBalance, history } = loadSave();
let bet         = 0;
let phase       = 'bet';   // 'bet' | 'play' | 'dealer' | 'over'
let playerHand  = [];
let dealerHand  = [];
let deck        = [];

/* ── DECK ────────────────────────────────────────────────
   Standard 52-card deck. Re-shuffled automatically when
   fewer than 15 cards remain.
──────────────────────────────────────────────────────── */
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RED_SUITS = new Set(['♥', '♦']);

function makeDeck() {
  const d = [];
  for (const s of SUITS)
    for (const r of RANKS)
      d.push({ r, s });
  return d.sort(() => Math.random() - 0.5);
}

function draw() {
  if (deck.length < 15) deck = makeDeck();
  return deck.pop();
}

function cardValue(r) {
  if (['J', 'Q', 'K'].includes(r)) return 10;
  if (r === 'A') return 11;
  return parseInt(r);
}

function handScore(hand, hideSecond = false) {
  const cards = hideSecond ? [hand[0]] : hand;
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.r === 'A') aces++;
    total += cardValue(c.r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

/* ── RENDER ──────────────────────────────────────────────
   Pure DOM helpers — never hold any game state.
──────────────────────────────────────────────────────── */
function buildCardEl(card, hidden = false) {
  const el = document.createElement('div');
  if (hidden) {
    el.className = 'card hidden';
    return el;
  }
  el.className = 'card ' + (RED_SUITS.has(card.s) ? 'red' : 'black');
  el.innerHTML = `
    <div class="c-top">${card.r}${card.s}</div>
    <div class="c-mid">${card.s}</div>
    <div class="c-bot">${card.r}${card.s}</div>`;
  return el;
}

function renderHands(hideDealer = true) {
  const dcEl = document.getElementById('dcards');
  const pcEl = document.getElementById('pcards');
  dcEl.innerHTML = '';
  pcEl.innerHTML = '';

  dealerHand.forEach((c, i) => dcEl.appendChild(buildCardEl(c, hideDealer && i === 1)));
  playerHand.forEach(c => pcEl.appendChild(buildCardEl(c)));

  const ps = handScore(playerHand);
  const ds = hideDealer ? handScore([dealerHand[0]]) : handScore(dealerHand);

  const psEl = document.getElementById('pscore');
  psEl.textContent = ps;
  psEl.className = 'score-pill' +
    (ps > 21 ? ' bust' : ps === 21 && playerHand.length === 2 ? ' bj' : '');

  const dsEl = document.getElementById('dscore');
  dsEl.textContent = ds;
  dsEl.className = 'score-pill' +
    (!hideDealer && ds > 21 ? ' bust' :
     !hideDealer && ds === 21 && dealerHand.length === 2 ? ' bj' : '');
}

function updateHUD() {
  document.getElementById('balance-val').textContent   = '$' + balance;
  document.getElementById('bet-val').textContent        = '$' + bet;
  document.getElementById('stat-wins').textContent     = wins;
  document.getElementById('stat-losses').textContent   = losses;
  document.getElementById('stat-streak').textContent   = (streak > 0 ? '+' : '') + streak;
  document.getElementById('stat-best').textContent     = '$' + bestBalance;
}

function setMsg(text, cls = '') {
  const el = document.getElementById('msg');
  el.textContent = text;
  el.className = cls;
}

function setBettingMode(isBetting) {
  document.getElementById('btn-clear').disabled  = !isBetting;
  document.getElementById('btn-allin').disabled  = !isBetting;
  document.getElementById('btn-deal').disabled   = !isBetting;
  document.getElementById('btn-hit').disabled    = isBetting;
  document.getElementById('btn-stand').disabled  = isBetting;
  document.getElementById('btn-double').disabled = isBetting;
  document.querySelectorAll('.chip')
    .forEach(c => c.classList.toggle('disabled', !isBetting));
}

function renderHistory() {
  const el = document.getElementById('history');
  el.innerHTML = '';
  history.slice(-15).forEach(h => {
    const p = document.createElement('div');
    p.className = 'hist-pill ' + h.type;
    p.textContent =
      h.type === 'BJ' ? 'BJ'      :
      h.type === 'W'  ? '+$'+h.amt :
      h.type === 'L'  ? '-$'+h.amt : '±0';
    el.appendChild(p);
  });
}

/* ── BETTING ─────────────────────────────────────────────
   Chip clicks, clear, all-in.
──────────────────────────────────────────────────────── */
function addBet(amount) {
  if (phase !== 'bet') return;
  if (bet + amount > balance) { setMsg("Not enough balance!"); return; }
  bet += amount;
  updateHUD();
  setMsg('Bet: $' + bet + ' — Deal when ready');
}

function clearBet() {
  if (phase !== 'bet') return;
  bet = 0;
  updateHUD();
  setMsg('Place your bet');
}

function allIn() {
  if (phase !== 'bet') return;
  bet = 0;
  addBet(balance);
}

/* ── DEAL ────────────────────────────────────────────────
   Deducts bet, deals two cards each, checks for
   player blackjack immediately.
──────────────────────────────────────────────────────── */
function deal() {
  if (phase !== 'bet') return;
  if (bet === 0) { setMsg('Place a bet first!'); return; }

  phase = 'play';
  deck = makeDeck();
  playerHand = [draw(), draw()];
  dealerHand = [draw(), draw()];

  balance -= bet;
  updateHUD();
  setBettingMode(false);
  document.getElementById('broke-banner').style.display = 'none';
  renderHands(true);

  if (handScore(playerHand) === 21) {
    setMsg('Blackjack! 🎉', 'win');
    setTimeout(() => settle('bj'), 700);
    return;
  }

  // Disable double if player can't cover the extra bet
  document.getElementById('btn-double').disabled = balance < bet;
  setMsg('Your move — Hit, Stand, or Double');
}

/* ── PLAYER ACTIONS ──────────────────────────────────────
   hit / stand / doubleDown
──────────────────────────────────────────────────────── */
function hit() {
  if (phase !== 'play') return;
  playerHand.push(draw());
  document.getElementById('btn-double').disabled = true;
  renderHands(true);

  const score = handScore(playerHand);
  if (score > 21) { setMsg('Bust! 💥', 'lose'); setTimeout(() => settle('lose'), 600); }
  else if (score === 21) stand();
}

function stand() {
  if (phase !== 'play') return;
  phase = 'dealer';

  document.getElementById('btn-hit').disabled    = true;
  document.getElementById('btn-stand').disabled  = true;
  document.getElementById('btn-double').disabled = true;

  renderHands(false);
  setMsg("Dealer's turn...");
  setTimeout(dealerPlay, 600);
}

function doubleDown() {
  if (phase !== 'play' || balance < bet) return;
  balance -= bet;
  bet *= 2;
  updateHUD();

  playerHand.push(draw());
  renderHands(true);

  const score = handScore(playerHand);
  if (score > 21) { setMsg('Bust! 💥', 'lose'); setTimeout(() => settle('lose'), 600); }
  else stand();
}

/* ── DEALER AI ───────────────────────────────────────────
   Dealer hits until 17+, then resolves outcome.
──────────────────────────────────────────────────────── */
function dealerPlay() {
  renderHands(false);
  const ds = handScore(dealerHand);

  if (ds < 17) {
    setTimeout(() => { dealerHand.push(draw()); dealerPlay(); }, 650);
    return;
  }

  const ps = handScore(playerHand);
  if      (ds > 21) settle('win');
  else if (ps > ds) settle('win');
  else if (ds > ps) settle('lose');
  else              settle('push');
}

/* ── SETTLE ──────────────────────────────────────────────
   Pays out, updates persistent stats, saves.
──────────────────────────────────────────────────────── */
function settle(result) {
  phase = 'over';
  let histType = '';

  if (result === 'bj') {
    const payout = Math.floor(bet * 2.5);   // 3:2 on blackjack
    balance += payout;
    streak = streak > 0 ? streak + 1 : 1;
    wins++;
    histType = 'BJ';
    setMsg('Blackjack! +$' + (payout - bet) + ' 🏆', 'win');

  } else if (result === 'win') {
    balance += bet * 2;
    streak = streak > 0 ? streak + 1 : 1;
    wins++;
    histType = 'W';
    setMsg('You win $' + bet + '! 🎉', 'win');

  } else if (result === 'lose') {
    streak = streak < 0 ? streak - 1 : -1;
    losses++;
    histType = 'L';
    setMsg('Dealer wins. -$' + bet, 'lose');

  } else {
    balance += bet;   // push — return bet
    histType = 'P';
    setMsg('Push — bet returned', 'push');
  }

  if (balance > bestBalance) bestBalance = balance;

  history.push({ type: histType, amt: bet });
  if (history.length > 50) history.shift();

  updateHUD();
  renderHands(false);
  renderHistory();
  save();

  setTimeout(newRound, 1800);
}

/* ── NEW ROUND ───────────────────────────────────────────
   Reset all per-round state. If player is broke,
   give them $100 instead of a hard reset.
──────────────────────────────────────────────────────── */
function newRound() {
  phase = 'bet';
  bet = 0;
  playerHand = [];
  dealerHand = [];

  document.getElementById('pscore').textContent = '';
  document.getElementById('dscore').textContent = '';
  document.getElementById('dcards').innerHTML   = '';
  document.getElementById('pcards').innerHTML   = '';

  if (balance <= 0) {
    balance = 100;
    document.getElementById('broke-banner').style.display = 'block';
    setMsg("Broke! Here's $100 — keep grinding 💸");
    save();
  } else {
    document.getElementById('broke-banner').style.display = 'none';
    setMsg('Place your bet');
  }

  updateHUD();
  setBettingMode(true);
}

/* ── INIT ────────────────────────────────────────────────
   Boot the game on page load.
──────────────────────────────────────────────────────── */
deck = makeDeck();
updateHUD();
renderHistory();
setBettingMode(true);
