import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Chess } from 'chess.js';

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Game state management
const games = new Map();
const playerSockets = new Map(); // socketId -> { roomId, color }

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createGame(roomId) {
  const chess = new Chess();
  return {
    id: roomId,
    chess,
    players: { white: null, black: null },
    spectators: [],
    moveHistory: [],
    status: 'waiting',
    winner: null
  };
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('create_room', () => {
    const roomId = generateRoomCode();
    const game = createGame(roomId);
    games.set(roomId, game);

    game.players.white = socket.id;
    playerSockets.set(socket.id, { roomId, color: 'white' });

    socket.join(roomId);
    socket.emit('room_created', { roomId, color: 'white' });
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  socket.on('join_room', ({ roomId }) => {
    const roomCode = roomId.toUpperCase();
    const game = games.get(roomCode);

    if (!game) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (game.players.black) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    game.players.black = socket.id;
    playerSockets.set(socket.id, { roomId: roomCode, color: 'black' });

    socket.join(roomCode);
    socket.emit('room_joined', { roomId: roomCode, color: 'black' });

    // Notify both players that game is starting
    io.to(roomCode).emit('game_start', {
      orientation: {
        white: game.players.white,
        black: game.players.black
      },
      initialFen: game.chess.fen()
    });

    console.log(`Player ${socket.id} joined room ${roomCode}`);
  });

  socket.on('make_move', ({ from, to, promotion }) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      socket.emit('error', { message: 'Not in a game' });
      return;
    }

    const { roomId, color } = playerInfo;
    const game = games.get(roomId);

    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Check if it's this player's turn
    const turn = game.chess.turn();
    if ((turn === 'w' && color !== 'white') || (turn === 'b' && color !== 'black')) {
      socket.emit('invalid_move', { reason: 'Not your turn' });
      return;
    }

    // Make the move
    const move = { from, to };
    if (promotion) {
      move.promotion = promotion;
    }

    const result = game.chess.move(move);

    if (result === null) {
      socket.emit('invalid_move', { reason: 'Invalid move' });
      return;
    }

    // Record move in history
    game.moveHistory.push({
      from,
      to,
      san: result.san,
      color
    });

    // Check game state
    let gameStatus = 'playing';
    let endReason = null;

    if (game.chess.isCheckmate()) {
      gameStatus = 'checkmate';
      endReason = 'checkmate';
      game.winner = color;
    } else if (game.chess.isStalemate()) {
      gameStatus = 'stalemate';
      endReason = 'stalemate';
    } else if (game.chess.isCheck()) {
      gameStatus = 'check';
    }

    // Broadcast move to all players in room
    const moveData = {
      from,
      to,
      san: result.san,
      fen: game.chess.fen(),
      turn: game.chess.turn(),
      status: gameStatus,
      endReason,
      winner: game.winner,
      lastMove: { from, to }
    };

    game.status = gameStatus;
    io.to(roomId).emit('move_made', moveData);

    console.log(`Move made in ${roomId}: ${result.san}`);
  });

  socket.on('resign', () => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) return;

    const { roomId, color } = playerInfo;
    const game = games.get(roomId);

    if (!game || game.status !== 'playing') return;

    // Other player wins by resignation
    const winner = color === 'white' ? 'black' : 'white';
    game.status = 'resigned';
    game.winner = winner;

    io.to(roomId).emit('game_over', {
      reason: 'resignation',
      winner,
      winnerColor: winner
    });
  });

  socket.on('chat_message', ({ message }) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) return;

    const { roomId, color } = playerInfo;
    const game = games.get(roomId);
    if (!game) return;

    const trimmed = (message || '').toString().trim().slice(0, 200);
    if (!trimmed) return;

    io.to(roomId).emit('chat_message', {
      from: color || 'spectator',
      message: trimmed
    });
  });

  socket.on('disconnect', () => {
    const playerInfo = playerSockets.get(socket.id);

    if (playerInfo) {
      const { roomId, color } = playerInfo;
      const game = games.get(roomId);

      if (game && game.status === 'playing') {
        // Notify opponent and end game
        io.to(roomId).emit('opponent_disconnected', { color });
        io.to(roomId).emit('game_over', {
          reason: 'disconnect',
          winner: color === 'white' ? 'black' : 'white',
          winnerColor: color === 'white' ? 'black' : 'white'
        });
      }

      // Clean up game if both players gone
      if (game) {
        if (game.players.white === socket.id) game.players.white = null;
        if (game.players.black === socket.id) game.players.black = null;

        if (!game.players.white && !game.players.black) {
          games.delete(roomId);
          console.log(`Room ${roomId} deleted`);
        }
      }

      playerSockets.delete(socket.id);
    }

    console.log(`Player disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Chess server running on port ${PORT}`);
});