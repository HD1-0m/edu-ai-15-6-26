import React, { useState, useEffect } from 'react';
import { 
  db, 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  Timestamp, 
  setDoc,
  handleFirestoreError,
  OperationType,
  cleanUndefined
} from '../firebase';
import { 
  FolderPlus, 
  FileText, 
  Trash2, 
  Plus, 
  Folder, 
  FolderOpen, 
  Search, 
  FileEdit,
  Tag,
  Download
} from 'lucide-react';

interface FolderItem {
  id: string;
  name: string;
}

interface NoteItem {
  id: string;
  title: string;
  content: string;
  priority: 'low' | 'medium' | 'high';
  folderId?: string;
  timestamp: Timestamp;
}

interface NotesManagerProps {
  userId: string;
  onAddMessage: (type: 'user' | 'ai', content: string) => void;
}

export const NotesManager: React.FC<NotesManagerProps> = ({ userId, onAddMessage }) => {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  
  // Forms & Selections
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderModal, setShowFolderModal] = useState(false);
  
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [notePriority, setNotePriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Sync Folders from Firestore
  useEffect(() => {
    if (!userId) return;

    const foldersRef = collection(db, 'users', userId, 'folders');
    const q = query(foldersRef, orderBy('name', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const folderList = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || 'Untitled'
      }));
      setFolders(folderList);
    }, (error) => {
      console.error("Folders subscription error:", error);
    });

    return () => unsubscribe();
  }, [userId]);

  // 2. Sync Notes from Firestore
  useEffect(() => {
    if (!userId) return;

    const notesRef = collection(db, 'users', userId, 'notes');
    const q = query(notesRef, orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const noteList = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title || 'Untitled Note',
          content: data.content || '',
          priority: (data.priority as 'low' | 'medium' | 'high') || 'medium',
          folderId: data.folderId || undefined,
          timestamp: data.timestamp || Timestamp.now()
        };
      });
      setNotes(noteList);
    }, (error) => {
      console.error("Notes subscription error:", error);
    });

    return () => unsubscribe();
  }, [userId]);

  // 3. Folder CRUD Setup
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      const foldersRef = collection(db, 'users', userId, 'folders');
      await addDoc(foldersRef, {
        name: newFolderName.trim()
      });
      setNewFolderName('');
      setShowFolderModal(false);
      onAddMessage('ai', `Folder **${newFolderName.trim()}** was created in your notebook.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}/folders`);
    }
  };

  const handleDeleteFolder = async (folderId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete folder "${name}"? Notes inside will become uncategorized.`)) return;

    try {
      const folderDocRef = doc(db, 'users', userId, 'folders', folderId);
      await deleteDoc(folderDocRef);
      if (selectedFolderId === folderId) setSelectedFolderId(null);
      onAddMessage('ai', `Folder **${name}** and note categorizations were removed.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${userId}/folders/${folderId}`);
    }
  };

  // 4. Note CRUD Setup
  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) return;

    try {
      const notesRef = collection(db, 'users', userId, 'notes');
      
      if (editingNoteId) {
        // Update existing note
        const noteDocRef = doc(db, 'users', userId, 'notes', editingNoteId);
        await setDoc(noteDocRef, cleanUndefined({
          title: noteTitle.trim(),
          content: noteContent.trim(),
          priority: notePriority,
          folderId: selectedFolderId || undefined,
          timestamp: Timestamp.now()
        }), { merge: true });
        
        onAddMessage('ai', `Note **${noteTitle.trim()}** updated successfully.`);
        setEditingNoteId(null);
      } else {
        // Create new note
        await addDoc(notesRef, cleanUndefined({
          title: noteTitle.trim(),
          content: noteContent.trim(),
          priority: notePriority,
          folderId: selectedFolderId || undefined,
          timestamp: Timestamp.now()
        }));
        onAddMessage('ai', `Created new note: **${noteTitle.trim()}**.`);
      }

      // Reset Form Fields
      setNoteTitle('');
      setNoteContent('');
      setNotePriority('medium');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}/notes`);
    }
  };

  const handleEditNote = (note: NoteItem) => {
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNotePriority(note.priority);
    if (note.folderId) {
      setSelectedFolderId(note.folderId);
    }
  };

  const handleDeleteNote = async (noteId: string, title: string) => {
    if (!window.confirm(`Confirm deleting note "${title}"?`)) return;

    try {
      const noteDocRef = doc(db, 'users', userId, 'notes', noteId);
      await deleteDoc(noteDocRef);
      if (editingNoteId === noteId) {
        setEditingNoteId(null);
        setNoteTitle('');
        setNoteContent('');
      }
      onAddMessage('ai', `Deleted study note: **${title}**.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${userId}/notes/${noteId}`);
    }
  };

  const downloadNoteAsMarkdown = (note: NoteItem) => {
    const markdownContent = `# ${note.title}\n\n*Created on: ${note.timestamp.toDate().toLocaleString()}*\n*Priority: ${note.priority.toUpperCase()}*\n\n---\n\n${note.content}`;
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${note.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter notes predicated on searched criteria or sidebar folder selections
  const filteredNotes = notes.filter(n => {
    const matchesFolder = selectedFolderId === null || n.folderId === selectedFolderId;
    const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          n.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-[500px]">
      
      {/* 1. Folders Sidebar */}
      <div className="lg:col-span-1 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col space-y-4">
        
        <div className="flex items-center justify-between border-b border-gray-150 dark:border-zinc-800 pb-3">
          <h3 className="font-bold text-sm tracking-tight flex items-center gap-2">
            <FolderOpen size={16} className="text-amber-500" />
            Notebook Folders
          </h3>
          <button 
            onClick={() => setShowFolderModal(true)} 
            className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg text-gray-500 hover:text-black dark:hover:text-white transition-colors"
            title="Create Folder"
          >
            <FolderPlus size={16} />
          </button>
        </div>

        {/* List of folders */}
        <div className="space-y-1 overflow-y-auto max-h-[300px]">
          <button
            onClick={() => setSelectedFolderId(null)}
            className={`w-full flex items-center justify-between text-left px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
              selectedFolderId === null 
                ? 'bg-black text-white dark:bg-white dark:text-black' 
                : 'hover:bg-gray-100 dark:hover:bg-zinc-850 text-gray-700 dark:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <FolderOpen size={14} />
              All General Notes
            </span>
            <span className="text-[10px] opacity-70">({notes.length})</span>
          </button>

          {folders.map(folder => {
            const folderCount = notes.filter(n => n.folderId === folder.id).length;
            return (
              <div key={folder.id} className="group flex items-center justify-between gap-1 w-full rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-850 transition-all pr-1">
                <button
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={`flex-1 text-left px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap overflow-hidden text-ellipsis ${
                    selectedFolderId === folder.id 
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border-l-2 border-amber-500' 
                      : 'text-gray-650 dark:text-gray-400'
                  }`}
                >
                  <span className="flex items-center gap-2 overflow-hidden text-ellipsis">
                    <Folder size={14} className={selectedFolderId === folder.id ? 'text-amber-500' : 'text-gray-400'} />
                    {folder.name}
                  </span>
                </button>
                <div className="flex items-center">
                  <span className="text-[10px] text-gray-400 pr-1 group-hover:hidden">{folderCount}</span>
                  <button
                    onClick={() => handleDeleteFolder(folder.id, folder.name)}
                    className="hidden group-hover:inline-block p-1 text-gray-400 hover:text-red-500 rounded-md"
                    title="Delete Folder"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Notes Editor & List Grid */}
      <div className="lg:col-span-3 space-y-6">
        
        {/* Top bar supporting note searches */}
        <div className="flex flex-col md:flex-row items-center gap-4 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-zinc-800 p-4 rounded-2xl">
          <div className="relative w-full md:flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search through study sheets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs outline-none focus:border-black dark:focus:border-white transition-all placeholder:text-gray-500"
            />
          </div>
          <p className="text-[11px] font-semibold text-gray-400 whitespace-nowrap shrink-0">
            Showing {filteredNotes.length} item(s) in active notebook
          </p>
        </div>

        {/* Two pane setup: Left editor, Right feed */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Form Composer */}
          <form onSubmit={handleSaveNote} className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
            <h4 className="font-bold text-xs uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <Plus size={14} />
              {editingNoteId ? 'Edit Draft Note' : 'Compose Study Note'}
            </h4>

            <div>
              <input
                type="text"
                placeholder="Note Title * (e.g., Einstein Field Equations)"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                required
                className="w-full px-3 py-2 hover:bg-gray-50/50 dark:hover:bg-zinc-850 bg-white dark:bg-zinc-900 border border-gray-150 dark:border-zinc-800 rounded-xl text-xs outline-none focus:border-black dark:focus:border-white transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-450 dark:text-zinc-500 uppercase tracking-wider mb-1">Priority</label>
                <select
                  value={notePriority}
                  onChange={(e) => setNotePriority(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-150 dark:border-zinc-800 rounded-xl text-xs outline-none focus:border-black dark:focus:border-white transition-all"
                >
                  <option value="low">Low Study Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High priority Exam</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-450 dark:text-zinc-500 uppercase tracking-wider mb-1">Active Folder</label>
                <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-50 dark:bg-zinc-850 border border-gray-150 dark:border-zinc-800 w-full rounded-xl text-xs truncate">
                  <Folder size={12} className="text-amber-500 shrink-0" />
                  <span className="truncate">
                    {selectedFolderId ? folders.find(f => f.id === selectedFolderId)?.name : 'General Notes'}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <textarea
                placeholder="Write your thesis, summaries, or prompts here... (Supports Markdown)"
                rows={6}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                required
                className="w-full px-3 py-2 hover:bg-gray-50/50 dark:hover:bg-zinc-850 bg-white dark:bg-zinc-900 border border-gray-150 dark:border-zinc-800 rounded-xl text-xs outline-none focus:border-black dark:focus:border-white transition-all resize-none font-mono"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              {editingNoteId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingNoteId(null);
                    setNoteTitle('');
                    setNoteContent('');
                    setNotePriority('medium');
                  }}
                  className="bg-gray-100 hover:bg-gray-250 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 text-xs px-4 py-2.5 rounded-xl font-bold cursor-pointer transition-all"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className="bg-black hover:scale-[1.02] dark:bg-white text-white dark:text-black text-xs px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                {editingNoteId ? 'Update Note' : 'Save Note'}
              </button>
            </div>
          </form>

          {/* Action Feed of notes */}
          <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
            {filteredNotes.length === 0 ? (
              <div className="h-40 border border-dashed border-gray-200 dark:border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-center p-6 bg-white dark:bg-zinc-900/50">
                <FileText className="text-gray-350 dark:text-zinc-700 w-8 h-8 mb-2" />
                <p className="text-xs font-semibold text-gray-500">No notes found here</p>
                <p className="text-[10px] text-gray-400 mt-1">Select folders or start typing to populate notes.</p>
              </div>
            ) : (
              filteredNotes.map(note => {
                const badgeColor = 
                  note.priority === 'high' 
                    ? 'bg-red-50 text-red-500 dark:bg-red-950/30' 
                    : note.priority === 'medium'
                      ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/20'
                      : 'bg-green-50 text-green-500 dark:bg-green-950/20';

                return (
                  <div key={note.id} className="group bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3 shadow-xs hover:shadow-md transition-all relative">
                    <div className="flex items-start justify-between gap-4">
                      <div className="overflow-hidden">
                        <span className={`inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
                          <Tag size={8} />
                          {note.priority} Priority
                        </span>
                        <h5 className="font-bold text-sm tracking-tight text-gray-800 dark:text-zinc-100 mt-1.5 truncate">{note.title}</h5>
                        <p className="text-[10px] text-gray-450 mt-0.5">{note.timestamp.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      
                      <div className="flex opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity gap-1 shrink-0">
                        <button
                          onClick={() => downloadNoteAsMarkdown(note)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-850 rounded text-gray-450 hover:text-black dark:hover:text-white transition-colors"
                          title="Download Markdown"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={() => handleEditNote(note)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-850 rounded text-gray-450 hover:text-amber-500 transition-colors"
                          title="Edit Note"
                        >
                          <FileEdit size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.id, note.title)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-850 rounded text-gray-450 hover:text-red-500 transition-colors"
                          title="Delete Note"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="text-xs text-gray-500 dark:text-zinc-400 line-clamp-3 overflow-hidden font-sans border-t border-gray-50 dark:border-zinc-800 pt-2 whitespace-pre-line leading-relaxed">
                      {note.content}
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>

      </div>

      {/* 3. Folder Creation popup dialog */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-zinc-800 w-full max-w-sm rounded-2xl p-5 shadow-2xl relative">
            <h4 className="font-bold text-sm mb-4 tracking-tight">Create Notebook Folder</h4>
            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <input
                  type="text"
                  placeholder="Folder Name (e.g., Computer Science)"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3 py-2 hover:bg-gray-50/50 dark:hover:bg-zinc-850 bg-white dark:bg-zinc-900 border border-gray-150 dark:border-zinc-800 rounded-xl text-xs outline-none focus:border-black dark:focus:border-white transition-all"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setNewFolderName('');
                    setShowFolderModal(false);
                  }}
                  className="bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 text-xs px-4 py-2 rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-black dark:bg-white text-white dark:text-black text-xs px-4 py-2 rounded-lg font-semibold transition-all hover:opacity-90"
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
