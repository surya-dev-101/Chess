const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule.default || ChessModule;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      game: new Chess(),
      players: new Map(),
    });
  }
  return rooms.get(roomId);
}

function getCaptured(room) {
  const capturedWhite = [];
  const capturedBlack = [];
  room.game.history({ verbose: true }).forEach((move) => {
    if (!move.captured) return;
    const captured = move.captured.toUpperCase();
    (move.color === 'w' ? capturedBlack : capturedWhite).push(captured);
  });
  return { capturedWhite, capturedBlack };
}

function getState(room) {
  const captured = getCaptured(room);
  return {
    fen: room.game.fen(),
    history: room.game.history({ verbose: true }),
    capturedWhite: captured.capturedWhite,
    capturedBlack: captured.capturedBlack,
    turn: room.game.turn(),
    check: room.game.in_check(),
    gameOver: room.game.game_over(),
    draw: room.game.in_draw(),
    checkmate: room.game.in_checkmate(),
    stalemate: room.game.in_stalemate(),
    players: Array.from(room.players.values()),
  };
}

function broadcastState(roomId) {
  const room = getRoom(roomId);
  io.to(roomId).emit('game-state', getState(room));
}

io.on('connection', (socket) => {
  socket.on('join-game', ({ roomId = 'main', name = 'Player' } = {}) => {
    const room = getRoom(String(roomId).slice(0, 40) || 'main');
    const existingColors = Array.from(room.players.values()).map((player) => player.color);
    const color = existingColors.includes('w') ? (existingColors.includes('b') ? 'spectator' : 'b') : 'w';

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.color = color;
    if (color !== 'spectator') room.players.set(socket.id, { id: socket.id, name, color });

    socket.emit('player-assigned', { color, roomId });
    broadcastState(roomId);
  });

  socket.on('make-move', ({ from, to, promotion } = {}) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room || !['w', 'b'].includes(socket.data.color)) return;
    if (room.game.turn() !== socket.data.color) {
      socket.emit('move-rejected', { message: 'It is not your turn.' });
      return;
    }

    try {
      const move = room.game.move({ from, to, promotion });
      if (!move) throw new Error('Illegal move');
      broadcastState(roomId);
    } catch (error) {
      socket.emit('move-rejected', { message: 'That move is not legal.' });
    }
  });

  socket.on('new-game', () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room || !['w', 'b'].includes(socket.data.color)) return;
    room.game.reset();
    broadcastState(roomId);
  });

  socket.on('undo-move', () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room || !['w', 'b'].includes(socket.data.color)) return;
    room.game.undo();
    broadcastState(roomId);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    room.players.delete(socket.id);
    io.to(roomId).emit('player-left', { color: socket.data.color });
    broadcastState(roomId);
    if (!room.players.size && io.sockets.adapter.rooms.get(roomId)?.size !== 0) rooms.delete(roomId);
  });
});

app.use(express.static(path.join(__dirname, 'dist/chess')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/chess/index.html'));
});

server.listen(process.env.PORT || 8080, () => {
  console.log(`Chess server listening on port ${process.env.PORT || 8080}`);
});
