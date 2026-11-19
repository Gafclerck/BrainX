import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class', // Configured without automatic toggle; default palette is dark
  theme: {
    extend: {
      colors: {
        background: '#0D1117',
        surface: '#161B22',
        card: {
          DEFAULT: '#161B22',
          foreground: '#E6EDF3',
        },
        popover: {
          DEFAULT: '#1F242C',
          foreground: '#E6EDF3',
        },
        dialog: '#161B22',
        border: {
          DEFAULT: '#30363D',
          subtle: '#21262D',
          focus: '#38BDF8',
        },
        foreground: {
          DEFAULT: '#E6EDF3',
          muted: '#8B949E',
          subtle: '#6E7681',
        },
        primary: {
          DEFAULT: '#38BDF8',
          foreground: '#0D1117',
          hover: '#0284C7',
        },
        highlight: {
          DEFAULT: '#D29922',
          foreground: '#0D1117',
        },
        destructive: {
          DEFAULT: '#F85149',
          foreground: '#0D1117',
          surface: '#251719',
          border: '#672124',
        },
        warning: {
          DEFAULT: '#D29922',
          foreground: '#0D1117',
          surface: '#2E2211',
          border: '#5E4117',
        },
        success: {
          DEFAULT: '#3FB950',
          foreground: '#0D1117',
          surface: '#122416',
          border: '#1E4B27',
        },
        info: {
          DEFAULT: '#58A6FF',
          foreground: '#0D1117',
          surface: '#13233A',
          border: '#1F4273',
        },
        resource: {
          document: '#58A6FF',
          'document-surface': '#13233A',
          'document-border': '#1F4273',
          image: '#BC8CFF',
          'image-surface': '#211838',
          'image-border': '#42296B',
          video: '#F0883E',
          'video-surface': '#2E1B13',
          'video-border': '#663319',
          link: '#39D353',
          'link-surface': '#132B25',
          'link-border': '#1D5233',
        },
        code: {
          bg: '#0F141C',
          'header-bg': '#161B22',
          border: '#30363D',
          text: '#E6EDF3',
          'line-number': '#484F58',
          keyword: '#FF7B72',
          string: '#A5D6FF',
          function: '#D2A8FF',
          comment: '#8B949E',
          number: '#79C0FF',
          operator: '#FF7B72',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        none: '0px',
        sm: '4px',
        md: '6px',
        lg: '8px',
        full: '9999px',
      },
      maxWidth: {
        'content-max': '860px',
        'page-max': '1360px',
      },
      width: {
        'sidebar-width': '280px',
        'toc-width': '220px',
      },
    },
  },
  plugins: [],
};

export default config;
