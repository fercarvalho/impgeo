import { Construction } from 'lucide-react';

/**
 * Placeholder para módulos cujo schema/manifesto/permissão já existe mas o
 * conteúdo (componente da página) ainda não foi entregue.
 *
 * Usado nos 4 módulos novos do subsistema gerenciamento na fase 1.4 — fase 1.7
 * substitui isto por shells funcionais com o design system.
 */
interface Props {
  titulo: string;
  descricao: string;
  faseEntrega: string;
}

export default function ModuloEmConstrucao({ titulo, descricao, faseEntrega }: Props) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 mb-4">
          <Construction className="h-7 w-7" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {titulo}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 max-w-xl mx-auto">
          {descricao}
        </p>
        <p className="inline-block text-xs font-mono px-3 py-1 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          Entrega prevista: fase {faseEntrega}
        </p>
      </div>
    </div>
  );
}
