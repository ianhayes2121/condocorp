import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, RotateCcw, GripVertical } from 'lucide-react';
import { questionPresets } from '../../lib/api';

interface QuestionPresetsEditorProps {
  mode: 'platform' | 'condocorp';
  condocorpId?: string;
  title?: string;
  description?: string;
}

export function QuestionPresetsEditor({
  mode,
  condocorpId,
  title = 'Suggested Questions',
  description = 'Preset questions shown on the Ask a Question screen',
}: QuestionPresetsEditorProps) {
  const [items, setItems] = useState<string[]>(['']);
  const [usingPlatformDefaults, setUsingPlatformDefaults] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'platform') {
        const data = await questionPresets.listPlatform();
        setItems(data.length > 0 ? data.map(p => p.text) : ['']);
        setUsingPlatformDefaults(false);
      } else if (condocorpId) {
        const data = await questionPresets.manage(condocorpId);
        setUsingPlatformDefaults(data.using_platform_defaults);
        setItems(data.presets.length > 0 ? data.presets.map(p => p.text) : ['']);
      }
    } catch {
      setError('Failed to load suggested questions');
    } finally {
      setLoading(false);
    }
  }, [mode, condocorpId]);

  useEffect(() => { load(); }, [load]);

  const updateItem = (index: number, value: string) => {
    setItems(prev => prev.map((item, i) => (i === index ? value : item)));
  };

  const addItem = () => setItems(prev => [...prev, '']);

  const removeItem = (index: number) => {
    setItems(prev => (prev.length <= 1 ? [''] : prev.filter((_, i) => i !== index)));
  };

  const save = async () => {
    const texts = items.map(t => t.trim()).filter(Boolean);
    if (texts.length === 0) {
      setError('Add at least one suggested question');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (mode === 'platform') {
        await questionPresets.updatePlatform(texts);
      } else if (condocorpId) {
        await questionPresets.update(condocorpId, texts);
        setUsingPlatformDefaults(false);
      }
      setItems(texts);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save suggested questions');
    } finally {
      setSaving(false);
    }
  };

  const resetToPlatformDefaults = async () => {
    if (!condocorpId || mode !== 'condocorp') return;
    setSaving(true);
    setError(null);
    try {
      const data = await questionPresets.reset(condocorpId);
      setUsingPlatformDefaults(true);
      setItems(data.presets.length > 0 ? data.presets.map(p => p.text) : ['']);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to reset to platform defaults');
    } finally {
      setSaving(false);
    }
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
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500 mt-1">{description}</p>
        {mode === 'condocorp' && usingPlatformDefaults && (
          <p className="text-sm text-primary-600 mt-2">
            Using platform default questions. Save changes to customize for your building.
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-3">{error}</p>
      )}

      <div className="space-y-2 mb-4">
        {items.map((text, index) => (
          <div key={index} className="flex items-center gap-2">
            <GripVertical size={16} className="text-gray-300 shrink-0" />
            <input
              type="text"
              value={text}
              onChange={e => updateItem(index, e.target.value)}
              placeholder="e.g. What are the pet policies?"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
            <button
              type="button"
              onClick={() => removeItem(index)}
              className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
              aria-label="Remove question"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Plus size={16} /> Add question
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          <Save size={16} /> {saving ? 'Saving...' : 'Save'}
        </button>
        {mode === 'condocorp' && !usingPlatformDefaults && (
          <button
            type="button"
            onClick={resetToPlatformDefaults}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RotateCcw size={16} /> Reset to platform defaults
          </button>
        )}
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </div>
  );
}
