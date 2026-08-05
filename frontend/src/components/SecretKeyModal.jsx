import { useState, useEffect, useRef } from 'react';

export function SecretKeyModal({ isOpen, onClose, onSubmit }) {
  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setKeyInput('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!keyInput.trim()) return;

    setIsSubmitting(true);
    setError('');

    try {
      const success = await onSubmit(keyInput.trim());
      if (success) {
        onClose();
      } else {
        setError('Invalid secret key. Access denied.');
      }
    } catch (err) {
      setError(err.message || 'Verification failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 text-white font-mono relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          ✕
        </button>

        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">🔑</span>
          <h2 className="text-lg font-bold tracking-wide">Enter Secret Key</h2>
        </div>

        <p className="text-xs text-gray-400 mb-5 leading-relaxed">
          Provide your VIP secret key to activate zero-wait-time cooldown bypass.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Secret Passkey..."
              className="w-full bg-gray-950 border border-gray-800 focus:border-amber-500 rounded px-3 py-2 text-sm text-white focus:outline-none transition-colors placeholder:text-gray-600"
            />
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded px-3 py-2">
              ⚠️ {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !keyInput.trim()}
              className="px-4 py-1.5 text-xs font-semibold rounded bg-amber-500 hover:bg-amber-400 text-black font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Verifying...' : 'Unlock Bypass'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
