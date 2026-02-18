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
  Trash2,
  Check,
  Copy,
  Loader2,
  Paperclip,
  FileText,
  Image as ImageIcon
} from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/$/, '');

// Types
interface Attachment {
  id: string;
  file_name: string;
  mime_type: string;
  data: string;
  created_at: string;
}

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  created_at: string;
  attachments?: Attachment[];
}

interface Session {
  id: string;
  title: string | null;
  path: string;
  created_at: string;
  cli_id?: string;
}

interface CLI {
  id: string;
  name: string;
  description: string | null;
}

// Components
const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="absolute right-2 top-2 p-1.5 rounded-lg bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all z-10">
      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
    </button>
  );
};

function App() {
  const queryClient = useQueryClient();
  const [selectedCliId, setSelectedCliId] = useState<string>(() => localStorage.getItem('selectedCliId') || '');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => localStorage.getItem('currentSessionId'));
  const [path, setPath] = useState(() => localStorage.getItem('workingPath') || '/home/niceiyke');
  const [input, setInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAddCliModalOpen, setIsAddCliModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [_isProfileOpen, setIsProfileOpen] = useState(false);
  const [_isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, _setSearchQuery] = useState('');
  const [newCliName, setNewCliName] = useState('');
  const [newCliDesc, setNewCliDesc] = useState('');
  const [attachments, setAttachments] = useState<{file_name: string, mime_type: string, data: string}[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments = [...attachments];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      
      const filePromise = new Promise<{file_name: string, mime_type: string, data: string}>((resolve) => {
        reader.onload = (event) => {
          const base64String = event.target?.result as string;
          const base64Data = base64String.split(',')[1];
          resolve({
            file_name: file.name,
            mime_type: file.type,
            data: base64Data
          });
        };
      });
      
      reader.readAsDataURL(file);
      newAttachments.push(await filePromise);
    }
    setAttachments(newAttachments);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  // Persistence Effects
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (currentSessionId && currentSessionId !== 'new') {
      localStorage.setItem('currentSessionId', currentSessionId);
    } else if (currentSessionId === null || currentSessionId === 'new') {
      localStorage.removeItem('currentSessionId');
    }
  }, [currentSessionId]);

  useEffect(() => { localStorage.setItem('workingPath', path); }, [path]);
  useEffect(() => { localStorage.setItem('selectedCliId', selectedCliId); }, [selectedCliId]);

  // Queries
  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: async () => (await axios.get(`${API_BASE_URL}/chat/sessions`)).data,
  });

  const { data: clis = [] } = useQuery<CLI[]>({
    queryKey: ['clis'],
    queryFn: async () => (await axios.get(`${API_BASE_URL}/cli/`)).data,
  });

  // Set default CLI if none selected
  useEffect(() => {
    if (clis.length > 0 && !selectedCliId) {
      setSelectedCliId(clis[0].id);
    }
  }, [clis, selectedCliId]);

  const { data: currentSessionData } = useQuery({
    queryKey: ['messages', currentSessionId],
    queryFn: async () => {
      if (!currentSessionId || currentSessionId === 'new') return { messages: [] };
      return (await axios.get(`${API_BASE_URL}/chat/sessions/${currentSessionId}`)).data;
    },
    enabled: !!currentSessionId && currentSessionId !== 'new',
    refetchInterval: (query: any) => {
      const messages = query.state.data?.messages || [];
      return messages.some((m: Message) => m.content === 'Thinking...' && m.role === 'ai') ? 2000 : false;
    },
  });

  const messages = currentSessionData?.messages || [];

  // Mutations
  const createSessionMutation = useMutation({
    mutationFn: async (title: string) => {
      return (await axios.post(`${API_BASE_URL}/chat/sessions`, {
        title: title,
        cli_id: selectedCliId || null,
        path: path
      })).data;
    },
    onSuccess: (newSession) => {
      queryClient.setQueryData(['sessions'], (old: Session[] | undefined) => [newSession, ...(old || [])]);
    }
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ sessionId, content, attachments }: { sessionId: string; content: string, attachments?: any[] }) => {
      return (await axios.post(`${API_BASE_URL}/chat/sessions/${sessionId}/messages`, {
        role: 'user',
        content: content,
        attachments: attachments
      })).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', currentSessionId] });
    }
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await axios.delete(`${API_BASE_URL}/chat/sessions/${sessionId}`);
    },
    onSuccess: (_, sessionId) => {
      queryClient.setQueryData(['sessions'], (old: Session[] | undefined) => 
        (old || []).filter(s => s.id !== sessionId)
      );
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
      }
    }
  });

  const createCliMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      return (await axios.post(`${API_BASE_URL}/cli/`, { name, description })).data;
    },
    onSuccess: (newCli) => {
      queryClient.setQueryData(['clis'], (old: CLI[] | undefined) => [newCli, ...(old || [])]);
      setSelectedCliId(newCli.id);
      setIsAddCliModalOpen(false);
      setNewCliName('');
      setNewCliDesc('');
    }
  });

  // Handlers
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() && attachments.length === 0) return;
    if (sendMessageMutation.isPending || createSessionMutation.isPending) return;

    const content = input;
    const currentAttachments = [...attachments];
    setInput('');
    setAttachments([]);

    let sessionId: string;
    
    // Lazy session creation
    if (!currentSessionId || currentSessionId === 'new') {
      const derivedTitle = content 
        ? (content.length > 40 ? content.substring(0, 40) + '...' : content)
        : 'New Conversation with Files';
      const newSession = await createSessionMutation.mutateAsync(derivedTitle);
      sessionId = newSession.id;
      setCurrentSessionId(sessionId);
    } else {
      sessionId = currentSessionId;
    }

    sendMessageMutation.mutate({ sessionId, content, attachments: currentAttachments });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const createNewChat = () => {
    setCurrentSessionId('new');
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sendMessageMutation.isPending]);

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

  const activeSessionTitle = currentSessionId === 'new' 
    ? 'New Conversation' 
    : sessions.find(s => s.id === currentSessionId)?.title || 'Select a conversation';

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isSidebarOpen && window.innerWidth < 768 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.div 
        initial={false}
        animate={{ 
          width: isSidebarOpen ? 280 : 0,
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
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 mb-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Select CLI</label>
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
              <button onClick={() => setIsAddCliModalOpen(true)} className="p-2 bg-secondary hover:bg-muted border border-border rounded-lg transition-colors" title="Add New CLI">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Working Directory</label>
            <input type="text" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/home/niceiyke" className="w-full bg-secondary/50 border border-border text-foreground text-sm rounded-lg focus:ring-primary focus:border-primary block p-2 transition-all outline-none" />
          </div>

          <button onClick={createNewChat} className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white py-2.5 rounded-lg transition-all duration-200 text-sm font-medium shadow-lg shadow-primary/10">
            <Plus className="w-4 h-4" />
            New Conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1 scrollbar-hide">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">History</div>
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
                onClick={(e) => { e.stopPropagation(); deleteSessionMutation.mutate(session.id); }}
                className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-all"
                title="Delete Chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-border mt-auto">
          <button onClick={() => setIsSettingsOpen(true)} className="w-full flex items-center gap-3 px-3 py-2 text-muted-foreground hover:text-foreground cursor-pointer transition-colors hover:bg-muted rounded-lg">
            <Settings className="w-4 h-4" />
            <span className="text-sm">Settings</span>
          </button>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative h-full w-full bg-background">
        {/* Toggle Sidebar Button */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`absolute ${isSidebarOpen ? 'left-0' : 'left-0 md:left-2'} top-4 md:top-1/2 md:transform md:-translate-y-1/2 w-8 h-8 md:w-6 md:h-6 bg-card border border-border rounded-r-lg md:rounded-full flex items-center justify-center z-30 hover:bg-muted transition-all shadow-md`}
        >
          {isSidebarOpen ? <ChevronLeft className="w-4 h-4 md:w-3 md:h-3" /> : <ChevronRight className="w-4 h-4 md:w-3 md:h-3" />}
        </button>

        {/* Header */}
        <header className="h-16 border-b border-border flex items-center justify-between px-4 md:px-6 glass">
          <div className="flex items-center gap-4 ml-8 md:ml-0 overflow-hidden">
            <h2 className="font-semibold text-base md:text-lg truncate max-w-[200px] md:max-w-md">
              {activeSessionTitle}
            </h2>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <button onClick={() => setIsSearchOpen(true)} className="bg-secondary p-2 rounded-full hover:bg-muted transition-colors"><Search className="w-4 h-4 text-muted-foreground" /></button>
            <button onClick={() => setIsProfileOpen(true)} className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 hover:bg-primary/30 transition-colors"><User className="w-4 h-4 text-primary" /></button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {!currentSessionId || currentSessionId === 'new' ? (
            <div className="h-full flex flex-col items-center justify-center p-4">
               <motion.div 
                 initial={{ scale: 0.8, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 className="w-16 h-16 md:w-20 md:h-20 rounded-3xl fintech-gradient flex items-center justify-center mb-8 shadow-2xl shadow-primary/20"
               >
                <LayoutDashboard className="w-8 h-8 md:w-10 md:h-10 text-white" />
              </motion.div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-4 text-center">How can I help you?</h1>
              <p className="text-muted-foreground text-center max-w-sm mb-8">
                Send a message to start a new conversation. Your AI assistant is ready.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl w-full px-4">
                {['Explain a complex code', 'Write a script for automation', 'Debug a logic error', 'Design a system architecture'].map((item) => (
                  <button 
                    key={item} 
                    onClick={() => { setInput(item); }}
                    className="p-4 rounded-xl border border-border bg-card hover:bg-muted text-left transition-all text-sm group"
                  >
                    <p className="font-medium mb-1">{item}</p>
                    <p className="text-xs text-muted-foreground group-hover:text-foreground">Click to try this prompt</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message: Message) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex gap-3 md:gap-4 max-w-[95%] md:max-w-[85%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
                      message.role === 'user' ? 'bg-primary shadow-sm' : 'bg-card border border-border shadow-sm'
                    }`}>
                      {message.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-primary" />}
                    </div>
                    <div className={`p-3 md:p-4 rounded-2xl text-sm leading-relaxed break-words prose dark:prose-invert max-w-none shadow-sm ${
                      message.role === 'user' 
                        ? 'bg-primary text-white' 
                        : 'bg-card border border-border'
                    }`}>
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {message.attachments.map((att) => (
                            <div key={att.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs ${
                              message.role === 'user' ? 'bg-white/10 border-white/20' : 'bg-muted/50 border-border'
                            }`}>
                              {att.mime_type.startsWith('image/') ? <ImageIcon className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                              <span className="max-w-[150px] truncate">{att.file_name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline && match ? (
                              <div className="relative group mt-2 mb-2">
                                <CopyButton text={String(children).replace(/\n$/, '')} />
                                <SyntaxHighlighter
                                  style={isDarkMode ? vscDarkPlus : vs}
                                  language={match[1]}
                                  PreTag="div"
                                  className="rounded-xl !bg-muted/50 !mt-0 !mb-0 text-[13px]"
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              </div>
                            ) : (
                              <code className={`${className} bg-muted/50 px-1.5 py-0.5 rounded-md font-mono text-xs`} {...props}>{children}</code>
                            );
                          },
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
                          a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline underline-offset-4 font-medium">{children}</a>,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </motion.div>
              ))}
              {(sendMessageMutation.isPending || createSessionMutation.isPending) && (
                <div className="flex justify-start">
                  <div className="flex gap-4 max-w-[80%]">
                    <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center">
                      <Bot className="w-5 h-5 text-primary" />
                    </div>
                    <div className="bg-card border border-border p-4 rounded-2xl shadow-sm">
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
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 border-t border-border glass">
          <div className="max-w-4xl mx-auto space-y-4">
            {/* Attachment Preview */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex flex-wrap gap-2 pb-2"
                >
                  {attachments.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 bg-secondary/80 border border-border px-3 py-1.5 rounded-xl text-xs group relative">
                      {file.mime_type.startsWith('image/') ? <ImageIcon className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                      <span className="max-w-[120px] truncate">{file.file_name}</span>
                      <button 
                        onClick={() => removeAttachment(index)}
                        className="p-0.5 hover:bg-destructive/10 hover:text-destructive rounded-full transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative flex items-end gap-2">
              <input 
                type="file" 
                multiple 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mb-1 w-10 h-10 md:w-12 md:h-12 bg-secondary text-muted-foreground rounded-xl flex items-center justify-center hover:bg-muted transition-all flex-shrink-0"
              >
                <Paperclip className="w-5 h-5" />
              </button>
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
                disabled={(!input.trim() && attachments.length === 0) || sendMessageMutation.isPending || createSessionMutation.isPending}
                className="mb-1 w-10 h-10 md:w-12 md:h-12 bg-primary text-white rounded-xl flex items-center justify-center hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground transition-all shadow-lg shadow-primary/10 flex-shrink-0"
              >
                {sendMessageMutation.isPending || createSessionMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-3 uppercase tracking-widest font-semibold opacity-50">
            Powered by n8n & Gemini
          </p>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isAddCliModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
                <h3 className="text-xl font-bold">Add New CLI</h3>
                <button onClick={() => setIsAddCliModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); createCliMutation.mutate({ name: newCliName, description: newCliDesc }); }} className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">CLI Name</label>
                  <input autoFocus required type="text" value={newCliName} onChange={(e) => setNewCliName(e.target.value)} placeholder="e.g. Gemini CLI" className="w-full bg-secondary/50 border border-border rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <textarea value={newCliDesc} onChange={(e) => setNewCliDesc(e.target.value)} placeholder="What does this CLI do?" rows={3} className="w-full bg-secondary/50 border border-border rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none" />
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsAddCliModalOpen(false)} className="flex-1 px-4 py-2.5 bg-secondary hover:bg-muted font-medium rounded-xl transition-all">Cancel</button>
                  <button type="submit" disabled={createCliMutation.isPending} className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl transition-all shadow-lg shadow-primary/20">{createCliMutation.isPending ? 'Creating...' : 'Create CLI'}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isSettingsOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
                <h3 className="text-xl font-bold">Settings</h3>
                <button onClick={() => setIsSettingsOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-6 h-6" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Dark Mode</span>
                  <button onClick={() => setIsDarkMode(!isDarkMode)} className={`w-10 h-6 rounded-full relative transition-colors duration-200 ${isDarkMode ? 'bg-primary' : 'bg-secondary'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200 ${isDarkMode ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>
                <div className="pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground">Version 1.2.0</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
