const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const rooms = {};

// Helper to broadcast room list to everyone in the lobby
function broadcastRooms() {
    const simplifiedRooms = Object.values(rooms).map(r => ({
        id: r.id,
        name: r.name || `Bàn của ${r.players[0]?.name || 'Ẩn danh'}`,
        bet: r.bet || '10K',
        playerCount: r.players.length,
        maxPlayers: 4,
        type: r.type || 'casual', // casual, rich, vip
        state: r.gameState
    }));
    io.emit('roomsList', simplifiedRooms);
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinRoom', ({ roomId, playerName }) => {
        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                players: [],
                gameState: 'waiting',
                chatHistory: [],
                name: `Bàn #${roomId}`,
                bet: (Math.floor(Math.random() * 50) + 1) + 'K',
                type: Math.random() > 0.7 ? 'rich' : 'casual'
            };
        }

        socket.join(roomId);

        const player = {
            id: socket.id,
            name: playerName,
            cards: [],
            ready: false
        };

        if (rooms[roomId].players.length < 4) {
            rooms[roomId].players.push(player);
            io.to(roomId).emit('roomUpdate', rooms[roomId]);
            broadcastRooms();
            console.log(`${playerName} joined room ${roomId}`); // Keep original console log
        } else {
            socket.emit('error', 'Phòng đã đầy!');
        }
    });

    socket.on('getRooms', () => {
        broadcastRooms();
    });

    socket.on('toggleReady', ({ roomId }) => {
        const room = rooms[roomId];
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.ready = !player.ready;
                io.to(roomId).emit('roomUpdate', room);
            }
        }
    });

    socket.on('sendMessage', ({ roomId, message }) => {
        const playerName = rooms[roomId]?.players.find(p => p.id === socket.id)?.name || 'Guest';
        const chatData = { name: playerName, text: message, time: new Date().toLocaleTimeString() };
        rooms[roomId]?.chatHistory.push(chatData);
        io.to(roomId).emit('newChatMessage', chatData);
    });

    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (room && room.players.length >= 2) {
            // Check if ALL other players are ready. Host is always ready by default.
            const allReady = room.players.every((p, idx) => idx === 0 || p.ready);
            if (!allReady) {
                socket.emit('error', 'Chờ tất cả người chơi sẵn sàng!');
                return;
            }

            room.gameState = 'playing';
            room.isGameOver = false;
            broadcastRooms(); // State changed

            const deck = createDeck();
            shuffle(deck);

            room.players.forEach((p, idx) => {
                p.cards = deck.slice(idx * 13, (idx + 1) * 13).sort((a, b) => (a.rankIndex * 4 + a.suitIndex) - (b.rankIndex * 4 + b.suitIndex));
            });

            room.currentTurn = 0;
            room.lastMove = null;
            room.lastPlayerId = null;
            room.passedPlayers = new Set(); // IDs of players who passed in this round

            const playersData = room.players.map(p => ({
                id: p.id,
                name: p.name,
                cardCount: p.cards.length
            }));

            room.players.forEach(player => {
                io.to(player.id).emit('gameStarted', {
                    players: playersData,
                    currentTurn: room.currentTurn,
                    cards: player.cards
                });
            });
        }
    });

    socket.on('playMove', ({ roomId, cards }) => {
        const room = rooms[roomId];
        if (room && room.players[room.currentTurn].id === socket.id && !room.isGameOver) {
            room.lastMove = cards;
            room.lastPlayerId = socket.id;
            room.passedPlayers.clear(); // Reset round status when someone plays

            const player = room.players[room.currentTurn];
            const playedIds = new Set(cards.map(c => c.value));
            player.cards = player.cards.filter(c => !playedIds.has(c.value));

            if (player.cards.length === 0) {
                room.isGameOver = true;
                io.to(roomId).emit('gameOver', {
                    winner: player.name,
                    results: room.players.map(p => ({ name: p.name, cardsLeft: p.cards.length }))
                });
            } else {
                // Move to next active player
                room.currentTurn = getNextTurn(room);

                io.to(roomId).emit('movePlayed', {
                    lastMove: cards,
                    currentTurn: room.currentTurn,
                    lastPlayerId: room.lastPlayerId,
                    players: room.players.map(p => ({
                        id: p.id,
                        name: p.name,
                        cardCount: p.cards.length
                    }))
                });
            }
        }
    });

    socket.on('passMove', ({ roomId }) => {
        const room = rooms[roomId];
        if (room && room.players[room.currentTurn].id === socket.id && !room.isGameOver) {
            // In Tien Len, you cannot pass if you are leading the round
            if (room.lastMove === null) {
                return;
            }

            room.passedPlayers.add(socket.id);

            let nextT = getNextTurn(room);

            // If next turn returns to the last player who played, round ends
            if (room.lastPlayerId && nextT === room.players.findIndex(p => p.id === room.lastPlayerId)) {
                room.lastMove = null;
                room.passedPlayers.clear();
                room.currentTurn = nextT;
                console.log("Round ended, next round starts with winnner");
            } else {
                room.currentTurn = nextT;
            }

            io.to(roomId).emit('movePlayed', {
                lastMove: room.lastMove,
                currentTurn: room.currentTurn,
                lastPlayerId: room.lastPlayerId,
                players: room.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    cardCount: p.cards.length
                }))
            });
        }
    });

    function getNextTurn(room) {
        let next = room.currentTurn;
        for (let i = 0; i < room.players.length; i++) {
            next = (next + 1) % room.players.length;
            const p = room.players[next];
            // Skip player if they already passed OR if they have no cards left
            if (!room.passedPlayers.has(p.id) && p.cards.length > 0) {
                return next;
            }
        }
        return next;
    }

    socket.on('surrender', ({ roomId }) => {
        const room = rooms[roomId];
        if (room && room.gameState === 'playing') {
            const player = room.players.find(p => p.id === socket.id);
            const name = player ? player.name : 'Người chơi';

            room.isGameOver = true;
            room.gameState = 'waiting'; // Technically waiting for rematch now

            io.to(roomId).emit('gameOver', {
                winner: `Đối thủ (Do ${name} xin thua)`,
                results: room.players.map(p => ({
                    name: p.name,
                    cardsLeft: p.id === socket.id ? p.cards.length : 0
                }))
            });
            broadcastRooms();
        }
    });

    socket.on('rematch', ({ roomId }) => {
        const room = rooms[roomId];
        if (room) {
            room.gameState = 'waiting';
            room.isGameOver = false;
            room.lastMove = null;
            room.passedPlayers = new Set();
            room.players.forEach(p => {
                p.cards = [];
                p.ready = false;
            });
            io.to(roomId).emit('returnToWaiting', room);
            broadcastRooms();
        }
    });

    socket.on('leaveRoom', ({ roomId }) => {
        if (rooms[roomId]) {
            io.to(roomId).emit('roomDestroyed', 'Một người chơi đã thoát, phòng bị hủy.');
            delete rooms[roomId];
            broadcastRooms();
        }
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const isPlayerInRoom = rooms[roomId].players.some(p => p.id === socket.id);
            if (isPlayerInRoom) {
                io.to(roomId).emit('roomDestroyed', 'Người chơi thoát, phòng bị hủy.');
                delete rooms[roomId];
                broadcastRooms();
            }
        }
    });
});

function createDeck() {
    const suits = ['spade', 'club', 'diamond', 'heart'];
    const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
    const deck = [];
    for (let r = 0; r < ranks.length; r++) {
        for (let s = 0; s < suits.length; s++) {
            deck.push({ rank: ranks[r], suit: suits[s], rankIndex: r, suitIndex: s, value: r * 4 + s });
        }
    }
    return deck;
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
