interface Incident {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'assigned' | 'escalated' | 'resolved';
  assignedTo: string;
  createdAt: string;
  resolvedAt: string | null;
  postMortem: string | null;
}

interface IncidentRequest {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  assignedTo: string;
}

const INCIDENTS_KEY = 'incidents';
const DEFAULT_ASSIGNEE = 'unassigned';

class IncidentManager {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    switch (path) {
      case '/api/incident':
        if (request.method === 'POST') {
          return this.createIncident(request);
        }
        break;
      case '/api/incidents':
        if (request.method === 'GET') {
          return this.getIncidents();
        }
        break;
      case '/api/resolve':
        if (request.method === 'POST') {
          return this.resolveIncident(request);
        }
        break;
      case '/health':
        return new Response(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }), {
          headers: { 'Content-Type': 'application/json' }
        });
    }

    return this.htmlResponse();
  }

  private async createIncident(request: Request): Promise<Response> {
    try {
      const data: IncidentRequest = await request.json();
      
      if (!data.title || !data.description || !data.severity) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const incidents = await this.getStoredIncidents();
      const incident: Incident = {
        id: crypto.randomUUID(),
        title: data.title,
        description: data.description,
        severity: data.severity,
        status: 'open',
        assignedTo: data.assignedTo || DEFAULT_ASSIGNEE,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        postMortem: null
      };

      incidents.push(incident);
      await this.state.storage.put(INCIDENTS_KEY, incidents);

      return new Response(JSON.stringify(incident), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async getIncidents(): Promise<Response> {
    const incidents = await this.getStoredIncidents();
    return new Response(JSON.stringify(incidents), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async resolveIncident(request: Request): Promise<Response> {
    try {
      const { id, postMortem } = await request.json();
      
      if (!id) {
        return new Response(JSON.stringify({ error: 'Incident ID required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const incidents = await this.getStoredIncidents();
      const incidentIndex = incidents.findIndex(inc => inc.id === id);
      
      if (incidentIndex === -1) {
        return new Response(JSON.stringify({ error: 'Incident not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      incidents[incidentIndex].status = 'resolved';
      incidents[incidentIndex].resolvedAt = new Date().toISOString();
      incidents[incidentIndex].postMortem = postMortem || null;

      await this.state.storage.put(INCIDENTS_KEY, incidents);

      return new Response(JSON.stringify(incidents[incidentIndex]), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async getStoredIncidents(): Promise<Incident[]> {
    const incidents = await this.state.storage.get<Incident[]>(INCIDENTS_KEY);
    return incidents || [];
  }

  private htmlResponse(): Response {
    const incidents = this.getStoredIncidents();
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fleet Hero: Incident Manager</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --dark-bg: #0a0a0f;
            --accent: #dc2626;
            --text-light: #f8fafc;
            --text-muted: #94a3b8;
            --card-bg: #1e1e2e;
            --border-color: #2d3748;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--dark-bg);
            color: var(--text-light);
            line-height: 1.6;
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        header {
            text-align: center;
            padding: 2rem 0;
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 2rem;
        }
        
        h1 {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            background: linear-gradient(135deg, var(--accent) 0%, #f97316 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .subtitle {
            color: var(--text-muted);
            font-size: 1.1rem;
        }
        
        .dashboard {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
            margin-bottom: 3rem;
        }
        
        .card {
            background: var(--card-bg);
            border-radius: 12px;
            padding: 1.5rem;
            border: 1px solid var(--border-color);
        }
        
        .card h2 {
            font-size: 1.5rem;
            margin-bottom: 1rem;
            color: var(--accent);
        }
        
        .form-group {
            margin-bottom: 1rem;
        }
        
        label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 500;
            color: var(--text-muted);
        }
        
        input, select, textarea {
            width: 100%;
            padding: 0.75rem;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            color: var(--text-light);
            font-family: 'Inter', sans-serif;
            font-size: 1rem;
        }
        
        textarea {
            min-height: 100px;
            resize: vertical;
        }
        
        .btn {
            background: var(--accent);
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 6px;
            font-family: 'Inter', sans-serif;
            font-weight: 600;
            font-size: 1rem;
            cursor: pointer;
            transition: opacity 0.2s;
        }
        
        .btn:hover {
            opacity: 0.9;
        }
        
        .btn-block {
            width: 100%;
        }
        
        .incident-list {
            margin-top: 1rem;
        }
        
        .incident-item {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1rem;
            margin-bottom: 1rem;
        }
        
        .incident-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
        }
        
        .incident-title {
            font-weight: 600;
            font-size: 1.1rem;
        }
        
        .severity {
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.875rem;
            font-weight: 600;
        }
        
        .severity-critical {
            background: rgba(220, 38, 38, 0.2);
            color: #fca5a5;
        }
        
        .severity-high {
            background: rgba(249, 115, 22, 0.2);
            color: #fdba74;
        }
        
        .severity-medium {
            background: rgba(234, 179, 8, 0.2);
            color: #fde047;
        }
        
        .severity-low {
            background: rgba(34, 197, 94, 0.2);
            color: #86efac;
        }
        
        .incident-meta {
            display: flex;
            gap: 1rem;
            color: var(--text-muted);
            font-size: 0.875rem;
            margin-top: 0.5rem;
        }
        
        .status {
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.875rem;
            font-weight: 600;
            background: rgba(59, 130, 246, 0.2);
            color: #93c5fd;
        }
        
        footer {
            text-align: center;
            padding: 2rem 0;
            border-top: 1px solid var(--border-color);
            margin-top: 2rem;
            color: var(--text-muted);
        }
        
        .footer-logo {
            font-weight: 700;
            color: var(--accent);
            margin-bottom: 0.5rem;
        }
        
        @media (max-width: 768px) {
            .dashboard {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Fleet Hero: Incident Manager</h1>
            <p class="subtitle">Real-time incident management for your fleet operations</p>
        </header>
        
        <div class="dashboard">
            <div class="card">
                <h2>Create New Incident</h2>
                <form id="incidentForm">
                    <div class="form-group">
                        <label for="title">Incident Title</label>
                        <input type="text" id="title" name="title" required placeholder="e.g., Vehicle GPS Failure">
                    </div>
                    
                    <div class="form-group">
                        <label for="description">Description</label>
                        <textarea id="description" name="description" required placeholder="Detailed description of the incident..."></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label for="severity">Severity Level</label>
                        <select id="severity" name="severity" required>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="assignedTo">Assign To</label>
                        <input type="text" id="assignedTo" name="assignedTo" placeholder="Team or individual name">
                    </div>
                    
                    <button type="submit" class="btn btn-block">Create Incident</button>
                </form>
            </div>
            
            <div class="card">
                <h2>Active Incidents</h2>
                <div id="incidentsList" class="incident-list">
                    <p style="color: var(--text-muted); text-align: center;">Loading incidents...</p>
                </div>
            </div>
        </div>
        
        <footer>
            <div class="footer-logo">Fleet Hero Incident Manager</div>
            <p>Real-time incident management system for fleet operations</p>
            <p style="margin-top: 1rem; font-size: 0.875rem;">© 2024 Fleet Hero Systems. All rights reserved.</p>
        </footer>
    </div>
    
    <script>
        const API_BASE = '/api';
        
        async function loadIncidents() {
            try {
                const response = await fetch(API_BASE + '/incidents');
                const incidents = await response.json();
                
                const list = document.getElementById('incidentsList');
                if (incidents.length === 0) {
                    list.innerHTML = '<p style="color: var(--text-muted); text-align: center;">No active incidents</p>';
                    return;
                }
                
                list.innerHTML = incidents.map(incident => \`
                    <div class="incident-item">
                        <div class="incident-header">
                            <div class="incident-title">\${incident.title}</div>
                            <div class="severity severity-\${incident.severity}">\${incident.severity.toUpperCase()}</div>
                        </div>
                        <p>\${incident.description}</p>
                        <div class="incident-meta">
                            <span>Assigned to: \${incident.assignedTo}</span>
                            <span class="status">\${incident.status.toUpperCase()}</span>
                            <span>\${new Date(incident.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                \`).join('');
            } catch (error) {
                console.error('Failed to load incidents:', error);
            }
        }
        
        document.getElementById('incidentForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = {
                title: document.getElementById('title').value,
                description: document.getElementById('description').value,
                severity: document.getElementById('severity').value,
                assignedTo: document.getElementById('assignedTo').value || 'unassigned'
            };
            
            try {
                const response = await fetch(API_BASE + '/incident', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });
                
                if (response.ok) {
                    alert('Incident created successfully!');
                    e.target.reset();
                    loadIncidents();
                } else {
                    alert('Failed to create incident');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Failed to create incident');
            }
        });
        
        document.addEventListener('DOMContentLoaded', loadIncidents);
        setInterval(loadIncidents, 30000);
    </script>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;",
        'X-Frame-Options': 'DENY'
      }
    });
  }
}

export interface Env {
  INCIDENT_MANAGER: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'incident-manager' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname.startsWith('/api/')) {
      const id = env.INCIDENT_MANAGER.idFromName('incident-manager');
      const stub = env.INCIDENT_MANAGER.get(id);
      return stub.fetch(request);
    }
    
    const id = env.INCIDENT_MANAGER.idFromName('incident-manager');
    const stub = env.INCIDENT_MANAGER.get(id);
    return stub.fetch(request);
  }
};

export { IncidentManager };