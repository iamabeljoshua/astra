const swaggerPlugin = require('@nestjs/swagger/plugin');
const nestCliConfig = require('../nest-cli.json');

const { options: swaggerPluginOptions } = nestCliConfig.compilerOptions.plugins[0];

// Jest compiles in memory and skips the Nest CLI, so this applies the same plugin with the same options.
module.exports = {
  name: 'nestjs-swagger-transformer',
  // Bump this when the plugin options change, because ts-jest only sees this number in its cache key.
  version: 1,
  factory: (compilerInstance) => swaggerPlugin.before(swaggerPluginOptions, compilerInstance.program),
};
