import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  MessageSquare, 
  Send, 
  User, 
  Bot, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
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
  Eye,
  Pencil,
  Pin,
  PinOff,
  Download,
  Mic,
  Square
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
  model: string;
  model_id?: string;
  created_at: string;
  cli_id?: string;
  is_pinned?: string;
}

interface AIModel {
  id: string;
  name: string;
  display_name: string;
  cli_id: string;
  created_at: string;
}

interface CLI {
  id: string;
  name: string;
  description: string | null;
  models: AIModel[];
}

// Components
const CopyButton = ({ text, className = "absolute right-2 top-2" }: { text: string, className?: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className={`${className} p-1.5 rounded-lg bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all z-10`}>
      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
    </button>
  );
};

function App() {
  const queryClient = useQueryClient();
  const [selectedCliId, setSelectedCliId] = useState<string>(() => localStorage.getItem('selectedCliId') || '');
  const [selectedModel, setSelectedModel] = useState<string>(() => localStorage.getItem('selectedModel') || 'gemini-2.0-flash-exp');
  const [selectedModelId, setSelectedModelId] = useState<string>(() => localStorage.getItem('selectedModelId') || '');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => localStorage.getItem('currentSessionId'));
  const [path, setPath] = useState(() => localStorage.getItem('workingPath') || '/home/niceiyke');
  const [input, setInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAddCliModalOpen, setIsAddCliModalOpen] = useState(false);
  const [isAddModelModalOpen, setIsAddModelModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [_isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newCliName, setNewCliName] = useState('');
  const [newCliDesc, setNewCliDesc] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelDisplayName, setNewModelDisplayName] = useState('');
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<{file_name: string, mime_type: string, data: string}[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const responsePollingStartedAtRef = useRef<number | null>(null);
  const [responsePollingSessionId, setResponsePollingSessionId] = useState<string | null>(null);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent | ClipboardEvent) => {
    let files: FileList | File[] | null = null;
    
    if (e instanceof ClipboardEvent) {
      files = Array.from(e.clipboardData?.files || []);
    } else if ('dataTransfer' in e && e.dataTransfer) {
      files = e.dataTransfer.files;
    } else if ('target' in e && (e.target as HTMLInputElement).files) {
      files = (e.target as HTMLInputElement).files;
    }

    if (!files || files.length === 0) return;

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileChange(e);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      handleFileChange(e as any);
    }
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
  useEffect(() => { localStorage.setItem('selectedModel', selectedModel); }, [selectedModel]);
  useEffect(() => { localStorage.setItem('selectedModelId', selectedModelId); }, [selectedModelId]);

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

  // Update models when CLI changes
  useEffect(() => {
    if (selectedCliId) {
      const cli = clis.find(c => c.id === selectedCliId);
      if (cli && cli.models.length > 0) {
        // Only auto-select if we don't have a model selected or it's not in the new CLI's models
        const currentModelInCli = cli.models.find(m => m.id === selectedModelId);
        if (!selectedModelId || !currentModelInCli) {
          setSelectedModelId(cli.models[0].id);
          setSelectedModel(cli.models[0].name);
        }
      } else {
        setSelectedModelId('');
      }
    }
  }, [selectedCliId, clis]);

  const isTransientAiMessage = (message?: Message | null) => {
    if (!message || message.role !== 'ai') return false;
    return (
      message.content === 'Thinking...' ||
      message.content.startsWith('Failed to trigger n8n:') ||
      message.content.startsWith('Error: n8n returned')
    );
  };

  const sessionNeedsResponsePolling = (sessionData: any) => {
    const sessionMessages = sessionData?.messages || [];
    const latestMessage = sessionMessages[sessionMessages.length - 1] as Message | undefined;
    const latestAiMessage = [...sessionMessages].reverse().find((m: Message) => m.role === 'ai');

    if (isTransientAiMessage(latestAiMessage)) return true;
    if (!latestAiMessage && latestMessage?.role === 'user') return true;

    return false;
  };

  const { data: currentSessionData } = useQuery({
    queryKey: ['messages', currentSessionId],
    queryFn: async () => {
      if (!currentSessionId || currentSessionId === 'new') return { messages: [] };
      return (await axios.get(`${API_BASE_URL}/chat/sessions/${currentSessionId}`)).data;
    },
    enabled: !!currentSessionId && currentSessionId !== 'new',
    refetchInterval: (query: any) => {
      const data = query.state.data;
      const messages = data?.messages || [];
      const latestMessage = messages[messages.length - 1];
      const latestAiMessage = [...messages].reverse().find((m: Message) => m.role === 'ai');
      const latestAiIsTransient = latestAiMessage && (
        latestAiMessage.content === 'Thinking...' ||
        latestAiMessage.content.startsWith('Failed to trigger n8n:') ||
        latestAiMessage.content.startsWith('Error: n8n returned')
      );
      const latestAiIsRecent = latestAiMessage
        ? (Date.now() - new Date(latestAiMessage.created_at).getTime()) < 5 * 60 * 1000
        : false;
      const latestUserIsAwaitingReply = latestMessage?.role === 'user' &&
        (Date.now() - new Date(latestMessage.created_at).getTime()) < 5 * 60 * 1000;
      const isNewSession = !data?.id || messages.length === 0;
      return ((latestAiIsTransient && latestAiIsRecent) || latestUserIsAwaitingReply || isNewSession) ? 2000 : false;
    },
    refetchIntervalInBackground: true,
  });

  const messages = currentSessionData?.messages || [];

  // Mutations
  const createSessionMutation = useMutation({
    mutationFn: async (title: string) => {
      return (await axios.post(`${API_BASE_URL}/chat/sessions`, {
        title: title,
        cli_id: selectedCliId || null,
        model_id: selectedModelId || null,
        path: path,
        model: selectedModel
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
    onMutate: async (newMessage) => {
      await queryClient.cancelQueries({ queryKey: ['messages', newMessage.sessionId] });
      await queryClient.cancelQueries({ queryKey: ['sessions'] });
      const previousMessages = queryClient.getQueryData(['messages', newMessage.sessionId]);
      const previousSessions = queryClient.getQueryData(['sessions']);
      
      // Optimistic update for messages
      queryClient.setQueryData(['messages', newMessage.sessionId], (old: any) => ({
        ...old,
        messages: [
          ...(old?.messages || []),
          {
            id: 'optimistic-' + Date.now(),
            role: 'user',
            content: newMessage.content,
            created_at: new Date().toISOString(),
            // Don't include the large base64 data in the state!
            attachments: newMessage.attachments?.map((a: any, i: number) => ({ 
              id: 'opt-att-' + i,
              file_name: a.file_name,
              mime_type: a.mime_type,
              created_at: new Date().toISOString()
            }))
          },
          {
            id: 'optimistic-ai-' + Date.now(),
            role: 'ai',
            content: 'Thinking...',
            created_at: new Date().toISOString(),
            attachments: []
          },
        ]
      }));

      // Optimistic update for sessions order
      queryClient.setQueryData(['sessions'], (old: Session[] | undefined) => {
        if (!old) return old;
        const sessionIndex = old.findIndex(s => s.id === newMessage.sessionId);
        if (sessionIndex === -1) return old;
        
        const updatedSessions = [...old];
        const [movedSession] = updatedSessions.splice(sessionIndex, 1);
        return [movedSession, ...updatedSessions];
      });

      return { previousMessages, previousSessions };
    },
    onError: (_err, newMessage, context) => {
      queryClient.setQueryData(['messages', newMessage.sessionId], context?.previousMessages);
      queryClient.setQueryData(['sessions'], context?.previousSessions);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.sessionId] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.refetchQueries({ queryKey: ['messages', variables.sessionId], type: 'active' });
      responsePollingStartedAtRef.current = Date.now();
      setResponsePollingSessionId(variables.sessionId);
    }
  });

  useEffect(() => {
    if (!responsePollingSessionId) return;

    let cancelled = false;

    const pollSession = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/chat/sessions/${responsePollingSessionId}`);
        if (cancelled) return;

        const sessionData = response.data;
        queryClient.setQueryData(['messages', responsePollingSessionId], sessionData);
        queryClient.invalidateQueries({ queryKey: ['sessions'] });

        const startedAt = responsePollingStartedAtRef.current ?? Date.now();
        const exceededMaxWindow = Date.now() - startedAt > 5 * 60 * 1000;

        if (!sessionNeedsResponsePolling(sessionData) || exceededMaxWindow) {
          setResponsePollingSessionId(null);
          responsePollingStartedAtRef.current = null;
        }
      } catch (error) {
        console.error('Failed to poll session for AI response:', error);
      }
    };

    pollSession();
    const intervalId = window.setInterval(pollSession, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [queryClient, responsePollingSessionId]);

  useEffect(() => {
    if (!responsePollingSessionId || currentSessionId !== responsePollingSessionId) return;
    if (!sessionNeedsResponsePolling(currentSessionData)) {
      setResponsePollingSessionId(null);
      responsePollingStartedAtRef.current = null;
    }
  }, [currentSessionData, currentSessionId, responsePollingSessionId]);

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

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await axios.delete(`${API_BASE_URL}/chat/messages/${messageId}`);
    },
    onSuccess: (_, messageId) => {
      queryClient.setQueryData(['messages', currentSessionId], (old: any) => ({
        ...old,
        messages: (old?.messages || []).filter((m: Message) => m.id !== messageId)
      }));
    }
  });

  const pinSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return (await axios.patch(`${API_BASE_URL}/chat/sessions/${sessionId}/pin`)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    }
  });

  const updateSessionMutation = useMutation({
    mutationFn: async ({ sessionId, model, modelId }: { sessionId: string; model: string; modelId?: string }) => {
      return (await axios.patch(`${API_BASE_URL}/chat/sessions/${sessionId}`, { model, model_id: modelId })).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['messages', currentSessionId] });
    }
  });

  const exportToMarkdown = () => {
    if (!messages.length) return;
    const title = sessions.find(s => s.id === currentSessionId)?.title || 'Untitled Chat';
    let md = `# ${title}\n\n`;
    messages.forEach((m: Message) => {
      md += `### ${m.role === 'user' ? 'User' : 'AI'} (${formatDateTime(m.created_at)})\n\n${m.content}\n\n`;
      if (m.attachments?.length) {
        md += `**Attachments:**\n`;
        m.attachments.forEach(a => {
          md += `- ${a.file_name} (${a.mime_type})\n`;
        });
        md += `\n`;
      }
      md += `---\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  const createModelMutation = useMutation({
    mutationFn: async ({ name, display_name, cli_id }: { name: string; display_name: string; cli_id: string }) => {
      return (await axios.post(`${API_BASE_URL}/cli/models`, { name, display_name, cli_id })).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clis'] });
      setIsAddModelModalOpen(false);
      setNewModelName('');
      setNewModelDisplayName('');
      setEditingModelId(null);
    }
  });

  const updateModelMutation = useMutation({
    mutationFn: async ({ id, name, display_name }: { id: string; name: string; display_name: string }) => {
      return (await axios.patch(`${API_BASE_URL}/cli/models/${id}`, { name, display_name })).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clis'] });
      setIsAddModelModalOpen(false);
      setEditingModelId(null);
      setNewModelName('');
      setNewModelDisplayName('');
    }
  });

  const deleteModelMutation = useMutation({
    mutationFn: async (modelId: string) => {
      await axios.delete(`${API_BASE_URL}/cli/models/${modelId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clis'] });
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
    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 768) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const createNewChat = () => {
    setCurrentSessionId('new');
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  useEffect(() => {
    if (currentSessionData?.model && currentSessionId !== 'new') {
      setSelectedModel(currentSessionData.model);
    }
    if (currentSessionData?.model_id && currentSessionId !== 'new') {
      setSelectedModelId(currentSessionData.model_id);
    }
  }, [currentSessionData, currentSessionId]);

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

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        
        const audioPromise = new Promise<{file_name: string, mime_type: string, data: string}>((resolve) => {
          reader.onload = (event) => {
            const base64String = event.target?.result as string;
            const base64Data = base64String.split(',')[1];
            resolve({
              file_name: `Voice_Note_${new Date().toISOString()}.webm`,
              mime_type: 'audio/webm',
              data: base64Data
            });
          };
        });
        
        reader.readAsDataURL(audioBlob);
        const voiceNote = await audioPromise;
        setAttachments(prev => [...prev, voiceNote]);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please check your permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const updateMessageMutation = useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      // In a real app, this should be a backend endpoint like PATCH /messages/{id}
      // For now we'll just update the local state to show it works.
      // But let's check if the backend has it. Based on my previous research, it doesn't.
      // I'll add the backend endpoint next.
      await axios.patch(`${API_BASE_URL}/chat/messages/${messageId}`, { content });
    },
    onSuccess: (_, { messageId, content }) => {
      queryClient.setQueryData(['messages', currentSessionId], (old: any) => ({
        ...old,
        messages: (old?.messages || []).map((m: Message) => 
          m.id === messageId ? { ...m, content } : m
        )
      }));
      setEditingMessageId(null);
    }
  });

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const filteredSessions = sessions.filter(session => 
    session.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeSessionTitle = currentSessionId === 'new' 
    ? 'New Conversation' 
    : sessions.find(s => s.id === currentSessionId)?.title || 'Select a conversation';

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex h-screen bg-background text-foreground overflow-hidden font-sans relative"
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-primary/10 backdrop-blur-sm border-4 border-dashed border-primary flex flex-col items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-card p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                <Paperclip className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold">Drop files to attach</h3>
              <p className="text-muted-foreground text-center max-w-xs">You can drop multiple files and images here to share them in the chat.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">AI Model</label>
            <div className="flex gap-2">
              <select 
                value={selectedModelId}
                onChange={(e) => {
                  const mId = e.target.value;
                  const selectedCli = clis.find(c => c.id === selectedCliId);
                  const modelObj = selectedCli?.models.find(m => m.id === mId);
                  if (modelObj) {
                    setSelectedModelId(mId);
                    setSelectedModel(modelObj.name);
                    if (currentSessionId && currentSessionId !== 'new') {
                      updateSessionMutation.mutate({ sessionId: currentSessionId, model: modelObj.name, modelId: mId });
                    }
                  } else {
                    setSelectedModelId('');
                  }
                }}
                className="flex-1 bg-secondary/50 border border-border text-foreground text-sm rounded-lg focus:ring-primary focus:border-primary block p-2 transition-all outline-none"
              >
                <option value="">Select Model</option>
                {clis.find(c => c.id === selectedCliId)?.models.map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </select>
              <div className="flex gap-1">
                {selectedModelId && (
                  <>
                    <button 
                      onClick={() => {
                        const m = clis.find(c => c.id === selectedCliId)?.models.find(mod => mod.id === selectedModelId);
                        if (m) {
                          setEditingModelId(m.id);
                          setNewModelName(m.name);
                          setNewModelDisplayName(m.display_name);
                          setIsAddModelModalOpen(true);
                        }
                      }}
                      className="p-2 bg-secondary hover:bg-muted border border-border rounded-lg transition-colors" 
                      title="Edit Model"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setModelToDelete(selectedModelId)}
                      className="p-2 bg-secondary hover:bg-destructive/10 hover:text-destructive border border-border rounded-lg transition-colors" 
                      title="Delete Model"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button 
                  onClick={() => {
                    setEditingModelId(null);
                    setNewModelName('');
                    setNewModelDisplayName('');
                    setIsAddModelModalOpen(true);
                  }} 
                  className="p-2 bg-secondary hover:bg-muted border border-border rounded-lg transition-colors" 
                  title="Add New Model"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
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
              <span className="truncate text-left pr-12">{session.title || 'Untitled Chat'}</span>
              <div className="absolute right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
                <button
                  onClick={(e) => { e.stopPropagation(); pinSessionMutation.mutate(session.id); }}
                  className={`p-1 rounded transition-all ${session.is_pinned ? 'text-primary hover:bg-primary/10' : 'hover:bg-muted-foreground/10 text-muted-foreground'}`}
                  title={session.is_pinned ? "Unpin Chat" : "Pin Chat"}
                >
                  {session.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setSessionToDelete(session.id); }}
                  className="p-1 hover:bg-destructive/10 hover:text-destructive rounded text-muted-foreground transition-all"
                  title="Delete Chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {session.is_pinned && currentSessionId !== session.id && (
                <div className="absolute left-1 top-1">
                  <Pin className="w-2 h-2 text-primary rotate-45" />
                </div>
              )}
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
        <header className="sticky top-0 z-20 h-16 border-b border-border flex items-center justify-between px-4 md:px-6 glass">
          <div className="flex items-center gap-4 ml-8 md:ml-0 overflow-hidden">
            <button 
              onClick={() => setIsSearchOpen(true)}
              className="group flex items-center gap-2 hover:bg-muted/50 px-2.5 py-1.5 rounded-xl transition-all overflow-hidden"
              title="Switch Conversation (Ctrl+K)"
            >
              <h2 className="font-semibold text-base md:text-lg truncate max-w-[150px] sm:max-w-[250px] md:max-w-md">
                {activeSessionTitle}
              </h2>
              <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
            </button>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={() => setIsSearchOpen(true)} 
              className="md:hidden bg-secondary p-2 rounded-full hover:bg-muted transition-colors"
              title="Recent Conversations"
            >
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
            </button>
            {messages.length > 0 && (
              <button 
                onClick={exportToMarkdown} 
                className="bg-secondary p-2 rounded-full hover:bg-muted transition-colors" 
                title="Download Chat (.md)"
              >
                <Download className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <button onClick={() => setIsSearchOpen(true)} className="bg-secondary p-2 rounded-full hover:bg-muted transition-colors" title="Search (Ctrl+K)"><Search className="w-4 h-4 text-muted-foreground" /></button>
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
                  <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'} max-w-[95%] md:max-w-[85%] gap-1.5`}>
                    <div className={`flex gap-3 md:gap-4 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
                        message.role === 'user' ? 'bg-primary shadow-sm' : 'bg-card border border-border shadow-sm'
                      }`}>
                        {message.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-primary" />}
                      </div>
                      <div className={`p-3 md:p-4 rounded-2xl text-sm leading-relaxed break-words prose dark:prose-invert max-w-none shadow-sm relative group/msg ${
                        message.role === 'user' 
                          ? 'bg-primary text-white' 
                          : 'bg-card border border-border'
                      }`}>
                        <div className={`absolute top-2 right-2 flex gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity z-20`}>
                          <CopyButton 
                            text={message.content} 
                            className={`p-1.5 rounded-lg transition-all ${
                              message.role === 'user' ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground'
                            }`} 
                          />
                          {message.role === 'user' && (
                            <button
                              onClick={() => {
                                setEditingMessageId(message.id);
                                setEditingContent(message.content);
                              }}
                              className={`p-1.5 rounded-lg transition-all bg-white/10 hover:bg-white/20 text-white`}
                              title="Edit message"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (window.confirm('Are you sure you want to delete this message?')) {
                                deleteMessageMutation.mutate(message.id);
                              }
                            }}
                            className={`p-1.5 rounded-lg transition-all ${
                              message.role === 'user' ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-destructive'
                            }`}
                            title="Delete message"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {message.attachments.map((att) => (
                              <div key={att.id} className="flex flex-col gap-1 max-w-[200px]">
                                {att.mime_type.startsWith('image/') ? (
                                  <a 
                                    href={`${API_BASE_URL}/chat/attachments/${att.id}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="rounded-lg overflow-hidden border border-border/50 hover:opacity-90 transition-opacity"
                                  >
                                    <img src={`${API_BASE_URL}/chat/attachments/${att.id}`} alt={att.file_name} className="max-h-[150px] object-cover w-full" />
                                  </a>
                                ) : (
                                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs group/att ${
                                    message.role === 'user' ? 'bg-white/10 border-white/20' : 'bg-muted/50 border-border'
                                  }`}>
                                    {att.mime_type.startsWith('audio/') ? <Mic className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                                    <span className="max-w-[150px] truncate">{att.file_name}</span>
                                    {att.id.startsWith('opt-att-') ? null : (
                                      <a 
                                        href={`${API_BASE_URL}/chat/attachments/${att.id}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="ml-1 opacity-0 group-hover/att:opacity-100 transition-opacity hover:text-primary"
                                        title="View Attachment"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {editingMessageId === message.id ? (
                          <div className="flex flex-col gap-2 min-w-[250px] max-w-full">
                            <textarea
                              autoFocus
                              value={editingContent}
                              onChange={(e) => setEditingContent(e.target.value)}
                              className="w-full bg-white/10 border border-white/20 rounded-xl p-2 outline-none focus:ring-1 focus:ring-white/30 text-white resize-none min-h-[100px]"
                            />
                            <div className="flex gap-2 justify-end">
                              <button 
                                onClick={() => setEditingMessageId(null)}
                                className="px-3 py-1 text-xs font-medium rounded-lg hover:bg-white/10 text-white"
                              >
                                Cancel
                              </button>
                              <button 
                                onClick={() => updateMessageMutation.mutate({ messageId: message.id, content: editingContent })}
                                disabled={updateMessageMutation.isPending}
                                className="px-3 py-1 text-xs font-bold rounded-lg bg-white text-primary hover:bg-white/90"
                              >
                                {updateMessageMutation.isPending ? 'Saving...' : 'Save Changes'}
                              </button>
                            </div>
                          </div>
                        ) : (
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
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground/70 font-medium px-2">
                      {formatDateTime(message.created_at)}
                    </span>
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
                    <div key={index} className="flex items-center gap-2 bg-secondary/80 border border-border pr-2 py-1 rounded-xl text-xs group relative overflow-hidden">
                      {file.mime_type.startsWith('image/') ? (
                        <img src={`data:${file.mime_type};base64,${file.data}`} alt={file.file_name} className="w-8 h-8 object-cover rounded-lg ml-1" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center ml-1">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <span className="max-w-[120px] truncate font-medium">{file.file_name}</span>
                      <button 
                        onClick={() => removeAttachment(index)}
                        className="p-1 hover:bg-destructive/10 hover:text-destructive rounded-full transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
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
              
              {isRecording ? (
                <div className="flex-1 flex items-center gap-4 bg-red-500/10 border border-red-500/30 px-4 py-2 rounded-2xl animate-pulse">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-ping" />
                  <span className="text-sm font-medium text-red-500 flex-1">Recording Voice Note... {formatTime(recordingTime)}</span>
                  <button
                    onClick={stopRecording}
                    className="w-10 h-10 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                    title="Stop Recording"
                  >
                    <Square className="w-5 h-5 fill-current" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mb-1 w-10 h-10 md:w-12 md:h-12 bg-secondary text-muted-foreground rounded-xl flex items-center justify-center hover:bg-muted transition-all flex-shrink-0"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <button
                    onClick={startRecording}
                    className="mb-1 w-10 h-10 md:w-12 md:h-12 bg-secondary text-muted-foreground rounded-xl flex items-center justify-center hover:bg-muted transition-all flex-shrink-0"
                    title="Record Voice Note"
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                  <div className="relative flex-1">
                    <textarea
                      ref={textareaRef}
                      rows={1}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
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
                </>
              )}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-3 uppercase tracking-widest font-semibold opacity-50">
            Powered by n8n & Gemini
          </p>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isSearchOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-[100] p-4 pt-[10vh]">
            <motion.div 
              initial={{ opacity: 0, y: -20 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -20 }} 
              className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-border flex items-center gap-3 bg-muted/30">
                <Search className="w-5 h-5 text-muted-foreground" />
                <input 
                  autoFocus 
                  type="text" 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  placeholder="Search conversations..." 
                  className="flex-1 bg-transparent border-none outline-none text-lg" 
                />
                <button onClick={() => setIsSearchOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-2">
                {filteredSessions.length > 0 ? (
                  filteredSessions.map((session) => (
                    <button
                      key={session.id}
                      onClick={() => {
                        setCurrentSessionId(session.id);
                        setPath(session.path);
                        setIsSearchOpen(false);
                        setSearchQuery('');
                        if (window.innerWidth < 768) setIsSidebarOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm hover:bg-muted transition-all group"
                    >
                      <MessageSquare className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                      <div className="flex flex-col items-start overflow-hidden text-left">
                        <span className="font-medium truncate w-full">{session.title || 'Untitled Chat'}</span>
                        <span className="text-xs text-muted-foreground truncate w-full">{session.path}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    No conversations found matching "{searchQuery}"
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {isAddCliModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
                <h3 className="text-xl font-bold">Add New CLI (clitype)</h3>
                <button onClick={() => setIsAddCliModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); createCliMutation.mutate({ name: newCliName, description: newCliDesc }); }} className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">CLI Name (clitype)</label>
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

        {isAddModelModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
                <h3 className="text-xl font-bold">{editingModelId ? 'Edit AI Model' : 'Add New Model for CLI'}</h3>
                <button onClick={() => setIsAddModelModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={(e) => { 
                e.preventDefault(); 
                if (editingModelId) {
                  updateModelMutation.mutate({
                    id: editingModelId,
                    name: newModelName,
                    display_name: newModelDisplayName
                  });
                } else if (selectedCliId) {
                  createModelMutation.mutate({ 
                    name: newModelName, 
                    display_name: newModelDisplayName, 
                    cli_id: selectedCliId 
                  }); 
                }
              }} className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Model ID (Internal Name)</label>
                  <input autoFocus required type="text" value={newModelName} onChange={(e) => setNewModelName(e.target.value)} placeholder="e.g. gemini-2.0-flash-exp" className="w-full bg-secondary/50 border border-border rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Display Name</label>
                  <input required type="text" value={newModelDisplayName} onChange={(e) => setNewModelDisplayName(e.target.value)} placeholder="e.g. Gemini 2.0 Flash" className="w-full bg-secondary/50 border border-border rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsAddModelModalOpen(false)} className="flex-1 px-4 py-2.5 bg-secondary hover:bg-muted font-medium rounded-xl transition-all">Cancel</button>
                  <button type="submit" disabled={createModelMutation.isPending || updateModelMutation.isPending} className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl transition-all shadow-lg shadow-primary/20">
                    {(createModelMutation.isPending || updateModelMutation.isPending) ? 'Saving...' : (editingModelId ? 'Save Changes' : 'Add Model')}
                  </button>
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

        {modelToDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
            >
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto">
                  <Trash2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Delete AI Model?</h3>
                  <p className="text-sm text-muted-foreground mt-1">This will permanently remove this model from the CLI. This cannot be undone.</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setModelToDelete(null)}
                    className="flex-1 px-4 py-2.5 bg-secondary hover:bg-muted font-medium rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      deleteModelMutation.mutate(modelToDelete);
                      setModelToDelete(null);
                    }}
                    className="flex-1 px-4 py-2.5 bg-destructive hover:bg-destructive/90 text-white font-medium rounded-xl transition-all shadow-lg shadow-destructive/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {sessionToDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
            >
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto">
                  <Trash2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Delete Conversation?</h3>
                  <p className="text-sm text-muted-foreground mt-1">This action cannot be undone. This will permanently delete the conversation history.</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setSessionToDelete(null)}
                    className="flex-1 px-4 py-2.5 bg-secondary hover:bg-muted font-medium rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      deleteSessionMutation.mutate(sessionToDelete);
                      setSessionToDelete(null);
                    }}
                    className="flex-1 px-4 py-2.5 bg-destructive hover:bg-destructive/90 text-white font-medium rounded-xl transition-all shadow-lg shadow-destructive/20"
                  >
                    Delete
                  </button>
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
