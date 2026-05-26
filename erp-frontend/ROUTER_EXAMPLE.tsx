// Example of how to add the simpler URL route to your router

// Option 1: If you're using React Router in App.tsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import SimpleDynamicPage from './pages/SimpleDynamicPage';
import DynamicModulePage from './pages/DynamicModulePage';

function App() {
  return (
    <Router>
      <Routes>
        {/* Existing route - descriptive URLs */}
        <Route path="/:moduleCode/:pageCode" element={<DynamicModulePage />} />

        {/* NEW: Simpler URL option - numeric IDs */}
        <Route path="/page/:pageId" element={<SimpleDynamicPage />} />

        {/* Other routes... */}
      </Routes>
    </Router>
  );
}

// Now you can use BOTH URL styles:
// 1. Descriptive: /accounts/101_001_report/
// 2. Simple: /page/4

// Example dashboard button configs:
const exampleButtons = [
  {
    label: 'Child 2 Report',
    // Option A: Descriptive URL
    url: '/accounts/101_001_report/',

    // Option B: Simple URL (if you prefer)
    // url: '/page/4',
  },
  {
    label: 'Christmas Transaction',
    // Option A: Descriptive URL
    url: '/accounts/100_299_transaction/',

    // Option B: Simple URL
    // url: '/page/1',
  },
];
