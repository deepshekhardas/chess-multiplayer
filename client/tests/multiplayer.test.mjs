import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

let backend;
let address;
const wait = (socket, name) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { socket.off(name, done); reject(new Error(`Timed out: ${name}`)); }, 5000);
  function done(data) { clearTimeout(timer); resolve(data); }
  socket.once(name, done);
});
const send = async (socket, action, data, response) => {
  const pending = wait(socket, response);
  socket.emit(action, data);
  return pending;
};

async function move(white, black, player, from, to) {
  const responses = [wait(white, 'move_made'), wait(black, 'move_made')];
  player.emit('make_move', { from, to });
  const [a, b] = await Promise.all(responses);
  assert.deepEqual(a, b);
  assert.equal(a.from, from);
  assert.equal(a.to, to);
  return a;
}

before(async () => {
  backend = spawn(process.execPath, [fileURLToPath(new URL('../../server/index.js', import.meta.url))], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1' }, windowsHide: true,
  });
  address = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start')), 10000);
    backend.once('error', reject);
    backend.stdout.on('data', data => {
      const match = String(data).match(/running on port (\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
    backend.stderr.on('data', data => process.stderr.write(data));
  });
});
after(() => backend?.kill());

async function pair(t, start = true) {
  const white = io(address, { autoConnect: false, reconnection: false, transports: ['websocket'] });
  const black = io(address, { autoConnect: false, reconnection: false, transports: ['websocket'] });
  t.after(() => { white.disconnect(); black.disconnect(); });
  const connected = [wait(white, 'connect'), wait(black, 'connect')];
  white.connect(); black.connect();
  await Promise.all(connected);
  const room = await send(white, 'create_room', undefined, 'room_created');
  if (start) {
    const starts = [wait(white, 'game_start'), wait(black, 'game_start')];
    black.emit('join_room', { roomId: room.roomId });
    await Promise.all(starts);
  }
  return { white, black, room };
}

test('two players receive the same legal position; bad moves do not crash the server', async t => {
  const { white, black } = await pair(t);
  assert.equal((await send(black, 'make_move', { from: 'e7', to: 'e5' }, 'invalid_move')).reason, 'Not your turn');
  assert.equal((await send(white, 'make_move', { from: 'e2', to: 'e5' }, 'invalid_move')).reason, 'Invalid move');
  assert.equal((await send(white, 'make_move', null, 'invalid_move')).reason, 'Invalid move');
  const both = [wait(white, 'move_made'), wait(black, 'move_made')];
  white.emit('make_move', { from: 'e2', to: 'e4' });
  const [a, b] = await Promise.all(both);
  assert.equal(a.fen, b.fen);
  assert.equal(a.san, 'e4');
  assert.equal(a.turn, 'b');
});

test('waiting rooms reject moves and malformed joins without losing the room', async t => {
  const { white, black, room } = await pair(t, false);
  assert.equal((await send(white, 'make_move', { from: 'e2', to: 'e4' }, 'invalid_move')).reason, 'Game is not active');
  assert.match((await send(black, 'join_room', null, 'error')).message, /six-character/);
  const starts = [wait(white, 'game_start'), wait(black, 'game_start')];
  black.emit('join_room', { roomId: room.roomId });
  await Promise.all(starts);
});

test('a player can answer check, then resign with the correct winner', async t => {
  const { white, black } = await pair(t);
  await move(white, black, white, 'e2', 'e4');
  await move(white, black, black, 'd7', 'd5');
  assert.equal((await move(white, black, white, 'f1', 'b5')).status, 'check');
  assert.equal((await move(white, black, black, 'c7', 'c6')).status, 'playing');
  const endings = [wait(white, 'game_over'), wait(black, 'game_over')];
  black.emit('resign');
  for (const ending of await Promise.all(endings)) assert.deepEqual(ending.winner, 'white');
  white.emit('leave_room'); black.emit('leave_room');
  const fresh = await send(white, 'create_room', undefined, 'room_created');
  assert.match(fresh.roomId, /^[A-F0-9]{6}$/);
});

test('disconnect before the first move ends the game for the remaining player', async t => {
  const { white, black } = await pair(t);
  const ending = wait(white, 'game_over');
  black.disconnect();
  assert.deepEqual(await ending, { reason: 'disconnect', winner: 'white' });
});

test('checkmate reaches both players and rejects further moves', async t => {
  const { white, black } = await pair(t);
  await move(white, black, white, 'f2', 'f3');
  await move(white, black, black, 'e7', 'e5');
  await move(white, black, white, 'g2', 'g4');
  const ending = await move(white, black, black, 'd8', 'h4');
  assert.equal(ending.status, 'checkmate');
  assert.equal(ending.winner, 'black');
  assert.equal((await send(white, 'make_move', { from: 'e2', to: 'e4' }, 'invalid_move')).reason, 'Game is not active');
});
