import { useState, useEffect } from 'react';
import './App.css';

interface DetectedError {
  category: string;
  errorMessage: string;
}

interface AnalysisResult {
  rootCause: string;
  failureStage: string;
  suggestedFix: string;
  detectedErrors: DetectedError[];
}

function App() {
  const [logText, setLogText] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Handle JWT from /auth/callback?token=... and fetch user profile
  useEffect(() => {
    // 1) Read token from URL if present
    const url = new URL(window.location.href);
    const urlToken = url.searchParams.get('token');
    if (urlToken) {
      localStorage.setItem('auth_token', urlToken);
      setToken(urlToken);
      // Clean the URL
      url.searchParams.delete('token');
      window.history.replaceState({}, document.title, url.pathname);
    } else {
      // 2) Or load from localStorage
      const stored = localStorage.getItem('auth_token');
      if (stored) setToken(stored);
    }
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      if (!token) return;
      try {
        const response = await fetch('http://localhost:3001/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else {
          // Token invalid
          localStorage.removeItem('auth_token');
          setToken(null);
          setUser(null);
        }
      } catch (e) {
        console.error('Could not fetch user session', e);
      }
    };
    fetchUser();
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
  };

  const handleAnalyze = async () => {
    if (!logText) {
      setError('Please paste some logs first.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const response = await fetch('http://localhost:3001/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: logText,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data: AnalysisResult = await response.json();
      setAnalysis(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Failed to get analysis. ${errorMessage}. Is the backend server running?`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main>
      <header>
        {user ? (
          <div className="user-info">
            <span>Welcome, {user.username}!</span>
            <button onClick={handleLogout}>Logout</button>
          </div>
        ) : (
          <a href="http://localhost:3001/auth/github/login" className="login-btn">Login with GitHub</a>
        )}
      </header>
      <h1>AI-Driven CI/CD Failure Analyzer</h1>
      <p>Paste your raw CI/CD log file below to get an automated root cause analysis.</p>
      
      <div className="container">
        <textarea 
          value={logText}
          onChange={(e) => setLogText(e.target.value)}
          placeholder="Paste raw log text here..."
        />
        <button onClick={handleAnalyze} disabled={isLoading}>
          {isLoading ? 'Analyzing...' : 'Analyze Log'}
        </button>
        
        {error && <div className="error-box"><p>{error}</p></div>}

        {isLoading && <div className="spinner"></div>}

        {analysis && (
          <div id="results">
            <h2>Analysis Results</h2>
            <div className="result-item">
              <h3>Root Cause</h3>
              <p>{analysis.rootCause}</p>
            </div>
            <div className="result-item">
              <h3>Failure Stage</h3>
              <p>{analysis.failureStage}</p>
            </div>
            <div className="result-item">
              <h3>Suggested Fix</h3>
              <pre><code>{analysis.suggestedFix}</code></pre>
            </div>
            <div className="result-item">
              <h3>Detected Errors</h3>
              <ul>
                {analysis.detectedErrors?.length > 0 ? (
                  analysis.detectedErrors.map((err, index) => (
                    <li key={index}><strong>[{err.category}]</strong> {err.errorMessage}</li>
                  ))
                ) : (
                  <li>No specific errors were automatically detected.</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default App;
