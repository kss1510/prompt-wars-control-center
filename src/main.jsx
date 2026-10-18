import React from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App.jsx';
import { demoMode } from './lib/supabase';
import './styles.css';
// Vercel Web Analytics (cookieless page views) on every screen, including sign-in. Off in demo mode.
createRoot(document.getElementById('root')).render(<React.StrictMode><App />{!demoMode&&<Analytics />}</React.StrictMode>);
