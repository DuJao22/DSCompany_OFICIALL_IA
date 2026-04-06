import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { 
  History, 
  Search, 
  Calendar, 
  User, 
  ChevronRight, 
  Loader2, 
  AlertCircle,
  ExternalLink,
  MapPin,
  Phone
} from "lucide-react";

interface SearchEntry {
  id: number;
  user_id: number;
  username: string;
  query: string;
  results_count: number;
  results_json: string;
  created_at: string;
}

interface Lead {
  name: string;
  city: string;
  address: string;
  phone: string;
  maps_link: string;
  niche: string;
}

export default function SearchHistory() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState<SearchEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSearch, setSelectedSearch] = useState<SearchEntry | null>(null);

  useEffect(() => {
    if (user) {
      const isAdmin = user.role === "admin";
      const isProspector = user.sector === "Prospecção";
      const hasAiPermission = user.can_use_ai_search === 1;

      if (!isAdmin && !isProspector) {
        navigate("/sites");
        return;
      }

      if (!isAdmin && !hasAiPermission) {
        navigate("/create");
        return;
      }
    }
    fetchHistory();
  }, [user, navigate]);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/search-history", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      } else {
        setError("Erro ao carregar histórico de buscas.");
      }
    } catch (err) {
      console.error("Error fetching history:", err);
      setError("Erro de conexão ao carregar histórico.");
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const parseResults = (jsonStr: string): Lead[] => {
    try {
      const data = JSON.parse(jsonStr);
      return data.leads || [];
    } catch (e) {
      return [];
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
        <p className="text-zinc-500">Carregando histórico...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
            <History className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Histórico de Buscas IA</h1>
            <p className="text-zinc-500">Visualize todas as buscas e leads gerados anteriormente.</p>
          </div>
        </div>
        <Link 
          to="/leads" 
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2"
        >
          <Search className="w-4 h-4" /> Nova Busca
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* History List */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
            Buscas Recentes
          </h2>
          <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
            {history.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-zinc-500 text-sm">Nenhuma busca encontrada.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 max-h-[600px] overflow-y-auto custom-scrollbar">
                {history.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => setSelectedSearch(entry)}
                    className={`w-full text-left p-4 hover:bg-zinc-50 transition-colors flex items-center justify-between group ${selectedSearch?.id === entry.id ? 'bg-emerald-50' : ''}`}
                  >
                    <div className="space-y-1 overflow-hidden">
                      <p className="font-medium text-zinc-900 truncate">{entry.query}</p>
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {formatDate(entry.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <History className="w-3 h-3" /> {entry.results_count} leads
                        </span>
                      </div>
                      {user?.role === 'admin' && (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                          <User className="w-2 h-2" /> {entry.username}
                        </div>
                      )}
                    </div>
                    <ChevronRight className={`w-4 h-4 text-zinc-300 group-hover:text-emerald-500 transition-colors ${selectedSearch?.id === entry.id ? 'text-emerald-500' : ''}`} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Results View */}
        <div className="lg:col-span-2 space-y-4">
          {selectedSearch ? (
            <>
              <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-zinc-900">Resultados da Busca</h2>
                    <p className="text-zinc-500 text-sm">"{selectedSearch.query}"</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-400">{formatDate(selectedSearch.created_at)}</p>
                    <p className="text-xs font-bold text-emerald-600">{selectedSearch.results_count} leads encontrados</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {parseResults(selectedSearch.results_json).map((lead, idx) => (
                    <div key={idx} className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 hover:border-emerald-200 transition-colors">
                      <h3 className="font-bold text-zinc-900 mb-2">{lead.name}</h3>
                      <div className="space-y-2 text-xs text-zinc-600">
                        <p className="flex items-center gap-2">
                          <MapPin className="w-3 h-3 text-zinc-400" /> {lead.city}
                        </p>
                        <p className="flex items-center gap-2">
                          <Phone className="w-3 h-3 text-zinc-400" /> {lead.phone || "N/A"}
                        </p>
                        <p className="text-zinc-400 italic line-clamp-1">{lead.address}</p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-zinc-200 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase">{lead.niche}</span>
                        <a 
                          href={lead.maps_link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-emerald-600 hover:text-emerald-700 flex items-center gap-1 text-xs font-bold"
                        >
                          Ver no Maps <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center py-20 bg-zinc-50 rounded-3xl border-2 border-dashed border-zinc-200">
              <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <History className="w-8 h-8 text-zinc-400" />
              </div>
              <h3 className="text-lg font-medium text-zinc-900">Selecione uma busca</h3>
              <p className="text-zinc-500 max-w-xs mx-auto mt-2 text-center">
                Clique em uma busca na lista ao lado para visualizar os leads que foram gerados pela IA.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
