class Game {
    constructor() {
        this.socket = null;
        this.isOnline = false;
        this.roomId = null;
        this.playerName = 'Bạn';
        this.players = [];
        this.currentTurn = 0;
        this.myId = null;
        this.lastPlayedMove = null;
        this.selectedCards = new Set();
        this.myCards = [];
        this.unreadMessages = 0;
        this.matchHistory = [];
        this.matchCount = 0;
        this.currentMatchEvents = {
            quads: false,
            threeSpadeWin: false
        };

        // Constants
        this.suits = ['spade', 'club', 'diamond', 'heart'];
        this.ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

        this.init();
    }

    init() {
        this.setupMenuListeners();
        this.setupGameControls();
        this.setupChat();
        this.setupHistory();
    }


    initSocket() {
        // Connect to the server. If opened via file:// or other port, connect to 3000 explicitly.
        const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? `http://${window.location.hostname}:3000`
            : window.location.origin;

        try {
            this.socket = io(serverUrl);
            this.socket.on('connect', () => {
                console.log('Connected to server!');
                this.myId = this.socket.id;
            });
            this.socket.on('connect_error', (err) => {
                console.error('Socket connection error:', err);
                alert('Không thể kết nối đến server Online. Hãy đảm bảo bạn đã chạy "node server.js"');
            });
            this.socket.on('roomsList', (rooms) => {
                this.availableRooms = rooms;
                this.renderRoomList(rooms);
            });

            this.socket.on('roomUpdate', (room) => {
                this.updateWaitingRoom(room.players);
            });
            this.socket.on('gameStarted', (data) => {
                document.getElementById('waiting-overlay').classList.add('hidden');
                this.players = data.players;
                this.currentTurn = data.currentTurn;
                this.renderHand(data.cards);
                this.updateUI();
            });
            this.socket.on('movePlayed', (data) => {
                this.lastPlayedMove = data.lastMove;
                this.currentTurn = data.currentTurn;
                this.players = data.players;
                this.renderPlayedCards(data.lastMove);
                this.updateUI();

                if (data.lastMove) {
                    if (this.getMoveType(data.lastMove) === 'quad') {
                        this.currentMatchEvents.quads = true;
                    }
                    if (data.lastMove.length === 1 && data.lastMove[0].value === 0) {
                        this.lastPlayerPlayed3Spade = data.lastPlayerId;
                    } else {
                        this.lastPlayerPlayed3Spade = null;
                    }
                }
            });

            this.socket.on('gameOver', (data) => this.showResult(data));

            this.socket.on('returnToWaiting', (room) => {
                document.getElementById('result-modal').classList.add('hidden');
                document.getElementById('waiting-overlay').classList.remove('hidden');
                this.players = [];
                this.updateUI();
                this.updateWaitingRoom(room.players);
            });

            this.socket.on('newChatMessage', (msg) => {
                this.appendChatMessage(msg);
                const modal = document.getElementById('chat-modal');
                if (modal.classList.contains('hidden')) {
                    this.unreadMessages++;
                    this.updateChatBadge();
                }
            });

            this.socket.on('roomDestroyed', (msg) => {
                alert(msg);
                this.resetToLobby();
            });
        }
        catch (e) {
            console.error('Failed to initialize socket:', e);
        }
    }

    // --- Offline Mode Logic ---
    startOfflineGame() {
        this.players = [
            { id: 'me', name: 'Bạn', cards: [], cardCount: 13 },
            { id: 'bot1', name: 'Bot 1', cards: [], cardCount: 13, isBot: true },
            { id: 'bot2', name: 'Bot 2', cards: [], cardCount: 13, isBot: true },
            { id: 'bot3', name: 'Bot 3', cards: [], cardCount: 13, isBot: true }
        ];
        this.passedPlayers = new Set();
        this.lastPlayerId = null;
        this.lastPlayedMove = null;

        const deck = this.createDeck();
        this.shuffle(deck);
        this.players.forEach((p, i) => {
            p.cards = deck.slice(i * 13, (i + 1) * 13).sort((a, b) => a.value - b.value);
            p.cardCount = 13;
        });

        this.myCards = this.players[0].cards;
        this.renderHand(this.myCards);
        this.currentMatchEvents = { quads: false, threeSpadeWin: false };
        this.lastPlayerPlayed3Spade = null;
        this.currentTurn = 0;
        this.updateUI();
    }

    createDeck() {
        const deck = [];
        for (let r = 0; r < this.ranks.length; r++) {
            for (let s = 0; s < this.suits.length; s++) {
                deck.push({ rank: this.ranks[r], suit: this.suits[s], rankIndex: r, suitIndex: s, value: r * 4 + s });
            }
        }
        return deck;
    }

    shuffle(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }

    // --- UI Rendering ---
    renderHand(cards) {
        this.myCards = cards;
        const handContainer = document.getElementById('my-hand');
        handContainer.innerHTML = '';
        cards.forEach((card, index) => {
            const cardEl = document.createElement('div');
            cardEl.className = `card suit-${card.suit}`;
            cardEl.innerHTML = `<span>${card.rank}</span>${this.getSuitChar(card.suit)}`;
            cardEl.style.setProperty('--index', index);
            cardEl.style.setProperty('--total', cards.length);
            cardEl.onclick = () => this.toggleCardSelection(index, cardEl);
            handContainer.appendChild(cardEl);
        });
    }

    getSuitChar(suit) {
        const icons = { spade: '♠', club: '♣', diamond: '♦', heart: '♥' };
        return icons[suit];
    }

    toggleCardSelection(index, element) {
        if (this.selectedCards.has(index)) {
            this.selectedCards.delete(index);
            element.classList.remove('selected');
        } else {
            this.selectedCards.add(index);
            element.classList.add('selected');
        }
    }

    updateUI() {
        const controls = document.querySelector('.game-controls');

        if (!this.players || this.players.length === 0) {
            controls.classList.add('hidden');
            return;
        }

        const myId = this.isOnline ? this.socket.id : 'me';
        const myIndex = this.players.findIndex(p => p.id === myId);
        const isMyTurn = this.currentTurn === myIndex;

        // Show controls only during gameplay
        controls.classList.remove('hidden');

        // Disable play if not my turn, Disable pass if not my turn OR if leading a new round
        const btnPlay = document.querySelector('.btn-play');
        const btnPass = document.querySelector('.btn-pass');
        const canPass = isMyTurn && this.lastPlayedMove !== null;

        btnPlay.disabled = !isMyTurn;
        btnPass.disabled = !canPass;
        btnPlay.style.opacity = isMyTurn ? '1' : '0.5';
        btnPass.style.opacity = canPass ? '1' : '0.5';
        btnPlay.style.cursor = isMyTurn ? 'pointer' : 'not-allowed';
        btnPass.style.cursor = canPass ? 'pointer' : 'not-allowed';

        // Update opponents
        const slots = ['p2', 'p3', 'p4'];
        slots.forEach(s => document.getElementById(s).classList.add('hidden'));

        for (let i = 1; i < this.players.length; i++) {
            const playerIndex = (myIndex + i) % this.players.length;
            const p = this.players[playerIndex];
            const el = document.getElementById(slots[i - 1]);
            el.classList.remove('hidden');
            el.querySelector('.name').textContent = p.name;
            el.querySelector('.card-count').textContent = `${p.cardCount} lá`;

            if (this.currentTurn === playerIndex) el.classList.add('active-turn');
            else el.classList.remove('active-turn');
        }

        // Highlight my turn
        if (isMyTurn) {
            document.querySelector('.me-player').classList.add('active-turn');
        } else {
            document.querySelector('.me-player').classList.remove('active-turn');
        }
    }

    setupGameControls() {
        document.querySelector('.btn-play').onclick = () => this.handlePlay();
        document.querySelector('.btn-pass').onclick = () => this.handlePass();
        document.querySelector('.btn-sort').onclick = () => {
            this.myCards.sort((a, b) => a.value - b.value);
            this.renderHand(this.myCards);
            this.selectedCards.clear();
        };
    }

    handlePlay() {
        const myId = this.isOnline ? this.socket.id : 'me';
        if (this.players[this.currentTurn].id !== myId) return;

        const cardsToPlay = Array.from(this.selectedCards).map(idx => this.myCards[idx]).sort((a, b) => a.value - b.value);
        if (cardsToPlay.length === 0) return;

        // Validation logic
        const moveType = this.getMoveType(cardsToPlay);
        if (!moveType) { alert('Bộ bài không hợp lệ!'); return; }
        if (this.lastPlayedMove && !this.canBeat(cardsToPlay, this.lastPlayedMove)) { alert('Bài không đủ mạnh!'); return; }

        if (this.isOnline && this.socket) {
            this.socket.emit('playMove', { roomId: this.roomId, cards: cardsToPlay });
        } else {
            this.executeMove(cardsToPlay);
        }

        // Locally update my hand
        this.myCards = this.myCards.filter((_, idx) => !this.selectedCards.has(idx));
        this.selectedCards.clear();
        this.renderHand(this.myCards);
    }

    executeMove(cards) {
        if (!this.isOnline) this.passedPlayers.clear();
        const currentPlayer = this.players[this.currentTurn];
        this.logHistory(currentPlayer.name, cards);

        this.lastPlayedMove = cards;
        this.lastPlayerId = this.players[this.currentTurn].id;
        this.renderPlayedCards(cards);
        this.players[this.currentTurn].cardCount -= cards.length;

        // Check winner
        if (!this.isOnline && this.players[this.currentTurn].cardCount === 0) {
            this.showResult({
                winner: currentPlayer.name,
                results: this.players.map(p => ({ name: p.name, cardsLeft: p.cardCount }))
            });
            return;
        }

        this.nextTurn();
    }

    nextTurn() {
        if (this.isOnline) return;

        let nextT = this.getNextTurnIdx();

        // If it comes back to the last person who played, reset round
        if (this.lastPlayerId && nextT === this.players.findIndex(p => p.id === this.lastPlayerId)) {
            this.lastPlayedMove = null;
            this.passedPlayers.clear();
            this.currentTurn = nextT;
            this.renderPlayedCards(null); // Clear table visually
        } else {
            this.currentTurn = nextT;
        }

        this.updateUI();
        if (this.players[this.currentTurn].isBot) {
            setTimeout(() => this.botPlay(), 1000);
        }
    }

    getNextTurnIdx() {
        let next = this.currentTurn;
        for (let i = 0; i < this.players.length; i++) {
            next = (next + 1) % this.players.length;
            if (!this.passedPlayers.has(this.players[next].id)) {
                return next;
            }
        }
        return next;
    }

    handlePass() {
        const myId = this.isOnline ? this.socket.id : 'me';
        if (this.players[this.currentTurn].id !== myId) return;

        if (this.isOnline && this.socket) {
            this.socket.emit('passMove', { roomId: this.roomId });
        } else {
            this.passedPlayers.add('me');
            this.nextTurn();
        }
    }

    botPlay() {
        const bot = this.players[this.currentTurn];
        if (!this.lastPlayedMove) {
            // Lead with smallest card (usually single or pair if possible, but keeping it simple)
            const card = [bot.cards.splice(0, 1)[0]];
            this.executeMove(card);
        } else {
            // Find ALL possible combinations to beat the move (just simple single/pair detection for now)
            const moveType = this.getMoveType(this.lastPlayedMove);
            const moveLen = this.lastPlayedMove.length;

            // Very basic bot logic improvement: match length and beat value
            let cardsToPlay = [];

            // Try matching length
            for (let i = 0; i <= bot.cards.length - moveLen; i++) {
                const subset = bot.cards.slice(i, i + moveLen);
                if (this.getMoveType(subset) === moveType && this.canBeat(subset, this.lastPlayedMove)) {
                    cardsToPlay = bot.cards.splice(i, moveLen);
                    break;
                }
            }

            if (cardsToPlay.length > 0) {
                this.executeMove(cardsToPlay);
            } else {
                this.passedPlayers.add(bot.id);
                this.nextTurn();
            }
        }
    }

    // --- Validation Logic ---
    getMoveType(cards) {
        const len = cards.length;
        if (len === 1) return 'single';
        const ranks = cards.map(c => c.rankIndex);
        const uniqueRanks = [...new Set(ranks)];
        if (len === 2 && uniqueRanks.length === 1) return 'pair';
        if (len === 3 && uniqueRanks.length === 1) return 'triple';
        if (len === 4 && uniqueRanks.length === 1) return 'quad';
        // Simple straight
        if (len >= 3) {
            let isStraight = true;
            for (let i = 0; i < len - 1; i++) {
                if (ranks[i + 1] !== ranks[i] + 1 || ranks[i + 1] === 12) isStraight = false;
            }
            if (isStraight) return 'straight';
        }
        return null;
    }

    canBeat(newCards, oldCards) {
        if (newCards.length !== oldCards.length) return false;
        return newCards[newCards.length - 1].value > oldCards[oldCards.length - 1].value;
    }

    renderPlayedCards(cards) {
        const container = document.getElementById('played-cards');
        container.innerHTML = '';
        if (!cards) return;
        cards.forEach(card => {
            const el = document.createElement('div');
            el.className = `card suit-${card.suit}`;
            el.innerHTML = `<span>${card.rank}</span>${this.getSuitChar(card.suit)}`;
            container.appendChild(el);
        });
    }

    updateWaitingRoom(players) {
        const list = document.getElementById('player-list');
        list.innerHTML = '';
        players.forEach((p, idx) => {
            const item = document.createElement('div');
            item.className = 'player-item';

            // Host is always ready in the UI display
            const isReady = idx === 0 || p.ready;
            const statusClass = isReady ? 'ready' : 'not-ready';
            const statusText = isReady ? 'SẴN SÀNG' : 'CHỜ...';
            const isHost = idx === 0;

            item.innerHTML = `
                <span>${isHost ? '👑' : ''} ${p.name}</span>
                <span class="ready-status ${statusClass}">${statusText}</span>
            `;
            list.appendChild(item);
        });

        const isHost = players[0]?.id === this.socket.id;
        // Check if all OTHER players are ready (idx 0 is host)
        const allReady = players.length >= 2 && players.every((p, idx) => idx === 0 || p.ready);

        if (isHost) {
            document.getElementById('btn-start-game').classList.toggle('hidden', !allReady);
            document.getElementById('btn-ready').classList.add('hidden');
        } else {
            document.getElementById('btn-start-game').classList.add('hidden');
            document.getElementById('btn-ready').classList.remove('hidden');
        }
    }

    showResult(data) {
        const modal = document.getElementById('result-modal');
        const body = document.getElementById('result-body');
        document.getElementById('result-title').textContent = data.winner === 'Bạn' || data.winner === this.playerName ? '🎉 BẠN ĐÃ THẮNG!' : '💀 BẠN ĐÃ THUA!';

        body.innerHTML = `
            <div style="color: #fbbf24; font-weight: bold; margin-bottom: 10px;">Người thắng: ${data.winner}</div>
            <div class="result-list">
                ${data.results.map(r => `
                    <div class="result-item">${r.name}: ${r.cardsLeft} lá</div>
                `).join('')}
            </div>
        `;
        modal.classList.remove('hidden');
        this.renderHand([]); // Clear hand UI
        document.querySelector('.game-controls').classList.add('hidden');

        // Record to History
        this.matchCount++;
        const now = new Date().toLocaleTimeString();
        let events = [];
        if (this.currentMatchEvents.quads) events.push("Bắt tứ quý");

        // Determine if winner finished with 3 of spade
        const winnerObj = this.players.find(p => p.name === data.winner);
        if (this.lastPlayerPlayed3Spade && winnerObj && winnerObj.id === this.lastPlayerPlayed3Spade) {
            events.push("Đút 3 bích");
        }

        const summary = `Ván ${this.matchCount} - ${data.winner} - ${now}${events.length > 0 ? ' - ' + events.join(' - ') : ''}`;
        this.matchHistory.unshift({ text: summary });
    }

    updateChatBadge() {
        const badge = document.getElementById('chat-badge');
        const btnChat = document.getElementById('btn-chat');
        if (this.unreadMessages > 0) {
            badge.textContent = this.unreadMessages;
            badge.classList.remove('hidden');
            btnChat.classList.add('pulse-animation');
        } else {
            badge.classList.add('hidden');
            btnChat.classList.remove('pulse-animation');
        }
    }

    setupChat() {
        const modal = document.getElementById('chat-modal');
        const historyModal = document.getElementById('history-modal');

        document.getElementById('btn-chat').onclick = (e) => {
            e.stopPropagation();
            historyModal.classList.add('hidden');
            modal.classList.toggle('hidden');
            if (!modal.classList.contains('hidden')) {
                this.unreadMessages = 0;
                this.updateChatBadge();
            }
        };
        document.getElementById('close-chat').onclick = () => modal.classList.add('hidden');
        document.getElementById('btn-send-chat').onclick = () => this.sendChat();

        // Prevent closing when clicking inside
        modal.onclick = (e) => e.stopPropagation();
    }

    setupHistory() {
        const modal = document.getElementById('history-modal');
        const chatModal = document.getElementById('chat-modal');

        document.getElementById('btn-history').onclick = (e) => {
            e.stopPropagation();
            chatModal.classList.add('hidden');
            modal.classList.toggle('hidden');
            if (!modal.classList.contains('hidden')) {
                this.renderHistory();
            }
        };
        document.getElementById('close-history').onclick = () => modal.classList.add('hidden');

        // Prevent closing when clicking inside
        modal.onclick = (e) => e.stopPropagation();

        // Close all modals when clicking outside
        document.addEventListener('click', () => {
            modal.classList.add('hidden');
            chatModal.classList.add('hidden');
        });
    }

    logHistory(playerName, cards) {
        if (!cards || cards.length === 0) return;
        if (this.getMoveType(cards) === 'quad') {
            this.currentMatchEvents.quads = true;
        }
        // Local 3 spade win check for offline
        if (cards.length === 1 && cards[0].value === 0) {
            this.lastPlayerPlayed3Spade = this.players[this.currentTurn].id;
        } else {
            this.lastPlayerPlayed3Spade = null;
        }
    }

    renderHistory() {
        const container = document.getElementById('history-list');
        if (this.matchHistory.length === 0) {
            container.innerHTML = '<div class="empty-history">Chưa có ván đấu nào được ghi lại.</div>';
            return;
        }

        container.innerHTML = this.matchHistory.map(entry => `
            <div class="history-item">
                <div class="history-event">${entry.text}</div>
            </div>
        `).join('');
    }

    resetToLobby() {
        // Reset local state
        this.isOnline = false;
        this.roomId = null;
        this.players = [];
        this.lastPlayedMove = null;
        this.selectedCards.clear();
        this.myCards = [];

        // UI Reset
        document.getElementById('mode-selection-overlay').classList.remove('hidden');
        document.getElementById('lobby-overlay').classList.add('hidden');
        document.getElementById('waiting-overlay').classList.add('hidden');
        document.getElementById('room-list-overlay').classList.add('hidden');
        document.getElementById('played-cards').innerHTML = '';
        document.getElementById('my-hand').innerHTML = '';
        this.updateUI();
    }

    setupMenuListeners() {
        // Lobby UI Listeners
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.onclick = (e) => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.filterRooms(tab.dataset.filter);
            };
        });

        document.getElementById('btn-create-room-ui').onclick = () => {
            const rid = Math.floor(1000 + Math.random() * 9000).toString();
            this.playerName = prompt('Nhập tên của bạn:', 'Người chơi') || 'User_' + rid;
            this.roomId = rid;
            if (this.socket) {
                this.socket.emit('joinRoom', { roomId: this.roomId, playerName: this.playerName });
                document.getElementById('room-list-overlay').classList.add('hidden');
                document.getElementById('waiting-overlay').classList.remove('hidden');
                document.getElementById('display-room-id').textContent = this.roomId;
            }
        };

        document.getElementById('btn-quick-play').onclick = () => {
            if (this.availableRooms && this.availableRooms.length > 0) {
                const waitings = this.availableRooms.filter(r => r.state === 'waiting' && r.playerCount < 4);
                if (waitings.length > 0) {
                    const target = waitings[Math.floor(Math.random() * waitings.length)];
                    this.joinSpecificRoom(target.id);
                } else {
                    document.getElementById('btn-create-room-ui').click();
                }
            } else {
                document.getElementById('btn-create-room-ui').click();
            }
        };

        document.getElementById('btn-mode-offline').onclick = () => {
            this.isOnline = false;
            document.getElementById('mode-selection-overlay').classList.add('hidden');
            this.startOfflineGame();
        };

        document.getElementById('btn-mode-online').onclick = () => {
            this.isOnline = true;
            document.getElementById('mode-selection-overlay').classList.add('hidden');
            document.getElementById('room-list-overlay').classList.remove('hidden');
            this.initSocket();
            // Request room list
            setTimeout(() => { if (this.socket) this.socket.emit('getRooms'); }, 500);
        };

        document.getElementById('btn-ready').onclick = () => {
            if (this.isOnline && this.socket) {
                this.socket.emit('toggleReady', { roomId: this.roomId });
            }
        };

        document.getElementById('btn-play-again').onclick = () => {
            if (this.isOnline && this.socket) {
                this.socket.emit('rematch', { roomId: this.roomId });
            } else {
                document.getElementById('result-modal').classList.add('hidden');
                this.startOfflineGame();
            }
        };

        document.getElementById('btn-result-lobby').onclick = () => {
            document.getElementById('result-modal').classList.add('hidden');
            this.resetToLobby();
        };

        document.getElementById('btn-start-game').onclick = () => {
            if (this.isOnline && this.socket) {
                this.socket.emit('startGame', this.roomId);
            }
        };

        document.getElementById('btn-surrender').onclick = () => {
            if (this.isOnline && this.socket && this.roomId) {
                if (confirm('Bạn muốn đầu hàng (Xin thua) ván này? Bạn sẽ được quay về phòng chờ.')) {
                    this.socket.emit('surrender', { roomId: this.roomId });
                }
            } else if (!this.isOnline) {
                if (confirm('Bạn muốn đầu hàng Bot?')) {
                    alert('Bạn đã đầu hàng! Bot thắng.');
                    this.resetToLobby();
                }
            }
        };

        document.getElementById('btn-back').onclick = () => {
            if (this.isOnline && this.socket && this.roomId) {
                if (confirm('Bạn có muốn thoát phòng không? Mọi người sẽ bị thoát ra ngoài.')) {
                    this.socket.emit('leaveRoom', { roomId: this.roomId });
                }
            } else {
                this.resetToLobby();
            }
        };
    }

    renderRoomList(rooms) {
        const container = document.getElementById('room-cards');
        if (!rooms || rooms.length === 0) {
            container.innerHTML = '<div class="empty-lobby" style="text-align:center; padding:20px; color:#8b949e;">Chưa có bàn nào, hãy tạo bàn mới!</div>';
            return;
        }

        container.innerHTML = rooms.map(room => {
            const isFull = room.playerCount >= room.maxPlayers;
            const btnText = isFull ? 'Đầy bàn' : 'Tham gia';
            const btnClass = isFull ? 'btn-join-lobby full' : 'btn-join-lobby';
            const typeClass = room.type === 'rich' ? 'vip' : '';

            return `
                <div class="room-card ${typeClass}">
                    <div class="room-info-left">
                        <div class="room-name">${room.name}</div>
                        <div class="room-bet">${room.bet} <span>cược</span></div>
                    </div>
                    <div class="room-info-right">
                        <div class="room-players">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12,12c2.21,0,4-1.79,4-4s-1.79-4-4-4s-4,1.79-4,4S9.79,12,12,12z M12,14c-2.67,0-8,1.34-8,4v2h16v-2C20,15.34,14.67,14,12,14z"/></svg>
                            ${room.playerCount}/${room.maxPlayers}
                        </div>
                        <button class="${btnClass}" onclick="game.joinSpecificRoom('${room.id}')" ${isFull ? 'disabled' : ''}>${btnText}</button>
                    </div>
                </div>
            `;
        }).join('');

        const info = document.getElementById('room-refresh-info');
        if (info) info.textContent = `Cập nhật: Mới xong`;
    }

    filterRooms(filter) {
        if (!this.availableRooms) return;
        if (filter === 'all') {
            this.renderRoomList(this.availableRooms);
        } else {
            const filtered = this.availableRooms.filter(r => r.type === filter);
            this.renderRoomList(filtered);
        }
    }

    joinSpecificRoom(rid) {
        this.playerName = prompt('Nhập tên của bạn:', 'Người chơi') || 'User_' + Math.floor(Math.random() * 1000);
        this.roomId = rid;
        if (this.socket) {
            this.socket.emit('joinRoom', { roomId: this.roomId, playerName: this.playerName });
            document.getElementById('room-list-overlay').classList.add('hidden');
            document.getElementById('waiting-overlay').classList.remove('hidden');
            document.getElementById('display-room-id').textContent = this.roomId;
        }
    }

    sendChat() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (text && this.isOnline && this.socket) {
            this.socket.emit('sendMessage', { roomId: this.roomId, message: text });
            input.value = '';
        }
    }

    appendChatMessage(data) {
        const container = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = 'msg-item';
        div.innerHTML = `<span class="sender">${data.name}:</span> ${data.text}`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }
}

window.onload = () => { window.game = new Game(); };
