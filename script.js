const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TICK = 1/60;
const PHY = {
    G: 0.8, JUMP: -12.5, SPEED: 8.5, GROUND: 540,
    SHIP_G: 0.38, SHIP_LIFT: -0.48,
    WAVE_SPD: 9.0, BALL_G: 0.85,
    UFO_JUMP: -9.0, ROBOT_JUMP: -13.0
};

let state = { mode: "MENU", curLevel: 0, cameraX: 0, attempts: 1, objects: [], levelLen: 0, bgColor: "#0066ff" };
let player = { x: 300, y: 0, w: 34, h: 34, dy: 0, rot: 0, mode: "CUBE", onGround: false, dead: false, gravDir: 1 };
let input = { hold: false };
let lastTime = 0, accumulator = 0;

const setHold = (v) => input.hold = v;
window.onkeydown = (e) => { if(e.code === 'Space' || e.code === 'ArrowUp') setHold(true); };
window.onkeyup = (e) => { if(e.code === 'Space' || e.code === 'ArrowUp') setHold(false); };
canvas.onmousedown = () => setHold(true);
canvas.onmouseup = () => setHold(false);

// --- AUTHENTIC LEVEL BUILDER ---
function buildLevel(id) {
    state.objects = [];
    let x = 1000;
    
    // Scale length by difficulty: levelLen = speed * seconds * 60
    // At speed 8.5, 60 seconds is roughly 30,000 units.
    const baseLen = 32000; 
    const difficultyScale = [1, 1.2, 1.5, 1.8, 2.5]; // Deadlocked is 2.5 min long
    const levelLimit = baseLen * (difficultyScale[id] || 1);

    const addObj = (t, ox, oy, ow=40, oh=40, m=null) => state.objects.push({t, x:ox, y:oy, w:ow, h:oh, m});

    while (x < levelLimit) {
        // SEGMENT GENERATOR based on real GD patterns
        if (player.mode === "CUBE") {
            addObj('block', x, PHY.GROUND - 40);
            if (Math.random() > 0.5) addObj('spike', x + 160, PHY.GROUND - 40);
            x += 400;
        } 
        else if (player.mode === "WAVE") {
            // Authentic Sawtooth Wave Corridors
            let top = 100 + Math.random() * 100;
            let bottom = 400 + Math.random() * 100;
            addObj('block', x, 0, 80, top);
            addObj('block', x, bottom, 80, 200);
            if (x % 1000 === 0) addObj('spike', x + 40, top + 20); // Spike in corridor
            x += 80;
        }
        else if (player.mode === "SHIP") {
            addObj('block', x, 0, 40, 100);
            addObj('block', x, PHY.GROUND - 100, 40, 100);
            x += 300;
        }

        // MODE PORTAL CHECK
        if (x > 5000 && x % 8000 < 400) {
            const modes = ['SHIP', 'WAVE', 'BALL', 'UFO', 'ROBOT', 'CUBE'];
            let nextMode = modes[Math.floor(Math.random() * modes.length)];
            addObj('portal', x, 0, 60, PHY.GROUND, nextMode);
            x += 600;
        }
    }

    state.levelLen = x + 1000;
}

function resetPlayer(full) {
    player.y = PHY.GROUND - player.h; player.dy = 0; player.rot = 0;
    player.dead = false; player.onGround = true; player.gravDir = 1;
    player.mode = "CUBE";
    state.cameraX = 0;
    if(full) state.attempts = 1; else state.attempts++;
    
    document.getElementById('attempt-count').innerText = state.attempts;
    document.getElementById('mode-info').innerText = player.mode + " MODE";
    document.getElementById('percent-text').innerText = "0%";
}

function startGame(id) {
    state.curLevel = id;
    state.mode = "PLAYING";
    buildLevel(id);
    resetPlayer(true);
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    requestAnimationFrame(gameLoop);
}

function updatePhysics() {
    if(player.dead) return;
    state.cameraX += PHY.SPEED;

    // --- MODE PHYSICS ---
    switch(player.mode) {
        case "CUBE":
            player.dy += PHY.G;
            if(player.onGround && input.hold) { player.dy = PHY.JUMP; player.onGround = false; }
            if(!player.onGround) player.rot += 6;
            else player.rot = Math.round(player.rot/90)*90;
            break;
        case "SHIP":
            player.dy += input.hold ? PHY.SHIP_LIFT : PHY.SHIP_G;
            player.rot = player.dy * 2.5;
            break;
        case "WAVE":
            player.dy = input.hold ? -PHY.WAVE_SPD : PHY.WAVE_SPD;
            player.rot = (player.dy > 0) ? 25 : -25;
            break;
        case "BALL":
            player.dy += PHY.BALL_G * player.gravDir;
            if(player.onGround && input.hold) { player.gravDir *= -1; player.onGround = false; input.hold = false; }
            player.rot += 5 * player.gravDir;
            break;
        case "UFO":
            player.dy += PHY.G;
            if(input.hold) { player.dy = PHY.UFO_JUMP; input.hold = false; }
            break;
        case "ROBOT":
            player.dy += PHY.G;
            if(player.onGround && input.hold) { player.dy = PHY.ROBOT_JUMP; player.onGround = false; }
            break;
    }

    player.y += player.dy;

    // BOUNDS
    if(player.y + player.h >= PHY.GROUND) { 
        player.y = PHY.GROUND - player.h; player.dy = 0; player.onGround = true; 
    } else if(player.y <= 0) { 
        player.y = 0; player.dy = 0; if(player.mode === "SHIP" || player.mode === "WAVE") crash(); 
    } else { player.onGround = false; }

    // COLLISIONS (Reduced Hitbox = "Safe" Jumps)
    const pR = { l: state.cameraX+player.x+10, r: state.cameraX+player.x+player.w-10, t: player.y+10, b: player.y+player.h-10 };
    
    for(let o of state.objects) {
        if(o.x > pR.r + 200) break;
        if(o.x + o.w < pR.l) continue;

        if(pR.r > o.x && pR.l < o.x+o.w && pR.b > o.y && pR.t < o.y+o.h) {
            if(o.t === 'spike') crash();
            if(o.t === 'block') {
                if(player.y - player.dy + player.h <= o.y + 12) { player.y = o.y-player.h; player.dy = 0; player.onGround = true; }
                else crash();
            }
            if(o.t === 'portal') { player.mode = o.m; document.getElementById('mode-info').innerText = player.mode + " MODE"; }
        }
    }

    if(state.cameraX > state.levelLen) location.reload();
}

function crash() {
    if(player.dead) return;
    player.dead = true;
    document.getElementById('crash-flash').classList.add('flash-active');
    setTimeout(() => {
        document.getElementById('crash-flash').classList.remove('flash-active');
        resetPlayer(false);
    }, 450);
}

function draw() {
    ctx.fillStyle = state.bgColor; ctx.fillRect(0,0,1280,640);
    ctx.fillStyle = "#000"; ctx.fillRect(0, PHY.GROUND, 1280, 100);
    ctx.strokeStyle = "#fff"; ctx.strokeRect(-1, PHY.GROUND, 1282, 2);

    ctx.save(); ctx.translate(-state.cameraX, 0);
    for(let o of state.objects) {
        if(o.x < state.cameraX - 100 || o.x > state.cameraX + 1300) continue;
        if(o.t === 'block') { ctx.fillStyle = "#000"; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeStyle = "#fff"; ctx.strokeRect(o.x, o.y, o.w, o.h); }
        else if(o.t === 'spike') { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(o.x, o.y+o.h); ctx.lineTo(o.x+o.w/2, o.y); ctx.lineTo(o.x+o.w, o.y+o.h); ctx.fill(); }
        else if(o.t === 'portal') { ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fillRect(o.x, 0, o.w, PHY.GROUND); ctx.fillStyle="white"; ctx.fillText(o.m, o.x, 100); }
    }

    if(!player.dead) {
        ctx.save(); ctx.translate(state.cameraX+player.x+17, player.y+17); ctx.rotate(player.rot*Math.PI/180);
        ctx.fillStyle = "#00ffff"; ctx.fillRect(-17,-17,34,34); ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.strokeRect(-17,-17,34,34);
        ctx.restore();
    }
    ctx.restore();

    let pct = Math.floor((state.cameraX / state.levelLen) * 100);
    document.getElementById('progress-fill').style.width = pct + "%";
    document.getElementById('percent-text').innerText = pct + "%";
}

function gameLoop(t) {
    if(state.mode !== "PLAYING") return;
    accumulator += (t - lastTime) / 1000; lastTime = t;
    while(accumulator >= TICK) { updatePhysics(); accumulator -= TICK; }
    draw(); requestAnimationFrame(gameLoop);
}
