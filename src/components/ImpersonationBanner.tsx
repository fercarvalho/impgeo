import React from 'react';
import { UserCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const ImpersonationBanner: React.FC = () => {
  const { isImpersonating, stopImpersonation, user } = useAuth();

  if (!isImpersonating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[10000] bg-blue-700 text-white px-4 py-2 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-2 text-sm font-medium">
        <UserCircle2 className="w-4 h-4 flex-shrink-0" />
        <span>
          Você está visualizando o sistema como <strong>{user?.firstName ? `${user.firstName} ${user.lastName}` : user?.username}</strong>
          <span className="ml-2 opacity-75 text-xs">(@{user?.username} · {user?.role})</span>
        </span>
      </div>
      <button
        onClick={stopImpersonation}
        className="ml-4 px-3 py-1 bg-white text-blue-700 text-xs font-semibold rounded hover:bg-blue-50 transition-colors flex-shrink-0"
      >
        Voltar para minha conta
      </button>
    </div>
  );
};

export default ImpersonationBanner;
