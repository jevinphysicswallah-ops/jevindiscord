import { FormEvent, useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { ApiError, api, jsonBody } from '../lib/api';
import type { GameRoom, GameType, User } from '../types';

const games: Array<{ type: GameType; title: string; caption: string; color: string; symbol: string; maxPlayers: number }> = [
  { type: 'tictactoe', title: 'Tic-tac-toe', caption: 'Fast, familiar, mildly competitive.', color: 'coral', symbol: '×○', maxPlayers: 2 },
  { type: 'connect4', title: 'Connect four', caption: 'Gravity, tactics, satisfying diagonals.', color: 'violet', symbol: '••', maxPlayers: 2 },
  { type: 'rps', title: 'RPS showdown', caption: 'Best of three. No take-backs.', color: 'mint', symbol: '✌', maxPlayers: 2 },
  { type: 'reaction', title: 'Reaction battle', caption: 'Wait for green, then beat everyone to the tap.', color: 'rose', symbol: '⚡', maxPlayers: 8 },
  { type: 'guess', title: 'Number hunt', caption: 'Follow the clues and find the hidden number.', color: 'blue', symbol: '#', maxPlayers: 8 },
  { type: 'trivia', title: 'Trivia sprint', caption: 'Quick questions for the whole room.', color: 'amber', symbol: '?', maxPlayers: 8 },
];

interface GamesViewProps {
  user: User;
  rooms: GameRoom[];
  sendAction: (roomId: string, action: string, data?: unknown) => void;
  onRefresh: () => void;
}

export function GamesView({ user, rooms, sendAction, onRefresh }: GamesViewProps) {
  const [creating, setCreating] = useState<GameType | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const active = rooms.find((room) => room.players.some((player) => player.userId === user.id));

  async function createRoom(type: GameType, maxPlayers: number) {
    setCreating(type); setError('');
    try {
      await api('/api/games/create', { method: 'POST', ...jsonBody({ gameType: type, maxPlayers }) });
      onRefresh();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Could not create the room.');
    } finally { setCreating(null); }
  }

  async function join(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      await api('/api/games/join', { method: 'POST', ...jsonBody({ code: joinCode }) });
      setJoinCode(''); onRefresh();
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Room not found.'); }
  }

  if (active) return <ActiveGame user={user} room={active} sendAction={sendAction} />;

  return (
    <div className="view games-view">
      <section className="game-hero panel">
        <div><span className="eyebrow"><Icon name="game" size={15}/> INSTANT PLAY</span><h2>What are we playing?</h2><p>Create a room, send the six-character code, and settle it properly.</p></div>
        <form className="join-code" onSubmit={join}><label>HAVE A ROOM CODE?</label><div><input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} maxLength={6} placeholder="ABC123" aria-label="Room code"/><button type="submit">Join</button></div></form>
      </section>
      {error && <div className="form-error">{error}</div>}
      <section className="game-card-grid">
        {games.map((game) => <article className={`game-card ${game.color}`} key={game.type}>
          <div className="game-symbol">{game.symbol}</div><span className="eyebrow">{game.maxPlayers === 2 ? 'HEAD TO HEAD' : `UP TO ${game.maxPlayers}`}</span><h3>{game.title}</h3><p>{game.caption}</p>
          <button onClick={() => void createRoom(game.type, game.maxPlayers)} disabled={creating !== null}>{creating === game.type ? <span className="button-spinner"/> : <><Icon name="plus" size={17}/> Create room</>}</button>
        </article>)}
      </section>
      <section className="panel open-rooms">
        <div className="panel-heading"><div><span className="eyebrow">OPEN LOBBIES</span><h2>Rooms looking for players</h2></div><span className="count-chip">{rooms.filter((room) => room.status === 'waiting').length} open</span></div>
        {rooms.filter((room) => room.status === 'waiting').length ? <div className="room-list">{rooms.filter((room) => room.status === 'waiting').map((room) => <div key={room.id}><span className="room-game-icon"><Icon name="game"/></span><div><strong>{room.name}</strong><small>{room.players.length}/{room.maxPlayers} players · code {room.code}</small></div><form onSubmit={(event) => { event.preventDefault(); setJoinCode(room.code); void api('/api/games/join', { method: 'POST', ...jsonBody({ code: room.code }) }).then(onRefresh); }}><button className="small-button">Join room</button></form></div>)}</div> : <div className="warm-empty compact"><span>✦</span><h3>No open rooms yet</h3><p>Be the one who starts something.</p></div>}
      </section>
    </div>
  );
}

function ActiveGame({ user, room, sendAction }: { user: User; room: GameRoom; sendAction: GamesViewProps['sendAction'] }) {
  const ready = room.players.find((player) => player.userId === user.id)?.isReady;
  const canMove = room.status === 'playing' && room.currentTurn === user.id;
  const winner = room.winner === 'draw' ? 'Round draw' : room.players.find((player) => player.userId === room.winner)?.displayName;
  return (
    <div className="view active-game-view">
      <section className="panel active-game-card">
        <div className="game-session-head"><div><span className="eyebrow">ROOM {room.code}</span><h2>{room.name}</h2><p>{room.status === 'waiting' ? 'Ready up when everyone is here.' : canMove ? 'Your move.' : 'Waiting for the other player…'}</p></div><button className="text-button danger-text" onClick={() => sendAction(room.id, 'leave')}>Leave room</button></div>
        <div className="player-versus">{room.players.map((player, index) => <div key={player.userId} className={player.userId === room.currentTurn ? 'turn' : ''}><img src={player.avatar} alt=""/><strong>{player.displayName}</strong><span>{player.isReady ? 'Ready' : 'Not ready'}</span>{index === 0 && <b>VS</b>}</div>)}</div>
        {room.status === 'waiting' && <button className={`ready-button ${ready ? 'ready' : ''}`} onClick={() => sendAction(room.id, 'ready')}><Icon name={ready ? 'check' : 'sparkles'}/>{ready ? 'Ready — waiting for others' : 'Ready up'}</button>}
        {room.status === 'playing' && <GameSurface user={user} room={room} canMove={canMove} sendAction={sendAction} />}
        {room.status === 'finished' && <div className="game-finished"><span>✦</span><h3>{winner ? `${winner}${room.winner === 'draw' ? '' : ' wins!'}` : 'Round complete'}</h3><button className="primary-button" onClick={() => sendAction(room.id, 'rematch')}><Icon name="game"/> Play again</button></div>}
      </section>
    </div>
  );
}

function GameSurface({ user, room, canMove, sendAction }: { user: User; room: GameRoom; canMove: boolean; sendAction: GamesViewProps['sendAction'] }) {
  const [guess, setGuess] = useState('');
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    if (room.gameType !== 'reaction') return;
    const timer = window.setInterval(() => setClock(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, [room.gameType]);

  if (room.gameType === 'tictactoe') {
    const board = (room.gameState?.board as Array<string | null> | undefined) ?? Array(9).fill(null);
    return <div className="tic-board">{board.map((cell, index) => <button key={index} disabled={!canMove || !!cell} onClick={() => sendAction(room.id, 'move', { index })}>{cell}</button>)}</div>;
  }

  if (room.gameType === 'connect4') {
    const grid = (room.gameState?.grid as Array<Array<string | null>> | undefined) ?? Array.from({ length: 6 }, () => Array(7).fill(null));
    return <div className="connect-board">{grid.flatMap((row, rowIndex) => row.map((cell, column) => <button key={`${rowIndex}-${column}`} disabled={!canMove} onClick={() => sendAction(room.id, 'move', { col: column })} aria-label={`Drop in column ${column + 1}`}><i className={cell || ''}/></button>))}</div>;
  }

  if (room.gameType === 'rps') {
    const state = room.gameState as { round?: number; scores?: Record<string, number>; choicesSubmitted?: string[] } | null;
    const chosen = state?.choicesSubmitted?.includes(user.id);
    return <div className="rps-board"><span className="round-chip">ROUND {state?.round ?? 1}</span><div>{(['rock', 'paper', 'scissors'] as const).map((choice) => <button key={choice} disabled={chosen} onClick={() => sendAction(room.id, 'move', { choice })}><b>{choice === 'rock' ? '✊' : choice === 'paper' ? '✋' : '✌️'}</b><span>{choice}</span></button>)}</div><p>{chosen ? 'Choice locked. Waiting for the reveal…' : 'Choose carefully. Your move stays hidden.'}</p></div>;
  }

  if (room.gameType === 'reaction') {
    const startTime = Number(room.gameState?.startTime || 0);
    const ready = clock >= startTime;
    return <div className={`reaction-board ${ready ? 'go' : ''}`}><button onClick={() => sendAction(room.id, 'move', {})}><span>{ready ? 'GO!' : 'WAIT'}</span><small>{ready ? 'Tap now' : 'A false start counts against you'}</small></button></div>;
  }

  if (room.gameType === 'guess') {
    const guesses = (room.gameState?.guesses as Array<{ userId: string; username: string; guess: number; hint: string }> | undefined) ?? [];
    return <div className="guess-board"><div><span>1</span><i/><strong>?</strong><i/><span>100</span></div><form onSubmit={(event) => { event.preventDefault(); sendAction(room.id, 'move', { guess }); setGuess(''); }}><input value={guess} onChange={(event) => setGuess(event.target.value)} inputMode="numeric" min="1" max="100" type="number" placeholder="Your guess" disabled={!canMove}/><button disabled={!canMove || !guess}>Guess</button></form><div className="guess-history">{guesses.slice(-4).reverse().map((item, index) => <p key={`${item.userId}-${index}`}><span>{item.username}</span><strong>{item.guess}</strong><b>{item.hint}</b></p>)}</div></div>;
  }

  const state = room.gameState as { questionIndex?: number; questions?: Array<{ q: string; options: string[] }>; answers?: Record<string, number>; scores?: Record<string, number> } | null;
  const question = state?.questions?.[state.questionIndex ?? 0];
  const answered = state?.answers?.[user.id] !== undefined;
  return <div className="trivia-board"><span className="round-chip">QUESTION {(state?.questionIndex ?? 0) + 1} OF {state?.questions?.length ?? 0}</span><h3>{question?.q ?? 'Loading question…'}</h3><div>{question?.options.map((option, index) => <button key={option} disabled={answered} onClick={() => sendAction(room.id, 'move', { answerIndex: index })}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div>{answered && <p>Answer locked. Waiting for the room…</p>}</div>;
}
