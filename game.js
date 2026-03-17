import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Game State ---
const state = {
    needles: 0,
    level: 1,
    exp: 0,
    activeTab: 'upgrades',
    activeSkin: 'skin_0',
    upgrades: [],
    industry: [],
    skins: [],
    unlockedSkins: ['skin_0']
};

// --- Definitions ---
const bazaarNames = ["Oasis Tap", "Dates Basket", "Spice Sack", "Camel Bridle", "Silk Weaver", "Gold Pan", "Oil Lamp", "Jewel Grinder", "Sultan's Decree", "Vizier's Seal"];
const industryNames = ["Sand Sifter", "Water Pump", "Stone Quarry", "Brick Kiln", "Iron Forge", "Textile Mill", "Cargo Dock", "Minting Press", "Empire Hub", "Steel Giant"];
const skinNames = ["Oasis Green", "Sandstorm", "Dusk", "Marrakesh", "Petra Rose", "Zaffre Blue", "Henna", "Mosaic", "Caliphate", "Royal Gold"];

// Populate lists
for (let i = 0; i < 1000; i++) {
    state.upgrades.push({
        id: i,
        name: `${bazaarNames[i % 10]} Tier ${Math.floor(i/10) + 1}`,
        cost: Math.floor(20 * Math.pow(1.15, i)),
        power: (i + 1) * 2,
        count: 0
    });
    state.industry.push({
        id: i,
        name: `${industryNames[i % 10]} Mk ${Math.floor(i/10) + 1}`,
        cost: Math.floor(500 * Math.pow(1.18, i)),
        power: (i + 1) * 25,
        count: 0
    });
    state.skins.push({
        id: `skin_${i}`,
        name: `${skinNames[i % 10]} Style #${Math.floor(i/10) + 1}`,
        color: i === 0 ? "#2ecc71" : `hsl(${(i * 47) % 360}, ${60 + (i % 20)}%, ${45 + (i % 10)}%)`,
        cost: i === 0 ? 0 : Math.floor(100 * Math.pow(1.2, i)),
        multi: 1 + (i * 0.2)
    });
}

// --- Audio Synthesis Engine ---
let audioCtx = null;
let isPlaying = false;
let nextNoteTime = 0;
const tempo = 120;
const scale = [196.00, 220.00, 233.08, 261.63, 293.66, 311.13, 349.23, 392.00];

async function initAudio() {
    if (audioCtx) {
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        return;
    }
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    isPlaying = true;
    
    const loop = () => {
        if (!isPlaying) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        while (nextNoteTime < audioCtx.currentTime + 0.1) {
            playOudNote(nextNoteTime);
            playPercussion(nextNoteTime);
            nextNoteTime += 60 / tempo / 2;
        }
        requestAnimationFrame(loop);
    };
    loop();
}

function playOudNote(time) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(scale[Math.floor(Math.random() * scale.length)], time);
    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.4);
}

function playPercussion(time) {
    const bufferSize = audioCtx.sampleRate * 0.05;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600 + Math.random() * 400, time);
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start(time);
}

// --- Background Graphics ---
const bgCanvas = document.getElementById('bg-canvas');
const ctx = bgCanvas.getContext('2d');
function resize() { bgCanvas.width = window.innerWidth; bgCanvas.height = window.innerHeight; }
window.onresize = resize;
resize();

function drawBG() {
    ctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    ctx.fillStyle = '#f4d03f';
    ctx.beginPath();
    ctx.moveTo(0, innerHeight);
    for(let i=0; i<innerWidth; i+=5) {
        ctx.lineTo(i, innerHeight - 150 + Math.sin(i * 0.01 + Date.now()*0.001)*30);
    }
    ctx.lineTo(innerWidth, innerHeight);
    ctx.fill();
    requestAnimationFrame(drawBG);
}
drawBG();

// --- Core UI & Mechanics ---
function calculateNPS() {
    let base = state.upgrades.reduce((s, u) => s + (u.count * u.power), 0);
    base += state.industry.reduce((s, u) => s + (u.count * u.power), 0);
    const skin = state.skins.find(s => s.id === state.activeSkin) || state.skins[0];
    return base * skin.multi;
}

const renderShop = () => {
    const container = document.getElementById('shop-content');
    const canAfford = (c) => state.needles >= c;
    let html = "";

    if (state.activeTab === 'upgrades' || state.activeTab === 'industry') {
        const list = state.activeTab === 'upgrades' ? state.upgrades : state.industry;
        html = list.slice(0, 25).map(u => `
            <div class="list-item ${!canAfford(u.cost) ? 'disabled' : ''}" data-id="${u.id}">
                <div><strong>${u.name}</strong><br><small>+${u.power} NPS</small></div>
                <div style="text-align:right">
                    <span class="badge badge-price">🌵 ${u.cost.toLocaleString()}</span><br>
                    <small>Owned: ${u.count}</small>
                </div>
            </div>
        `).join('');
    } else {
        html = state.skins.slice(0, 50).map(s => {
            const owned = state.unlockedSkins.includes(s.id);
            return `<div class="list-item ${!owned && !canAfford(s.cost) ? 'disabled' : ''}" data-skin-id="${s.id}">
                <div style="color:${s.color}; filter: brightness(0.8);"><strong>${s.name}</strong><br><small>${s.multi.toFixed(1)}x Multi</small></div>
                ${state.activeSkin === s.id ? '<span class="badge" style="background:gray">EQUIPPED</span>' : 
                  owned ? '<span class="badge" style="background:#2ecc71">EQUIP</span>' : `<span class="badge" style="background:#f1c40f; color:black;">🌵 ${s.cost.toLocaleString()}</span>`}
            </div>`;
        }).join('');
    }
    container.innerHTML = html;
};

// --- Event Listeners ---
document.getElementById('cactus-wrapper').onclick = async (e) => {
    if (!audioCtx) await initAudio();
    const skin = state.skins.find(s => s.id === state.activeSkin) || state.skins[0];
    const power = 1 * skin.multi;
    state.needles += power;
    state.exp += 1;
    spawnText(e.clientX, e.clientY, `+${power.toFixed(1)}`, skin.color);
};

document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
        state.activeTab = tab.id.replace('tab-', '');
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderShop();
    };
});

document.getElementById('shop-content').onclick = (e) => {
    const item = e.target.closest('.list-item');
    if (!item) return;

    if (item.dataset.id) {
        const list = state.activeTab === 'upgrades' ? state.upgrades : state.industry;
        const u = list[parseInt(item.dataset.id)];
        if (state.needles >= u.cost) {
            state.needles -= u.cost;
            u.count++;
            u.cost = Math.floor(u.cost * 1.35);
            renderShop();
        }
    } else if (item.dataset.skinId) {
        const sid = item.dataset.skinId;
        const s = state.skins.find(x => x.id === sid);
        if (state.unlockedSkins.includes(sid)) {
            state.activeSkin = sid;
            document.getElementById('cactus-body').style.fill = s.color;
        } else if (state.needles >= s.cost) {
            state.needles -= s.cost;
            state.unlockedSkins.push(sid);
            state.activeSkin = sid;
            document.getElementById('cactus-body').style.fill = s.color;
        }
        renderShop();
    }
};

function spawnText(x, y, txt, color) {
    const el = document.createElement('div');
    el.className = 'floating-text';
    el.innerText = txt;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.color = color;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
}

// --- Firebase ---
const config = JSON.parse(__firebase_config);
const app = initializeApp(config);
const db = getFirestore(app);
const auth = getAuth(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'cactus-pro-sultan-v4';

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const ref = doc(db, 'artifacts', appId, 'users', user.uid, 'data', 'save');
        const snap = await getDoc(ref);
        if (snap.exists()) {
            const data = snap.data();
            if (data.upgrades) data.upgrades.forEach((u, i) => { if(state.upgrades[i]) { state.upgrades[i].count = u.count || 0; state.upgrades[i].cost = u.cost || state.upgrades[i].cost; } });
            if (data.industry) data.industry.forEach((u, i) => { if(state.industry[i]) { state.industry[i].count = u.count || 0; state.industry[i].cost = u.cost || state.industry[i].cost; } });
            Object.assign(state, { ...data, upgrades: state.upgrades, industry: state.industry });
            const s = state.skins.find(x => x.id === state.activeSkin);
            if(s) document.getElementById('cactus-body').style.fill = s.color;
        }
    } else { signInAnonymously(auth); }
});

// --- Main Loop ---
let lastSave = 0;
function gameLoop() {
    const nps = calculateNPS();
    state.needles += nps / 60;
    
    document.getElementById('needle-count').innerText = Math.floor(state.needles).toLocaleString();
    document.getElementById('nps-val').innerText = nps.toLocaleString(undefined, {maximumFractionDigits: 1});
    document.getElementById('lvl-val').innerText = state.level;
    
    const skin = state.skins.find(s => s.id === state.activeSkin) || state.skins[0];
    document.getElementById('mult-val').innerText = skin.multi.toFixed(1) + "x";
    
    const req = Math.pow(state.level, 2) * 150;
    document.getElementById('level-fill').style.width = (state.exp / req * 100) + "%";
    
    if (state.exp >= req) { state.level++; state.exp = 0; }
    
    if (Date.now() - lastSave > 15000 && auth.currentUser) {
        setDoc(doc(db, 'artifacts', appId, 'users', auth.currentUser.uid, 'data', 'save'), state);
        lastSave = Date.now();
    }
    requestAnimationFrame(gameLoop);
}

gameLoop();
renderShop();
