import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

// Extend window with our API
declare global {
  interface Window {
    apexDrive: import('../preload/preload').ApexDriveAPI;
    platform: {
      os: string;
      arch: string;
    };
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
