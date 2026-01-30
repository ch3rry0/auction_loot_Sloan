import React, { useState, useEffect } from 'react';
import './AuctionRoom.css';

function AuctionRoom({ player, gameState, updatePlayerData }) {
  const [bidAmount, setBidAmount] = useState('');
  const [bidError, setBidError] = useState('');
  const [bidding, setBidding] = useState(false);

  // Mettre à jour les informations du joueur depuis le gameState
  useEffect(() => {
    if (gameState && gameState.players) {
      const updatedPlayer = gameState.players.find(p => p.id === player.id);
      if (updatedPlayer && updatedPlayer.coins !== player.coins) {
        updatePlayerData({ coins: updatedPlayer.coins });
      }
    }
  }, [gameState, player.id, player.coins, updatePlayerData]);

  const handleBidSubmit = async (e) => {
    e.preventDefault();
    
    const amount = parseInt(bidAmount, 10);
    
    if (isNaN(amount) || amount <= 0) {
      setBidError('Montant invalide');
      return;
    }

    if (!gameState) {
      setBidError('Chargement du jeu en cours...');
      return;
    }

    if (amount <= gameState.minimumBid) {
      setBidError(`L'enchère doit être supérieure à ${gameState.minimumBid}`);
      return;
    }

    if (amount > player.coins) {
      setBidError('Pièces insuffisantes');
      return;
    }

    setBidding(true);
    setBidError('');

    try {
      // API RPC - Appel de procédure pour placer une enchère
      const response = await fetch('http://localhost:3001/rpc/placeBid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerId: player.id,
          amount: amount
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'enchère');
      }

      // Succès
      setBidAmount('');
    } catch (err) {
      setBidError(err.message);
    } finally {
      setBidding(false);
    }
  };

  if (!gameState) {
    return (
      <div className="auction-room">
        <div className="loading">Chargement du jeu...</div>
      </div>
    );
  }

  const { currentItem, currentBid, highestBidderName, timeRemaining, minimumBid, players } = gameState;

  return (
    <div className="auction-room">
      <div className="room-grid">
        {/* Informations du joueur */}
        <div className="player-info-card">
          <h3>👤 Votre profil</h3>
          <div className="player-details">
            <p className="player-name">{player.name}</p>
            <p className="player-coins">💰 {player.coins} pièces</p>
          </div>
        </div>

        {/* Objet actuel */}
        <div className="current-item-card">
          <div className="timer">⏱️ {timeRemaining}s</div>
          <h2 className="item-name">{currentItem.name}</h2>
          <div className="bid-info">
            {currentBid ? (
              <>
                <p className="current-bid">Enchère actuelle: {currentBid} 💎</p>
                <p className="highest-bidder">Meilleur enchérisseur: {highestBidderName}</p>
              </>
            ) : (
              <p className="starting-bid">Enchère de départ: {currentItem.startingBid} 💎</p>
            )}
          </div>

          {/* Formulaire d'enchère */}
          <form onSubmit={handleBidSubmit} className="bid-form">
            <div className="bid-input-group">
              <input
                type="number"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                placeholder={`Min: ${minimumBid + 1}`}
                min={minimumBid + 1}
                max={player.coins}
                disabled={bidding}
              />
              <button type="submit" disabled={bidding}>
                {bidding ? '...' : '🔨 Enchérir'}
              </button>
            </div>
            {bidError && <div className="bid-error">{bidError}</div>}
          </form>
        </div>

        {/* Liste des joueurs */}
        <div className="players-list-card">
          <h3>🎮 Joueurs ({players.length})</h3>
          <div className="players-list">
            {players.map((p) => (
              <div 
                key={p.id} 
                className={`player-item ${p.id === player.id ? 'current-player' : ''}`}
              >
                <span className="player-list-name">
                  {p.name}
                  {p.id === player.id && ' (Vous)'}
                </span>
                <span className="player-list-coins">💰 {p.coins}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuctionRoom;
