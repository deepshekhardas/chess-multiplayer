import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { Chess } from 'chess.js';

const SOCKET_URL = 'http://localhost:3001';

const PIECES = {
  'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟',
  'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚', 'P': '♟'
};

function App() {
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState('lobby');
  const [roomId, setRoomId] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [playerColor, setPlayerColor] = useState(null);
  const [fen, setFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [turn, setTurn] = useState('w');
  const [status, setStatus] = useState('playing');
  const [moveHistory, setMoveHistory] = useState([]);
  const [gameOver, setGameOver] = useState(null);
  const [error, setError] = useState(null);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [opponentColor, setOpponentColor] = useState(null);
  const [copied, setCopied] = useState(false);

  const chessRef = useRef(new Chess());

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('room_created', ({ roomId: id, color }) => {
      setRoomId(id);
      setPlayerColor(color);
      setWaitingForOpponent(true);
      setError(null);
    });

    newSocket.on('room_joined', ({ roomId: id, color }) => {
      setRoomId(id);
      setPlayerColor(color);
      setWaitingForOpponent(false);
      setError(null);
    });

    newSocket.on('game_start', ({ orientation, initialFen }) => {
      setFen(initialFen);
      chessRef.current = new Chess(initialFen);
      setGameState('playing');
      setWaitingForOpponent(false);
      setStatus('playing');
      setTurn('w');
      setMoveHistory([]);
      setGameOver(null);
      setSelectedSquare(null);
      setLastMove(null);
      setOpponentColor(playerColor === 'white' ? 'black' : 'white');
    });

    newSocket.on('move_made', (data) => {
      chessRef.current.load(data.fen);
      setFen(data.fen);
      setTurn(data.turn);
      setStatus(data.status);
      setLastMove(data.lastMove);

      if (data.san) {
        setMoveHistory(prev => [...prev, { san: data.san, color: data.color }]);
      }

      if (data.status === 'checkmate' || data.status === 'stalemate' || data.reason === 'resignation') {
        setGameOver({
          type: data.status === 'checkmate' ? 'checkmate' : data.reason,
          winner: data.winner
        });
      }
    });

    newSocket.on('invalid_move', ({ reason }) => {
      setError(reason);
      setTimeout(() => setError(null), 2000);
    });

    newSocket.on('opponent_disconnected', () => {
      setGameOver({ type: 'disconnect', winner: playerColor });
    });

    newSocket.on('game_over', (data) => {
      setGameOver({
        type: data.reason,
        winner: data.winner
      });
    });

    newSocket.on('error', ({ message }) => {
      setError(message);
      setWaitingForOpponent(false);
    });

    return () => newSocket.disconnect();
  }, [playerColor]);

  const createRoom = () => {
    if (socket) {
      socket.emit('create_room');
    }
  };

  const joinRoom = () => {
    if (socket && joinCode.trim()) {
      setError(null);
      socket.emit('join_room', { roomId: joinCode.trim().toUpperCase() });
    }
  };

  const copyRoomCode = useCallback(() => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [roomId]);

  const getValidMovesForSquare = (square) => {
    const moves = chessRef.current.moves({ square, verbose: true });
    return moves.map(m => m.to);
  };

  const handleSquareClick = (square) => {
    if (!socket || status !== 'playing') return;
    if ((turn === 'w' && playerColor !== 'white') || (turn === 'b' && playerColor !== 'black')) return;

    if (selectedSquare) {
      const moves = getValidMovesForSquare(selectedSquare);
      if (moves.includes(square)) {
        const piece = chessRef.current.get(square);
        const isPromotion = piece && piece.type === 'p' &&
          ((playerColor === 'white' && square[1] === '8') ||
           (playerColor === 'black' && square[1] === '1'));

        if (isPromotion) {
          socket.emit('make_move', { from: selectedSquare, to: square, promotion: 'q' });
        } else {
          socket.emit('make_move', { from: selectedSquare, to: square });
        }
        setSelectedSquare(null);
        setValidMoves([]);
      } else {
        setSelectedSquare(square);
        setValidMoves(getValidMovesForSquare(square));
      }
    } else {
      const piece = chessRef.current.get(square);
      if (piece && ((playerColor === 'white' && piece.color === 'w') ||
                     (playerColor === 'black' && piece.color === 'b'))) {
        setSelectedSquare(square);
        setValidMoves(getValidMovesForSquare(square));
      }
    }
  };

  const handleResign = () => {
    if (socket) {
      socket.emit('resign');
    }
  };

  const returnToLobby = () => {
    setGameState('lobby');
    setRoomId('');
    setPlayerColor(null);
    setFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    setSelectedSquare(null);
    setValidMoves([]);
    setLastMove(null);
    setMoveHistory([]);
    setGameOver(null);
    setWaitingForOpponent(false);
    chessRef.current = new Chess();
  };

  const renderBoard = () => {
    const board = [];
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

    const isFlipped = playerColor === 'black';

    for (let rankIdx = 0; rankIdx < 8; rankIdx++) {
      for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
        const file = isFlipped ? 7 - fileIdx : fileIdx;
        const rank = isFlipped ? rankIdx : 7 - rankIdx;
        const square = files[file] + ranks[rank];
        const isLight = (file + rank) % 2 === 0;
        const piece = chessRef.current.get(square);

        const isSelected = selectedSquare === square;
        const isValidMove = validMoves.includes(square);
        const isLastMoveSquare = lastMove &&
          (lastMove.from === square || lastMove.to === square);

        let className = `square ${isLight ? 'light' : 'dark'}`;
        if (isSelected) className += ' selected';
        if (isValidMove) className += ' valid-move';
        if (isLastMoveSquare) className += ' last-move';

        board.push(
          <div
            key={square}
            className={className}
            onClick={() => handleSquareClick(square)}
          >
            {piece && (
              <span className="piece">{PIECES[piece.color === 'w' ? piece.type.toUpperCase() : piece.type]}</span>
            )}
          </div>
        );
      }
    }
    return board;
  };

  if (gameState === 'lobby') {
    return (
      <div className="app">
        <div className="lobby">
          <h1>Chess Multiplayer</h1>
          <p>Challenge a friend to a game of chess</p>

          {error && <div className="error-message">{error}</div>}

          <div className="lobby-actions">
            <button className="btn btn-primary" onClick={createRoom}>
              Create Game
            </button>

            <div className="join-form">
              <input
                type="text"
                placeholder="Enter room code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
              />
              <button className="btn btn-secondary" onClick={joinRoom}>
                Join
              </button>
            </div>
          </div>

          {waitingForOpponent && (
            <div className="waiting">
              <h3>Waiting for opponent...</h3>
              <div className="room-code">{roomId}</div>
              <button className="copy-btn" onClick={copyRoomCode}>
                {copied ? 'Copied!' : 'Copy Code'}
              </button>
              <div className="spinner"></div>
              <p style={{ marginTop: '20px', color: '#9a9a9a' }}>
                Share this code with your opponent
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (gameOver) {
    const winnerText = gameOver.winner === playerColor ? 'You win!' : 'You lose!';
    const reasonText = gameOver.type === 'checkmate' ? 'Checkmate!' :
                       gameOver.type === 'stalemate' ? 'Stalemate - Draw!' :
                       gameOver.type === 'draw' ? 'Game Drawn' :
                       gameOver.type === 'resignation' ? 'Opponent resigned!' :
                       'Opponent disconnected - You win!';

    return (
      <div className="app">
        <div className="game-over-modal">
          <div className="game-over-content">
            <h2>{reasonText}</h2>
            {gameOver.type !== 'stalemate' && gameOver.type !== 'draw' && gameOver.type !== 'disconnect' && (
              <p className="winner">{winnerText}</p>
            )}
            {gameOver.type === 'stalemate' && (
              <p className="winner">Game ended in a draw</p>
            )}
            {gameOver.type === 'draw' && (
              <p className="winner">Game ended in a draw</p>
            )}
            <div className="game-over-actions">
              <button className="btn btn-primary" onClick={returnToLobby}>
                Return to Lobby
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isMyTurn = (turn === 'w' && playerColor === 'white') || (turn === 'b' && playerColor === 'black');

  return (
    <div className="app">
      <div className="game-container">
        {error && <div className="error-message">{error}</div>}

        <div className={`player-info ${opponentColor || 'black'}`}>
          <div className="color-indicator"></div>
          <span className="player-label">Opponent</span>
          {!isMyTurn && playerColor && <span className="turn-indicator">Their Turn</span>}
        </div>

        <div className="chess-board">
          {renderBoard()}
        </div>

        <div className={`player-info ${playerColor}`}>
          <div className="color-indicator"></div>
          <span className="player-label">You ({playerColor})</span>
          {isMyTurn && <span className="turn-indicator">Your Turn</span>}
        </div>

        {moveHistory.length > 0 && (
          <div className="move-history">
            <h3>Move History</h3>
            <div className="move-list">
              {moveHistory.map((move, idx) => (
                <span key={idx} className="move-item">
                  {idx % 2 === 0 && <span className="move-number">{Math.floor(idx / 2) + 1}.</span>}
                  {move.san}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="game-controls">
          <button className="btn" onClick={handleResign}>
            Resign
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;