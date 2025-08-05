// 1. Initial Setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const buildCannonButton = document.getElementById('buildCannon');
const buildFrostTowerButton = document.getElementById('buildFrostTower');
const buildMissileTowerButton = document.getElementById('buildMissileTower');
const buildHeavyCannonButton = document.getElementById('buildHeavyCannon');
const selectedTowerInfoDiv = document.getElementById('selected-tower-info');
const upgradeButton = document.getElementById('upgrade-button');

// Set canvas dimensions
canvas.width = 800;
canvas.height = 600;

// 2. Game State Variables
let gold = 500;
let lives = 20;
let currentLevelIndex = 0;
let currentWaveIndex = -1;
let selectedTowerType = null;
let selectedTower = null;
let waveInProgress = false;
let spawningComplete = false;
let gameStatus = 'playing'; // playing, won, lost

const enemies = [];
const towers = [];

// Define multiple paths for different levels
const paths = {
    path1: [
        { x: 0, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 500 },
        { x: 600, y: 500 },
        { x: 600, y: 100 },
        { x: 800, y: 100 }
    ],
    path2: [
        { x: 0, y: 300 },
        { x: 150, y: 300 },
        { x: 150, y: 100 },
        { x: 400, y: 100 },
        { x: 400, y: 500 },
        { x: 650, y: 500 },
        { x: 650, y: 300 },
        { x: 800, y: 300 }
    ],
    path3: [
        { x: 0, y: 500 },
        { x: 100, y: 500 },
        { x: 100, y: 200 },
        { x: 300, y: 200 },
        { x: 300, y: 400 },
        { x: 500, y: 400 },
        { x: 500, y: 100 },
        { x: 700, y: 100 },
        { x: 700, y: 300 },
        { x: 800, y: 300 }
    ]
};

// 3. Game Classes

class CannonTower {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.level = 1;
        this.radius = 15;
        this.color = 'cyan';
        this.range = 100;
        this.damage = 20;
        this.cost = 100;
        this.upgradeCost = 10;
        this.fireRate = 60;
        this.cooldown = 0;
        this.target = null;
    }

    upgrade() {
        if (gold >= this.upgradeCost) {
            gold -= this.upgradeCost;
            this.level++;
            this.damage *= 2;
            this.range = Math.floor(this.range * 1.1);
            this.upgradeCost = 10;
            updateTowerInfo();
        }
    }

    draw() {
        // Draw tower body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw level indicator
        ctx.fillStyle = '#000';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.level, this.x, this.y + 4);
        ctx.textAlign = 'left';

        // Draw range if selected
        if (selectedTower === this) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Draw laser
        if (this.target && this.cooldown < 10) {
            ctx.strokeStyle = '#f00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.target.x, this.target.y);
            ctx.stroke();
        }
    }

    update() {
        if (this.cooldown > 0) {
            this.cooldown--;
        }

        if (!this.target || this.getDistanceTo(this.target) > this.range || this.target.health <= 0) {
            this.findTarget();
        }

        if (this.target && this.cooldown <= 0) {
            this.attack();
            this.cooldown = this.fireRate;
        }
    }

    findTarget() {
        this.target = null;
        let closestDistance = this.range;

        for (const enemy of enemies) {
            const distance = this.getDistanceTo(enemy);
            if (distance < closestDistance) {
                closestDistance = distance;
                this.target = enemy;
            }
        }
    }

    getDistanceTo(enemy) {
        const dx = enemy.x - this.x;
        const dy = enemy.y - this.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    attack() {
        this.target.takeDamage(this.damage);
    }
}

class FrostTower extends CannonTower {
    constructor(x, y) {
        super(x, y);
        this.color = '#6495ED';
        this.damage = 5;
        this.cost = 120;
        this.upgradeCost = 10;
        this.slowAmount = 0.5;
        this.slowDuration = 120;
    }

    upgrade() {
        if (gold >= this.upgradeCost) {
            gold -= this.upgradeCost;
            this.level++;
            this.damage *= 2;
            this.slowAmount = Math.min(0.99, this.slowAmount * 2);
            this.upgradeCost = 10;
            updateTowerInfo();
        }
    }

    attack() {
        super.attack();
        this.target.applySlow(this.slowAmount, this.slowDuration);
    }
}

class MissileTower extends CannonTower {
    constructor(x, y) {
        super(x, y);
        this.color = '#8B0000'; // Dark Red
        this.damage = 50;
        this.cost = 200;
        this.upgradeCost = 10;
        this.range = 150;
        this.fireRate = 90; // Slower fire rate
    }

    upgrade() {
        if (gold >= this.upgradeCost) {
            gold -= this.upgradeCost;
            this.level++;
            this.damage *= 2;
            this.range = Math.floor(this.range * 1.1);
            this.upgradeCost = 10;
            updateTowerInfo();
        }
    }
}

class HeavyCannonTower extends CannonTower {
    constructor(x, y) {
        super(x, y);
        this.color = '#4B0082'; // Indigo
        this.damage = 100;
        this.cost = 300;
        this.upgradeCost = 10;
        this.range = 120;
        this.fireRate = 120; // Very slow fire rate
    }

    upgrade() {
        if (gold >= this.upgradeCost) {
            gold -= this.upgradeCost;
            this.level++;
            this.damage *= 2;
            this.range = Math.floor(this.range * 1.05);
            this.upgradeCost = 10;
            updateTowerInfo();
        }
    }
}

class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 10;
        this.color = 'red';
        this.baseSpeed = 1;
        this.speed = this.baseSpeed;
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.pathIndex = 0;
        this.bounty = 10;
        this.slowTimer = 0;
    }

    takeDamage(damage) {
        this.health -= damage;
    }
    
    applySlow(amount, duration) {
        this.speed = this.baseSpeed * (1 - amount);
        this.slowTimer = duration;
    }

    draw() {
        ctx.fillStyle = this.slowTimer > 0 ? '#ADD8E6' : this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        const healthBarWidth = this.radius * 2;
        const healthBarHeight = 5;
        const healthBarX = this.x - this.radius;
        const healthBarY = this.y - this.radius - 10;

        ctx.fillStyle = '#333';
        ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);

        ctx.fillStyle = 'green';
        ctx.fillRect(healthBarX, healthBarY, healthBarWidth * (this.health / this.maxHealth), healthBarHeight);
    }

    update() {
        if (this.slowTimer > 0) {
            this.slowTimer--;
        } else {
            this.speed = this.baseSpeed;
        }

        const currentPath = levels[currentLevelIndex].path;
        const target = currentPath[this.pathIndex];
        if (!target) return;

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.speed) {
            this.pathIndex++;
        } else {
            this.x += (dx / distance) * this.speed;
            this.y += (dy / distance) * this.speed;
        }
    }
}

class FastEnemy extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.color = 'orange';
        this.baseSpeed = 2;
        this.speed = this.baseSpeed;
        this.maxHealth = 50;
        this.health = this.maxHealth;
        this.bounty = 15;
    }
}

class ArmoredEnemy extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.color = 'gray';
        this.baseSpeed = 0.5;
        this.speed = this.baseSpeed;
        this.maxHealth = 250;
        this.health = this.maxHealth;
        this.bounty = 25;
    }
}

class FlyingEnemy extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.color = 'purple';
        this.baseSpeed = 1.5;
        this.speed = this.baseSpeed;
        this.maxHealth = 70;
        this.health = this.maxHealth;
        this.bounty = 20;
    }
}

class SpecialEnemy extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.color = 'lime';
        this.baseSpeed = 0.8;
        this.speed = this.baseSpeed;
        this.maxHealth = 180;
        this.health = this.maxHealth;
        this.bounty = 30;
    }
}

class BossEnemy extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.color = 'gold';
        this.baseSpeed = 0.7;
        this.speed = this.baseSpeed;
        this.maxHealth = 1000;
        this.health = this.maxHealth;
        this.bounty = 100;
        this.radius = 20;
    }
}

// 4. Game Loop and Core Functions

function gameLoop() {
    if (gameStatus === 'playing') {
        update();
    }
    draw();
    requestAnimationFrame(gameLoop);
}

function update() {
    towers.forEach(tower => tower.update());

    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        enemy.update();

        if (enemy.health <= 0) {
            gold += enemy.bounty;
            enemies.splice(i, 1);
            if (selectedTower && selectedTower.target === enemy) {
                selectedTower.findTarget();
            }
            continue;
        }

        const currentPath = levels[currentLevelIndex].path;
        if (enemy.pathIndex >= currentPath.length) {
            lives--;
            enemies.splice(i, 1);
            if (lives <= 0) {
                gameStatus = 'lost';
                lives = 0;
            }
        }
    }

    if (spawningComplete && enemies.length === 0 && gameStatus === 'playing') {
        waveInProgress = false;
        startNextWave();
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPath();
    towers.forEach(tower => tower.draw());
    enemies.forEach(enemy => enemy.draw());
    drawUI();

    if (gameStatus === 'lost') {
        drawMessage('Game Over', 'Click to Restart');
    } else if (gameStatus === 'won') {
        drawMessage('Level Complete!', 'Click for Next Level');
    }
}

function drawUI() {
    ctx.fillStyle = '#fff';
    ctx.font = '24px sans-serif';
    ctx.fillText(`Gold: ${gold}`, 20, 40);
    ctx.fillText(`Lives: ${lives}`, 20, 70);
    ctx.fillText(`Level: ${currentLevelIndex + 1}`, canvas.width - 150, 40);
    ctx.fillText(`Wave: ${currentWaveIndex + 1} / ${levels[currentLevelIndex].waves.length}`, canvas.width - 150, 70);
}

function drawMessage(mainText, subText) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#fff';
    ctx.font = '60px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(mainText, canvas.width / 2, canvas.height / 2 - 30);

    ctx.font = '30px sans-serif';
    ctx.fillText(subText, canvas.width / 2, canvas.height / 2 + 30);
    ctx.textAlign = 'left';
}

function drawPath() {
    const currentPath = levels[currentLevelIndex].path;
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 40;
    ctx.beginPath();
    ctx.moveTo(currentPath[0].x, currentPath[0].y);
    for (let i = 1; i < currentPath.length; i++) {
        ctx.lineTo(currentPath[i].x, currentPath[i].y);
    }
    ctx.stroke();
}

// 5. Game Management

const levels = [
    // Level 1: Newbie Outskirts (L001 from level.md)
    {
        path: paths.path1,
        waves: [
            { enemies: { normal: 10, fast: 0, armored: 0, flying: 0, special: 0, boss: 0 }, interval: 2000, delay: 3000 },
            { enemies: { normal: 15, fast: 5, armored: 0, flying: 0, special: 0, boss: 0 }, interval: 1500, delay: 5000 },
            { enemies: { normal: 20, fast: 10, armored: 0, flying: 0, special: 0, boss: 0 }, interval: 1200, delay: 5000 }
        ]
    },
    // Level 2: Misty Forest (L015 from level.md - simplified)
    {
        path: paths.path2,
        waves: [
            { enemies: { normal: 15, fast: 5, armored: 3, flying: 0, special: 0, boss: 0 }, interval: 1800, delay: 3000 },
            { enemies: { normal: 20, fast: 10, armored: 5, flying: 2, special: 0, boss: 0 }, interval: 1500, delay: 5000 },
            { enemies: { normal: 25, fast: 15, armored: 8, flying: 5, special: 0, boss: 0 }, interval: 1200, delay: 5000 }
        ]
    },
    // Level 3: Lava Core (L050 from level.md - simplified, with a boss)
    {
        path: paths.path3,
        waves: [
            { enemies: { normal: 20, fast: 10, armored: 5, flying: 5, special: 0, boss: 0 }, interval: 1500, delay: 3000 },
            { enemies: { normal: 30, fast: 15, armored: 10, flying: 8, special: 3, boss: 0 }, interval: 1000, delay: 5000 },
            { enemies: { normal: 0, fast: 0, armored: 0, flying: 0, special: 0, boss: 1 }, interval: 0, delay: 5000 } // Boss wave
        ]
    }
];

function startNextWave() {
    currentWaveIndex++;
    if (currentWaveIndex >= levels[currentLevelIndex].waves.length) {
        gameStatus = 'won';
        return;
    }

    waveInProgress = true;
    spawningComplete = false;
    const waveData = levels[currentLevelIndex].waves[currentWaveIndex];

    setTimeout(() => {
        spawnWave(waveData);
    }, waveData.delay);
}

function spawnWave(waveData) {
    let enemiesToSpawn = [];
    for (let i = 0; i < waveData.enemies.normal; i++) enemiesToSpawn.push('normal');
    for (let i = 0; i < waveData.enemies.fast; i++) enemiesToSpawn.push('fast');
    for (let i = 0; i < waveData.enemies.armored; i++) enemiesToSpawn.push('armored');
    for (let i = 0; i < waveData.enemies.flying; i++) enemiesToSpawn.push('flying');
    for (let i = 0; i < waveData.enemies.special; i++) enemiesToSpawn.push('special');
    for (let i = 0; i < waveData.enemies.boss; i++) enemiesToSpawn.push('boss');

    // Shuffle the array to randomize spawn order
    enemiesToSpawn.sort(() => Math.random() - 0.5);

    const spawnInterval = setInterval(() => {
        if (enemiesToSpawn.length > 0) {
            const enemyType = enemiesToSpawn.shift();
            let newEnemy;
            const currentPath = levels[currentLevelIndex].path;
            switch (enemyType) {
                case 'normal': newEnemy = new Enemy(currentPath[0].x, currentPath[0].y); break;
                case 'fast': newEnemy = new FastEnemy(currentPath[0].x, currentPath[0].y); break;
                case 'armored': newEnemy = new ArmoredEnemy(currentPath[0].x, currentPath[0].y); break;
                case 'flying': newEnemy = new FlyingEnemy(currentPath[0].x, currentPath[0].y); break;
                case 'special': newEnemy = new SpecialEnemy(currentPath[0].x, currentPath[0].y); break;
                case 'boss': newEnemy = new BossEnemy(currentPath[0].x, currentPath[0].y); break;
            }
            enemies.push(newEnemy);
        } else {
            spawningComplete = true;
            clearInterval(spawnInterval);
        }
    }, waveData.interval);
}

function placeTower(x, y) {
    let tower;
    if (selectedTowerType === 'cannon') {
        tower = new CannonTower(x, y);
    } else if (selectedTowerType === 'frost') {
        tower = new FrostTower(x, y);
    } else if (selectedTowerType === 'missile') {
        tower = new MissileTower(x, y);
    } else if (selectedTowerType === 'heavyCannon') {
        tower = new HeavyCannonTower(x, y);
    }

    if (tower && gold >= tower.cost && isLocationValid(x, y)) {
        gold -= tower.cost;
        towers.push(tower);
        deselectTower();
    } 
}

function isLocationValid(x, y) {
    // Check if location is on the path
    if (!isLocationOnPath(x, y)) return false;

    // Check for overlapping with existing towers
    for (const t of towers) {
        const dist = Math.sqrt(Math.pow(t.x - x, 2) + Math.pow(t.y - y, 2));
        if (dist < t.radius * 2) return false; // Prevent overlapping
    }
    return true;
}

// New: More accurate check for location on path
function isLocationOnPath(x, y) {
    const pathThickness = 40; // Same as lineWidth in drawPath
    const halfThickness = pathThickness / 2;
    const currentPath = levels[currentLevelIndex].path;

    for (let i = 0; i < currentPath.length - 1; i++) {
        const p1 = currentPath[i];
        const p2 = currentPath[i + 1];

        const dx_seg = p2.x - p1.x;
        const dy_seg = p2.y - p1.y;
        const len_sq = dx_seg * dx_seg + dy_seg * dy_seg;

        let t = 0;
        if (len_sq !== 0) { // Avoid division by zero for zero-length segments
            t = ((x - p1.x) * dx_seg + (y - p1.y) * dy_seg) / len_sq;
        }

        // Clamp t to [0, 1] to find the closest point on the segment
        t = Math.max(0, Math.min(1, t));

        const closestX = p1.x + t * dx_seg;
        const closestY = p1.y + t * dy_seg;

        const distance = Math.sqrt(Math.pow(x - closestX, 2) + Math.pow(y - closestY, 2));

        if (distance < halfThickness) {
            return false; // It's on the path, so invalid for tower placement
        }
    }
    return true; // Not on any path segment
}

function handleGameClick(event) {
    if (gameStatus === 'lost') {
        resetGame();
        return;
    } else if (gameStatus === 'won') {
        currentLevelIndex++;
        if (currentLevelIndex >= levels.length) {
            alert("You beat all levels!");
            currentLevelIndex = 0;
        }
        resetGame(true);
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check if clicking on an existing tower
    for (const tower of towers) {
        const dist = Math.sqrt(Math.pow(tower.x - x, 2) + Math.pow(tower.y - y, 2));
        if (dist < tower.radius) {
            selectTower(tower);
            return;
        }
    }

    // If not clicking a tower, try to place a new one
    if (selectedTowerType) {
        placeTower(x, y);
    }
}

function selectTower(tower) {
    selectedTower = tower;
    selectedTowerType = null; // Deselect build mode
    updateTowerInfo();
    upgradeButton.style.display = 'block';
}

function deselectTower() {
    selectedTower = null;
    updateTowerInfo();
    upgradeButton.style.display = 'none';
}

function updateTowerInfo() {
    if (selectedTower) {
        selectedTowerInfoDiv.innerHTML = `
            <strong>Level:</strong> ${selectedTower.level}<br>
            <strong>Damage:</strong> ${selectedTower.damage}<br>
            <strong>Range:</strong> ${selectedTower.range}<br>
            <strong>Upgrade Cost:</strong> ${selectedTower.upgradeCost}G
        `;
        upgradeButton.textContent = `Upgrade (${selectedTower.upgradeCost}G)`;
    } else {
        selectedTowerInfoDiv.innerHTML = 'Select a tower or choose one to build.';
    }
}

function resetGame(nextLevel = false) {
    gold = 500;
    lives = 20;
    if (!nextLevel) {
        currentLevelIndex = 0;
    }
    currentWaveIndex = -1;
    gameStatus = 'playing';
    enemies.length = 0;
    towers.length = 0;
    deselectTower();
    startNextWave();
}

function setupUI() {
    buildCannonButton.addEventListener('click', () => {
        selectedTowerType = 'cannon';
        deselectTower();
        selectedTowerInfoDiv.textContent = 'Selected: Cannon';
    });
    buildFrostTowerButton.addEventListener('click', () => {
        selectedTowerType = 'frost';
        deselectTower();
        selectedTowerInfoDiv.textContent = 'Selected: Frost Tower';
    });
    buildMissileTowerButton.addEventListener('click', () => {
        selectedTowerType = 'missile';
        deselectTower();
        selectedTowerInfoDiv.textContent = 'Selected: Missile Tower';
    });
    buildHeavyCannonButton.addEventListener('click', () => {
        selectedTowerType = 'heavyCannon';
        deselectTower();
        selectedTowerInfoDiv.textContent = 'Selected: Heavy Cannon';
    });
    upgradeButton.addEventListener('click', () => {
        if (selectedTower) {
            selectedTower.upgrade();
        }
    });
}

function startGame() {
    canvas.addEventListener('click', handleGameClick);
    setupUI();
    console.log("Tower Defense game initialized.");
    startNextWave();
    gameLoop();
}

// 6. Start the Game
startGame();