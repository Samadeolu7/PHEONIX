import React from 'react';

export const GlobalStyles = () => (
  <style jsx global>{`
    :root {
      --primary-color: #0066cc;
      --secondary-color: #666;
      --success-color: #008000;
      --danger-color: #cc0000;
      --warning-color: #cc9900;
      --background-color: #f5f5f5;
      --card-background: #ffffff;
      --text-color: #333333;
      --border-color: #e0e0e0;
      --border-radius: 4px;
      --spacing-unit: 8px;
      --transition-speed: 0.2s;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family:
        -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.5;
      color: var(--text-color);
      background-color: var(--background-color);
    }

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      margin-bottom: var(--spacing-unit);
      font-weight: 600;
      line-height: 1.2;
    }

    h1 {
      font-size: 2rem;
    }
    h2 {
      font-size: 1.75rem;
    }
    h3 {
      font-size: 1.5rem;
    }
    h4 {
      font-size: 1.25rem;
    }
    h5 {
      font-size: 1.125rem;
    }
    h6 {
      font-size: 1rem;
    }

    p {
      margin-bottom: var(--spacing-unit);
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 calc(var(--spacing-unit) * 2);
    }

    .card {
      background: var(--card-background);
      border-radius: var(--border-radius);
      padding: calc(var(--spacing-unit) * 2);
      margin-bottom: calc(var(--spacing-unit) * 2);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      transition: box-shadow var(--transition-speed);
    }

    .card:hover {
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }

    .form-group {
      margin-bottom: calc(var(--spacing-unit) * 2);
    }

    .form-label {
      display: block;
      margin-bottom: var(--spacing-unit);
      font-weight: 500;
    }

    .form-control {
      width: 100%;
      padding: var(--spacing-unit);
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius);
      font-size: 1rem;
      transition: border-color var(--transition-speed);
    }

    .form-control:focus {
      outline: none;
      border-color: var(--primary-color);
    }

    .error-message {
      color: var(--danger-color);
      font-size: 0.875rem;
      margin-top: calc(var(--spacing-unit) / 2);
    }

    .success-message {
      color: var(--success-color);
      font-size: 0.875rem;
      margin-top: calc(var(--spacing-unit) / 2);
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: calc(var(--spacing-unit) * 2);
    }

    .loading::after {
      content: '';
      width: 24px;
      height: 24px;
      border: 2px solid var(--border-color);
      border-top-color: var(--primary-color);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: calc(var(--spacing-unit) * 2);
    }

    @media (max-width: 768px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  `}</style>
);
