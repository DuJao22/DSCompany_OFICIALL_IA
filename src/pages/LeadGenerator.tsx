import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { 
  Search, 
  Sparkles, 
  MapPin, 
  Globe, 
  Plus, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Copy,
  History
} from "lucide-react";
import { GoogleGenAI, Type } from "@google/genai";

interface Lead {
  name: string;
  city: string;
  address: string;
  phone: string;
  maps_link: string;
  niche: string;
  imported?: boolean;
}

export default function LeadGenerator() {
  const { token, logout, user } = useAuth();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [savingLeads, setSavingLeads] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");

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
        navigate("/create"); // Redirect to manual search if no AI permission
        return;
      }
    }
    fetchApiKey();
  }, [user, navigate]);

  const fetchApiKey = async () => {
    try {
      const res = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.gemini_api_key) {
          setApiKey(data.gemini_api_key.trim());
        }
      }
    } catch (err) {
      console.error("Error fetching API key:", err);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;

    setIsLoading(true);
    setError(null);
    setLeads([]);

    try {
      // Fetch latest API key directly to ensure we use the one just saved
      let currentApiKey = "";
      try {
        const res = await fetch("/api/settings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          currentApiKey = data.gemini_api_key?.trim() || "";
        }
      } catch (err) {
        console.error("Error fetching latest API key:", err);
      }

      if (!currentApiKey) {
        currentApiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
      }

      if (!currentApiKey) {
        throw new Error("Chave da API do Gemini não configurada nas Configurações.");
      }

      const ai = new GoogleGenAI({ apiKey: currentApiKey });
      
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: `Você é um especialista em prospecção. Sua tarefa é encontrar 10 estabelecimentos comerciais REAIS e ATIVOS no Google Maps baseados na busca: "${query}".

IMPORTANTE: 
- Os dados devem ser REAIS e ATUAIS.
- Extraia o nome, cidade, endereço completo, telefone e link do Maps.
- Se não encontrar o telefone, deixe em branco, mas tente ao máximo encontrar dados reais.

Retorne os dados em um bloco de código JSON no seguinte formato:
\`\`\`json
{
  "leads": [
    {
      "name": "Nome Real da Empresa",
      "city": "Cidade",
      "address": "Endereço Completo, Número - Bairro",
      "phone": "(00) 00000-0000",
      "maps_link": "https://www.google.com/maps/search/...",
      "niche": "Nicho específico"
    }
  ]
}
\`\`\``,
        config: {
          tools: [{ googleMaps: {} }],
        },
      });

      let text = response.text || "";
      // Extract JSON from code block if present
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```([\s\S]*?)```/);
      if (jsonMatch) {
        text = jsonMatch[1];
      }

      const data = JSON.parse(text);
      const leadsFound = data.leads || [];
      setLeads(leadsFound);
      
      // Save to history AND bulk save to sites (Automatic Import)
      if (leadsFound.length > 0) {
        try {
          // 1. Save to history
          await fetch("/api/search-history", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              query: query,
              results_count: leadsFound.length,
              results_json: data
            }),
          });

          // 2. Bulk save to sites
          setSavingLeads(true);
          const bulkRes = await fetch("/api/analyze/bulk-save", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ leads: leadsFound }),
          });
          setSavingLeads(false);

          if (bulkRes.ok) {
            // Mark all as imported in UI
            setLeads(leadsFound.map(l => ({ ...l, imported: true })));
          }
        } catch (err) {
          console.error("Error in post-search processing:", err);
        }
      }
      
      if (leadsFound.length === 0) {
        setError("Nenhum lead encontrado para essa busca.");
      }
    } catch (err: any) {
      console.error("Search error:", err);
      let friendlyError = err.message || "Erro ao realizar busca com IA.";
      
      if (friendlyError.includes("429") || friendlyError.includes("RESOURCE_EXHAUSTED")) {
        friendlyError = "Limite de cota do Google atingido (Erro 429). O Google limita buscas reais (Google Search/Maps) em chaves gratuitas. Tente novamente em 1 minuto ou use uma chave com faturamento ativado no Google Cloud.";
      } else if (friendlyError.includes("API_KEY_INVALID")) {
        friendlyError = "Chave de API inválida. Verifique se a chave em 'Configurações' está correta e ativa.";
      }
      
      setError(friendlyError);
    } finally {
      setIsLoading(false);
    }
  };

  const importLead = async (lead: Lead, index: number) => {
    try {
      const res = await fetch("/api/analyze/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          success: true,
          name: lead.name,
          city: lead.city,
          address: lead.address,
          map_link: lead.maps_link,
          niche: lead.niche,
          description: `Lead gerado automaticamente via IA para: ${lead.name}`,
          services: "Serviços a serem analisados",
          phone: lead.phone
        }),
      });

      if (res.ok) {
        const newLeads = [...leads];
        newLeads[index].imported = true;
        setLeads(newLeads);
      } else {
        alert("Erro ao importar lead.");
      }
    } catch (err) {
      console.error("Import error:", err);
      alert("Erro ao importar lead.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-zinc-900">Gerador de Leads por IA</h1>
            <p className="text-zinc-500">
              Encontre novos clientes automaticamente usando a inteligência do Google.
              {!apiKey && (
                <span className="ml-1 text-emerald-600 font-medium">
                  (Configure sua chave em <Link to="/settings" className="underline">Configurações</Link>)
                </span>
              )}
            </p>
          </div>
          <Link 
            to="/leads/history" 
            className="px-4 py-2 bg-zinc-100 text-zinc-600 font-semibold rounded-xl hover:bg-zinc-200 transition-all flex items-center gap-2"
          >
            <History className="w-4 h-4" /> Ver Histórico
          </Link>
        </div>

        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex: Pizzarias em Curitiba, Clínicas de Estética em São Paulo..."
              className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !query}
            className="px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all shadow-sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Buscando...
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Buscar Leads
              </>
            )}
          </button>
          {leads.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setLeads([]);
                setQuery("");
              }}
              className="px-6 py-3 bg-zinc-100 text-zinc-600 font-semibold rounded-xl hover:bg-zinc-200 transition-all"
            >
              Limpar
            </button>
          )}
        </form>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {savingLeads && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3 text-emerald-700">
            <Loader2 className="w-5 h-5 animate-spin shrink-0" />
            <p className="text-sm">Salvando todos os leads encontrados automaticamente no banco de dados...</p>
          </div>
        )}
      </div>

      {leads.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {leads.map((lead, index) => (
            <div 
              key={index} 
              className={`bg-white rounded-2xl border p-6 transition-all hover:shadow-md ${lead.imported ? 'border-emerald-200 bg-emerald-50/30' : 'border-zinc-200'}`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-zinc-100 rounded-lg">
                  <Globe className="w-5 h-5 text-zinc-600" />
                </div>
                {lead.imported ? (
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Importado
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                    Novo Lead
                  </span>
                )}
              </div>

              <h3 className="font-bold text-lg text-zinc-900 mb-1 line-clamp-1">{lead.name}</h3>
              <p className="text-sm text-zinc-500 mb-4 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {lead.city}
              </p>

              <div className="space-y-3 mb-6">
                <div className="text-xs text-zinc-600">
                  <span className="font-semibold text-zinc-900">Telefone:</span> {lead.phone || "Não disponível"}
                </div>
                <div className="text-xs text-zinc-600">
                  <span className="font-semibold text-zinc-900">Nicho:</span> {lead.niche}
                </div>
                <div className="text-xs text-zinc-600 line-clamp-2">
                  <span className="font-semibold text-zinc-900">Endereço:</span> {lead.address}
                </div>
              </div>

              <div className="flex gap-2">
                <a 
                  href={lead.maps_link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors gap-2"
                >
                  <ExternalLink className="w-4 h-4" /> Maps
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(lead.maps_link);
                    alert("Link copiado!");
                  }}
                  className="p-2 border border-zinc-200 rounded-lg text-zinc-600 hover:bg-zinc-50"
                  title="Copiar Link do Maps"
                >
                  <Copy className="w-4 h-4" />
                </button>
                {!lead.imported && (
                  <button
                    onClick={() => importLead(lead, index)}
                    className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors gap-2"
                  >
                    <Plus className="w-4 h-4" /> Importar
                  </button>
                )}
                {lead.imported && (
                  <button
                    onClick={() => navigate("/create")}
                    className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors gap-2"
                  >
                    Analisar <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {leads.length === 0 && !isLoading && !error && (
        <div className="text-center py-20 bg-zinc-50 rounded-3xl border-2 border-dashed border-zinc-200">
          <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-zinc-400" />
          </div>
          <h3 className="text-lg font-medium text-zinc-900">Nenhum lead buscado ainda</h3>
          <p className="text-zinc-500 max-w-md mx-auto mt-2">
            Digite o que você procura acima para encontrar estabelecimentos reais e começar a prospecção.
          </p>
        </div>
      )}
    </div>
  );
}
