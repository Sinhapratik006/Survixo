import React, { useState, useEffect, useRef, useCallback } from 'react';

const CHAT_POLL_MS = 10000;
const INBOX_POLL_MS = 30000;
import Link from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Button from '../components/Button';
import Badge from '../components/ui/badge';
import { api } from '../lib/api.js';
import { Send, Mail, ArrowLeft, User, ShieldCheck, Clock } from 'lucide-react';

export default function Messages() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userRole, setUserRole] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [myId, setMyId] = useState(null);

  const [tab, setTab] = useState('inbox'); // 'inbox' | 'conversation'
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const messagesEndRef = useRef(null);
  // Polling stops until this timestamp after a 429.
  const pollPausedUntil = useRef(0);
  const backOff = (e) => {
    if (e && e.status === 429) pollPausedUntil.current = Date.now() + (e.retryAfter || 60) * 1000;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/api/auth/me');
        if (cancelled) return;
        if (res.data && res.data.user) {
          setUserRole(res.data.user.role);
          setUserEmail(res.data.user.email);
          setMyId(res.data.user.id);
          setCheckingAuth(false);
        } else {
          window.location.href = '/login?next=/messages';
        }
      } catch (e) {
        if (cancelled) return;
        if (e.status === 401 || e.status === 403) {
          window.location.href = '/login?next=/messages';
        } else {
          setCheckingAuth(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadConversations = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/api/messages/conversations');
      setConversations(res.data.data || []);
    } catch (e) {
      backOff(e);
      if (!silent) setError(e.message || 'Failed to load conversations');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get(`/api/messages/conversations/${conversationId}/messages`);
      setMessages(res.data.messages || []);
      const conv = res.data.conversation;
      if (conv) {
        // The messages endpoint returns `participants`, while the header and
        // bubbles rely on `otherUser` from the inbox list, so keep it.
        setActiveConversation((prev) => {
          if (!prev || prev.id !== conv.id) return prev;
          const others = (conv.participants || []).filter((p) => p.id !== myId);
          const otherUser =
            prev.otherUser || others.find((p) => p.role === 'ADMIN') || others[0] || null;
          return { ...prev, ...conv, otherUser };
        });
      }
    } catch (e) {
      backOff(e);
      if (!silent) setError(e.message || 'Failed to load messages');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [myId]);

  useEffect(() => {
    if (!checkingAuth) loadConversations();
  }, [checkingAuth, loadConversations]);

  // Poll so new messages from the other side appear without a reload.
  const activeId = activeConversation?.id;
  useEffect(() => {
    if (checkingAuth) return undefined;
    const timer = setInterval(() => {
      if (document.hidden || Date.now() < pollPausedUntil.current) return;
      if (tab === 'conversation' && activeId) loadMessages(activeId, { silent: true });
      else if (tab === 'inbox') loadConversations({ silent: true });
    }, tab === 'conversation' ? CHAT_POLL_MS : INBOX_POLL_MS);
    return () => clearInterval(timer);
  }, [checkingAuth, tab, activeId, loadMessages, loadConversations]);

  const scrollToBottom = () => {
    const el = messagesEndRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    if (tab === 'conversation') scrollToBottom();
  }, [tab, messages.length]);

  const handleStartConversation = async (e) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.post('/api/messages/conversations', {
        participantId: activeConversation?.otherUser?.id,
        body: newMessage,
      });
      setNewMessage('');
      setSuccess('Message sent');
      const updated = await api.get(`/api/messages/conversations/${res.data.conversationId}/messages`);
      setMessages(updated.data.messages || []);
      setLoading(false);
    } catch (e) {
      setError(e.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.post(`/api/messages/conversations/${activeConversation.id}/messages`, {
        body: newMessage,
      });
      setNewMessage('');
      setSuccess('Message sent');
      setMessages((prev) => [...prev, res.data.message]);
      scrollToBottom();
    } catch (e) {
      setError(e.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const openConversation = (conv) => {
    setActiveConversation(conv);
    setMessages([]);
    setTab('conversation');
    setError(null);
    setSuccess(null);
    loadMessages(conv.id);
  };

  const goBack = () => {
    setTab('inbox');
    setActiveConversation(null);
    setMessages([]);
    loadConversations({ silent: true });
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-canvas dark:bg-navy-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-300">Loading messages…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {tab === 'inbox' ? (
          <div className="bg-white dark:bg-navy-800/50 rounded-xl shadow-sm border border-slate-200 dark:border-navy-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-navy-700">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">Messages</h1>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Your conversations with ApiTradeX support and team
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div className="px-6 py-3 rounded-xl border border-rose-200 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-900/10 p-3 text-sm text-rose-700 dark:text-rose-400 mb-4">
                {error}
              </div>
            )}

            {success && (
              <div className="px-6 py-3 rounded-xl border border-emerald-200 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-900/10 p-3 text-sm text-emerald-700 dark:text-emerald-400 mb-4">
                {success}
              </div>
            )}

            <div className="px-6 py-4">
              {loading ? (
                <div className="h-64 flex items-center justify-center">
                  <span className="text-slate-600 dark:text-slate-300">Loading conversations…</span>
                </div>
              ) : conversations.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-navy-800/30 flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-8 h-8 text-slate-600 dark:text-slate-300" />
                  </div>
                  <h3 className="text-sm font-medium text-slate-900 dark:text-white">No conversations yet</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                    Start a conversation with ApiTradeX support.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-navy-700">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => openConversation(conv)}
                      className="px-6 py-4 hover:bg-slate-50 dark:hover:bg-navy-800/30 cursor-pointer transition-colors border-b border-slate-200/50 dark:border-navy-700/30 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/20 flex items-center justify-center">
                            {conv.otherUser?.role === 'ADMIN' ? (
                              <ShieldCheck className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                            ) : (
                              <User className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              {conv.otherUser?.name || conv.otherUser?.email}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {conv.otherUser?.role === 'ADMIN' ? 'ApiTradeX Support' : conv.otherUser?.email}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {conv.lastMessage && (
                            <div className="text-xs text-slate-500 dark:text-slate-300 leading-tight">
                              {conv.lastMessage.senderId !== conv.otherUser?.id ? 'You: ' : ''}
                              {conv.lastMessage.body}
                            </div>
                          )}
                          {conv.unreadCount > 0 && (
                            <Badge variant="default" className="ml-2">
                              {conv.unreadCount} new
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {new Date(conv.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                        <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500 ml-1" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-navy-800/50 rounded-xl shadow-sm border border-slate-200 dark:border-navy-700 overflow-hidden flex flex-col h-[calc(100vh-160px)]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-navy-700 flex items-center justify-between">
              <button
                onClick={goBack}
                className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back to inbox
              </button>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/20 flex items-center justify-center">
                    {activeConversation.otherUser?.role === 'ADMIN' ? (
                      <ShieldCheck className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    ) : (
                      <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {activeConversation.otherUser?.name || activeConversation.otherUser?.email}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {activeConversation.otherUser?.role === 'ADMIN' ? 'ApiTradeX Support' : activeConversation.otherUser?.email}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4" ref={messagesEndRef}>
              {loading && (
                <div className="text-center py-10">
                  <span className="text-slate-600 dark:text-slate-300">Loading messages…</span>
                </div>
              )}
              {!loading && messages.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-sm text-slate-600 dark:text-slate-300">No messages yet</p>
                </div>
              )}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`
                    flex ${
                      msg.senderId !== myId
                        ? 'justify-start'
                        : 'justify-end'
                    } mb-2
                  `}
                >
                  <div
                    className={`
                      max-w-[80%] rounded-xl px-4 py-2.5 text-sm break-words shadow-sm
                      ${
                        msg.senderId !== myId
                          ? 'bg-slate-200 dark:bg-navy-700 text-slate-900 dark:text-white rounded-tl-md rounded-tr-md rounded-br-md'
                          : 'bg-brand-600 text-white rounded-tl-md rounded-tr-md rounded-bl-md'
                      }
                    `}
                  >
                    <p>{msg.body}</p>
                    <p className={`text-[10px] mt-1 opacity-70 ${
                      msg.senderId !== myId
                        ? 'text-slate-500 dark:text-slate-400'
                        : 'text-white/80'
                    }`}>
                      {new Date(msg.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      {msg.senderId !== myId && msg.readAt && <span className="ml-1">✓</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-900 p-4">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 outline-none transition-all disabled:opacity-60"
                  disabled={sending}
                />
                <Button type="submit" variant="primary" size="sm" disabled={sending || !newMessage.trim()}>
                  {sending ? 'Sending…' : <Send className="w-4 h-4 ml-1" />}
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
