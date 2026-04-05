import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Plus, Edit2, Trash2, Save, X, FileCode, Layout, Sparkles, RefreshCw, Import } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";

interface Template {
  id: number;
  name: string;
  prompt_template: string;
  flow_structure: string;
  created_at: string;
}

export default function TemplatesPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && user.role !== "admin" && user.sector !== "Produção") {
      navigate("/sites");
    }
  }, [user, navigate]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<Partial<Template>>({
    name: '',
    prompt_template: '',
    flow_structure: ''
  });
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [geminiUsage, setGeminiUsage] = useState<{ count: number; limit: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const DEFAULT_FLOW_JSON = {
    "nodes": [
      {
        "id": "node-start",
        "type": "custom",
        "data": { "label": "Início do Fluxo", "type": "start", "status": "SUCCESS", "config": {} }
      },
      {
        "id": "node-gemini",
        "type": "custom",
        "data": {
          "label": "Gerar Landing Page",
          "type": "httpRequest",
          "status": "SUCCESS",
          "config": {
            "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key={YOUR_API_KEY}",
            "method": "POST",
            "body": {
              "contents": [{ "parts": [{ "text": "{{prompt}}" }] }],
              "systemInstruction": {
                "parts": [{ "text": "Você é um gerador de código HTML puro. Retorne APENAS o código HTML completo, começando com <!DOCTYPE html> e terminando com </html>. NÃO use markdown. NÃO escreva nenhuma introdução, explicação ou comentário fora das tags HTML. Se houver qualquer texto fora do HTML, o sistema falhará." }]
              }
            }
          }
        }
      },
      {
        "id": "node-deploy",
        "type": "custom",
        "data": {
          "label": "Deploy do Site",
          "type": "httpRequest",
          "status": "SUCCESS",
          "config": {
            "url": "https://flowpost.onrender.com/api/upload",
            "method": "POST",
            "body": {
              "name": "{{siteName}}",
              "html": "{{input.text}}"
            }
          }
        }
      }
    ],
    "edges": [
      { "id": "e1", "source": "node-start", "target": "node-gemini" },
      { "id": "e2", "source": "node-gemini", "target": "node-deploy" }
    ]
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (showAiModal) {
      fetchGeminiUsage();
    }
  }, [showAiModal]);

  const fetchGeminiUsage = async () => {
    try {
      const token = localStorage.getItem('token');
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

  if (user?.role !== 'admin' && user?.sector !== 'Produção') {
    return <div className="p-6 text-center text-zinc-500">Acesso negado.</div>;
  }

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error('Error fetching templates:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentTemplate.name || !currentTemplate.prompt_template || !currentTemplate.flow_structure) {
      setError('Todos os campos são obrigatórios');
      return;
    }

    try {
      const method = currentTemplate.id ? 'PUT' : 'POST';
      const url = currentTemplate.id ? `/api/templates/${currentTemplate.id}` : '/api/templates';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(currentTemplate)
      });

      if (res.ok) {
        setIsEditing(false);
        setCurrentTemplate({ name: '', prompt_template: '', flow_structure: '' });
        fetchTemplates();
      } else {
        const data = await res.json();
        setError(data.error || 'Erro ao salvar template');
      }
    } catch (err) {
      setError('Erro de conexão com o servidor');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setConfirmDelete(null);
        fetchTemplates();
      }
    } catch (err) {
      console.error('Error deleting template:', err);
    }
  };

  const openEdit = (template?: Template) => {
    if (template) {
      setCurrentTemplate(template);
    } else {
      setCurrentTemplate({ name: '', prompt_template: '', flow_structure: '' });
    }
    setIsEditing(true);
    setError('');
  };

  const handleGenerateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    
    setIsGenerating(true);
    try {
      let apiKey = "";
      try {
        const token = localStorage.getItem('token');
        const settingsRes = await fetch("/api/settings", {
          headers: { Authorization: `Bearer ${token}` },
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

      if (!apiKey) {
        apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY || "";
      }

      if (!apiKey) {
        throw new Error("Chave da API do Gemini não encontrada. Configure nas Configurações.");
      }

      apiKey = apiKey.trim();

      const instagramCTA = `
<div style="background: #000; color: #fff; padding: 40px 20px; text-align: center; font-family: sans-serif;">
  <p style="font-size: 14px; opacity: 0.7; margin-bottom: 10px;">Desenvolvido por</p>
  <h2 style="font-size: 24px; letter-spacing: 2px; margin-bottom: 20px;">DS COMPANY</h2>
  <a href="https://www.instagram.com/dscompany1_/" target="_blank" style="display: inline-block; background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); color: #fff; padding: 12px 30px; border-radius: 50px; text-decoration: none; font-weight: bold; transition: transform 0.3s ease;">
    SIGA NO INSTAGRAM @dscompany1_
  </a>
</div>`;

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Você é um Engenheiro de Prompts Sênior, especialista em automação (n8n), Inteligência Artificial e Web Design de Alta Conversão (CRO).
Sua missão é criar o MELHOR e mais PROFISSIONAL template de prospecção para o sistema.
O usuário quer um template focado em: "${aiPrompt}"

REGRAS OBRIGATÓRIAS PARA O PROMPT GERADO (prompt_template):
1. O prompt gerado deve instruir a IA final a criar uma Landing Page de ALTA CONVERSÃO, com design moderno, premium e impecável.
2. Exija o uso de HTML5 semântico e CSS3 moderno (pode usar Tailwind CSS via CDN ou CSS interno muito bem estruturado).
3. Exija design MOBILE FIRST, totalmente responsivo e otimizado para velocidade.
4. O prompt deve pedir seções claras: Hero (com CTA forte e persuasivo), Sobre a Empresa, Serviços/Produtos (com ícones ou cards), Prova Social/Benefícios, e Rodapé.
5. Exija o uso de cores harmoniosas, tipografia moderna (importando do Google Fonts, ex: Inter, Poppins) e bom uso de espaço em branco (whitespace).
6. O prompt deve exigir que a página inclua CRÉDITOS à DS Company e um link para o Instagram @dscompany1_.
7. O prompt deve ser EXTREMAMENTE RÍGIDO sobre retornar APENAS HTML puro, sem explicações, sem blocos de código markdown (\`\`\`html).
8. O prompt deve orientar a IA a usar os dados fornecidos nos placeholders para criar textos persuasivos (copywriting) focados em vendas e conversão.

Retorne um JSON com o seguinte formato:
{
  "name": "Nome Sugerido para o Template (Curto e Profissional)",
  "prompt_template": "O prompt detalhado, longo e extremamente específico que será enviado ao agente de IA para gerar o HTML da landing page. Use placeholders como \${data.name}, \${data.address}, \${data.city}, \${data.phone}, \${data.description}, \${data.services}, \${mapLink} onde apropriado. Detalhe as exigências de design de forma minuciosa, exigindo sombras suaves, bordas arredondadas, hover effects nos botões e um layout limpo. No final do prompt, inclua a instrução para adicionar este HTML de créditos: ${instagramCTA.replace(/"/g, "'")}",
  "flow_structure": "A estrutura JSON do fluxo n8n/flow. Use {{prompt}} e {{siteName}} como placeholders. Mantenha a estrutura padrão fornecida abaixo."
}

A estrutura padrão do flow_structure é:
${JSON.stringify(DEFAULT_FLOW_JSON, null, 2)}

Retorne APENAS o JSON puro.`,
        config: {
          responseMimeType: "application/json"
        }
      });

      // Increment usage after successful call
      try {
        const token = localStorage.getItem('token');
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
        throw new Error('A resposta da IA foi bloqueada ou retornou vazia. Tente um prompt diferente.');
      }
      
      // Remove markdown code blocks if present
      responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e: any) {
        console.error('Error parsing JSON:', e, 'Raw text:', responseText);
        throw new Error('A IA não retornou um formato válido. Tente novamente.');
      }

      if (!result.name || !result.prompt_template) {
        throw new Error('A IA não retornou todos os campos necessários (nome e prompt).');
      }

      setCurrentTemplate({
        name: result.name,
        prompt_template: result.prompt_template,
        flow_structure: result.flow_structure 
          ? (typeof result.flow_structure === 'string' ? result.flow_structure : JSON.stringify(result.flow_structure, null, 2))
          : JSON.stringify(DEFAULT_FLOW_JSON, null, 2)
      });
      setShowAiModal(false);
      setAiPrompt('');
      setIsEditing(true);
    } catch (error: any) {
      console.error('Error generating template with AI:', error);
      let friendlyError = error.message || 'Erro ao gerar template com IA. Tente novamente.';
      
      if (friendlyError.includes("leaked") || friendlyError.includes("PERMISSION_DENIED")) {
        friendlyError = "A chave de API configurada foi reportada como vazada ou bloqueada pelo Google. Por favor, gere uma nova chave no Google AI Studio e atualize nas Configurações do painel.";
      } else if (friendlyError.includes("429") || friendlyError.includes("quota")) {
        friendlyError = "Limite de cota atingido. A chave da API excedeu o limite de requisições.";
      } else if (friendlyError.includes("API_KEY_INVALID")) {
        friendlyError = "Chave de API inválida. Verifique as Configurações.";
      }

      alert(friendlyError);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">Templates de Fluxo</h2>
          <p className="mt-1 text-sm text-zinc-500">Gerencie os modelos de prompt e estrutura de fluxo para seus sites.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowAiModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            <Sparkles className="w-4 h-4 mr-2" /> Gerar com IA
          </button>
          <button
            onClick={() => openEdit()}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
          >
            <Plus className="w-4 h-4 mr-2" /> Novo Template
          </button>
        </div>
      </div>

      {/* AI Generation Modal */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden"
          >
            <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-purple-50">
              <h2 className="text-xl font-bold text-purple-900 flex items-center gap-2">
                <Sparkles className="w-6 h-6" />
                Gerar Template com IA
              </h2>
              <button onClick={() => setShowAiModal(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-zinc-600 mb-4">
                Descreva que tipo de template você deseja criar. A IA irá gerar o nome, o prompt e a estrutura do fluxo automaticamente.
              </p>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Ex: Um template focado em barbearias modernas com agendamento online e design dark mode..."
                className="w-full h-32 p-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-sm"
              />
              <div className="mt-3 bg-blue-50 p-3 rounded-md border border-blue-100">
                <p className="text-xs text-blue-800">
                  <strong>Limites da API:</strong> Com uma chave gratuita do Google AI Studio, você pode gerar até <strong>1.500 sites/templates por dia</strong> (limite de 15 requisições por minuto).
                </p>
                {geminiUsage && (
                  <div className="mt-2 pt-2 border-t border-blue-200">
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
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowAiModal(false)}
                  className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleGenerateWithAI}
                  disabled={isGenerating || !aiPrompt.trim()}
                  className="flex items-center gap-2 bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Gerar Template
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <motion.div
              layout
              key={template.id}
              className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-emerald-100 p-2 rounded-lg">
                    <Layout className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(template)}
                      className="p-1 text-zinc-400 hover:text-emerald-600 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {confirmDelete === template.id ? (
                      <div className="flex items-center gap-1 bg-red-50 p-1 rounded-md border border-red-100">
                        <button
                          onClick={() => handleDelete(template.id)}
                          className="text-[10px] bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                        >
                          Sim
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-[10px] bg-zinc-200 text-zinc-700 px-2 py-1 rounded hover:bg-zinc-300"
                        >
                          Não
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(template.id)}
                        className="p-1 text-zinc-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-zinc-900 mb-2">{template.name}</h3>
                <p className="text-xs text-zinc-500 mb-4">Criado em: {new Date(template.created_at).toLocaleDateString()}</p>
                <div className="space-y-2">
                  <div className="flex items-center text-xs text-zinc-600">
                    <Sparkles className="w-3 h-3 mr-1 text-amber-500" />
                    Prompt configurado
                  </div>
                  <div className="flex items-center text-xs text-zinc-600">
                    <FileCode className="w-3 h-3 mr-1 text-blue-500" />
                    Estrutura de fluxo definida
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
                <h3 className="text-xl font-bold text-zinc-900">
                  {currentTemplate.id ? 'Editar Template' : 'Novo Template'}
                </h3>
                <button onClick={() => setIsEditing(false)} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                {error && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Nome do Template</label>
                  <input
                    type="text"
                    value={currentTemplate.name}
                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, name: e.target.value })}
                    placeholder="Ex: Restaurante Rústico Premium"
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Prompt Template (Use {'${data.name}'}, {'${data.address}'}, {'${data.city}'}, {'${data.phone}'}, {'${data.description}'}, {'${data.services}'}, {'${mapLink}'})
                  </label>
                  <textarea
                    value={currentTemplate.prompt_template}
                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, prompt_template: e.target.value })}
                    rows={10}
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all font-mono text-sm"
                    placeholder="Aja como um Arquiteto Front-end..."
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-zinc-700">
                      Estrutura do Fluxo (JSON) - Use {'{{prompt}}'} e {'{{siteName}}'}
                    </label>
                    <button
                      onClick={() => setCurrentTemplate({
                        ...currentTemplate,
                        flow_structure: JSON.stringify(DEFAULT_FLOW_JSON, null, 2)
                      })}
                      className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded"
                    >
                      <Import className="w-3 h-3" /> Importar Fluxo Padrão
                    </button>
                  </div>
                  <textarea
                    value={currentTemplate.flow_structure}
                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, flow_structure: e.target.value })}
                    rows={8}
                    className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all font-mono text-sm"
                    placeholder='{ "nodes": [...], "edges": [...] }'
                  />
                </div>
              </div>

              <div className="p-6 border-t border-zinc-100 bg-zinc-50 flex justify-end gap-3">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  className="inline-flex items-center px-6 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                >
                  <Save className="w-4 h-4 mr-2" /> Salvar Template
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
