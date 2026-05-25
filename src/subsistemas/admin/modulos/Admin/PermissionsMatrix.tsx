// =============================================================================
// PermissionsMatrix — UI granular de permissões (Fase 2.3)
// =============================================================================
//
// Substitui o grid de checkboxes simples (enabled/disabled) por uma matriz
// agrupada por subsistema (módulo macro), onde cada submódulo tem 3 níveis:
//   ○ Sem acesso  ○ Ver  ○ Editar
//
// Header de cada subsistema permite "marcar tudo" em qualquer dos 3 níveis
// (bulk apply). Botão "Resetar para defaults da role" reaplica a tabela
// canônica.
//
// Hookado nos endpoints da Fase 2.1:
//   GET    /api/admin/users/:id/permissions
//   PUT    /api/admin/users/:id/permissions
//   POST   /api/admin/users/:id/permissions/reset
//   POST   /api/admin/users/:id/permissions/bulk-subsystem
//
// O componente é controlado pelo pai via prop `permissions` + onChange.
// Carregamento/salvamento ficam fora — facilita testes e reuso.
// =============================================================================

import React, { useMemo } from 'react';
import { RotateCcw, AlertCircle } from 'lucide-react';
import { SUBSYSTEMS, type SubsystemDefinition } from '@/subsistemas/manifest';

export type AccessLevel = 'view' | 'edit';

export interface ModulePermission {
  moduleKey: string;
  moduleName: string;
  subsystemKey: string;
  accessLevel: AccessLevel | null; // null = sem acesso
}

interface PermissionsMatrixProps {
  /** Matriz atual (vinda do GET /permissions). */
  permissions: ModulePermission[];
  /** Callback quando o usuário muda a matriz. */
  onChange: (next: ModulePermission[]) => void;
  /** Callback "resetar para defaults da role atual". Async para feedback. */
  onResetToDefaults: () => Promise<void> | void;
  /** Indica que ações estão em andamento (desabilita controles). */
  isBusy?: boolean;
  /**
   * Map de moduleKey → motivo para bloquear (ex.: módulos exclusivos do
   * superadmin que aparecem para admin como "🔒 Só superadmin"). Quando
   * presente, o radio fica disabled e a linha fica esmaecida.
   */
  lockedReasons?: Record<string, string>;
}

const LEVELS: Array<{ value: AccessLevel | null; label: string }> = [
  { value: null,   label: 'Sem acesso' },
  { value: 'view', label: 'Ver' },
  { value: 'edit', label: 'Editar' },
];

// Computa o "estado bulk" de um subsistema (todos no mesmo nível, ou misto).
function getSubsystemBulkState(perms: ModulePermission[]): AccessLevel | null | 'mixed' {
  if (perms.length === 0) return null;
  const first = perms[0].accessLevel;
  const allSame = perms.every((p) => p.accessLevel === first);
  return allSame ? first : 'mixed';
}

export const PermissionsMatrix: React.FC<PermissionsMatrixProps> = ({
  permissions,
  onChange,
  onResetToDefaults,
  isBusy = false,
  lockedReasons = {},
}) => {
  // Agrupa permissões por subsistema, mantendo a ordem do manifesto.
  const grouped = useMemo(() => {
    return SUBSYSTEMS.map((subsystem: SubsystemDefinition) => {
      const items = permissions
        .filter((p) => p.subsystemKey === subsystem.key)
        .sort((a, b) => a.moduleName.localeCompare(b.moduleName, 'pt-BR'));
      return { subsystem, items };
    }).filter((g) => g.items.length > 0);
  }, [permissions]);

  function setModuleLevel(moduleKey: string, level: AccessLevel | null) {
    onChange(
      permissions.map((p) =>
        p.moduleKey === moduleKey ? { ...p, accessLevel: level } : p
      )
    );
  }

  function setSubsystemBulk(subsystemKey: string, level: AccessLevel | null) {
    onChange(
      permissions.map((p) =>
        p.subsystemKey === subsystemKey && !lockedReasons[p.moduleKey]
          ? { ...p, accessLevel: level }
          : p
      )
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar topo */}
      <div className="flex items-center justify-between gap-3 bg-gray-50 dark:!bg-[#1f2937] rounded-lg p-3 border border-gray-200 dark:border-gray-700">
        <div className="text-sm text-gray-700 dark:text-gray-200">
          <strong>Permissões granulares.</strong>{' '}
          <span className="text-gray-500">Defina o nível por submódulo ou aplique o nível ao módulo inteiro pelo botão "Aplicar a todos" do cabeçalho.</span>
        </div>
        <button
          type="button"
          onClick={() => onResetToDefaults()}
          disabled={isBusy}
          className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:!bg-[#243040] border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:!bg-[#2d3f52] disabled:opacity-60"
          title="Reaplica a tabela canônica de defaults para a role atual"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Resetar para defaults da role
        </button>
      </div>

      {/* Cards de subsistemas */}
      {grouped.map(({ subsystem, items }) => {
        const editableItems = items.filter((i) => !lockedReasons[i.moduleKey]);
        const bulkState = getSubsystemBulkState(editableItems);
        return (
          <fieldset
            key={subsystem.key}
            className={`border-l-4 ${subsystem.palette.accentBorder} bg-white dark:!bg-[#243040] rounded-r-lg border-y border-r border-gray-200 dark:border-gray-700 overflow-hidden`}
          >
            <legend className="sr-only">Permissões do módulo {subsystem.name}</legend>

            {/* Header do subsistema com bulk apply */}
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 dark:!bg-[#1f2937] border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 min-w-0">
                <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                  {subsystem.name}
                </h4>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ({items.length} {items.length === 1 ? 'submódulo' : 'submódulos'})
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Aplicar a todos:</span>
                {LEVELS.map((opt) => {
                  const active = bulkState === opt.value;
                  const mixedHint = bulkState === 'mixed';
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setSubsystemBulk(subsystem.key, opt.value)}
                      disabled={isBusy || editableItems.length === 0}
                      className={[
                        'px-2 py-1 text-xs rounded border transition-colors',
                        active
                          ? `${subsystem.palette.activeBorder} ${subsystem.palette.iconBg} ${subsystem.palette.iconText} font-medium`
                          : mixedHint
                          ? 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 italic'
                          : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:!bg-[#2d3f52]',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lista de submódulos */}
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {items.map((item) => {
                const locked = Boolean(lockedReasons[item.moduleKey]);
                return (
                  <li
                    key={item.moduleKey}
                    className={`flex items-center justify-between gap-3 px-4 py-2 ${locked ? 'opacity-60' : ''}`}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="text-sm text-gray-800 dark:text-gray-100 truncate">
                        {item.moduleName}
                      </span>
                      <span className="text-xs text-gray-400 truncate hidden sm:inline">
                        ({item.moduleKey})
                      </span>
                      {locked && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded px-1.5 py-0.5"
                          title={lockedReasons[item.moduleKey]}
                        >
                          <AlertCircle className="h-3 w-3" />
                          Bloqueado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {LEVELS.map((opt) => {
                        const selected = item.accessLevel === opt.value;
                        return (
                          <label
                            key={String(opt.value)}
                            className={[
                              'inline-flex items-center gap-1 px-2 py-1 rounded text-xs border cursor-pointer transition-colors',
                              selected
                                ? `${subsystem.palette.activeBorder} ${subsystem.palette.iconBg} ${subsystem.palette.iconText} font-medium`
                                : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:!bg-[#2d3f52]',
                              (isBusy || locked) ? 'opacity-50 cursor-not-allowed' : '',
                            ].join(' ')}
                          >
                            <input
                              type="radio"
                              name={`perm-${item.moduleKey}`}
                              checked={selected}
                              onChange={() => setModuleLevel(item.moduleKey, opt.value)}
                              disabled={isBusy || locked}
                              className="sr-only"
                            />
                            {opt.label}
                          </label>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
    </div>
  );
};

export default PermissionsMatrix;
