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
  History,
  LayoutDashboard,
  Search
} from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE_URL = 'http://localhost:8000/api/v1';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  created_at: string;
}

interface Session {
  id: string;
  title: string | null;
  created_at: string;
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (currentSessionId) {
      fetchSessionMessages(currentSessionId);
    }
  }, [currentSessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchSessions = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/chat/sessions`);
      setSessions(response.data);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  };

  const fetchSessionMessages = async (sessionId: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/chat/sessions/${sessionId}`);
      setMessages(response.data.messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const createNewSession = async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/chat/sessions`, {
        title: `New Chat ${sessions.length + 1}`
      });
      setSessions([response.data, ...sessions]);
      setCurrentSessionId(response.data.id);
      setMessages([]);
    } catch (error) {
      console.error('Error creating session:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !currentSessionId) return;

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

      const response = await axios.post(`${API_BASE_URL}/chat/sessions/${currentSessionId}/messages`, {
        role: 'user',
        content: userMessage
      });

      // Update messages with actual data from server (includes AI response)
      setMessages(prev => {
        // Remove optimistic and add real
        const filtered = prev.filter(m => m.id !== optimisticMsg.id);
        return [...filtered, { role: 'user', content: userMessage, id: 'real-user', created_at: '' }, response.data];
      });
      
      // Better: refetch session messages to be safe
      fetchSessionMessages(currentSessionId);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar */}
      <motion.div 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 0 }}
        className="bg-card border-r border-border flex flex-col h-full overflow-hidden"
      >
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg fintech-gradient flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">Code-CLI</span>
          </div>
        </div>

        <div className="px-4 mb-4">
          <button 
            onClick={createNewSession}
            className="w-full flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground py-2.5 rounded-lg border border-border transition-all duration-200 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            History
          </div>
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => setCurrentSessionId(session.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group ${
                currentSessionId === session.id 
                  ? 'bg-primary/10 text-primary border-primary/20 border' 
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <MessageSquare className={`w-4 h-4 ${currentSessionId === session.id ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
              <span className="truncate text-left">{session.title || 'Untitled Chat'}</span>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-border mt-auto">
          <div className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
            <Settings className="w-4 h-4" />
            <span className="text-sm">Settings</span>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative h-full">
        {/* Toggle Sidebar Button */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -left-3 top-1/2 transform -translate-y-1/2 w-6 h-6 bg-card border border-border rounded-full flex items-center justify-center z-10 hover:bg-muted transition-colors"
        >
          {isSidebarOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>

        {/* Header */}
        <header className="h-16 border-b border-border flex items-center justify-between px-6 glass">
          <div className="flex items-center gap-4">
            <h2 className="font-semibold text-lg">
              {sessions.find(s => s.id === currentSessionId)?.title || 'Select a conversation'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-secondary p-2 rounded-full cursor-pointer hover:bg-muted transition-colors">
              <Search className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
              <User className="w-4 h-4 text-primary" />
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {currentSessionId ? (
            <>
              {messages.length === 0 && !isLoading && (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                    <Bot className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">How can I help you today?</h3>
                  <p className="text-muted-foreground">
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
                  <div className={`flex gap-4 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
                      message.role === 'user' ? 'bg-primary' : 'bg-card border border-border'
                    }`}>
                      {message.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-primary" />}
                    </div>
                    <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
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
            <div className="h-full flex flex-col items-center justify-center">
               <div className="w-20 h-20 rounded-3xl fintech-gradient flex items-center justify-center mb-8 shadow-2xl shadow-primary/20">
                <LayoutDashboard className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight mb-4">Welcome to Code-CLI</h1>
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
          <div className="p-6 border-t border-border glass">
            <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message Code-CLI..."
                className="w-full bg-secondary/50 border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none py-4 px-6 pr-16 rounded-2xl transition-all placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-primary text-white rounded-xl flex items-center justify-center hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground transition-all shadow-lg shadow-primary/10"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
            <p className="text-[10px] text-muted-foreground text-center mt-3 uppercase tracking-widest font-semibold opacity-50">
              Powered by n8n & Gemini
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
