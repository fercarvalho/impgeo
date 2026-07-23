import React, { useEffect, useState } from 'react';
import { X, Check, PencilLine } from 'lucide-react';
import { CATEGORIES_BY_TYPE } from '@/config/categorias';

// Tipos que NÃO têm categoria nem subcategoria no sistema.
const TYPES_WITHOUT_CATEGORY = ['Transferência entre contas', 'Reforço de caixa', 'Retirada de caixa'];
const ALL_TYPES = ['Receita', 'Despesa', 'Reforço de caixa', 'Retirada de caixa', 'Transferência entre contas'];

interface BulkUpdates {
  type?: string;
  category?: string;
  subcategory?: string;
}

interface Props {
  isOpen: boolean;
  count: number;
  subcategories: string[];
  onClose: () => void;
  onApply: (updates: BulkUpdates) => Promise<void>;
}

/**
 * Edição das transações selecionadas: aplica tipo, categoria e/ou subcategoria
 * em comum. Só os campos marcados são alterados. Tipos sem categoria
 * (transferência/caixa) escondem categoria/subcategoria.
 */
const BulkEditTransactionsModal: React.FC<Props> = ({ isOpen, count, subcategories, onClose, onApply }) => {
  const [applyType, setApplyType] = useState(false);
  const [applyCategory, setApplyCategory] = useState(false);
  const [applySubcategory, setApplySubcategory] = useState(false);
  const [type, setType] = useState('Despesa');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApplyType(false);
      setApplyCategory(false);
      setApplySubcategory(false);
      setType('Despesa');
      setCategory('');
      setSubcategory('');
      setSubmitting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) onClose(); };
    if (isOpen) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const typeIsCategoryless = applyType && TYPES_WITHOUT_CATEGORY.includes(type);
  const showCatFields = !typeIsCategoryless;

  const hasAction = applyType || (showCatFields && (applyCategory || applySubcategory));
  const categoryOk = !applyCategory || !showCatFields || !!category;
  const canApply = hasAction && categoryOk && !submitting;

  const handleApply = async () => {
    const updates: BulkUpdates = {};
    if (applyType) updates.type = type;
    if (showCatFields) {
      if (applyCategory) updates.category = category;
      if (applySubcategory) updates.subcategory = subcategory; // '' = limpar subcategoria
    }
    if (Object.keys(updates).length === 0) return;
    setSubmitting(true);
    try {
      await onApply(updates);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center px-4 pb-4 pt-[120px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[calc(100vh-160px)] overflow-y-auto border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30">
          <div className="flex items-center gap-2">
            <PencilLine className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Editar selecionadas</h2>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {count === 1 ? '1 transação selecionada' : `${count} transações selecionadas`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Marque o que você quer mudar. O que deixar desmarcado continua como está.
          </p>

          {/* Tipo */}
          <div>
            <label className="flex items-center gap-2 select-none">
              <input type="checkbox" checked={applyType} onChange={(e) => setApplyType(e.target.checked)} />
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Mudar tipo para</span>
            </label>
            {applyType && (
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="mt-2 ml-6 w-[calc(100%-1.5rem)] px-3 py-2 border border-gray-300 rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              >
                {ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </div>

          {/* Categoria */}
          {showCatFields && (
            <div>
              <label className="flex items-center gap-2 select-none">
                <input type="checkbox" checked={applyCategory} onChange={(e) => setApplyCategory(e.target.checked)} />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Definir categoria</span>
              </label>
              {applyCategory && (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={`mt-2 ml-6 w-[calc(100%-1.5rem)] px-3 py-2 border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 ${!category ? 'border-red-400' : 'border-gray-300'}`}
                >
                  <option value="">Selecione uma categoria</option>
                  {applyType && type === 'Receita' ? (
                    CATEGORIES_BY_TYPE.Receita.map((c) => <option key={c} value={c}>{c}</option>)
                  ) : applyType && type === 'Despesa' ? (
                    CATEGORIES_BY_TYPE.Despesa.map((c) => <option key={c} value={c}>{c}</option>)
                  ) : (
                    <>
                      <optgroup label="Receita">
                        {CATEGORIES_BY_TYPE.Receita.map((c) => <option key={`r-${c}`} value={c}>{c}</option>)}
                      </optgroup>
                      <optgroup label="Despesa">
                        {CATEGORIES_BY_TYPE.Despesa.map((c) => <option key={`d-${c}`} value={c}>{c}</option>)}
                      </optgroup>
                    </>
                  )}
                </select>
              )}
            </div>
          )}

          {/* Subcategoria */}
          {showCatFields && (
            <div>
              <label className="flex items-center gap-2 select-none">
                <input type="checkbox" checked={applySubcategory} onChange={(e) => setApplySubcategory(e.target.checked)} />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Definir subcategoria</span>
              </label>
              {applySubcategory && (
                <select
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  className="mt-2 ml-6 w-[calc(100%-1.5rem)] px-3 py-2 border border-gray-300 rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                >
                  <option value="">Sem subcategoria</option>
                  {subcategories.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </div>
          )}

          {typeIsCategoryless && (
            <p className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
              Transferência e movimentações de caixa não têm categoria nem subcategoria — esses campos serão limpos nas selecionadas.
            </p>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            Cancelar
          </button>
          <button
            onClick={handleApply}
            disabled={!canApply}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg shadow-sm"
          >
            <Check className="w-4 h-4" />
            {submitting ? 'Salvando...' : count === 1 ? 'Salvar alterações' : `Salvar nas ${count} transações`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkEditTransactionsModal;
