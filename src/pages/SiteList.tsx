import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  Trash2,
  Download,
  AlertTriangle,
  X,
  FileJson,
  Eye,
  Copy,
  CheckCircle,
  Send,
  Terminal,
  Clock,
  Play,
  RefreshCw,
  MessageSquare,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { generatePrompt, generateFlowJson, generatePromptWithTemplate } from "../utils/flowGenerator";
import { GoogleGenAI } from "@google/genai";

export default function SiteList() {
  const { token, logout, user } = useAuth();
  const navigate = useNavigate();
  const [sites, setSites] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal states
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    id: number | null;
  }>({ isOpen: false, id: null });
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
  }>({ isOpen: false, message: "" });
  const [viewModal, setViewModal] = useState<{ isOpen: boolean; site: any }>({
    isOpen: false,
    site: null,
  });
  const [endpointModal, setEndpointModal] = useState<{
    isOpen: boolean;
    site: any;
  }>({ isOpen: false, site: null });
  const [hostingUrlModal, setHostingUrlModal] = useState<{
    isOpen: boolean;
    site: any;
    url: string;
  }>({ isOpen: false, site: null, url: "" });
  const [salesMessageModal, setSalesMessageModal] = useState<{
    isOpen: boolean;
    site: any;
    message: string;
    isGenerating: boolean;
  }>({ isOpen: false, site: null, message: "", isGenerating: false });

  const [copiedJsonId, setCopiedJsonId] = useState<number | null>(null);
  const [isCopying, setIsCopying] = useState(false);

  const [endpointUrl, setEndpointUrl] = useState("");
  const [defaultEndpointFromSettings, setDefaultEndpointFromSettings] = useState("");
  const DEFAULT_ENDPOINT = defaultEndpointFromSettings || "https://flowpost.onrender.com/api/upload";
  const [endpointMethod, setEndpointMethod] = useState("POST");
  const [authToken, setAuthToken] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [processLogs, setProcessLogs] = useState<
    { time: string; message: string; type: "info" | "success" | "error" }[]
  >([]);
  const [endpointResult, setEndpointResult] = useState<{
    success?: boolean;
    error?: string;
  } | null>(null);

  const addLog = (
    message: string,
    type: "info" | "success" | "error" = "info",
  ) => {
    setProcessLogs((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString(), message, type },
    ]);
  };

  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

  const fetchSites = async () => {
    try {
      const res = await fetch("/api/sites", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        logout();
        navigate("/login");
        return;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to fetch sites: ${res.status} ${text}`);
      }
      const data = await res.json();
      setSites(data);
    } catch (error) {
      console.error("Error fetching sites:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const [geminiUsage, setGeminiUsage] = useState<{ count: number; limit: number } | null>(null);

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

  useEffect(() => {
    fetchSites();
    fetchTemplates();
    fetchSettings();
    fetchGeminiUsage();
  }, [token]);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.default_endpoint) {
          setDefaultEndpointFromSettings(data.default_endpoint);
        }
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/templates", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
        if (data.length > 0) {
          setSelectedTemplateId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Error fetching templates:", err);
    }
  };

  const confirmDelete = async () => {
    if (!deleteModal.id) return;

    try {
      const res = await fetch(`/api/sites/${deleteModal.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        logout();
        navigate("/login");
        return;
      }
      setDeleteModal({ isOpen: false, id: null });
      fetchSites();
    } catch (error) {
      setDeleteModal({ isOpen: false, id: null });
      setAlertModal({ isOpen: true, message: "Erro ao excluir análise" });
    }
  };

  const handleDownloadJson = async (filename: string) => {
    try {
      const res = await fetch(`/api/analyze/download/${filename}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        logout();
        navigate("/login");
        return;
      }
      if (!res.ok) throw new Error("Falha ao baixar arquivo");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download error:", error);
      setAlertModal({
        isOpen: true,
        message: "Erro ao baixar o arquivo JSON.",
      });
    }
  };

  const handleCopyJsonToClipboard = async (site: any) => {
    setIsCopying(true);
    try {
      const res = await fetch(`/api/analyze/download/${site.slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        logout();
        navigate("/login");
        return;
      }
      if (!res.ok) throw new Error("Falha ao obter JSON");
      const data = await res.json();
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopiedJsonId(site.id);
      setTimeout(() => setCopiedJsonId(null), 2000);
    } catch (error) {
      console.error("Copy error:", error);
      setAlertModal({ isOpen: true, message: "Erro ao copiar o JSON." });
    } finally {
      setIsCopying(false);
    }
  };

  const [showFlowJson, setShowFlowJson] = useState(false);
  const [generatedFlowJson, setGeneratedFlowJson] = useState<any>(null);
  const [payloadType, setPayloadType] = useState<"flow" | "data" | "site">("site");
  const [isGeneratingSite, setIsGeneratingSite] = useState(false);

  const handleUpdateStatus = async (id: number, newStatus: string, hosting_url?: string) => {
    try {
      const res = await fetch(`/api/sites/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus, hosting_url }),
      });

      if (res.status === 401 || res.status === 403) {
        logout();
        navigate("/login");
        return;
      }

      if (res.ok) {
        fetchSites();
        // If we are in the view modal, update the local site data too
        if (viewModal.isOpen && viewModal.site?.id === id) {
          setViewModal({
            ...viewModal,
            site: { ...viewModal.site, status: newStatus },
          });
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setAlertModal({
          isOpen: true,
          message: data.error || "Erro ao atualizar status",
        });
      }
    } catch (error) {
      console.error("Error updating status:", error);
      setAlertModal({ isOpen: true, message: "Erro ao atualizar status" });
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
      case "prospectado":
        return (
          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-zinc-100 text-zinc-800 items-center gap-1">
            <Clock className="w-3 h-3" /> Prospectado
          </span>
        );
      default:
        return (
          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-zinc-100 text-zinc-800 items-center gap-1">
            <Clock className="w-3 h-3" /> {status}
          </span>
        );
    }
  };

  const handleGenerateAiMessage = async (siteId: number) => {
    setSalesMessageModal(prev => ({ ...prev, isGenerating: true }));
    try {
      const res = await fetch('/api/sales/generate-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ siteId })
      });
      
      if (res.ok) {
        const data = await res.json();
        setSalesMessageModal(prev => ({ ...prev, message: data.message }));
      } else {
        const data = await res.json();
        setAlertModal({ isOpen: true, message: data.error || 'Erro ao gerar mensagem' });
      }
    } catch (error) {
      console.error('Error generating message:', error);
      setAlertModal({ isOpen: true, message: 'Erro de conexão ao gerar mensagem' });
    } finally {
      setSalesMessageModal(prev => ({ ...prev, isGenerating: false }));
    }
  };

  const handleSendWhatsApp = (phone: string, message: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleSendToEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endpointUrl || !endpointModal.site) return;

    setIsSending(true);
    setProcessLogs([]);
    setEndpointResult(null);

    try {
      addLog("Buscando dados completos da análise...", "info");
      const res = await fetch(
        `/api/analyze/download/${endpointModal.site.slug}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.status === 401 || res.status === 403) {
        logout();
        navigate("/login");
        return;
      }
      if (!res.ok) throw new Error("Falha ao obter JSON da análise");
      const data = await res.json();
      addLog("Dados da análise obtidos com sucesso.", "success");

      let apiKey = "";
      try {
        const settingsRes = await fetch('/api/settings', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (settings.gemini_api_key) {
            apiKey = settings.gemini_api_key.trim();
          }
        }
      } catch (e) {
        console.error("Error fetching settings:", e);
      }

      let finalPayload: any = null;

      if (payloadType === "site") {
        if (!apiKey) {
          addLog("Erro: Chave de API do Gemini não configurada. Configure nas Configurações.", "error");
          setIsSending(false);
          return;
        }

        addLog("Gerando HTML do site via Gemini IA...", "info");
        setIsGeneratingSite(true);
        
        const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || (templates.length > 0 ? templates[0] : null);
        const promptText = selectedTemplate 
          ? generatePromptWithTemplate(data, endpointModal.site.map_link || "", selectedTemplate.prompt_template)
          : generatePrompt(data, endpointModal.site.map_link || "");

        try {
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [{ parts: [{ text: promptText }] }],
            config: {
              systemInstruction: "Você é um gerador de código HTML puro. Retorne APENAS o código HTML completo, começando com <!DOCTYPE html> e terminando com </html>. NÃO use markdown. NÃO escreva nenhuma introdução, explicação ou comentário fora das tags HTML."
            }
          });

          const html = response.text || "";
          
          if (!html) throw new Error("Gemini retornou HTML vazio");
          
          finalPayload = {
            name: endpointModal.site.name,
            html: html.replace(/```html/g, '').replace(/```/g, '').trim()
          };
          addLog("HTML gerado com sucesso pela IA.", "success");
        } catch (err: any) {
          addLog(`Erro ao gerar HTML: ${err.message}`, "error");
          setIsSending(false);
          setIsGeneratingSite(false);
          return;
        }
        setIsGeneratingSite(false);
      } else if (payloadType === "flow") {
        addLog("Gerando JSON do Fluxo...", "info");
        const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || (templates.length > 0 ? templates[0] : null);
        const promptText = selectedTemplate 
          ? generatePromptWithTemplate(data, endpointModal.site.map_link || "", selectedTemplate.prompt_template)
          : generatePrompt(data, endpointModal.site.map_link || "");
          
        finalPayload = generateFlowJson(
          promptText, 
          endpointModal.site.name, 
          endpointModal.site.id, 
          data,
          selectedTemplate?.flow_structure,
          apiKey
        );
        setGeneratedFlowJson(finalPayload);
        addLog("JSON do Fluxo gerado com sucesso.", "success");
      } else {
        finalPayload = data;
        addLog("Usando dados brutos da análise.", "success");
      }

      const payloadLabel =
        payloadType === "flow" ? "JSON do Fluxo" : 
        payloadType === "site" ? "Site Pronto (HTML)" : "Dados da Análise";

      addLog(
        `Enviando ${payloadLabel} para o endpoint: ${endpointUrl}...`,
        "info",
      );
      
      // Don't log the full HTML if it's a site payload to keep logs readable
      if (payloadType === "site") {
        addLog(`Payload: { name: "${finalPayload.name}", html: "... [HTML Gerado] ..." }`, "info");
      } else {
        addLog(
          `Payload que será enviado:\n${JSON.stringify(finalPayload, null, 2)}`,
          "info"
        );
      }
      const endpointRes = await fetch("/api/proxy-webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: endpointUrl,
          payload: finalPayload,
          method: endpointMethod,
          authToken: authToken,
        }),
      });

      if (endpointRes.status === 401 || endpointRes.status === 403) {
        logout();
        navigate("/login");
        return;
      }

      if (endpointRes.ok) {
        const resData = await endpointRes.json();
        if (resData.success) {
          setEndpointResult({ success: true });
          const successMsg = 
            payloadType === "flow" ? "JSON do Fluxo enviado com sucesso." :
            payloadType === "site" ? "Site (HTML) enviado com sucesso." :
            "Dados enviados com sucesso.";
            
          addLog(successMsg, "success");
          // Increment usage after successful send
          try {
            await fetch('/api/gemini-usage/increment', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` }
            });
            await fetchGeminiUsage();
          } catch (e) {
            console.error('Error incrementing usage:', e);
          }
          // Update status to 'produção' after successful send
          await handleUpdateStatus(endpointModal.site.id, "produção");
        } else {
          const errorMsg = resData.error || "Erro desconhecido no proxy";
          setEndpointResult({ success: false, error: errorMsg });
          addLog(`Erro ao enviar para o endpoint: ${errorMsg}`, "error");
        }
      } else {
        const resData = await endpointRes.json().catch(() => ({}));
        const errorMsg = resData.error || `Erro HTTP: ${endpointRes.status}`;
        setEndpointResult({ success: false, error: errorMsg });
        addLog(`Erro ao enviar para o endpoint: ${errorMsg}`, "error");
      }

      addLog("Processo de envio finalizado.", "info");
    } catch (error: any) {
      console.error("Endpoint error:", error);
      const errorMsg = error.message || "Falha na conexão com o endpoint";
      setEndpointResult({ success: false, error: errorMsg });
      addLog(`Falha na conexão com o endpoint: ${errorMsg}`, "error");
    } finally {
      setIsSending(false);
    }
  };

  const renderLogs = () => {
    if (processLogs.length === 0) return null;
    return (
      <div className="mt-6 bg-zinc-900 rounded-xl p-4 border border-zinc-800 font-mono text-xs shadow-inner overflow-hidden">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800">
          <Terminal className="w-4 h-4 text-zinc-400" />
          <span className="text-zinc-300 font-semibold uppercase tracking-wider">
            Logs do Processo
          </span>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
          {processLogs.map((log, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-zinc-500 shrink-0">[{log.time}]</span>
              <span
                className={`whitespace-pre-wrap ${
                  log.type === "success"
                    ? "text-emerald-400"
                    : log.type === "error"
                      ? "text-red-400"
                      : "text-blue-300"
                }`}
              >
                {log.message}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* View Details Modal */}
      {viewModal.isOpen && viewModal.site && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/50 p-4">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b pb-4">
              <h3 className="text-xl font-semibold text-zinc-900">
                Detalhes da Análise
              </h3>
              <button
                onClick={() => setViewModal({ isOpen: false, site: null })}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-zinc-500">
                  Nome da Empresa
                </h4>
                <p className="mt-1 text-base text-zinc-900">
                  {viewModal.site.name}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-zinc-500">
                    Telefone
                  </h4>
                  <p className="mt-1 text-base text-zinc-900">
                    {viewModal.site.phone || "N/A"}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-zinc-500">Cidade</h4>
                  <p className="mt-1 text-base text-zinc-900">
                    {viewModal.site.city || "N/A"}
                  </p>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-zinc-500">Endereço</h4>
                <p className="mt-1 text-base text-zinc-900">
                  {viewModal.site.address || "N/A"}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-zinc-500">Descrição</h4>
                <p className="mt-1 text-base text-zinc-900">
                  {viewModal.site.description || "N/A"}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-zinc-500">Serviços</h4>
                <p className="mt-1 text-base text-zinc-900">
                  {viewModal.site.services || "N/A"}
                </p>
              </div>
              {viewModal.site.map_link && (
                <div>
                  <h4 className="text-sm font-medium text-zinc-500">
                    Link do Google Maps
                  </h4>
                  <a
                    href={viewModal.site.map_link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 text-base text-emerald-600 hover:underline break-all"
                  >
                    {viewModal.site.map_link}
                  </a>
                </div>
              )}
              {viewModal.site.hosting_url && (
                <div>
                  <h4 className="text-sm font-medium text-zinc-500">
                    Link de Hospedagem
                  </h4>
                  <a
                    href={viewModal.site.hosting_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 text-base text-blue-600 hover:underline break-all flex items-center gap-1"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {viewModal.site.hosting_url}
                  </a>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-zinc-500">
                    Data de Criação
                  </h4>
                  <p className="mt-1 text-base text-zinc-900">
                    {new Date(viewModal.site.created_at).toLocaleDateString(
                      "pt-BR",
                    )}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-zinc-500">Status</h4>
                  <div className="mt-1 flex items-center gap-2">
                    {getStatusBadge(viewModal.site.status)}
                    {user?.role === "admin" && (
                      <select
                        value={viewModal.site.status || "prospectado"}
                        onChange={(e) =>
                          handleUpdateStatus(viewModal.site.id, e.target.value)
                        }
                        className="ml-2 text-xs border rounded px-1 py-0.5 bg-white"
                      >
                        <option value="prospectado">Prospectado</option>
                        <option value="produção">Produção</option>
                        <option value="vendas">Vendas</option>
                        <option value="produzido">Produzido</option>
                        <option value="contato">Em Contato</option>
                        <option value="fechado">Fechado</option>
                        <option value="negado">Negado</option>
                      </select>
                    )}
                    {user?.sector === "Vendas" && user?.role !== "admin" && (
                      <select
                        value={viewModal.site.status || "vendas"}
                        onChange={(e) =>
                          handleUpdateStatus(viewModal.site.id, e.target.value)
                        }
                        className="ml-2 text-xs border rounded px-1 py-0.5 bg-white"
                      >
                        <option value="vendas" disabled>Vendas</option>
                        <option value="produzido" disabled>Produzido</option>
                        <option value="contato">Em Contato</option>
                        <option value="fechado">Fechado</option>
                        <option value="negado">Negado</option>
                      </select>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-zinc-500">
                  Expira em
                </h4>
                <p
                  className={`mt-1 text-base font-medium ${new Date(viewModal.site.expires_at) < new Date() ? "text-red-600" : "text-emerald-600"}`}
                >
                  {new Date(viewModal.site.expires_at).toLocaleDateString(
                    "pt-BR",
                  )}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-zinc-500">
                  Arquivo JSON
                </h4>
                <div className="mt-1 flex items-center gap-2">
                  <FileJson className="w-4 h-4 text-emerald-600" />
                  <span className="text-base text-zinc-900">
                    {viewModal.site.slug}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3 border-t pt-4">
                {(user?.role === "admin" || user?.sector === "Produção") && (
                  <button
                    onClick={() => {
                      setEndpointModal({ isOpen: true, site: viewModal.site });
                      setViewModal({ isOpen: false, site: null });
                    }}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Regenerar / Enviar
                  </button>
                )}
                {user?.sector === "Vendas" && (
                  <button
                    onClick={async () => {
                      const settingsRes = await fetch('/api/settings', {
                        headers: { Authorization: `Bearer ${token}` }
                      });
                      let initialMessage = "";
                      if (settingsRes.ok) {
                        const settings = await settingsRes.json();
                        initialMessage = settings.sales_message_template || "";
                      }
                      setSalesMessageModal({
                        isOpen: true,
                        site: viewModal.site,
                        message: initialMessage,
                        isGenerating: false
                      });
                      setViewModal({ isOpen: false, site: null });
                    }}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 flex items-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Abordar Cliente
                  </button>
                )}
              <button
                onClick={() => handleCopyJsonToClipboard(viewModal.site)}
                disabled={isCopying}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
              >
                {copiedJsonId === viewModal.site.id ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copiedJsonId === viewModal.site.id
                  ? "Copiado!"
                  : "Copiar JSON"}
              </button>
              <button
                onClick={() => handleDownloadJson(viewModal.site.slug)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Baixar JSON
              </button>
              <button
                onClick={() => setViewModal({ isOpen: false, site: null })}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Endpoint Modal */}
      {endpointModal.isOpen && endpointModal.site && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/50 p-4">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b pb-4">
              <h3 className="text-xl font-semibold text-zinc-900">
                Enviar para Endpoint
              </h3>
              <button
                onClick={() => {
                  setEndpointModal({ isOpen: false, site: null });
                  setProcessLogs([]);
                  setEndpointResult(null);
                  setEndpointUrl("");
                  setAuthToken("");
                }}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-sm text-zinc-600 mb-4">
                Você está prestes a gerar o Fluxo JSON para{" "}
                <strong>{endpointModal.site.name}</strong> e enviá-lo para um
                endpoint.
              </p>
              
              {geminiUsage && user?.role === "admin" && (
                <div className="mb-6 bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <p className="text-xs font-medium text-blue-900 mb-1">
                    Uso da API Gemini hoje: {geminiUsage.count} / {geminiUsage.limit} requisições
                  </p>
                  <div className="w-full bg-blue-200/50 rounded-full h-1.5">
                    <div 
                      className={`h-1.5 rounded-full ${geminiUsage.count >= geminiUsage.limit ? 'bg-red-500' : 'bg-blue-600'}`} 
                      style={{ width: `${Math.min((geminiUsage.count / geminiUsage.limit) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSendToEndpoint}>
                {(user?.role === 'admin' || user?.sector === 'Produção') && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-zinc-900 mb-2">
                      Template de Fluxo
                    </label>
                    <select
                      value={selectedTemplateId || ""}
                      onChange={(e) => setSelectedTemplateId(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                    >
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      O template define o prompt da IA e a estrutura do fluxo.
                    </p>
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-sm font-medium text-zinc-900 mb-2">
                    Tipo de Dados para Enviar
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPayloadType("flow")}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all ${payloadType === "flow" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"}`}
                    >
                      <FileJson className="w-5 h-5 mb-1" />
                      <span className="text-[10px] font-bold">Fluxo JSON</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayloadType("site")}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all ${payloadType === "site" ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"}`}
                    >
                      <Sparkles className="w-5 h-5 mb-1" />
                      <span className="text-[10px] font-bold">Site (HTML)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayloadType("data")}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all ${payloadType === "data" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"}`}
                    >
                      <CheckCircle className="w-5 h-5 mb-1" />
                      <span className="text-[10px] font-bold">Apenas Dados</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-zinc-900">
                    URL do Endpoint
                  </label>
                  <button
                    type="button"
                    onClick={() => setEndpointUrl(DEFAULT_ENDPOINT)}
                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-2 py-1 rounded"
                  >
                    <Send className="w-3 h-3" /> Usar Endpoint Padrão
                  </button>
                </div>
                <div className="flex gap-3">
                  <select
                    value={endpointMethod}
                    onChange={(e) => setEndpointMethod(e.target.value)}
                    className="focus:ring-blue-500 focus:border-blue-500 block sm:text-sm border-zinc-300 rounded-md shadow-sm px-3 py-2 border bg-white"
                  >
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="GET">GET</option>
                  </select>
                  <input
                    type="url"
                    value={endpointUrl}
                    onChange={(e) => setEndpointUrl(e.target.value)}
                    placeholder="https://seu-endpoint.com/api/upload"
                    required
                    className="flex-1 focus:ring-blue-500 focus:border-blue-500 block sm:text-sm border-zinc-300 rounded-md shadow-sm px-3 py-2 border bg-white"
                  />
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-zinc-900 mb-1">
                    Token de Autenticação (Opcional)
                  </label>
                  <input
                    type="text"
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    placeholder="Bearer token ou API Key"
                    className="w-full focus:ring-blue-500 focus:border-blue-500 block sm:text-sm border-zinc-300 rounded-md shadow-sm px-3 py-2 border bg-white"
                  />
                  <p className="mt-1 text-[10px] text-zinc-500">
                    Se o seu servidor exigir um cabeçalho Authorization ou
                    x-api-key, insira-o aqui.
                  </p>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      if (endpointModal.site) {
                        addLog("Gerando prompt e JSON do Fluxo com base no template selecionado...", "info");
                        const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0];
                        
                        // Fetch full data first
                        const res = await fetch(`/api/analyze/download/${endpointModal.site.slug}`, {
                          headers: { Authorization: `Bearer ${token}` },
                        });
                        if (!res.ok) {
                          addLog("Erro ao buscar dados da análise.", "error");
                          return;
                        }
                        const data = await res.json();

                        let apiKey = "";
                        try {
                          const settingsRes = await fetch('/api/settings', {
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          if (settingsRes.ok) {
                            const settings = await settingsRes.json();
                            if (settings.gemini_api_key) {
                              apiKey = settings.gemini_api_key;
                            }
                          }
                        } catch (e) {
                          console.error("Error fetching settings:", e);
                        }

                        const promptText = selectedTemplate 
                          ? generatePromptWithTemplate(data, endpointModal.site.map_link || "", selectedTemplate.prompt_template)
                          : generatePrompt(data, endpointModal.site.map_link || "");
                          
                        const flowJson = generateFlowJson(
                          promptText, 
                          endpointModal.site.name, 
                          endpointModal.site.id, 
                          data,
                          selectedTemplate?.flow_structure,
                          apiKey
                        );
                        
                        setGeneratedFlowJson(flowJson);
                        setShowFlowJson(true);
                        addLog(`Template utilizado: ${selectedTemplate?.name || "Padrão"}`, "success");
                        
                        // Increment usage since they generated the flow
                        try {
                          await fetch('/api/gemini-usage/increment', {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          await fetchGeminiUsage();
                        } catch (e) {
                          console.error('Error incrementing usage:', e);
                        }
                      }
                    }}
                    className="inline-flex justify-center items-center py-2 px-4 border border-zinc-300 shadow-sm text-sm font-medium rounded-md text-zinc-700 bg-white hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <FileJson className="w-4 h-4 mr-2 text-blue-600" />
                    Ver JSON do Fluxo
                  </button>
                  <button
                    type="submit"
                    disabled={isSending || !endpointUrl}
                    className="inline-flex justify-center items-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {isSending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Enviar
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {endpointResult && (
              <div
                className={`rounded-xl p-4 mb-6 border ${endpointResult.success ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${endpointResult.success ? "bg-emerald-100" : "bg-red-100"}`}
                  >
                    {endpointResult.success ? (
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                    )}
                  </div>
                  <div>
                    <h4
                      className={`font-medium text-sm ${endpointResult.success ? "text-emerald-900" : "text-red-900"}`}
                    >
                      {endpointResult.success ? "Sucesso" : "Falha no Envio"}
                    </h4>
                    <p
                      className={`text-xs ${endpointResult.success ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {endpointResult.success
                        ? "O fluxo JSON foi enviado com sucesso para o endpoint configurado."
                        : endpointResult.error}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {renderLogs()}

            <div className="mt-6 flex justify-end border-t pt-4">
              <button
                onClick={() => {
                  setEndpointModal({ isOpen: false, site: null });
                  setProcessLogs([]);
                  setEndpointResult(null);
                  setEndpointUrl("");
                }}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flow JSON Preview Modal */}
      {showFlowJson && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/60 p-4">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 border-b pb-4">
              <div className="flex items-center gap-2">
                <FileJson className="w-5 h-5 text-emerald-600" />
                <h3 className="text-xl font-semibold text-zinc-900">
                  Preview do JSON do Fluxo
                </h3>
              </div>
              <button
                onClick={() => setShowFlowJson(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-zinc-950 rounded-xl p-4 font-mono text-xs text-emerald-400 custom-scrollbar">
              <pre>{JSON.stringify(generatedFlowJson, null, 2)}</pre>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t pt-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    JSON.stringify(generatedFlowJson, null, 2),
                  );
                  // Could add a temporary toast here
                }}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copiar JSON
              </button>
              <button
                onClick={() => setShowFlowJson(false)}
                className="rounded-lg bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      {alertModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/50 p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-900">Aviso</h3>
              <button
                onClick={() => setAlertModal({ isOpen: false, message: "" })}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-zinc-600 mb-6">{alertModal.message}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setAlertModal({ isOpen: false, message: "" })}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/50 p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900">
                Excluir Análise
              </h3>
            </div>
            <p className="text-zinc-600 mb-6">
              Tem certeza que deseja excluir esta análise? O arquivo JSON será
              apagado.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal({ isOpen: false, id: null })}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hosting URL Modal */}
      {hostingUrlModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/50 p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <ExternalLink className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900">
                Finalizar Produção
              </h3>
            </div>
            <p className="text-zinc-600 mb-4">
              Insira o link de hospedagem do site criado para <strong>{hostingUrlModal.site?.name}</strong>.
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Link de Hospedagem</label>
              <input 
                type="url"
                value={hostingUrlModal.url}
                onChange={(e) => setHostingUrlModal(prev => ({ ...prev, url: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="https://site-cliente.com"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setHostingUrlModal({ isOpen: false, site: null, url: "" })}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  await handleUpdateStatus(hostingUrlModal.site.id, 'vendas', hostingUrlModal.url);
                  setHostingUrlModal({ isOpen: false, site: null, url: "" });
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Enviar para Vendas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sales Message Modal */}
      {salesMessageModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/50 p-4">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4 border-b pb-4">
              <h3 className="text-xl font-semibold text-zinc-900 flex items-center gap-2">
                <MessageSquare className="w-6 h-6 text-purple-600" />
                Abordagem de Vendas
              </h3>
              <button
                onClick={() => setSalesMessageModal({ isOpen: false, site: null, message: "", isGenerating: false })}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-zinc-50 p-4 rounded-lg border border-zinc-200">
                <h4 className="text-sm font-bold text-zinc-900 mb-1">{salesMessageModal.site?.name}</h4>
                <p className="text-xs text-zinc-600">{salesMessageModal.site?.description}</p>
                {salesMessageModal.site?.hosting_url && (
                  <a 
                    href={salesMessageModal.site.hosting_url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline mt-2 flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" /> Ver Site Produzido
                  </a>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-zinc-700">Mensagem de Abordagem</label>
                  <button
                    onClick={() => handleGenerateAiMessage(salesMessageModal.site.id)}
                    disabled={salesMessageModal.isGenerating}
                    className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1 bg-purple-50 px-2 py-1 rounded disabled:opacity-50"
                  >
                    <Sparkles className={`w-3 h-3 ${salesMessageModal.isGenerating ? 'animate-pulse' : ''}`} />
                    {salesMessageModal.isGenerating ? 'Gerando...' : 'Melhorar com IA'}
                  </button>
                </div>
                <textarea
                  value={salesMessageModal.message}
                  onChange={(e) => setSalesMessageModal(prev => ({ ...prev, message: e.target.value }))}
                  rows={8}
                  className="w-full px-3 py-2 border rounded-md focus:ring-purple-500 focus:border-purple-500 text-sm"
                  placeholder="Escreva sua mensagem aqui..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t pt-4">
              <button
                onClick={() => setSalesMessageModal({ isOpen: false, site: null, message: "", isGenerating: false })}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleSendWhatsApp(salesMessageModal.site.phone, salesMessageModal.message)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Enviar WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-zinc-900">Análises Salvas</h1>
        {(user?.role === 'admin' || user?.sector === 'Prospecção') && (
          <Link
            to="/create"
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700"
          >
            Nova Análise
          </Link>
        )}
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        {/* Mobile View */}
        <div className="block sm:hidden">
          <ul className="divide-y divide-zinc-200">
            {sites.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-zinc-500">
                <p className="mb-4">Nenhuma análise realizada ainda.</p>
                {(user?.role === 'admin' || user?.sector === 'Prospecção') && (
                  <Link
                    to="/create"
                    className="text-emerald-600 font-medium hover:underline"
                  >
                    Faça sua primeira análise
                  </Link>
                )}
              </li>
            ) : (
              sites.map((site: any) => (
                <li key={site.id} className="px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-900 truncate">
                        {site.name}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">
                        {site.city}
                      </p>
                      <p className="text-xs font-medium text-emerald-600 mt-1">
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
                  <div className="mt-2 flex justify-between items-center">
                    <div className="flex items-center text-sm text-zinc-500">
                      <FileJson className="flex-shrink-0 mr-1.5 h-4 w-4 text-emerald-600" />
                      <span className="truncate max-w-[150px]">
                        {site.slug}
                      </span>
                    </div>
                      <div className="flex items-center space-x-3">
                        {(user?.role === "admin" || user?.sector === "Produção") && (
                          <button
                            onClick={() => setEndpointModal({ isOpen: true, site })}
                            className="text-blue-600 hover:text-blue-900 flex items-center p-1"
                            title="Regenerar / Enviar"
                          >
                            <RefreshCw className="w-5 h-5" />
                          </button>
                        )}
                        {user?.sector === "Produção" && site.status === 'prospectado' && (
                          <button
                            onClick={() => handleUpdateStatus(site.id, 'produção')}
                            className="text-blue-600 hover:text-blue-900 flex items-center p-1"
                            title="Iniciar Produção"
                          >
                            <Play className="w-5 h-5" />
                          </button>
                        )}
                        {user?.sector === "Produção" && site.status === 'produção' && (
                          <button
                            onClick={() => setHostingUrlModal({ isOpen: true, site, url: "" })}
                            className="text-emerald-600 hover:text-emerald-900 flex items-center p-1"
                            title="Finalizar Produção"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                        )}
                        {user?.sector === "Vendas" && ['vendas', 'produzido', 'contato'].includes(site.status) && (
                          <>
                            {site.map_link && (
                              <a
                                href={site.map_link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:text-blue-900 flex items-center p-1"
                                title="Abrir Google Maps"
                              >
                                <ExternalLink className="w-5 h-5" />
                              </a>
                            )}
                            {site.hosting_url && (
                              <a
                                href={site.hosting_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-600 hover:text-emerald-900 flex items-center p-1"
                                title="Abrir Site Hospedado"
                              >
                                <ExternalLink className="w-5 h-5" />
                              </a>
                            )}
                            <button
                              onClick={async () => {
                                const settingsRes = await fetch('/api/settings', {
                                  headers: { Authorization: `Bearer ${token}` }
                                });
                                let initialMessage = "";
                                if (settingsRes.ok) {
                                  const settings = await settingsRes.json();
                                  initialMessage = settings.sales_message_template || "";
                                }
                                setSalesMessageModal({
                                  isOpen: true,
                                  site,
                                  message: initialMessage,
                                  isGenerating: false
                                });
                              }}
                              className="text-purple-600 hover:text-purple-900 flex items-center p-1"
                              title="Abordar Cliente"
                            >
                              <MessageSquare className="w-5 h-5" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setViewModal({ isOpen: true, site })}
                          className="text-zinc-600 hover:text-zinc-900 flex items-center p-1"
                          title="Ver Detalhes"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDownloadJson(site.slug)}
                          className="text-emerald-600 hover:text-emerald-900 flex items-center p-1"
                          title="Baixar JSON"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                        {(user?.role === "admin" || site.user_id === user?.id) && (
                          <button
                            onClick={() =>
                              setDeleteModal({ isOpen: true, id: site.id })
                            }
                            className="text-red-600 hover:text-red-900 flex items-center p-1"
                            title="Excluir"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Desktop View */}
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
                  Expiração
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Data
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
              {sites.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-12 text-center text-sm text-zinc-500"
                  >
                    <p className="mb-4">Nenhuma análise realizada ainda.</p>
                    <Link
                      to="/create"
                      className="text-emerald-600 font-medium hover:underline"
                    >
                      Faça sua primeira análise
                    </Link>
                  </td>
                </tr>
              ) : (
                sites.map((site: any) => {
                  return (
                    <tr key={site.id} className="hover:bg-zinc-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-zinc-900">
                          {site.name}
                        </div>
                        <div className="text-sm text-zinc-500">{site.city}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900">
                          {site.creator_name || "N/A"}
                        </div>
                        {site.creator_sector && (
                          <div className="text-xs text-zinc-500">
                            {site.creator_sector}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <FileJson className="w-4 h-4 text-emerald-600" />
                          <span className="text-sm text-zinc-600">
                            {site.slug}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            new Date(site.expires_at) < new Date()
                              ? "bg-red-100 text-red-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {new Date(site.expires_at).toLocaleDateString(
                            "pt-BR",
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {new Date(site.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(site.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-3">
                          {(user?.role === "admin" || user?.sector === "Produção") && (
                            <button
                              onClick={() => setEndpointModal({ isOpen: true, site })}
                              className="text-purple-600 hover:text-purple-900 flex items-center"
                              title="Regenerar / Enviar"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          )}
                          {user?.sector === "Produção" && site.status === 'prospectado' && (
                            <button
                              onClick={() => handleUpdateStatus(site.id, 'produção')}
                              className="text-blue-600 hover:text-blue-900 flex items-center"
                              title="Iniciar Produção"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                          {user?.sector === "Produção" && site.status === 'produção' && (
                            <button
                              onClick={() => setHostingUrlModal({ isOpen: true, site, url: "" })}
                              className="text-emerald-600 hover:text-emerald-900 flex items-center"
                              title="Finalizar Produção"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          {user?.sector === "Vendas" && ['vendas', 'produzido', 'contato'].includes(site.status) && (
                            <>
                              {site.map_link && (
                                <a
                                  href={site.map_link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 hover:text-blue-900 flex items-center"
                                  title="Abrir Google Maps"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                              {site.hosting_url && (
                                <a
                                  href={site.hosting_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-emerald-600 hover:text-emerald-900 flex items-center"
                                  title="Abrir Site Hospedado"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                              <button
                                onClick={async () => {
                                  const settingsRes = await fetch('/api/settings', {
                                    headers: { Authorization: `Bearer ${token}` }
                                  });
                                  let initialMessage = "";
                                  if (settingsRes.ok) {
                                    const settings = await settingsRes.json();
                                    initialMessage = settings.sales_message_template || "";
                                  }
                                  setSalesMessageModal({
                                    isOpen: true,
                                    site,
                                    message: initialMessage,
                                    isGenerating: false
                                  });
                                }}
                                className="text-purple-600 hover:text-purple-900 flex items-center"
                                title="Abordar Cliente"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setAlertModal({ 
                                    isOpen: true, 
                                    message: "Para fechar o negócio, utilize a opção de atualizar o status para 'fechado' nos detalhes da análise ou entre em contato com o administrador." 
                                  });
                                }}
                                className="text-emerald-600 hover:text-emerald-900 flex items-center"
                                title="Fechar Negócio"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setViewModal({ isOpen: true, site })}
                            className="text-blue-600 hover:text-blue-900 flex items-center"
                            title="Ver Detalhes"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDownloadJson(site.slug)}
                            className="text-emerald-600 hover:text-emerald-900 flex items-center"
                            title="Baixar JSON"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {(user?.role === "admin" || site.user_id === user?.id) && (
                            <button
                              onClick={() =>
                                setDeleteModal({ isOpen: true, id: site.id })
                              }
                              className="text-red-600 hover:text-red-900 flex items-center"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
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
