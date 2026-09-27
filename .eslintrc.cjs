module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['react', 'react-hooks'],
  extends: ['eslint:recommended'],
  rules: {
    'react/jsx-uses-react': 'error',
    'react/jsx-uses-vars': 'error',
    'react-hooks/rules-of-hooks': 'error',
    // Pembersihan impor lama dipisahkan dari gerbang kesalahan runtime.
    'no-unused-vars': 'off',
    // Fungsi blok dan pemisah defensif sah pada modul ES modern.
    'no-inner-declarations': 'off',
    'no-extra-semi': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-constant-condition': ['error', { checkLoops: false }],
  },
}
