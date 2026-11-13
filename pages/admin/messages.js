import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Button from '../../components/Button';
import Badge from '../../components/ui/badge';
import { api } from '../../lib/api.js';
import { Send, Mail, ArrowLeft, User, ShieldCheck, Clock, Search, Plus } from 'lucide-react';

export default function AdminMessages() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [tab, setTab] = useState('users'); // 'users' | 'conversations'
  const [users, setUsers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [searchUser, setSearchUser] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/api/auth/me');
        if (cancelled) return;
        if (res.data && res.data.user) {
          setIsAdmin(res.data.user.role === 'ADMIN');
          if (res.data.user.role !== 'ADMIN') {
            window.location.href = '/messages';
          } else {
            setCheckingAuth(false);
          }
        } else {
          window.location.href = '/login?next=/admin/messages';
        }
      } catch (e) {
        if (cancelled) return;
        if (e.status === 401 || e.status === 403) {
          window.location.href = '/login?next=/admin/messages';
        } else {
          setCheckingAuth(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/admin/messages/users');
      setUsers(res.data.data || []);
    } catch (e) {
      setError(e.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/admin/messages/conversations');
      setConversations(res.data.data || []);
    } catch (e) {
      setError(e.message || 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId) => {
    setLoading(true);
    try {
      const res = await api.get(`/api/admin/messages/conversations/${conversationId}/messages`);
      const data = res.data || {};
      setMessages(data.messages || []);
      // Only set active conversation if it exists in our list, otherwise clear it
      const conversationExists = conversations.some(
        (c) => c.id === conversationId
      );
      setActiveConversation(conversationExists ? data.conversation : null);
      if (!conversationExists) {
        setError('Conversation not found - please reload the conversations list');
      }
    } catch (e) {
      setError(e.message || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!checkingAuth && isAdmin) {
      loadUsers();
      loadConversations();
    }
  }, [checkingAuth, isAdmin, loadUsers, loadConversations]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    if (!isAdmin) {
      setError('You must be an admin to send messages');
      setSending(false);
      return;
    }
    if (!activeConversation?.id) {
      setError('No conversation selected');
      setSending(false);
      return;
    }
    // Verify conversation exists by checking it's in our conversations list
    const conversationExists = conversations.some(
      (c) => c.id === activeConversation.id
    );
    if (!conversationExists) {
      setError('Selected conversation no longer exists');
      setSending(false);
      return;
    }
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.post(`/api/admin/messages/conversations/${activeConversation.id}/messages`, {
        body: newMessage,
      });
      setNewMessage('');
      setSuccess('Message sent');
      setMessages((prev) => [...prev, res.data.message]);
    } catch (e) {
      setError(e.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleStartConversation = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      setError('You must be an admin to start conversations');
      setSending(false);
      return;
    }
    if (!activeConversation?.id) {
      setError('No conversation selected');
      setSending(false);
      return;
    }
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.post('/api/admin/messages/conversations', {
        participantId: activeConversation?.id,
        body: newMessage,
      });
      setNewMessage('');
      setSuccess('Conversation started');
      setActiveConversation(null);
      setTab('conversations');
      loadConversations();
    } catch (e) {
      setError(e.message || 'Failed to start conversation');
    } finally {
      setSending(false);
    }
  };

  const openConversation = (conv) => {
    setActiveConversation(conv);
    setTab('conversation');
    setError(null);
    setSuccess(null);
  };

  const goBack = () => {
    setTab('conversations');
    setActiveConversation(null);
    setMessages([]);
  };

  const filteredUsers = users.filter((u) =>
    u.email.toLowerCase().includes(searchUser.toLowerCase()) ||
    (u.name && u.name.toLowerCase().includes(searchUser.toLowerCase()))
  );

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-canvas dark:bg-navy-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-300">Loading admin panel…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white dark:bg-navy-800/50 rounded-xl shadow-sm border border-slate-200 dark:border-navy-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-navy-700">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Admin Messages</h1>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Message buyers and sellers across the platform
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTab('users')}
                >
                  <User className="w-3.5 h-3.5 mr-1" /> Users
                </Button>
                <Button
                  variant={tab === 'conversations' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setTab('conversations')}
                >
                  <Mail className="w-3.5 h-3.5 mr-1" /> Conversations
                </Button>
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

          {tab === 'users' ? (
            <div className="px-6 py-4">
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  placeholder="Search users by email or name…"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500/50 outline-none"
                />
                <Button variant="outline" size="sm" onClick={() => setSearchUser('')}>
                  <Search className="w-3.5 h-3.5" />
                </Button>
              </div>

              {loading ? (
                <div className="h-64 flex items-center justify-center">
                  <span className="text-slate-600 dark:text-slate-300">Loading users…</span>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-navy-800/30 flex items-center justify-center mx-auto mb-4">
                    <User className="w-8 h-8 text-slate-600 dark:text-slate-300" />
                  </div>
                  <h3 className="text-sm font-medium text-slate-900 dark:text-white">No users found</h3>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-navy-700">
                  {filteredUsers.map((u) => (
                    <div
                      key={u.id}
                      onClick={() => {
                        setActiveConversation(u);
                        setTab('conversation');
                        setNewMessage('');
                        setError(null);
                        setSuccess(null);
                      }}
                      className="px-6 py-4 hover:bg-slate-50 dark:hover:bg-navy-800/30 cursor-pointer transition-colors border-b border-slate-200/50 dark:border-navy-700/30 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/20 flex items-center justify-center">
                            {u.role === 'ADMIN' ? (
                              <ShieldCheck className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                            ) : (
                              <User className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              {u.name || u.email}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {u.email} · {u.role}
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : tab === 'conversations' ? (
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
                    Start a conversation with any user from the Users tab.
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
                          <div className="flex items-center gap-2">
                            {conv.participants.map((p) => (
                              <div key={p.id} className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/20 flex items-center justify-center">
                                {p.role === 'ADMIN' ? (
                                  <ShieldCheck className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                                ) : (
                                  <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                                )}
                              </div>
                            ))}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              {conv.participants.map((p) => p.name || p.email).join(' & ')}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {conv.participants.map((p) => p.role).join(' • ')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {conv.lastMessage && (
                            <div className="text-xs text-slate-500 dark:text-slate-300 leading-tight">
                              {conv.lastMessage.body}
                            </div>
                          )}
                          {conv.unreadCount > 0 && (
                            <Badge variant="default" className="ml-2">
                              {conv.unreadCount} unread
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-navy-800/50 rounded-xl shadow-sm border border-slate-200 dark:border-navy-700 overflow-hidden flex flex-col h-[calc(100vh-160px)]">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-navy-700 flex items-center justify-between">
                <button
                  onClick={goBack}
                  className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to conversations
                </button>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {activeConversation?.participants?.map((p) => (
                      <div key={p.id} className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/20 flex items-center justify-center">
                        {p.role === 'ADMIN' ? (
                          <ShieldCheck className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                        ) : (
                          <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                        )}
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {activeConversation?.participants?.map((p) => p.name || p.email).join(' & ')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
                {messages.map((msg) => {
                  const isAdmin = msg.sender.role === 'ADMIN';
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isAdmin ? 'justify-end' : 'justify-start'} mb-2`}
                    >
                      <div
                        className={`
                          max-w-[80%] rounded-xl px-4 py-2.5 text-sm break-words shadow-sm
                          ${
                            isAdmin
                              ? 'bg-brand-600 text-white rounded-tl-md rounded-tr-md rounded-bl-md'
                              : 'bg-slate-200 dark:bg-navy-700 text-slate-900 dark:text-white rounded-tr-md rounded-tl-md rounded-br-md'
                          }
                        `}
                      >
                        <p>{msg.body}</p>
                        <p className={`text-[10px] mt-1 opacity-70 ${isAdmin ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                          {new Date(msg.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
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
      </div>

      <Footer />
    </div>
  );
}
