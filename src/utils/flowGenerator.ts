export const fillTemplate = (template: string, data: any, mapLink: string) => {
  let filled = template;
  
  // Replace ${data.xxx}
  const dataMatches = filled.match(/\$\{data\.[a-zA-Z0-9_]+\}/g);
  if (dataMatches) {
    dataMatches.forEach(match => {
      const key = match.replace('${data.', '').replace('}', '');
      filled = filled.replace(match, data[key] || '');
    });
  }
  
  // Replace ${mapLink}
  filled = filled.replace(/\$\{mapLink\}/g, mapLink);
  
  return filled;
};

export const generatePrompt = (data: any, mapLink: string) => {
  const instagramCTA = `
<div style="background: #000; color: #fff; padding: 40px 20px; text-align: center; font-family: sans-serif;">
  <p style="font-size: 14px; opacity: 0.7; margin-bottom: 10px;">Desenvolvido por</p>
  <h2 style="font-size: 24px; letter-spacing: 2px; margin-bottom: 20px;">DS COMPANY</h2>
  <a href="https://www.instagram.com/dscompany1_/" target="_blank" style="display: inline-block; background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); color: #fff; padding: 12px 30px; border-radius: 50px; text-decoration: none; font-weight: bold; transition: transform 0.3s ease;">
    SIGA NO INSTAGRAM @dscompany1_
  </a>
</div>`;

  const defaultTemplate = `Aja como um Arquiteto Front-end e Creative Developer sênior.

Desenvolva a melhor landing page do mundo para o "\${data.name}".

🚨 REQUISITO ABSOLUTO:
A experiência deve ser 100% responsiva seguindo estritamente a filosofia MOBILE FIRST.
Tudo deve funcionar perfeitamente em celular antes de desktop.

🎬 INTRO SEQUENCE (OBRIGATÓRIO):
Crie uma introdução animada de 5 segundos antes da página carregar:
- Tipografia cinética com o nome "\${data.name}"
- Animação estilo abertura rústica (como portas de madeira se abrindo)
- Partículas 3D simulando brasas de fogão a lenha
- Sons sutis de ambiente rural (opcional)
- Transição cinematográfica para o conteúdo

⚙️ REQUISITOS TÉCNICOS:
- Three.js para background 3D interativo
- GSAP para animações principais
- ScrollTrigger para animações no scroll
- HTML 100% standalone (CSS + JS internos)
- Alta performance
- Código limpo e organizado

🎯 OBJETIVO:
Criar uma landing page extremamente persuasiva focada em atrair clientes para o negócio.

📍 INFORMAÇÕES DO LOCAL:
- Nome: \${data.name}
- Endereço: \${data.address}
- Cidade: \${data.city}
- Google Maps: \${mapLink}

📱 CONTATO:
- WhatsApp: \${data.phone} (botão clicável)

🍽️ DESCRIÇÃO:
\${data.description}

🌿 EXPERIÊNCIA DO AMBIENTE:
- Ambiente rústico e aconchegante
- Espaço arborizado
- Clima familiar
- Música ao vivo
- Contato com a natureza

🔥 DIFERENCIAIS:
- Comida feita no fogão a lenha
- Mais de 20 anos de tradição
- Espaço Kids
- Estacionamento gratuito
- Ideal para famílias e eventos

🍴 SERVIÇOS (OBRIGATÓRIO DESTACAR EM CARDS ANIMADOS):
\${data.services}

🎬 ANIMAÇÕES (OBRIGATÓRIO):
- Efeito de fumaça leve subindo (fogão a lenha)
- Elementos de comida aparecendo com fade + scale
- Scroll com parallax suave
- Cards com hover 3D
- Seção de serviços com animação stagger
- Botões com efeito glow suave

🎨 DESIGN:
- Estilo rústico premium + moderno
- Cores: marrom, bege, verde, tons de madeira
- Efeito glassmorphism leve
- Tipografia elegante e acolhedora
- Texturas suaves de madeira

🧠 SEÇÕES DA LANDING PAGE:
1. Hero Section (com animação inicial + CTA)
2. Sobre o Restaurante
3. Experiência do Ambiente
4. Serviços (cards animados)
5. Diferenciais
6. Galeria (com animação)
7. Localização (mapa embutido)
8. CTA final

📲 CTA FINAL (OBRIGATÓRIO):
- Botão grande WhatsApp
- Texto forte: "Venha viver a verdadeira experiência da culinária mineira!"
- Destaque para família e tradição

💎 CRÉDITOS E INSTAGRAM (OBRIGATÓRIO NO RODAPÉ):
Adicione este código HTML exatamente como está no final da página, antes de fechar o body:
${instagramCTA}

⚠️ REGRAS DE OURO (PROIBIDO VIOLAR):
1. RETORNE APENAS O CÓDIGO HTML.
2. NÃO ESCREVA NADA ANTES DO HTML (NEM "AQUI ESTÁ O CÓDIGO", NEM "ESTE É O CÓDIGO").
3. NÃO USE BLOCOS DE CÓDIGO MARKDOWN (NÃO USE \`\`\`html OU \`\`\`).
4. O RESULTADO DEVE COMEÇAR DIRETAMENTE COM <!DOCTYPE html> E TERMINAR COM </html>.
5. QUALQUER TEXTO FORA DAS TAGS HTML QUEBRARÁ O SISTEMA.`;
  
  return fillTemplate(defaultTemplate, data, mapLink);
};

export const generatePromptWithTemplate = (data: any, mapLink: string, template: string) => {
  return fillTemplate(template, data, mapLink);
};

export const generateFlowJson = (promptText: string, siteName: string = "DS Company", flowId?: string, inputData?: any, flowStructure?: string, apiKey?: string) => {
  const id = flowId || `flow-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  if (flowStructure) {
    try {
      const structure = JSON.parse(flowStructure);
      
      // Replace placeholders in the structure
      const processNode = (node: any) => {
        if (node.data?.config?.body) {
          let bodyStr = JSON.stringify(node.data.config.body);
          // Use JSON.stringify for the prompt to handle escaping correctly
          const escapedPrompt = JSON.stringify(promptText).slice(1, -1);
          bodyStr = bodyStr.replace(/\{\{prompt\}\}/g, () => escapedPrompt);
          bodyStr = bodyStr.replace(/\{\{siteName\}\}/g, () => siteName);
          node.data.config.body = JSON.parse(bodyStr);
        }
        if (node.data?.label) {
          node.data.label = node.data.label.replace(/\{\{siteName\}\}/g, () => siteName);
        }
        if (node.data?.config?.url && apiKey) {
          node.data.config.url = node.data.config.url.replace(/\{YOUR_API_KEY\}/g, () => apiKey);
        }
        return node;
      };

      return {
        ...structure,
        id,
        nodes: structure.nodes.map(processNode),
        data: inputData || {}
      };
    } catch (e) {
      console.error("Error parsing flow structure:", e);
    }
  }

  // Fallback to original hardcoded flow
  return {
    "id": id,
    "nodes": [
      {
        "id": "node-start",
        "type": "custom",
        "position": {
          "x": -99.44802207135139,
          "y": 37.07234042553192
        },
        "data": {
          "label": "Início do Fluxo",
          "type": "start",
          "status": "SUCCESS",
          "config": {}
        },
        "width": 180,
        "height": 63,
        "selected": false,
        "positionAbsolute": {
          "x": -99.44802207135139,
          "y": 37.07234042553192
        },
        "dragging": false
      },
      {
        "id": "node-gemini-mobile-first",
        "type": "custom",
        "position": {
          "x": 65.61226131358058,
          "y": 142.3501340176197
        },
        "data": {
          "label": "Gerar Landing Page Mobile First",
          "type": "httpRequest",
          "status": "SUCCESS",
          "config": {
            "url": `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey || '{YOUR_API_KEY}'}`,
            "method": "POST",
            "body": {
              "contents": [
                {
                  "parts": [
                    {
                      "text": promptText
                    }
                  ]
                }
              ],
              "systemInstruction": {
                "parts": [
                  {
                    "text": "Você é um gerador de código HTML puro. Retorne APENAS o código HTML completo, começando com <!DOCTYPE html> e terminando com </html>. NÃO use markdown. NÃO escreva nenhuma introdução, explicação ou comentário fora das tags HTML. Se houver qualquer texto fora do HTML, o sistema falhará."
                  }
                ]
              }
            }
          }
        },
        "width": 214,
        "height": 63,
        "selected": true,
        "positionAbsolute": {
          "x": 65.61226131358058,
          "y": 142.3501340176197
        },
        "dragging": false
      },
      {
        "id": "node-deploy-mobile",
        "type": "custom",
        "position": {
          "x": -91.20970848570477,
          "y": 269.9890936668883
        },
        "data": {
          "label": "Deploy Mobile First Experience",
          "type": "httpRequest",
          "status": "SUCCESS",
          "config": {
            "url": "https://flowpost.onrender.com/api/upload",
            "method": "POST",
            "body": {
              "name": `${siteName} - Mobile First Immersive`,
              "html": "{{input.text}}"
            }
          }
        },
        "width": 214,
        "height": 63,
        "selected": false,
        "positionAbsolute": {
          "x": -91.20970848570477,
          "y": 269.9890936668883
        },
        "dragging": false
      }
    ],
    "edges": [
      {
        "id": "e-start-gemini",
        "source": "node-start",
        "target": "node-gemini-mobile-first",
        "type": "smoothstep",
        "animated": true,
        "style": {
          "strokeWidth": 3,
          "stroke": "#3b82f6"
        },
        "markerEnd": {
          "type": "arrowclosed",
          "color": "#3b82f6"
        }
      },
      {
        "id": "e-gemini-deploy",
        "source": "node-gemini-mobile-first",
        "target": "node-deploy-mobile",
        "type": "smoothstep",
        "animated": true,
        "style": {
          "strokeWidth": 3,
          "stroke": "#3b82f6"
        },
        "markerEnd": {
          "type": "arrowclosed",
          "color": "#3b82f6"
        }
      }
    ],
    "data": inputData || {}
  };
};
