import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Chess } from 'chess.js';
import { randomBytes } from 'node:crypto';

const app = express();
app.use(cors());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    activeRooms: games.size,
    connectedSockets: playerSockets.size,
    timestamp: new Date().toISOString()
  });
});

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
  let code;
  do { code = randomBytes(3).toString('hex').toUpperCase(); } while (games.has(code));
  return code;
}

const isActive = (game) => game && ['playing', 'check'].includes(game.status);

function leaveRoom(socket) {
  const player = playerSockets.get(socket.id);
  if (!player) return;
  const game = games.get(player.roomId);
  if (isActive(game)) {
    game.status = 'disconnected';
    game.winner = player.color === 'white' ? 'black' : 'white';
    socket.to(player.roomId).emit('game_over', { reason: 'disconnect', winner: game.winner });
  }
  if (game) {
    game.players[player.color] = null;
    if (!game.players.white && !game.players.black) games.delete(player.roomId);
  }
  socket.leave(player.roomId);
  playerSockets.delete(socket.id);
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
    if (playerSockets.has(socket.id)) {
      socket.emit('error', { message: 'You are already in a room' });
      return;
    }
    const roomId = generateRoomCode();
    const game = createGame(roomId);
    games.set(roomId, game);

    game.players.white = socket.id;
    playerSockets.set(socket.id, { roomId, color: 'white' });

    socket.join(roomId);
    socket.emit('room_created', { roomId, color: 'white' });
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  socket.on('join_room', (payload) => {
    const roomId = payload?.roomId;
    if (typeof roomId !== 'string' || !/^[a-z0-9]{6}$/i.test(roomId)) {
      socket.emit('error', { message: 'Enter a valid six-character room code' });
      return;
    }
    if (playerSockets.has(socket.id)) {
      socket.emit('error', { message: 'You are already in a room' });
      return;
    }
    const roomCode = roomId.toUpperCase();
    const game = games.get(roomCode);

    if (!game) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (game.status !== 'waiting' || !game.players.white || game.players.black) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    game.players.black = socket.id;
    playerSockets.set(socket.id, { roomId: roomCode, color: 'black' });
    game.status = 'playing';

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

  socket.on('make_move', (payload) => {
    const { from, to, promotion } = payload || {};
    if (typeof from !== 'string' || typeof to !== 'string' ||
        !/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to) ||
        (promotion !== undefined && !['q', 'r', 'b', 'n'].includes(promotion))) {
      socket.emit('invalid_move', { reason: 'Invalid move' });
      return;
    }
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

    if (!isActive(game) || !game.players.white || !game.players.black) {
      socket.emit('invalid_move', { reason: 'Game is not active' });
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

    let result;
    try { result = game.chess.move(move); } catch {
      socket.emit('invalid_move', { reason: 'Invalid move' });
      return;
    }

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
    } else if (game.chess.isDraw()) {
      gameStatus = 'draw';
      endReason = 'draw';
    } else if (game.chess.isCheck()) {
      gameStatus = 'check';
    }

    // Broadcast move to all players in room
    const moveData = {
      from,
      to,
      san: result.san,
      color,
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

    if (!isActive(game)) return;

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

  socket.on('leave_room', () => leaveRoom(socket));
  socket.on('disconnect', () => leaveRoom(socket));
});

const PORT = Number(process.env.PORT ?? 3001);
server.listen(PORT, process.env.HOST || '127.0.0.1', () => {
  console.log(`Chess server running on port ${server.address().port}`);
});
