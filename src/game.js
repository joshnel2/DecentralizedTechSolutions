// ============================================
// BLOB.IO - An Agar.io Style Web Game
// ============================================

// Game Configuration
const CONFIG = {
  // World
  WORLD_WIDTH: 6000,
  WORLD_HEIGHT: 6000,
  GRID_SIZE: 50,
  
  // Player
  STARTING_MASS: 30,
  MIN_MASS: 10,
  MAX_CELLS: 16,
  SPLIT_MIN_MASS: 40,
  EJECT_MASS: 15,
  EJECT_SPEED: 25,
  DECAY_RATE: 0.0002,
  MERGE_TIME: 15000,
  
  // Food
  FOOD_COUNT: 1500,
  FOOD_MASS: 1,
  FOOD_SIZE: 10,
  
  // Viruses
  VIRUS_COUNT: 30,
  VIRUS_MASS: 100,
  VIRUS_SIZE: 60,
  
  // AI
  AI_COUNT: 25,
  AI_MIN_MASS: 20,
  AI_MAX_MASS: 500,
  AI_NAMES: [
    'Destroyer', 'Phantom', 'NightOwl', 'BlueWolf', 'RedFury',
    'Ninja', 'Titan', 'Storm', 'Shadow', 'Blaze',
    'Viper', 'Dragon', 'Phoenix', 'Hunter', 'Ghost',
    'Thunder', 'Frost', 'Spark', 'Mystic', 'Rogue',
    'Cyber', 'Nova', 'Quantum', 'Pixel', 'Binary'
  ],
  
  // Physics
  BASE_SPEED: 2.5,
  FRICTION: 0.9,
  
  // Colors
  FOOD_COLORS: [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8B500', '#FF6F61', '#88D8B0', '#FFCC5C', '#96E6A1'
  ],
  
  SKIN_GRADIENTS: {
    gradient1: ['#FF6B6B', '#FFE66D'],
    gradient2: ['#4ECDC4', '#556270'],
    gradient3: ['#A770EF', '#CF8BF3'],
    gradient4: ['#11998E', '#38EF7D'],
    gradient5: ['#FC466B', '#3F5EFB'],
    gradient6: ['#F7971E', '#FFD200']
  }
};

// Game State
class GameState {
  constructor() {
    this.player = null;
    this.food = [];
    this.viruses = [];
    this.aiPlayers = [];
    this.ejectedMass = [];
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.isRunning = false;
    this.stats = {
      score: 0,
      maxMass: 0,
      cellsEaten: 0,
      timeAlive: 0,
      startTime: 0
    };
  }
  
  reset() {
    this.player = null;
    this.food = [];
    this.viruses = [];
    this.aiPlayers = [];
    this.ejectedMass = [];
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.stats = {
      score: 0,
      maxMass: 0,
      cellsEaten: 0,
      timeAlive: 0,
      startTime: Date.now()
    };
  }
}

// Cell Class (base for player and AI)
class Cell {
  constructor(x, y, mass, color, name = '') {
    this.x = x;
    this.y = y;
    this.mass = mass;
    this.color = color;
    this.name = name;
    this.vx = 0;
    this.vy = 0;
    this.mergeTime = 0;
  }
  
  get radius() {
    return Math.sqrt(this.mass) * 4;
  }
  
  get speed() {
    return CONFIG.BASE_SPEED * Math.pow(this.mass, -0.075);
  }
  
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= CONFIG.FRICTION;
    this.vy *= CONFIG.FRICTION;
    
    // Keep within world bounds
    this.x = Math.max(this.radius, Math.min(CONFIG.WORLD_WIDTH - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(CONFIG.WORLD_HEIGHT - this.radius, this.y));
    
    // Decay
    if (this.mass > CONFIG.STARTING_MASS) {
      this.mass -= this.mass * CONFIG.DECAY_RATE;
    }
  }
  
  draw(ctx, camera) {
    const screenX = (this.x - camera.x) * camera.zoom + ctx.canvas.width / 2;
    const screenY = (this.y - camera.y) * camera.zoom + ctx.canvas.height / 2;
    const screenRadius = this.radius * camera.zoom;
    
    // Don't draw if off screen
    if (screenX + screenRadius < 0 || screenX - screenRadius > ctx.canvas.width ||
        screenY + screenRadius < 0 || screenY - screenRadius > ctx.canvas.height) {
      return;
    }
    
    ctx.save();
    
    // Draw cell body with gradient
    if (Array.isArray(this.color)) {
      const gradient = ctx.createRadialGradient(
        screenX - screenRadius * 0.3, screenY - screenRadius * 0.3, 0,
        screenX, screenY, screenRadius
      );
      gradient.addColorStop(0, this.color[0]);
      gradient.addColorStop(1, this.color[1]);
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = this.color;
    }
    
    // Cell shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 10 * camera.zoom;
    ctx.shadowOffsetX = 5 * camera.zoom;
    ctx.shadowOffsetY = 5 * camera.zoom;
    
    ctx.beginPath();
    ctx.arc(screenX, screenY, screenRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Inner highlight
    ctx.shadowColor = 'transparent';
    const highlightGradient = ctx.createRadialGradient(
      screenX - screenRadius * 0.4, screenY - screenRadius * 0.4, 0,
      screenX, screenY, screenRadius
    );
    highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    highlightGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
    highlightGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = highlightGradient;
    ctx.beginPath();
    ctx.arc(screenX, screenY, screenRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Border
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 3 * camera.zoom;
    ctx.stroke();
    
    // Draw name
    if (this.name && screenRadius > 20) {
      const fontSize = Math.max(12, screenRadius * 0.4);
      ctx.font = `bold ${fontSize}px Fredoka`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 3;
      ctx.fillText(this.name, screenX, screenY);
      
      // Mass display
      if (screenRadius > 40) {
        ctx.font = `${fontSize * 0.5}px Fredoka`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillText(Math.floor(this.mass), screenX, screenY + fontSize * 0.7);
      }
    }
    
    ctx.restore();
  }
}

// Player class
class Player {
  constructor(name, skin) {
    this.name = name;
    this.skin = skin;
    this.cells = [];
    this.targetX = CONFIG.WORLD_WIDTH / 2;
    this.targetY = CONFIG.WORLD_HEIGHT / 2;
    
    // Create initial cell
    const color = CONFIG.SKIN_GRADIENTS[skin] || CONFIG.SKIN_GRADIENTS.gradient1;
    this.cells.push(new Cell(
      CONFIG.WORLD_WIDTH / 2,
      CONFIG.WORLD_HEIGHT / 2,
      CONFIG.STARTING_MASS,
      color,
      name
    ));
  }
  
  get totalMass() {
    return this.cells.reduce((sum, cell) => sum + cell.mass, 0);
  }
  
  get centerX() {
    if (this.cells.length === 0) return CONFIG.WORLD_WIDTH / 2;
    return this.cells.reduce((sum, c) => sum + c.x * c.mass, 0) / this.totalMass;
  }
  
  get centerY() {
    if (this.cells.length === 0) return CONFIG.WORLD_HEIGHT / 2;
    return this.cells.reduce((sum, c) => sum + c.y * c.mass, 0) / this.totalMass;
  }
  
  get isAlive() {
    return this.cells.length > 0;
  }
  
  update() {
    const now = Date.now();
    
    for (const cell of this.cells) {
      // Move towards target
      const dx = this.targetX - cell.x;
      const dy = this.targetY - cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist > 5) {
        cell.vx += (dx / dist) * cell.speed;
        cell.vy += (dy / dist) * cell.speed;
      }
      
      cell.update();
    }
    
    // Merge cells
    this.mergeCells(now);
    
    // Push cells apart
    this.separateCells();
  }
  
  mergeCells(now) {
    for (let i = 0; i < this.cells.length; i++) {
      for (let j = i + 1; j < this.cells.length; j++) {
        const c1 = this.cells[i];
        const c2 = this.cells[j];
        
        // Check if enough time has passed to merge
        if (now - c1.mergeTime < CONFIG.MERGE_TIME || now - c2.mergeTime < CONFIG.MERGE_TIME) {
          continue;
        }
        
        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // If cells are overlapping enough, merge them
        if (dist < Math.max(c1.radius, c2.radius) * 0.3) {
          c1.mass += c2.mass;
          c1.x = (c1.x * c1.mass + c2.x * c2.mass) / (c1.mass + c2.mass);
          c1.y = (c1.y * c1.mass + c2.y * c2.mass) / (c1.mass + c2.mass);
          this.cells.splice(j, 1);
          j--;
        }
      }
    }
  }
  
  separateCells() {
    for (let i = 0; i < this.cells.length; i++) {
      for (let j = i + 1; j < this.cells.length; j++) {
        const c1 = this.cells[i];
        const c2 = this.cells[j];
        
        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = c1.radius + c2.radius;
        
        if (dist < minDist && dist > 0) {
          const overlap = (minDist - dist) / 2;
          const pushX = (dx / dist) * overlap * 0.5;
          const pushY = (dy / dist) * overlap * 0.5;
          
          c1.x -= pushX;
          c1.y -= pushY;
          c2.x += pushX;
          c2.y += pushY;
        }
      }
    }
  }
  
  split() {
    const cellsToSplit = [...this.cells];
    
    for (const cell of cellsToSplit) {
      if (this.cells.length >= CONFIG.MAX_CELLS) break;
      if (cell.mass < CONFIG.SPLIT_MIN_MASS) continue;
      
      // Split the cell
      const newMass = cell.mass / 2;
      cell.mass = newMass;
      
      // Calculate direction to target
      const dx = this.targetX - cell.x;
      const dy = this.targetY - cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      
      // Create new cell
      const newCell = new Cell(
        cell.x + (dx / dist) * cell.radius * 2,
        cell.y + (dy / dist) * cell.radius * 2,
        newMass,
        cell.color,
        cell.name
      );
      
      // Give it velocity in direction of mouse
      newCell.vx = (dx / dist) * 15;
      newCell.vy = (dy / dist) * 15;
      newCell.mergeTime = Date.now();
      cell.mergeTime = Date.now();
      
      this.cells.push(newCell);
    }
  }
  
  ejectMass() {
    const ejected = [];
    
    for (const cell of this.cells) {
      if (cell.mass < CONFIG.SPLIT_MIN_MASS) continue;
      
      cell.mass -= CONFIG.EJECT_MASS;
      
      const dx = this.targetX - cell.x;
      const dy = this.targetY - cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      
      ejected.push({
        x: cell.x + (dx / dist) * cell.radius,
        y: cell.y + (dy / dist) * cell.radius,
        vx: (dx / dist) * CONFIG.EJECT_SPEED,
        vy: (dy / dist) * CONFIG.EJECT_SPEED,
        mass: CONFIG.EJECT_MASS,
        color: cell.color[0] || cell.color,
        radius: 10
      });
    }
    
    return ejected;
  }
  
  draw(ctx, camera) {
    // Sort cells by size (draw smaller on top)
    const sortedCells = [...this.cells].sort((a, b) => b.mass - a.mass);
    for (const cell of sortedCells) {
      cell.draw(ctx, camera);
    }
  }
}

// AI Player Class
class AIPlayer {
  constructor(name, mass, color) {
    const x = Math.random() * (CONFIG.WORLD_WIDTH - 200) + 100;
    const y = Math.random() * (CONFIG.WORLD_HEIGHT - 200) + 100;
    
    this.cell = new Cell(x, y, mass, color, name);
    this.targetX = x;
    this.targetY = y;
    this.changeTargetTime = 0;
    this.state = 'wander'; // wander, chase, flee
  }
  
  get isAlive() {
    return this.cell.mass > 0;
  }
  
  update(gameState) {
    if (!this.isAlive) return;
    
    const now = Date.now();
    
    // AI Decision making
    this.makeDecision(gameState);
    
    // Move towards target
    const dx = this.targetX - this.cell.x;
    const dy = this.targetY - this.cell.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 10) {
      this.cell.vx += (dx / dist) * this.cell.speed * 0.8;
      this.cell.vy += (dy / dist) * this.cell.speed * 0.8;
    } else if (now > this.changeTargetTime) {
      this.pickNewTarget();
    }
    
    this.cell.update();
  }
  
  makeDecision(gameState) {
    if (!gameState.player || !gameState.player.isAlive) {
      this.state = 'wander';
      return;
    }
    
    const playerCells = gameState.player.cells;
    let closestPlayerCell = null;
    let closestDist = Infinity;
    
    for (const cell of playerCells) {
      const dx = cell.x - this.cell.x;
      const dy = cell.y - this.cell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < closestDist) {
        closestDist = dist;
        closestPlayerCell = cell;
      }
    }
    
    if (closestPlayerCell && closestDist < 500) {
      // Check if we can eat the player or need to flee
      if (this.cell.mass > closestPlayerCell.mass * 1.2) {
        // Chase player
        this.state = 'chase';
        this.targetX = closestPlayerCell.x;
        this.targetY = closestPlayerCell.y;
      } else if (closestPlayerCell.mass > this.cell.mass * 1.2) {
        // Flee from player
        this.state = 'flee';
        const dx = this.cell.x - closestPlayerCell.x;
        const dy = this.cell.y - closestPlayerCell.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        this.targetX = this.cell.x + (dx / dist) * 300;
        this.targetY = this.cell.y + (dy / dist) * 300;
      } else {
        this.state = 'wander';
      }
    } else {
      // Look for food
      this.state = 'wander';
      if (Date.now() > this.changeTargetTime) {
        // Find nearest food
        let nearestFood = null;
        let nearestDist = 300;
        
        for (const food of gameState.food) {
          const dx = food.x - this.cell.x;
          const dy = food.y - this.cell.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestFood = food;
          }
        }
        
        if (nearestFood) {
          this.targetX = nearestFood.x;
          this.targetY = nearestFood.y;
        } else {
          this.pickNewTarget();
        }
      }
    }
  }
  
  pickNewTarget() {
    this.targetX = Math.random() * CONFIG.WORLD_WIDTH;
    this.targetY = Math.random() * CONFIG.WORLD_HEIGHT;
    this.changeTargetTime = Date.now() + 3000 + Math.random() * 5000;
  }
  
  draw(ctx, camera) {
    if (this.isAlive) {
      this.cell.draw(ctx, camera);
    }
  }
}

// Main Game Class
class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    
    this.state = new GameState();
    this.mouseX = 0;
    this.mouseY = 0;
    this.selectedSkin = 'gradient1';
    
    this.setupCanvas();
    this.setupEventListeners();
  }
  
  setupCanvas() {
    const resize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.minimapCanvas.width = 150;
      this.minimapCanvas.height = 150;
    };
    resize();
    window.addEventListener('resize', resize);
  }
  
  setupEventListeners() {
    // Mouse tracking
    this.canvas.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.updatePlayerTarget();
    });
    
    // Touch support
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.mouseX = touch.clientX;
      this.mouseY = touch.clientY;
      this.updatePlayerTarget();
    });
    
    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (!this.state.isRunning) return;
      
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.state.player) {
          this.state.player.split();
        }
      }
      
      if (e.code === 'KeyW') {
        if (this.state.player) {
          const ejected = this.state.player.ejectMass();
          this.state.ejectedMass.push(...ejected);
        }
      }
    });
    
    // Skin selection
    document.querySelectorAll('.skin').forEach(skin => {
      skin.addEventListener('click', () => {
        document.querySelectorAll('.skin').forEach(s => s.classList.remove('selected'));
        skin.classList.add('selected');
        this.selectedSkin = skin.dataset.skin;
      });
    });
    
    // Play button
    document.getElementById('play-btn').addEventListener('click', () => {
      this.startGame();
    });
    
    // Enter key to start
    document.getElementById('player-name').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.startGame();
      }
    });
    
    // Respawn button
    document.getElementById('respawn-btn').addEventListener('click', () => {
      this.startGame();
    });
    
    // Menu button
    document.getElementById('menu-btn').addEventListener('click', () => {
      this.showScreen('start-screen');
    });
  }
  
  updatePlayerTarget() {
    if (!this.state.player || !this.state.isRunning) return;
    
    // Convert screen coordinates to world coordinates
    const camera = this.state.camera;
    this.state.player.targetX = (this.mouseX - this.canvas.width / 2) / camera.zoom + camera.x;
    this.state.player.targetY = (this.mouseY - this.canvas.height / 2) / camera.zoom + camera.y;
  }
  
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
  }
  
  startGame() {
    const nameInput = document.getElementById('player-name');
    const playerName = nameInput.value.trim() || 'Player';
    
    this.state.reset();
    this.state.player = new Player(playerName, this.selectedSkin);
    
    // Generate food
    this.generateFood();
    
    // Generate viruses
    this.generateViruses();
    
    // Generate AI players
    this.generateAI();
    
    // Start game
    this.state.isRunning = true;
    this.showScreen('game-screen');
    
    // Start game loop
    this.gameLoop();
  }
  
  generateFood() {
    this.state.food = [];
    for (let i = 0; i < CONFIG.FOOD_COUNT; i++) {
      this.state.food.push({
        x: Math.random() * CONFIG.WORLD_WIDTH,
        y: Math.random() * CONFIG.WORLD_HEIGHT,
        mass: CONFIG.FOOD_MASS,
        color: CONFIG.FOOD_COLORS[Math.floor(Math.random() * CONFIG.FOOD_COLORS.length)],
        radius: CONFIG.FOOD_SIZE / 2
      });
    }
  }
  
  generateViruses() {
    this.state.viruses = [];
    for (let i = 0; i < CONFIG.VIRUS_COUNT; i++) {
      this.state.viruses.push({
        x: Math.random() * CONFIG.WORLD_WIDTH,
        y: Math.random() * CONFIG.WORLD_HEIGHT,
        mass: CONFIG.VIRUS_MASS,
        radius: CONFIG.VIRUS_SIZE
      });
    }
  }
  
  generateAI() {
    this.state.aiPlayers = [];
    for (let i = 0; i < CONFIG.AI_COUNT; i++) {
      const name = CONFIG.AI_NAMES[i % CONFIG.AI_NAMES.length];
      const mass = CONFIG.AI_MIN_MASS + Math.random() * (CONFIG.AI_MAX_MASS - CONFIG.AI_MIN_MASS);
      const skinKeys = Object.keys(CONFIG.SKIN_GRADIENTS);
      const color = CONFIG.SKIN_GRADIENTS[skinKeys[Math.floor(Math.random() * skinKeys.length)]];
      
      this.state.aiPlayers.push(new AIPlayer(name, mass, color));
    }
  }
  
  gameLoop() {
    if (!this.state.isRunning) return;
    
    this.update();
    this.render();
    
    requestAnimationFrame(() => this.gameLoop());
  }
  
  update() {
    // Update player
    if (this.state.player && this.state.player.isAlive) {
      this.state.player.update();
      this.updateCamera();
      
      // Update stats
      this.state.stats.score = Math.floor(this.state.player.totalMass);
      this.state.stats.maxMass = Math.max(this.state.stats.maxMass, this.state.stats.score);
      this.state.stats.timeAlive = Date.now() - this.state.stats.startTime;
      
      // Check food collisions
      this.checkFoodCollisions();
      
      // Check virus collisions
      this.checkVirusCollisions();
      
      // Check AI collisions with player
      this.checkAIPlayerCollisions();
    }
    
    // Update ejected mass
    this.updateEjectedMass();
    
    // Update AI
    for (const ai of this.state.aiPlayers) {
      ai.update(this.state);
    }
    
    // Check AI vs AI collisions
    this.checkAIvsAICollisions();
    
    // Check AI food collisions
    this.checkAIFoodCollisions();
    
    // Respawn food
    this.respawnFood();
    
    // Respawn AI
    this.respawnAI();
    
    // Update UI
    this.updateUI();
  }
  
  updateCamera() {
    const player = this.state.player;
    if (!player) return;
    
    // Smooth camera follow
    const targetX = player.centerX;
    const targetY = player.centerY;
    
    this.state.camera.x += (targetX - this.state.camera.x) * 0.1;
    this.state.camera.y += (targetY - this.state.camera.y) * 0.1;
    
    // Zoom based on player size
    const targetZoom = Math.max(0.15, Math.min(1, 50 / Math.sqrt(player.totalMass)));
    this.state.camera.zoom += (targetZoom - this.state.camera.zoom) * 0.05;
  }
  
  checkFoodCollisions() {
    const player = this.state.player;
    
    for (const cell of player.cells) {
      for (let i = this.state.food.length - 1; i >= 0; i--) {
        const food = this.state.food[i];
        const dx = food.x - cell.x;
        const dy = food.y - cell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < cell.radius) {
          cell.mass += food.mass;
          this.state.food.splice(i, 1);
          this.state.stats.cellsEaten++;
        }
      }
    }
    
    // Also eat ejected mass
    for (let i = this.state.ejectedMass.length - 1; i >= 0; i--) {
      const mass = this.state.ejectedMass[i];
      for (const cell of player.cells) {
        const dx = mass.x - cell.x;
        const dy = mass.y - cell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < cell.radius && cell.mass > mass.mass * 1.2) {
          cell.mass += mass.mass;
          this.state.ejectedMass.splice(i, 1);
          break;
        }
      }
    }
  }
  
  checkVirusCollisions() {
    const player = this.state.player;
    
    for (const cell of player.cells) {
      for (const virus of this.state.viruses) {
        const dx = virus.x - cell.x;
        const dy = virus.y - cell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < cell.radius && cell.mass > virus.mass) {
          // Pop the cell into multiple pieces
          this.popCell(cell, player);
          break;
        }
      }
    }
  }
  
  popCell(cell, player) {
    const numPieces = Math.min(CONFIG.MAX_CELLS - player.cells.length + 1, 8);
    if (numPieces <= 1) return;
    
    const piecesMass = cell.mass / numPieces;
    cell.mass = piecesMass;
    
    for (let i = 1; i < numPieces; i++) {
      const angle = (Math.PI * 2 * i) / numPieces;
      const newCell = new Cell(
        cell.x,
        cell.y,
        piecesMass,
        cell.color,
        cell.name
      );
      newCell.vx = Math.cos(angle) * 15;
      newCell.vy = Math.sin(angle) * 15;
      newCell.mergeTime = Date.now();
      player.cells.push(newCell);
    }
    cell.mergeTime = Date.now();
  }
  
  checkAIPlayerCollisions() {
    const player = this.state.player;
    if (!player || !player.isAlive) return;
    
    for (const ai of this.state.aiPlayers) {
      if (!ai.isAlive) continue;
      
      // Player eating AI
      for (let i = player.cells.length - 1; i >= 0; i--) {
        const playerCell = player.cells[i];
        const dx = ai.cell.x - playerCell.x;
        const dy = ai.cell.y - playerCell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < playerCell.radius * 0.5 && playerCell.mass > ai.cell.mass * 1.2) {
          // Player eats AI
          playerCell.mass += ai.cell.mass;
          ai.cell.mass = 0;
          this.state.stats.cellsEaten++;
          break;
        }
        
        if (dist < ai.cell.radius * 0.5 && ai.cell.mass > playerCell.mass * 1.2) {
          // AI eats player cell
          ai.cell.mass += playerCell.mass;
          player.cells.splice(i, 1);
          
          // Check if player is dead
          if (!player.isAlive) {
            this.gameOver(ai.cell.name);
          }
          break;
        }
      }
    }
  }
  
  checkAIvsAICollisions() {
    for (let i = 0; i < this.state.aiPlayers.length; i++) {
      const ai1 = this.state.aiPlayers[i];
      if (!ai1.isAlive) continue;
      
      for (let j = i + 1; j < this.state.aiPlayers.length; j++) {
        const ai2 = this.state.aiPlayers[j];
        if (!ai2.isAlive) continue;
        
        const dx = ai2.cell.x - ai1.cell.x;
        const dy = ai2.cell.y - ai1.cell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const biggerAI = ai1.cell.mass > ai2.cell.mass ? ai1 : ai2;
        const smallerAI = ai1.cell.mass > ai2.cell.mass ? ai2 : ai1;
        
        if (dist < biggerAI.cell.radius * 0.5 && biggerAI.cell.mass > smallerAI.cell.mass * 1.2) {
          biggerAI.cell.mass += smallerAI.cell.mass;
          smallerAI.cell.mass = 0;
        }
      }
    }
  }
  
  checkAIFoodCollisions() {
    for (const ai of this.state.aiPlayers) {
      if (!ai.isAlive) continue;
      
      for (let i = this.state.food.length - 1; i >= 0; i--) {
        const food = this.state.food[i];
        const dx = food.x - ai.cell.x;
        const dy = food.y - ai.cell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < ai.cell.radius) {
          ai.cell.mass += food.mass;
          this.state.food.splice(i, 1);
        }
      }
    }
  }
  
  updateEjectedMass() {
    for (let i = this.state.ejectedMass.length - 1; i >= 0; i--) {
      const mass = this.state.ejectedMass[i];
      mass.x += mass.vx;
      mass.y += mass.vy;
      mass.vx *= 0.9;
      mass.vy *= 0.9;
      
      // Keep in bounds
      mass.x = Math.max(0, Math.min(CONFIG.WORLD_WIDTH, mass.x));
      mass.y = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT, mass.y));
    }
  }
  
  respawnFood() {
    while (this.state.food.length < CONFIG.FOOD_COUNT) {
      this.state.food.push({
        x: Math.random() * CONFIG.WORLD_WIDTH,
        y: Math.random() * CONFIG.WORLD_HEIGHT,
        mass: CONFIG.FOOD_MASS,
        color: CONFIG.FOOD_COLORS[Math.floor(Math.random() * CONFIG.FOOD_COLORS.length)],
        radius: CONFIG.FOOD_SIZE / 2
      });
    }
  }
  
  respawnAI() {
    const aliveAI = this.state.aiPlayers.filter(ai => ai.isAlive);
    
    while (aliveAI.length < CONFIG.AI_COUNT) {
      const name = CONFIG.AI_NAMES[Math.floor(Math.random() * CONFIG.AI_NAMES.length)];
      const mass = CONFIG.AI_MIN_MASS + Math.random() * 100;
      const skinKeys = Object.keys(CONFIG.SKIN_GRADIENTS);
      const color = CONFIG.SKIN_GRADIENTS[skinKeys[Math.floor(Math.random() * skinKeys.length)]];
      
      const newAI = new AIPlayer(name, mass, color);
      
      // Find dead AI slot or push new
      const deadIndex = this.state.aiPlayers.findIndex(ai => !ai.isAlive);
      if (deadIndex !== -1) {
        this.state.aiPlayers[deadIndex] = newAI;
      } else {
        this.state.aiPlayers.push(newAI);
      }
      aliveAI.push(newAI);
    }
  }
  
  updateUI() {
    // Score
    document.getElementById('score').textContent = this.state.stats.score;
    
    // Leaderboard
    this.updateLeaderboard();
  }
  
  updateLeaderboard() {
    const entries = [];
    
    // Add player
    if (this.state.player && this.state.player.isAlive) {
      entries.push({
        name: this.state.player.name,
        mass: this.state.player.totalMass,
        isPlayer: true
      });
    }
    
    // Add AI
    for (const ai of this.state.aiPlayers) {
      if (ai.isAlive) {
        entries.push({
          name: ai.cell.name,
          mass: ai.cell.mass,
          isPlayer: false
        });
      }
    }
    
    // Sort by mass
    entries.sort((a, b) => b.mass - a.mass);
    
    // Take top 10
    const top10 = entries.slice(0, 10);
    
    // Update DOM
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = top10.map(entry => `
      <li class="${entry.isPlayer ? 'player-entry' : ''}">
        <span class="player-name">${entry.name}</span>
        <span class="player-score">${Math.floor(entry.mass)}</span>
      </li>
    `).join('');
  }
  
  gameOver(killerName) {
    this.state.isRunning = false;
    
    // Update death screen stats
    document.getElementById('killer-name').textContent = killerName;
    document.getElementById('final-score').textContent = this.state.stats.score;
    document.getElementById('max-mass').textContent = this.state.stats.maxMass;
    document.getElementById('cells-eaten').textContent = this.state.stats.cellsEaten;
    
    const seconds = Math.floor(this.state.stats.timeAlive / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    document.getElementById('time-alive').textContent = `${minutes}:${secs.toString().padStart(2, '0')}`;
    
    this.showScreen('death-screen');
  }
  
  render() {
    const ctx = this.ctx;
    const camera = this.state.camera;
    
    // Clear canvas
    ctx.fillStyle = '#111119';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw grid
    this.drawGrid();
    
    // Draw world bounds
    this.drawWorldBounds();
    
    // Draw food
    this.drawFood();
    
    // Draw ejected mass
    this.drawEjectedMass();
    
    // Draw viruses
    this.drawViruses();
    
    // Draw AI players
    for (const ai of this.state.aiPlayers) {
      ai.draw(ctx, camera);
    }
    
    // Draw player
    if (this.state.player && this.state.player.isAlive) {
      this.state.player.draw(ctx, camera);
    }
    
    // Draw cursor
    this.drawCursor();
    
    // Draw minimap
    this.drawMinimap();
  }
  
  drawGrid() {
    const ctx = this.ctx;
    const camera = this.state.camera;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    
    const gridSize = CONFIG.GRID_SIZE * camera.zoom;
    const offsetX = (-camera.x * camera.zoom + this.canvas.width / 2) % gridSize;
    const offsetY = (-camera.y * camera.zoom + this.canvas.height / 2) % gridSize;
    
    // Vertical lines
    for (let x = offsetX; x < this.canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.canvas.height);
      ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = offsetY; y < this.canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvas.width, y);
      ctx.stroke();
    }
  }
  
  drawWorldBounds() {
    const ctx = this.ctx;
    const camera = this.state.camera;
    
    const left = (0 - camera.x) * camera.zoom + this.canvas.width / 2;
    const top = (0 - camera.y) * camera.zoom + this.canvas.height / 2;
    const right = (CONFIG.WORLD_WIDTH - camera.x) * camera.zoom + this.canvas.width / 2;
    const bottom = (CONFIG.WORLD_HEIGHT - camera.y) * camera.zoom + this.canvas.height / 2;
    
    // Draw dark area outside bounds
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    
    // Left
    if (left > 0) {
      ctx.fillRect(0, 0, left, this.canvas.height);
    }
    // Right
    if (right < this.canvas.width) {
      ctx.fillRect(right, 0, this.canvas.width - right, this.canvas.height);
    }
    // Top
    if (top > 0) {
      ctx.fillRect(left, 0, right - left, top);
    }
    // Bottom
    if (bottom < this.canvas.height) {
      ctx.fillRect(left, bottom, right - left, this.canvas.height - bottom);
    }
    
    // Border
    ctx.strokeStyle = '#FF6B6B';
    ctx.lineWidth = 5 * camera.zoom;
    ctx.strokeRect(left, top, right - left, bottom - top);
  }
  
  drawFood() {
    const ctx = this.ctx;
    const camera = this.state.camera;
    
    for (const food of this.state.food) {
      const screenX = (food.x - camera.x) * camera.zoom + this.canvas.width / 2;
      const screenY = (food.y - camera.y) * camera.zoom + this.canvas.height / 2;
      const screenRadius = food.radius * camera.zoom;
      
      // Don't draw if off screen
      if (screenX < -screenRadius || screenX > this.canvas.width + screenRadius ||
          screenY < -screenRadius || screenY > this.canvas.height + screenRadius) {
        continue;
      }
      
      ctx.fillStyle = food.color;
      ctx.beginPath();
      ctx.arc(screenX, screenY, Math.max(2, screenRadius), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  drawEjectedMass() {
    const ctx = this.ctx;
    const camera = this.state.camera;
    
    for (const mass of this.state.ejectedMass) {
      const screenX = (mass.x - camera.x) * camera.zoom + this.canvas.width / 2;
      const screenY = (mass.y - camera.y) * camera.zoom + this.canvas.height / 2;
      const screenRadius = mass.radius * camera.zoom;
      
      ctx.fillStyle = mass.color;
      ctx.beginPath();
      ctx.arc(screenX, screenY, screenRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  drawViruses() {
    const ctx = this.ctx;
    const camera = this.state.camera;
    
    for (const virus of this.state.viruses) {
      const screenX = (virus.x - camera.x) * camera.zoom + this.canvas.width / 2;
      const screenY = (virus.y - camera.y) * camera.zoom + this.canvas.height / 2;
      const screenRadius = virus.radius * camera.zoom;
      
      // Don't draw if off screen
      if (screenX < -screenRadius || screenX > this.canvas.width + screenRadius ||
          screenY < -screenRadius || screenY > this.canvas.height + screenRadius) {
        continue;
      }
      
      // Draw spiky virus
      ctx.save();
      ctx.fillStyle = 'rgba(51, 204, 51, 0.7)';
      ctx.strokeStyle = '#33cc33';
      ctx.lineWidth = 3 * camera.zoom;
      
      ctx.beginPath();
      const spikes = 16;
      for (let i = 0; i < spikes * 2; i++) {
        const angle = (Math.PI * 2 * i) / (spikes * 2);
        const radius = i % 2 === 0 ? screenRadius : screenRadius * 0.8;
        const x = screenX + Math.cos(angle) * radius;
        const y = screenY + Math.sin(angle) * radius;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  
  drawCursor() {
    const ctx = this.ctx;
    
    // Draw simple crosshair at mouse position
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    
    const size = 15;
    ctx.beginPath();
    ctx.moveTo(this.mouseX - size, this.mouseY);
    ctx.lineTo(this.mouseX + size, this.mouseY);
    ctx.moveTo(this.mouseX, this.mouseY - size);
    ctx.lineTo(this.mouseX, this.mouseY + size);
    ctx.stroke();
    
    // Outer circle
    ctx.beginPath();
    ctx.arc(this.mouseX, this.mouseY, size, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  drawMinimap() {
    const ctx = this.minimapCtx;
    const width = this.minimapCanvas.width;
    const height = this.minimapCanvas.height;
    
    // Clear
    ctx.fillStyle = 'rgba(17, 17, 25, 0.9)';
    ctx.fillRect(0, 0, width, height);
    
    // Scale factors
    const scaleX = width / CONFIG.WORLD_WIDTH;
    const scaleY = height / CONFIG.WORLD_HEIGHT;
    
    // Draw AI dots
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (const ai of this.state.aiPlayers) {
      if (!ai.isAlive) continue;
      const x = ai.cell.x * scaleX;
      const y = ai.cell.y * scaleY;
      const radius = Math.max(2, Math.sqrt(ai.cell.mass) * 0.3);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw player
    if (this.state.player && this.state.player.isAlive) {
      ctx.fillStyle = '#FF6B6B';
      const x = this.state.player.centerX * scaleX;
      const y = this.state.player.centerY * scaleY;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw viewport rectangle
    const camera = this.state.camera;
    const viewWidth = (this.canvas.width / camera.zoom) * scaleX;
    const viewHeight = (this.canvas.height / camera.zoom) * scaleY;
    const viewX = (camera.x - this.canvas.width / (2 * camera.zoom)) * scaleX;
    const viewY = (camera.y - this.canvas.height / (2 * camera.zoom)) * scaleY;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(viewX, viewY, viewWidth, viewHeight);
  }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new Game();
});
