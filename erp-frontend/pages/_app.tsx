import React from 'react';
import type { AppProps } from 'next/app';
import { Global } from '@emotion/react';
import Layout from '@/components/layout/layout';

const globalStyles = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  html, body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 16px;
    line-height: 1.5;
  }
  
  :root {
    --color-background: #ffffff;
    --color-text: #000000;
    --color-text-secondary: #666666;
    --color-primary: #007bff;
    --color-success: #4caf50;
    --color-error: #f44336;
  }
`;

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Global styles={globalStyles} />
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </>
  );
}

export default MyApp;
