import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  MessageSquare, 
  Send, 
  User, 
  Bot, 
  ChevronLeft, 
  ChevronRight,
  Settings,
  LayoutDashboard,
  Search,
  X,
  Trash2
} from 'lucide-react';
import axios from 'axios';
import { motion } from 'framer-motion';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/$/, '');

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  created_at: string;
}

interface Session {
  id: string;
  title: string | null;
  path: string;
  created_at: string;
}

interface CLI {
  id: string;
  name: string;
  description: string | null;
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clis, setClis] = useState<CLI[]>([]);
  const [selectedCliId, setSelectedCliId] = useState<string>('');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [path, setPath] = useState('/home/niceiyke');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAddCliModalOpen, setIsAddCliModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newCliName, setNewCliName] = useState('');
  const [newCliDesc, setNewCliDesc] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark') || 
             window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Adjust sidebar for mobile on initial load
  useEffect(() => {
    const checkMobile = () => {
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const filteredSessions = sessions.filter(session => 
    session.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fetchSessions = React.useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/chat/sessions`);
      setSessions(response.data);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  }, []);

  const fetchClis = React.useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/cli/`);
      setClis(response.data);
      if (response.data.length > 0 && !selectedCliId) {
        setSelectedCliId(response.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching CLIs:', error);
    }
  }, [selectedCliId]);

  const fetchSessionMessages = React.useCallback(async (sessionId: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/chat/sessions/${sessionId}`);
      setMessages(response.data.messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchClis();
  }, [fetchSessions, fetchClis]);

  useEffect(() => {
    if (currentSessionId) {
      fetchSessionMessages(currentSessionId);
    }
  }, [currentSessionId, fetchSessionMessages]);

  // Polling for "Thinking..." messages
  useEffect(() => {
    let interval: any;

    const hasThinkingMessage = messages.some(m => m.content === 'Thinking...' && m.role === 'ai');

    if (hasThinkingMessage && currentSessionId) {
      interval = setInterval(() => {
        fetchSessionMessages(currentSessionId);
      }, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [messages, currentSessionId, fetchSessionMessages]);

  const createCli = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCliName.trim()) return;

    try {
      const response = await axios.post(`${API_BASE_URL}/cli/`, {
        name: newCliName,
        description: newCliDesc
      });
      setClis(prev => [response.data, ...prev]);
      setSelectedCliId(response.data.id);
      setIsAddCliModalOpen(false);
      setNewCliName('');
      setNewCliDesc('');
    } catch (error) {
      console.error('Error creating CLI:', error);
    }
  };

  const createNewSession = async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/chat/sessions`, {
        title: `New Chat ${sessions.length + 1}`,
        cli_id: selectedCliId || null,
        path: path
      });
      setSessions([response.data, ...sessions]);
      setCurrentSessionId(response.data.id);
      setMessages([]);
    } catch (error) {
      console.error('Error creating session:', error);
    }
  };

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API_BASE_URL}/chat/sessions/${sessionId}`);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !currentSessionId || isLoading) return;

    const userMessage = input;
    setInput('');
    setIsLoading(true);

    try {
      // Optimistically add user message
      const optimisticMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: userMessage,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, optimisticMsg]);

      await axios.post(`${API_BASE_URL}/chat/sessions/${currentSessionId}/messages`, {
        role: 'user',
        content: userMessage
      });

      // Refetch session messages to get the thinking message or actual response
      fetchSessionMessages(currentSessionId);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && window.innerWidth < 768 && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <motion.div 
        initial={false}
        animate={{ 
          width: isSidebarOpen ? (window.innerWidth < 768 ? 280 : 280) : 0,
          x: isSidebarOpen ? 0 : (window.innerWidth < 768 ? -280 : 0)
        }}
        className={`fixed md:relative z-50 bg-card border-r border-border flex flex-col h-full overflow-hidden transition-all duration-300 shadow-xl md:shadow-none`}
      >
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg fintech-gradient flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">Code-CLI</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden p-2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 mb-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Select CLI
            </label>
            <div className="flex gap-2">
              <select 
                value={selectedCliId}
                onChange={(e) => setSelectedCliId(e.target.value)}
                className="flex-1 bg-secondary/50 border border-border text-foreground text-sm rounded-lg focus:ring-primary focus:border-primary block p-2 transition-all outline-none"
              >
                <option value="">Default CLI</option>
                {clis.map((cli) => (
                  <option key={cli.id} value={cli.id}>{cli.name}</option>
                ))}
              </select>
              <button 
                onClick={() => setIsAddCliModalOpen(true)}
                className="p-2 bg-secondary hover:bg-muted border border-border rounded-lg transition-colors"
                title="Add New CLI"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Working Directory
            </label>
            <input 
              type="text" 
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/home/niceiyke"
              className="w-full bg-secondary/50 border border-border text-foreground text-sm rounded-lg focus:ring-primary focus:border-primary block p-2 transition-all outline-none"
            />
          </div>

          <button 
            onClick={createNewSession}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white py-2.5 rounded-lg transition-all duration-200 text-sm font-medium shadow-lg shadow-primary/10"
          >
            <Plus className="w-4 h-4" />
            New Conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            History
          </div>
          {filteredSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => {
                setCurrentSessionId(session.id);
                setPath(session.path);
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group relative ${
                currentSessionId === session.id 
                  ? 'bg-primary/10 text-primary border-primary/20 border' 
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <MessageSquare className={`w-4 h-4 flex-shrink-0 ${currentSessionId === session.id ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
              <span className="truncate text-left pr-6">{session.title || 'Untitled Chat'}</span>
              <button
                onClick={(e) => deleteSession(e, session.id)}
                className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-all"
                title="Delete Chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-border mt-auto">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2 text-muted-foreground hover:text-foreground cursor-pointer transition-colors hover:bg-muted rounded-lg"
          >
            <Settings className="w-4 h-4" />
            <span className="text-sm">Settings</span>
          </button>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative h-full w-full">
        {/* Toggle Sidebar Button */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`absolute ${isSidebarOpen ? 'left-0' : 'left-0 md:left-2'} top-4 md:top-1/2 md:transform md:-translate-y-1/2 w-8 h-8 md:w-6 md:h-6 bg-card border border-border rounded-r-lg md:rounded-full flex items-center justify-center z-30 hover:bg-muted transition-all shadow-md`}
        >
          {isSidebarOpen ? <ChevronLeft className="w-4 h-4 md:w-3 md:h-3" /> : <ChevronRight className="w-4 h-4 md:w-3 md:h-3" />}
        </button>

        {/* Header */}
        <header className="h-16 border-b border-border flex items-center justify-between px-4 md:px-6 glass">
          <div className="flex items-center gap-4 ml-8 md:ml-0">
            <h2 className="font-semibold text-base md:text-lg truncate max-w-[150px] md:max-w-none">
              {sessions.find(s => s.id === currentSessionId)?.title || 'Select a conversation'}
            </h2>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={() => setIsSearchOpen(true)}
              className="bg-secondary p-2 rounded-full cursor-pointer hover:bg-muted transition-colors"
            >
              <Search className="w-4 h-4 text-muted-foreground" />
            </button>
            <button 
              onClick={() => setIsProfileOpen(true)}
              className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 cursor-pointer hover:bg-primary/30 transition-colors"
            >
              <User className="w-4 h-4 text-primary" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {currentSessionId ? (
            <>
              {messages.length === 0 && !isLoading && (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                    <Bot className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">How can I help you today?</h3>
                  <p className="text-muted-foreground px-4">
                    Ask me anything about code, logic, or just have a chat. Your fintech-ready assistant is here.
                  </p>
                </div>
              )}
              {messages.map((message) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex gap-3 md:gap-4 max-w-[90%] md:max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
                      message.role === 'user' ? 'bg-primary' : 'bg-card border border-border'
                    }`}>
                      {message.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-primary" />}
                    </div>
                    <div className={`p-3 md:p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      message.role === 'user' 
                        ? 'bg-primary text-white shadow-lg' 
                        : 'bg-card border border-border shadow-sm'
                    }`}>
                      {message.content}
                    </div>
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex gap-4 max-w-[80%]">
                    <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center">
                      <Bot className="w-5 h-5 text-primary" />
                    </div>
                    <div className="bg-card border border-border p-4 rounded-2xl">
                      <div className="flex gap-1.5">
                        <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-4">
               <div className="w-16 h-16 md:w-20 md:h-20 rounded-3xl fintech-gradient flex items-center justify-center mb-8 shadow-2xl shadow-primary/20">
                <LayoutDashboard className="w-8 h-8 md:w-10 md:h-10 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-4 text-center">Welcome to Code-CLI</h1>
              <p className="text-muted-foreground text-center max-w-sm mb-8">
                Select a conversation from the history or start a new one to begin your AI-powered journey.
              </p>
              <button 
                onClick={createNewSession}
                className="px-8 py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all shadow-lg shadow-primary/20"
              >
                Get Started
              </button>
            </div>
          )}
        </div>

        {/* Input Area */}
        {currentSessionId && (
          <div className="p-4 md:p-6 border-t border-border glass">
            <div className="max-w-4xl mx-auto relative flex items-end gap-2">
              <div className="relative flex-1">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message Code-CLI..."
                  className="w-full bg-secondary/50 border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none py-3 px-4 md:py-4 md:px-6 rounded-2xl transition-all placeholder:text-muted-foreground resize-none min-h-[48px] max-h-[200px]"
                />
              </div>
              <button
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || isLoading}
                className="mb-1 w-10 h-10 md:w-12 md:h-12 bg-primary text-white rounded-xl flex items-center justify-center hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground transition-all shadow-lg shadow-primary/10 flex-shrink-0"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-3 uppercase tracking-widest font-semibold opacity-50">
              Powered by n8n & Gemini
            </p>
          </div>
        )}
      </div>

      {/* Add CLI Modal */}
      {isAddCliModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="text-xl font-bold">Add New CLI</h3>
              <button 
                onClick={() => setIsAddCliModalOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={createCli} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">CLI Name</label>
                <input 
                  autoFocus
                  required
                  type="text" 
                  value={newCliName}
                  onChange={(e) => setNewCliName(e.target.value)}
                  placeholder="e.g. Gemini CLI, Claude Code"
                  className="w-full bg-secondary/50 border border-border rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description (Optional)</label>
                <textarea 
                  value={newCliDesc}
                  onChange={(e) => setNewCliDesc(e.target.value)}
                  placeholder="What does this CLI do?"
                  rows={3}
                  className="w-full bg-secondary/50 border border-border rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAddCliModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-secondary hover:bg-muted text-foreground font-medium rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl transition-all shadow-lg shadow-primary/20"
                >
                  Create CLI
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="text-xl font-bold">Settings</h3>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Dark Mode</span>
                <button 
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className={`w-10 h-6 rounded-full relative transition-colors duration-200 ${isDarkMode ? 'bg-primary' : 'bg-secondary'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200 ${isDarkMode ? 'right-1' : 'left-1'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Notifications</span>
                <div className="w-10 h-6 bg-secondary rounded-full relative cursor-pointer">
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                </div>
              </div>
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground">Version 1.0.0</p>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="text-xl font-bold">Search Conversations</h3>
              <button 
                onClick={() => setIsSearchOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 border-b border-border">
              <input 
                autoFocus
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full bg-secondary/50 border border-border rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredSessions.length > 0 ? (
                filteredSessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => {
                      setCurrentSessionId(session.id);
                      setIsSearchOpen(false);
                    }}
                    className="w-full text-left p-3 hover:bg-secondary rounded-lg transition-colors flex items-center gap-3"
                  >
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <span className="truncate">{session.title || 'Untitled Chat'}</span>
                  </button>
                ))
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  No conversations found
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Profile Modal */}
      {isProfileOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="text-xl font-bold">User Profile</h3>
              <button 
                onClick={() => setIsProfileOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-6 text-center">
              <div className="w-20 h-20 bg-primary/20 rounded-full mx-auto flex items-center justify-center border-2 border-primary/30">
                <User className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h4 className="text-lg font-bold">Code-CLI User</h4>
                <p className="text-muted-foreground">user@example.com</p>
              </div>
              <button 
                className="w-full py-2.5 bg-secondary hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 border border-transparent rounded-xl transition-all font-medium"
                onClick={() => setIsProfileOpen(false)}
              >
                Log Out
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default App;
