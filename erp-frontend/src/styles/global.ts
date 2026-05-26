import { createGlobalStyle } from 'styled-components';

export const GlobalStyles = createGlobalStyle`
  :root {
    --primary-color:       #0a1857;
    --primary-dark:        #060e30;
    --primary-light:       #162570;
    --secondary-color:     #b79758;
    --secondary-light:     #dfc99a;
    --secondary-dark:      #8a6e3a;
    --accent-color:        #CC1414;
    --text-primary-color:  #0a1857;
    --text-secondary-color:#3d5080;
    --border-color:        #c8aa78;
    --widget-bg-color:     #ffffff;
    --content-bg-color:    #F8F6F0;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
      'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
      sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    background-color: var(--content-bg-color);
    color: var(--text-primary-color);
  }

  code {
    font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
      monospace;
  }
`;
