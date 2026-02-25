import { useState, useEffect } from 'react';
import api from '../services/api';

export default function DiagnosticsPage() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const runDiagnostics = async () => {
      const newResults = [];
      
      // Test 1: Check API base URL
      const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
      newResults.push({
        name: 'API Base URL',
        value: baseURL,
        status: baseURL ? 'ok' : 'warning',
      });

      // Test 2: Health check
      try {
        const health = await api.get('/health');
        newResults.push({
          name: 'Health Check (/api/health)',
          value: JSON.stringify(health),
          status: 'ok',
        });
      } catch (err) {
        newResults.push({
          name: 'Health Check (/api/health)',
          value: err.message,
          status: 'error',
        });
      }

      // Test 3: Test backend endpoint
      try {
        const test = await api.get('/test-backend');
        newResults.push({
          name: 'Test Backend (/api/test-backend)',
          value: JSON.stringify(test),
          status: 'ok',
        });
      } catch (err) {
        newResults.push({
          name: 'Test Backend (/api/test-backend)',
          value: err.message,
          status: 'error',
        });
      }

      // Test 4: Check if token exists
      const token = localStorage.getItem('sgcg_token');
      newResults.push({
        name: 'Stored Auth Token',
        value: token ? token.substring(0, 30) + '...' : 'No token',
        status: token ? 'ok' : 'warning',
      });

      // Test 5: Try to fetch glass types (requires auth)
      try {
        const glassTypes = await api.get('/admin/glass-types');
        const items = Array.isArray(glassTypes) ? glassTypes : (glassTypes?.items || []);
        newResults.push({
          name: 'Fetch Glass Types (auth required)',
          value: `${items.length} types fetched`,
          status: 'ok',
        });
      } catch (err) {
        newResults.push({
          name: 'Fetch Glass Types (auth required)',
          value: `${err.response?.status}: ${err.message}`,
          status: 'error',
        });
      }

      // Test 6: Check environment
      newResults.push({
        name: 'Frontend Environment',
        value: `${import.meta.env.MODE} mode`,
        status: 'info',
      });

      setResults(newResults);
      setLoading(false);
    };

    runDiagnostics();
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'ok': return '#28a745';
      case 'error': return '#dc3545';
      case 'warning': return '#ffc107';
      case 'info': return '#17a2b8';
      default: return '#6c757d';
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>SGCG Diagnostics</h1>
      
      {loading && <p>Running diagnostics...</p>}
      
      {!loading && (
        <div>
          <p><strong>Total Tests:</strong> {results.length}</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0', borderBottom: '1px solid #ccc' }}>
                <th style={{ textAlign: 'left', padding: '10px', borderRight: '1px solid #ccc' }}>Test</th>
                <th style={{ textAlign: 'left', padding: '10px', borderRight: '1px solid #ccc' }}>Result</th>
                <th style={{ textAlign: 'center', padding: '10px', width: '100px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px', borderRight: '1px solid #eee', fontWeight: 'bold' }}>
                    {result.name}
                  </td>
                  <td style={{ padding: '10px', borderRight: '1px solid #eee', fontSize: '0.85em', color: '#333' }}>
                    {result.value}
                  </td>
                  <td style={{
                    padding: '10px',
                    textAlign: 'center',
                    backgroundColor: getStatusColor(result.status),
                    color: 'white',
                    fontWeight: 'bold',
                  }}>
                    {result.status.toUpperCase()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
            <h3>How to use:</h3>
            <ul>
              <li>Open browser console (F12) to see full error messages</li>
              <li>Check the table above for API connectivity issues</li>
              <li>If "Health Check" fails, verify your API_BASE_URL is correct</li>
              <li>If "Fetch Glass Types" fails with 401, re-login</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
