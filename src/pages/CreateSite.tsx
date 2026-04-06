import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  Sparkles,
  CheckCircle,
  Download,
  FileJson,
  Copy,
  AlertTriangle,
  Send,
  Terminal,
} from "lucide-react";
import { GoogleGenAI, Type } from "@google/genai";
import { generatePrompt, generateFlowJson, fillTemplate } from "../utils/flowGenerator";

export default function CreateSite() {
  const { token, logout, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && user.role !== "admin" && user.sector !== "Prospecção") {
      navigate("/sites");
    }
  }, [user, navigate]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [mapsLink, setMapsLink] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [defaultEndpointFromSettings, setDefaultEndpointFromSettings] = useState("");
  const DEFAULT_ENDPOINT = defaultEndpointFromSettings || "https://flowpost.onrender.com/api/upload";
  const [endpointMethod, setEndpointMethod] = useState("POST");
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [successData, setSuccessData] = useState<{
    filename: string;
    id: number;
    data: any;
    flowJson?: any;
    endpointSuccess?: boolean;
    endpointError?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedFlow, setCopiedFlow] = useState(false);
  const [processLogs, setProcessLogs] = useState<
    { time: string; message: string; type: "info" | "success" | "error" }[]
  >([]);
  const [geminiUsage, setGeminiUsage] = useState<{ count: number; limit: number } | null>(null);

  const [inputMode, setInputMode] = useState<"auto" | "manual">("auto");
  const [manualData, setManualData] = useState({
    name: "",
    phone: "",
    address: "",
    city: "",
    description: "",
    services: "",
    niche: ""
  });

  useEffect(() => {
    fetchTemplates();
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
      const res = await fetch('/api/templates', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
        if (data.length > 0) {
          setSelectedTemplateId(data[0].id.toString());
        }
      }
    } catch (err) {
      console.error('Error fetching templates:', err);
    }
  };

  const addLog = (
    message: string,
    type: "info" | "success" | "error" = "info",
  ) => {
    setProcessLogs((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString(), message, type },
    ]);
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMode === "auto" && !mapsLink) {
      setError("Por favor, insira um link do Google Maps.");
      return;
    }
    if (inputMode === "manual" && !manualData.name) {
      setError("Por favor, insira o nome da empresa.");
      return;
    }

    setIsLoading(true);
    setError("");
    setProcessLogs([]);
    
    let extractedData: any = null;
    let finalUrl = mapsLink || "https://maps.google.com"; // Fallback for manual mode
    const isUrl = finalUrl.startsWith('http://') || finalUrl.startsWith('https://');

    try {
      // 1. Get API Key from settings or environment
      addLog("Obtendo chave da API do Gemini...", "info");
      let apiKey = "";

      try {
        const settingsRes = await fetch("/api/settings", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (settingsRes.status === 401 || settingsRes.status === 403) {
          logout();
          navigate("/login");
          throw new Error("Sessão expirada. Por favor, faça login novamente.");
        }

        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (settings.gemini_api_key) {
            apiKey = settings.gemini_api_key.trim();
            addLog(
              "Chave da API obtida das configurações do banco.",
              "success",
            );
          }
        }
      } catch (e) {
        console.error("Error fetching settings:", e);
      }

      if (!apiKey) {
        // Fallback to environment variable
        apiKey =
          import.meta.env.VITE_GEMINI_API_KEY ||
          "";
        if (apiKey) {
          addLog("Chave da API obtida das variáveis de ambiente.", "success");
        }
      }

      if (!apiKey) {
        addLog("Chave da API do Gemini não configurada.", "error");
        setError(
          "Chave da API do Gemini não configurada. Por favor, configure-a na página de Configurações.",
        );
        setIsLoading(false);
        return;
      }

      apiKey = apiKey.trim();

      if (inputMode === "auto") {
        addLog("Iniciando análise do link...", "info");
        // 2. Expand the URL if it's a short link
        let placeNameHint = "";
        if (isUrl) {
          addLog("Verificando e expandindo URL...", "info");
          try {
            const expandRes = await fetch("/api/expand-url", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ url: mapsLink }),
            });

            if (expandRes.status === 401 || expandRes.status === 403) {
              logout();
              navigate("/login");
              throw new Error("Sessão expirada. Por favor, faça login novamente.");
            }

            if (expandRes.ok) {
              const expandData = await expandRes.json();
              if (expandData.url) {
                finalUrl = expandData.url;
                addLog("URL expandida com sucesso.", "success");

                // Try to extract place name from the expanded URL
                const match = finalUrl.match(/\/place\/([^\/]+)/);
                if (match && match[1]) {
                  placeNameHint = decodeURIComponent(match[1].replace(/\+/g, " "));
                  addLog(`Dica de nome encontrada: ${placeNameHint}`, "info");
                }
              }
            }
          } catch (e) {
            console.warn("Failed to expand URL, using original", e);
            addLog("Falha ao expandir URL, usando a original.", "info");
          }
        }

        // 3. Analyze with AI
        addLog("Iniciando extração de dados com IA (Gemini)...", "info");
        const ai = new GoogleGenAI({ apiKey: apiKey });
        
        const inputContext = isUrl 
          ? `Você recebeu o seguinte link do Google Maps: ${finalUrl}\n${placeNameHint ? `Dica: O nome do estabelecimento extraído da URL parece ser "${placeNameHint}".` : ""}`
          : `Você recebeu as seguintes informações sobre a empresa:\n"${finalUrl}"`;

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Você é um especialista em extração de dados.
${inputContext}

Sua missão é OBRIGATÓRIA:
1. Analise cuidadosamente as informações fornecidas para identificar o estabelecimento.
2. Descubra EXATAMENTE qual é o estabelecimento real (nome, nicho, endereço, telefone).
3. Se a entrada for muito genérica, sem sentido, ou se você NÃO TIVER 100% DE CERTEZA de qual é o estabelecimento exato, você DEVE definir "success" como false e preencher o "errorMessage" explicando que não foi possível identificar o local.
4. Se você encontrou o estabelecimento com sucesso, defina "success" as true e extraia os dados reais: Nome da empresa, telefone (apenas números com DDD), endereço completo e cidade.
5. Identifique o NICHO exato (ex: barbearia, lanchonete, clínica, restaurante).
6. Crie uma DESCRIÇÃO detalhada do negócio.
7. Liste os principais serviços oferecidos (ou que fazem sentido para o nicho), separados por vírgula.

RETORNE OS DADOS EM UM BLOCO DE CÓDIGO JSON com a seguinte estrutura exata:
\`\`\`json
{
  "success": true/false,
  "errorMessage": "mensagem de erro se success for false",
  "name": "Nome da Empresa",
  "phone": "Telefone",
  "address": "Endereço Completo",
  "city": "Cidade",
  "description": "Descrição",
  "services": "Serviços",
  "niche": "Nicho"
}
\`\`\`

NÃO INVENTE DADOS. Se não souber ou não encontrar o local exato, retorne success: false.`,
          config: {
            tools: [{ googleMaps: {} }],
          },
        });

        // Increment usage after successful call
        try {
          await fetch('/api/gemini-usage/increment', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          });
          fetchGeminiUsage(); // Refresh usage display
        } catch (e) {
          console.error('Error incrementing usage:', e);
        }

        let responseText = '{}';
        try {
          responseText = response.text || '{}';
        } catch (e: any) {
          console.error('Error getting response text:', e);
          throw new Error('A resposta da IA foi bloqueada ou retornou vazia. Tente um link diferente.');
        }

        if (responseText) {
          try {
            // Extract JSON from code block if present
            const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/```([\s\S]*?)```/);
            const cleanText = jsonMatch ? jsonMatch[1] : responseText
              .replace(/```json/gi, "")
              .replace(/```/g, "")
              .trim();
            extractedData = JSON.parse(cleanText);
            addLog("Dados extraídos e parseados com sucesso.", "success");
          } catch (parseError) {
            addLog("Falha ao fazer parse do JSON retornado pela IA.", "error");
            console.error(
              "JSON Parse Error:",
              parseError,
              "Raw text:",
              responseText,
            );
            throw new Error(
              "A resposta da IA não estava em um formato válido. Tente novamente.",
            );
          }

          if (!extractedData.success) {
            addLog("A IA não conseguiu identificar o estabelecimento.", "error");
            setError(
              extractedData.errorMessage ||
                "Não foi possível identificar o estabelecimento a partir deste link. Por favor, verifique o link.",
            );
            setIsLoading(false);
            return;
          }
        }
      } else {
        // Manual Mode
        addLog("Usando dados preenchidos manualmente...", "info");
        extractedData = {
          success: true,
          name: manualData.name,
          phone: manualData.phone,
          address: manualData.address,
          city: manualData.city,
          description: manualData.description,
          services: manualData.services,
          niche: manualData.niche
        };
      }

      // 4. Save the extracted data
      addLog("Salvando dados extraídos no banco de dados...", "info");
      const saveRes = await fetch("/api/analyze/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...extractedData,
          map_link: isUrl ? mapsLink : "",
        }),
      });

      let saveData;
      try {
        saveData = await saveRes.json();
      } catch (e) {
        addLog("Erro ao ler resposta do salvamento.", "error");
        throw new Error(
          `Erro no servidor ao salvar os dados (Status: ${saveRes.status}). O servidor pode estar indisponível ou ocorreu um erro interno.`,
        );
      }

      if (!saveRes.ok) {
        addLog("Erro ao salvar dados no banco.", "error");
        if (saveRes.status === 401 || saveRes.status === 403) {
          logout();
          navigate("/login");
          throw new Error(
            "Sessão expirada. Por favor, faça login novamente.",
          );
        }
        throw new Error(saveData.error || "Erro ao salvar dados");
      }
      addLog("Dados salvos com sucesso no banco de dados.", "success");

      // 5. Generate Flow JSON
      addLog("Gerando prompt Mobile First e JSON do Fluxo...", "info");
      
      const selectedTemplate = templates.find(t => t.id.toString() === selectedTemplateId);
      let promptText = "";
      let flowStructure = "";
      
      if (selectedTemplate) {
        promptText = fillTemplate(selectedTemplate.prompt_template, extractedData, isUrl ? mapsLink : "");
        flowStructure = selectedTemplate.flow_structure;
        addLog(`Usando template: ${selectedTemplate.name}`, "info");
      } else {
        promptText = generatePrompt(extractedData, isUrl ? mapsLink : "");
        addLog("Usando template padrão (fallback)", "info");
      }

      const flowJson = generateFlowJson(promptText, extractedData.name, saveData.id, extractedData, flowStructure, apiKey);
      addLog("JSON do Fluxo gerado com sucesso.", "success");

      let endpointSuccess = false;
      let endpointError = "";

      // 6. Send to Endpoint if provided
      if (endpointUrl) {
        addLog(
          `Enviando JSON do Fluxo para o endpoint: ${endpointUrl}...`,
          "info",
        );
        addLog(
          `Payload que será enviado:\n${JSON.stringify(flowJson, null, 2)}`,
          "info"
        );
        try {
          const endpointRes = await fetch("/api/proxy-webhook", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              url: endpointUrl,
              payload: flowJson,
              method: endpointMethod,
            }),
          });

          if (endpointRes.status === 401 || endpointRes.status === 403) {
            logout();
            navigate("/login");
            throw new Error(
              "Sessão expirada. Por favor, faça login novamente.",
            );
          }

          if (endpointRes.ok) {
            const resData = await endpointRes.json();
            if (resData.success) {
              endpointSuccess = true;
              addLog(
                "JSON do Fluxo enviado com sucesso para o endpoint.",
                "success",
              );

              // Update status to produção
              try {
                await fetch(`/api/sites/${saveData.id}/status`, {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ status: "produção" }),
                });
                addLog("Status atualizado para Produção.", "success");
              } catch (statusErr) {
                console.error("Error updating status:", statusErr);
              }
            } else {
              endpointError = resData.error || "Erro desconhecido no proxy";
              addLog(
                `Erro ao enviar para o endpoint: ${endpointError}`,
                "error",
              );
            }
          } else {
            const resData = await endpointRes.json().catch(() => ({}));
            endpointError =
              resData.error || `Erro HTTP: ${endpointRes.status}`;
            addLog(
              `Erro ao enviar para o endpoint: ${endpointError}`,
              "error",
            );
          }
        } catch (e: any) {
          endpointError = e.message || "Falha na conexão com o endpoint";
          addLog(
            `Falha na conexão com o endpoint: ${endpointError}`,
            "error",
          );
        }
      }

      if (endpointUrl && !endpointSuccess) {
        addLog("Processo finalizado com erro no endpoint.", "error");
      } else {
        addLog("Processo concluído com sucesso!", "success");
      }
      setSuccessData({
        filename: saveData.filename,
        id: saveData.id,
        data: extractedData,
        flowJson,
        endpointSuccess,
        endpointError,
      });
    } catch (err: any) {
      console.error(err);

      let friendlyError =
        err.message || "Verifique se o link é válido ou tente novamente.";

      // Check for Gemini Quota Error (429)
      if (
        friendlyError.includes("429") ||
        friendlyError.includes("RESOURCE_EXHAUSTED") ||
        friendlyError.includes("quota")
      ) {
        friendlyError =
          'Limite de cota do Google atingido (Erro 429). O Google limita buscas reais (Google Search/Maps) em chaves gratuitas. Tente novamente em 1 minuto ou use uma chave com faturamento ativado no Google Cloud.';
      } else if (
        friendlyError.includes("503") ||
        friendlyError.includes("UNAVAILABLE") ||
        friendlyError.includes("high demand")
      ) {
        friendlyError =
          "Os servidores da Inteligência Artificial estão sobrecarregados no momento (Erro 503). Isso é temporário. Por favor, aguarde alguns instantes e tente novamente.";
      } else if (
        friendlyError.includes("API_KEY_INVALID") ||
        friendlyError.includes("invalid API key")
      ) {
        friendlyError =
          "Chave de API inválida. Por favor, verifique a chave configurada nas Configurações.";
      } else if (
        friendlyError.includes("leaked") ||
        friendlyError.includes("PERMISSION_DENIED")
      ) {
        friendlyError =
          "A chave de API configurada foi reportada como vazada ou bloqueada pelo Google. Por favor, gere uma nova chave no Google AI Studio e atualize nas Configurações do painel.";
      }

      addLog(`Erro no processo: ${friendlyError}`, "error");
      setError(`Erro ao analisar o link com IA: ${friendlyError}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadJson = async () => {
    if (successData) {
      try {
        const res = await fetch(
          `/api/analyze/download/${successData.filename}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

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
        a.download = successData.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } catch (error) {
        console.error("Download error:", error);
        alert("Erro ao baixar o arquivo JSON.");
      }
    }
  };

  const handleCopyJson = async () => {
    if (successData) {
      try {
        await navigator.clipboard.writeText(
          JSON.stringify(successData.data, null, 2),
        );
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  };

  const handleCopyFlowJson = async () => {
    if (successData?.flowJson) {
      try {
        await navigator.clipboard.writeText(
          JSON.stringify(successData.flowJson, null, 2),
        );
        setCopiedFlow(true);
        setTimeout(() => setCopiedFlow(false), 2000);
      } catch (err) {
        console.error("Failed to copy flow json:", err);
      }
    }
  };

  const renderLogs = () => {
    if (processLogs.length === 0) return null;
    return (
      <div className="mt-8 bg-zinc-900 rounded-xl p-4 border border-zinc-800 font-mono text-xs shadow-inner overflow-hidden">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800">
          <Terminal className="w-4 h-4 text-zinc-400" />
          <span className="text-zinc-300 font-semibold uppercase tracking-wider">
            Logs do Processo
          </span>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
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

  if (successData) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-zinc-100">
          <div className="bg-emerald-600 py-8 px-8 text-center text-white">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl font-bold mb-2">Análise Concluída!</h2>
            <p className="text-emerald-100">
              Os dados foram extraídos e salvos com sucesso.
            </p>
          </div>

          <div className="p-8 sm:p-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    Empresa
                  </h4>
                  <p className="text-xl font-bold text-zinc-900">
                    {successData.data.name}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                      Telefone
                    </h4>
                    <p className="text-zinc-900">
                      {successData.data.phone || "N/A"}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                      Cidade
                    </h4>
                    <p className="text-zinc-900">
                      {successData.data.city || "N/A"}
                    </p>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    Endereço
                  </h4>
                  <p className="text-zinc-900">
                    {successData.data.address || "N/A"}
                  </p>
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    Descrição
                  </h4>
                  <p className="text-sm text-zinc-600 line-clamp-3">
                    {successData.data.description || "N/A"}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    Serviços
                  </h4>
                  <p className="text-sm text-zinc-600 line-clamp-2">
                    {successData.data.services || "N/A"}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-zinc-50 rounded-xl p-6 mb-6 border border-zinc-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileJson className="w-5 h-5 text-emerald-600" />
                  <span className="font-medium text-zinc-900">
                    {successData.filename} (Dados Extraídos)
                  </span>
                </div>
                <button
                  onClick={handleCopyJson}
                  className="text-sm font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="w-4 h-4" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Copiar JSON
                    </>
                  )}
                </button>
              </div>
              <pre className="bg-zinc-900 text-emerald-400 p-4 rounded-lg text-xs overflow-x-auto max-h-48">
                {JSON.stringify(successData.data, null, 2)}
              </pre>
            </div>

            <div className="bg-zinc-50 rounded-xl p-6 mb-10 border border-zinc-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileJson className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-zinc-900">
                    Fluxo Gerado (Node Flow)
                  </span>
                </div>
                <button
                  onClick={handleCopyFlowJson}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  {copiedFlow ? (
                    <>
                      <CheckCircle className="w-4 h-4" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Copiar Fluxo
                    </>
                  )}
                </button>
              </div>
              <pre className="bg-zinc-900 text-blue-400 p-4 rounded-lg text-xs overflow-x-auto max-h-48">
                {JSON.stringify(successData.flowJson, null, 2)}
              </pre>
            </div>

            {endpointUrl && (
              <div
                className={`rounded-xl p-6 mb-10 border ${successData.endpointSuccess ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${successData.endpointSuccess ? "bg-emerald-100" : "bg-red-100"}`}
                  >
                    {successData.endpointSuccess ? (
                      <Send className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <div>
                    <h4
                      className={`font-medium ${successData.endpointSuccess ? "text-emerald-900" : "text-red-900"}`}
                    >
                      Envio para o Endpoint
                    </h4>
                    <p
                      className={`text-sm ${successData.endpointSuccess ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {successData.endpointSuccess
                        ? "O fluxo JSON foi enviado com sucesso para o endpoint configurado."
                        : `Falha ao enviar para o endpoint: ${successData.endpointError}`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-10">{renderLogs()}</div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={handleDownloadJson}
                className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-xl shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
              >
                <Download className="w-5 h-5 mr-2" />
                Baixar JSON
              </button>
              <button
                onClick={() => navigate("/sites")}
                className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 border border-zinc-200 text-base font-medium rounded-xl text-zinc-700 bg-white hover:bg-zinc-50 transition-colors"
              >
                Ver Todas Análises
              </button>
              <button
                onClick={() => {
                  setSuccessData(null);
                  setMapsLink("");
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 text-base font-medium rounded-xl text-zinc-500 hover:text-zinc-700 transition-colors"
              >
                Nova Análise
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6">
      <div className="md:flex md:items-center md:justify-between mb-8">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-zinc-900 sm:text-3xl sm:truncate">
            Analisar Link do Google Maps
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Cole o link abaixo para extrair automaticamente os dados do
            estabelecimento e salvar em formato JSON.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded-r-md">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm text-red-700 font-medium">{error}</p>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setIsLoading(false);
                  }}
                  className="text-sm font-bold text-red-800 hover:text-red-900 underline"
                >
                  Limpar erro e tentar novamente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleAnalyze} className="bg-white shadow rounded-lg p-6">
        <div className="flex gap-4 mb-6 border-b border-zinc-200 pb-4">
          <button
            type="button"
            onClick={() => setInputMode("auto")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              inputMode === "auto"
                ? "bg-emerald-100 text-emerald-800"
                : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            Extração com IA (Google Maps)
          </button>
          <button
            type="button"
            onClick={() => setInputMode("manual")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              inputMode === "manual"
                ? "bg-blue-100 text-blue-800"
                : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            Preenchimento Manual
          </button>
        </div>

        {inputMode === "auto" ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 mb-8">
            <div className="flex items-start">
              <div className="flex-shrink-0 mt-1">
                <Sparkles className="h-6 w-6 text-emerald-600" />
              </div>
              <div className="ml-4 flex-1">
                <h3 className="text-lg font-medium text-emerald-900">
                  Extração com Inteligência Artificial
                </h3>
                <p className="mt-1 text-sm text-emerald-700">
                  Nossa IA vai buscar os dados reais do local e estruturá-los em
                  um arquivo JSON.
                </p>
                <div className="mt-4 flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium text-emerald-900 mb-1">
                      Link do Google Maps ou Descrição da Empresa
                    </label>
                    <textarea
                      value={mapsLink}
                      onChange={(e) => setMapsLink(e.target.value)}
                      placeholder="Cole o link do Google Maps ou digite informações sobre a empresa..."
                      required={inputMode === "auto"}
                      rows={3}
                      className="w-full focus:ring-emerald-500 focus:border-emerald-500 block sm:text-sm border-emerald-300 rounded-md shadow-sm px-3 py-2 border bg-white"
                    />
                  </div>
                  <div className="bg-emerald-100/50 p-3 rounded-md border border-emerald-200">
                    <p className="text-xs text-emerald-800">
                      <strong>Limites da API:</strong> Com uma chave gratuita do Google AI Studio, você pode gerar até <strong>1.500 sites/templates por dia</strong> (limite de 15 requisições por minuto).
                    </p>
                    {geminiUsage && user?.role === "admin" && (
                      <div className="mt-2 pt-2 border-t border-emerald-200/60">
                        <p className="text-xs font-medium text-emerald-900">
                          Uso hoje: {geminiUsage.count} / {geminiUsage.limit} requisições
                        </p>
                        <div className="w-full bg-emerald-200/50 rounded-full h-1.5 mt-1">
                          <div 
                            className={`h-1.5 rounded-full ${geminiUsage.count >= geminiUsage.limit ? 'bg-red-500' : 'bg-emerald-600'}`} 
                            style={{ width: `${Math.min((geminiUsage.count / geminiUsage.limit) * 100, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <h3 className="text-lg font-medium text-blue-900 mb-4">
              Preenchimento Manual dos Dados
            </h3>
            <div className="grid grid-cols-1 gap-y-4 gap-x-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-blue-900 mb-1">Nome da Empresa</label>
                <input
                  type="text"
                  required={inputMode === "manual"}
                  value={manualData.name}
                  onChange={(e) => setManualData({ ...manualData, name: e.target.value })}
                  className="w-full focus:ring-blue-500 focus:border-blue-500 block sm:text-sm border-blue-300 rounded-md shadow-sm px-3 py-2 border bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-900 mb-1">Telefone</label>
                <input
                  type="text"
                  required={inputMode === "manual"}
                  value={manualData.phone}
                  onChange={(e) => setManualData({ ...manualData, phone: e.target.value })}
                  className="w-full focus:ring-blue-500 focus:border-blue-500 block sm:text-sm border-blue-300 rounded-md shadow-sm px-3 py-2 border bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-900 mb-1">Nicho (ex: Barbearia)</label>
                <input
                  type="text"
                  required={inputMode === "manual"}
                  value={manualData.niche}
                  onChange={(e) => setManualData({ ...manualData, niche: e.target.value })}
                  className="w-full focus:ring-blue-500 focus:border-blue-500 block sm:text-sm border-blue-300 rounded-md shadow-sm px-3 py-2 border bg-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-blue-900 mb-1">Endereço Completo</label>
                <input
                  type="text"
                  required={inputMode === "manual"}
                  value={manualData.address}
                  onChange={(e) => setManualData({ ...manualData, address: e.target.value })}
                  className="w-full focus:ring-blue-500 focus:border-blue-500 block sm:text-sm border-blue-300 rounded-md shadow-sm px-3 py-2 border bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-900 mb-1">Cidade</label>
                <input
                  type="text"
                  required={inputMode === "manual"}
                  value={manualData.city}
                  onChange={(e) => setManualData({ ...manualData, city: e.target.value })}
                  className="w-full focus:ring-blue-500 focus:border-blue-500 block sm:text-sm border-blue-300 rounded-md shadow-sm px-3 py-2 border bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-900 mb-1">Serviços (separados por vírgula)</label>
                <input
                  type="text"
                  required={inputMode === "manual"}
                  value={manualData.services}
                  onChange={(e) => setManualData({ ...manualData, services: e.target.value })}
                  className="w-full focus:ring-blue-500 focus:border-blue-500 block sm:text-sm border-blue-300 rounded-md shadow-sm px-3 py-2 border bg-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-blue-900 mb-1">Descrição do Negócio</label>
                <textarea
                  required={inputMode === "manual"}
                  rows={3}
                  value={manualData.description}
                  onChange={(e) => setManualData({ ...manualData, description: e.target.value })}
                  className="w-full focus:ring-blue-500 focus:border-blue-500 block sm:text-sm border-blue-300 rounded-md shadow-sm px-3 py-2 border bg-white"
                />
              </div>
            </div>
          </div>
        )}

        {user?.role === 'admin' && (
          <div className="mb-8">
                    <label className="block text-sm font-medium text-emerald-900 mb-1">
                      Modelo de Template (Fluxo)
                    </label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="w-full focus:ring-emerald-500 focus:border-emerald-500 block sm:text-sm border-emerald-300 rounded-md shadow-sm px-3 py-2 border bg-white"
                    >
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-emerald-700">
                      Selecione o modelo de prompt e fluxo que será usado para gerar o site.
                    </p>
                  </div>
                )}
                {user?.role === 'admin' && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-emerald-900">
                        Endpoint Webhook (Opcional)
                      </label>
                      <button
                        type="button"
                        onClick={() => setEndpointUrl(DEFAULT_ENDPOINT)}
                        className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-100/50 px-2 py-1 rounded"
                      >
                        <Send className="w-3 h-3" /> Usar Endpoint Padrão
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={endpointMethod}
                        onChange={(e) => setEndpointMethod(e.target.value)}
                        className="focus:ring-emerald-500 focus:border-emerald-500 block sm:text-sm border-emerald-300 rounded-md shadow-sm px-3 py-2 border bg-white"
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
                        className="flex-1 focus:ring-emerald-500 focus:border-emerald-500 block sm:text-sm border-emerald-300 rounded-md shadow-sm px-3 py-2 border bg-white"
                      />
                    </div>
                    <p className="mt-1 text-xs text-emerald-700">
                      Se preenchido, o fluxo JSON será enviado automaticamente
                      para esta URL.
                    </p>
                  </div>
                )}

        <div className="pt-5 border-t border-zinc-200 mt-6">
          <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate("/sites")}
              className="w-full sm:w-auto bg-white py-2 px-4 border border-zinc-300 rounded-md shadow-sm text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 order-2 sm:order-1"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full sm:w-auto inline-flex justify-center items-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 order-1 sm:order-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Analisando...
                </>
              ) : (
                "Analisar e Extrair Dados"
              )}
            </button>
          </div>
        </div>

        {renderLogs()}
      </form>
    </div>
  );
}
