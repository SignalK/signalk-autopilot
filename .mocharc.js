module.exports = {
  $schema: 'https://json.schemastore.org/mocharc.json',
  require: 'tsx',
  extension: ['ts'],
  spec: ['test/**/*.ts'],
  timeout: 4000, // 4 seconds timeout for all tests
  slow: 1500 // Tests taking longer than 1.5 seconds are considered slow
}
