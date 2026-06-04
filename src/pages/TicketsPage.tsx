import { useState, useEffect, useCallback } from 'react';
import { LifeBuoy, Send, X, BookOpen } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { useAuthStore } from '../stores/authStore';
import { tickets, members, type SupportTicketRow, type SupportTicketReply } from '../lib/api';

const ADMIN_ROLES = ['condocorp_admin', 'platform_admin'] as const;

interface MemberOption {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export function TicketsPage() {
  const { activeCondoCorp, activeRole } = useAuthStore();
  const isAdmin = activeRole != null && ADMIN_ROLES.includes(activeRole as typeof ADMIN_ROLES[number]);

  const [ticketList, setTicketList] = useState<SupportTicketRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketRow | null>(null);
  const [replies, setReplies] = useState<SupportTicketReply[]>([]);
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [showKbModal, setShowKbModal] = useState(false);
  const [kbQuestion, setKbQuestion] = useState('');
  const [kbAnswer, setKbAnswer] = useState('');
  const [closing, setClosing] = useState(false);

  const loadTickets = useCallback(async () => {
    if (!activeCondoCorp) return;
    const data = await tickets.list(activeCondoCorp.id);
    setTicketList(data);
    setLoading(false);
  }, [activeCondoCorp]);

  const loadTicketDetail = useCallback(async (ticketId: string) => {
    if (!activeCondoCorp) return;
    const data = await tickets.get(activeCondoCorp.id, ticketId);
    setSelectedTicket(data.ticket);
    setReplies(data.replies);
  }, [activeCondoCorp]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!activeCondoCorp || !isAdmin) return;
    members.list(activeCondoCorp.id).then(data => {
      setMemberOptions(
        data.map(m => ({
          user_id: m.user_id,
          first_name: m.first_name,
          last_name: m.last_name,
          email: m.email,
        }))
      );
    }).catch(() => {});
  }, [activeCondoCorp, isAdmin]);

  useEffect(() => {
    if (selectedId) loadTicketDetail(selectedId);
    else {
      setSelectedTicket(null);
      setReplies([]);
    }
  }, [selectedId, loadTicketDetail]);

  const selectTicket = (id: string) => {
    setSelectedId(id);
    setReplyText('');
    setShowKbModal(false);
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCondoCorp || !selectedId || !replyText.trim()) return;
    setSending(true);
    try {
      await tickets.reply(activeCondoCorp.id, selectedId, replyText.trim());
      setReplyText('');
      await loadTicketDetail(selectedId);
      await loadTickets();
    } finally {
      setSending(false);
    }
  };

  const handleAssign = async (userId: string) => {
    if (!activeCondoCorp || !selectedId) return;
    await tickets.update(activeCondoCorp.id, selectedId, {
      assigned_to: userId || null,
      status: userId ? 'in_progress' : undefined,
    });
    await loadTicketDetail(selectedId);
    await loadTickets();
  };

  const startClose = () => {
    if (!selectedTicket) return;
    setKbQuestion(selectedTicket.question);
    setKbAnswer(replies.map(r => r.content).join('\n\n') || '');
    setShowKbModal(true);
  };

  const closeTicket = async (addToKnowledge: boolean) => {
    if (!activeCondoCorp || !selectedId) return;
    setClosing(true);
    try {
      await tickets.close(activeCondoCorp.id, selectedId, addToKnowledge
        ? { add_to_knowledge: true, kb_question: kbQuestion, kb_answer: kbAnswer }
        : { add_to_knowledge: false });
      setShowKbModal(false);
      await loadTicketDetail(selectedId);
      await loadTickets();
    } finally {
      setClosing(false);
    }
  };

  const creatorName = (t: SupportTicketRow) =>
    `${t.creator_first_name ?? ''} ${t.creator_last_name ?? ''}`.trim() || t.creator_email || 'Unknown';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 h-full flex flex-col max-w-6xl">
      <PageHeader
        title="Support"
        description={
          isAdmin
            ? 'Respond to resident questions, assign tickets, and close them when resolved.'
            : 'View your support requests and replies from your condo admin.'
        }
      />

      <div className="flex flex-1 gap-4 min-h-0">
        <div className="w-full md:w-80 shrink-0 border border-gray-200 rounded-xl bg-white overflow-hidden flex flex-col">
          <div className="p-3 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">
            {isAdmin ? 'All tickets' : 'My tickets'} ({ticketList.length})
          </div>
          <div className="flex-1 overflow-y-auto">
            {ticketList.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No support tickets yet.</p>
            ) : (
              ticketList.map(t => (
                <button
                  key={t.id}
                  onClick={() => selectTicket(t.id)}
                  className={`w-full text-left px-3 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    selectedId === t.id ? 'bg-primary-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900 truncate">{t.subject}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-xs text-gray-500 truncate">{t.question}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                    {isAdmin && ` · ${creatorName(t)}`}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 border border-gray-200 rounded-xl bg-white flex flex-col min-w-0">
          {!selectedTicket ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-500">
              <LifeBuoy className="text-gray-300 mb-3" size={40} />
              <p className="text-sm">Select a ticket to view details and respond.</p>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900">{selectedTicket.subject}</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      From {creatorName(selectedTicket)} ·{' '}
                      {formatDistanceToNow(new Date(selectedTicket.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <StatusBadge status={selectedTicket.status} />
                </div>
                <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">{selectedTicket.question}</p>

                {isAdmin && selectedTicket.status !== 'closed' && (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <label className="text-xs font-medium text-gray-500">Assign to</label>
                    <select
                      value={selectedTicket.assigned_to ?? ''}
                      onChange={e => handleAssign(e.target.value)}
                      className="text-sm border border-gray-300 rounded-lg px-2 py-1.5"
                    >
                      <option value="">Unassigned</option>
                      {memberOptions.map(m => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.first_name} {m.last_name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={startClose}
                      className="ml-auto px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                    >
                      Close ticket
                    </button>
                  </div>
                )}

                {selectedTicket.knowledge_added && (
                  <p className="mt-2 text-xs text-green-700 flex items-center gap-1">
                    <BookOpen size={12} /> Added to knowledge base
                  </p>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {replies.map(r => (
                  <div key={r.id} className="bg-gray-50 rounded-lg px-3 py-2.5">
                    <p className="text-xs font-medium text-gray-600 mb-1">
                      {r.first_name} {r.last_name}
                    </p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.content}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </p>
                  </div>
                ))}
              </div>

              {selectedTicket.status !== 'closed' && (
                <form onSubmit={sendReply} className="p-4 border-t border-gray-100 flex gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder={isAdmin ? 'Write a response…' : 'Add a follow-up…'}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    type="submit"
                    disabled={!replyText.trim() || sending}
                    className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    <Send size={18} />
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      {showKbModal && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Close ticket</h3>
              <button onClick={() => setShowKbModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Would you like to add this resolution to the knowledge base? It will be saved as an FAQ and indexed for the AI assistant.
            </p>
            <div className="space-y-3 mb-6">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Question</label>
                <input
                  value={kbQuestion}
                  onChange={e => setKbQuestion(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Answer</label>
                <textarea
                  value={kbAnswer}
                  onChange={e => setKbAnswer(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Enter the answer residents should see…"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => closeTicket(false)}
                disabled={closing}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Close without adding
              </button>
              <button
                onClick={() => closeTicket(true)}
                disabled={closing || !kbQuestion.trim() || !kbAnswer.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                Close and add to knowledge base
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
