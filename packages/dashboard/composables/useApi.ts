/**
 * useApi - Composable for ScreenSentinel API calls.
 * Handles extraction API and token service communication.
 */
export function useApi() {
  const config = useRuntimeConfig();
  const extractionUrl = config.public.extractionApiUrl;
  const tokenUrl = config.public.tokenApiUrl;

  // ─── Extraction API ───

  async function submitExtraction(file: File, priority = 'normal') {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('priority', priority);

    const response = await fetch(`${extractionUrl}/api/v1/extract/`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) throw new Error(`Extraction failed: ${response.status}`);
    return await response.json();
  }

  async function getExtractionHealth() {
    try {
      const response = await fetch(`${extractionUrl}/health/`);
      return await response.json();
    } catch {
      return { status: 'offline' };
    }
  }

  // ─── Token Service ───

  async function getTokenHealth() {
    try {
      const response = await fetch(`${tokenUrl}/health`);
      return await response.json();
    } catch {
      return { status: 'offline' };
    }
  }

  // ─── Database queries via extraction API ───

  async function getRecentSessions() {
    try {
      const response = await fetch(`${extractionUrl}/api/v1/sessions/recent`);
      if (!response.ok) return [];
      return await response.json();
    } catch {
      return [];
    }
  }

  async function getInvestigations() {
    try {
      const response = await fetch(`${extractionUrl}/api/v1/investigations/`);
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async function createInvestigation(data: {
    title: string;
    description: string;
    severity: string;
    source_url?: string;
  }) {
    const response = await fetch(`${extractionUrl}/api/v1/investigations/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await response.json();
  }

  async function getDashboardStats() {
    try {
      const response = await fetch(`${extractionUrl}/api/v1/stats`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  return {
    submitExtraction,
    getExtractionHealth,
    getTokenHealth,
    getRecentSessions,
    getInvestigations,
    createInvestigation,
    getDashboardStats,
  };
}
