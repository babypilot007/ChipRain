import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import './style.css';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const db = URL && KEY ? createClient(URL, KEY) : null;
const DENOMS = [1, 5, 25, 100, 500];
const COLORS = ['red', 'blue', 'green', 'black', 'purple'];
const money = n => '$' + Number(n || 0).toLocaleString('en-US');
const stackValue = counts => DENOMS.reduce((sum, d, i) => sum + d * (counts?.[i] || 0), 0);
const newToken = () => crypto.randomUUID();

function Header() {
  return <header className="header"><div className="mark">♠</div><div><b>POKER CHIPS</b><small>VIRTUAL TABLE</small></div></header>;
}

export default function App() {
  const [screen, setScreen] = useState('home');
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState(new URLSearchParams(location.search).get('room') || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [playerToken] = useState(() => sessionStorage.poker_player || newToken());
  const [hostToken] = useState(() => sessionStorage.poker_host || newToken());

  useEffect(() => {
    sessionStorage.poker_player = playerToken;
    sessionStorage.poker_host = hostToken;
  }, [playerToken, hostToken]);

  const isHost = !!room && room.host_token === hostToken;
  const myPlayer = players.find(p => p.player_token === playerToken);
  const tableTotal = useMemo(() => players.reduce((sum, p) => sum + stackValue(p.counts), 0), [players]);

  async function fetchRoom(roomCode) {
    const { data: found, error } = await db.from('poker_rooms').select('*').eq('code', roomCode).maybeSingle();
    if (error) throw error;
    if (!found) throw new Error('Room not found. Check the room code.');
    const { data, error: playersError } = await db.from('poker_players').select('*').eq('room_id', found.id).order('created_at');
    if (playersError) throw playersError;
    setRoom(found);
    setPlayers(data || []);
    setCode(found.code);
    return found;
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const roomCode = params.get('room');
    if (!db || !roomCode) return;
    fetchRoom(roomCode.toUpperCase()).then(found => {
      if (location.pathname.startsWith('/admin')) {
        if (found.host_token === hostToken) setScreen('admin');
        else { setScreen('table'); setMessage('Admin access is available only in the host browser.'); }
      } else {
        setScreen('table');
      }
    }).catch(err => setMessage(err.message));
    // hostToken is stable for this browser tab/session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!room?.id) return;
    const channel = db.channel('poker-room-' + room.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_players', filter: `room_id=eq.${room.id}` }, async () => {
        const { data } = await db.from('poker_players').select('*').eq('room_id', room.id).order('created_at');
        if (data) setPlayers(data);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_rooms', filter: `id=eq.${room.id}` }, event => {
        if (event.new) setRoom(event.new);
      }).subscribe();
    return () => db.removeChannel(channel);
  }, [room?.id]);

  async function createRoom(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const roomCode = Math.random().toString(36).slice(2, 7).toUpperCase();
      const { data: created, error } = await db.from('poker_rooms')
        .insert({ code: roomCode, host_token: hostToken, pot: 0 }).select().single();
      if (error) throw error;
      const { data: player, error: playerError } = await db.from('poker_players')
        .insert({ room_id: created.id, nickname: name.trim(), counts: [0,0,0,0,0], player_token: playerToken }).select().single();
      if (playerError) throw playerError;
      setRoom(created); setPlayers([player]); setCode(roomCode); setScreen('table');
      history.pushState({}, '', `/?room=${roomCode}`);
    } catch (err) { setMessage(err.message); }
    setBusy(false);
  }

  async function joinRoom(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const found = await fetchRoom(code.trim().toUpperCase());
      const existing = (await db.from('poker_players').select('*').eq('room_id', found.id).eq('player_token', playerToken).maybeSingle()).data;
      if (!existing) {
        const { data: player, error } = await db.from('poker_players')
          .insert({ room_id: found.id, nickname: name.trim(), counts: [0,0,0,0,0], player_token: playerToken }).select().single();
        if (error) throw error;
        setPlayers(old => [...old, player]);
      }
      setScreen('table');
      history.pushState({}, '', `/?room=${found.code}`);
    } catch (err) { setMessage(err.message); }
    setBusy(false);
  }

  async function savePlayer(player, patch) {
    const { error } = await db.from('poker_players').update(patch).eq('id', player.id);
    if (error) setMessage(error.message);
  }

  async function adjustChip(player, index, delta) {
    const counts = [...(player.counts || [0,0,0,0,0])];
    counts[index] = Math.max(0, (counts[index] || 0) + delta);
    await savePlayer(player, { counts });
  }

  async function updatePot(nextValue) {
    const { error } = await db.from('poker_rooms').update({ pot: Math.max(0, nextValue) }).eq('id', room.id);
    if (error) setMessage(error.message);
  }

  async function resetTable() {
    if (!isHost) return;
    if (!confirm('Reset every player stack and clear the center pot?')) return;
    const results = await Promise.all(players.map(p =>
      db.from('poker_players').update({ counts: [0,0,0,0,0] }).eq('id', p.id)
    ));
    const failed = results.find(r => r.error);
    if (failed) { setMessage(failed.error.message); return; }
    await updatePot(0);
    setMessage('Table reset.');
  }

  async function awardPot(playerId) {
    if (!isHost || !(room?.pot > 0)) return;
    const winner = players.find(p => p.id === playerId);
    if (!winner) return;
    if (!confirm(`Award ${money(room.pot)} to ${winner.nickname}?`)) return;
    let remainder = room.pot;
    const add = [0,0,0,0,0];
    [500,100,25,5,1].forEach(d => {
      const index = DENOMS.indexOf(d);
      add[index] = Math.floor(remainder / d);
      remainder -= add[index] * d;
    });
    const counts = winner.counts.map((n, i) => n + add[i]);
    const { error: playerError } = await db.from('poker_players').update({ counts }).eq('id', winner.id);
    if (playerError) { setMessage(playerError.message); return; }
    const { error: potError } = await db.from('poker_rooms').update({ pot: 0 }).eq('id', room.id);
    if (potError) setMessage(potError.message);
    else setMessage(`${money(room.pot)} awarded to ${winner.nickname}.`);
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(`${location.origin}/?room=${room.code}`);
    setMessage('Invite link copied.');
  }

  function openAdmin() {
    if (!isHost) return;
    history.pushState({}, '', `/admin?room=${room.code}`);
    setScreen('admin'); setMessage('');
  }
  function backToTable() {
    history.pushState({}, '', `/?room=${room.code}`);
    setScreen('table'); setMessage('');
  }

  if (!db) return <main className="shell"><Header/><section className="panel setup"><h1>Connect your <em>live table.</em></h1><p>Add the Supabase URL and key as Netlify environment variables.</p><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_ANON_KEY</code></section></main>;

  if (screen === 'home') return <main className="shell">
    <Header/><section className="intro"><div className="eyebrow">YOUR TABLE, IN REAL TIME</div><h1>Bring everyone<br/><em>to the table.</em></h1><p>Create a poker room, share its code, and let everyone keep their stacks in sync from their phones.</p></section>
    <div className="forms">
      <form className="panel" onSubmit={createRoom}><div className="eyebrow">START A GAME</div><h2>Create a table</h2><label>Your name</label><input required maxLength="24" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Alex"/><button className="primary" disabled={busy}>Create room →</button></form>
      <form className="panel" onSubmit={joinRoom}><div className="eyebrow">JOIN FRIENDS</div><h2>Join a table</h2><label>Your name</label><input required maxLength="24" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Alex"/><label>Room code</label><input required maxLength="5" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="5-character code"/><button className="secondary" disabled={busy}>Join room →</button></form>
    </div>{message && <p className="notice">{message}</p>}<p className="foot">No account required. Share the invite link or room code.</p>
  </main>;

  if (screen === 'admin') {
    if (!isHost) return <main className="shell"><Header/><section className="panel"><h1>Admin access <em>denied</em></h1><p>This admin page is available only in the browser session that created this room.</p><button className="secondary" onClick={backToTable}>Back to table</button></section></main>;
    return <main className="shell">
      <Header/><div className="tablehead"><div><div className="eyebrow">HOST CONTROL PANEL</div><h1>Admin <em>{room.code}</em></h1><p className="muted">Manage player stacks and settle the pot.</p></div><button className="secondary" onClick={backToTable}>← Back to table</button></div>
      <section className="admin-pot"><div className="pot-icon">♠</div><div className="eyebrow">CENTER POT</div><strong>{money(room.pot || 0)}</strong><p>Current amount available to award</p></section>
      <section className="panel admin-section"><div className="section-heading"><div><div className="eyebrow">SETTLE THE HAND</div><h2>Award pot to a player</h2></div></div><div className="award-row"><select id="winner-select" defaultValue=""><option value="" disabled>Select winner</option>{players.map(p=><option value={p.id} key={p.id}>{p.nickname}</option>)}</select><button className="primary" disabled={!room.pot} onClick={()=>{const id=document.getElementById('winner-select').value;if(id)awardPot(id)}}>Award entire pot →</button></div><p className="muted smalltext">The pot is converted into chip denominations and added to the winner's stack.</p></section>
      <div className="section-title"><h2>Manage player chips</h2><span className="muted">Use + / − to adjust stacks</span></div>
      <div className="admin-players">{players.map(p=><article className="player" key={p.id}><div className="ptop"><div><h3>{p.nickname}</h3><span className="muted tiny">{money(stackValue(p.counts))} total</span></div></div><div className="admin-chip-grid">{DENOMS.map((d,i)=><div className="admin-chip-row" key={d}><span className={`chip-dot ${COLORS[i]}`}>{d}</span><span>× {p.counts[i]}</span><div><button className="mini-control" disabled={!p.counts[i]} onClick={()=>adjustChip(p,i,-1)}>−</button><button className="mini-control" onClick={()=>adjustChip(p,i,1)}>+</button></div></div>)}</div></article>)}</div>
      <section className="panel reset-panel"><div><div className="eyebrow">DANGER ZONE</div><h2>Reset the table</h2><p className="muted">Clears every player's stack and the center pot.</p></div><button className="danger" onClick={resetTable}>Reset entire table</button></section>
      {message && <p className="notice">{message}</p>}
    </main>;
  }

  return <main className="shell">
    <Header/><div className="tablehead"><div><div className="eyebrow">LIVE POKER ROOM</div><h1>Table <em>{room.code}</em></h1><p className="muted">Share the invite so friends can join.</p></div><div className="actions"><button className="secondary" onClick={copyInvite}>Copy invite link</button>{isHost && <button className="secondary" onClick={openAdmin}>Admin panel</button>}<button className="ghost" onClick={()=>{setScreen('home');setRoom(null);setPlayers([]);history.pushState({}, '', '/') }}>Leave</button></div></div>
    <div className="stats"><div><span>CHIPS IN PLAY</span><strong>{money(tableTotal)}</strong></div><div className="player-count-stat"><span>PLAYERS</span><strong>{players.length}</strong></div></div>
    <section className="center-pot"><div className="pot-ring">♠</div><div className="eyebrow">CENTER POT</div><strong>{money(room.pot || 0)}</strong><p>Shared pot · updated live</p></section>
    <div className="sectiontitle"><h2>Player stacks</h2><span className="muted">Tap a chip to add it</span></div>
    <div className="players">{players.map(p=><article className={'player '+(p.player_token===playerToken?'mine':'')} key={p.id}>
      <div className="ptop"><div><h3>{p.nickname} {p.player_token===playerToken&&<small>YOU</small>}</h3><span className="muted tiny">{p.player_token===playerToken?'Your stack total is hidden':'Stack total visible to you'}</span></div><b className="amount">{p.player_token===playerToken?'••••••':money(stackValue(p.counts))}</b></div>
      <div className="chips">{DENOMS.map((d,i)=><div className="chipunit" key={d}><button className={'chip '+COLORS[i]} onClick={()=>adjustChip(p,i,1)}>{d}</button><span>× {p.counts[i]}</span><button className="minus" disabled={!p.counts[i]} onClick={()=>adjustChip(p,i,-1)}>−</button></div>)}</div>
    </article>)}</div>
    <div className="bottom"><span className="muted">Changes sync live across the room.</span>{isHost&&<button className="secondary" onClick={openAdmin}>Open admin panel</button>}</div>
    {message && <p className="notice">{message}</p>}
  </main>;
}
