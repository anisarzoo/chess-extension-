/**
 * Simple Chess Engine using Minimax with Alpha-Beta Pruning.
 */

const PIECE_VALUES = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000
};

// Simplified positional tables (from Black's perspective, mirrored for White)
const PAWN_PST = [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5,  5, 10, 25, 25, 10,  5,  5],
    [0,  0,  0, 20, 20,  0,  0,  0],
    [5, -5,-10,  0,  0,-10, -5,  5],
    [5, 10, 10,-20,-20, 10, 10,  5],
    [0,  0,  0,  0,  0,  0,  0,  0]
];

const KNIGHT_PST = [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50]
];

const BISHOP_PST = [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20]
];

const ROOK_PST = [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [5, 10, 10, 10, 10, 10, 10,  5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [0,  0,  0,  5,  5,  0,  0,  0]
];

const QUEEN_PST = [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [-5,  0,  5,  5,  5,  5,  0, -5],
    [0,  0,  5,  5,  5,  5,  0, -5],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20]
];

const KING_PST = [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [20, 20,  0,  0,  0,  0, 20, 20],
    [20, 30, 10,  0,  0, 10, 30, 20]
];

const PST = {
    p: PAWN_PST,
    n: KNIGHT_PST,
    b: BISHOP_PST,
    r: ROOK_PST,
    q: QUEEN_PST,
    k: KING_PST
};

class ChessEngine {
    constructor() {
        this.nodesVisited = 0;
    }

    evaluateBoard(game) {
        let totalEvaluation = 0;
        const board = game.board();

        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                totalEvaluation += this.getPieceValue(board[i][j], i, j);
            }
        }
        return totalEvaluation;
    }

    getPieceValue(piece, x, y) {
        if (piece === null) return 0;

        const absoluteValue = PIECE_VALUES[piece.type] + PST[piece.type][piece.color === 'w' ? 7 - x : x][piece.color === 'w' ? y : 7 - y];
        return piece.color === 'w' ? absoluteValue : -absoluteValue;
    }

    minimax(game, depth, alpha, beta, isMaximizingPlayer) {
        this.nodesVisited++;
        if (depth === 0) return -this.evaluateBoard(game);

        const possibleMoves = game.moves();
        if (possibleMoves.length === 0) {
            if (game.in_checkmate()) return isMaximizingPlayer ? -99999 : 99999;
            return 0;
        }

        if (isMaximizingPlayer) {
            let bestValue = -99999;
            for (let i = 0; i < possibleMoves.length; i++) {
                game.move(possibleMoves[i]);
                bestValue = Math.max(bestValue, this.minimax(game, depth - 1, alpha, beta, !isMaximizingPlayer));
                game.undo();
                alpha = Math.max(alpha, bestValue);
                if (beta <= alpha) return bestValue;
            }
            return bestValue;
        } else {
            let bestValue = 99999;
            for (let i = 0; i < possibleMoves.length; i++) {
                game.move(possibleMoves[i]);
                bestValue = Math.min(bestValue, this.minimax(game, depth - 1, alpha, beta, !isMaximizingPlayer));
                game.undo();
                beta = Math.min(beta, bestValue);
                if (beta <= alpha) return bestValue;
            }
            return bestValue;
        }
    }

    getBestMove(game, depth = 3) {
        this.nodesVisited = 0;
        const possibleMoves = game.moves();
        if (possibleMoves.length === 0) return null;

        let bestMove = null;
        let bestValue = -99999;

        // Shuffle moves to add some variety
        possibleMoves.sort(() => Math.random() - 0.5);

        for (let i = 0; i < possibleMoves.length; i++) {
            const move = possibleMoves[i];
            game.move(move);
            const boardValue = this.minimax(game, depth - 1, -100000, 100000, false);
            game.undo();

            if (boardValue > bestValue) {
                bestValue = boardValue;
                bestMove = move;
            }
        }

        console.log(`Nodes visited: ${this.nodesVisited}`);
        return bestMove;
    }
}

export { ChessEngine };
