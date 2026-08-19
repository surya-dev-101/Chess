declare module 'chess.js' {
  class Chess {
    constructor(fen?: string);
    board(): any[][];
    load(fen: string): boolean;
    turn(): 'w' | 'b';
    moves(options?: any): any[];
    move(move: any): any;
    undo(): any;
    reset(): void;
    in_check(): boolean;
    in_checkmate(): boolean;
    in_stalemate(): boolean;
    in_draw(): boolean;
    game_over(): boolean;
  }
  export default Chess;
}