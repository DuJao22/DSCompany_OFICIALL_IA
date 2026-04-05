import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Globe, Calendar, ArrowRight, FileJson, Clock, RefreshCw, CheckCircle, Download, Database, ExternalLink, Settings, MessageSquare, X, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export default function Dashboard() {
  const { token, logout, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total: 0, today: 0, userProgress: 0, userGoal: 0 });
  const [recentSites, setRecentSites] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showDbConfig, setShowDbConfig] = useState(false);

  const handleGenerateExport = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch("/api/admin/generate-export", {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        alert("Arquivos de exportação gerados com sucesso!");
      } else {
        const data = await response.json();
        alert(data.error || "Erro ao gerar exportação");
      }
    } catch (err) {
      console.error("Generation error:", err);
      alert("Erro ao gerar exportação");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadDB = async (format: 'json' | 'sqlite' = 'json') => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/admin/export-db?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = format === 'sqlite' ? 'database.sqlite' : 'database_export.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        const data = await response.json();
        alert(data.error || "Erro ao baixar banco de dados");
      }
    } catch (err) {
      console.error("Download error:", err);
      alert("Erro ao baixar banco de dados");
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "vendas":
      case "produzido":
        return (
          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-emerald-100 text-emerald-800 items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Pronto para Vendas
          </span>
        );
      case "contato":
        return (
          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800 items-center gap-1">
            <MessageSquare className="w-3 h-3" /> Em Contato
          </span>
        );
      case "fechado":
        return (
          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-zinc-100 text-zinc-800 items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Fechado
          </span>
        );
      case "negado":
        return (
          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 items-center gap-1">
            <X className="w-3 h-3" /> Negado
          </span>
        );
      case "produção":
        return (
          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" /> Em Produção
          </span>
        );
      default:
        return (
          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-zinc-100 text-zinc-800 items-center gap-1">
            <Clock className="w-3 h-3" /> Prospectado
          </span>
        );
    }
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [statsRes, sitesRes] = await Promise.all([
          fetch("/api/stats", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("/api/sites", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (
          statsRes.status === 401 ||
          statsRes.status === 403 ||
          sitesRes.status === 401 ||
          sitesRes.status === 403
        ) {
          logout();
          navigate("/login");
          return;
        }

        if (!statsRes.ok || !sitesRes.ok) {
          const statsData = await statsRes.json().catch(() => ({}));
          const sitesData = await sitesRes.json().catch(() => ({}));
          const errorMsg = statsData.error || sitesData.error || "Erro ao carregar dados";
          throw new Error(errorMsg);
        }

        const statsData = await statsRes.json();
        const sitesData = await sitesRes.json();

        setStats(statsData);
        setRecentSites(sitesData.slice(0, 5)); // Get top 5
      } catch (error: any) {
        console.error("Error fetching dashboard data:", error);
        setError(error.message || "Erro desconhecido ao carregar dashboard");
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [token]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const statCards = [
    {
      name: "Total de Análises",
      value: stats.total,
      icon: Globe,
      color: "bg-blue-500",
    },
    {
      name: "Análises Hoje (Geral)",
      value: stats.today,
      icon: Calendar,
      color: "bg-emerald-500",
    },
  ];

  const progressPercentage = stats.userGoal > 0 
    ? Math.min(Math.round((stats.userProgress / stats.userGoal) * 100), 100) 
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Dashboard</h1>
          {user?.sector && (
            <p className="text-sm text-zinc-500">Setor: {user.sector}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(user?.role === 'admin' || user?.sector === 'Prospecção') && (
            <Link
              to="/leads"
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700"
            >
              <Sparkles className="w-4 h-4 mr-2" /> Gerador de Leads
            </Link>
          )}
          {user?.role === 'admin' && (
            <>
              <button
                onClick={handleGenerateExport}
                disabled={isGenerating}
                className="inline-flex items-center justify-center px-4 py-2 border border-emerald-300 rounded-md shadow-sm text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
                title="Gera novos arquivos JSON e SQLite com os dados mais recentes"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
                {isGenerating ? 'Gerando...' : 'Atualizar Exportação'}
              </button>
              <button
                onClick={() => handleDownloadDB('json')}
                disabled={isExporting}
                className="inline-flex items-center justify-center px-4 py-2 border border-zinc-300 rounded-md shadow-sm text-sm font-medium text-zinc-700 bg-white hover:bg-zinc-50 disabled:opacity-50"
              >
                <Download className={`w-4 h-4 mr-2 ${isExporting ? 'animate-bounce' : ''}`} />
                {isExporting ? 'Exportando...' : 'JSON'}
              </button>
              <button
                onClick={() => handleDownloadDB('sqlite')}
                disabled={isExporting}
                className="inline-flex items-center justify-center px-4 py-2 border border-zinc-300 rounded-md shadow-sm text-sm font-medium text-zinc-700 bg-white hover:bg-zinc-50 disabled:opacity-50"
              >
                <Database className={`w-4 h-4 mr-2 ${isExporting ? 'animate-bounce' : ''}`} />
                {isExporting ? 'Exportando...' : 'SQLite'}
              </button>
              <a
                href="https://sqlitecloud.io/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-4 py-2 border border-blue-300 rounded-md shadow-sm text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100"
                title="Acessar o console do SQLiteCloud"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Console
              </a>
              <button
                onClick={() => setShowDbConfig(!showDbConfig)}
                className="inline-flex items-center justify-center px-4 py-2 border border-zinc-300 rounded-md shadow-sm text-sm font-medium text-zinc-700 bg-white hover:bg-zinc-50"
                title="Ver configurações do banco"
              >
                <Settings className={`w-4 h-4 ${showDbConfig ? 'animate-spin' : ''}`} />
              </button>
            </>
          )}
          {(user?.role === 'admin' || user?.sector === 'Prospecção') && (
            <Link
              to="/create"
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700"
            >
              Nova Análise
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg relative flex items-center justify-between" role="alert">
          <div>
            <strong className="font-bold">Erro: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
          <button 
            className="ml-4 p-1 hover:bg-red-100 rounded-full transition-colors"
            onClick={() => window.location.reload()}
            title="Recarregar página"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      )}

      {showDbConfig && user?.role === 'admin' && (
        <div className="bg-zinc-900 text-zinc-100 p-6 rounded-lg shadow-xl border border-zinc-700 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-400" />
              Configurações do Banco de Dados
            </h3>
            <button 
              onClick={() => setShowDbConfig(false)}
              className="text-zinc-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-zinc-400 uppercase font-bold tracking-wider">Connection String (SQLiteCloud)</p>
            <div className="bg-black p-3 rounded font-mono text-xs break-all border border-zinc-800">
              sqlitecloud://cmq6frwshz.g4.sqlite.cloud:8860/DsCompany_Prospeccao.db?apikey=Dor8OwUECYmrbcS5vWfsdGpjCpdm9ecSDJtywgvRw8k
            </div>
            <p className="text-xs text-zinc-500 italic">
              * Esta string é usada para conectar o sistema ao banco de dados na nuvem.
            </p>
          </div>
          <div className="pt-2 flex gap-4">
            <div className="flex-1 bg-zinc-800 p-3 rounded">
              <p className="text-xs text-zinc-400">Ping Keep-Alive</p>
              <p className="text-sm font-medium text-emerald-400">Ativo (5 min)</p>
            </div>
            <div className="flex-1 bg-zinc-800 p-3 rounded">
              <p className="text-xs text-zinc-400">Status da Conexão</p>
              <p className="text-sm font-medium text-emerald-400">Conectado</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {statCards.map((item) => (
          <div
            key={item.name}
            className="bg-white overflow-hidden shadow rounded-lg"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`${item.color} rounded-md p-3`}>
                    <item.icon
                      className="h-6 w-6 text-white"
                      aria-hidden="true"
                    />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-zinc-500 truncate">
                      {item.name}
                    </dt>
                    <dd>
                      <div className="text-2xl font-bold text-zinc-900">
                        {item.value}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* User Progress Section */}
      <div className="bg-white shadow rounded-lg p-6 border border-zinc-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-zinc-900">Sua Meta Diária</h3>
            <p className="text-sm text-zinc-500">Acompanhe seu progresso de prospecção hoje</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-emerald-600">{stats.userProgress}</span>
            <span className="text-zinc-400 mx-1">/</span>
            <span className="text-lg font-medium text-zinc-600">{stats.userGoal}</span>
          </div>
        </div>
        
        <div className="relative pt-1">
          <div className="flex mb-2 items-center justify-between">
            <div>
              <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-emerald-600 bg-emerald-200">
                {progressPercentage === 100 ? "Meta Atingida!" : "Em progresso"}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold inline-block text-emerald-600">
                {progressPercentage}%
              </span>
            </div>
          </div>
          <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-zinc-100">
            <div
              style={{ width: `${progressPercentage}%` }}
              className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500 ${
                progressPercentage === 100 ? "bg-emerald-500" : "bg-emerald-400"
              }`}
            ></div>
          </div>
          {stats.userGoal === 0 && (
            <p className="text-xs text-zinc-400 italic">Nenhuma meta definida pelo administrador.</p>
          )}
        </div>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center border-b border-zinc-200">
          <h3 className="text-lg leading-6 font-medium text-zinc-900">
            Últimas Análises
          </h3>
          <Link
            to="/sites"
            className="text-sm text-emerald-600 hover:text-emerald-500 flex items-center"
          >
            Ver todas <ArrowRight className="ml-1 w-4 h-4" />
          </Link>
        </div>
        <div className="block sm:hidden">
          <ul className="divide-y divide-zinc-200">
            {recentSites.length === 0 ? (
              <li className="px-4 py-4 text-center text-sm text-zinc-500">
                Nenhuma análise realizada ainda.
              </li>
            ) : (
              recentSites.map((site: any) => (
                <li key={site.id} className="px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-900 truncate">
                        {site.name}
                      </p>
                      <p className="text-xs text-emerald-600 truncate">
                        {site.creator_name || "N/A"} {site.creator_sector ? `(${site.creator_sector})` : ""}
                      </p>
                    </div>
                    <div className="ml-2 flex-shrink-0 flex flex-col items-end gap-1">
                      <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-emerald-100 text-emerald-800">
                        {new Date(site.created_at).toLocaleDateString("pt-BR")}
                      </p>
                      {getStatusBadge(site.status)}
                    </div>
                  </div>
                  <div className="mt-2 sm:flex sm:justify-between">
                    <div className="sm:flex min-w-0">
                      <p className="flex items-center text-sm text-zinc-500 truncate">
                        <FileJson className="flex-shrink-0 mr-1.5 h-4 w-4 text-emerald-600" />
                        <span className="truncate">{site.slug}</span>
                      </p>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Empresa
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Usuário
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Arquivo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Data
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
              {recentSites.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-6 py-4 text-center text-sm text-zinc-500"
                  >
                    Nenhuma análise realizada ainda.
                  </td>
                </tr>
              ) : (
                recentSites.map((site: any) => {
                  return (
                    <tr key={site.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900">
                        {site.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        <div className="font-medium text-zinc-900">{site.creator_name || "N/A"}</div>
                        {site.creator_sector && <div className="text-xs">{site.creator_sector}</div>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        <div className="flex items-center space-x-2">
                          <FileJson className="w-4 h-4 text-emerald-600" />
                          <span>{site.slug}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {getStatusBadge(site.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {new Date(site.created_at).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
