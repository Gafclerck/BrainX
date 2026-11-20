import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './routes';
import { fetchPublicConfig } from '@/features/config';
import { FeedbackWidget } from '@/features/feedback';

export function App() {
  useEffect(() => {
    fetchPublicConfig();
  }, []);

  return (
    <BrowserRouter>
      <AppRoutes />
      <FeedbackWidget />
    </BrowserRouter>
  );
}

export default App;

