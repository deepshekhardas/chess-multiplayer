# Chess Multiplayer - Real-Time Board Game

## 1. Project Overview

**Project Name:** Chess Multiplayer
**Type:** Real-time multiplayer web game
**Core Functionality:** Play chess online with another player in real-time, featuring move validation, turn-based gameplay, and game state synchronization
**Target Users:** Casual chess players wanting quick online matches

## 2. Technical Stack

- **Frontend:** React 18 + Vite
- **Backend:** Node.js + Express + Socket.IO
- **Chess Logic:** chess.js library
- **Real-time:** Socket.IO for WebSocket communication

## 3. Visual & Rendering Specification

### Scene Setup
- 8x8 chess board with alternating light/dark squares
- Board orientation flips based on player color (white/bottom or black/top)
- Pieces rendered as Unicode chess symbols with styled shadows

### Color Palette
- **Board Light:** `#f0d9b5` (warm cream)
- **Board Dark:** `#b58863` (warm brown)
- **Highlight (selected):** `#829769` (sage green)
- **Highlight (valid moves):** `#c5e8b7` (light green dot)
- **Highlight (last move):** `#f6f669` (yellow tint)
- **Background:** `#312e2b` (dark charcoal)
- **Accent:** `#769656` (forest green)

### Typography
- **Primary Font:** "Playfair Display" (elegant serif for headings)
- **Secondary Font:** "Source Sans 3" (clean sans-serif for UI)
- **Piece Symbols:** Large, bold Unicode characters

### Visual Effects
- Subtle piece drop shadow
- Hover highlight on valid squares
- Smooth piece movement transitions
- Game status messages with fade animation

## 4. Game Logic Specification

### Chess Rules (via chess.js)
- All standard chess moves validated
- Special moves: castling, en passant, pawn promotion
- Check and checkmate detection
- Stalemate detection

### Game States
- `waiting` - Looking for opponent
- `playing` - Game in progress
- `check` - Player in check
- `checkmate` - Game over (winner declared)
- `stalemate` - Game over (draw)
- `resigned` - Player resigned

### Turn System
- White moves first
- Strict turn alternation enforced server-side
- Invalid moves rejected with error feedback

## 5. Multiplayer Architecture

### Matchmaking
- Simple room-based matchmaking
- Player creates room → gets room code
- Second player joins with room code
- Random color assignment (first joiner = white)

### Real-time Sync (Socket.IO Events)
**Client → Server:**
- `create_room` - Create new game room
- `join_room` - Join existing room with code
- `make_move` - Submit a move (san notation)
- `resign` - Forfeit the game

**Server → Client:**
- `room_created` - Room code for sharing
- `opponent_joined` - Second player connected
- `game_start` - Both players ready, game begins
- `move_made` - Broadcast move to both players
- `invalid_move` - Rejection with reason
- `game_over` - Final state (checkmate/stalemate/resign)
- `opponent_disconnected` - Handle disconnects

### State Management
- Server authoritative for game state
- Board state synced on each valid move
- Move history maintained for potential replay

## 6. UI Components

### Lobby Screen
- "Create Game" button → generates room code
- "Join Game" input field + button
- Room code display with copy button
- Waiting state with animated indicator

### Game Screen
- Chess board (centered, responsive sizing)
- Player info panels (top: opponent, bottom: current player)
- Move history sidebar (scrollable)
- Game controls (resign button)
- Turn indicator with color highlight

### Game Over Modal
- Result announcement (Checkmate!/Stalemate/Resignation)
- Winner display
- "Play Again" and "Return to Lobby" buttons

## 7. Acceptance Criteria

1. Two players can connect and play a full game of chess
2. All valid chess moves are recognized and executed
3. Invalid moves are rejected with visual feedback
4. Check, checkmate, and stalemate are properly detected
5. Board orientation is correct for each player
6. Real-time sync via WebSocket (no polling)
7. Disconnect handling with opponent notification
8. Clean, responsive UI that works on desktop browsers
