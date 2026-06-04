import { useState, useEffect, useRef } from 'react';
import { Send, Plus, Copy, Check, FileText, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuthStore } from '../stores/authStore';
import { chat, questionPresets } from '../lib/api';
import type { SourceCitation } from '../types';
import { formatDistanceToNow } from 'date-fns';

interface ConversationItem {
  id: string;
  created_at: string;
}

interface MessageItem {
  id: string;
  role: string;
  content: string;
  sources?: SourceCitation[];
  created_at: string;
}

const FALLBACK_SUGGESTED_QUESTIONS = [
  'What are the pet policies in our building?',
  'What are the parking rules?',
  'When is the next annual general meeting?',
  'What is the noise bylaw?',
  'How do I submit a maintenance request?',
  'What are the move-in/move-out procedures?',
];

export function ChatPage() {
  const { activeCondoCorp } = useAuthStore();
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>(FALLBACK_SUGGESTED_QUESTIONS);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeCondoCorp) return;
    chat.conversations(activeCondoCorp.id).then(setConversations).catch(() => {});
  }, [activeCondoCorp]);

  useEffect(() => {
    if (!activeCondoCorp) return;
    questionPresets.list(activeCondoCorp.id)
      .then(data => {
        const texts = data.presets.map(p => p.text);
        if (texts.length > 0) setSuggestedQuestions(texts);
      })
      .catch(() => setSuggestedQuestions(FALLBACK_SUGGESTED_QUESTIONS));
  }, [activeCondoCorp]);

  useEffect(() => {
    if (!activeConversation) { setMessages([]); return; }
    chat.messages(activeConversation.id).then(data => {
      setMessages(data as MessageItem[]);
    }).catch(() => {});
  }, [activeConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const createConversation = async () => {
    if (!activeCondoCorp) return null;
    const data = await chat.createConversation(activeCondoCorp.id);
    setConversations(prev => [data, ...prev]);
    setActiveConversation(data);
    return data;
  };

  const sendMessage = async (text?: string) => {
    const content = text ?? input.trim();
    if (!content || sending || !activeCondoCorp) return;

    setSending(true);
    setInput('');

    let convo = activeConversation;
    if (!convo) {
      convo = await createConversation();
      if (!convo) { setSending(false); return; }
    }

    const userMsg: MessageItem = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const data = await chat.ask(activeCondoCorp.id, convo.id, content);

      const assistantMsg: MessageItem = {
        id: data.message_id ?? crypto.randomUUID(),
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      const errorMsg: MessageItem = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your question. Please try again.',
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex h-full">
      {showSidebar && (
        <div className="w-64 border-r border-gray-200 bg-white flex flex-col shrink-0">
          <div className="p-3 border-b border-gray-200">
            <button
              onClick={() => { setActiveConversation(null); setMessages([]); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
            >
              <Plus size={16} /> New Conversation
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveConversation(c)}
                className={`w-full text-left px-3 py-2.5 text-sm border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  activeConversation?.id === c.id ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="shrink-0" />
                  <span className="truncate">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col">
        <div className="p-3 border-b border-gray-200 bg-white flex items-center gap-2">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <MessageSquare size={18} />
          </button>
          <h2 className="text-sm font-medium text-gray-700">
            {activeCondoCorp?.name ?? ''} Knowledge Assistant
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !sending && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mb-4">
                <MessageSquare className="text-primary-600" size={32} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">How can I help?</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-md">
                Ask me anything about your condo's bylaws, rules, policies, and more.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg">
                {suggestedQuestions.map(q => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-left px-3 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-primary-300 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-900'
                }`}
              >
                <div className="text-sm prose prose-sm max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>

                {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="text-xs font-medium text-gray-500 mb-1.5">Sources:</div>
                    {msg.sources.map((src, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                        <FileText size={12} />
                        <span>{src.document_title} (chunk {src.chunk_number})</span>
                        <span className="text-gray-300">
                          {Math.round(src.similarity * 100)}% match
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {msg.role === 'assistant' && (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => copyToClipboard(msg.content, msg.id)}
                      className="p-1 text-gray-300 hover:text-gray-500 transition-colors"
                    >
                      {copiedId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-gray-200 bg-white">
          <form
            onSubmit={e => { e.preventDefault(); sendMessage(); }}
            className="flex gap-2 max-w-3xl mx-auto"
          >
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask a question about your condo..."
              disabled={sending}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
