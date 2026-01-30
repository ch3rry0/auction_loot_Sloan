import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import Login from './components/Login';
import AuctionRoom from './components/AuctionRoom';

function App() {
  const [player, setPlayer] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [notification, setNotification] = useState(null);
  const ws = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const shouldReconnect = useRef(true);

  // Établir la connexion WebSocket
  useEffect(() => {
    if (player) {
      shouldReconnect.current = true;
      connectWebSocket();
    }

    return () => {
      // Nettoyer lors du démontage
      shouldReconnect.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [player?.id]);

  const connectWebSocket = useCallback(() => {
    // Empêcher les connexions multiples
    if (ws.current && (ws.current.readyState === WebSocket.CONNECTING || ws.current.readyState === WebSocket.OPEN)) {
      console.log('WebSocket déjà connecté ou en cours de connexion');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:3001`;
    
    console.log('Tentative de connexion WebSocket...');
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('WebSocket connecté avec succès');
      setConnectionStatus('connected');
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'GAME_STATE') {
        setGameState(message.data);
      } else if (message.type === 'AUCTION_WON') {
        // Notification de victoire
        const { itemName, winnerName, amount, winnerId } = message.data;
        if (winnerId === player.id) {
          showNotification(`🎉 Félicitations ! Vous avez remporté ${itemName} pour ${amount} pièces !`, 'success');
        } else {
          showNotification(`${winnerName} a remporté ${itemName} pour ${amount} pièces`, 'info');
        }
      }
    };

    ws.current.onerror = (error) => {
      console.error('Erreur WebSocket:', error);
      setConnectionStatus('error');
    };

    ws.current.onclose = (event) => {
      console.log('WebSocket fermé', event.code, event.reason);
      setConnectionStatus('disconnected');
      
      if (shouldReconnect.current && player) {
        console.log('Reconnexion dans 3 secondes...');
        reconnectTimeoutRef.current = setTimeout(() => {
          if (shouldReconnect.current && player) {
            connectWebSocket();
          }
        }, 3000);
      }
    };
  }, [player]);

  const showNotification = useCallback((message, type = 'info') => {
    setNotification({ message, type });
    // Auto-masquer après 5 secondes
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  }, []);

  const handleLogin = (playerData) => {
    setPlayer(playerData);
  };

  // Fonction pour mettre à jour les données du joueur sans recharger
  const updatePlayerData = useCallback((updatedData) => {
    setPlayer(prevPlayer => ({
      ...prevPlayer,
      ...updatedData
    }));
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>🏆 Auction Loot</h1>
        <p className="subtitle">Jeu d'enchères multijoueur</p>
        {player && (
          <div className="connection-status">
            <span className={`status-indicator ${connectionStatus}`}></span>
            {connectionStatus === 'connected' ? 'Connecté' : connectionStatus === 'error' ? 'Erreur' : 'Déconnecté'}
          </div>
        )}
      </header>
      
      {/* Système de notification */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          <span className="notification-message">{notification.message}</span>
          <button 
            className="notification-close" 
            onClick={() => setNotification(null)}
          >
            ✕
          </button>
        </div>
      )}
      
      <main className="App-main">
        {!player ? (
          <Login onLogin={handleLogin} />
        ) : (
          <AuctionRoom 
            player={player} 
            gameState={gameState}
            updatePlayerData={updatePlayerData}
          />
        )}
      </main>

      <footer className="App-footer">
        <p>Développé avec React, Node.js, Express et WebSocket</p>
      </footer>
    </div>
  );
}

export default App;
