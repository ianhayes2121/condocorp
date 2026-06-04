import { useState, useEffect, useCallback } from 'react';
import { Save, RotateCcw } from 'lucide-react';
import { platformLlmPrompt } from '../../lib/api';

export function LlmPromptEditor() {
  const [template, setTemplate] = useState('');
  const [defaultTemplate, setDefaultTemplate] = useState('');
  const [contextPlaceholder, setContextPlaceholder] = useState('{{context}}');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await platformLlmPrompt.get();
      setTemplate(data.template);
      setDefaultTemplate(data.default_template);
      setContextPlaceholder(data.context_placeholder);
      setUpdatedAt(data.updated_at);
    } catch {
      setError('Failed to load LLM prompt');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const trimmed = template.trim();
    if (!trimmed) {
      setError('Prompt template cannot be empty');
      return;
    }
    if (!trimmed.includes(contextPlaceholder)) {
      setError(`Prompt must include ${contextPlaceholder} where documentation context is inserted`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const data = await platformLlmPrompt.update(trimmed);
      setTemplate(data.template);
      setUpdatedAt(data.updated_at);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save LLM prompt');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = () => {
    setTemplate(defaultTemplate);
    setError(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900">LLM System Prompt</h3>
        <p className="text-sm text-gray-500 mt-1">
          Instructions sent to the AI for every Ask a Question response across all CondoCorps.
          Include <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{contextPlaceholder}</code> where
          retrieved documentation and FAQs should be inserted.
        </p>
        {updatedAt && (
          <p className="text-xs text-gray-400 mt-2">
            Last updated {new Date(updatedAt).toLocaleString()}
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-3">{error}</p>
      )}

      <textarea
        value={template}
        onChange={e => setTemplate(e.target.value)}
        rows={14}
        spellCheck={false}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-y"
      />

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          <Save size={16} /> {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={resetToDefault}
          disabled={saving}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <RotateCcw size={16} /> Reset to default
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </div>
  );
}
