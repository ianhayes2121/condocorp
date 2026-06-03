import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, Save } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { useAuthStore } from '../stores/authStore';
import { faqs } from '../lib/api';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  created_at: string;
}

export function FaqsPage() {
  const { activeCondoCorp } = useAuthStore();
  const [faqList, setFaqList] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const loadFaqs = useCallback(async () => {
    if (!activeCondoCorp) return;
    const data = await faqs.list(activeCondoCorp.id);
    setFaqList(data);
    setLoading(false);
  }, [activeCondoCorp]);

  useEffect(() => { loadFaqs(); }, [loadFaqs]);

  const saveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCondoCorp) return;

    if (editingFaq) {
      await faqs.update(activeCondoCorp.id, editingFaq.id, question, answer);
    } else {
      await faqs.create(activeCondoCorp.id, question, answer);
    }
    resetForm();
    loadFaqs();
  };

  const deleteFaq = async (id: string) => {
    if (!activeCondoCorp) return;
    await faqs.delete(activeCondoCorp.id, id);
    loadFaqs();
  };

  const startEdit = (faq: FaqItem) => {
    setEditingFaq(faq);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingFaq(null);
    setQuestion('');
    setAnswer('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <PageHeader
        title="FAQs"
        description="Manage frequently asked questions"
        action={
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus size={16} /> Add FAQ
          </button>
        }
      />

      {showForm && (
        <form onSubmit={saveFaq} className="mb-6 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              {editingFaq ? 'Edit FAQ' : 'New FAQ'}
            </h3>
            <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
              <input
                type="text"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                placeholder="Enter the frequently asked question"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Answer</label>
              <textarea
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                required
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
                placeholder="Enter the answer"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
              >
                <Save size={16} /> {editingFaq ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {faqList.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
            No FAQs created yet
          </div>
        ) : (
          faqList.map(faq => (
            <div key={faq.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 mb-2">{faq.question}</h4>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{faq.answer}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(faq)}
                    className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-primary-50 transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => deleteFaq(faq.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
