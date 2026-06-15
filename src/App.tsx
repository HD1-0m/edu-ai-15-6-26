import React, { useState, useEffect, useRef } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  doc, 
  setDoc, 
  collection, 
  addDoc,
  onSnapshot, 
  query, 
  orderBy, 
  Timestamp, 
  deleteDoc,
  handleFirestoreError,
  OperationType,
  cleanUndefined
} from './firebase';
import { 
  chatWithAI, 
  generateQuestions, 
  searchGrounding, 
  generateLearningPath,
  QuizQuestion
} from './services/geminiService';
import { NotesManager } from './components/NotesManager';
import { 
  GraduationCap, 
  Menu, 
  Plus, 
  Trash2, 
  Moon, 
  Sun, 
  LogOut, 
  LogIn, 
  ChevronRight, 
  X, 
  Send, 
  Mic, 
  MicOff, 
  Notebook, 
  MessageSquare,
  BookOpen,
  Map,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Volume2,
  VolumeX,
  FileUp,
  HelpCircle,
  Copy,
  Edit3,
  ThumbsUp,
  ThumbsDown,
  Check,
  Bookmark,
  Share2,
  Search,
  Pin,
  Folder,
  Sparkles,
  Download,
  Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  feature?: 'explain' | 'notes' | 'roadmap' | 'quiz' | 'evaluate' | 'search' | 'image';
  data?: any;
  reaction?: 'like' | 'dislike';
  imageUri?: string;
  imageMimeType?: string;
  imageBase64?: string;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  timestamp: any;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  // App Navigation Tabs
  const [activeTab, setActiveTab] = useState<'chat' | 'notebook'>('chat');
  
  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Chat conversation state
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Active Quiz State variables
  const [activeQuiz, setActiveQuiz] = useState<QuizQuestion[] | null>(null);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [showQuizResult, setShowQuizResult] = useState(false);

  // Auth Specific Error State (to handle Google Popups blocked/cancelled)
  const [authError, setAuthError] = useState<{ code: string; message: string } | null>(null);
  const [showAuthBlockedModal, setShowAuthBlockedModal] = useState(false);

  // Dynamic Audio & Speech assistance
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const recognitionRef = useRef<any>(null);

  // Profile Drawer / Settings Modal
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Productive Feature States
  const [searchChatQuery, setSearchChatQuery] = useState('');
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [reNameText, setReNameText] = useState('');
  const [temperature, setTemperature] = useState<number>(0.7);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.5-flash');
  const [speakingSpeed, setSpeakingSpeed] = useState<number>(1.0);
  const [pinnedChatIds, setPinnedChatIds] = useState<string[]>(() => {
    try {
      const p = localStorage.getItem('eduai_pinned_chats');
      return p ? JSON.parse(p) : [];
    } catch { return []; }
  });
  const [chatCategories, setChatCategories] = useState<{ [id: string]: string }>(() => {
    try {
      const c = localStorage.getItem('eduai_chat_categories');
      return c ? JSON.parse(c) : {};
    } catch { return {}; }
  });
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('All');
  
  // Custom categories list that user can pick from
  const [availableCategories] = useState<string[]>([
    'General Tutors 📚',
    'Science Notes 🧪',
    'Language Practice 🗣️',
    'Math Prep 📐',
    'Prompt Art 🎨',
    'Exam Prep 📝'
  ]);

  const [attachedFiles, setAttachedFiles] = useState<{ name: string; type: string; base64?: string; content?: string }[]>([]);
  const [deepSearchMode, setDeepSearchMode] = useState<boolean>(false);
  const [responseLength, setResponseLength] = useState<number>(300);
  const [likedMessages, setLikedMessages] = useState<{ [msgId: string]: 'like' | 'dislike' }>(() => {
    try {
      const l = localStorage.getItem('eduai_liked_messages');
      return l ? JSON.parse(l) : {};
    } catch { return {}; }
  });

  // Speech options
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const loadVoices = () => {
        setVoices(window.speechSynthesis.getVoices());
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('eduai_pinned_chats', JSON.stringify(pinnedChatIds));
  }, [pinnedChatIds]);

  useEffect(() => {
    localStorage.setItem('eduai_chat_categories', JSON.stringify(chatCategories));
  }, [chatCategories]);

  useEffect(() => {
    localStorage.setItem('eduai_liked_messages', JSON.stringify(likedMessages));
  }, [likedMessages]);

  // File parsing states
  const [fileParsing, setFileParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroller ref
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // 1. Monitor Authentication State Transitions
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setAuthError(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Load and Apply User Settings (Themes & LocalStorage preferences)
  useEffect(() => {
    const savedTheme = localStorage.getItem('eduai_theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Handle system theme switching
  const toggleTheme = () => {
    const targetTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(targetTheme);
    localStorage.setItem('eduai_theme', targetTheme);
  };

  // 3. Real-time Listening of User Chats
  useEffect(() => {
    if (!user) {
      // Load offline guest chats
      const saved = localStorage.getItem('eduai_guest_chats');
      if (saved) {
        try {
          setChats(JSON.parse(saved));
        } catch (e) {
          console.error("Local storage parse errors", e);
        }
      } else {
        setChats([]);
      }
      return;
    }

    // Sync from Firestore real-time snapshots
    const chatsRef = collection(db, 'users', user.uid, 'chats');
    const q = query(chatsRef, orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatsList: Chat[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title || 'Untitled Conversation',
          messages: data.messages || [],
          timestamp: data.timestamp || Timestamp.now()
        };
      });
      setChats(chatsList);

      // Restore active chat if specified
      if (currentChatId) {
        const found = chatsList.find(c => c.id === currentChatId);
        if (found) {
          setMessages(found.messages);
        }
      }
    }, (error) => {
      console.error("Firestore listening error: ", error);
    });

    return () => unsubscribe();
  }, [user, currentChatId]);

  // 4. Voice assistance setups (WebSpeech Speech Recognition)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInput(prev => (prev ? prev + ' ' + transcript : transcript));
        };

        recognition.onend = () => {
          setIsVoiceActive(false);
        };

        recognition.onerror = (e: any) => {
          console.error("Speech Recognition error:", e);
          setIsVoiceActive(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  // 5. Scroll active chats to bottom
  useEffect(() => {
     chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating, activeQuiz]);

  // Voice activation hooks
  const toggleVoiceMode = () => {
    if (!recognitionRef.current) {
      alert("Browser speech recognition is not supported in this frame or browser tab.");
      return;
    }

    if (isVoiceActive) {
      recognitionRef.current.stop();
      setIsVoiceActive(false);
    } else {
      setIsVoiceActive(true);
      recognitionRef.current.start();
    }
  };

  // Voice assists under handleSpeakMessage now trigger manually per bubble

  const handleSpeakMessage = (msgId: string, text: string) => {
    if (!synthRef.current) {
      alert("Text-to-speech is not supported or initialized in this browser environment.");
      return;
    }

    if (speakingMessageId === msgId) {
      synthRef.current.cancel();
      setSpeakingMessageId(null);
    } else {
      synthRef.current.cancel();
      setSpeakingMessageId(msgId);

      // Clean out markdown elements to prevent audio stuttering
      const parsedText = text.replace(/[*#_\-\/`\\:[\]()]/g, ' ').substring(0, 1000);
      const utterance = new SpeechSynthesisUtterance(parsedText);
      
      // Assign custom voice if available
      if (selectedVoiceName !== 'default') {
        const foundVoice = voices.find(v => v.name === selectedVoiceName);
        if (foundVoice) {
          utterance.voice = foundVoice;
        }
      }
      
      utterance.rate = speakingSpeed;
      utterance.onend = () => {
        setSpeakingMessageId(null);
      };
      utterance.onerror = () => {
        setSpeakingMessageId(null);
      };
      synthRef.current.speak(utterance);
    }
  };

  // Gracefully handle Popup Blocker and cancelled Google Logins
  const handleLogin = async () => {
    try {
      setAuthError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Authenicate Popup Error: ", error);
      
      const parsedError = {
        code: error.code || 'unknown-auth-fail',
        message: error.message || 'Third-party interaction blocked.'
      };
      
      setAuthError(parsedError);

      if (
        error.code === 'auth/popup-blocked' || 
        error.code === 'auth/cancelled-popup-request' ||
        error.message?.includes('popup')
      ) {
        setShowAuthBlockedModal(true);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setMessages([]);
      setCurrentChatId(null);
    } catch (error) {
      console.error("Log out error: ", error);
    }
  };

  // Saves chat sessions either to Firestore or fallback LocalStorage
  const handleSaveActiveChat = async (targetId: string, updatedMessages: Message[], titleText?: string) => {
    if (updatedMessages.length === 0) return;

    let finalTitle = titleText;
    if (!finalTitle) {
      const existing = chats.find(c => c.id === targetId);
      if (existing?.title && existing.title !== 'New Chat' && existing.title !== 'Untitled Conversation') {
        finalTitle = existing.title;
      } else {
        const firstUserMsg = updatedMessages.find(m => m.type === 'user');
        finalTitle = firstUserMsg 
          ? firstUserMsg.content.substring(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '')
          : 'New Chat';
      }
    }

    if (user) {
      try {
        const chatDocRef = doc(db, 'users', user.uid, 'chats', targetId);
        await setDoc(chatDocRef, cleanUndefined({
          id: targetId,
          title: finalTitle,
          messages: updatedMessages,
          timestamp: Timestamp.now()
        }), { merge: true });
      } catch (error) {
        console.error("Failed to commit chat messages to cloud database: ", error);
      }
    } else {
      // Save local chats for guest mode
      const saved = localStorage.getItem('eduai_guest_chats');
      let guestChatsList: Chat[] = [];
      if (saved) {
        try {
          guestChatsList = JSON.parse(saved);
        } catch (e) {
          console.error(e);
        }
      }

      const existingIdx = guestChatsList.findIndex(c => c.id === targetId);
      const updatedChat: Chat = {
        id: targetId,
        title: finalTitle,
        messages: updatedMessages,
        timestamp: Date.now()
      };

      if (existingIdx !== -1) {
        guestChatsList[existingIdx] = updatedChat;
      } else {
        guestChatsList.unshift(updatedChat);
      }

      localStorage.setItem('eduai_guest_chats', JSON.stringify(guestChatsList));
      setChats(guestChatsList);
    }
  };

  // Initiate New Conversation Session
  const handleNewChat = () => {
    if (messages.length > 0) {
      const activeId = currentChatId || Date.now().toString();
      handleSaveActiveChat(activeId, messages);
    }
    setMessages([]);
    setCurrentChatId(null);
    setActiveQuiz(null);
    setMobileSidebarOpen(false);
  };

  // Loads explicit historic chats
  const selectChat = (chat: Chat) => {
    setCurrentChatId(chat.id);
    setMessages(chat.messages);
    setActiveQuiz(null);
    setMobileSidebarOpen(false);
    setActiveTab('chat');
  };

  // Remove Chats
  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (user) {
      try {
        const chatDocRef = doc(db, 'users', user.uid, 'chats', chatId);
        await deleteDoc(chatDocRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/chats/${chatId}`);
      }
    } else {
      const filtered = chats.filter(c => c.id !== chatId);
      localStorage.setItem('eduai_guest_chats', JSON.stringify(filtered));
      setChats(filtered);
    }

    if (currentChatId === chatId) {
      setMessages([]);
      setCurrentChatId(null);
    }
  };

  // Submits conversation queries to Google Generative AI
  const handleSubmitMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isGenerating) return;

    const userQuery = input.trim();
    setInput('');
    
    const nextChatId = currentChatId || Date.now().toString();
    if (!currentChatId) {
      setCurrentChatId(nextChatId);
    }

    // Process attached files context & find image attachments
    let editedQuery = userQuery;
    let imageAttachment: { data: string; mimeType: string } | undefined = undefined;
    let trackingImgBase64: string | undefined = undefined;

    if (attachedFiles.length > 0) {
      const textContextParts = attachedFiles
        .filter(f => f.type !== 'image' && f.content)
        .map(f => `[Attached Document Context: "${f.name}"]\n\n${f.content}`);
      
      if (textContextParts.length > 0) {
        editedQuery = `${textContextParts.join('\n\n')}\n\nClient Question / Directive:\n${userQuery}`;
      }

      const imgFile = attachedFiles.find(f => f.type === 'image' && f.base64);
      if (imgFile && imgFile.base64) {
        trackingImgBase64 = imgFile.base64;
        const parts = imgFile.base64.split(',');
        const base64Data = parts[1] || parts[0];
        const mimeType = imgFile.base64.match(/:(.*?);/)?.[1] || 'image/png';
        imageAttachment = {
          data: base64Data,
          mimeType: mimeType
        };
      }
    }

    // Clear attachment queue
    setAttachedFiles([]);

    // Append user bubble instantly, keeping track of image thumbnail inside state if any
    const userMsg: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: userQuery,
      imageBase64: trackingImgBase64
    };
    
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setIsGenerating(true);

    // Save active chat immediately to populate the study log list with correct title instantly
    await handleSaveActiveChat(nextChatId, newHistory);

    try {
      // 1. Identify educational intent
      let responseText = "";
      let sourceLinks: any[] = [];
      let currentIntent: Message['feature'] = undefined;
      let extraData: any = undefined;

      const userQueryLower = userQuery.toLowerCase();
      
      // Default Academic Prompt Template with Dynamic Words Cap
      const systemInstruction = `You are EduAI, a distinguished personal AI tutor. Break down complex topics elegantly, utilizing appropriate lists, analogies, and markdown highlighting to guarantee academic progress. Please format your output to be close to ${responseLength} words in detailed length.`;
      const generationSettings = {
        model: selectedModel,
        temperature: temperature,
        systemInstruction: systemInstruction
      };

      // Handle raw visual commands or slash instructions
      if (userQueryLower.startsWith('/image ') || userQueryLower.startsWith('generate image ')) {
        currentIntent = 'image';
        const imagePrompt = userQuery.replace(/^\/image |^generate image /gi, '').trim() || "beautiful study scene";
        const randomSeed = Math.floor(Math.random() * 10000000);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=1024&height=1024&seed=${randomSeed}&nologo=true`;
        responseText = `### Sparkles Artwork Created\nHere is your custom generated illustration for **"${imagePrompt}"**.\n\nYou can download it using the buttons below, or click **Save to Notebook** to keep it in your study sheets ledger!`;
        extraData = { imageUrl, imagePrompt };

      } else if (userQueryLower.startsWith('generate quiz on') || userQueryLower.startsWith('quiz me on')) {
        currentIntent = 'quiz';
        const topic = userQuery.replace(/generate quiz on|quiz me on/gi, '').trim() || 'General Science';
        responseText = `Let's draft an intellectual test on **${topic}**. Click below to start!`;
        
        // Dynamically compile questions in state
        const generatedQs = await generateQuestions(topic, 4);
        setActiveQuiz(generatedQs);
        setCurrentQuizIndex(0);
        setQuizScore(0);
        setQuizAnswers([]);
        setShowQuizResult(false);

      } else if (userQueryLower.startsWith('evaluate this answer:') || userQueryLower.startsWith('review answer:')) {
        currentIntent = 'evaluate';
        responseText = await chatWithAI(editedQuery, {
          ...generationSettings,
          systemInstruction: "You are an Elite Essay grader. Review the grammar, thesis structure, and logic of the answer. Give a grade from A+ to F, followed by structural bullet points of Recommendations."
        }, imageAttachment);

      } else if (userQueryLower.startsWith('learning path for') || userQueryLower.startsWith('roadmap for')) {
        currentIntent = 'roadmap';
        const topic = userQuery.replace(/learning path for|roadmap for/gi, '').trim() || 'General Science';
        responseText = await generateLearningPath(topic, {});

      } else if (deepSearchMode || userQueryLower.startsWith('search live') || userQueryLower.startsWith('google search')) {
        currentIntent = 'search';
        const queryStr = userQuery.replace(/search live|google search/gi, '').trim() || userQuery;
        const searchRes = await searchGrounding(queryStr);
        responseText = searchRes.text;
        sourceLinks = searchRes.sources;
        if (sourceLinks && sourceLinks.length > 0) {
          extraData = { sources: sourceLinks };
        }

      } else {
        // Standard conversational chat helper
        responseText = await chatWithAI(editedQuery, generationSettings, imageAttachment);
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: responseText,
        feature: currentIntent,
        data: extraData
      };

      const finalHistory = [...newHistory, aiMsg];
      setMessages(finalHistory);
      
      // Commit update history logs
      await handleSaveActiveChat(nextChatId, finalHistory);

    } catch (e: any) {
      console.error(e);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          type: 'ai',
          content: `Apologies, we encountered an initialization fail. Please try again! Error details: ${e.message || String(e)}`
        }
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Submit assessment metrics
  const selectQuizAnswer = (optionIdx: number) => {
    if (!activeQuiz) return;
    const isCorrect = optionIdx === activeQuiz[currentQuizIndex].correctIndex;
    if (isCorrect) setQuizScore(prev => prev + 1);
    
    const newAnswers = [...quizAnswers, optionIdx];
    setQuizAnswers(newAnswers);

    if (currentQuizIndex + 1 < activeQuiz.length) {
      setCurrentQuizIndex(prev => prev + 1);
    } else {
      setShowQuizResult(true);
      // Compile score report
      const correctAnswersCount = isCorrect ? quizScore + 1 : quizScore;
      const totalCount = activeQuiz.length;
      
      // Post to Firestore quizzes log subcollection if logged in
      if (user) {
        addDoc(collection(db, 'users', user.uid, 'quizzes'), {
          topic: activeQuiz[0].question.substring(0, 32) || 'General Science',
          score: correctAnswersCount,
          total: totalCount,
          date: new Date().toLocaleDateString(),
          timestamp: Timestamp.now()
        }).catch((err: any) => console.error(err));
      }
    }
  };

  // PDF, Text & Image upload utility
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    processFileObject(file);
    // Clear input value so same files can be reuploaded
    e.target.value = '';
  };

  const processFileObject = (file: File) => {
    setFileParsing(true);
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const result = event.target?.result;
        if (!result) throw new Error("File content is empty.");

        if (isImage) {
          setAttachedFiles(prev => [
            ...prev,
            { name: file.name, type: 'image', base64: result as string }
          ]);
        } else {
          // Process as Text file
          const text = result as string;
          setAttachedFiles(prev => [
            ...prev,
            { name: file.name, type: 'text', content: text }
          ]);
        }
      } catch (err: any) {
        alert("Parser error: " + err.message);
      } finally {
        setFileParsing(false);
      }
    };

    if (isImage) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  };

  const renderSidebarChatItem = (chat: Chat) => {
    const isSelected = currentChatId === chat.id;
    const isPinned = pinnedChatIds.includes(chat.id);
    const chatCategory = chatCategories[chat.id] || "All";

    if (renamingChatId === chat.id) {
      return (
        <div key={chat.id} className="flex items-center gap-1.5 p-1 px-2.5 bg-slate-100/50 dark:bg-zinc-850 rounded-xl">
          <input
            type="text"
            value={reNameText}
            onChange={(e) => setReNameText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (reNameText.trim()) {
                  setChats(prev => prev.map(c => c.id === chat.id ? { ...c, title: reNameText.trim() } : c));
                  handleSaveActiveChat(chat.id, chat.messages, reNameText.trim());
                }
                setRenamingChatId(null);
              }
            }}
            className="flex-1 bg-transparent text-xs font-bold focus:outline-none dark:text-white"
            autoFocus
          />
          <button
            onClick={() => {
              if (reNameText.trim()) {
                setChats(prev => prev.map(c => c.id === chat.id ? { ...c, title: reNameText.trim() } : c));
                handleSaveActiveChat(chat.id, chat.messages, reNameText.trim());
              }
              setRenamingChatId(null);
            }}
            className="p-1 hover:bg-gray-250 dark:hover:bg-zinc-805 rounded text-emerald-500 cursor-pointer"
          >
            <Check size={11} />
          </button>
        </div>
      );
    }

    return (
      <div
        key={chat.id}
        onClick={() => selectChat(chat)}
        className={`group w-full flex flex-col p-2 px-3 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-900 cursor-pointer transition-all border border-transparent ${
          isSelected 
            ? 'bg-amber-500/10 dark:bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400 font-bold' 
            : 'text-slate-650 dark:text-zinc-400'
        }`}
      >
        <div className="flex items-center justify-between gap-1 w-full">
          <div className="flex items-center gap-2 truncate flex-1 pr-1.5">
            <MessageSquare size={13} className="shrink-0 text-gray-450" />
            <span className="truncate text-xs font-medium">{chat.title}</span>
          </div>

          <div className="flex opacity-100 md:opacity-0 group-hover:opacity-100 gap-1 shrink-0 items-center justify-end">
            {/* Pin Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isPinned) {
                  setPinnedChatIds(prev => prev.filter(p => p !== chat.id));
                } else {
                  setPinnedChatIds(prev => [...prev, chat.id]);
                }
              }}
              className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-800 ${isPinned ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'} transition-all`}
              title={isPinned ? "Unpin chat" : "Pin chat"}
            >
              <Pin size={11} className={isPinned ? "fill-amber-500" : ""} />
            </button>

            {/* Inline Rename Trigger */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setRenamingChatId(chat.id);
                setReNameText(chat.title);
              }}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-800 text-gray-400 hover:text-blue-500 transition-all"
              title="Rename conversation"
            >
              <Edit3 size={11} />
            </button>

            {/* Delete Chat */}
            <button
              onClick={(e) => deleteChat(chat.id, e)}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-800 text-gray-400 hover:text-red-500 transition-all"
              title="Delete conversation"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        {/* Small folder badge dropdown at the bottom of the active chat item */}
        <div className="flex items-center justify-between text-[9px] mt-1.5 border-t border-gray-100/30 dark:border-zinc-800/20 pt-1.5 opacity-80">
          <div className="flex items-center gap-1 text-gray-400">
            <Folder size={9} />
            <span className="truncate max-w-[120px]">{chatCategory === 'All' ? 'General' : chatCategory}</span>
          </div>
          <select
            value={chatCategory}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              const selectedValue = e.target.value;
              setChatCategories(prev => ({
                ...prev,
                [chat.id]: selectedValue
              }));
            }}
            className="text-[9px] font-bold text-gray-405 border-none bg-transparent hover:text-amber-500 outline-none cursor-pointer"
          >
            <option value="All">Categorize 📁</option>
            {availableCategories.map((c, idx) => (
              <option key={idx} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  return (
    <div className={`flex h-screen bg-slate-50 dark:bg-[#121212] text-slate-800 dark:text-zinc-100 ${theme === 'dark' ? 'dark' : ''}`}>
      
      {/* 1. Global Blocked Modal - Helpful overlay when Firebase popup is restricted */}
      <AnimatePresence>
        {showAuthBlockedModal && (
          <div className="fixed inset-0 bg-black/65 backdrop-blur-md z-99 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-[#1a1a1a] border border-red-200 dark:border-red-900/30 max-w-md w-full rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3 text-amber-500">
                <AlertTriangle className="w-8 h-8 shrink-0" />
                <div>
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-tight">Google Sign-In Blocked</h3>
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">IFrame Sandbox Constraint</p>
                </div>
              </div>

              <div className="text-xs text-gray-650 dark:text-zinc-400 space-y-2.5 leading-relaxed">
                <p>
                  To secure user credentials, modern web browsers prevent authentication popups from launching inside nested iframes (such as the AI Studio live preview).
                </p>
                <div className="bg-amber-500/10 dark:bg-amber-550/10 border-l-2 border-amber-500 p-3 rounded-r-xl">
                  <p className="font-bold text-slate-800 dark:text-amber-400 text-[11px]">Direct Solution:</p>
                  <p className="mt-0.5 text-[11px]">
                    Click the **Open App in New Tab** button below. This loads the app in its own browser page where Google popup sign-in works perfectly!
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  onClick={() => setShowAuthBlockedModal(false)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-350 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Close & Use Guest Mode
                </button>
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink size={14} />
                  Open App in New Tab
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Responsive Sidebars */}
      <aside className={`hidden md:flex flex-col bg-white dark:bg-[#151515] border-r border-gray-150 dark:border-zinc-900 transition-all duration-300 min-h-0 select-none ${
        sidebarCollapsed ? 'w-16' : 'w-72'
      }`}>
        
        {/* Toggle Head */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-150 dark:border-zinc-900 shrink-0">
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-3">
              <div className="bg-black dark:bg-white p-1.5 rounded-lg">
                <GraduationCap className="text-white dark:text-black w-4 h-4" />
              </div>
              <span className="font-extrabold text-base tracking-tight">EduAI Assistant</span>
            </div>
          ) : (
            <div className="mx-auto bg-black dark:bg-white p-1.5 rounded-lg">
              <GraduationCap className="text-white dark:text-black w-4 h-4" />
            </div>
          )}
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)} 
            className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded text-gray-400 hover:text-black dark:hover:text-white"
          >
            <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${sidebarCollapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>

        {/* Action Button */}
        <div className="p-3 shrink-0">
          <button
            onClick={handleNewChat}
            className={`w-full flex items-center justify-center gap-2 p-2.5 bg-gray-50 border border-gray-200 dark:border-zinc-800 dark:bg-zinc-900 hover:bg-gray-100 dark:hover:bg-zinc-800 text-xs font-bold rounded-xl transition-all shadow-xs group ${
              sidebarCollapsed ? 'px-0' : ''
            }`}
            title="Start New Chat"
          >
            <Plus size={16} className="text-amber-500 group-hover:scale-110 transition-transform" />
            {!sidebarCollapsed && <span className="uppercase tracking-wider">New Chat</span>}
          </button>
        </div>

        {/* Quick Study Aids */}
        {!sidebarCollapsed && (
          <div className="px-4 py-2 border-t border-b border-gray-100 dark:border-zinc-900 shrink-0 space-y-1 bg-slate-50/50 dark:bg-zinc-900/10">
            <h4 className="text-[9px] uppercase tracking-wider text-gray-400 font-extrabold mb-1">Lesson Commands</h4>
            <div className="grid grid-cols-2 gap-1.5 pb-1">
              <button 
                onClick={() => setInput("Explain ")}
                className="flex items-center gap-1.5 justify-start text-left px-2 py-1.5 rounded-lg border border-gray-150 dark:border-zinc-850 bg-white dark:bg-zinc-900 hover:scale-[1.02] text-[10px] font-bold text-gray-700 dark:text-zinc-300 transition-all cursor-pointer"
              >
                <BookOpen size={11} className="text-blue-500 shrink-0" />
                Explain Topic
              </button>
              <button 
                onClick={() => setInput("Generate quiz on ")}
                className="flex items-center gap-1.5 justify-start text-left px-2 py-1.5 rounded-lg border border-gray-150 dark:border-zinc-850 bg-white dark:bg-zinc-900 hover:scale-[1.02] text-[10px] font-bold text-gray-700 dark:text-zinc-300 transition-all cursor-pointer"
              >
                <HelpCircle size={11} className="text-purple-500 shrink-0" />
                Generate Quiz
              </button>
              <button 
                onClick={() => setInput("Learning path for ")}
                className="flex items-center gap-1.5 justify-start text-left px-2 py-1.5 rounded-lg border border-gray-150 dark:border-zinc-850 bg-white dark:bg-zinc-900 hover:scale-[1.02] text-[10px] font-bold text-gray-700 dark:text-zinc-300 transition-all cursor-pointer"
              >
                <Map size={11} className="text-emerald-500 shrink-0" />
                Learning Path
              </button>
              <button 
                onClick={() => setInput("Evaluate this answer: ")}
                className="flex items-center gap-1.5 justify-start text-left px-2 py-1.5 rounded-lg border border-gray-150 dark:border-zinc-850 bg-white dark:bg-zinc-900 hover:scale-[1.02] text-[10px] font-bold text-gray-700 dark:text-zinc-300 transition-all cursor-pointer"
              >
                <CheckCircle2 size={11} className="text-rose-500 shrink-0" />
                Grade Answer
              </button>
            </div>
          </div>
        )}

        {!sidebarCollapsed && (
          <div className="py-2 border-b border-gray-100 dark:border-zinc-900 shrink-0 space-y-2">
            {/* Live Chat Search Bar */}
            <div className="px-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search chats..."
                  value={searchChatQuery}
                  onChange={(e) => setSearchChatQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-zinc-900 border border-gray-150 dark:border-zinc-850 rounded-xl text-[10.5px] outline-none focus:border-black dark:focus:border-white transition-all placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Folder / Category dropdown filter */}
            <div className="px-4 flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-wider text-gray-400 font-extrabold flex items-center gap-1">
                <Folder size={10} className="text-amber-500" /> Filter Folder:
              </span>
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="text-[10px] font-extrabold text-amber-500 bg-transparent border-none outline-none cursor-pointer max-w-[130px] text-right"
              >
                <option value="All">All Chats</option>
                {availableCategories.map((cat, i) => (
                  <option key={i} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Scroll Feed of history logs */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
          {chats.length === 0 ? (
            !sidebarCollapsed && (
              <p className="text-[10px] text-gray-450 text-center py-6 italic">No study logs yet</p>
            )
          ) : (
            <div className="space-y-4">
              {/* Segment 1: Pinned threads */}
              {!sidebarCollapsed && chats.filter(c => pinnedChatIds.includes(c.id)).length > 0 && (
                <div className="space-y-1">
                  <div className="text-[9px] uppercase tracking-wider text-amber-500 font-extrabold px-1 flex items-center gap-1 mb-1.5">
                    <Pin size={10} /> Pinned Conversations
                  </div>
                  {chats.filter(c => {
                    const matchesSearch = c.title.toLowerCase().includes(searchChatQuery.toLowerCase());
                    const chatCat = chatCategories[c.id] || 'All';
                    const matchesCat = selectedCategoryFilter === 'All' || chatCat === selectedCategoryFilter;
                    return matchesSearch && matchesCat && pinnedChatIds.includes(c.id);
                  }).map(chat => renderSidebarChatItem(chat))}
                </div>
              )}

              {/* Segment 2: All unpinned dialogues */}
              <div className="space-y-1">
                {!sidebarCollapsed && (
                  <div className="text-[9px] uppercase tracking-wider text-gray-400 font-extrabold px-1 mb-1.5 flex items-center gap-1">
                    <MessageSquare size={10} /> Conversations
                  </div>
                )}
                {chats.filter(c => {
                  const matchesSearch = c.title.toLowerCase().includes(searchChatQuery.toLowerCase());
                  const chatCat = chatCategories[c.id] || 'All';
                  const matchesCat = selectedCategoryFilter === 'All' || chatCat === selectedCategoryFilter;
                  return matchesSearch && matchesCat && !pinnedChatIds.includes(c.id);
                }).map(chat => renderSidebarChatItem(chat))}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-3 border-t border-gray-150 dark:border-zinc-900 shrink-0">
          {!sidebarCollapsed ? (
            user ? (
              <div className="flex items-center justify-between">
                <div 
                  onClick={() => setShowProfileModal(true)}
                  className="flex items-center gap-2.5 cursor-pointer hover:opacity-85 transition-opacity"
                >
                  <img src={user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`} alt="User" className="w-8 h-8 rounded-full bg-amber-50" />
                  <div className="max-w-[120px] truncate">
                    <p className="font-bold text-xs truncate leading-none">{user.displayName || 'EduAI Student'}</p>
                    <p className="text-[10.5hpx] text-gray-400 truncate mt-0.5">Settings Dashboard</p>
                  </div>
                </div>
                <button 
                  onClick={handleLogout} 
                  className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg text-gray-450 hover:text-red-500"
                  title="Sign Out"
                >
                  <LogOut size={15} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-xl font-bold text-xs shadow-md hover:scale-[1.02] transition-transform cursor-pointer"
              >
                <LogIn size={15} />
                <span>SIGN IN WITH GOOGLE</span>
              </button>
            )
          ) : (
            user ? (
              <img 
                onClick={() => setShowProfileModal(true)} 
                src={user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`} 
                alt="Profile" 
                className="w-8 h-8 rounded-full bg-slate-100 mx-auto cursor-pointer" 
              />
            ) : (
              <button onClick={handleLogin} title="Login" className="p-2 mx-auto bg-black dark:bg-white rounded-full text-white dark:text-black flex items-center justify-center">
                <LogIn size={15} />
              </button>
            )
          )}
        </div>

      </aside>

      {/* 3. Main Center Pane */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        
        {/* Main Header */}
        <header className="h-16 border-b border-gray-150 dark:border-zinc-900 bg-white dark:bg-[#151515] flex items-center justify-between px-4 sm:px-8 shrink-0">
          
          {/* Mobile Menu activator */}
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden p-1.5 text-gray-500 hover:text-black dark:hover:text-white transition-colors"
            >
              <Menu size={20} />
            </button>
            
            {/* Inline Page Tabs */}
            <div className="flex bg-slate-100 dark:bg-zinc-900 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('chat')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'chat' 
                    ? 'bg-white text-black dark:bg-zinc-800 dark:text-white shadow-sm' 
                    : 'text-gray-500 hover:text-black dark:hover:text-white'
                }`}
              >
                <MessageSquare size={13} />
                <span>AI Tutor Chat</span>
              </button>
              <button
                onClick={() => {
                  if (!user) {
                    alert("Please sign in or use guest mode to save notes in your Notebook Study Room.");
                  }
                  setActiveTab('notebook');
                }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'notebook'
                    ? 'bg-white text-black dark:bg-zinc-800 dark:text-white shadow-sm' 
                    : 'text-gray-500 hover:text-black dark:hover:text-white'
                }`}
              >
                <Notebook size={13} />
                <span>My Notebook</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            
            {/* Open app in new tab button to bypass blocked popups */}
            <a 
              href={window.location.href} 
              target="_blank" 
              rel="noopener noreferrer"
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 border border-amber-200 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl text-[11px] font-bold hover:bg-amber-500/25 transition-all shadow-xs shrink-0"
              title="Work inside dedicated page to enable Google logins safely"
            >
              <ExternalLink size={12} />
              Open App in New Tab
            </a>

            <button
              onClick={() => setIsAudioMuted(!isAudioMuted)}
              className="p-2 text-gray-400 hover:text-black dark:hover:text-white transition-colors"
              title={isAudioMuted ? "Enable speech synthesis response read-back" : "Mute speech replies"}
            >
              {isAudioMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            
            <button
              onClick={toggleTheme}
              className="p-2 text-gray-450 hover:text-black dark:hover:text-white transition-colors"
              title="Change Visual Theme"
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>

        </header>

        {/* Auth Error Banner inside app layout */}
        {authError && (
          <div className="bg-amber-500/10 border-b border-amber-200/30 px-6 py-2.5 flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle size={15} />
              Login notification: Popups might be blocked ({authError.code}). Try opening the application in a separate tab.
            </span>
            <a 
              href={window.location.href} 
              target="_blank" 
              rel="noopener" 
              className="px-3 py-1 bg-amber-500 text-white font-bold rounded-lg hover:bg-amber-600 transition-colors"
            >
              Open in New Tab
            </a>
          </div>
        )}

        {/* 4. Content Render Switch */}
        <div className="flex-1 min-h-0 bg-[#FBFBFB] dark:bg-[#111111] flex flex-col relative overflow-hidden">
          {activeTab === 'notebook' ? (
            <div className="flex-1 overflow-y-auto p-4 sm:p-8">
              <div className="max-w-7xl mx-auto">
                <NotesManager userId={user?.uid || 'guest'} onAddMessage={(type, content) => {
                  const newMsg: Message = { id: Date.now().toString(), type, content };
                  setMessages(prev => [...prev, newMsg]);
                }} />
              </div>
            </div>
          ) : (
            
            /* Chat window component container */
            <div className="flex-1 flex flex-col justify-between max-w-4xl mx-auto w-full min-h-0 overflow-hidden">
              
              {/* Dynamic scroll feed of conversation bubbles */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 min-h-0">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6 py-12">
                    <div className="w-16 h-16 bg-amber-500/15 text-amber-500 rounded-3xl flex items-center justify-center shadow-xl">
                      <GraduationCap className="w-8 h-8" />
                    </div>
                    <div>
                      <h2 className="text-xl font-extrabold tracking-tight mb-2">Welcome to EduAI Assistant</h2>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                        Your personalized tutoring environment for explaining complex theories, generating dynamic assessment tests, building revision guides, and managing custom notebook folders.
                      </p>
                    </div>

                    {/* Guest notice */}
                    {!user && (
                      <div className="w-full bg-white dark:bg-zinc-900 border border-gray-150 dark:border-zinc-800 p-4 rounded-2xl text-left text-xs space-y-2 shadow-xs">
                        <span className="font-bold block text-slate-700 dark:text-white">🚀 Dynamic Workspace Demo</span>
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          You are currently in **Guest Mode**. Your notes and conversation indexes will save temporarily in LocalStorage. Sign in using Google (safely configured from a New Tab) to persist logs securely across devices!
                        </p>
                        <div className="flex gap-2 pt-1.5 border-t border-gray-50 dark:border-zinc-800">
                          <button
                            onClick={handleLogin}
                            className="flex-1 py-2 bg-black dark:bg-white text-white dark:text-black font-extrabold rounded-lg text-[10.5px] hover:opacity-90 cursor-pointer"
                          >
                            Sign In
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Preconfigured starter queries */}
                    <div className="space-y-2 w-full text-left">
                      <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Sample Queries</p>
                      <button 
                        onClick={() => { setInput("Explain quantum superposition with physical analogies."); }}
                        className="w-full text-left p-3 text-xs bg-white dark:bg-zinc-900 hover:bg-slate-50 border border-gray-150 dark:border-zinc-850 rounded-xl transition-all flex items-center justify-between cursor-pointer"
                      >
                        <span>Explain quantum mechanical superposition</span>
                        <ChevronRight size={14} className="text-gray-400" />
                      </button>
                      <button 
                        onClick={() => { setInput("Generate quiz on foundational economics (4 questions)"); }}
                        className="w-full text-left p-3 text-xs bg-white dark:bg-zinc-900 hover:bg-slate-50 border border-gray-150 dark:border-zinc-850 rounded-xl transition-all flex items-center justify-between cursor-pointer"
                      >
                        <span>Interactive Quiz on Macroeconomics</span>
                        <ChevronRight size={14} className="text-gray-400" />
                      </button>
                    </div>

                  </div>
                ) : (
                  
                  /* List of chat conversation bubbles */
                  messages.map((msg, index) => {
                    const isAi = msg.type === 'ai';
                    return (
                      <div key={msg.id || index} className={`flex gap-4 ${isAi ? 'justify-start' : 'justify-end'}`}>
                        {isAi && (
                          <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-500 shrink-0 flex items-center justify-center font-bold text-xs shadow-xs animate-fade-in">
                            AI
                          </div>
                        )}
                        <div className={`max-w-[85%] rounded-3xl px-5 py-4.5 text-xs leading-relaxed space-y-3 font-sans ${
                          isAi 
                            ? 'bg-white dark:bg-[#1a1a1a] border border-slate-100 dark:border-zinc-850 text-slate-800 dark:text-zinc-200 shadow-xs' 
                            : 'bg-[#1a1a1a] text-white dark:bg-white dark:text-black font-medium shadow-sm'
                        }`}>
                          <div className="whitespace-pre-line text-left prose dark:prose-invert max-w-none">
                            {msg.content}
                          </div>

                          {/* Image vision uploads thumb context inline */}
                          {!isAi && msg.imageBase64 && (
                            <div className="my-2.5 max-w-xs rounded-xl overflow-hidden border border-zinc-800 shadow-md">
                              <img src={msg.imageBase64} alt="Student visual template" className="max-h-60 w-full object-cover" />
                            </div>
                          )}

                          {/* Image custom creation gallery inline */}
                          {isAi && msg.feature === 'image' && msg.data?.imageUrl && (
                            <div className="space-y-4 my-4">
                              <div className="group relative rounded-3xl overflow-hidden border border-gray-150 dark:border-zinc-800 shadow-xl max-w-sm mx-auto aspect-square bg-slate-50 dark:bg-zinc-950 flex items-center justify-center">
                                <img 
                                  src={msg.data.imageUrl} 
                                  alt={msg.data.imagePrompt || "EduAI artwork mockup"} 
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                  <a
                                    href={msg.data.imageUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2.5 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all cursor-pointer"
                                    title="Open drawing in original slot"
                                  >
                                    <ExternalLink size={16} />
                                  </a>
                                  <button
                                    onClick={() => {
                                      const link = document.createElement('a');
                                      link.href = msg.data.imageUrl;
                                      link.target = '_blank';
                                      link.setAttribute('download', `${msg.data.imagePrompt?.substring(0, 15) || 'study_sketch'}.png`);
                                      document.body.appendChild(link);
                                      link.click();
                                      document.body.removeChild(link);
                                    }}
                                    type="button"
                                    className="p-2.5 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all cursor-pointer"
                                    title="Download image"
                                  >
                                    <Download size={16} />
                                  </button>
                                </div>
                              </div>
                              
                              <div className="flex gap-2 justify-center max-w-sm mx-auto">
                                <button
                                  onClick={async () => {
                                    if (!user) {
                                      alert("Please authenticate to save visual drawings inside your student notes.");
                                      return;
                                    }
                                    try {
                                      const notesRef = collection(db, 'users', user.uid, 'notes');
                                      await addDoc(notesRef, {
                                        title: `Illustration: ${msg.data?.imagePrompt || 'Study Drawing'}`,
                                        content: `### Visual Asset Summary\nPrompt: "${msg.data?.imagePrompt}"\n\n![Illustration Image](${msg.data?.imageUrl})`,
                                        priority: 'medium',
                                        timestamp: Timestamp.now()
                                      });
                                      alert("Successfully persisted graphic study card in your notebook ledger!");
                                    } catch (err: any) {
                                      console.error("Notes attach error: ", err);
                                      alert("Failed to clip note: " + err.message);
                                    }
                                  }}
                                  type="button"
                                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10.5px] rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                                >
                                  <Bookmark size={13} />
                                  <span>Save to Notebook</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Render search grounding URLs if present */}
                          {msg.data?.sources && (
                            <div className="border-t border-slate-100 dark:border-zinc-800 pt-2 pb-0.5 space-y-1.5 text-[10.5px]">
                              <p className="font-bold text-slate-400 uppercase tracking-wider text-[9px]">Verified Search Citations:</p>
                              <div className="flex flex-wrap gap-1.5 font-mono text-left">
                                {msg.data.sources.map((src: any, sIdx: number) => (
                                  <a
                                    key={sIdx}
                                    href={src.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 dark:bg-zinc-850 hover:bg-amber-500/15 border border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-300 rounded-lg text-[10px] truncate max-w-[210px] cursor-pointer"
                                  >
                                    <ExternalLink size={8} />
                                    {src.title}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Dynamic Custom Action Toolbars */}
                          <div className="flex items-center justify-between border-t border-slate-100 dark:border-zinc-800/60 pt-3 mt-1.5 text-[10px] gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                onClick={() => handleSpeakMessage(msg.id || String(index), msg.content)}
                                type="button"
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all duration-200 cursor-pointer ${
                                  speakingMessageId === (msg.id || String(index))
                                    ? 'bg-amber-500/15 border-amber-500/35 text-amber-500 scale-95'
                                    : isAi
                                      ? 'bg-slate-50 border-slate-150 text-slate-500 hover:text-amber-500 hover:border-amber-500/30 dark:bg-zinc-850 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-amber-400'
                                      : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white dark:bg-zinc-150 dark:border-zinc-250 dark:text-zinc-700 dark:hover:text-black'
                                }`}
                                title={speakingMessageId === (msg.id || String(index)) ? 'Stop reading' : 'Listen to this message'}
                              >
                                {speakingMessageId === (msg.id || String(index)) ? (
                                  <>
                                    <VolumeX size={10} className="text-amber-500 animate-pulse shrink-0" />
                                    <span>Stop</span>
                                  </>
                                ) : (
                                  <>
                                    <Volume2 size={10} className="shrink-0" />
                                    <span>Speak</span>
                                  </>
                                )}
                              </button>

                              {/* Copy message content to clipboard */}
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(msg.content);
                                  alert("Copied text content safely to clipboard!");
                                }}
                                type="button"
                                className={`p-1.5 rounded-lg border border-slate-150 dark:border-zinc-800 hover:text-amber-500 dark:text-zinc-550 transition-colors cursor-pointer flex items-center justify-center ${
                                  isAi ? 'text-gray-400' : 'text-zinc-400 hover:text-zinc-100'
                                }`}
                                title="Copy content"
                              >
                                <Copy size={11} />
                              </button>

                              {/* Clip summary to active notes ledger */}
                              {isAi && (
                                <button
                                  onClick={async () => {
                                    if (!user) {
                                      alert("Please authenticate to store response summaries in your Study Notebook.");
                                      return;
                                    }
                                    try {
                                      const notesRef = collection(db, 'users', user.uid, 'notes');
                                      await addDoc(notesRef, {
                                        title: `AI Note: ${msg.content.substring(0, 30).trim()}...`,
                                        content: msg.content,
                                        priority: 'medium',
                                        timestamp: Timestamp.now()
                                      });
                                      alert("Durable study card note attached successfully!");
                                    } catch (err: any) {
                                      console.error(err);
                                      alert("Failed to clip: " + err.message);
                                    }
                                  }}
                                  type="button"
                                  className="p-1.5 rounded-lg border border-slate-150 dark:border-zinc-800 hover:text-emerald-500 text-gray-400 dark:text-zinc-550 dark:hover:text-emerald-400 transition-colors cursor-pointer flex items-center justify-center"
                                  title="Clip response to Notebook"
                                >
                                  <Bookmark size={11} />
                                </button>
                              )}

                              {/* Share dialog formats markdown summary */}
                              <button
                                onClick={() => {
                                  const lastStudMsg = messages[Math.max(0, index - 1)]?.content || "";
                                  const markdownPayload = `### EduAI Study dialogue\n**Student Query:** "${lastStudMsg}"\n\n**AI Mentor Summary:**\n${msg.content}`;
                                  navigator.clipboard.writeText(markdownPayload);
                                  alert("Shared study markdown payload copied directly to clipboard!");
                                }}
                                type="button"
                                className={`p-1.5 rounded-lg border border-slate-150 dark:border-zinc-800 hover:text-blue-500 transition-colors cursor-pointer flex items-center justify-center ${
                                  isAi ? 'text-gray-400 dark:text-zinc-550' : 'text-zinc-400 hover:text-zinc-100'
                                }`}
                                title="Share study dialogue"
                              >
                                <Share2 size={11} />
                              </button>

                              {/* Thumbs Up / Down Reactions */}
                              {isAi && (
                                <div className="flex items-center gap-1 pl-1 border-l border-slate-100 dark:border-zinc-800">
                                  <button
                                    onClick={() => {
                                      setLikedMessages(prev => ({
                                        ...prev,
                                        [msg.id]: prev[msg.id] === 'like' ? undefined as any : 'like'
                                      }));
                                    }}
                                    type="button"
                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                      likedMessages[msg.id] === 'like'
                                        ? 'text-emerald-500 bg-emerald-500/10'
                                        : 'text-gray-400 hover:text-emerald-550 hover:bg-gray-100 dark:hover:bg-zinc-800'
                                    }`}
                                    title="Thumbs Up"
                                  >
                                    <ThumbsUp size={11} className={likedMessages[msg.id] === 'like' ? "fill-emerald-500" : ""} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setLikedMessages(prev => ({
                                        ...prev,
                                        [msg.id]: prev[msg.id] === 'dislike' ? undefined as any : 'dislike'
                                      }));
                                    }}
                                    type="button"
                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                      likedMessages[msg.id] === 'dislike'
                                        ? 'text-red-500 bg-red-500/10'
                                        : 'text-gray-400 hover:text-red-550 hover:bg-gray-100 dark:hover:bg-zinc-800'
                                    }`}
                                    title="Thumbs Down"
                                  >
                                    <ThumbsDown size={11} className={likedMessages[msg.id] === 'dislike' ? "fill-red-500" : ""} />
                                  </button>
                                </div>
                              )}

                              {/* Regenerate Action (AI Last Bubble only!) */}
                              {isAi && index === messages.length - 1 && (
                                <button
                                  onClick={async () => {
                                    const userIndex = messages.map(m => m.type).lastIndexOf('user');
                                    if (userIndex !== -1) {
                                      const prevPrompt = messages[userIndex].content;
                                      setMessages(prev => prev.slice(0, userIndex + 1));
                                      setInput(prevPrompt);
                                      setTimeout(() => {
                                        handleSubmitMessage();
                                      }, 50);
                                    }
                                  }}
                                  type="button"
                                  className="p-1 px-2 rounded-lg border border-slate-150 dark:border-zinc-800 hover:text-amber-500 dark:text-zinc-550 dark:hover:text-amber-400 transition-all cursor-pointer flex items-center gap-1 text-[9px] uppercase font-extrabold"
                                  title="Regenerate answer"
                                >
                                  <Sparkles size={9} />
                                  <span>Regen</span>
                                </button>
                              )}

                              {/* Edit Query (User Bubble only!) */}
                              {!isAi && (
                                <button
                                  onClick={() => {
                                    setInput(msg.content);
                                    setMessages(prev => prev.slice(0, index));
                                  }}
                                  type="button"
                                  className="p-1 px-2 rounded-lg border border-zinc-800 hover:text-white dark:hover:text-black hover:bg-zinc-800 dark:hover:bg-gray-200 transition-colors cursor-pointer flex items-center gap-1 text-[9px] uppercase font-extrabold"
                                  title="Modify and resubmit"
                                >
                                  <Edit3 size={9} />
                                  <span>Edit</span>
                                </button>
                              )}
                            </div>

                            <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-zinc-500 font-extrabold select-none">
                              {isAi ? 'EduAI Reply' : 'You'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Render active study test overlay inline */}
                {activeQuiz && (
                  <div className="bg-white dark:bg-zinc-900 border-2 border-amber-500/20 max-w-lg mx-auto rounded-3xl p-6 shadow-xl space-y-5 text-left">
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 pb-3">
                      <span className="text-[10px] uppercase font-extrabold px-3 py-1 bg-amber-500/10 text-amber-500 rounded-full">
                        EduAI Assessment Quiz
                      </span>
                      {!showQuizResult && (
                        <span className="text-[11px] font-bold text-gray-400">
                          Question {currentQuizIndex + 1} of {activeQuiz.length}
                        </span>
                      )}
                    </div>

                    {!showQuizResult ? (
                      <div className="space-y-4">
                        <p className="font-bold text-sm text-slate-800 dark:text-white leading-relaxed">
                          {activeQuiz[currentQuizIndex].question}
                        </p>
                        <div className="space-y-2">
                          {activeQuiz[currentQuizIndex].options.map((option, optIdx) => (
                            <button
                              key={optIdx}
                              onClick={() => selectQuizAnswer(optIdx)}
                              className="w-full text-left p-3.5 border border-gray-200 dark:border-zinc-800 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-850 text-xs font-medium cursor-pointer transition-colors flex justify-between items-center"
                            >
                              <span>{option}</span>
                              <ChevronRight size={14} className="opacity-0 hover:opacity-100 text-gray-400" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 space-y-4">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full mb-2">
                          <CheckCircle2 size={36} />
                        </div>
                        <h4 className="font-extrabold text-lg">Test Complete!</h4>
                        <p className="text-xs text-gray-500">
                          You scored **{quizScore} out of {activeQuiz.length}** on this module.
                        </p>
                        
                        <div className="flex justify-center gap-2 pt-2">
                          <button
                            onClick={() => setActiveQuiz(null)}
                            className="px-5 py-2.5 bg-black dark:bg-white text-white dark:text-black font-bold text-xs rounded-xl hover:opacity-95 cursor-pointer"
                          >
                            Back to Study Room
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Submitting Loading indicators */}
                {isGenerating && (
                  <div className="flex gap-4 justify-start">
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-500 shrink-0 flex items-center justify-center font-bold text-xs animate-pulse">
                      AI
                    </div>
                    <div className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-850 px-5 py-4 rounded-2xl flex items-center gap-3">
                      <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                      <span className="text-[10.5px] text-gray-400 font-medium">EduAI is composing answer...</span>
                    </div>
                  </div>
                )}

                <div ref={chatBottomRef} />
              </div>

              {/* Chat bottom inputs and prompt wrappers */}
              <div className="p-4 sm:p-6 border-t border-gray-150 dark:border-zinc-900 bg-white dark:bg-[#151515] rounded-t-3xl shrink-0">
                
                {/* 1. Dynamic Suggested Questions Chips/Tags */}
                {messages.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3 animate-fade-in font-sans">
                    <button
                      onClick={() => setInput("Explain this with a real-world physical analogy 💡")}
                      type="button"
                      className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-gray-150 rounded-lg text-[10px] font-bold text-gray-750 dark:bg-zinc-900 dark:hover:bg-zinc-850 dark:border-zinc-850 dark:text-zinc-300 transition-all hover:scale-[1.01] cursor-pointer"
                    >
                      Real-world Analogy 💡
                    </button>
                    <button
                      onClick={() => setInput("Generate a quick 3-question evaluation quiz based on our discussion to test my academic understanding 📝")}
                      type="button"
                      className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-gray-150 rounded-lg text-[10px] font-bold text-gray-750 dark:bg-zinc-900 dark:hover:bg-zinc-850 dark:border-zinc-850 dark:text-zinc-300 transition-all hover:scale-[1.01] cursor-pointer"
                    >
                      Practice Quiz 📝
                    </button>
                    <button
                      onClick={() => setInput("Verify this with references and live search grounding 🔍")}
                      type="button"
                      className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-gray-150 rounded-lg text-[10px] font-bold text-gray-750 dark:bg-zinc-900 dark:hover:bg-zinc-850 dark:border-zinc-850 dark:text-zinc-300 transition-all hover:scale-[1.01] cursor-pointer"
                    >
                      Search Grounding 🔍
                    </button>
                    <button
                      onClick={() => setInput("Summarize the ultimate key takeaways into bullet points for quick exam preparation! 🎓")}
                      type="button"
                      className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-gray-150 rounded-lg text-[10px] font-bold text-gray-750 dark:bg-zinc-900 dark:hover:bg-zinc-850 dark:border-zinc-850 dark:text-zinc-300 transition-all hover:scale-[1.01] cursor-pointer"
                    >
                      Exam takeaways 🎓
                    </button>
                  </div>
                )}

                {/* 2. File attached tags preview bar */}
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3 font-sans">
                    {attachedFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-bold text-[10px] rounded-xl animate-fade-in shadow-xs">
                        {file.type === 'image' ? (
                          <img src={file.base64} alt="attached thumbnail" className="w-5 h-5 object-cover rounded-md" />
                        ) : (
                          <FileUp size={11} className="text-amber-550 shrink-0" />
                        )}
                        <span className="truncate max-w-[120px]">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                          className="text-gray-400 hover:text-red-500 pr-0.5 ml-1.5 font-extrabold cursor-pointer"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handleSubmitMessage} className="flex gap-2 items-center">
                  
                  {/* File attach button to trigger parser representing drag attachments */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-2.5 hover:bg-gray-100 dark:hover:bg-zinc-850 rounded-xl text-gray-400 dark:text-zinc-500 transition-colors cursor-pointer shrink-0 ${fileParsing ? 'animate-pulse' : ''}`}
                    title="Upload study summary, images or notes"
                  >
                    <FileUp size={18} />
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".txt,.md,.markdown,.json,.png,.jpg,.jpeg,.webp,.gif"
                    className="hidden"
                  />

                  <input
                    type="text"
                    required
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Enter academic prompt or question here..."
                    className="flex-1 bg-slate-50 dark:bg-zinc-900 px-4 py-3 rounded-xl border border-gray-150 dark:border-zinc-850 text-xs outline-none focus:border-black dark:focus:border-white transition-all placeholder:text-gray-400"
                  />

                  {/* Mic Audio recorder toggle */}
                  <button
                    type="button"
                    onClick={toggleVoiceMode}
                    className={`p-2.5 rounded-xl transition-all shrink-0 cursor-pointer ${
                      isVoiceActive 
                        ? 'bg-red-500 text-white shadow-md animate-pulse' 
                        : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-850'
                    }`}
                    title="Speak using browser speech recognizer"
                  >
                    {isVoiceActive ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>

                  <button
                    type="submit"
                    className="p-3 bg-black dark:bg-white text-white dark:text-black rounded-xl hover:scale-105 transition-transform flex items-center justify-center shrink-0 shadow-sm cursor-pointer"
                  >
                    <Send size={15} />
                  </button>

                </form>

                {/* 3. Hyperparameter Settings Panel Controller */}
                <div className="mt-3.5 pt-3.5 border-t border-gray-100 dark:border-zinc-850/50 flex items-center justify-between flex-wrap gap-2.5 text-[10px] font-sans">
                  <div className="flex items-center gap-4 flex-wrap">
                    {/* Model selector dropdown */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400 font-bold">Model:</span>
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="bg-slate-50 border border-gray-200 rounded-lg px-2 py-1 dark:bg-zinc-900 dark:border-zinc-800 text-[10px] font-bold outline-none text-slate-700 dark:text-zinc-300 cursor-pointer"
                      >
                        <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                        <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                      </select>
                    </div>

                    {/* Temperature slider */}
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-bold">Creativity:</span>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.1"
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        className="w-16 h-1 bg-gray-250 rounded-lg appearance-none cursor-pointer dark:bg-zinc-800 accent-amber-500"
                      />
                      <span className="font-mono text-amber-500 font-extrabold text-[9.5px]">{temperature}</span>
                    </div>

                    {/* Length parameters select list */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400 font-bold">Length:</span>
                      <select
                        value={responseLength}
                        onChange={(e) => setResponseLength(e.target.value as any)}
                        className="bg-slate-50 border border-gray-200 rounded-lg px-2 py-1 dark:bg-zinc-900 dark:border-zinc-800 text-[10px] font-bold outline-none text-slate-700 dark:text-zinc-300 cursor-pointer"
                      >
                        <option value="balanced">Balanced Output</option>
                        <option value="short">Short & Punchy</option>
                        <option value="long">Deep Academic Analysis</option>
                      </select>
                    </div>
                  </div>

                  {/* Web Grounding Toggle switch flag */}
                  <button
                    type="button"
                    onClick={() => setDeepSearchMode(!deepSearchMode)}
                    className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                      deepSearchMode
                        ? 'bg-amber-500/10 border-amber-500/35 text-amber-600 dark:text-amber-400 font-extrabold shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-zinc-905 dark:border-zinc-800 hover:text-slate-350'
                    }`}
                  >
                    <Globe size={11} className={deepSearchMode ? "animate-spin [animation-duration:8s]" : ""} />
                    <span>{deepSearchMode ? 'LIVE WEB ON' : 'Standard AI'}</span>
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>

      </div>

      {/* 5. Mobile Sidebar Navigation Drawer */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSidebarOpen(false)}
              className="absolute inset-0 bg-black"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-80 bg-white dark:bg-[#151515] h-full flex flex-col p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-gray-150 dark:border-zinc-850 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="bg-black dark:bg-white p-1 rounded-md text-white dark:text-black">
                    <GraduationCap size={16} />
                  </div>
                  <span className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-white">EduAI Menu</span>
                </div>
                <button onClick={() => setMobileSidebarOpen(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded">
                  <X size={18} />
                </button>
              </div>

              {/* Action Buttons */}
              <button
                onClick={handleNewChat}
                className="w-full flex items-center justify-center gap-2 p-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-850 rounded-xl text-xs font-bold"
              >
                <Plus size={15} />
                <span>START NEW CHAT</span>
              </button>

              {/* History logs */}
              <div className="flex-1 overflow-y-auto space-y-1">
                <p className="text-[10px] uppercase font-extrabold tracking-wider text-gray-400 px-1 mb-2">Saved Studies</p>
                {chats.map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => selectChat(chat)}
                    className="w-full text-left p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-850 text-xs truncate block"
                  >
                    {chat.title}
                  </button>
                ))}
              </div>

              {/* Drawer User profile info */}
              <div className="border-t border-gray-150 dark:border-zinc-850 pt-4 flex flex-col space-y-2">
                {user ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full" />
                      <span className="font-bold text-xs truncate max-w-[120px]">{user.displayName || 'Tutor Student'}</span>
                    </div>
                    <button onClick={handleLogout} className="p-1.5 text-red-500">
                      <LogOut size={16} />
                    </button>
                  </div>
                ) : (
                  <button onClick={handleLogin} className="w-full py-2.5 bg-black dark:bg-white text-white dark:text-black text-xs font-extrabold rounded-xl">
                    SIGN IN WITH GOOGLE
                  </button>
                )}
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. Settings and User Profile Drawer modal */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-zinc-800 max-w-sm w-full rounded-3xl p-6 shadow-2xl relative"
            >
              <button 
                onClick={() => setShowProfileModal(false)}
                className="absolute right-4 top-4 p-1 rounded-lg text-gray-400 hover:text-black dark:hover:text-white"
              >
                <X size={18} />
              </button>

              <div className="text-center space-y-3 pb-4 border-b border-gray-150 dark:border-zinc-800">
                <img 
                  src={user?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.uid || 'guest'}`} 
                  alt="Profile" 
                  className="w-16 h-16 rounded-full mx-auto bg-amber-50 border border-amber-300"
                />
                <div>
                  <h4 className="font-bold text-base">{user?.displayName || 'Tutor Student'}</h4>
                  <p className="text-xs text-gray-400">{user?.email || 'Offline Guest Mode active'}</p>
                </div>
              </div>

              <div className="py-4 space-y-4 text-xs text-left">
                <h5 className="font-extrabold uppercase tracking-wide text-[10px] text-gray-400">Student Log Metrics</h5>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-850 p-3 rounded-xl text-center">
                    <p className="text-lg font-bold text-amber-500">{chats.length}</p>
                    <p className="text-[10px] text-gray-450 mt-1">Study Threads</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-850 p-3 rounded-xl text-center">
                    <p className="text-lg font-bold text-amber-500">Secure</p>
                    <p className="text-[10px] text-gray-450 mt-1">Zero-Trust Rules</p>
                  </div>
                </div>
              </div>

              {/* Central Voice Settings Configurations */}
              <div className="py-3.5 space-y-3.5 text-xs text-left border-t border-b border-gray-150 dark:border-zinc-805 my-3 pt-3.5">
                <h5 className="font-extrabold uppercase tracking-wide text-[10px] text-gray-400">Speaker Voice Configurations</h5>
                
                {/* Speaking Speech speed rate slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-gray-405">Voice Speed Rate:</span>
                    <span className="text-amber-500 font-mono">{speakingSpeed}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={speakingSpeed}
                    onChange={(e) => setSpeakingSpeed(parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-250 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                {/* Speech synthesizers voices list */}
                {voices.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-405 font-bold block">Preferred Voice Accent:</label>
                    <select
                      value={selectedVoiceName || ''}
                      onChange={(e) => setSelectedVoiceName(e.target.value)}
                      className="w-full p-1.5 rounded-lg bg-slate-50 border border-gray-150 dark:bg-zinc-900 dark:border-zinc-800 text-[10px] font-bold outline-none cursor-pointer text-slate-700 dark:text-zinc-200"
                    >
                      {voices.map((v, i) => (
                        <option key={i} value={v.name}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-slate-800 dark:text-zinc-350 font-bold text-xs rounded-xl"
                >
                  Close Settings
                </button>
                {user && (
                  <button
                    onClick={() => {
                      setShowProfileModal(false);
                      handleLogout();
                    }}
                    className="px-4 py-2.5 bg-red-650 hover:bg-red-700 text-white font-bold text-xs rounded-xl"
                  >
                    Logout
                  </button>
                )}
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
