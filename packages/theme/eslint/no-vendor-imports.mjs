const ADAPTERS_FOLDER = 'apps/agent/src/providers/';
const LIVE_AGENT_FOLDER = 'apps/agent/';

const VENDOR_PACKAGES = {
  cartesia: ['@livekit/agents-plugin-cartesia', '@cartesia/'],
  deepgram: ['@livekit/agents-plugin-deepgram', '@deepgram/'],
  meta: ['@livekit/agents-plugin-meta'],
  anthropic: ['@livekit/agents-plugin-anthropic', '@anthropic-ai/'],
  elevenlabs: ['@livekit/agents-plugin-elevenlabs', '@elevenlabs/', 'elevenlabs'],
  openai: ['@livekit/agents-plugin-openai', 'openai'],
};

const FRAMEWORK_PACKAGES = ['@livekit/agents', '@livekit/rtc-node'];

const isPackage = (source, name) => source === name || source.startsWith(name.endsWith('/') ? name : `${name}/`);

function getVendor(source) {
  return Object.keys(VENDOR_PACKAGES).find((vendor) => VENDOR_PACKAGES[vendor].some((name) => isPackage(source, name)));
}

function getProblem(source, filePath) {
  const vendor = getVendor(source);
  if (vendor !== undefined) {
    return filePath.includes(`${ADAPTERS_FOLDER}${vendor}.`) ? null : `Import ${source} only in its adapter, ${ADAPTERS_FOLDER}${vendor}.ts.`;
  }
  const isFramework = FRAMEWORK_PACKAGES.some((name) => isPackage(source, name));
  return isFramework && !filePath.includes(LIVE_AGENT_FOLDER) ? `Import ${source} only in ${LIVE_AGENT_FOLDER}.` : null;
}

export const noVendorImports = {
  meta: { type: 'problem', schema: [], messages: { outside: '{{problem}}' } },
  create(context) {
    const filePath = context.filename.replaceAll('\\', '/');
    const check = (node, source) => {
      const problem = typeof source === 'string' ? getProblem(source, filePath) : null;
      if (problem) context.report({ node, messageId: 'outside', data: { problem } });
    };
    return {
      ImportDeclaration: (node) => check(node, node.source.value),
      ExportNamedDeclaration: (node) => check(node, node.source?.value),
      ExportAllDeclaration: (node) => check(node, node.source.value),
      ImportExpression: (node) => check(node, node.source.value),
      CallExpression: (node) => {
        if (node.callee.name === 'require') check(node, node.arguments[0]?.value);
      },
    };
  },
};
