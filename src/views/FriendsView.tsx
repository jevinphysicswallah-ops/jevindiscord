import { FormEvent, useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { ApiError, api, jsonBody } from '../lib/api';
import type { User } from '../types';

interface FriendsPayload {
  friends: User[];
  pendingReceived: Array<{ id: string; user: User }>;
  pendingSent: Array<{ id: string; user: User }>;
}

export function FriendsView({ onVoice }: { onVoice: () => void }) {
  const [data, setData] = useState<FriendsPayload>({ friends: [], pendingReceived: [], pendingSent: [] });
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [message, setMessage] = useState('');

  async function load() {
    const next = await api<FriendsPayload>('/api/friends');
    setData(next);
  }
  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim().length < 2) return setResults([]);
      void api<{ users: User[] }>(`/api/users/search?q=${encodeURIComponent(search)}`).then((response) => setResults(response.users));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function request(username: string) {
    try {
      const result = await api<{ message: string }>('/api/friends/request', { method: 'POST', ...jsonBody({ targetUsername: username }) });
      setMessage(result.message); setSearch(''); setResults([]); await load();
    } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Could not send request.'); }
  }

  async function respond(event: FormEvent, requestId: string, action: 'accept' | 'reject') {
    event.preventDefault();
    await api('/api/friends/respond', { method: 'POST', ...jsonBody({ requestId, action }) });
    await load();
  }

  return (
    <div className="view friends-view">
      <section className="friend-search-card panel">
        <div><span className="eyebrow">GROW THE PARTY</span><h2>Find your people</h2><p>Search by username. Friend requests stay private between the two of you.</p></div>
        <div className="friend-search"><Icon name="search"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a username" aria-label="Search a username"/></div>
        {results.length > 0 && <div className="search-results">{results.map((person) => <div key={person.id}><img src={person.avatar} alt=""/><span><strong>{person.displayName}</strong><small>@{person.username}</small></span><button className="small-button" onClick={() => void request(person.username)}><Icon name="plus" size={15}/> Add</button></div>)}</div>}
        {message && <div className="inline-message">{message}</div>}
      </section>
      {data.pendingReceived.length > 0 && <section className="panel request-panel"><div className="panel-heading"><div><span className="eyebrow">NEEDS YOUR ATTENTION</span><h2>Friend requests</h2></div><span className="count-chip">{data.pendingReceived.length}</span></div>{data.pendingReceived.map((request) => <div className="request-row" key={request.id}><img src={request.user.avatar} alt=""/><div><strong>{request.user.displayName}</strong><small>@{request.user.username} wants to connect</small></div><form onSubmit={(event) => void respond(event, request.id, 'accept')}><button className="small-button">Accept</button></form><form onSubmit={(event) => void respond(event, request.id, 'reject')}><button className="icon-button"><Icon name="close" size={17}/></button></form></div>)}</section>}
      <section className="panel friend-list-panel">
        <div className="panel-heading"><div><span className="eyebrow">FRIENDS</span><h2>{data.friends.length ? `${data.friends.length} in your circle` : 'Your circle starts here'}</h2></div></div>
        {data.friends.length ? <div className="friend-grid">{data.friends.map((friend) => <article key={friend.id}><div className="profile-avatar-wrap"><img src={friend.avatar} alt=""/><i className={`presence ${friend.status}`}/></div><div><strong>{friend.displayName}</strong><span>@{friend.username}</span><p>{friend.customStatus || friend.bio || 'Ready for the next good session.'}</p></div><button className="small-button" onClick={onVoice}><Icon name="voice" size={15}/> Hang out</button></article>)}</div> : <div className="warm-empty"><span>✦</span><h3>A quieter kind of beginning</h3><p>Search for someone you know above. No follower counts, no popularity contest.</p></div>}
      </section>
    </div>
  );
}
