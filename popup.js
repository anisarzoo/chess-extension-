import { Chess } from './lib/chess.js';

const PIECES_SVG = {
    w: {
        p: 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/merida/wP.svg',
        n: 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/merida/wN.svg',
        b: 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/merida/wB.svg',
        r: 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/merida/wR.svg',
        q: 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/merida/wQ.svg',
        k: 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/merida/wK.svg'
    },
    b: {
        p: 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/merida/bP.svg',
        n: 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/merida/bN.svg',
        b: 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/merida/bB.svg',
        r: 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/merida/bR.svg',
        q: 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/merida/bQ.svg',
        k: 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/merida/bK.svg'
    }
};

class ChessGame {
    constructor() {
        this.game = new Chess();
        this.boardElement = document.getElementById('board');
        this.statusElement = document.getElementById('game-status');
        this.pgnLogElement = document.getElementById('pgn-log');
        this.nodesCountElement = document.getElementById('nodes-count');
        
        this.selectedSquare = null;
        this.myColor = 'w';
        this.playMode = 'bot'; // bot, p2p
        this.currentElo = 2; // Default 1200
        this.isAiThinking = false;
        
        // PeerJS P2P
        this.peer = null;
        this.conn = null;

        // AI Worker Initialization with path resolution
        this.workerReady = false;
        try {
            const workerUrl = chrome.runtime.getURL('lib/engine.worker.js');
            this.worker = new Worker(workerUrl, { type: 'module' });
            this.worker.onmessage = (e) => this.handleWorkerMessage(e);
            this.worker.onerror = (err) => {
                console.error("Worker failed to start:", err);
                this.statusElement.innerText = "Engine Error";
            };
        } catch (e) {
            console.error("Worker instantiation error:", e);
            this.statusElement.innerText = "Engine Error";
        }

        this.init();
    }

    async init() {
        // Theme Listener (System changes)
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (this.currentTheme === 'system') this.applyTheme('system', false);
        });

        // UI Navigation
        document.getElementById('btn-bot').addEventListener('click', () => this.enterMode('bot'));
        document.getElementById('btn-p2p').addEventListener('click', () => this.enterMode('p2p'));
        document.getElementById('back-to-lobby').addEventListener('click', () => this.switchView('lobby'));
        
        document.getElementById('new-game').addEventListener('click', () => this.resetGame());
        document.getElementById('undo-move').addEventListener('click', () => this.undoMove());
        
        // P2P Controls
        document.getElementById('copy-id').addEventListener('click', () => this.copyMyId());
        document.getElementById('connect-btn').addEventListener('click', () => this.connectToFriend());
        document.getElementById('start-p2p').addEventListener('click', () => this.switchView('game'));
        
        // Overlay New Game
        document.getElementById('overlay-new-game').addEventListener('click', () => {
            document.getElementById('game-over-overlay').classList.add('hidden');
            this.resetGame();
        });

        // Theme Dropdown logic
        this.setupCustomDropdown('theme-selected', 'theme-options', (val, text) => {
            this.applyTheme(val);
        });

        // Elo Dropdown logic
        this.setupCustomDropdown('dropdown-selected', 'dropdown-options', (val, text) => {
            this.currentElo = parseInt(val);
        });

        // Load saved state
        const savedData = await chrome.storage.local.get(['chess_fen', 'chess_theme']);
        if (savedData.chess_fen) this.game.load(savedData.chess_fen);
        
        // Default to 'system' theme
        const theme = savedData.chess_theme || 'system';
        this.applyTheme(theme);

        // Update dropdown text to reflect current theme
        const themeSelected = document.getElementById('theme-selected');
        if (themeSelected) {
            themeSelected.innerText = `Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`;
        }

        // Automatically initialize P2P so ID is ready on lobby load
        this.initP2P();

        this.renderBoard();
        this.updateStatus();
    }

    setupCustomDropdown(selectedId, optionsId, onSelect) {
        const selected = document.getElementById(selectedId);
        const options = document.getElementById(optionsId);
        
        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            options.classList.toggle('hidden');
        });

        options.querySelectorAll('.option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                const val = e.target.dataset.value;
                selected.innerText = e.target.innerText;
                options.querySelectorAll('.option').forEach(o => o.classList.toggle('selected', o === e.target));
                onSelect(val, e.target.innerText);
                options.classList.add('hidden');
            });
        });

        window.addEventListener('click', () => options.classList.add('hidden'));
    }

    applyTheme(theme) {
        this.currentTheme = theme;
        chrome.storage.local.set({ chess_theme: theme });
        if (theme === 'system') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }

    switchView(viewName) {
        document.getElementById('lobby-view').classList.toggle('hidden', viewName === 'game');
        document.getElementById('game-view').classList.toggle('hidden', viewName === 'lobby');
        if (viewName === 'game') this.renderBoard();
    }

    enterMode(mode) {
        this.playMode = mode;
        const viewTitle = document.getElementById('view-mode-title');
        const difficulty = document.getElementById('game-difficulty');
        const aiStats = document.getElementById('ai-stats');

        if (mode === 'bot') {
            viewTitle.innerText = 'Computer';
            difficulty.classList.remove('hidden');
            aiStats.classList.remove('hidden');
            this.myColor = 'w';
            this.switchView('game');
        } else {
            viewTitle.innerText = 'Multiplayer';
            difficulty.classList.add('hidden');
            aiStats.classList.add('hidden');
            this.initP2P();
        }
    }

    // --- P2P LOGIC ---
    initP2P() {
        if (this.peer) return;
        this.peer = new Peer();
        this.peer.on('open', (id) => {
            document.getElementById('my-peer-id').innerText = id;
            this.updateP2PStatus('ID Ready', false);
        });
        this.peer.on('connection', (conn) => {
            this.handleConnection(conn);
            this.myColor = 'w';
            this.conn.on('open', () => {
                this.conn.send({ type: 'init', color: 'b' });
                this.resetGame();
                this.switchView('game');
            });
        });
    }

    connectToFriend() {
        const friendId = document.getElementById('friend-id').value.trim();
        if (!friendId) return;
        this.updateP2PStatus('Connecting...', false);
        const conn = this.peer.connect(friendId);
        this.handleConnection(conn);
        this.conn.on('open', () => this.showStartButton());
    }

    showStartButton() {
        this.updateP2PStatus('Connected!', true);
        document.getElementById('start-p2p').classList.remove('hidden');
    }

    handleConnection(conn) {
        if (this.conn) this.conn.close();
        this.conn = conn;
        this.conn.on('data', (data) => {
            if (data.type === 'init') {
                this.myColor = data.color;
                this.resetGame();
                this.switchView('game');
            } else if (data.type === 'move') {
                this.game.move(data.move);
                this.renderBoard();
                this.updateStatus();
                this.saveState();
            }
        });
    }

    updateP2PStatus(text, online) {
        document.getElementById('p2p-status-text').innerText = text;
        const dot = document.querySelector('.status-dot');
        if (dot) dot.classList.toggle('online', online);
    }

    copyMyId() {
        const id = document.getElementById('my-peer-id').innerText;
        navigator.clipboard.writeText(id);
        const btn = document.getElementById('copy-id');
        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2ed573" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(() => btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>', 2000);
    }

    // --- GAME LOGIC ---
    resetGame() {
        this.game.reset();
        this.selectedSquare = null;
        this.saveState();
        this.renderBoard();
        this.updateStatus();
    }

    undoMove() {
        if (this.isAiThinking) {
            this.isAiThinking = false;
            this.updateStatus();
        }
        this.game.undo();
        if (this.playMode === 'bot') this.game.undo();
        this.selectedSquare = null;
        this.saveState();
        this.renderBoard();
        this.updateStatus();
    }

    saveState() {
        chrome.storage.local.set({ chess_fen: this.game.fen() });
    }

    renderBoard() {
        this.boardElement.innerHTML = '';
        const board = this.game.board();
        const history = this.game.history({ verbose: true });
        const lastMove = history.length > 0 ? history[history.length - 1] : null;
        const legalMoves = this.selectedSquare ? this.game.moves({ square: this.selectedSquare, verbose: true }) : [];
        const legalSquares = legalMoves.map(m => m.to);

        // Find King square if in check
        let kingSquare = null;
        if (this.game.in_check()) {
            const board = this.game.board();
            for (let i = 0; i < 8; i++) {
                for (let j = 0; j < 8; j++) {
                    const p = board[i][j];
                    if (p && p.type === 'k' && p.color === this.game.turn()) {
                        kingSquare = this.getSquareName(i, j);
                        break;
                    }
                }
            }
        }

        const rows = this.myColor === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
        const cols = this.myColor === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

        for (let i of rows) {
            for (let j of cols) {
                const square = board[i][j];
                const squareElement = document.createElement('div');
                const squareName = this.getSquareName(i, j);
                squareElement.className = `square ${(i + j) % 2 === 0 ? 'light' : 'dark'}`;
                squareElement.dataset.square = squareName;
                
                if (square) {
                    const img = document.createElement('img');
                    img.src = PIECES_SVG[square.color][square.type];
                    img.style.zIndex = "20";
                    img.draggable = false;
                    
                    // Animate the piece if it's the destination of the last move
                    if (lastMove && squareName === lastMove.to) {
                        img.classList.add('piece-animate');
                    }
                    
                    squareElement.appendChild(img);
                }

                // Last move highlighting
                if (lastMove && (squareName === lastMove.from || squareName === lastMove.to)) {
                    squareElement.classList.add('last-move');
                }

                // Active selection
                if (this.selectedSquare === squareName) squareElement.classList.add('highlight');
                
                // Legal move hints
                if (legalSquares.includes(squareName)) {
                    const isCapture = this.game.get(squareName) !== null;
                    squareElement.classList.add(isCapture ? 'legal-capture-hint' : 'legal-hint');
                }

                // King in check highlight
                if (squareName === kingSquare) squareElement.classList.add('check');

                squareElement.addEventListener('click', () => this.handleSquareClick(squareName));
                this.boardElement.appendChild(squareElement);
            }
        }
        this.renderCapturedPieces();
    }

    renderCapturedPieces() {
        const board = this.game.board();
        const capturedTop = document.getElementById('captured-top');
        const capturedBottom = document.getElementById('captured-bottom');
        if (!capturedTop || !capturedBottom) return;

        const initialCount = { p: 8, n: 2, b: 2, r: 2, q: 1, r: 2 };
        // Wait, p:8, n:2, b:2, r:2, q:1. Total 15 (excluding King).
        const currentCount = {
            w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
            b: { p: 0, n: 0, b: 0, r: 0, q: 0 }
        };

        for (let row of board) {
            for (let square of row) {
                if (square && square.type !== 'k') {
                    currentCount[square.color][square.type]++;
                }
            }
        }

        const renderTo = (container, color) => {
            container.innerHTML = '';
            const order = ['p', 'n', 'b', 'r', 'q'];
            order.forEach(type => {
                const lost = (initialCount[type] || 0) - currentCount[color][type];
                for (let i = 0; i < lost; i++) {
                    const img = document.createElement('img');
                    img.src = PIECES_SVG[color][type];
                    container.appendChild(img);
                }
            });
        };

        // Top shows pieces lost by the opponent (captured by you)
        // Bottom shows pieces lost by you (captured by the opponent)
        const opponentColor = this.myColor === 'w' ? 'b' : 'w';
        renderTo(capturedTop, opponentColor); 
        renderTo(capturedBottom, this.myColor);
    }

    handleSquareClick(square) {
        if (this.game.turn() !== this.myColor || this.isAiThinking) return;
        const piece = this.game.get(square);
        if (this.selectedSquare === square) {
            this.selectedSquare = null;
            this.renderBoard();
            return;
        }

        if (this.selectedSquare) {
            const move = this.game.move({ from: this.selectedSquare, to: square, promotion: 'q' });
            if (move) {
                this.selectedSquare = null;
                this.saveState();
                this.renderBoard();
                this.updateStatus();
                if (this.playMode === 'p2p' && this.conn) this.conn.send({ type: 'move', move: move });
                else if (this.playMode === 'bot' && !this.game.game_over()) this.makeBotMove();
                return;
            }
        }

        if (piece && piece.color === this.myColor) {
            this.selectedSquare = square;
            this.renderBoard();
        }
    }

    makeBotMove() {
        if (!this.workerReady) {
            console.error("AI engine not ready!");
            this.statusElement.innerText = 'AI Engine Offline';
            return;
        }

        this.isAiThinking = true;
        this.statusElement.innerText = 'AI Thinking...';
        
        // Map Elo values (1-6) to search depths (2-6)
        const depthMap = { 1: 2, 2: 3, 3: 4, 4: 4, 5: 5, 6: 6 };
        const searchDepth = depthMap[this.currentElo] || 3;
        
        this.worker.postMessage({ fen: this.game.fen(), depth: searchDepth });
    }

    handleWorkerMessage(e) {
        if (e.data.type === 'ready') {
            this.workerReady = true;
            return;
        }

        this.isAiThinking = false;
        
        if (e.data.type === 'error') {
            console.error('AI Error:', e.data.error);
            this.statusElement.innerText = 'AI Error';
            return;
        }

        if (e.data.type === 'move') {
            const { bestMove, nodesVisited } = e.data;
            if (bestMove) {
                this.game.move(bestMove);
                if (this.nodesCountElement) {
                    this.nodesCountElement.innerText = nodesVisited.toLocaleString();
                }
                this.saveState();
                this.renderBoard();
                this.updateStatus();
            }
        }
    }

    updateStatus() {
        let status = '';
        const turn = this.game.turn() === 'w' ? 'White' : 'Black';
        
        if (this.game.game_over()) {
            const overlay = document.getElementById('game-over-overlay');
            const winnerText = document.getElementById('winner-text');
            const winnerDesc = document.getElementById('winner-desc');
            
            overlay.classList.remove('hidden');
            
            if (this.game.in_checkmate()) {
                const winner = turn === 'White' ? 'Black' : 'White';
                status = `Checkmate! ${winner} wins`;
                winnerText.innerText = 'Checkmate!';
                winnerDesc.innerText = `${winner} wins the game`;
            } else if (this.game.in_draw()) {
                status = 'Draw!';
                winnerText.innerText = 'Draw!';
                winnerDesc.innerText = 'The game ended in a draw';
            } else if (this.game.in_stalemate()) {
                status = 'Stalemate!';
                winnerText.innerText = 'Stalemate!';
                winnerDesc.innerText = 'The game ended in a stalemate';
            }
        } else {
            const overlay = document.getElementById('game-over-overlay');
            if (overlay) overlay.classList.add('hidden');
            status = `${turn}'s Turn`;
        }
        
        this.statusElement.innerText = status;
        const history = this.game.history();
        this.pgnLogElement.innerHTML = '';
        history.forEach((m, idx) => {
            const span = document.createElement('span');
            span.innerText = `${idx % 2 === 0 ? Math.floor(idx/2)+1 + '.' : ''} ${m} `;
            this.pgnLogElement.appendChild(span);
        });
        this.pgnLogElement.scrollLeft = this.pgnLogElement.scrollWidth;
    }

    getSquareName(i, j) {
        return ['a','b','c','d','e','f','g','h'][j] + ['8','7','6','5','4','3','2','1'][i];
    }
}

document.addEventListener('DOMContentLoaded', () => new ChessGame());
