# 🟢 Blob.io - Eat or Be Eaten!

An agar.io-style web game where you control a cell and try to become the biggest blob on the server!

![Blob.io Game](https://img.shields.io/badge/Game-Blob.io-FF6B6B?style=for-the-badge)
![Made with](https://img.shields.io/badge/Made%20with-JavaScript-F7DF1E?style=for-the-badge&logo=javascript)
![Built with](https://img.shields.io/badge/Built%20with-Vite-646CFF?style=for-the-badge&logo=vite)

## 🎮 How to Play

- **Move** - Move your mouse to control your cell's direction
- **Space** - Split your cell into two (requires minimum mass)
- **W** - Eject mass to feed other cells or propel yourself

## 🎯 Objectives

1. **Eat Food** - Small colored pellets scattered around the map
2. **Eat Smaller Cells** - Consume AI players or other cells smaller than you
3. **Avoid Bigger Cells** - Don't get eaten by larger blobs!
4. **Avoid Viruses** - The green spiky cells will split you into pieces
5. **Climb the Leaderboard** - Become the #1 blob!

## 🚀 Getting Started

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173 in your browser
```

### Production Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## 🎨 Features

- **Smooth Gameplay** - 60fps canvas rendering
- **Customizable Skins** - Choose from 6 colorful gradient skins
- **Smart AI** - AI players that chase, flee, and compete
- **Minimap** - Always know where you are in the world
- **Leaderboard** - Real-time rankings of all players
- **Responsive Design** - Works on desktop and mobile devices
- **Viruses** - Green cells that split you if you're too big
- **Mass Decay** - Large cells slowly lose mass over time
- **Cell Merging** - Split cells merge back together after 15 seconds

## 🎮 Game Mechanics

| Mechanic | Description |
|----------|-------------|
| **Eating** | You can eat cells that are less than 80% of your mass |
| **Splitting** | Splits your cell in half, shooting one piece toward your cursor |
| **Ejecting** | Fires small mass pellets that others can eat |
| **Viruses** | Eating a virus when you're bigger than it splits you into many pieces |
| **Decay** | Cells larger than starting mass slowly shrink over time |
| **Merging** | After 15 seconds, your split cells can merge back together |

## 🛠 Tech Stack

- **Vanilla JavaScript** - No frameworks, pure performance
- **HTML5 Canvas** - Hardware-accelerated 2D rendering
- **SCSS** - Clean, organized styling
- **Vite** - Lightning-fast development and builds

## 📁 Project Structure

```
blob-io-game/
├── index.html          # Main game HTML
├── src/
│   ├── game.js        # Game logic and rendering
│   └── style.scss     # Styles for UI
├── assets/
│   └── favicon.svg    # Game icon
├── package.json       # Dependencies
└── vite.config.js     # Build configuration
```

## 🎯 Tips & Tricks

1. **Start Small** - Focus on eating food when you're small
2. **Use Splitting Wisely** - Only split when you're sure you can eat someone
3. **Hide Behind Viruses** - Smaller cells can hide behind viruses from larger predators
4. **Corner Prey** - Push smaller cells into map corners
5. **Know When to Run** - If someone is 20% bigger than you, escape!

## 📜 License

MIT License - Feel free to use and modify!

---

Have fun playing! 🎮
