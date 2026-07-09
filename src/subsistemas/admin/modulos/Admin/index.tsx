import { useState, useEffect, useMemo, type ComponentType } from 'react';
import { Users, Settings, Activity, BarChart3, Shield, MessageSquare, HelpCircle, FileText, BookOpen, Layout, KeyRound, Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import LegacyUserManagement from './AdminPanel';
import ModuleManagement from './ModuleManagement';
import ActivityLog from './ActivityLog';
import Statistics from './Statistics';
import FeedbackManagement from './FeedbackManagement';
import FAQManagement from './FAQManagement';
import LegalManagement from './LegalManagement';
import DocumentationManagement from './DocumentationManagement';
import FooterManagement from './FooterManagement';
import RoleDefaultsManagement from './RoleDefaultsManagement';
import NotificationDefaultsManagement from './NotificationDefaultsManagement';

type AdminTab = 'users' | 'modules' | 'role-defaults' | 'notif-defaults' | 'activity' | 'statistics' | 'feedbacks' | 'faq' | 'legal' | 'documentacao' | 'rodape';

interface UserWithPermissions {
  role?: string;
  permissoesLegais?: Record<string, boolean>;
}

const AdminTabs = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  const typedUser = user as UserWithPermissions | null;
  const permissoesLegais = typedUser?.permissoesLegais;
  const hasLegalAccess =
    typedUser?.role === 'superadmin' ||
    (permissoesLegais !== null &&
      permissoesLegais !== undefined &&
      typeof permissoesLegais === 'object' &&
      !Array.isArray(permissoesLegais) &&
      Object.values(permissoesLegais).some(v => v === true));

  const tabs: Array<{ id: AdminTab; name: string; icon: ComponentType<{ className?: string }> }> = useMemo(() => [
    { id: 'users',      name: 'Usuários',    icon: Users },
    { id: 'modules',    name: 'Módulos',     icon: Settings },
    ...(typedUser?.role === 'superadmin' ? [{ id: 'role-defaults' as AdminTab, name: 'Padrões de Função', icon: KeyRound }] : []),
    { id: 'notif-defaults', name: 'Notificações', icon: Bell },
    { id: 'activity',   name: 'Atividades',  icon: Activity },
    { id: 'statistics', name: 'Estatísticas',icon: BarChart3 },
    { id: 'feedbacks',  name: 'Feedbacks',   icon: MessageSquare },
    { id: 'faq',           name: 'FAQ',           icon: HelpCircle },
    { id: 'documentacao',  name: 'Documentação',  icon: BookOpen },
    ...(hasLegalAccess ? [{ id: 'legal' as AdminTab, name: 'Legal', icon: FileText }] : []),
    ...(typedUser?.role === 'superadmin' ? [{ id: 'rodape' as AdminTab, name: 'Rodapé', icon: Layout }] : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [hasLegalAccess, typedUser?.role]);

  // Resetar para aba padrão se a aba ativa não existir mais nos tabs disponíveis
  useEffect(() => {
    const tabIds = tabs.map(t => t.id);
    if (!tabIds.includes(activeTab)) {
      setActiveTab('users');
    }
  }, [tabs, activeTab]);

  if (typedUser?.role !== 'admin' && typedUser?.role !== 'superadmin') {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 dark:text-red-400 text-lg">Acesso negado. Apenas administradores podem acessar este painel.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-md shadow-blue-500/25">
            <Shield className="h-6 w-6 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Painel Administrativo</h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Gerencie usuários, módulos e visualize estatísticas do sistema</p>
      </div>

      <div className="relative mb-6 border-b border-gray-200 dark:border-gray-700">
        <div
          role="tablist"
          className="flex overflow-x-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                id={`admin-tab-${tab.id}`}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls="admin-tabpanel"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 border-b-2 flex-shrink-0 transition-colors whitespace-nowrap text-sm font-medium ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 font-semibold'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {tab.name}
              </button>
            );
          })}
        </div>
        <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-white dark:from-[#0f172a] to-transparent" />
      </div>

      <div
        id="admin-tabpanel"
        role="tabpanel"
        aria-labelledby={`admin-tab-${activeTab}`}
        className="mt-6"
      >
      {activeTab === 'users'         && <LegacyUserManagement embedded />}
      {activeTab === 'modules'       && <ModuleManagement />}
      {activeTab === 'role-defaults' && <RoleDefaultsManagement />}
      {activeTab === 'notif-defaults' && <NotificationDefaultsManagement />}
      {activeTab === 'activity'      && <ActivityLog />}
      {activeTab === 'statistics' && <Statistics />}
      {activeTab === 'feedbacks'  && <FeedbackManagement />}
      {activeTab === 'faq'          && <FAQManagement />}
      {activeTab === 'documentacao' && <DocumentationManagement />}
      {activeTab === 'legal'        && <LegalManagement />}
      {activeTab === 'rodape'       && <FooterManagement />}
      </div>
    </div>
  );
};

export default AdminTabs;
