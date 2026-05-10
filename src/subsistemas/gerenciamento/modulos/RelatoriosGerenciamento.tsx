import { FileText, Download, Eye, FolderOpen, Briefcase, Users, MapPin, Clock } from 'lucide-react';

/**
 * Shell de Relatórios de Gerenciamento (fase 1.7).
 *
 * Lista os relatórios operacionais previstos. Quando o backend tiver os
 * endpoints de geração, cada card vira um botão funcional que dispara
 * download (PDF/Excel) ou preview em tela.
 */
export default function RelatoriosGerenciamento() {
  const relatorios = [
    {
      id: 'projetos-por-status',
      titulo: 'Projetos por status',
      descricao: 'Listagem completa agrupada por status (ativo, pausado, concluído) com data de início e fim.',
      icon: FolderOpen,
    },
    {
      id: 'projetos-por-cliente',
      titulo: 'Projetos por cliente',
      descricao: 'Quantidade de projetos, valor total e situação de cada cliente.',
      icon: Users,
    },
    {
      id: 'servicos-mais-vendidos',
      titulo: 'Serviços mais utilizados',
      descricao: 'Ranking dos serviços que mais aparecem em projetos no período selecionado.',
      icon: Briefcase,
    },
    {
      id: 'clientes-por-regiao',
      titulo: 'Clientes por região',
      descricao: 'Distribuição geográfica dos clientes (estado/cidade) com totalizadores.',
      icon: MapPin,
    },
    {
      id: 'projetos-por-prazo',
      titulo: 'Projetos por prazo',
      descricao: 'Projetos próximos do vencimento, no prazo e atrasados, com filtro por urgência.',
      icon: Clock,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          Relatórios de Gerenciamento
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Relatórios operacionais cruzando projetos, serviços e clientes.
        </p>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {relatorios.map(rel => {
          const Icon = rel.icon;
          return (
            <li key={rel.id}>
              <article className="h-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 border-l-4 border-l-violet-500 p-5 flex flex-col">
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight pt-0.5">
                    {rel.titulo}
                  </h3>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-4 flex-1">
                  {rel.descricao}
                </p>
                <div className="pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2">
                  <button
                    type="button"
                    disabled
                    title="Disponível em breve"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Visualizar
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Disponível em breve"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Exportar
                  </button>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-400 flex items-start gap-3">
        <FileText className="h-5 w-5 flex-shrink-0 mt-0.5 text-gray-400" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Geração de relatórios em desenvolvimento</p>
          <p className="text-xs leading-relaxed">
            Os layouts e filtros estão prontos. A próxima entrega ativa a geração
            (PDF/Excel) e a visualização em tela.
          </p>
        </div>
      </div>
    </div>
  );
}
