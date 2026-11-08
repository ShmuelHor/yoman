import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/base.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('index.html has no #root element');
}
createRoot(container).render(<StrictMode />);
