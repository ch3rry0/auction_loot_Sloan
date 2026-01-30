const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ============================================
// État du jeu (en mémoire)
// ============================================

// Liste des objets à enchérir (codée en dur)
const items = [
  { id: 1, name: "Épée Légendaire", startingBid: 50 },
  { id: 2, name: "Bouclier en Mithril", startingBid: 75 },
  { id: 3, name: "Potion de Vie Éternelle", startingBid: 100 },
  { id: 4, name: "Anneau de Puissance", startingBid: 60 },
  { id: 5, name: "Cape d'Invisibilité", startingBid: 120 },
  { id: 6, name: "Baguette Magique", startingBid: 80 },
  { id: 7, name: "Armure de Dragon", startingBid: 150 },
  { id: 8, name: "Grimoire Ancien", startingBid: 90 }
];

// Joueurs
let players = {}; // { playerId: { id, name, coins } }

// État de l'enchère courante
let currentAuction = {
  itemIndex: 0,
  currentBid: null,
  highestBidder: null,
  timeRemaining: 15
};

const INITIAL_COINS = 500;
const AUCTION_DURATION = 15; // secondes

// ============================================
// API REST - Gestion des ressources (joueurs)
// ============================================

// GET /api/players - Récupérer la liste des joueurs
app.get('/api/players', (req, res) => {
  const playerList = Object.values(players);
  res.json(playerList);
});

// POST /api/players - Créer un nouveau joueur (inscription)
app.post('/api/players', (req, res) => {
  const { name } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Le nom est requis' });
  }

  // Vérifier si le nom existe déjà
  const existingPlayer = Object.values(players).find(p => p.name === name);
  if (existingPlayer) {
    return res.status(409).json({ error: 'Ce nom est déjà utilisé' });
  }

  const playerId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
  const player = {
    id: playerId,
    name: name.trim(),
    coins: INITIAL_COINS
  };

  players[playerId] = player;
  
  // Diffuser la mise à jour à tous les clients WebSocket
  broadcastGameState();

  res.status(201).json(player);
});

// GET /api/items - Récupérer la liste des objets
app.get('/api/items', (req, res) => {
  res.json(items);
});

// ============================================
// API RPC - Actions spécifiques (enchérir)
// ============================================

// POST /rpc/placeBid - Placer une enchère (appel de procédure)
app.post('/rpc/placeBid', (req, res) => {
  const { playerId, amount } = req.body;

  // Validation
  if (!playerId || !amount) {
    return res.status(400).json({ 
      success: false, 
      error: 'playerId et amount sont requis' 
    });
  }

  const player = players[playerId];
  if (!player) {
    return res.status(404).json({ 
      success: false, 
      error: 'Joueur non trouvé' 
    });
  }

  const currentItem = items[currentAuction.itemIndex];
  const minimumBid = currentAuction.currentBid || currentItem.startingBid;

  // Vérifier que l'enchère est valide
  if (amount <= minimumBid) {
    return res.status(400).json({ 
      success: false, 
      error: `L'enchère doit être supérieure à ${minimumBid}` 
    });
  }

  if (player.coins < amount) {
    return res.status(400).json({ 
      success: false, 
      error: 'Pièces insuffisantes' 
    });
  }

  // Placer l'enchère
  currentAuction.currentBid = amount;
  currentAuction.highestBidder = playerId;

  // Diffuser la mise à jour
  broadcastGameState();

  res.json({ 
    success: true, 
    message: 'Enchère placée avec succès',
    currentBid: amount
  });
});

// ============================================
// WebSocket - Communication en temps réel
// ============================================

wss.on('connection', (ws) => {
  console.log('Nouveau client WebSocket connecté');

  // Envoyer l'état actuel du jeu au nouveau client
  ws.send(JSON.stringify({
    type: 'GAME_STATE',
    data: getGameState()
  }));

  ws.on('close', () => {
    console.log('Client WebSocket déconnecté');
  });

  ws.on('error', (error) => {
    console.error('Erreur WebSocket:', error);
  });
});

// Diffuser l'état du jeu à tous les clients connectés
function broadcastGameState() {
  const state = getGameState();
  const message = JSON.stringify({
    type: 'GAME_STATE',
    data: state
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Obtenir l'état actuel du jeu
function getGameState() {
  const currentItem = items[currentAuction.itemIndex];
  return {
    players: Object.values(players),
    currentItem,
    currentBid: currentAuction.currentBid,
    highestBidder: currentAuction.highestBidder,
    highestBidderName: currentAuction.highestBidder 
      ? players[currentAuction.highestBidder]?.name 
      : null,
    timeRemaining: currentAuction.timeRemaining,
    minimumBid: currentAuction.currentBid || currentItem.startingBid
  };
}

// ============================================
// Logique du timer d'enchères
// ============================================

setInterval(() => {
  currentAuction.timeRemaining -= 1;

  if (currentAuction.timeRemaining <= 0) {
    // L'enchère est terminée
    if (currentAuction.highestBidder) {
      // Déduire les pièces du gagnant
      const winner = players[currentAuction.highestBidder];
      if (winner) {
        winner.coins -= currentAuction.currentBid;
      }

      // Diffuser le résultat de l'enchère
      const winnerMessage = JSON.stringify({
        type: 'AUCTION_WON',
        data: {
          itemName: items[currentAuction.itemIndex].name,
          winnerId: currentAuction.highestBidder,
          winnerName: winner?.name,
          amount: currentAuction.currentBid
        }
      });

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(winnerMessage);
        }
      });
    }

    // Passer à l'objet suivant
    currentAuction.itemIndex = (currentAuction.itemIndex + 1) % items.length;
    currentAuction.currentBid = null;
    currentAuction.highestBidder = null;
    currentAuction.timeRemaining = AUCTION_DURATION;
  }

  // Diffuser l'état mis à jour
  broadcastGameState();
}, 1000);

// ============================================
// Démarrage du serveur
// ============================================

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur le port ${PORT}`);
  console.log(`📡 API REST disponible sur http://localhost:${PORT}/api`);
  console.log(`🔧 API RPC disponible sur http://localhost:${PORT}/rpc`);
  console.log(`🔌 WebSocket disponible sur ws://localhost:${PORT}`);
});
