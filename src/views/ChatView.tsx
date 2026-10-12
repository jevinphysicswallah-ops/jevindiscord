import { FormEvent, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import type { Channel, Message, NexusServer, User } from '../types';

interface ChatViewProps {
  user: User;
  server: NexusServer | null;
  channel: Channel | null;
  liveMessage: Message | null;
  send: (event: string, payload: unknown) => boolean;
  onVoice: () => void;
}

export function ChatView({ user, server, channel, liveMessage, send, onVoice }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!channel || channel.type !== 'text') return setMessages([]);
    void api<{ messages: Message[] }>(`/api/channels/${encodeURIComponent(channel.id)}/messages`).then((result) => setMessages(result.messages));
  }, [channel]);
  useEffect(() => {
    if (!liveMessage || liveMessage.channelId !== channel?.id) return;
    const nextMessage = liveMessage;
    setMessages((current) => current.some((message) => message.id === nextMessage.id) ? current : [...current, nextMessage]);
  }, [channel?.id, liveMessage]);
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || !channel) return;
    if (send('send_message', { text: clean, channelId: channel.id, serverId: server?.id })) setText('');
  }

  if (!server || !channel) return <div className="view"><div className="panel warm-empty"><span>✦</span><h3>No channel selected</h3><p>Create or join a space to start chatting.</p></div></div>;
  if (channel.type !== 'text') return <div className="view"><div className="panel channel-callout"><div><Icon name="voice" size={30}/></div><span className="eyebrow">VOICE CHANNEL</span><h2>{channel.name}</h2><p>Join the shared lounge to talk, use video, or share your screen.</p><button className="primary-button" onClick={onVoice}><Icon name="voice"/> Open voice lounge</button></div></div>;

  return (
    <div className="view chat-view">
      <section className="chat-panel panel">
        <header className="chat-head"><div className="channel-glyph"><Icon name="hash"/></div><div><h2>{channel.name}</h2><p>{server.name} · A place for the conversation that doesn’t fit anywhere else.</p></div><button className="icon-button"><Icon name="users"/></button></header>
        <div className="message-list">
          <div className="channel-origin"><div><Icon name="hash" size={29}/></div><h3>Welcome to #{channel.name}</h3><p>This is the beginning of the channel. Make it a good one.</p></div>
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const grouped = previous?.authorId === message.authorId && new Date(message.timestamp).getTime() - new Date(previous.timestamp).getTime() < 300_000;
            return <article className={`message ${grouped ? 'grouped' : ''}`} key={message.id}>{!grouped && <img src={message.authorAvatar || `https://api.dicebear.com/7.x/shapes/svg?seed=${message.authorId}`} alt=""/>}<div>{!grouped && <header><strong>{message.authorName}</strong>{message.authorId === user.id && <span>YOU</span>}<time>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></header>}<p>{message.text}</p></div></article>;
          })}
          <div ref={bottomRef}/>
        </div>
        <form className="message-composer" onSubmit={submit}><button type="button" aria-label="Add attachment"><Icon name="plus"/></button><input value={text} onChange={(event) => setText(event.target.value)} placeholder={`Message #${channel.name}`} maxLength={2000}/><button className="composer-send" type="submit" disabled={!text.trim()} aria-label="Send message"><Icon name="send"/></button></form>
      </section>
    </div>
  );
}
