import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { Settings, Key, CheckCircle, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function SettingsPage() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState("");
  const [defaultEndpoint, setDefaultEndpoint] = useState("");
  const [salesMessageTemplate, setSalesMessageTemplate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [geminiUsage, setGeminiUsage] = useState<{ count: number; limit: number } | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchGeminiUsage();
  }, []);

  const fetchGeminiUsage = async () => {
    try {
      const res = await fetch('/api/gemini-usage', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGeminiUsage(data);
      }
    } catch (e) {
      console.error('Error fetching gemini usage:', e);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        logout();
        navigate("/login");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (data.gemini_api_key) {
          setApiKey(data.gemini_api_key);
        }
        if (data.default_endpoint) {
          setDefaultEndpoint(data.default_endpoint);
        }
        if (data.sales_message_template) {
          setSalesMessageTemplate(data.sales_message_template);
        }
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          gemini_api_key: apiKey,
          default_endpoint: defaultEndpoint,
          sales_message_template: salesMessageTemplate
        }),
      });

      if (res.status === 401 || res.status === 403) {
        logout();
        navigate("/login");
        return;
      }

      const data = await res.json();

      if (res.ok) {
        setMessage({
          type: "success",
          text: "Configurações salvas com sucesso!",
        });
      } else {
        setMessage({
          type: "error",
          text: data.error || "Erro ao salvar configurações.",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: "Erro de conexão ao salvar configurações.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-6">
      <div className="md:flex md:items-center md:justify-between mb-8">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-zinc-900 sm:text-3xl sm:truncate flex items-center gap-2">
            <Settings className="w-8 h-8 text-zinc-400" />
            Configurações do Sistema
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Gerencie as chaves de API e outras configurações globais.
          </p>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <h3 className="text-lg font-medium text-zinc-900 flex items-center gap-2">
            Configurações da Conta
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            Gerencie suas informações de acesso e chaves de API.
          </p>
        </div>

        <form onSubmit={handleSave} className="p-6">
          {message && (
            <div
              className={`mb-6 p-4 rounded-md flex items-start gap-3 ${
                message.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <p className="text-sm font-medium">{message.text}</p>
            </div>
          )}

          <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-zinc-900 flex items-center gap-2 mb-2">
                  <Key className="w-5 h-5 text-emerald-600" />
                  Integração com Inteligência Artificial (Gemini)
                </h3>
                <p className="mb-4 text-sm text-zinc-500">
                  Para que o sistema consiga extrair dados dos links do Google Maps, é
                  necessário fornecer uma chave de API válida do Google Gemini.
                  {user?.role !== "admin" && " Como usuário comum, você pode configurar sua própria chave pessoal aqui."}
                </p>
                <label
                  htmlFor="apiKey"
                  className="block text-sm font-medium text-zinc-700"
                >
                  Chave da API (Gemini API Key)
                </label>
                <div className="mt-1">
                  <input
                    type="password"
                    name="apiKey"
                    id="apiKey"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="shadow-sm focus:ring-emerald-500 focus:border-emerald-500 block w-full sm:text-sm border-zinc-300 rounded-md px-4 py-2 border"
                    placeholder="AIzaSy..."
                  />
                </div>
                <p className="mt-2 text-sm text-zinc-500">
                  Você pode gerar uma chave gratuitamente no{" "}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-600 hover:text-emerald-500 underline"
                  >
                    Google AI Studio
                  </a>
                  .
                </p>
                <div className="mt-3 bg-blue-50 p-3 rounded-md border border-blue-100">
                  <p className="text-xs text-blue-800 mb-2">
                    <strong>Limites da Camada Gratuita:</strong> Com uma chave gratuita do Google AI Studio, você pode gerar até <strong>1.500 sites/templates por dia</strong>, com um limite de <strong>15 requisições por minuto</strong>.
                  </p>
                  {geminiUsage && user?.role === "admin" && (
                    <div className="mb-2 pt-2 border-t border-blue-200">
                      <p className="text-xs font-medium text-blue-900">
                        Uso hoje: {geminiUsage.count} / {geminiUsage.limit} requisições
                      </p>
                      <div className="w-full bg-blue-200 rounded-full h-1.5 mt-1">
                        <div 
                          className={`h-1.5 rounded-full ${geminiUsage.count >= geminiUsage.limit ? 'bg-red-500' : 'bg-blue-600'}`} 
                          style={{ width: `${Math.min((geminiUsage.count / geminiUsage.limit) * 100, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-blue-800">
                    <strong>Nota:</strong> A chave salva aqui no painel tem
                    prioridade sobre a chave configurada nas variáveis de ambiente
                    do servidor (Render/Vercel). Se você atualizou a chave no
                    servidor, certifique-se de atualizá-la aqui também, ou deixe
                    este campo vazio para usar a chave do servidor.
                  </p>
                </div>
              </div>

            {(user?.role === "admin" || user?.sector === "Vendas") && (
              <div className="pt-6 border-t border-zinc-200">
                <h3 className="text-lg font-medium text-zinc-900 flex items-center gap-2 mb-2">
                  <Settings className="w-5 h-5 text-emerald-600" />
                  Modelo de Mensagem de Vendas
                </h3>
                <p className="mb-4 text-sm text-zinc-500">
                  Defina o modelo de mensagem que será usado para abordar os clientes.
                </p>
                <label
                  htmlFor="salesMessageTemplate"
                  className="block text-sm font-medium text-zinc-700"
                >
                  Mensagem Padrão
                </label>
                <div className="mt-1">
                  <textarea
                    id="salesMessageTemplate"
                    rows={4}
                    value={salesMessageTemplate}
                    onChange={(e) => setSalesMessageTemplate(e.target.value)}
                    className="shadow-sm focus:ring-emerald-500 focus:border-emerald-500 block w-full sm:text-sm border-zinc-300 rounded-md px-4 py-2 border"
                    placeholder="Olá! Vimos que sua empresa ainda não tem um site profissional..."
                  />
                </div>
                <p className="mt-2 text-sm text-zinc-500">
                  Esta mensagem será usada como base para o setor de vendas.
                </p>
              </div>
            )}

            {user?.role === "admin" && (
              <div className="pt-6 border-t border-zinc-200">
                <h3 className="text-lg font-medium text-zinc-900 flex items-center gap-2 mb-2">
                  <Settings className="w-5 h-5 text-emerald-600" />
                  Configuração de Endpoint Padrão
                </h3>
                <p className="mb-4 text-sm text-zinc-500">
                  Defina o endpoint padrão para onde o fluxo JSON será enviado.
                </p>
                <label
                  htmlFor="defaultEndpoint"
                  className="block text-sm font-medium text-zinc-700"
                >
                  URL do Endpoint Padrão
                </label>
                <div className="mt-1">
                  <input
                    type="url"
                    name="defaultEndpoint"
                    id="defaultEndpoint"
                    value={defaultEndpoint}
                    onChange={(e) => setDefaultEndpoint(e.target.value)}
                    className="shadow-sm focus:ring-emerald-500 focus:border-emerald-500 block w-full sm:text-sm border-zinc-300 rounded-md px-4 py-2 border"
                    placeholder="https://flowpost.onrender.com/api/upload"
                  />
                </div>
                <p className="mt-2 text-sm text-zinc-500">
                  Este URL será sugerido como o endpoint padrão ao enviar dados de análises.
                </p>
              </div>
            )}

            {user?.role === "admin" && (
              <div className="pt-6 border-t border-zinc-200">
                <h3 className="text-lg font-medium text-zinc-900 flex items-center gap-2 mb-4">
                  <Key className="w-5 h-5 text-emerald-600" />
                  Sua Chave de API Externa (Webhook)
                </h3>
                <label
                  htmlFor="webhookKey"
                  className="block text-sm font-medium text-zinc-700"
                >
                  Token de Autenticação (x-api-key)
                </label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <input
                    type="text"
                    name="webhookKey"
                    id="webhookKey"
                    value={user?.api_key || ""}
                    readOnly
                    className="focus:ring-emerald-500 focus:border-emerald-500 flex-1 block w-full rounded-none rounded-l-md sm:text-sm border-zinc-300 px-4 py-2 border bg-zinc-50 text-zinc-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (user?.api_key) {
                        navigator.clipboard.writeText(user.api_key);
                        alert("Chave copiada!");
                      }
                    }}
                    className="-ml-px relative inline-flex items-center space-x-2 px-4 py-2 border border-zinc-300 text-sm font-medium rounded-r-md text-zinc-700 bg-zinc-50 hover:bg-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    Copiar
                  </button>
                </div>
                <p className="mt-2 text-sm text-zinc-500">
                  Esta é a sua chave exclusiva. Use-a no cabeçalho{" "}
                  <code>x-api-key</code> para autenticar requisições externas.
                </p>
              </div>
            )}
          </div>

          <div className="mt-8 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex justify-center items-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              {isSaving ? "Salvando..." : "Salvar Configurações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
