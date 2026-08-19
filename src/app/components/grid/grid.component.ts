import { Component } from '@angular/core';
import * as ChessModule from 'chess.js';
import { io, Socket } from 'socket.io-client';

const ChessConstructor: any = (ChessModule as any).Chess || (ChessModule as any).default || ChessModule;

interface MoveOption {
  from: string;
  to: string;
  san: string;
  captured?: string;
  color: 'w' | 'b';
  flags: string;
  piece: string;
}

interface ServerState {
  fen: string;
  history: MoveOption[];
  capturedWhite: string[];
  capturedBlack: string[];
  turn: 'w' | 'b';
  check: boolean;
  gameOver: boolean;
  draw: boolean;
  checkmate: boolean;
  stalemate: boolean;
  players: Array<{ id: string; name: string; color: 'w' | 'b' }>;
}

@Component({
  selector: 'app-grid',
  templateUrl: './grid.component.html',
  styleUrls: ['./grid.component.scss'],
})
export class GridComponent {
  readonly files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  readonly ranks = [8, 7, 6, 5, 4, 3, 2, 1];
  readonly promotionPieces = [
    { value: 'q', label: 'Queen' },
    { value: 'r', label: 'Rook' },
    { value: 'b', label: 'Bishop' },
    { value: 'n', label: 'Knight' },
  ];

  grid: string[][] = [];
  selectedSquare: string | null = null;
  legalTargets: string[] = [];
  lastMove: { from: string; to: string } | null = null;
  promotionMove: { from: string; to: string } | null = null;
  moveHistory: MoveOption[] = [];
  capturedWhite: string[] = [];
  capturedBlack: string[] = [];
  statusMessage = 'White to move';
  isCheck = false;
  isGameOver = false;
  isDraw = false;
  playerColor: 'w' | 'b' | 'spectator' | 'waiting' = 'waiting';
  connectionStatus = 'Connecting';
  onlinePlayers = 0;

  private game = new ChessConstructor();
  private socket!: Socket;
  roomId = 'main';

  constructor() {
    this.syncBoard();
    this.connectToGame();
  }

  get turnLabel(): string {
    return this.game.turn() === 'w' ? 'White' : 'Black';
  }

  get isOnline(): boolean {
    return !!this.socket && this.socket.connected && this.playerColor !== 'waiting';
  }

  get moveCount(): number {
    return Math.ceil(this.moveHistory.length / 2);
  }

  getPieceImage(piece: string): string {
    const normalized = piece.toLowerCase();
    return piece === piece.toUpperCase()
      ? `${normalized}.png`
      : `${normalized}${normalized}.png`;
  }

  getPieceLabel(piece: string): string {
    const color = piece === piece.toUpperCase() ? 'black' : 'white';
    const names: { [key: string]: string } = {
      p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
    };
    return `${color} ${names[piece.toLowerCase()]}`;
  }

  getPromotionImage(piece: string): string {
    return this.game.turn() === 'b' ? `${piece}.png` : `${piece}${piece}.png`;
  }

  isLightSquare(row: number, column: number): boolean {
    return (row + column) % 2 === 0;
  }

  isSelected(square: string): boolean {
    return this.selectedSquare === square;
  }

  isLegalTarget(square: string): boolean {
    return this.legalTargets.includes(square);
  }

  isLastMove(square: string): boolean {
    return !!this.lastMove && (this.lastMove.from === square || this.lastMove.to === square);
  }

  onSquareClick(row: number, column: number): void {
    if (this.promotionMove || this.isGameOver) return;

    const square = this.toSquare(row, column);
    if (this.selectedSquare && this.isLegalTarget(square)) {
      if (this.isPromotionMove(this.selectedSquare, square)) {
        this.promotionMove = { from: this.selectedSquare, to: square };
      } else {
        this.makeMove(this.selectedSquare, square);
      }
      return;
    }

    const piece = this.grid[row][column];
    if (piece && this.isCurrentPlayerPiece(piece)) {
      this.selectSquare(square);
    } else {
      this.clearSelection();
    }
  }

  choosePromotion(piece: string): void {
    if (!this.promotionMove) return;
    const move = this.promotionMove;
    this.promotionMove = null;
    this.makeMove(move.from, move.to, piece);
  }

  cancelPromotion(): void {
    this.promotionMove = null;
  }

  newGame(): void {
    if (this.isOnline) {
      this.socket.emit('new-game');
      return;
    }
    this.game.reset();
    this.moveHistory = [];
    this.capturedWhite = [];
    this.capturedBlack = [];
    this.lastMove = null;
    this.clearSelection();
    this.syncBoard();
  }

  undoMove(): void {
    if (!this.moveHistory.length || this.promotionMove) return;
    if (this.isOnline) {
      this.socket.emit('undo-move');
      return;
    }
    this.game.undo();
    const move = this.moveHistory.pop();
    if (move && move.captured) {
      const captured = move.color === 'w' ? this.capturedBlack : this.capturedWhite;
      const index = captured.lastIndexOf(move.captured.toUpperCase());
      if (index >= 0) captured.splice(index, 1);
    }
    const previous = this.moveHistory[this.moveHistory.length - 1];
    this.lastMove = previous ? { from: previous.from, to: previous.to } : null;
    this.clearSelection();
    this.syncBoard();
  }

  private selectSquare(square: string): void {
    const moves = this.game.moves({ square, verbose: true }) as MoveOption[];
    this.selectedSquare = square;
    this.legalTargets = moves.map((move) => move.to);
  }

  private makeMove(from: string, to: string, promotion?: string): void {
    if (this.isOnline) {
      this.socket.emit('make-move', { from, to, promotion });
      this.clearSelection();
      this.statusMessage = 'Sending move...';
      return;
    }

    const move = this.game.move({ from, to, promotion }) as MoveOption | null;
    if (!move) return;

    this.moveHistory.push(move);
    this.lastMove = { from: move.from, to: move.to };
    if (move.captured) {
      const captured = move.captured.toUpperCase();
      (move.color === 'w' ? this.capturedBlack : this.capturedWhite).push(captured);
    }
    this.clearSelection();
    this.syncBoard();
  }

  private syncBoard(): void {
    this.grid = this.game.board().map((row: any[]) =>
      row.map((piece: any) => piece ? (piece.color === 'w' ? piece.type : piece.type.toUpperCase()) : '')
    );
    this.isCheck = this.game.in_check();
    this.isGameOver = this.game.game_over();
    this.isDraw = this.game.in_draw();

    if (this.game.in_checkmate()) {
      this.statusMessage = `${this.turnLabel} is checkmated`;
    } else if (this.game.in_stalemate()) {
      this.statusMessage = 'Stalemate';
    } else if (this.isDraw) {
      this.statusMessage = 'Draw';
    } else if (this.isCheck) {
      this.statusMessage = `${this.turnLabel} is in check`;
    } else {
      this.statusMessage = `${this.turnLabel} to move`;
    }
  }

  private clearSelection(): void {
    this.selectedSquare = null;
    this.legalTargets = [];
  }

  private isCurrentPlayerPiece(piece: string): boolean {
    const pieceColor = piece === piece.toLowerCase() ? 'w' : 'b';
    return this.game.turn() === pieceColor &&
      (this.playerColor === 'waiting' || this.playerColor === pieceColor);
  }

  private isPromotionMove(from: string, to: string): boolean {
    const row = this.ranks.indexOf(Number(from[1]));
    const column = this.files.indexOf(from[0]);
    const piece = this.grid[row][column];
    return piece.toLowerCase() === 'p' && (to[1] === '1' || to[1] === '8');
  }

  private toSquare(row: number, column: number): string {
    return `${this.files[column]}${this.ranks[row]}`;
  }

  private connectToGame(): void {
    this.roomId = new URLSearchParams(window.location.search).get('room') || 'main';
    const serverUrl = window.location.port === '4200' ? 'http://localhost:8080' : undefined;
    this.socket = io(serverUrl, {
      auth: { roomId: this.roomId },
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      this.connectionStatus = 'Online';
      this.socket.emit('join-game', { roomId: this.roomId, name: 'Player' });
    });
    this.socket.on('player-assigned', ({ color, roomId }: { color: 'w' | 'b' | 'spectator'; roomId: string }) => {
      this.playerColor = color;
      this.roomId = roomId;
    });
    this.socket.on('game-state', (state: ServerState) => this.applyServerState(state));
    this.socket.on('move-rejected', ({ message }: { message: string }) => {
      this.clearSelection();
      this.statusMessage = message;
    });
    this.socket.on('disconnect', () => {
      this.connectionStatus = 'Offline';
      this.playerColor = 'waiting';
      this.statusMessage = 'Connection lost';
    });
  }

  private applyServerState(state: ServerState): void {
    this.game.load(state.fen);
    this.moveHistory = state.history || [];
    this.capturedWhite = state.capturedWhite || [];
    this.capturedBlack = state.capturedBlack || [];
    this.lastMove = this.moveHistory.length
      ? { from: this.moveHistory[this.moveHistory.length - 1].from, to: this.moveHistory[this.moveHistory.length - 1].to }
      : null;
    this.onlinePlayers = state.players.length;
    this.isCheck = state.check;
    this.isGameOver = state.gameOver;
    this.isDraw = state.draw;
    this.clearSelection();
    this.syncBoard();

    if (this.playerColor === 'spectator') {
      this.statusMessage = 'Spectating this game';
    } else if (this.onlinePlayers < 2) {
      this.statusMessage = 'Waiting for the second player';
    }
  }
}