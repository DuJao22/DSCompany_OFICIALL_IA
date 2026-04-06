import express from 'express';
console.log('Server starting...');
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from './src/db.js';
import fs from 'fs';
import crypto from 'crypto';
import { exec } from 'child_process';
import { GoogleGenAI, Type } from '@google/genai';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod';

// User existence cache to reduce DB load
const userCache = new Map<string | number, { timestamp: number; exists: boolean; role?: string; sector?: string }>();
const USER_CACHE_TTL = 60 * 1000; // 1 minute

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());

// Ensure 'dados' directory exists
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;
const dadosDir = isVercel ? '/tmp/dados' : path.join(process.cwd(), 'dados');
if (!fs.existsSync(dadosDir)) {
  fs.mkdirSync(dadosDir, { recursive: true });
}

// Initialize default admin if not exists, or update if it does
async function initAdmin() {
  try {
    const results = await db.sql`SELECT id FROM users WHERE LOWER(username) = LOWER('DuJao')`;
    const adminExists = results[0];
    const hash = bcrypt.hashSync('3003', 10);
    if (!adminExists) {
      await db.sql`INSERT INTO users (username, password_hash, role) VALUES ('DuJao', ${hash}, 'admin')`;
    } else {
      await db.sql`UPDATE users SET password_hash = ${hash}, role = 'admin' WHERE LOWER(username) = LOWER('DuJao')`;
    }
  } catch (error) {
    console.error('Error initializing admin:', error);
  }
}
initAdmin();

// --- API Routes ---

// Auth Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, async (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    
    try {
      // Check cache first
      const cached = userCache.get(user.id);
      const now = Date.now();
      if (cached && (now - cached.timestamp < USER_CACHE_TTL)) {
        if (!cached.exists) {
          return res.status(401).json({ error: 'Usuário não encontrado ou sessão expirada. Por favor, faça login novamente.' });
        }
        req.user = { ...user, role: cached.role, sector: cached.sector };
        return next();
      }

      // Verify user still exists in DB and get current role/sector
      const results = await db.sql`SELECT id, role, sector FROM users WHERE id = ${user.id}`;
      const dbUser = results[0];
      
      userCache.set(user.id, { timestamp: now, exists: !!dbUser, role: dbUser?.role, sector: dbUser?.sector });

      if (!dbUser) {
        return res.status(401).json({ error: 'Usuário não encontrado ou sessão expirada. Por favor, faça login novamente.' });
      }
      
      req.user = { ...user, role: dbUser.role, sector: dbUser.sector };
      next();
    } catch (dbErr: any) {
      console.error('Auth middleware DB error:', dbErr);
      return res.sendStatus(500);
    }
  });
};

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const results = await db.sql`SELECT * FROM users WHERE LOWER(username) = LOWER(${username})`;
    const user = results[0];

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, sector: user.sector }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, api_key: user.api_key, sector: user.sector } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Change password
app.post('/api/auth/change-password', authenticateToken, async (req: any, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senhas atual e nova são obrigatórias' });
    }

    const results = await db.sql`SELECT password_hash FROM users WHERE id = ${req.user.id}`;
    const user = results[0];

    if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    await db.sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${req.user.id}`;
    res.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req: any, res) => {
  try {
    const results = await db.sql`SELECT id, username, role, api_key, daily_goal, sector, gemini_api_key, sales_message_template, can_use_ai_search FROM users WHERE id = ${req.user.id}`;
    const user = results[0];
    res.json(user);
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Get settings
app.get('/api/settings', authenticateToken, async (req: any, res) => {
  try {
    const settings = await db.sql`SELECT key, value FROM settings`;
    const settingsMap = settings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    // If regular user, override gemini_api_key with their own key if it exists
    const userRes = await db.sql`SELECT gemini_api_key, sales_message_template, sector FROM users WHERE id = ${req.user.id}`;
    const userData = userRes[0] || {};

    if (req.user.role !== 'admin' && userData.sector !== 'Produção') {
      if (userData.gemini_api_key) {
        settingsMap.gemini_api_key = userData.gemini_api_key;
      } else if (!settingsMap.gemini_api_key) {
        settingsMap.gemini_api_key = ''; 
      }
      // Note: If settingsMap.gemini_api_key was already set from the settings table, 
      // and the user has no personal key, we keep the global one.
      
      // Hide default_endpoint from regular users not in Produção
      delete settingsMap.default_endpoint;
    } else if (userData.gemini_api_key) {
      // If they have a personal key, use it even if they are admin or Produção
      settingsMap.gemini_api_key = userData.gemini_api_key;
    }

    settingsMap.sales_message_template = userData.sales_message_template || '';

    res.json(settingsMap);
  } catch (error) {
    console.error('Settings error details:', error);
    res.status(500).json({ error: 'Erro interno no servidor ao buscar configurações' });
  }
});

// Users Management
app.get('/api/users', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  try {
    const users = await db.sql`SELECT id, username, role, api_key, daily_goal, sector, can_use_ai_search FROM users`;
    res.json(users);
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

app.post('/api/users', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  const { username, password, role, daily_goal, sector, can_use_ai_search } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  }
  
  try {
    const existingResults = await db.sql`SELECT id FROM users WHERE LOWER(username) = LOWER(${username})`;
    if (existingResults[0]) {
      return res.status(400).json({ error: 'Usuário já existe' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const apiKey = crypto.randomBytes(24).toString('hex');
    const goal = parseInt(daily_goal) || 0;
    const sectorStr = String(sector || '');
    const canUseAi = can_use_ai_search ? 1 : 0;
    
    await db.sql`INSERT INTO users (username, password_hash, role, api_key, daily_goal, sector, can_use_ai_search) VALUES (${username}, ${hash}, ${role}, ${apiKey}, ${goal}, ${sectorStr}, ${canUseAi})`;
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

app.patch('/api/users/:id', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  const { daily_goal, sector, role, can_use_ai_search } = req.body;
  
  try {
    if (daily_goal !== undefined) {
      await db.sql`UPDATE users SET daily_goal = ${parseInt(daily_goal) || 0} WHERE id = ${req.params.id}`;
    }
    if (sector !== undefined) {
      await db.sql`UPDATE users SET sector = ${String(sector || '')} WHERE id = ${req.params.id}`;
    }
    if (role !== undefined) {
      await db.sql`UPDATE users SET role = ${String(role)} WHERE id = ${req.params.id}`;
    }
    if (can_use_ai_search !== undefined) {
      await db.sql`UPDATE users SET can_use_ai_search = ${can_use_ai_search ? 1 : 0} WHERE id = ${req.params.id}`;
    }
    
    // Clear cache for this user
    userCache.delete(parseInt(req.params.id));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

app.delete('/api/users/:id', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  if (Number(req.params.id) === Number(req.user.id)) {
    return res.status(400).json({ error: 'Não é possível excluir o próprio usuário' });
  }
  
  try {
    const userId = parseInt(req.params.id);
    await db.sql`DELETE FROM users WHERE id = ${userId}`;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Erro ao excluir usuário' });
  }
});

// Save settings
app.post('/api/settings', authenticateToken, async (req: any, res) => {
  const { gemini_api_key, default_endpoint, sales_message_template } = req.body;
  
  try {
    if (req.user.role !== 'admin') {
      // Regular user can only update their own gemini_api_key and sales_message_template
      if (gemini_api_key !== undefined) {
        await db.sql`UPDATE users SET gemini_api_key = ${gemini_api_key} WHERE id = ${req.user.id}`;
      }
      if (sales_message_template !== undefined) {
        await db.sql`UPDATE users SET sales_message_template = ${sales_message_template} WHERE id = ${req.user.id}`;
      }
      return res.json({ success: true });
    }

    // Admin logic
    if (gemini_api_key !== undefined) {
      await db.sql`INSERT INTO settings (key, value) VALUES ('gemini_api_key', ${gemini_api_key}) ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
      // Also update admin's personal key to keep it in sync or clear it
      await db.sql`UPDATE users SET gemini_api_key = ${gemini_api_key} WHERE id = ${req.user.id}`;
      
      // Reset usage when key changes
      const today = new Date().toISOString().split('T')[0];
      await db.sql`INSERT INTO settings (key, value) VALUES ('gemini_usage_date', ${today}) ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
      await db.sql`INSERT INTO settings (key, value) VALUES ('gemini_usage_count', '0') ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
    }
    
    if (default_endpoint !== undefined) {
      await db.sql`INSERT INTO settings (key, value) VALUES ('default_endpoint', ${default_endpoint}) ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
    }

    if (sales_message_template !== undefined) {
      await db.sql`UPDATE users SET sales_message_template = ${sales_message_template} WHERE id = ${req.user.id}`;
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

// Get Gemini API usage
app.get('/api/gemini-usage', authenticateToken, async (req: any, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const usageDateRes = await db.sql`SELECT value FROM settings WHERE key = 'gemini_usage_date'`;
    const usageCountRes = await db.sql`SELECT value FROM settings WHERE key = 'gemini_usage_count'`;
    
    let usageDate = usageDateRes[0]?.value || '';
    let usageCount = parseInt(usageCountRes[0]?.value || '0', 10);
    
    if (usageDate !== today) {
      usageCount = 0;
      await db.sql`INSERT INTO settings (key, value) VALUES ('gemini_usage_date', ${today}) ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
      await db.sql`INSERT INTO settings (key, value) VALUES ('gemini_usage_count', '0') ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
    }
    
    res.json({ count: usageCount, limit: 1500 });
  } catch (error) {
    console.error('Error fetching gemini usage:', error);
    res.status(500).json({ error: 'Erro ao buscar uso da API' });
  }
});

// Increment Gemini API usage
app.post('/api/gemini-usage/increment', authenticateToken, async (req: any, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const usageDateRes = await db.sql`SELECT value FROM settings WHERE key = 'gemini_usage_date'`;
    const usageCountRes = await db.sql`SELECT value FROM settings WHERE key = 'gemini_usage_count'`;
    
    let usageDate = usageDateRes[0]?.value || '';
    let usageCount = parseInt(usageCountRes[0]?.value || '0', 10);
    
    if (usageDate !== today) {
      usageCount = 1;
      await db.sql`INSERT INTO settings (key, value) VALUES ('gemini_usage_date', ${today}) ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
    } else {
      usageCount += 1;
    }
    
    await db.sql`INSERT INTO settings (key, value) VALUES ('gemini_usage_count', ${usageCount.toString()}) ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
    
    res.json({ count: usageCount, limit: 1500 });
  } catch (error) {
    console.error('Error incrementing gemini usage:', error);
    res.status(500).json({ error: 'Erro ao incrementar uso da API' });
  }
});

// Dashboard Stats
app.get('/api/stats', authenticateToken, async (req: any, res) => {
  try {
    const userRes = await db.sql`SELECT sector, role FROM users WHERE id = ${req.user.id}`;
    const user = userRes[0];

    let totalQuery = "SELECT COUNT(*) as count FROM sites";
    let todayQuery = "SELECT COUNT(*) as count FROM sites WHERE date(created_at) = date('now')";
    
    if (user.role !== 'admin') {
      if (user.sector === 'Vendas') {
        totalQuery += " WHERE status = 'produzido'";
        todayQuery += " AND status = 'produzido'";
      } else if (user.sector === 'Produção') {
        totalQuery += " WHERE status = 'prospectado'";
        todayQuery += " AND status = 'prospectado'";
      } else if (user.sector === 'Prospecção') {
        totalQuery += " WHERE user_id = " + req.user.id;
        todayQuery += " AND user_id = " + req.user.id;
      }
    }

    const totalResults = await db.sql(totalQuery);
    const todayResults = await db.sql(todayQuery);
    
    // Get user progress
    const userProgressResults = await db.sql`SELECT COUNT(*) as count FROM sites WHERE user_id = ${req.user.id} AND date(created_at) = date('now')`;
    const userGoalResults = await db.sql`SELECT daily_goal FROM users WHERE id = ${req.user.id}`;
    
    res.json({
      total: totalResults[0].count,
      today: todayResults[0].count,
      userProgress: userProgressResults[0].count,
      userGoal: userGoalResults[0]?.daily_goal || 0
    });
  } catch (error: any) {
    console.error('Error in /api/stats:', error);
    const message = error.message?.includes('Maximum number of allowed connections reached') 
      ? 'O banco de dados está temporariamente sobrecarregado. Por favor, tente novamente em alguns instantes.'
      : 'Erro interno ao carregar estatísticas';
    res.status(500).json({ error: message });
  }
});

// Templates Management
app.get('/api/templates', authenticateToken, async (req: any, res) => {
  try {
    const templates = await db.sql`SELECT * FROM templates ORDER BY created_at DESC`;
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Erro ao buscar templates' });
  }
});

app.post('/api/templates', authenticateToken, async (req: any, res) => {
  const { name, prompt_template, flow_structure } = req.body;
  if (!name || !prompt_template || !flow_structure) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  }
  
  try {
    const result = await db.sql`INSERT INTO templates (name, prompt_template, flow_structure) VALUES (${name}, ${prompt_template}, ${flow_structure})`;
    res.json({ id: result.lastID, success: true });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Erro ao criar template' });
  }
});

app.put('/api/templates/:id', authenticateToken, async (req: any, res) => {
  const { name, prompt_template, flow_structure } = req.body;
  const { id } = req.params;
  
  try {
    await db.sql`UPDATE templates SET name = ${name}, prompt_template = ${prompt_template}, flow_structure = ${flow_structure} WHERE id = ${id}`;
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Erro ao atualizar template' });
  }
});

app.delete('/api/templates/:id', authenticateToken, async (req: any, res) => {
  try {
    await db.sql`DELETE FROM templates WHERE id = ${req.params.id}`;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Erro ao excluir template' });
  }
});

// Save Analyzed Data
app.post('/api/analyze/save', authenticateToken, async (req: any, res) => {
  const data = req.body;
  
  // Generate filename
  const safeName = data.name ? data.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)+/g, '') : 'empresa';
  const timestamp = Date.now();
  const filename = `${safeName}_${timestamp}.json`;
  const filepath = path.join(dadosDir, filename);

  // Save JSON to 'dados' folder
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving JSON file:', err);
    return res.status(500).json({ error: 'Erro ao salvar arquivo JSON' });
  }

  // Save to DB for history (reusing sites table)
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

    const servicesStr = Array.isArray(data.services) ? data.services.join(', ') : (data.services || '');
    const nameStr = String(data.name || 'Desconhecido');
    const phoneStr = String(data.phone || '');
    const addressStr = String(data.address || '');
    const cityStr = String(data.city || '');
    const descriptionStr = String(data.description || '');
    const mapLinkStr = String(data.map_link || '');
    const imageUrlStr = String(data.image_url || '');

    const result = await db.sql`
      INSERT INTO sites (slug, name, phone, address, city, description, services, map_link, image_url, expires_at, user_id, status, full_data)
      VALUES (${filename}, ${nameStr}, ${phoneStr}, ${addressStr}, ${cityStr}, ${descriptionStr}, ${servicesStr}, ${mapLinkStr}, ${imageUrlStr}, ${expiresAt.toISOString()}, ${req.user.id}, 'prospectado', ${JSON.stringify(data)})
    `;

    res.json({ id: result.lastID, filename });
  } catch (dbErr: any) {
    console.error('Database error when saving site:', dbErr);
    return res.status(500).json({ error: 'Erro no banco de dados ao salvar: ' + dbErr.message });
  }
});

// Bulk Save Leads
app.post('/api/analyze/bulk-save', authenticateToken, async (req: any, res) => {
  const { leads } = req.body;
  if (!Array.isArray(leads)) {
    return res.status(400).json({ error: 'Leads deve ser um array' });
  }

  const results = [];
  const errors = [];

  for (const lead of leads) {
    try {
      const safeName = lead.name ? lead.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)+/g, '') : 'empresa';
      const timestamp = Date.now() + Math.floor(Math.random() * 1000);
      const filename = `${safeName}_${timestamp}.json`;
      const filepath = path.join(dadosDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(lead, null, 2));

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const servicesStr = Array.isArray(lead.services) ? lead.services.join(', ') : (lead.services || '');
      const nameStr = String(lead.name || 'Desconhecido');
      const phoneStr = String(lead.phone || '');
      const addressStr = String(lead.address || '');
      const cityStr = String(lead.city || '');
      const descriptionStr = String(lead.description || '');
      const mapLinkStr = String(lead.maps_link || lead.map_link || '');
      const imageUrlStr = String(lead.image_url || '');

      const result = await db.sql`
        INSERT INTO sites (slug, name, phone, address, city, description, services, map_link, image_url, expires_at, user_id, status, full_data)
        VALUES (${filename}, ${nameStr}, ${phoneStr}, ${addressStr}, ${cityStr}, ${descriptionStr}, ${servicesStr}, ${mapLinkStr}, ${imageUrlStr}, ${expiresAt.toISOString()}, ${req.user.id}, 'prospectado', ${JSON.stringify(lead)})
      `;
      results.push({ id: result.lastID, name: lead.name });
    } catch (err: any) {
      console.error('Bulk save error for lead:', lead.name, err);
      errors.push({ name: lead.name, error: err.message });
    }
  }

  res.json({ success: true, results, errors });
});

// Save Search History
app.post('/api/search-history', authenticateToken, async (req: any, res) => {
  const { query, results_count, results_json } = req.body;
  try {
    await db.sql`
      INSERT INTO search_history (user_id, query, results_count, results_json)
      VALUES (${req.user.id}, ${query}, ${results_count}, ${JSON.stringify(results_json)})
    `;
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error saving search history:', error);
    res.status(500).json({ error: 'Erro ao salvar histórico de busca' });
  }
});

// List Search History
app.get('/api/search-history', authenticateToken, async (req: any, res) => {
  try {
    const userRes = await db.sql`SELECT role FROM users WHERE id = ${req.user.id}`;
    const user = userRes[0];
    
    let queryStr = `
      SELECT sh.*, u.username 
      FROM search_history sh 
      JOIN users u ON sh.user_id = u.id
    `;
    
    if (user.role !== 'admin') {
      queryStr += ` WHERE sh.user_id = ${req.user.id}`;
    }
    
    queryStr += ` ORDER BY sh.created_at DESC`;
    
    const history = await db.sql(queryStr);
    res.json(history);
  } catch (error: any) {
    console.error('Error listing search history:', error);
    res.status(500).json({ error: 'Erro ao listar histórico de busca' });
  }
});

// List Analyzed Links
app.get('/api/sites', authenticateToken, async (req: any, res) => {
  try {
    const userRes = await db.sql`SELECT sector, role FROM users WHERE id = ${req.user.id}`;
    const user = userRes[0];
    
    let query = `
      SELECT s.*, u.username as creator_name, u.sector as creator_sector 
      FROM sites s 
      LEFT JOIN users u ON s.user_id = u.id 
    `;
    
    let whereClauses = [];
    
    if (user.role !== 'admin') {
      if (user.sector === 'Vendas') {
        whereClauses.push("s.status IN ('vendas', 'produzido', 'contato', 'fechado', 'negado')");
      } else if (user.sector === 'Produção') {
        whereClauses.push("s.status IN ('prospectado', 'produção')");
      } else if (user.sector === 'Prospecção') {
        whereClauses.push("(s.status = 'prospectado' AND s.user_id = " + req.user.id + ")");
      }
    }
    
    if (whereClauses.length > 0) {
      query += " WHERE " + whereClauses.join(" AND ");
    }
    
    query += " ORDER BY s.created_at DESC";
    
    const sites = await db.sql(query);
    res.json(sites);
  } catch (error: any) {
    console.error('Error in /api/sites:', error);
    const message = error.message?.includes('Maximum number of allowed connections reached') 
      ? 'O banco de dados está temporariamente sobrecarregado. Por favor, tente novamente em alguns instantes.'
      : 'Erro interno ao carregar sites';
    res.status(500).json({ error: message });
  }
});

// Download JSON
app.get('/api/analyze/download/:filename', authenticateToken, async (req: any, res) => {
  const filename = req.params.filename;
  
  try {
    // First try to get from database
    const results = await db.sql`SELECT full_data FROM sites WHERE slug = ${filename}`;
    const site = results[0];
    
    if (site) {
      if (site.full_data) {
        try {
          const data = JSON.parse(site.full_data);
          return res.json(data);
        } catch (e) {
          console.error('Error parsing full_data from DB:', e);
        }
      } else {
        // Reconstruct from columns if full_data is missing
        const resultsFull = await db.sql`SELECT * FROM sites WHERE slug = ${filename}`;
        const s = resultsFull[0];
        if (s) {
          const data = {
            name: s.name,
            phone: s.phone,
            address: s.address,
            city: s.city,
            description: s.description,
            services: s.services ? s.services.split(', ') : [],
            map_link: s.map_link,
            image_url: s.image_url,
            status: s.status,
            created_at: s.created_at
          };
          return res.json(data);
        }
      }
    }

    // Fallback to file system
    const filepath = path.join(dadosDir, filename);
    if (fs.existsSync(filepath)) {
      return res.download(filepath);
    }

    res.status(404).json({ error: 'Arquivo não encontrado' });
  } catch (error) {
    console.error('Error in /api/analyze/download:', error);
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
});

// Expand URL
app.post('/api/expand-url', authenticateToken, async (req: any, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    
    const response = await fetch(url, { 
      method: 'GET', 
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    res.json({ url: response.url });
  } catch (error: any) {
    console.error('Error expanding URL:', error);
    res.status(500).json({ error: 'Failed to expand URL' });
  }
});

// Proxy Endpoint for Webhooks
app.post('/api/proxy-webhook', authenticateToken, async (req: any, res: any) => {
  // Only admins and Produção sector can send data to endpoints
  if (req.user.role !== 'admin' && req.user.sector !== 'Produção') {
    return res.status(403).json({ error: 'Apenas administradores e o setor de Produção podem enviar dados para endpoints' });
  }

  try {
    const { url: rawUrl, payload, method = 'POST', authToken } = req.body;
    if (!rawUrl) return res.status(400).json({ error: 'URL is required' });
    if (!payload) return res.status(400).json({ error: 'Payload is required' });
    
    // Clean URL: trim and remove trailing slashes which can cause 404s on some servers
    const url = rawUrl.trim().replace(/\/+$/, '');
    console.log(`[Proxy] ${method} to: ${url}`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    if (authToken) {
      // Support both Bearer and simple token formats
      headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
      headers['x-api-key'] = authToken; // Some systems use this instead
    }

    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers
    };

    if (fetchOptions.method !== 'GET' && fetchOptions.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(payload);
    }

    const response = await fetch(url, fetchOptions);

    if (response.ok) {
      res.json({ success: true, status: response.status });
    } else {
      let errorBody = '';
      try {
        errorBody = await response.text();
        // Try to parse if it's JSON to get a cleaner message
        const json = JSON.parse(errorBody);
        if (json.error || json.message) {
          errorBody = json.error || json.message;
        }
      } catch (e) {
        // use raw text if not JSON
      }
      
      res.status(response.status).json({ 
        error: errorBody || `HTTP Error: ${response.status}`, 
        status: response.status 
      });
    }
  } catch (error: any) {
    console.error('Error proxying webhook:', error);
    res.status(500).json({ error: error.message || 'Failed to send webhook' });
  }
});

// Analyze Link Endpoint
app.post('/api/analyze-link', async (req: any, res: any) => {
  // Check for authorization (either JWT or a simple API key passed in headers)
  const authHeader = req.headers['authorization'];
  const apiKeyHeader = req.headers['x-api-key'];
  
  let isAuthenticated = false;
  let requestUser: any = null;
  
  if (apiKeyHeader) {
     // Check if it matches a user's API key
     const results = await db.sql`SELECT id, role, gemini_api_key FROM users WHERE api_key = ${apiKeyHeader}`;
     const user = results[0];
     if (user) {
       isAuthenticated = true;
       requestUser = user;
     }
  } else if (authHeader) {
     const token = authHeader.split(' ')[1];
     try {
       const decoded: any = jwt.verify(token, JWT_SECRET);
       const results = await db.sql`SELECT id, role, gemini_api_key FROM users WHERE id = ${decoded.id}`;
       const user = results[0];
       if (user) {
         isAuthenticated = true;
         requestUser = user;
       }
     } catch (e) {
       // ignore
     }
  }

  if (!isAuthenticated) {
    return res.status(401).json({ error: 'Não autorizado. Forneça um token JWT válido ou um x-api-key configurado.' });
  }

  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'A URL é obrigatória no corpo da requisição ({"url": "..."}).' });
  }

  try {
    // Get Gemini API Key
    let geminiApiKey = '';
    const settings = await db.sql`SELECT key, value FROM settings`;
    const settingsMap = settings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as any);

    // If the request is authenticated, check if the user has a personal key
    if (requestUser && requestUser.role !== 'admin' && requestUser.gemini_api_key) {
      geminiApiKey = requestUser.gemini_api_key;
      console.log("Using personal API key from user settings");
    }

    // Fallback to global settings if no personal key is set
    if (!geminiApiKey && settingsMap.gemini_api_key) {
      geminiApiKey = settingsMap.gemini_api_key;
      console.log("Using API key from database settings");
    }

    if (!geminiApiKey) {
      geminiApiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
      if (geminiApiKey) {
        console.log("Using API key from environment variables");
      }
    }

    if (geminiApiKey) {
      geminiApiKey = geminiApiKey.trim();
    }

    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Chave da API do Gemini não configurada. Por favor, configure na engrenagem.' });
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    
    // Extract place name hint if possible
    let placeNameHint = '';
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      const placePart = pathParts.find(part => part.includes('+') || part.includes('-'));
      if (placePart) {
        placeNameHint = decodeURIComponent(placePart.replace(/\+/g, ' '));
      }
    } catch (e) {
      // ignore
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Você é um especialista em extração de dados e inteligência de mercado.
Você recebeu o seguinte link: ${url}
${placeNameHint ? `\nDica: O nome do estabelecimento extraído da URL parece ser "${placeNameHint}".` : ''}

Sua missão é OBRIGATÓRIA:
1. Analise cuidadosamente a URL fornecida (pode ser Google Maps, Instagram, Site Próprio, Facebook, etc.) para identificar o estabelecimento ou empresa.
2. Descubra EXATAMENTE qual é a empresa real (nome, nicho, descrição, contato, endereço).
3. Se o link for genérico, quebrado, ou se você NÃO TIVER 100% DE CERTEZA de qual é a empresa exata, você DEVE definir "success" como false e preencher o "errorMessage" explicando que não foi possível identificar o local e pedindo para o usuário verificar o link.
4. Se você encontrou a empresa com sucesso, defina "success" as true e extraia os dados reais:
   - "name": Nome da empresa.
   - "phone": Telefone (apenas números com DDD).
   - "address": Endereço completo (se disponível).
   - "city": Cidade.
   - "niche": Nicho exato (ex: barbearia, lanchonete, clínica, restaurante, agência).
   - "description": Descrição detalhada e persuasiva do negócio.
   - "services": Principais serviços oferecidos, separados por vírgula.
   - "email": E-mail de contato (se disponível).
   - "social": Links de redes sociais encontrados (se disponível).

RETORNE APENAS UM JSON VÁLIDO com a seguinte estrutura exata (sem formatação markdown como \`\`\`json):
{
  "success": true/false,
  "errorMessage": "mensagem de erro se success for false",
  "name": "Nome da Empresa",
  "phone": "Telefone",
  "address": "Endereço Completo",
  "city": "Cidade",
  "niche": "Nicho",
  "description": "Descrição",
  "services": "Serviços",
  "email": "E-mail",
  "social": "Redes Sociais"
}

NÃO INVENTE DADOS. Se não souber ou não encontrar a empresa exata, retorne success: false.`,
      config: {
        // A IA consegue extrair os dados diretamente da URL expandida ou via URL Context se disponível.
        tools: [{ urlContext: {} }]
      }
    });

    let responseText = '{}';
    try {
      responseText = response.text || '{}';
    } catch (e: any) {
      console.error('Error getting response text:', e);
      throw new Error('A resposta da IA foi bloqueada ou retornou vazia. Tente um link diferente.');
    }

    let result;
    try {
      const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      result = JSON.parse(cleanText);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError, "Raw text:", responseText);
      throw new Error("A resposta da IA não estava em um formato válido. Tente novamente.");
    }
    
    return res.json(result);

  } catch (error: any) {
    console.error('Error analyzing link:', error);
    
    let friendlyError = error.message || 'Erro interno ao analisar o link';
    if (friendlyError.includes('429') || friendlyError.includes('RESOURCE_EXHAUSTED') || friendlyError.includes('quota')) {
      friendlyError = 'Limite de cota atingido (Erro 429). A ferramenta do Google Maps no Gemini tem limites diários. IMPORTANTE: Se você trocou a chave no Render, lembre-se de atualizá-la também no menu "Configurações" deste painel, pois a chave salva lá tem prioridade.';
    } else if (friendlyError.includes('503') || friendlyError.includes('UNAVAILABLE') || friendlyError.includes('high demand')) {
      friendlyError = 'Os servidores da Inteligência Artificial estão sobrecarregados no momento (Erro 503). Isso é temporário. Por favor, aguarde alguns instantes e tente novamente.';
    } else if (friendlyError.includes('API_KEY_INVALID') || friendlyError.includes('invalid API key')) {
      friendlyError = 'Chave de API inválida. Por favor, verifique a chave configurada nas Configurações.';
    }

    return res.status(500).json({ error: friendlyError, details: error.message });
  }
});

// Update Site Status
app.patch('/api/sites/:id/status', authenticateToken, async (req: any, res: any) => {
  const { id } = req.params;
  const { status, hosting_url } = req.body;
  
  try {
    const userRes = await db.sql`SELECT sector, role FROM users WHERE id = ${req.user.id}`;
    const user = userRes[0];
    
    const siteRes = await db.sql`SELECT status, user_id FROM sites WHERE id = ${id}`;
    if (siteRes.length === 0) return res.status(404).json({ error: 'Site não encontrado' });
    const currentSite = siteRes[0];

    // Enforce sequential flow and sector restrictions
    if (user.role !== 'admin') {
      if (user.sector === 'Produção') {
        // Produção can move from prospectado to produção, or from produção to produzido
        if (currentSite.status === 'prospectado') {
          if (status !== 'produção') {
            return res.status(400).json({ error: 'Produção só pode mover de prospectado para produção' });
          }
        } else if (currentSite.status === 'produção') {
          if (status !== 'produzido') {
            return res.status(400).json({ error: 'Produção só pode mover de produção para produzido' });
          }
          if (!hosting_url) {
            return res.status(400).json({ error: 'Link de hospedagem é obrigatório para finalizar a produção' });
          }
        } else {
          return res.status(403).json({ error: 'Produção só pode alterar sites com status prospectado ou produção' });
        }
      } else if (user.sector === 'Vendas') {
        if (currentSite.status !== 'produzido') {
          return res.status(403).json({ error: 'Vendas só pode alterar sites com status produzido' });
        }
        if (status !== 'fechado') {
          return res.status(400).json({ error: 'Vendas só pode mover para fechado' });
        }
      } else if (user.sector === 'Prospecção') {
        return res.status(403).json({ error: 'Prospecção não pode alterar status' });
      }
    }

    let updates = [];
    let values = [];

    if (status) {
      updates.push("status = ?");
      values.push(status);
    }
    
    if (hosting_url !== undefined) {
      updates.push("hosting_url = ?");
      values.push(hosting_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    const updateQuery = "UPDATE sites SET " + updates.join(", ") + " WHERE id = ?";
    values.push(id);

    await db.sql(updateQuery, ...values);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

// Delete Analyzed Data
app.delete('/api/sites/:id', authenticateToken, async (req: any, res) => {
  try {
    const results = await db.sql`SELECT slug FROM sites WHERE id = ${req.params.id}`;
    const site = results[0];
    if (site) {
      const filepath = path.join(dadosDir, site.slug);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      await db.sql`DELETE FROM sites WHERE id = ${req.params.id}`;
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting site:', error);
    res.status(500).json({ error: 'Erro ao excluir site' });
  }
});

// Generate AI Message for Sales
app.post('/api/sales/generate-message', authenticateToken, async (req: any, res: any) => {
  const { siteId } = req.body;
  if (!siteId) return res.status(400).json({ error: 'ID do site é obrigatório' });

  try {
    const userRes = await db.sql`SELECT gemini_api_key, sector FROM users WHERE id = ${req.user.id}`;
    const user = userRes[0];

    if (user.sector !== 'Vendas' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas setor de vendas pode gerar mensagens' });
    }

    const siteRes = await db.sql`SELECT * FROM sites WHERE id = ${siteId}`;
    const site = siteRes[0];
    if (!site) return res.status(404).json({ error: 'Site não encontrado' });

    // Get Gemini API Key
    let geminiApiKey = user.gemini_api_key;
    if (!geminiApiKey) {
      const settings = await db.sql`SELECT value FROM settings WHERE key = 'gemini_api_key'`;
      geminiApiKey = settings[0]?.value;
    }

    if (!geminiApiKey) {
      geminiApiKey = process.env.GEMINI_API_KEY || '';
    }

    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Chave da API do Gemini não configurada.' });
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Você é um especialista em vendas e copywriting.
Sua tarefa é criar uma primeira mensagem de abordagem personalizada e altamente persuasiva para um cliente em potencial.

DADOS DA EMPRESA:
Nome: ${site.name}
Nicho/Descrição: ${site.description}
Serviços: ${site.services}
Cidade: ${site.city}

OBJETIVO:
Apresentar a DS Company e oferecer a criação de um site profissional (que já foi pré-produzido como demonstração).
A mensagem deve ser amigável, profissional e focada em como um site pode ajudar o negócio dele a crescer.

REGRAS:
1. Use um tom de voz que combine com o nicho da empresa.
2. Seja conciso e direto ao ponto.
3. Inclua um Call to Action (CTA) claro.
4. Não use placeholders como [Nome], use os dados fornecidos.
5. Retorne APENAS o texto da mensagem, sem comentários ou formatação markdown.`,
    });

    res.json({ message: response.text });
  } catch (error: any) {
    console.error('Error generating sales message:', error);
    res.status(500).json({ error: 'Erro ao gerar mensagem: ' + (error.message || 'Erro desconhecido') });
  }
});

// Generate database export files
app.post('/api/admin/generate-export', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  try {
    // Run both scripts sequentially
    console.log('Starting manual database export generation...');
    
    exec('npx tsx scripts/export_db.ts && npx tsx scripts/generate_sqlite_file_pure_js.ts', (error, stdout, stderr) => {
      if (error) {
        console.error(`Export generation error: ${error.message}`);
        return res.status(500).json({ error: 'Erro ao gerar arquivos de exportação' });
      }
      console.log(`Export generation output: ${stdout}`);
      res.json({ success: true });
    });
  } catch (error) {
    console.error('Error in generate-export route:', error);
    res.status(500).json({ error: 'Erro interno ao processar exportação' });
  }
});

// Download database export
app.get('/api/admin/export-db', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const format = req.query.format || 'json';
  let fileName = 'database_export.json';
  
  if (format === 'sqlite') {
    fileName = 'database_export.sqlite';
  }

  const filePath = path.join(process.cwd(), fileName);
  if (fs.existsSync(filePath)) {
    res.download(filePath, fileName);
  } else {
    res.status(404).json({ error: `Arquivo de exportação (${format}) não encontrado. Por favor, gere o arquivo primeiro.` });
  }
});

// --- Vercel Serverless Export ---
export default app;

// --- Local Development & Production Server ---
const startServer = async () => {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    // Start Vite dev server
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware integrated');
  } else if (!process.env.VERCEL) {
    // Serve static files in production (Render, Railway, VPS, etc.)
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT} (${process.env.NODE_ENV || 'development'} mode)`);
    });
  }
};

startServer();
